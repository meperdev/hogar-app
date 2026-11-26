import { esPeriodo, periodoDe } from './agenda'
import { fechaConDia } from './fechas'
import { pesos } from './pesos'

export type IngresoFijo = {
  id: string
  serieId: string
  miembroId: string
  tipo: 'fijo'
  descripcion: string
  monto: number
  diaEsperado: number
  vigenteDesde: string
  vigenteHasta: string | null
}

export type IngresoVariable = {
  id: string
  serieId: null
  miembroId: string
  tipo: 'variable'
  descripcion: string
  monto: number
  fecha: string
}

export type Ingreso = IngresoFijo | IngresoVariable

export type RecepcionIngreso = {
  id: string
  ingresoId: string
  serieId: string
  periodo: string
  recibido: boolean
  montoRecibido: number | null
  fechaRecepcion: string | null
}

export type EstadoIngresoFijo = 'recibido' | 'esperado'

export type IngresoFijoMes = {
  serieId: string
  miembroId: string
  descripcion: string
  version: IngresoFijo
  fechaEsperada: string
  montoEsperado: number
  montoEfectivo: number
  estado: EstadoIngresoFijo
  recepcion: RecepcionIngreso | null
}

export type ResumenIngresosMes = {
  periodo: string
  totalFijos: number
  totalVariables: number
  total: number
  fijos: IngresoFijoMes[]
  variables: IngresoVariable[]
  porMiembro: Map<string, number>
}

function rangoMes(periodo: string): { inicioMes: string; finMes: string } {
  if (!esPeriodo(periodo)) {
    throw new RangeError(`Periodo inválido: ${periodo}`)
  }
  const anio = Number(periodo.slice(0, 4))
  const mes = Number(periodo.slice(5, 7))
  return {
    inicioMes: `${periodo}-01`,
    finMes: fechaConDia(anio, mes, 31),
  }
}

/** Fecha civil esperada de un día (1..31) en el periodo, ajustando fin de mes. */
export function diaEsperadoEnMes(diaEsperado: number, periodo: string): string {
  if (!esPeriodo(periodo)) {
    throw new RangeError(`Periodo inválido: ${periodo}`)
  }
  const anio = Number(periodo.slice(0, 4))
  const mes = Number(periodo.slice(5, 7))
  return fechaConDia(anio, mes, diaEsperado)
}

/**
 * Selecciona exactamente una versión vigente de una serie fija para un mes
 * calendario (I24): decide el día 1; si arranca a mitad de mes, el último día;
 * si arranca y cierra en el mismo mes (cierre terminal), el extremo efectivo de
 * la última versión se extiende hasta el último día civil del mes de arranque.
 */
export function versionIngresoSerie(
  versiones: IngresoFijo[],
  periodo: string,
): IngresoFijo | null {
  if (!esPeriodo(periodo) || versiones.length === 0) {
    return null
  }
  const ordenadas = [...versiones].sort((a, b) =>
    a.vigenteDesde.localeCompare(b.vigenteDesde),
  )
  const inicio = ordenadas[0]!.vigenteDesde
  const ultima = ordenadas[ordenadas.length - 1]!
  const { inicioMes, finMes } = rangoMes(periodo)

  let finEfectivo = ultima.vigenteHasta
  if (finEfectivo !== null && periodoDe(inicio) === periodoDe(finEfectivo)) {
    finEfectivo = rangoMes(periodoDe(inicio)).finMes
  }

  if (inicio > finMes || (finEfectivo !== null && finEfectivo < inicioMes)) {
    return null
  }

  const ref = inicio <= inicioMes ? inicioMes : finMes
  for (const version of ordenadas) {
    const extremo = version === ultima ? finEfectivo : version.vigenteHasta
    if (version.vigenteDesde <= ref && (extremo === null || ref <= extremo)) {
      return version
    }
  }
  return null
}

/**
 * Evalúa una serie fija en un periodo combinando su versión aplicable y el
 * recibo único por `(serieId, periodo)`. El recibo gana sobre el importe sin
 * alterar la versión ni `Ingreso.monto` (I22, I24).
 */
export function evaluarSerieFijaEnMes(
  versiones: IngresoFijo[],
  recepciones: RecepcionIngreso[],
  periodo: string,
): IngresoFijoMes | null {
  const version = versionIngresoSerie(versiones, periodo)
  if (!version) return null

  const recibo =
    recepciones.find(
      (r) => r.serieId === version.serieId && r.periodo === periodo && r.recibido,
    ) ?? null

  const montoEsperado = pesos(version.monto)
  const montoEfectivo = pesos(recibo?.montoRecibido ?? version.monto)

  return {
    serieId: version.serieId,
    miembroId: version.miembroId,
    descripcion: version.descripcion,
    version,
    fechaEsperada: diaEsperadoEnMes(version.diaEsperado, periodo),
    montoEsperado,
    montoEfectivo,
    estado: recibo ? 'recibido' : 'esperado',
    recepcion: recibo,
  }
}

/** Agrupa series fijas, variables y totales del mes por miembro (todo derivado). */
export function resumenIngresosMes(
  ingresos: Ingreso[],
  recepciones: RecepcionIngreso[],
  periodo: string,
  miembros: Array<{ id: string }>,
): ResumenIngresosMes {
  if (!esPeriodo(periodo)) {
    throw new RangeError(`Periodo inválido: ${periodo}`)
  }

  const series = new Map<string, IngresoFijo[]>()
  const variables: IngresoVariable[] = []
  for (const ingreso of ingresos) {
    if (ingreso.tipo === 'fijo') {
      const lista = series.get(ingreso.serieId) ?? []
      lista.push(ingreso)
      series.set(ingreso.serieId, lista)
    } else if (periodoDe(ingreso.fecha) === periodo) {
      variables.push(ingreso)
    }
  }

  const porMiembro = new Map<string, number>()
  for (const miembro of miembros) {
    porMiembro.set(miembro.id, 0)
  }

  const fijos: IngresoFijoMes[] = []
  let totalFijos = 0
  for (const versiones of series.values()) {
    const evaluada = evaluarSerieFijaEnMes(versiones, recepciones, periodo)
    if (!evaluada) continue
    fijos.push(evaluada)
    totalFijos += evaluada.montoEfectivo
    porMiembro.set(
      evaluada.miembroId,
      (porMiembro.get(evaluada.miembroId) ?? 0) + evaluada.montoEfectivo,
    )
  }

  let totalVariables = 0
  for (const variable of variables) {
    totalVariables += pesos(variable.monto)
    porMiembro.set(
      variable.miembroId,
      (porMiembro.get(variable.miembroId) ?? 0) + variable.monto,
    )
  }

  fijos.sort((a, b) => a.fechaEsperada.localeCompare(b.fechaEsperada))
  variables.sort((a, b) => a.fecha.localeCompare(b.fecha))

  return {
    periodo,
    totalFijos,
    totalVariables,
    total: totalFijos + totalVariables,
    fijos,
    variables,
    porMiembro,
  }
}
