import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { AlcanceCompra } from '../app/compraRapida'
import type { DatosGastos, GastosPort } from '../app/controladorGastos'
import { ErrorGastos, type EditarCompraEntrada, type EditarPagoEntrada } from '../app/gastos'
import type { BaseActorDexie, EntradaOutbox } from './db'

export interface RemotoGastos {
  leer(hogarId: string): Promise<DatosGastos>
  editarCompra(entrada: EditarCompraEntrada): Promise<void>
  anularCompra(compraId: string): Promise<void>
  editarAbono?(entrada: EditarPagoEntrada): Promise<void>
  eliminarAbono?(pagoId: string): Promise<void>
}

const esquemaCompra = z.object({
  id: z.uuid(),
  fecha: z.string(),
  creado_en: z.string().optional(),
  descripcion: z.string(),
  monto_total: z.number().int(),
  categoria_id: z.uuid(),
  ambito: z.enum(['hogar', 'personal']),
  miembro_id: z.uuid().nullable(),
  pago_tipo: z.enum(['contado', 'financiado']),
  medio_de_pago_id: z.uuid().nullable(),
  financiada_por_pasivo_id: z.uuid().nullable(),
  obligacion_id: z.uuid().nullable(),
  registrado_por: z.uuid(),
  origen: z.enum(['manual', 'qr', 'ocr', 'correo']),
})

const esquemaCategoria = z.object({
  id: z.uuid(),
  nombre: z.string(),
  icono: z.string().nullable(),
  orden: z.number().int(),
  activa: z.boolean(),
})

const esquemaMedio = z.object({
  id: z.uuid(),
  nombre: z.string(),
  tipo: z.enum(['efectivo', 'cuenta']),
  owner_miembro_id: z.uuid().nullable().optional(),
  activo: z.boolean(),
  orden: z.number().int().optional(),
})

const esquemaPasivo = z.object({
  id: z.uuid(),
  nombre: z.string(),
  tipo: z.enum(['tarjeta', 'credito', 'deuda']),
  ambito: z.enum(['hogar', 'personal']).optional(),
  owner_miembro_id: z.uuid().nullable().optional(),
})

const esquemaPagoDeuda = z.object({
  id: z.uuid(),
  pasivo_id: z.uuid(),
  tipo: z.enum(['abono', 'saldo_a_favor']),
  monto: z.number().int(),
  fecha: z.string(),
  medio_de_pago_id: z.uuid().nullable(),
  registrado_por: z.uuid(),
  nota: z.string().nullable(),
  incluir_en_gastos: z.boolean().optional(),
  categoria_gasto_id: z.uuid().nullable().optional(),
  creado_en: z.string().optional(),
})

const esquemaPlan = z.object({
  compra_id: z.uuid().nullable(),
  pasivo_id: z.uuid(),
  n_cuotas: z.number().int().nullable(),
})

const esquemaMiembro = z.object({
  id: z.uuid(),
  nombre: z.string(),
})

function mapearErrorRpc(error: { code?: string; message?: string }, porDefecto: string): ErrorGastos {
  const msg = (error.message ?? '').toLowerCase()
  if (msg.includes('ya tiene pagos registrados')) {
    return new ErrorGastos('No puedes anular esta compra a cuotas porque ya tiene pagos registrados.')
  }
  if (msg.includes('solo se puede editar')) {
    return new ErrorGastos('En compras a cuotas solo puedes editar descripción y categoría.')
  }
  if (msg.includes('categoría de una obligación')) {
    return new ErrorGastos('La categoría de un pago de obligación no se puede cambiar.')
  }
  if (msg.includes('saldo causado')) {
    return new ErrorGastos('El abono supera el saldo de la obligación a esa fecha.')
  }
  if (msg.includes('saldo a favor')) {
    return new ErrorGastos('No puedes editar o eliminar este abono porque afecta un saldo a favor posterior.')
  }
  if (msg.includes('no encontrada') || msg.includes('no encontrado')) {
    return new ErrorGastos('No encontramos ese registro o ya fue eliminado.')
  }
  if (error.code === '22023') {
    return new ErrorGastos('Revisa los datos ingresados e intenta de nuevo.')
  }
  return new ErrorGastos(porDefecto)
}

export function crearRemotoGastos(cliente: SupabaseClient): RemotoGastos {
  return {
    async leer(hogarId) {
      const [compras, categorias, medios, pasivos, planes, pagosDeudaRes, miembros] = await Promise.all([
        cliente
          .from('compra')
          .select(
            'id,fecha,creado_en,descripcion,monto_total,categoria_id,ambito,miembro_id,pago_tipo,medio_de_pago_id,financiada_por_pasivo_id,obligacion_id,registrado_por,origen',
          )
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('categoria')
          .select('id,nombre,icono,orden,activa')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('medio_de_pago')
          .select('id,nombre,tipo,owner_miembro_id,activo,orden')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('pasivo')
          .select('id,nombre,tipo,ambito,owner_miembro_id')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('plan_de_cuotas')
          .select('compra_id,pasivo_id,n_cuotas')
          .eq('hogar_id', hogarId)
          .eq('origen', 'compra')
          .is('eliminado_en', null),
        cliente
          .from('pago_de_deuda')
          .select('id,pasivo_id,tipo,monto,fecha,medio_de_pago_id,registrado_por,nota,incluir_en_gastos,categoria_gasto_id,creado_en')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('miembro')
          .select('id,nombre')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
      ])

      let pagosDeudaData: unknown = pagosDeudaRes.data
      let pagosDeudaError = pagosDeudaRes.error
      if (pagosDeudaError && pagosDeudaError.code === '42703') {
        const respaldo = await cliente
          .from('pago_de_deuda')
          .select('id,pasivo_id,tipo,monto,fecha,medio_de_pago_id,registrado_por,nota,creado_en')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null)
        pagosDeudaData = respaldo.data
        pagosDeudaError = respaldo.error
      }

      for (const r of [compras, categorias, medios, pasivos, planes, miembros]) {
        if (r.error) throw r.error
      }
      if (pagosDeudaError) throw pagosDeudaError

      return {
        compras: z.array(esquemaCompra).parse(compras.data),
        categorias: z.array(esquemaCategoria).parse(categorias.data),
        medios: z.array(esquemaMedio).parse(medios.data),
        pasivos: z.array(esquemaPasivo).parse(pasivos.data),
        planes: z.array(esquemaPlan).parse(planes.data),
        pagosDeuda: z.array(esquemaPagoDeuda).parse(pagosDeudaData),
        miembros: z.array(esquemaMiembro).parse(miembros.data),
      }
    },

    async editarCompra(entrada) {
      const { error } = await cliente.rpc('editar_compra', {
        p_compra_id: entrada.compraId,
        p_descripcion: entrada.descripcion,
        p_categoria_id: entrada.categoriaId,
        p_monto_total: entrada.montoTotal ?? null,
        p_fecha: entrada.fecha ?? null,
        p_medio_de_pago_id: entrada.medioDePagoId ?? null,
      })
      if (error) {
        throw mapearErrorRpc(error, 'No se pudo actualizar la compra.')
      }
    },

    async anularCompra(compraId) {
      const { error } = await cliente.rpc('anular_compra', {
        p_compra_id: compraId,
      })
      if (error) {
        throw mapearErrorRpc(error, 'No se pudo anular la compra.')
      }
    },

    async editarAbono(entrada) {
      const { error } = await cliente.rpc('editar_pago_de_deuda', {
        p_pago_id: entrada.pagoId,
        p_monto: entrada.monto,
        p_fecha: entrada.fecha,
        p_medio_de_pago_id: entrada.medioId,
        p_nota: entrada.nota.trim() || null,
        p_incluir_en_gastos: entrada.incluirEnGastos,
        p_categoria_gasto_id: entrada.incluirEnGastos ? entrada.categoriaGastoId : null,
      })
      if (error) {
        throw mapearErrorRpc(error, 'No se pudo actualizar el abono.')
      }
    },

    async eliminarAbono(pagoId) {
      const { error } = await cliente.rpc('eliminar_pago_de_deuda', {
        p_pago_id: pagoId,
      })
      if (error) {
        throw mapearErrorRpc(error, 'No se pudo eliminar el abono.')
      }
    },
  }
}

const CLAVE_INSTANTANEA = 'gastos_generales'
const SIN_INSTANTANEA = 'Sin conexión y sin copia local de gastos'

/**
 * Fusiona compras pendientes del outbox local (en ventana Deshacer o sin red)
 * sobre los datos remotos o en caché, evitando duplicados si ya sincronizaron.
 */
export function combinarPendientesGastos(
  datos: DatosGastos,
  pendientes: readonly EntradaOutbox[],
  hogarId: string,
  actorId = '',
): DatosGastos {
  const idsExistentes = new Set(datos.compras.map((c) => c.id))
  const planesExistentes = new Set(
    datos.planes.map((p) => p.compra_id).filter((id): id is string => id !== null),
  )
  const comprasExtra: DatosGastos['compras'] = []
  const planesExtra: DatosGastos['planes'] = []

  for (const entrada of pendientes) {
    if (entrada.estado !== 'pendiente' || entrada.lote.hogar_id !== hogarId) continue
    for (const c of entrada.lote.filas.compra) {
      if (idsExistentes.has(c.id)) continue
      idsExistentes.add(c.id)
      comprasExtra.push({
        id: c.id,
        fecha: c.fecha,
        creado_en: entrada.creadoEn,
        descripcion: c.descripcion,
        monto_total: c.monto_total,
        categoria_id: c.categoria_id,
        ambito: c.ambito,
        miembro_id: c.miembro_id,
        pago_tipo: c.pago_tipo,
        medio_de_pago_id: c.medio_de_pago_id,
        financiada_por_pasivo_id: c.financiada_por_pasivo_id,
        obligacion_id: null,
        registrado_por: c.miembro_id ?? actorId,
        origen: c.origen,
      })
    }
    for (const pl of entrada.lote.filas.plan_de_cuotas) {
      if (!pl.compra_id || planesExistentes.has(pl.compra_id)) continue
      planesExistentes.add(pl.compra_id)
      planesExtra.push({
        compra_id: pl.compra_id,
        pasivo_id: pl.pasivo_id,
        n_cuotas: pl.n_cuotas,
      })
    }
  }

  if (comprasExtra.length === 0 && planesExtra.length === 0) return datos
  return {
    ...datos,
    compras: [...datos.compras, ...comprasExtra],
    planes: [...datos.planes, ...planesExtra],
  }
}

export function crearPuertoGastos(d: {
  base: () => Promise<BaseActorDexie>
  remoto: RemotoGastos
  alcance: AlcanceCompra
  ahora?: () => Date
}): GastosPort {
  const ahora = d.ahora ?? (() => new Date())

  return {
    async cargar() {
      const base = await d.base()
      const pendientes = await base.outbox.where('estado').equals('pendiente').toArray()
      try {
        const datos = await d.remoto.leer(d.alcance.hogarId)
        await base.instantaneas.put({
          clave: CLAVE_INSTANTANEA,
          valor: datos,
          actualizadoEn: ahora().toISOString(),
        })
        return {
          datos: combinarPendientesGastos(datos, pendientes, d.alcance.hogarId, d.alcance.miembroId),
          sinConexion: false,
        }
      } catch {
        const cache = await base.instantaneas.get(CLAVE_INSTANTANEA)
        if (!cache) throw new Error(SIN_INSTANTANEA)
        return {
          datos: combinarPendientesGastos(
            cache.valor as DatosGastos,
            pendientes,
            d.alcance.hogarId,
            d.alcance.miembroId,
          ),
          sinConexion: true,
        }
      }
    },

    async editarCompra(entrada) {
      try {
        await d.remoto.editarCompra(entrada)
      } catch (causa) {
        if (causa instanceof ErrorGastos) throw causa
        throw new ErrorGastos('Se necesita conexión para editar esta compra.')
      }
    },

    async anularCompra(compraId) {
      try {
        await d.remoto.anularCompra(compraId)
      } catch (causa) {
        if (causa instanceof ErrorGastos) throw causa
        throw new ErrorGastos('Se necesita conexión para anular esta compra.')
      }
    },

    async editarAbono(entrada) {
      if (!d.remoto.editarAbono) {
        throw new ErrorGastos('Edición de abonos no disponible.')
      }
      try {
        await d.remoto.editarAbono(entrada)
      } catch (causa) {
        if (causa instanceof ErrorGastos) throw causa
        throw new ErrorGastos('Se necesita conexión para editar este abono.')
      }
    },

    async eliminarAbono(pagoId) {
      if (!d.remoto.eliminarAbono) {
        throw new ErrorGastos('Eliminación de abonos no disponible.')
      }
      try {
        await d.remoto.eliminarAbono(pagoId)
      } catch (causa) {
        if (causa instanceof ErrorGastos) throw causa
        throw new ErrorGastos('Se necesita conexión para eliminar este abono.')
      }
    },
  }
}
