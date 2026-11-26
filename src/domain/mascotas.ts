import { esFechaCivil, partesFecha } from './fechas'
import type { AmbitoCompra } from './loteCompra'

export type EspecieMascota = 'perro' | 'gato' | 'otro'
export type TipoInsumo = 'comida' | 'higiene' | 'salud' | 'otro'
export type OrigenNivel = 'compra' | 'ajuste'

export type Mascota = {
  id: string
  nombre: string
  especie: EspecieMascota
  fechaNacimiento: string | null
  activa: boolean
}

export type ItemDespensa = {
  id: string
  mascotaId: string | null
  nombre: string
  tipo: TipoInsumo
  categoriaId: string
  frecuenciaDias: number | null
  umbralAlertaPct: number
  montoHabitual: number | null
  activo: boolean
}

export type ObservacionNivel = {
  id: string
  itemDespensaId: string
  compraId: string | null
  fecha: string
  nivelPct: number
  origen: OrigenNivel
  ambito: AmbitoCompra
}

export type CategoriaEstadoDespensa = 'alerta' | 'revisar' | 'medio' | 'bien' | 'desconocido'

export type EstadoItemDespensa = {
  item: ItemDespensa
  ultimaObservacion: ObservacionNivel | null
  nivelActual: number | null
  vidaUtilDias: number | null
  proximaCompraEstimada: string | null
  diasRestantes: number | null
  alerta: boolean
  estado: CategoriaEstadoDespensa
}

export type CompraResumenMascotas = {
  id: string
  fecha: string
  descripcion: string
  montoTotal: number
  categoriaId: string
  ambito: AmbitoCompra
  mascotaId: string | null
  itemDespensaId: string | null
}

export type DesgloseMascotaMes = {
  mascotaId: string
  nombre: string
  monto: number
}

export type GastoMascotasMes = {
  periodo: string
  total: number
  porMascota: DesgloseMascotaMes[]
  sinEtiqueta: number
  compras: CompraResumenMascotas[]
}

const MS_POR_DIA = 86_400_000

function serialCivil(fecha: string): number {
  const { anio, mes, dia } = partesFecha(fecha)
  return Date.UTC(anio, mes - 1, dia) / MS_POR_DIA
}

/** Suma `dias` enteros a una fecha civil `YYYY-MM-DD` sin deriva de zona horaria. */
export function sumarDiasCiviles(fecha: string, dias: number): string {
  if (!Number.isSafeInteger(dias)) {
    throw new RangeError(`Cantidad de días inválida: ${String(dias)}`)
  }
  const destino = new Date((serialCivil(fecha) + dias) * MS_POR_DIA)
  const anio = String(destino.getUTCFullYear()).padStart(4, '0')
  const mes = String(destino.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(destino.getUTCDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

/** Días enteros entre `desde` y `hasta` (negativo si `hasta` es anterior a `desde`). */
export function diasEntreFechas(desde: string, hasta: string): number {
  return serialCivil(hasta) - serialCivil(desde)
}

/**
 * Deriva nivel actual, vida útil, fecha fija de próxima compra, días restantes
 * y alerta desde la observación compartida más reciente por `(fecha, id)` (I21).
 */
export function derivarEstadoItem(
  item: ItemDespensa,
  observaciones: ObservacionNivel[],
  hoy: string,
): EstadoItemDespensa {
  if (!esFechaCivil(hoy)) {
    throw new RangeError(`Fecha de consulta inválida: ${hoy}`)
  }

  // Solo las observaciones visibles del hogar alimentan la despensa compartida (I25).
  let ultima: ObservacionNivel | null = null
  for (const obs of observaciones) {
    if (obs.itemDespensaId !== item.id || obs.ambito !== 'hogar') continue
    if (
      ultima === null
      || obs.fecha > ultima.fecha
      || (obs.fecha === ultima.fecha && obs.id > ultima.id)
    ) {
      ultima = obs
    }
  }

  if (ultima === null) {
    return {
      item,
      ultimaObservacion: null,
      nivelActual: null,
      vidaUtilDias: null,
      proximaCompraEstimada: null,
      diasRestantes: null,
      alerta: false,
      estado: 'desconocido',
    }
  }

  const nivelActual = ultima.nivelPct
  const alerta = nivelActual <= item.umbralAlertaPct

  let vidaUtilDias: number | null = null
  let proximaCompraEstimada: string | null = null
  let diasRestantes: number | null = null

  if (item.frecuenciaDias !== null) {
    vidaUtilDias = Math.floor((nivelActual * item.frecuenciaDias) / 100)
    proximaCompraEstimada = sumarDiasCiviles(ultima.fecha, vidaUtilDias)
    diasRestantes = diasEntreFechas(hoy, proximaCompraEstimada)
  }

  let estado: CategoriaEstadoDespensa
  if (alerta) {
    estado = 'alerta'
  } else if (diasRestantes !== null && diasRestantes <= 0) {
    estado = 'revisar'
  } else if (nivelActual <= 60) {
    estado = 'medio'
  } else {
    estado = 'bien'
  }

  return {
    item,
    ultimaObservacion: ultima,
    nivelActual,
    vidaUtilDias,
    proximaCompraEstimada,
    diasRestantes,
    alerta,
    estado,
  }
}

const PRIORIDAD_ESTADO: Record<CategoriaEstadoDespensa, number> = {
  alerta: 0,
  revisar: 1,
  medio: 2,
  bien: 3,
  desconocido: 4,
}

/** Ordena alertas arriba, luego revisar/medio/bien por días restantes y desconocidos al final. */
export function ordenarInsumosPorUrgencia(estados: EstadoItemDespensa[]): EstadoItemDespensa[] {
  return [...estados].sort((a, b) => {
    const porEstado = PRIORIDAD_ESTADO[a.estado] - PRIORIDAD_ESTADO[b.estado]
    if (porEstado !== 0) return porEstado

    if (a.diasRestantes !== null && b.diasRestantes !== null) {
      const porDias = a.diasRestantes - b.diasRestantes
      if (porDias !== 0) return porDias
    } else if (a.diasRestantes !== null) {
      return -1
    } else if (b.diasRestantes !== null) {
      return 1
    }

    if (a.nivelActual !== null && b.nivelActual !== null) {
      const porNivel = a.nivelActual - b.nivelActual
      if (porNivel !== 0) return porNivel
    }

    return a.item.nombre.localeCompare(b.item.nombre, 'es')
  })
}

/**
 * Total reconciliable de "Mascotas" del hogar en un mes (I26):
 * suma únicamente compras `ambito === 'hogar'` en la categoría `Mascotas` dentro
 * del periodo, cada una una sola vez. `mascotaId` solo reparte ese total.
 */
export function calcularGastoMascotasMes(
  compras: CompraResumenMascotas[],
  mascotas: Mascota[],
  categoriaMascotasId: string,
  periodo: string,
): GastoMascotasMes {
  const mascotasPorId = new Map(mascotas.map((m) => [m.id, m]))
  const incluidas: CompraResumenMascotas[] = []
  const acumulados = new Map<string, number>()
  let total = 0
  let sinEtiqueta = 0

  for (const compra of compras) {
    if (compra.ambito !== 'hogar') continue
    if (compra.categoriaId !== categoriaMascotasId) continue
    if (compra.fecha.slice(0, 7) !== periodo) continue

    incluidas.push(compra)
    total += compra.montoTotal

    if (compra.mascotaId !== null && mascotasPorId.has(compra.mascotaId)) {
      acumulados.set(compra.mascotaId, (acumulados.get(compra.mascotaId) ?? 0) + compra.montoTotal)
    } else {
      sinEtiqueta += compra.montoTotal
    }
  }

  incluidas.sort((a, b) => (a.fecha === b.fecha ? b.id.localeCompare(a.id) : b.fecha.localeCompare(a.fecha)))

  const porMascota: DesgloseMascotaMes[] = []
  for (const [mascotaId, monto] of acumulados) {
    const mascota = mascotasPorId.get(mascotaId)
    porMascota.push({
      mascotaId,
      nombre: mascota?.nombre ?? 'Mascota',
      monto,
    })
  }
  porMascota.sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, 'es'))

  return {
    periodo,
    total,
    porMascota,
    sinEtiqueta,
    compras: incluidas,
  }
}
