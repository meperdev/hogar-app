import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type {
  AlcanceCompra,
  Ambito,
  CatalogoCompra,
  CategoriaOpcion,
  MedioOpcion,
  TasaPasivo,
} from '../app/compraRapida'
import type { CompraRapidaPort } from '../app/controladorCompraRapida'
import { disponiblePrestamo, type LoteCompra } from '../domain/loteCompra'
import type { BaseActorDexie } from './db'

/**
 * Adaptador de datos del núcleo 1 (compra rápida): Dexie como copia local por
 * actor (outbox, registros, catálogo) y Supabase como origen remoto (lectura
 * por RLS y `sync_push`). Este módulo solo almacena, lee, mapea y transporta:
 * las reglas viven en `src/domain` y `src/app`. Nada derivado se guarda ni se
 * envía: el servidor fija ids de secuencia y estado.
 */

// ---------------------------------------------------------------------------
// Contrato del remoto
// ---------------------------------------------------------------------------

export type FilaCategoria = {
  id: string
  nombre: string
  icono: string | null
  orden: number
  activa: boolean
}

export type FilaMedio = {
  id: string
  nombre: string
  tipo: 'efectivo' | 'cuenta'
  activo: boolean
}

export type FilaPasivo = {
  id: string
  tipo: 'tarjeta' | 'credito' | 'deuda'
  nombre: string
  ambito: Ambito
  tasa_tipo: 'EA' | 'MV' | null
  tasa_ppm: number | null
  activo: boolean
}

export type FilaTarjeta = {
  pasivo_id: string
  ultimos_4: string | null
  dia_corte: number
  dia_pago: number
}

/** Un desembolso es un `plan_de_cuotas` con `origen = 'desembolso'`. */
export type FilaDesembolso = {
  pasivo_id: string
  capital: number
  fecha_inicio: string
}

/** Compra ya vinculada al pasivo: su `monto_total` consume el desembolso. */
export type FilaCompraVinculada = {
  financiada_por_pasivo_id: string
  monto_total: number
}

export type FilasCatalogo = {
  categorias: FilaCategoria[]
  medios: FilaMedio[]
  pasivos: FilaPasivo[]
  tarjetas: FilaTarjeta[]
  desembolsos: FilaDesembolso[]
  comprasVinculadas: FilaCompraVinculada[]
}

export type ResultadoPush =
  | { estado: 'aplicado'; filas: { tabla: string; id: string; seq: number }[] }
  | {
      estado: 'rechazado'
      motivo: 'duplicado' | 'invalido' | 'no_autorizado' | 'actualizar_app'
      detalle?: string
    }

export interface RemotoCompraRapida {
  leerCatalogo(hogarId: string): Promise<FilasCatalogo>
  buscarAlias(
    hogarId: string,
    nit: string,
  ): Promise<{ nombre: string; categoria_sugerida_id: string | null } | null>
  buscarPorCufe(
    hogarId: string,
    cufe: string,
  ): Promise<{ fecha: string; monto_total: number; descripcion: string } | null>
  syncPush(lote: LoteCompra): Promise<ResultadoPush>
}

// ---------------------------------------------------------------------------
// Catálogo: de filas a opciones de la UI (puro)
// ---------------------------------------------------------------------------

function porNombre(a: MedioOpcion, b: MedioOpcion): number {
  return a.nombre.localeCompare(b.nombre, 'es')
}

function tasaDe(pasivo: FilaPasivo): TasaPasivo | null {
  return pasivo.tasa_tipo !== null && pasivo.tasa_ppm !== null
    ? { tipo: pasivo.tasa_tipo, ppm: pasivo.tasa_ppm }
    : null
}

function esPrestamo(pasivo: FilaPasivo): boolean {
  return pasivo.tipo === 'credito' || pasivo.tipo === 'deuda'
}

/**
 * Arma el catálogo de la pantalla con lo que el actor puede usar: categorías
 * activas por `orden`; medios de contado; tarjetas con su fila `tarjeta`; y
 * préstamos (crédito o deuda) que ya tengan al menos un desembolso, porque un
 * saldo inicial no es dinero disponible. El disponible de un préstamo se
 * deriva con `disponiblePrestamo`; nunca se guarda.
 */
export function armarCatalogo(f: FilasCatalogo): CatalogoCompra {
  const categorias: CategoriaOpcion[] = f.categorias
    .filter((categoria) => categoria.activa)
    .map((categoria) => ({
      id: categoria.id,
      nombre: categoria.nombre,
      icono: categoria.icono,
      orden: categoria.orden,
    }))
    .sort((a, b) => a.orden - b.orden)

  const medios: MedioOpcion[] = f.medios
    .filter((medio) => medio.activo)
    .map((medio) => ({ tipo: 'medio', id: medio.id, nombre: medio.nombre, ambito: null }))

  const tarjetas: MedioOpcion[] = []
  const prestamos: MedioOpcion[] = []
  for (const pasivo of f.pasivos) {
    if (!pasivo.activo) continue
    if (pasivo.tipo === 'tarjeta') {
      const tarjeta = f.tarjetas.find((fila) => fila.pasivo_id === pasivo.id)
      if (!tarjeta) continue
      tarjetas.push({
        tipo: 'tarjeta',
        id: pasivo.id,
        nombre: tarjeta.ultimos_4
          ? `${pasivo.nombre} ••${tarjeta.ultimos_4}`
          : pasivo.nombre,
        ambito: pasivo.ambito,
        ultimos4: tarjeta.ultimos_4,
        diaCorte: tarjeta.dia_corte,
        diaPago: tarjeta.dia_pago,
        tasa: tasaDe(pasivo),
      })
      continue
    }
    if (!esPrestamo(pasivo)) continue
    const desembolsos = f.desembolsos.filter((fila) => fila.pasivo_id === pasivo.id)
    if (desembolsos.length === 0) continue
    const vinculadas = f.comprasVinculadas.filter(
      (fila) => fila.financiada_por_pasivo_id === pasivo.id,
    )
    prestamos.push({
      tipo: 'prestamo',
      id: pasivo.id,
      nombre: pasivo.nombre,
      ambito: pasivo.ambito,
      disponible: disponiblePrestamo(
        desembolsos.map((fila) => fila.capital),
        vinculadas.map((fila) => fila.monto_total),
      ),
      fechaGiro: desembolsos
        .map((fila) => fila.fecha_inicio)
        .reduce((primera, fecha) => (fecha < primera ? fecha : primera)),
    })
  }

  return {
    categorias,
    medios: [...medios.sort(porNombre), ...tarjetas.sort(porNombre), ...prestamos.sort(porNombre)],
  }
}

// ---------------------------------------------------------------------------
// Puerto local (Dexie) + remoto
// ---------------------------------------------------------------------------

const CLAVE_CATALOGO = 'catalogo'
const SIN_CATALOGO = 'Sin conexión y sin copia local del catálogo'

export type DependenciasPuertoCompraRapida = {
  /** Abre (o reutiliza) la base del actor; se llama en cada operación. */
  base: () => Promise<BaseActorDexie>
  remoto: RemotoCompraRapida
  alcance: AlcanceCompra
  ahora?: () => Date
}

function motivoDe(resultado: Extract<ResultadoPush, { estado: 'rechazado' }>): string {
  switch (resultado.motivo) {
    case 'duplicado':
      return resultado.detalle?.toLowerCase().includes('cufe')
        ? 'Esta factura ya está registrada'
        : 'Ya estaba registrada'
    case 'no_autorizado':
      return 'No tienes permiso para registrar esta compra'
    case 'actualizar_app':
      return 'Actualiza la app para sincronizar'
    case 'invalido':
      return 'El servidor rechazó la compra'
  }
}

export function crearPuertoCompraRapida(d: DependenciasPuertoCompraRapida): CompraRapidaPort {
  const ahora = d.ahora ?? (() => new Date())
  let envioEnCurso: Promise<void> | null = null

  async function enviarUnaVez(antesIso: string): Promise<void> {
    const base = await d.base()
    const candidatas = await base.outbox.where('creadoEn').below(antesIso).toArray()
    const pendientes = candidatas
      .filter((entrada) => entrada.estado === 'pendiente')
      .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))

    for (const entrada of pendientes) {
      // Si `syncPush` falla (sin red) la excepción corta el bucle y el lote
      // sigue pendiente para el próximo disparador.
      const resultado = await d.remoto.syncPush(entrada.lote)
      if (resultado.estado === 'aplicado') {
        await base.outbox.delete(entrada.loteId)
        continue
      }
      await base.transaction('rw', base.outbox, base.registros, async () => {
        await base.outbox.update(entrada.loteId, {
          estado: 'rechazado',
          motivo: motivoDe(resultado),
        })
        // El servidor no registró nada: el registro local ya no debe bloquear
        // un reescaneo del mismo CUFE.
        await base.registros.where('loteId').equals(entrada.loteId).delete()
      })
    }
  }

  return {
    async cargarCatalogo() {
      const base = await d.base()
      try {
        const filas = await d.remoto.leerCatalogo(d.alcance.hogarId)
        const catalogo = armarCatalogo(filas)
        await base.catalogo.put({
          clave: CLAVE_CATALOGO,
          valor: catalogo,
          actualizadoEn: ahora().toISOString(),
        })
        return catalogo
      } catch {
        const cache = await base.catalogo.get(CLAVE_CATALOGO)
        if (!cache) throw new Error(SIN_CATALOGO)
        return cache.valor
      }
    },

    async buscarAlias(nit) {
      try {
        const fila = await d.remoto.buscarAlias(d.alcance.hogarId, nit)
        if (!fila) return null
        return { nombreComercio: fila.nombre, categoriaId: fila.categoria_sugerida_id }
      } catch {
        return null
      }
    },

    async buscarPorCufe(cufe) {
      const base = await d.base()
      const local = await base.registros.where('cufe').equals(cufe).first()
      if (local) {
        return { fecha: local.fecha, montoTotal: local.montoTotal, descripcion: local.descripcion }
      }
      try {
        const remota = await d.remoto.buscarPorCufe(d.alcance.hogarId, cufe)
        if (!remota) return null
        return {
          fecha: remota.fecha,
          montoTotal: remota.monto_total,
          descripcion: remota.descripcion,
        }
      } catch {
        return null
      }
    },

    async guardarLote(lote, registro) {
      const base = await d.base()
      await base.transaction('rw', base.outbox, base.registros, async () => {
        await base.outbox.put({
          loteId: lote.lote_id,
          creadoEn: registro.creadoEn,
          lote,
          estado: 'pendiente',
          motivo: null,
        })
        await base.registros.put(registro)
      })
    },

    async descartarLote(loteId) {
      const base = await d.base()
      return base.transaction('rw', base.outbox, base.registros, async () => {
        const entrada = await base.outbox.get(loteId)
        if (!entrada || entrada.estado !== 'pendiente') return false
        await base.outbox.delete(loteId)
        await base.registros.where('loteId').equals(loteId).delete()
        return true
      })
    },

    async registrosDesde(desdeIso) {
      const base = await d.base()
      return base.registros.where('creadoEn').aboveOrEqual(desdeIso).toArray()
    },

    enviarPendientes(antesIso) {
      // Un solo envío a la vez: el segundo disparador (ventana vencida, vuelta
      // a la pantalla) espera el mismo resultado y no duplica el push.
      if (envioEnCurso) return envioEnCurso
      envioEnCurso = enviarUnaVez(antesIso).finally(() => {
        envioEnCurso = null
      })
      return envioEnCurso
    },

    async estadoSincronizacion() {
      const base = await d.base()
      const [pendientes, rechazadas] = await Promise.all([
        base.outbox.where('estado').equals('pendiente').count(),
        base.outbox.where('estado').equals('rechazado').toArray(),
      ])
      return {
        pendientes,
        rechazados: rechazadas.map((entrada) => ({
          loteId: entrada.loteId,
          motivo: entrada.motivo ?? '',
        })),
      }
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

// ---------------------------------------------------------------------------
// Remoto Supabase: lecturas por RLS y `sync_push`
// ---------------------------------------------------------------------------

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

const esquemaCompraVinculada = z.object({
  financiada_por_pasivo_id: z.uuid(),
  monto_total: z.number().int(),
})

const esquemaAlias = z.object({
  nombre: z.string(),
  categoria_sugerida_id: z.uuid().nullable(),
})

const esquemaCompraPorCufe = z.object({
  fecha: z.string(),
  monto_total: z.number().int(),
  descripcion: z.string(),
})

const esquemaResultadoPush = z.discriminatedUnion('estado', [
  z.object({
    estado: z.literal('aplicado'),
    filas: z.array(
      z.object({ tabla: z.string(), id: z.uuid(), seq: z.number().int() }),
    ),
  }),
  z.object({
    estado: z.literal('rechazado'),
    motivo: z.enum(['duplicado', 'invalido', 'no_autorizado', 'actualizar_app']),
    detalle: z.string().optional(),
  }),
])

export function crearRemotoSupabase(cliente: SupabaseClient): RemotoCompraRapida {
  return {
    async leerCatalogo(hogarId) {
      const [categorias, medios, pasivos, tarjetas, desembolsos, compras] =
        await Promise.all([
          cliente.from('categoria').select('id,nombre,icono,orden,activa')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('medio_de_pago').select('id,nombre,tipo,activo')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('pasivo').select('id,tipo,nombre,ambito,tasa_tipo,tasa_ppm,activo')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('tarjeta').select('pasivo_id,ultimos_4,dia_corte,dia_pago')
            .eq('hogar_id', hogarId).is('eliminado_en', null),
          cliente.from('plan_de_cuotas').select('pasivo_id,capital,fecha_inicio')
            .eq('hogar_id', hogarId).eq('origen', 'desembolso').is('eliminado_en', null),
          cliente.from('compra').select('financiada_por_pasivo_id,monto_total')
            .eq('hogar_id', hogarId).not('financiada_por_pasivo_id', 'is', null)
            .is('eliminado_en', null),
        ])

      for (const respuesta of [categorias, medios, pasivos, tarjetas, desembolsos, compras]) {
        if (respuesta.error) throw respuesta.error
      }

      return {
        categorias: z.array(esquemaCategoria).parse(categorias.data),
        medios: z.array(esquemaMedio).parse(medios.data),
        pasivos: z.array(esquemaPasivo).parse(pasivos.data),
        tarjetas: z.array(esquemaTarjeta).parse(tarjetas.data),
        desembolsos: z.array(esquemaDesembolso).parse(desembolsos.data),
        comprasVinculadas: z.array(esquemaCompraVinculada).parse(compras.data),
      }
    },

    async buscarAlias(hogarId, nit) {
      const { data, error } = await cliente.from('alias_comercio')
        .select('nombre,categoria_sugerida_id')
        .eq('hogar_id', hogarId).eq('nit_comercio', nit)
        .is('eliminado_en', null)
        .maybeSingle()
      if (error) throw error
      return data === null ? null : esquemaAlias.parse(data)
    },

    async buscarPorCufe(hogarId, cufe) {
      // RLS ya acota a compras del hogar y a las personales del actor.
      const { data, error } = await cliente.from('compra')
        .select('fecha,monto_total,descripcion')
        .eq('hogar_id', hogarId).eq('cufe', cufe)
        .is('eliminado_en', null)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data === null ? null : esquemaCompraPorCufe.parse(data)
    },

    async syncPush(lote) {
      const { data, error } = await cliente.rpc('sync_push', { p_lote: lote })
      if (error) throw error
      const resultado = esquemaResultadoPush.parse(data)
      if (resultado.estado === 'aplicado') {
        return { estado: 'aplicado', filas: resultado.filas }
      }
      return resultado.detalle === undefined
        ? { estado: 'rechazado', motivo: resultado.motivo }
        : { estado: 'rechazado', motivo: resultado.motivo, detalle: resultado.detalle }
    },
  }
}
