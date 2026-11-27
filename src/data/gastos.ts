import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { AlcanceCompra } from '../app/compraRapida'
import type { DatosGastos, GastosPort } from '../app/controladorGastos'
import type { BaseActorDexie } from './db'

export interface RemotoGastos {
  leer(hogarId: string): Promise<DatosGastos>
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
  registrado_por: z.uuid(),
  origen: z.enum(['manual', 'qr', 'ocr', 'correo']),
})

const esquemaCategoria = z.object({
  id: z.uuid(),
  nombre: z.string(),
  icono: z.string().nullable(),
  orden: z.number().int(),
})

const esquemaMedio = z.object({
  id: z.uuid(),
  nombre: z.string(),
  tipo: z.enum(['efectivo', 'cuenta']),
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

export function crearRemotoGastos(cliente: SupabaseClient): RemotoGastos {
  return {
    async leer(hogarId) {
      const [compras, categorias, medios, pasivos, planes, miembros] = await Promise.all([
        cliente
          .from('compra')
          .select(
            'id,fecha,descripcion,monto_total,categoria_id,ambito,miembro_id,pago_tipo,medio_de_pago_id,financiada_por_pasivo_id,registrado_por,origen',
          )
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('categoria')
          .select('id,nombre,icono,orden')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('medio_de_pago')
          .select('id,nombre,tipo')
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
  }
}
