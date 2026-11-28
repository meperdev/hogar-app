import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type {
  DatosObligaciones,
  ObligacionesPort,
  ResultadoEnvio,
} from '../app/controladorObligaciones'
import type { EditarPagoEntrada } from '../app/obligaciones'
import type { LoteObligaciones } from '../domain/loteObligaciones'
import type { BaseActorDexie } from './db'

/**
 * Adaptador de datos del núcleo 2 (Obligaciones del mes): Supabase como origen
 * remoto (lectura por RLS y `sync_push_obligaciones`) y Dexie como copia local
 * del actor para abrir la agenda sin red. Este módulo solo lee, mapea y
 * transporta: las reglas viven en `src/domain` y `src/app`.
 *
 * No hay outbox en esta versión: un pago necesita el bloqueo del servidor
 * (I20), así que el envío va directo y su error se propaga. Las instantáneas
 * son solo lecturas cacheadas; nunca se encolan escrituras.
 */

// ---------------------------------------------------------------------------
// Contrato del remoto
// ---------------------------------------------------------------------------

export interface RemotoObligaciones {
  leer(hogarId: string): Promise<DatosObligaciones>
  enviar(lote: LoteObligaciones): Promise<ResultadoEnvio>
  editarPago?(entrada: EditarPagoEntrada): Promise<void>
  eliminarPago?(pagoId: string): Promise<void>
  eliminarPasivo(pasivoId: string): Promise<{ accion: 'eliminado' | 'archivado' }>
}

// ---------------------------------------------------------------------------
// Esquemas: toda respuesta se valida antes de mapearse
// ---------------------------------------------------------------------------

const esquemaMiembro = z.object({
  id: z.uuid(),
  nombre: z.string(),
})

const esquemaCategoria = z.object({
  id: z.uuid(),
  nombre: z.string(),
})

const esquemaMedio = z.object({
  id: z.uuid(),
  nombre: z.string(),
  owner_miembro_id: z.uuid().nullable(),
  orden: z.number().int().optional(),
})

const esquemaPasivo = z.object({
  id: z.uuid(),
  tipo: z.enum(['tarjeta', 'credito', 'deuda']),
  nombre: z.string(),
  ambito: z.enum(['hogar', 'personal']),
  owner_miembro_id: z.uuid().nullable(),
})

const esquemaTarjeta = z.object({
  pasivo_id: z.uuid(),
  ultimos_4: z.string().regex(/^[0-9]{4}$/).nullable(),
})

const esquemaPlan = z.object({
  id: z.uuid(),
  pasivo_id: z.uuid(),
  compra_id: z.uuid().nullable(),
  fecha_inicio: z.string(),
  capital: z.number().int(),
  sistema: z.enum(['capital_fijo', 'cuota_fija', 'sin_calendario']),
  n_cuotas: z.number().int().nullable(),
})

const esquemaCuota = z.object({
  id: z.uuid(),
  plan_id: z.uuid(),
  numero: z.number().int(),
  fecha_vencimiento: z.string(),
  capital: z.number().int(),
})

const esquemaCosto = z.object({
  id: z.uuid(),
  pasivo_id: z.uuid().nullable(),
  cuota_id: z.uuid().nullable(),
  monto: z.number().int(),
  fecha_causacion: z.string(),
  origen: z.enum(['calculado', 'manual']),
  seq: z.number().int(),
})

const esquemaPago = z.object({
  id: z.uuid(),
  pasivo_id: z.uuid(),
  tipo: z.enum(['abono', 'saldo_a_favor']),
  cuota_id: z.uuid().nullable(),
  monto: z.number().int(),
  fecha: z.string(),
  medio_de_pago_id: z.uuid().nullable().optional(),
  registrado_por: z.uuid(),
  nota: z.string().nullable().optional(),
  incluir_en_gastos: z.boolean().optional(),
  categoria_gasto_id: z.uuid().nullable().optional(),
})

const esquemaObligacion = z.object({
  id: z.uuid(),
  nombre: z.string(),
  categoria_id: z.uuid(),
  monto_estimado: z.number().int().nullable(),
  dia_vencimiento: z.number().int(),
  periodicidad: z.enum(['mensual', 'bimestral', 'trimestral', 'anual']),
  mes_inicio: z.string(),
  activa: z.boolean(),
})

const esquemaCompra = z.object({
  id: z.uuid(),
  fecha: z.string(),
  monto_total: z.number().int(),
  ambito: z.enum(['hogar', 'personal']),
  miembro_id: z.uuid().nullable(),
  descripcion: z.string(),
  obligacion_id: z.uuid().nullable(),
  periodo: z.string().nullable(),
})

const esquemaResultado = z.discriminatedUnion('estado', [
  z.object({
    estado: z.literal('aplicado'),
    filas: z.array(
      z.object({ tabla: z.string(), id: z.uuid(), seq: z.number().int() }),
    ),
  }),
  z.object({
    estado: z.literal('rechazado'),
    motivo: z.string(),
    detalle: z.string().optional(),
  }),
])

const esquemaEliminarPasivo = z.object({
  id: z.uuid(),
  accion: z.enum(['eliminado', 'archivado']),
})

function mapearErrorPagoRpc(error: { code?: string; message?: string }, porDefecto: string): Error {
  const msg = (error.message ?? '').toLowerCase()
  if (msg.includes('saldo causado')) {
    return new Error('El abono supera el saldo de la obligación a esa fecha.')
  }
  if (msg.includes('saldo a favor')) {
    return new Error('No puedes editar o eliminar este abono porque afecta un saldo a favor posterior.')
  }
  if (msg.includes('no encontrado')) {
    return new Error('No encontramos ese abono o ya fue eliminado.')
  }
  if (error.code === '22023') {
    return new Error('Revisa los datos del abono e intenta de nuevo.')
  }
  return new Error(porDefecto)
}

export function crearRemotoObligaciones(cliente: SupabaseClient): RemotoObligaciones {
  return {
    async leer(hogarId) {
      // RLS ya acota cada tabla a lo que el actor puede ver.
      const [miembros, categorias, medios, pasivos, tarjetas, planes, cuotas, costos, pagosRes, obligaciones, compras] =
        await Promise.all([
          cliente.from('miembro').select('id,nombre')
            .eq('hogar_id', hogarId).eq('activo', true).is('eliminado_en', null),
          cliente.from('categoria').select('id,nombre')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('medio_de_pago').select('id,nombre,owner_miembro_id,orden')
            .eq('hogar_id', hogarId).eq('activo', true).is('eliminado_en', null),
          cliente.from('pasivo').select('id,tipo,nombre,ambito,owner_miembro_id')
            .eq('hogar_id', hogarId).eq('activo', true).is('eliminado_en', null),
          cliente.from('tarjeta').select('pasivo_id,ultimos_4')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('plan_de_cuotas').select('id,pasivo_id,compra_id,fecha_inicio,capital,sistema,n_cuotas')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('cuota').select('id,plan_id,numero,fecha_vencimiento,capital')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('costo_financiero').select('id,pasivo_id,cuota_id,monto,fecha_causacion,origen,seq')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('pago_de_deuda').select('id,pasivo_id,tipo,cuota_id,monto,fecha,medio_de_pago_id,registrado_por,nota,incluir_en_gastos,categoria_gasto_id')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('obligacion').select('id,nombre,categoria_id,monto_estimado,dia_vencimiento,periodicidad,mes_inicio,activa')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('compra').select('id,fecha,monto_total,ambito,miembro_id,descripcion,obligacion_id,periodo')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
        ])

      let pagosData: unknown = pagosRes.data
      let pagosError = pagosRes.error
      if (pagosError && pagosError.code === '42703') {
        const respaldo = await cliente
          .from('pago_de_deuda')
          .select('id,pasivo_id,tipo,cuota_id,monto,fecha,medio_de_pago_id,registrado_por,nota')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null)
        pagosData = respaldo.data
        pagosError = respaldo.error
      }

      for (const respuesta of [miembros, categorias, medios, pasivos, tarjetas, planes, cuotas, costos, obligaciones, compras]) {
        if (respuesta.error) throw respuesta.error
      }
      if (pagosError) throw pagosError

      const filasTarjeta = z.array(esquemaTarjeta).parse(tarjetas.data)
      return {
        miembros: z.array(esquemaMiembro).parse(miembros.data),
        categorias: z.array(esquemaCategoria).parse(categorias.data),
        medios: z.array(esquemaMedio)
          .parse(medios.data)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es')),
        pasivos: z.array(esquemaPasivo).parse(pasivos.data).map((pasivo) => ({
          ...pasivo,
          ultimos_4: filasTarjeta.find((tarjeta) => tarjeta.pasivo_id === pasivo.id)?.ultimos_4 ?? null,
        })),
        planes: z.array(esquemaPlan).parse(planes.data),
        cuotas: z.array(esquemaCuota).parse(cuotas.data),
        costos: z.array(esquemaCosto).parse(costos.data),
        pagos: z.array(esquemaPago).parse(pagosData),
        obligaciones: z.array(esquemaObligacion).parse(obligaciones.data),
        compras: z.array(esquemaCompra).parse(compras.data),
      }
    },

    async enviar(lote) {
      const { data, error } = await cliente.rpc('sync_push_obligaciones', { p_lote: lote })
      if (error) throw error
      const resultado = esquemaResultado.parse(data)
      if (resultado.estado === 'aplicado') return { estado: 'aplicado' }
      return resultado.detalle === undefined
        ? { estado: 'rechazado', motivo: resultado.motivo }
        : { estado: 'rechazado', motivo: resultado.motivo, detalle: resultado.detalle }
    },

    async editarPago(entrada) {
      const { error } = await cliente.rpc('editar_pago_de_deuda', {
        p_pago_id: entrada.pagoId,
        p_monto: entrada.monto,
        p_fecha: entrada.fecha,
        p_medio_de_pago_id: entrada.medioId,
        p_nota: entrada.nota.trim() || null,
        p_incluir_en_gastos: entrada.incluirEnGastos,
        p_categoria_gasto_id: entrada.incluirEnGastos ? entrada.categoriaGastoId : null,
      })
      if (error) throw mapearErrorPagoRpc(error, 'No se pudo actualizar el abono.')
    },

    async eliminarPago(pagoId) {
      const { error } = await cliente.rpc('eliminar_pago_de_deuda', { p_pago_id: pagoId })
      if (error) throw mapearErrorPagoRpc(error, 'No se pudo eliminar el abono.')
    },

    async eliminarPasivo(pasivoId) {
      const { data, error } = await cliente.rpc('eliminar_pasivo', { p_pasivo_id: pasivoId })
      if (error) {
        if (error instanceof Error) throw error
        throw new Error((error as { message?: string }).message || 'No se pudo eliminar la obligación.')
      }
      const resultado = esquemaEliminarPasivo.parse(data)
      return { accion: resultado.accion }
    },
  }
}

// ---------------------------------------------------------------------------
// Puerto local (Dexie) + remoto
// ---------------------------------------------------------------------------

const CLAVE_INSTANTANEA = 'obligaciones'
const SIN_INSTANTANEA = 'Sin conexión y sin copia local de obligaciones'

export type DependenciasPuertoObligaciones = {
  /** Abre (o reutiliza) la base del actor; se llama en cada operación. */
  base: () => Promise<BaseActorDexie>
  remoto: RemotoObligaciones
  hogarId: string
  ahora?: () => Date
}

export function crearPuertoObligaciones(d: DependenciasPuertoObligaciones): ObligacionesPort {
  const ahora = d.ahora ?? (() => new Date())

  return {
    async cargar() {
      const base = await d.base()
      try {
        const datos = await d.remoto.leer(d.hogarId)
        await base.instantaneas.put({
          clave: CLAVE_INSTANTANEA,
          valor: datos,
          actualizadoEn: ahora().toISOString(),
        })
        return datos
      } catch {
        const cache = await base.instantaneas.get(CLAVE_INSTANTANEA)
        if (!cache) throw new Error(SIN_INSTANTANEA)
        return cache.valor as DatosObligaciones
      }
    },

    enviar(lote) {
      // El pago necesita el bloqueo del servidor (I20): sin outbox, el error
      // del remoto se propaga tal cual.
      return d.remoto.enviar(lote)
    },

    editarPago(entrada) {
      if (!d.remoto.editarPago) {
        return Promise.reject(new Error('Edición de abonos no disponible.'))
      }
      return d.remoto.editarPago(entrada)
    },

    eliminarPago(pagoId) {
      if (!d.remoto.eliminarPago) {
        return Promise.reject(new Error('Eliminación de abonos no disponible.'))
      }
      return d.remoto.eliminarPago(pagoId)
    },

    eliminarPasivo(pasivoId) {
      return d.remoto.eliminarPasivo(pasivoId)
    },

    async leerPreferencia(clave) {
      const base = await d.base()
      const preferencia = await base.preferencias.get(clave)
      return preferencia?.valor ?? null
    },

    async guardarPreferencia(clave, valor) {
      const base = await d.base()
      await base.preferencias.put({ clave, valor, actualizadoEn: ahora().toISOString() })
    },
  }
}
