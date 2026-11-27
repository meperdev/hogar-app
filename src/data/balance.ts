import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { RespaldoHistorial } from '../app/balance'
import type {
  BalancePort,
  DatosBalance,
  EstadoLocalDispositivo,
  ResultadoEnvioBalance,
} from '../app/controladorBalance'
import type { AlcanceCompra } from '../app/compraRapida'
import type { PaqueteExportacion } from '../domain/exportacion'
import type { LoteBalance } from '../domain/loteBalance'
import type { BaseActorDexie } from './db'

export interface RemotoBalance {
  leer(hogarId: string): Promise<DatosBalance>
  enviar(lote: LoteBalance): Promise<ResultadoEnvioBalance>
  exportar(
    fecha: string,
    hogarId: string,
  ): Promise<{ hogar: PaqueteExportacion; personal: PaqueteExportacion }>
  listarRespaldos(hogarId: string, miembroId: string): Promise<RespaldoHistorial[]>
}

const esquemaHogar = z.object({
  id: z.uuid(),
  nombre: z.string(),
  mostrar_pct_ingreso: z.boolean(),
  seq: z.number().int(),
})

const esquemaMiembro = z.object({
  id: z.uuid(),
  nombre: z.string(),
  activo: z.boolean(),
})

const esquemaMedio = z.object({
  id: z.uuid(),
  nombre: z.string(),
  tipo: z.enum(['efectivo', 'cuenta']),
  owner_tipo: z.enum(['miembro', 'hogar']),
  owner_miembro_id: z.uuid().nullable(),
  activo: z.boolean(),
})

const esquemaCompra = z.object({
  id: z.uuid(),
  fecha: z.string(),
  monto_total: z.number().int(),
  ambito: z.enum(['hogar', 'personal']),
  miembro_id: z.uuid().nullable(),
  pago_tipo: z.enum(['contado', 'financiado']),
  medio_de_pago_id: z.uuid().nullable(),
  financiada_por_pasivo_id: z.uuid().nullable(),
})

const esquemaPasivo = z.object({
  id: z.uuid(),
  ambito: z.enum(['hogar', 'personal']),
  owner_miembro_id: z.uuid().nullable(),
})

const esquemaPlan = z.object({
  id: z.uuid(),
  pasivo_id: z.uuid(),
  fecha_inicio: z.string(),
  capital: z.number().int(),
})

const esquemaCosto = z.object({
  id: z.uuid(),
  pasivo_id: z.uuid().nullable(),
  medio_de_pago_id: z.uuid().nullable(),
  monto: z.number().int(),
  fecha_causacion: z.string(),
})

const esquemaPago = z.object({
  id: z.uuid(),
  pasivo_id: z.uuid(),
  tipo: z.enum(['abono', 'saldo_a_favor']),
  medio_de_pago_id: z.uuid(),
  monto: z.number().int(),
  fecha: z.string(),
})

const esquemaAporte = z.object({
  id: z.uuid(),
  medio_origen_id: z.uuid(),
  medio_destino_id: z.uuid(),
  monto: z.number().int(),
  fecha: z.string(),
})

const esquemaIngreso = z.object({
  id: z.uuid(),
  serie_id: z.uuid().nullable(),
  miembro_id: z.uuid(),
  tipo: z.enum(['fijo', 'variable']),
  descripcion: z.string(),
  monto: z.number().int(),
  dia_esperado: z.number().int().nullable(),
  vigente_desde: z.string().nullable(),
  vigente_hasta: z.string().nullable(),
  fecha: z.string().nullable(),
})

const esquemaRecepcion = z.object({
  id: z.uuid(),
  ingreso_id: z.uuid(),
  serie_id: z.uuid(),
  periodo: z.string(),
  recibido: z.boolean(),
  monto_recibido: z.number().int().nullable(),
  fecha_recepcion: z.string().nullable(),
  seq: z.number().int(),
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

const esquemaPaquete = z.object({
  alcance: z.enum(['hogar', 'personal']),
  fecha: z.string(),
  tablas: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
})

export function crearRemotoBalance(cliente: SupabaseClient): RemotoBalance {
  return {
    async leer(hogarId) {
      const [
        hogar,
        miembros,
        medios,
        compras,
        pasivos,
        planes,
        costos,
        pagos,
        aportes,
        ingresos,
        recepciones,
      ] = await Promise.all([
        cliente
          .from('hogar')
          .select('id,nombre,mostrar_pct_ingreso,seq')
          .eq('id', hogarId)
          .is('eliminado_en', null)
          .single(),
        cliente
          .from('miembro')
          .select('id,nombre,activo')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null)
          .order('nombre'),
        cliente
          .from('medio_de_pago')
          .select('id,nombre,tipo,owner_tipo,owner_miembro_id,activo')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null)
          .order('orden', { ascending: true })
          .order('nombre', { ascending: true }),
        cliente
          .from('compra')
          .select(
            'id,fecha,monto_total,ambito,miembro_id,pago_tipo,medio_de_pago_id,financiada_por_pasivo_id',
          )
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('pasivo')
          .select('id,ambito,owner_miembro_id')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('plan_de_cuotas')
          .select('id,pasivo_id,fecha_inicio,capital')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('costo_financiero')
          .select('id,pasivo_id,medio_de_pago_id,monto,fecha_causacion')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('pago_de_deuda')
          .select('id,pasivo_id,tipo,medio_de_pago_id,monto,fecha')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('aporte')
          .select('id,medio_origen_id,medio_destino_id,monto,fecha')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('ingreso')
          .select(
            'id,serie_id,miembro_id,tipo,descripcion,monto,dia_esperado,vigente_desde,vigente_hasta,fecha',
          )
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('recepcion_ingreso')
          .select(
            'id,ingreso_id,serie_id,periodo,recibido,monto_recibido,fecha_recepcion,seq',
          )
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
      ])

      for (const r of [
        hogar,
        miembros,
        medios,
        compras,
        pasivos,
        planes,
        costos,
        pagos,
        aportes,
        ingresos,
        recepciones,
      ]) {
        if (r.error) throw r.error
      }

      return {
        hogar: esquemaHogar.parse(hogar.data),
        miembros: z.array(esquemaMiembro).parse(miembros.data),
        medios: z.array(esquemaMedio).parse(medios.data),
        compras: z.array(esquemaCompra).parse(compras.data),
        pasivos: z.array(esquemaPasivo).parse(pasivos.data),
        planes: z.array(esquemaPlan).parse(planes.data),
        costos: z.array(esquemaCosto).parse(costos.data),
        pagos: z.array(esquemaPago).parse(pagos.data),
        aportes: z.array(esquemaAporte).parse(aportes.data),
        ingresos: z.array(esquemaIngreso).parse(ingresos.data),
        recepciones: z.array(esquemaRecepcion).parse(recepciones.data),
      }
    },

    async enviar(lote) {
      const { data, error } = await cliente.rpc('sync_push_balance', {
        p_lote: lote,
      })
      if (error) throw error
      const resultado = esquemaResultado.parse(data)
      if (resultado.estado === 'aplicado') return { estado: 'aplicado' }
      return resultado.detalle === undefined
        ? { estado: 'rechazado', motivo: resultado.motivo }
        : {
            estado: 'rechazado',
            motivo: resultado.motivo,
            detalle: resultado.detalle,
          }
    },

    async exportar(fecha, hogarId) {
      const [hogarRes, personalRes] = await Promise.all([
        cliente.rpc('exportar_hogar', { p_hogar_id: hogarId, p_fecha: fecha }),
        cliente.rpc('exportar_personal', {
          p_hogar_id: hogarId,
          p_fecha: fecha,
        }),
      ])
      if (hogarRes.error) throw hogarRes.error
      if (personalRes.error) throw personalRes.error
      const hogar = esquemaPaquete.parse(hogarRes.data)
      const personal = esquemaPaquete.parse(personalRes.data)
      if (hogar.alcance !== 'hogar' || personal.alcance !== 'personal') {
        throw new Error('Alcance de exportación inesperado')
      }
      return { hogar, personal }
    },

    async listarRespaldos(hogarId, miembroId) {
      try {
        const storage = cliente.storage.from('exportaciones')
        const [carpetasHogar, carpetasPersonal] = await Promise.all([
          storage.list(`hogar/${hogarId}`, {
            limit: 6,
            sortBy: { column: 'name', order: 'desc' },
          }),
          storage.list(`personal/${hogarId}/${miembroId}`, {
            limit: 6,
            sortBy: { column: 'name', order: 'desc' },
          }),
        ])

        const salida: RespaldoHistorial[] = []
        for (const carpeta of carpetasHogar.data ?? []) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(carpeta.name)) {
            salida.push({
              fecha: carpeta.name,
              alcance: 'hogar',
              nombre: `hogar-${carpeta.name}.zip`,
              tamanoBytes: null,
            })
          }
        }
        for (const carpeta of carpetasPersonal.data ?? []) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(carpeta.name)) {
            salida.push({
              fecha: carpeta.name,
              alcance: 'personal',
              nombre: `personal-${carpeta.name}.zip`,
              tamanoBytes: null,
            })
          }
        }
        salida.sort((a, b) => b.fecha.localeCompare(a.fecha))
        return salida
      } catch {
        return []
      }
    },
  }
}

const CLAVE_INSTANTANEA = 'balance'
const SIN_INSTANTANEA = 'Sin conexión y sin copia local de balance'

export type DependenciasPuertoBalance = {
  base: () => Promise<BaseActorDexie>
  remoto: RemotoBalance
  alcance: AlcanceCompra
  ahora?: () => Date
}

export function crearPuertoBalance(d: DependenciasPuertoBalance): BalancePort {
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
        return datos
      } catch {
        const cache = await base.instantaneas.get(CLAVE_INSTANTANEA)
        if (!cache) throw new Error(SIN_INSTANTANEA)
        return cache.valor as DatosBalance
      }
    },

    enviar(lote) {
      return d.remoto.enviar(lote)
    },

    async leerPreferencia(clave) {
      const base = await d.base()
      const preferencia = await base.preferencias.get(clave)
      return preferencia?.valor ?? null
    },

    async guardarPreferencia(clave, valor) {
      const base = await d.base()
      await base.preferencias.put({
        clave,
        valor,
        actualizadoEn: ahora().toISOString(),
      })
    },

    async estadoLocal(): Promise<EstadoLocalDispositivo> {
      const base = await d.base()
      const [pendientesOutbox, instantanea, prefMedio, historial] =
        await Promise.all([
          base.outbox.where('estado').equals('pendiente').count(),
          base.instantaneas.get(CLAVE_INSTANTANEA),
          base.preferencias.get(`ultimo_medio_de_pago_id:${d.alcance.miembroId}`),
          d.remoto.listarRespaldos(d.alcance.hogarId, d.alcance.miembroId),
        ])

      const datos = instantanea?.valor as DatosBalance | undefined
      const ultimoMedioNombre =
        prefMedio && datos
          ? (datos.medios.find((m) => m.id === prefMedio.valor)?.nombre ?? null)
          : null

      return {
        pendientesOutbox,
        ultimaCopiaLocal: instantanea?.actualizadoEn ?? null,
        ultimoMedioNombre,
        historial,
      }
    },

    exportarAlcances(fecha) {
      return d.remoto.exportar(fecha, d.alcance.hogarId)
    },
  }
}
