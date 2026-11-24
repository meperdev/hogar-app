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
