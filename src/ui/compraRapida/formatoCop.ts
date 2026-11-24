import type {
  DatosFactura,
  DesgloseCuotas,
  ResultadoEscaneo,
  TasaPasivo,
} from '../../app/compraRapida'

const MONTO_MAXIMO_COP = 999_999_999_999

const MESES_CORTOS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const

const MESES_LARGOS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

/** Formatea un monto entero en COP (ej. `$85.000`, `$0`), sin centavos. */
export function formatearCop(monto: number): string {
  const entero = Number.isFinite(monto) ? Math.trunc(monto) : 0
  const negativo = entero < 0
  const absoluto = Math.abs(entero).toString()
  const conPuntos = absoluto.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return negativo ? `-$${conPuntos}` : `$${conPuntos}`
}

/** Extrae solo dígitos de una entrada y retorna un entero seguro COP. */
export function parsearDigitosCop(texto: string): number {
  const digitos = texto.replace(/\D+/g, '')
  if (!digitos) return 0
  const numero = Number(digitos)
  if (!Number.isSafeInteger(numero) || numero < 0) return MONTO_MAXIMO_COP
  return Math.min(numero, MONTO_MAXIMO_COP)
}

/** Aplica una tecla del teclado numérico COP (`0`-`9`, `000`, `borrar`). */
export function aplicarTeclaCop(montoActual: number, tecla: string): number {
  const base = Number.isSafeInteger(montoActual) && montoActual > 0 ? montoActual : 0
  if (tecla === 'borrar') {
    return Math.floor(base / 10)
  }
  if (tecla === '000') {
    if (base === 0) return 0
    return Math.min(base * 1000, MONTO_MAXIMO_COP)
  }
  if (/^[0-9]$/.test(tecla)) {
    const digito = Number(tecla)
    const siguiente = base * 10 + digito
    return Math.min(siguiente, MONTO_MAXIMO_COP)
  }
  return base
}

/** Retorna la fecha civil actual `YYYY-MM-DD` en la zona `America/Bogota`. */
export function fechaHoyBogota(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora)

  const anio = partes.find((p) => p.type === 'year')?.value ?? '2026'
  const mes = partes.find((p) => p.type === 'month')?.value ?? '01'
  const dia = partes.find((p) => p.type === 'day')?.value ?? '01'
  return `${anio}-${mes}-${dia}`
}

function partirFechaIso(fechaIso: string): { anio: number; mes: number; dia: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso)
  if (!match) return null
  const anio = Number(match[1])
  const mes = Number(match[2])
  const dia = Number(match[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return { anio, mes, dia }
}

/** Formatea `2026-11-22` como `22 nov` o `22 nov 2026`. */
export function formatearFechaCortaEs(fechaIso: string, incluirAnio = false): string {
  const partes = partirFechaIso(fechaIso)
  if (!partes) return fechaIso
  const mesNombre = MESES_CORTOS_ES[partes.mes - 1] ?? ''
  return incluirAnio
    ? `${partes.dia} ${mesNombre} ${partes.anio}`
    : `${partes.dia} ${mesNombre}`
}

/** Retorna el nombre del mes en español en minúsculas para una fecha civil. */
export function nombreMesEs(fechaIso: string): string {
  const partes = partirFechaIso(fechaIso)
  if (!partes) return ''
  return MESES_LARGOS_ES[partes.mes - 1] ?? ''
}

/** Formatea un porcentaje usando coma decimal (ej. `28,32 %` o `2,0997 %`). */
export function formatearPorcentajeEs(valor: number, decimales = 2): string {
  return `${valor.toFixed(decimales).replace('.', ',')} %`
}

/** Trunca un CUFE largo para mostrarlo compacto sin perder legibilidad. */
export function truncarCufe(cufe: string): string {
  const limpio = cufe.trim()
  if (limpio.length <= 18) return limpio
  return `${limpio.slice(0, 8)}…${limpio.slice(-8)}`
}

/** Valida que el enlace opcional pertenezca al dominio oficial de la DIAN. */
export function esUrlDianValida(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'dian.gov.co' || parsed.hostname.endsWith('.dian.gov.co'))
    )
  } catch {
    return false
  }
}

function diasEnMes(anio: number, mes1a12: number): number {
  return new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate()
}

function construirFechaMes(anio: number, mes1a12: number, diaDeseado: number): string {
  const anioReal = anio + Math.floor((mes1a12 - 1) / 12)
  const mesReal = ((((mes1a12 - 1) % 12) + 12) % 12) + 1
  const diaReal = Math.min(diaDeseado, diasEnMes(anioReal, mesReal))
  return `${String(anioReal).padStart(4, '0')}-${String(mesReal).padStart(2, '0')}-${String(diaReal).padStart(2, '0')}`
}

function redondearMitadArriba(valor: number): number {
  return Math.floor(valor + 0.5)
}

/**
 * Calcula el desglose sin doble conteo para una tarjeta (`docs/data-model.md` §9).
 * Usado solo por el controlador visual de respaldo cuando la capa `app` real
 * aún no se inyecta en runtime.
 */
export function calcularDesgloseTarjetaVisual(params: {
  monto: number
  cuotas: number
  fechaCompra: string
  diaCorte: number
  diaPago: number
  tasa: TasaPasivo | null
}): DesgloseCuotas {
  const { monto, cuotas, fechaCompra, diaCorte, diaPago, tasa } = params
  const n = Math.max(1, Math.trunc(cuotas))
  const partes = partirFechaIso(fechaCompra) ?? { anio: 2026, mes: 11, dia: 22 }

  // corte_1: primer día diaCorte >= fechaCompra
  const corteEnMismoMes = construirFechaMes(partes.anio, partes.mes, diaCorte)
  const corte1 =
    corteEnMismoMes >= fechaCompra
      ? partirFechaIso(corteEnMismoMes)!
      : partirFechaIso(construirFechaMes(partes.anio, partes.mes + 1, diaCorte))!

  // pago_1: primer día diaPago estrictamente posterior a corte_1
  const corte1Iso = construirFechaMes(corte1.anio, corte1.mes, corte1.dia)
  const pagoEnMesCorte = construirFechaMes(corte1.anio, corte1.mes, diaPago)
  const pago1 =
    pagoEnMesCorte > corte1Iso
      ? partirFechaIso(pagoEnMesCorte)!
      : partirFechaIso(construirFechaMes(corte1.anio, corte1.mes + 1, diaPago))!

  const capitalBase = Math.floor(monto / n)
  const residuo = monto % n

  const tasaMensualDecimal = tasa
    ? tasa.tipo === 'EA'
      ? Math.pow(1 + tasa.ppm / 1_000_000, 1 / 12) - 1
      : tasa.ppm / 1_000_000
    : null

  let saldoRestante = monto
  let interesTotal = 0
  const listaCuotas: DesgloseCuotas['cuotas'] = []

  for (let k = 1; k <= n; k++) {
    const capital = capitalBase + (k <= residuo ? 1 : 0)
    const fechaVencimiento = construirFechaMes(pago1.anio, pago1.mes + (k - 1), diaPago)
    let interes: number | null = null
    if (tasaMensualDecimal !== null) {
      interes = redondearMitadArriba(saldoRestante * tasaMensualDecimal)
      interesTotal += interes
    }
    saldoRestante -= capital
    listaCuotas.push({
      numero: k,
      fechaVencimiento,
      capital,
      interes,
    })
  }

  return {
    consumoHoy: monto,
    cuotas: listaCuotas,
    interesTotal: tasaMensualDecimal !== null ? interesTotal : null,
    tasaMensualPct:
      tasaMensualDecimal !== null ? Number((tasaMensualDecimal * 100).toFixed(4)) : null,
  }
}

function normalizarFechaDian(cruda: string | undefined): string | null {
  if (!cruda) return null
  const limpio = cruda.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return limpio
  const compacta = /^(\d{4})(\d{2})(\d{2})$/.exec(limpio)
  if (compacta) return `${compacta[1]}-${compacta[2]}-${compacta[3]}`
  const slash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limpio)
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`
  return null
}

function parsearMontoDian(crudo: string | undefined): number | null {
  if (!crudo) return null
  const limpio = crudo.trim().replace(/[$\s]/g, '')
  if (!limpio) return null
  // Soporta `85000.40`, `85000`, `85.000,40` o `85,000.40`
  let normalizado = limpio
  if (/^\d+\.\d{1,2}$/.test(limpio)) {
    normalizado = limpio
  } else if (/^\d+,\d{1,2}$/.test(limpio)) {
    normalizado = limpio.replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(limpio)) {
    normalizado = limpio.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(limpio)) {
    normalizado = limpio.replace(/,/g, '')
  } else {
    normalizado = limpio.replace(/[^\d.]/g, '')
  }
  const valor = Number(normalizado)
  if (!Number.isFinite(valor) || valor < 0) return null
  return Math.round(valor)
}

function extraerCampoQr(texto: string, claves: string[]): string | undefined {
  for (const clave of claves) {
    const regex = new RegExp(`(?:^|[\\n\\r;|&\\s])${clave}\\s*[:=]\\s*([^\\n\\r;&]+)`, 'i')
    const match = regex.exec(texto)
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

/**
 * Parser local de QR DIAN (FEV 1.9 num. 11.7) para el controlador visual de respaldo.
 * Nunca consulta el portal de la DIAN y nunca conserva `DocAdq`.
 */
export function parsearQrDianVisual(
  textoCrudo: string,
  buscarAlias?: (nit: string) => { nombreComercio: string; categoriaId: string | null } | null,
): ResultadoEscaneo {
  const texto = textoCrudo.trim()
  if (!texto) {
    return {
      estado: 'invalido',
      mensaje: 'El código QR está vacío. Podés usar OCR del tiquete o ingresar manual.',
    }
  }

  // Extraer posible URL de catalogo-vpfe
  const matchUrl = /(https?:\/\/[^\s"'<>]+dian\.gov\.co[^\s"'<>]*)/i.exec(texto)
  const urlCruda = matchUrl?.[1] ?? null
  const urlVerificacion = esUrlDianValida(urlCruda) ? urlCruda : null

  let cufe = extraerCampoQr(texto, ['CUFE', 'CUDE', 'documentkey'])
  if (!cufe && urlCruda) {
    try {
      const parsed = new URL(urlCruda)
      cufe =
        parsed.searchParams.get('documentkey') ??
        parsed.searchParams.get('cufe') ??
        parsed.searchParams.get('CUFE') ??
        undefined
    } catch {
      // ignorar URL mal formada
    }
  }

  const nitComercio = extraerCampoQr(texto, ['NitFac', 'NIT']) ?? null
  const fecha = normalizarFechaDian(extraerCampoQr(texto, ['FecFac', 'Fecha']))
  const montoTotal = parsearMontoDian(extraerCampoQr(texto, ['ValTolFac', 'ValTotal', 'Total']))
  const iva = parsearMontoDian(extraerCampoQr(texto, ['ValIva', 'IVA']))

  if (cufe && (montoTotal !== null || nitComercio || fecha)) {
    const factura: DatosFactura = {
      origen: 'qr',
      cufe,
      nitComercio,
      fecha,
      montoTotal,
      iva,
      urlVerificacion,
    }
    const sugerencia = nitComercio && buscarAlias ? buscarAlias(nitComercio) : null
    return {
      estado: 'precargado',
      formato: 'campos',
      factura,
      sugerencia,
    }
  }

  if (cufe && (urlVerificacion || /catalogo-vpfe/i.test(texto))) {
    const factura: DatosFactura = {
      origen: 'qr',
      cufe,
      nitComercio: null,
      fecha: null,
      montoTotal: null,
      iva: null,
      urlVerificacion,
    }
    return {
      estado: 'precargado',
      formato: 'url',
      factura,
      sugerencia: null,
    }
  }

  return {
    estado: 'invalido',
    mensaje:
      'No reconocimos un QR de factura DIAN válido. Usá "Tomar foto (OCR)" o "Ingresar manual".',
  }
}
