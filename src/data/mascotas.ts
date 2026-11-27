import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type {
  DatosDespensa,
  MascotasPort,
  ResultadoEnvioMascotas,
} from '../app/controladorMascotas'
import type { LoteMascotas } from '../domain/loteMascotas'
import type { ObservacionNivel } from '../domain/mascotas'
import { armarCatalogo } from './compraRapida'
import type { BaseActorDexie } from './db'

/**
 * Adaptador de datos del núcleo 4 (Despensa de mascotas): Supabase por RLS +
 * `sync_push_mascotas` y Dexie como copia local (`instantaneas['mascotas']`)
 * para consulta offline.
 */

export interface RemotoMascotas {
  leer(hogarId: string): Promise<DatosDespensa>
  enviarLote(lote: LoteMascotas): Promise<ResultadoEnvioMascotas>
}

const esquemaMascota = z.object({
  id: z.uuid(),
  nombre: z.string(),
  especie: z.enum(['perro', 'gato', 'otro']),
  fecha_nacimiento: z.string().nullable(),
  activa: z.boolean(),
})

const esquemaItemDespensa = z.object({
  id: z.uuid(),
  mascota_id: z.uuid().nullable(),
  mascota_ids: z.array(z.uuid()).optional(),
  nombre: z.string(),
  tipo: z.enum(['comida', 'higiene', 'salud', 'otro']),
  categoria_id: z.uuid(),
  frecuencia_dias: z.number().int().nullable(),
  umbral_alerta_pct: z.number().int(),
  monto_habitual: z.number().int().nullable(),
  activo: z.boolean(),
})

const esquemaNivelDespensa = z.object({
  id: z.uuid(),
  item_despensa_id: z.uuid(),
  compra_id: z.uuid().nullable(),
  fecha: z.string(),
  nivel_pct: z.number().int(),
  origen: z.enum(['compra', 'ajuste']),
})

const esquemaCompra = z.object({
  id: z.uuid(),
  fecha: z.string(),
  descripcion: z.string(),
  monto_total: z.number().int(),
  categoria_id: z.uuid(),
  ambito: z.enum(['hogar', 'personal']),
  mascota_id: z.uuid().nullable(),
  item_despensa_id: z.uuid().nullable(),
  financiada_por_pasivo_id: z.uuid().nullable(),
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
  tipo: z.enum(['tarjeta', 'credito', 'deuda']),
  nombre: z.string(),
  ambito: z.enum(['hogar', 'personal']),
  tasa_tipo: z.enum(['EA', 'MV']).nullable(),
  tasa_ppm: z.number().int().nullable(),
  activo: z.boolean(),
})

const esquemaTarjeta = z.object({
  pasivo_id: z.uuid(),
  ultimos_4: z.string().regex(/^[0-9]{4}$/).nullable(),
  dia_corte: z.number().int(),
  dia_pago: z.number().int(),
})

const esquemaDesembolso = z.object({
  pasivo_id: z.uuid(),
  capital: z.number().int(),
  fecha_inicio: z.string(),
})

const esquemaResultado = z.discriminatedUnion('estado', [
  z.object({
    estado: z.literal('aplicado'),
    filas: z.array(z.object({ tabla: z.string(), id: z.uuid(), seq: z.number().int() })),
  }),
  z.object({
    estado: z.literal('rechazado'),
    motivo: z.string(),
    detalle: z.string().optional(),
  }),
])

export function crearRemotoMascotas(cliente: SupabaseClient): RemotoMascotas {
  return {
    async leer(hogarId) {
      // No filtramos por `activa`/`activo` al leer mascotas/items para preservar el histórico (I26).
      const leerItems = async () => {
        const res = await cliente
          .from('item_despensa')
          .select('id,mascota_id,mascota_ids,nombre,tipo,categoria_id,frecuencia_dias,umbral_alerta_pct,monto_habitual,activo')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null)
        if (res.error && res.error.message.includes('mascota_ids')) {
          return cliente
            .from('item_despensa')
            .select('id,mascota_id,nombre,tipo,categoria_id,frecuencia_dias,umbral_alerta_pct,monto_habitual,activo')
            .eq('hogar_id', hogarId)
            .is('eliminado_en', null)
        }
        return res
      }

      const [
        mascotasRes,
        itemsRes,
        nivelesRes,
        comprasRes,
        categoriasRes,
        mediosRes,
        pasivosRes,
        tarjetasRes,
        desembolsosRes,
      ] = await Promise.all([
        cliente.from('mascota').select('id,nombre,especie,fecha_nacimiento,activa')
          .eq('hogar_id', hogarId).is('eliminado_en', null),
        leerItems(),
        cliente.from('nivel_despensa').select('id,item_despensa_id,compra_id,fecha,nivel_pct,origen')
          .eq('hogar_id', hogarId).is('eliminado_en', null),
        cliente.from('compra').select('id,fecha,descripcion,monto_total,categoria_id,ambito,mascota_id,item_despensa_id,financiada_por_pasivo_id')
          .eq('hogar_id', hogarId).is('eliminado_en', null),
        cliente.from('categoria').select('id,nombre,icono,orden,activa')
          .eq('hogar_id', hogarId).is('eliminado_en', null),
        cliente.from('medio_de_pago').select('id,nombre,tipo,activo,orden')
          .eq('hogar_id', hogarId).is('eliminado_en', null),
        cliente.from('pasivo').select('id,tipo,nombre,ambito,tasa_tipo,tasa_ppm,activo')
          .eq('hogar_id', hogarId).is('eliminado_en', null),
        cliente.from('tarjeta').select('pasivo_id,ultimos_4,dia_corte,dia_pago')
          .eq('hogar_id', hogarId).is('eliminado_en', null),
        cliente.from('plan_de_cuotas').select('pasivo_id,capital,fecha_inicio')
          .eq('hogar_id', hogarId).eq('origen', 'desembolso').is('eliminado_en', null),
      ])

      for (const r of [
        mascotasRes, itemsRes, nivelesRes, comprasRes,
        categoriasRes, mediosRes, pasivosRes, tarjetasRes, desembolsosRes,
      ]) {
        if (r.error) throw r.error
      }

      const compras = z.array(esquemaCompra).parse(comprasRes.data)
      const ambitoCompra = new Map(compras.map((c) => [c.id, c.ambito]))

      const niveles = z.array(esquemaNivelDespensa).parse(nivelesRes.data)
      const observaciones: ObservacionNivel[] = niveles.flatMap<ObservacionNivel>((n) => {
        if (n.compra_id === null) {
          return [{
            id: n.id,
            itemDespensaId: n.item_despensa_id,
            compraId: null,
            fecha: n.fecha,
            nivelPct: n.nivel_pct,
            origen: n.origen,
            ambito: 'hogar',
          }]
        }
        const ambito = ambitoCompra.get(n.compra_id)
        if (!ambito) return []
        return [{
          id: n.id,
          itemDespensaId: n.item_despensa_id,
          compraId: n.compra_id,
          fecha: n.fecha,
          nivelPct: n.nivel_pct,
          origen: n.origen,
          ambito,
        }]
      })

      const categoriasParseadas = z.array(esquemaCategoria).parse(categoriasRes.data)
        .sort((a, b) => a.orden - b.orden)

      const catalogo = armarCatalogo({
        categorias: categoriasParseadas,
        medios: z.array(esquemaMedio).parse(mediosRes.data),
        pasivos: z.array(esquemaPasivo).parse(pasivosRes.data),
        tarjetas: z.array(esquemaTarjeta).parse(tarjetasRes.data),
        desembolsos: z.array(esquemaDesembolso).parse(desembolsosRes.data),
        comprasVinculadas: compras
          .filter((c): c is typeof c & { financiada_por_pasivo_id: string } => c.financiada_por_pasivo_id !== null)
          .map((c) => ({ financiada_por_pasivo_id: c.financiada_por_pasivo_id, monto_total: c.monto_total })),
      })

      return {
        mascotas: z.array(esquemaMascota).parse(mascotasRes.data).map((m) => ({
          id: m.id,
          nombre: m.nombre,
          especie: m.especie,
          fechaNacimiento: m.fecha_nacimiento,
          activa: m.activa,
        })),
        items: z.array(esquemaItemDespensa).parse(itemsRes.data).map((i) => ({
          id: i.id,
          mascotaId: i.mascota_id,
          mascotaIds:
            i.mascota_ids && i.mascota_ids.length > 0
              ? i.mascota_ids
              : i.mascota_id
                ? [i.mascota_id]
                : [],
          nombre: i.nombre,
          tipo: i.tipo,
          categoriaId: i.categoria_id,
          frecuenciaDias: i.frecuencia_dias,
          umbralAlertaPct: i.umbral_alerta_pct,
          montoHabitual: i.monto_habitual,
          activo: i.activo,
        })),
        observaciones,
        compras: compras.map((c) => ({
          id: c.id,
          fecha: c.fecha,
          descripcion: c.descripcion,
          montoTotal: c.monto_total,
          categoriaId: c.categoria_id,
          ambito: c.ambito,
          mascotaId: c.mascota_id,
          itemDespensaId: c.item_despensa_id,
        })),
        // Conserva categorías inactivas para no romper la conciliación histórica de Mascotas.
        categorias: categoriasParseadas.map((c) => ({ id: c.id, nombre: c.nombre })),
        medios: catalogo.medios,
      }
    },

    async enviarLote(lote) {
      const { data, error } = await cliente.rpc('sync_push_mascotas', { p_lote: lote })
      if (error) throw error
      const resultado = esquemaResultado.parse(data)
      if (resultado.estado === 'aplicado') return { estado: 'aplicado' }
      return resultado.detalle === undefined
        ? { estado: 'rechazado', motivo: resultado.motivo }
        : { estado: 'rechazado', motivo: resultado.motivo, detalle: resultado.detalle }
    },
  }
}

const CLAVE_INSTANTANEA = 'mascotas'

export function crearPuertoMascotas(d: {
  base: () => Promise<BaseActorDexie>
  remoto: RemotoMascotas
  hogarId: string
  ahora?: () => Date
}): MascotasPort {
  const ahora = d.ahora ?? (() => new Date())
  return {
    async leer() {
      return d.remoto.leer(d.hogarId)
    },
    async leerInstantanea() {
      const base = await d.base()
      const fila = await base.instantaneas.get(CLAVE_INSTANTANEA)
      return (fila?.valor as DatosDespensa | undefined) ?? null
    },
    async guardarInstantanea(datos) {
      const base = await d.base()
      await base.instantaneas.put({
        clave: CLAVE_INSTANTANEA,
        valor: datos,
        actualizadoEn: ahora().toISOString(),
      })
    },
    async enviarLote(lote) {
      return d.remoto.enviarLote(lote)
    },
  }
}
