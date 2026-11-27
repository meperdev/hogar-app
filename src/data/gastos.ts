import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { AlcanceCompra } from '../app/compraRapida'
import type { DatosGastos, GastosPort } from '../app/controladorGastos'
import { ErrorGastos, type EditarCompraEntrada } from '../app/gastos'
import type { BaseActorDexie } from './db'

export interface RemotoGastos {
  leer(hogarId: string): Promise<DatosGastos>
  editarCompra(entrada: EditarCompraEntrada): Promise<void>
  anularCompra(compraId: string): Promise<void>
}

const esquemaCompra = z.object({
  id: z.uuid(),
  fecha: z.string(),
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
  activo: z.boolean(),
  orden: z.number().int().optional(),
})

const esquemaPasivo = z.object({
  id: z.uuid(),
  nombre: z.string(),
  tipo: z.enum(['tarjeta', 'credito', 'deuda']),
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
  if (msg.includes('no encontrada')) {
    return new ErrorGastos('No encontramos esa compra o ya fue anulada.')
  }
  if (error.code === '22023') {
    return new ErrorGastos('Revisa los datos ingresados e intenta de nuevo.')
  }
  return new ErrorGastos(porDefecto)
}

export function crearRemotoGastos(cliente: SupabaseClient): RemotoGastos {
  return {
    async leer(hogarId) {
      const [compras, categorias, medios, pasivos, planes, miembros] = await Promise.all([
        cliente
          .from('compra')
          .select(
            'id,fecha,descripcion,monto_total,categoria_id,ambito,miembro_id,pago_tipo,medio_de_pago_id,financiada_por_pasivo_id,obligacion_id,registrado_por,origen',
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
          .select('id,nombre,tipo,activo,orden')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('pasivo')
          .select('id,nombre,tipo')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('plan_de_cuotas')
          .select('compra_id,pasivo_id,n_cuotas')
          .eq('hogar_id', hogarId)
          .eq('origen', 'compra')
          .is('eliminado_en', null),
        cliente
          .from('miembro')
          .select('id,nombre')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
      ])

      for (const r of [compras, categorias, medios, pasivos, planes, miembros]) {
        if (r.error) throw r.error
      }

      return {
        compras: z.array(esquemaCompra).parse(compras.data),
        categorias: z.array(esquemaCategoria).parse(categorias.data),
        medios: z.array(esquemaMedio).parse(medios.data),
        pasivos: z.array(esquemaPasivo).parse(pasivos.data),
        planes: z.array(esquemaPlan).parse(planes.data),
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
  }
}

const CLAVE_INSTANTANEA = 'gastos_generales'
const SIN_INSTANTANEA = 'Sin conexión y sin copia local de gastos'

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
      try {
        const datos = await d.remoto.leer(d.alcance.hogarId)
        await base.instantaneas.put({
          clave: CLAVE_INSTANTANEA,
          valor: datos,
          actualizadoEn: ahora().toISOString(),
        })
        return { datos, sinConexion: false }
      } catch {
        const cache = await base.instantaneas.get(CLAVE_INSTANTANEA)
        if (!cache) throw new Error(SIN_INSTANTANEA)
        return { datos: cache.valor as DatosGastos, sinConexion: true }
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
  }
}
