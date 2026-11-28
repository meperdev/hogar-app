import { porcentajeAPpm } from './agenda'
import { repartirCapital } from './cuotas'
import { esFechaCivil, fechaConDia, partesFecha } from './fechas'

/**
 * Lotes atómicos del núcleo 2 para `sync_push_obligaciones` (architecture §4).
 * Las filas usan los nombres de columna de la base; el servidor fija
 * `registrado_por`, `actualizado_por`, `hogar_id` y `seq`.
 *
 * Interés de una cuota (decisión de Santiago, PR #4): lo `calculado` es una
 * estimación del cliente. Si el usuario lo corrige contra el extracto, el lote
 * de pago actualiza ese `CostoFinanciero` (con el `seq` que vio) y queda
 * `origen='manual'`.
 */

export type TipoLote = 'pago' | 'pasivo' | 'obligacion' | 'pago_obligacion'

export type LoteObligaciones = {
  lote_id: string
  hogar_id: string
  schema_version: 1
  tipo: TipoLote
  filas: Record<string, Record<string, unknown>[]>
}

export class ErrorLoteObligaciones extends Error {
  readonly campo: string

  constructor(campo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorLoteObligaciones'
    this.campo = campo
  }
}

const enteroPositivo = (n: number) => Number.isSafeInteger(n) && n > 0

function lote(hogarId: string, tipo: TipoLote, filas: LoteObligaciones['filas'], nuevoId: () => string): LoteObligaciones {
  return { lote_id: nuevoId(), hogar_id: hogarId, schema_version: 1, tipo, filas }
}

/** Interés ligado a la cuota: el costo existente (si hay) y el monto que quedó en el formulario. */
export type InteresPago = {
  costoId: string | null
  /** `seq` del costo que vio el cliente; obligatorio para corregirlo. */
  baseSeq: number | null
  estimado: number | null
  final: number | null
}

export type EntradaPago = {
  hogarId: string
  pasivoId: string
  medioId: string
  fecha: string
  cuotaId: string | null
  /** Monto total del abono (capital + costos ya causados que cubre). */
  monto: number
  interes: InteresPago | null
  nota: string
  /** Sobrepago confirmado explícitamente: `abono` hasta `tope`, `saldo_a_favor` por el resto. */
  division: { tope: number; cargoCuota: number | null } | null
  incluirEnGastos?: boolean | undefined
  categoriaGastoId?: string | null | undefined
}

export function construirLotePago(e: EntradaPago, nuevoId: () => string): LoteObligaciones {
  if (!enteroPositivo(e.monto)) throw new ErrorLoteObligaciones('monto', 'Ingresa un monto mayor a $0')
  if (!esFechaCivil(e.fecha)) throw new ErrorLoteObligaciones('fecha', 'La fecha no es válida')
  if (e.incluirEnGastos && !e.categoriaGastoId) {
    throw new ErrorLoteObligaciones('categoriaGasto', 'Elige una categoría para contarlo como gasto.')
  }

  const costos: Record<string, unknown>[] = []
  const i = e.interes
  if (i && i.final !== null && i.final !== i.estimado) {
    if (!enteroPositivo(i.final)) throw new ErrorLoteObligaciones('interes', 'El interés debe ser un monto mayor a $0')
    if (i.costoId !== null) {
      if (i.baseSeq === null) throw new ErrorLoteObligaciones('interes', 'Falta la versión del interés que viste')
      costos.push({ id: i.costoId, base_seq: i.baseSeq, monto: i.final })
    } else {
      // Pasivo sin tasa: el extracto trae un interés que la app no estimó.
      costos.push({
        id: nuevoId(),
        tipo: 'interes',
        monto: i.final,
        fecha_causacion: e.fecha,
        pasivo_id: e.pasivoId,
        cuota_id: e.cuotaId,
        origen: 'manual',
      })
    }
  }

  const base = { pasivo_id: e.pasivoId, medio_de_pago_id: e.medioId, fecha: e.fecha, nota: e.nota.trim() || null }
  const extraGasto = e.incluirEnGastos
    ? { incluir_en_gastos: true, categoria_gasto_id: e.categoriaGastoId ?? null }
    : {}
  const pagos: Record<string, unknown>[] = []
  if (e.division) {
    const { tope, cargoCuota } = e.division
    if (e.monto <= tope) throw new ErrorLoteObligaciones('monto', 'Solo un sobrepago se divide')
    if (tope > 0) {
      // El abono conserva el enlace solo si sigue cubriendo la cuota completa.
      const cuota = e.cuotaId !== null && cargoCuota !== null && tope >= cargoCuota ? e.cuotaId : null
      pagos.push({ ...base, ...extraGasto, id: nuevoId(), tipo: 'abono', cuota_id: cuota, monto: tope })
    }
    pagos.push({ ...base, id: nuevoId(), tipo: 'saldo_a_favor', cuota_id: null, monto: e.monto - tope })
  } else {
    pagos.push({ ...base, ...extraGasto, id: nuevoId(), tipo: 'abono', cuota_id: e.cuotaId, monto: e.monto })
  }

  const filas: LoteObligaciones['filas'] = { pago_de_deuda: pagos }
  if (costos.length > 0) filas.costo_financiero = costos
  return lote(e.hogarId, 'pago', filas, nuevoId)
}

export type EntradaPasivo = {
  hogarId: string
  tipo: 'tarjeta' | 'credito' | 'deuda'
  nombre: string
  ambito: 'hogar' | 'personal'
  titularMiembroId: string | null
  tasa: null | { tipo: 'EA' | 'MV'; porcentaje: number }
  tarjeta: null | { diaCorte: number; diaPago: number; ultimos4: string | null; cupo: number | null }
  credito: null | { entidad: string; referencia: string | null }
  deuda: null | { acreedor: string }
  plan: null | {
    origen: 'saldo_inicial' | 'desembolso'
    capital: number
    fechaInicio: string
    calendario: null | { nCuotas: number; fechaPrimeraCuota: string }
  }
}

/** Validación de formulario del alta (la misma política que aplica el servidor). */
export function validarEntradaPasivo(e: EntradaPasivo): { campo: string; mensaje: string } | null {
  if (e.nombre.trim() === '') return { campo: 'nombre', mensaje: 'Ponle un nombre al pasivo' }
  if (e.tipo !== 'deuda' && e.titularMiembroId === null) {
    return { campo: 'titular', mensaje: 'Una tarjeta o un crédito es de un miembro' }
  }
  if (e.ambito === 'personal' && e.titularMiembroId === null) {
    return { campo: 'titular', mensaje: 'Un libro personal es de un miembro' }
  }
  if (e.tasa && (!Number.isFinite(e.tasa.porcentaje) || e.tasa.porcentaje <= 0)) {
    return { campo: 'tasa', mensaje: 'La tasa debe ser mayor que 0 o elige Sin tasa' }
  }
  if (e.tipo === 'tarjeta') {
    const t = e.tarjeta
    const dia = (d: number) => Number.isInteger(d) && d >= 1 && d <= 31
    if (!t || !dia(t.diaCorte) || !dia(t.diaPago)) return { campo: 'tarjeta', mensaje: 'Indica el día de corte y el de pago (1 a 31)' }
    if (t.ultimos4 !== null && !/^[0-9]{4}$/.test(t.ultimos4)) return { campo: 'tarjeta', mensaje: 'Los últimos 4 son cuatro dígitos' }
  }
  if (e.tipo === 'credito' && (!e.credito || e.credito.entidad.trim() === '')) {
    return { campo: 'credito', mensaje: 'Indica la entidad del crédito' }
  }
  if (e.tipo === 'deuda' && (!e.deuda || e.deuda.acreedor.trim() === '')) {
    return { campo: 'deuda', mensaje: 'Indica a quién se le debe' }
  }
  const p = e.plan
  if (p) {
    if (p.origen === 'desembolso' && e.tipo === 'tarjeta') {
      return { campo: 'plan', mensaje: 'Una tarjeta no recibe desembolsos: usa crédito o deuda' }
    }
    if (!enteroPositivo(p.capital)) return { campo: 'plan', mensaje: 'El capital debe ser mayor a $0' }
    if (!esFechaCivil(p.fechaInicio)) return { campo: 'plan', mensaje: 'La fecha no es válida' }
    if (p.calendario) {
      const { nCuotas, fechaPrimeraCuota } = p.calendario
      if (!Number.isSafeInteger(nCuotas) || nCuotas < 1 || nCuotas > 360 || p.capital < nCuotas) {
        return { campo: 'plan', mensaje: 'Elige entre 1 y 360 cuotas' }
      }
      if (!esFechaCivil(fechaPrimeraCuota)) return { campo: 'plan', mensaje: 'La fecha de la primera cuota no es válida' }
    }
  }
  return null
}

export function construirLotePasivo(e: EntradaPasivo, nuevoId: () => string): LoteObligaciones {
  const error = validarEntradaPasivo(e)
  if (error) throw new ErrorLoteObligaciones(error.campo, error.mensaje)
  const pasivoId = nuevoId()
  const tasaTipo = e.tasa?.tipo ?? null
  const tasaPpm = e.tasa ? porcentajeAPpm(e.tasa.porcentaje) : null
  const filas: LoteObligaciones['filas'] = {
    pasivo: [{
      id: pasivoId,
      tipo: e.tipo,
      nombre: e.nombre.trim(),
      ambito: e.ambito,
      owner_tipo: e.titularMiembroId === null ? 'hogar' : 'miembro',
      owner_miembro_id: e.titularMiembroId,
      tasa_tipo: tasaTipo,
      tasa_ppm: tasaPpm,
    }],
  }
  if (e.tipo === 'tarjeta' && e.tarjeta) {
    filas.tarjeta = [{
      pasivo_id: pasivoId,
      dia_corte: e.tarjeta.diaCorte,
      dia_pago: e.tarjeta.diaPago,
      ultimos_4: e.tarjeta.ultimos4,
      cupo: e.tarjeta.cupo,
    }]
  } else if (e.tipo === 'credito' && e.credito) {
    filas.credito = [{ pasivo_id: pasivoId, entidad: e.credito.entidad.trim(), referencia: e.credito.referencia }]
  } else if (e.deuda) {
    filas.deuda = [{ pasivo_id: pasivoId, acreedor: e.deuda.acreedor.trim() }]
  }
  const p = e.plan
  if (p) {
    const planId = nuevoId()
    const cal = p.calendario
    filas.plan_de_cuotas = [{
      id: planId,
      pasivo_id: pasivoId,
      origen: p.origen,
      fecha_inicio: p.fechaInicio,
      capital: p.capital,
      // Sin calendario por defecto: no se inventan cuotas ni fechas.
      sistema: cal ? 'capital_fijo' : 'sin_calendario',
      n_cuotas: cal?.nCuotas ?? null,
      fecha_primera_cuota: cal?.fechaPrimeraCuota ?? null,
      tasa_tipo: tasaTipo,
      tasa_ppm: tasaPpm,
    }]
    if (cal) {
      const { anio, mes, dia } = partesFecha(cal.fechaPrimeraCuota)
      filas.cuota = repartirCapital(p.capital, cal.nCuotas).map((capital, k) => ({
        id: nuevoId(),
        plan_id: planId,
        numero: k + 1,
        fecha_vencimiento: fechaConDia(anio, mes + k, dia),
        capital,
      }))
    }
  }
  return lote(e.hogarId, 'pasivo', filas, nuevoId)
}

export type EntradaPagoObligacion = {
  hogarId: string
  obligacionId: string
  periodo: string
  categoriaId: string
  descripcion: string
  medioId: string
  fecha: string
  monto: number
}

/** Pagar una obligación es una compra del hogar con su `periodo` (suma al consumo por `fecha`). */
export function construirLotePagoObligacion(e: EntradaPagoObligacion, nuevoId: () => string): LoteObligaciones {
  if (!enteroPositivo(e.monto)) throw new ErrorLoteObligaciones('monto', 'Ingresa un monto mayor a $0')
  if (!esFechaCivil(e.fecha)) throw new ErrorLoteObligaciones('fecha', 'La fecha no es válida')
  return lote(e.hogarId, 'pago_obligacion', {
    compra: [{
      id: nuevoId(),
      fecha: e.fecha,
      descripcion: e.descripcion,
      monto_total: e.monto,
      categoria_id: e.categoriaId,
      ambito: 'hogar',
      medio_de_pago_id: e.medioId,
      obligacion_id: e.obligacionId,
      periodo: e.periodo,
    }],
  }, nuevoId)
}
