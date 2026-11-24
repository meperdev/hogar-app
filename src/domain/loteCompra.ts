import { calendarioTarjeta, type Tasa } from './cuotas'
import { esFechaCivil } from './fechas'
import { formatearPesos } from './pesos'

/**
 * Lote atómico de una compra (architecture §4): la `Compra` y, si es a cuotas,
 * su `PlanDeCuotas`, sus `Cuota` y los intereses calculados como
 * `CostoFinanciero`. Las filas usan los nombres de columna de la base y viajan
 * tal cual a `sync_push`. El servidor fija `registrado_por`, `actualizado_por`
 * y `seq`; el lote no los manda.
 *
 * Sin doble conteo (I2, I4): el consumo es solo `compra.monto_total`; las
 * cuotas reparten ese mismo monto y los intereses van al balde aparte.
 */

export type AmbitoCompra = 'hogar' | 'personal'

export type FilaCompra = {
  id: string
  fecha: string
  descripcion: string
  monto_total: number
  categoria_id: string
  ambito: AmbitoCompra
  miembro_id: string | null
  pago_tipo: 'contado' | 'financiado'
  medio_de_pago_id: string | null
  financiada_por_pasivo_id: string | null
  cufe: string | null
  nit_comercio: string | null
  iva: number | null
  origen: 'manual' | 'qr' | 'ocr'
}

export type FilaPlan = {
  id: string
  pasivo_id: string
  origen: 'compra'
  compra_id: string
  fecha_inicio: string
  capital: number
  sistema: 'capital_fijo'
  n_cuotas: number
  fecha_primera_cuota: string
  tasa_tipo: Tasa['tipo'] | null
  tasa_ppm: number | null
}

export type FilaCuota = {
  id: string
  plan_id: string
  numero: number
  fecha_vencimiento: string
  capital: number
}

export type FilaCosto = {
  id: string
  tipo: 'interes'
  monto: number
  fecha_causacion: string
  pasivo_id: string
  cuota_id: string
  origen: 'calculado'
}

export type FilaAlias = {
  id: string
  nit_comercio: string
  nombre: string
  categoria_sugerida_id: string | null
}

export const VERSION_ESQUEMA = 1

export type LoteCompra = {
  lote_id: string
  hogar_id: string
  schema_version: typeof VERSION_ESQUEMA
  filas: {
    compra: [FilaCompra]
    plan_de_cuotas: FilaPlan[]
    cuota: FilaCuota[]
    costo_financiero: FilaCosto[]
    alias_comercio: FilaAlias[]
  }
}

/** Cómo se paga. El ámbito de un pasivo debe ser el de la compra (I18). */
export type PagoCompra =
  | { tipo: 'medio'; medioDePagoId: string }
  | {
      tipo: 'tarjeta'
      pasivoId: string
      ambito: AmbitoCompra
      nCuotas: number
      diaCorte: number
      diaPago: number
      tasa: Tasa | null
    }
  | { tipo: 'prestamo'; pasivoId: string; ambito: AmbitoCompra; disponible: number; fechaGiro: string }

export type FacturaLote = {
  origen: 'qr' | 'ocr'
  cufe: string
  nitComercio: string | null
  iva: number | null
}

export type EntradaLoteCompra = {
  hogarId: string
  actorId: string
  fecha: string
  descripcion: string
  monto: number
  categoriaId: string
  ambito: AmbitoCompra
  pago: PagoCompra
  factura: FacturaLote | null
  /** Alias nuevo para el NIT de la factura. Solo se escribe en compras del hogar (I23). */
  alias: { nombre: string; categoriaSugeridaId: string | null } | null
}

export type CampoLote = 'monto' | 'medio' | 'cuotas' | 'fecha' | 'descripcion'

export class ErrorLote extends Error {
  readonly campo: CampoLote

  constructor(campo: CampoLote, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorLote'
    this.campo = campo
  }
}

/** Tope técnico de cuotas por compra (un `smallint` admite más, pero no tiene sentido). */
export const MAX_CUOTAS = 360

const PATRON_CUFE = /^[0-9a-f]{96}$/

export function construirLoteCompra(e: EntradaLoteCompra, nuevoId: () => string): LoteCompra {
  if (!Number.isSafeInteger(e.monto) || e.monto <= 0) {
    throw new ErrorLote('monto', 'Ingresa un monto mayor a $0')
  }
  if (!esFechaCivil(e.fecha)) {
    throw new ErrorLote('fecha', 'La fecha no es válida')
  }
  const descripcion = e.descripcion.trim()
  if (descripcion.length > 200) {
    throw new ErrorLote('descripcion', 'La descripción admite hasta 200 caracteres')
  }
  if (e.factura && !PATRON_CUFE.test(e.factura.cufe)) {
    throw new ErrorLote('monto', 'El CUFE de la factura no es válido')
  }
  const iva = e.factura?.iva ?? null
  if (iva !== null && (!Number.isSafeInteger(iva) || iva < 0 || iva > e.monto)) {
    throw new ErrorLote('monto', `El IVA (${formatearPesos(iva)}) no puede superar el total`)
  }

  const compraId = nuevoId()
  const compra: FilaCompra = {
    id: compraId,
    fecha: e.fecha,
    descripcion,
    monto_total: e.monto,
    categoria_id: e.categoriaId,
    ambito: e.ambito,
    miembro_id: e.ambito === 'personal' ? e.actorId : null,
    pago_tipo: 'contado',
    medio_de_pago_id: null,
    financiada_por_pasivo_id: null,
    cufe: e.factura?.cufe ?? null,
    nit_comercio: e.factura?.nitComercio ?? null,
    iva,
    origen: e.factura?.origen ?? 'manual',
  }

  const planes: FilaPlan[] = []
  const cuotas: FilaCuota[] = []
  const costos: FilaCosto[] = []
  const pago = e.pago

  if (pago.tipo !== 'medio' && pago.ambito !== e.ambito) {
    throw new ErrorLote(
      'medio',
      e.ambito === 'personal'
        ? 'Ese medio es del hogar: elige uno personal'
        : 'Ese medio es personal: elige uno del hogar',
    )
  }

  if (pago.tipo === 'medio') {
    compra.medio_de_pago_id = pago.medioDePagoId
  } else if (pago.tipo === 'prestamo') {
    // I19: la compra gasta un desembolso ya registrado; no crea plan ni capital.
    if (e.fecha < pago.fechaGiro) {
      throw new ErrorLote('fecha', 'La compra no puede ser anterior al desembolso del préstamo')
    }
    if (e.monto > pago.disponible) {
      throw new ErrorLote(
        'medio',
        `El préstamo solo tiene ${formatearPesos(pago.disponible)} disponibles`,
      )
    }
    compra.financiada_por_pasivo_id = pago.pasivoId
  } else {
    if (!Number.isSafeInteger(pago.nCuotas) || pago.nCuotas < 1 || pago.nCuotas > MAX_CUOTAS) {
      throw new ErrorLote('cuotas', `Elige entre 1 y ${MAX_CUOTAS} cuotas`)
    }
    if (e.monto < pago.nCuotas) {
      throw new ErrorLote('cuotas', 'El monto no alcanza para tantas cuotas')
    }
    const calendario = calendarioTarjeta({
      fechaCompra: e.fecha,
      monto: e.monto,
      nCuotas: pago.nCuotas,
      diaCorte: pago.diaCorte,
      diaPago: pago.diaPago,
      tasa: pago.tasa,
    })
    const planId = nuevoId()
    compra.pago_tipo = 'financiado'
    planes.push({
      id: planId,
      pasivo_id: pago.pasivoId,
      origen: 'compra',
      compra_id: compraId,
      fecha_inicio: e.fecha,
      capital: e.monto,
      sistema: 'capital_fijo',
      n_cuotas: pago.nCuotas,
      fecha_primera_cuota: calendario.cuotas[0]?.fechaVencimiento ?? e.fecha,
      tasa_tipo: pago.tasa?.tipo ?? null,
      tasa_ppm: pago.tasa?.ppm ?? null,
    })
    for (const cuota of calendario.cuotas) {
      const cuotaId = nuevoId()
      cuotas.push({
        id: cuotaId,
        plan_id: planId,
        numero: cuota.numero,
        fecha_vencimiento: cuota.fechaVencimiento,
        capital: cuota.capital,
      })
      // Sin tasa no se inventa interés; un interés redondeado a $0 no es un costo.
      // Es una estimación: el servidor la guarda como llega (origen 'calculado')
      // y se corrige en Obligaciones del mes (decisión de Santiago, PR #4).
      if (cuota.interes !== null && cuota.interes > 0) {
        costos.push({
          id: nuevoId(),
          tipo: 'interes',
          monto: cuota.interes,
          fecha_causacion: cuota.fechaVencimiento,
          pasivo_id: pago.pasivoId,
          cuota_id: cuotaId,
          origen: 'calculado',
        })
      }
    }
  }

  const alias: FilaAlias[] = []
  const nit = e.factura?.nitComercio ?? null
  const nombreAlias = e.alias?.nombre.trim() ?? ''
  // I23: una compra personal nunca crea filas compartidas.
  if (e.ambito === 'hogar' && nit !== null && e.alias && nombreAlias !== '') {
    alias.push({
      id: nuevoId(),
      nit_comercio: nit,
      nombre: nombreAlias,
      categoria_sugerida_id: e.alias.categoriaSugeridaId,
    })
  }

  return {
    lote_id: nuevoId(),
    hogar_id: e.hogarId,
    schema_version: VERSION_ESQUEMA,
    filas: {
      compra: [compra],
      plan_de_cuotas: planes,
      cuota: cuotas,
      costo_financiero: costos,
      alias_comercio: alias,
    },
  }
}

/**
 * Capital de un préstamo aún no gastado en compras vinculadas (derivado, I19).
 * Es un aviso temprano: el servidor revalida por fecha bajo lock.
 */
export function disponiblePrestamo(desembolsado: number[], vinculado: number[]): number {
  const suma = (xs: number[]) => xs.reduce((total, x) => total + x, 0)
  return Math.max(0, suma(desembolsado) - suma(vinculado))
}

/**
 * Consumo del hogar: cada compra del hogar suma una vez su `monto_total`; las
 * personales quedan fuera y cuotas e intereses nunca suman al consumo (I2,
 * I4, I18). Derivado: nunca se guarda.
 */
export function consumoDelHogar(compras: FilaCompra[]): number {
  return compras
    .filter((compra) => compra.ambito === 'hogar')
    .reduce((total, compra) => total + compra.monto_total, 0)
}

/**
 * Aporte que genera una compra al registrarse (I6, I18, I19): solo una compra
 * del hogar de contado pagada con un medio de un miembro. Una personal, una a
 * cuotas (aporta al pagar la tarjeta) o una financiada con préstamo (aporta al
 * pagar el préstamo) no aportan hoy. `duenoDelMedio` es el `owner_miembro_id`
 * del medio, `null` si el medio es del hogar.
 */
export function aporteDeCompra(
  compra: FilaCompra,
  duenoDelMedio: string | null,
): { miembroId: string; monto: number } | null {
  if (compra.ambito !== 'hogar' || compra.pago_tipo !== 'contado') return null
  if (compra.medio_de_pago_id === null || duenoDelMedio === null) return null
  return { miembroId: duenoDelMedio, monto: compra.monto_total }
}
