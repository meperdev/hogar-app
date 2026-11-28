import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type {
  DatosObligaciones,
  ObligacionesPort,
  ResultadoEnvio,
} from '../app/controladorObligaciones'
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
  registrado_por: z.uuid(),
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

export function crearRemotoObligaciones(cliente: SupabaseClient): RemotoObligaciones {
  return {
    async leer(hogarId) {
      // RLS ya acota cada tabla a lo que el actor puede ver.
      const [miembros, categorias, medios, pasivos, tarjetas, planes, cuotas, costos, pagos, obligaciones, compras] =
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
          cliente.from('pago_de_deuda').select('id,pasivo_id,tipo,cuota_id,monto,fecha,registrado_por')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('obligacion').select('id,nombre,categoria_id,monto_estimado,dia_vencimiento,periodicidad,mes_inicio,activa')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('compra').select('id,fecha,monto_total,ambito,miembro_id,descripcion,obligacion_id,periodo')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
        ])

      for (const respuesta of [miembros, categorias, medios, pasivos, tarjetas, planes, cuotas, costos, pagos, obligaciones, compras]) {
        if (respuesta.error) throw respuesta.error
      }

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
        pagos: z.array(esquemaPago).parse(pagos.data),
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
