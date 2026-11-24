const MONTO_MAXIMO_COP = 999_999_999_999
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const

/** Extrae dígitos de un input COP y devuelve un entero seguro. */
export function parsearDigitosCop(texto: string): number {
  const digitos = texto.replace(/\D+/g, '')
  if (!digitos) return 0
  const n = Number(digitos)
  return Number.isSafeInteger(n) && n >= 0 ? Math.min(n, MONTO_MAXIMO_COP) : MONTO_MAXIMO_COP
}

/** Aplica una tecla del teclado numérico COP (`0`-`9`, `000`, `borrar`). */
export function aplicarTeclaCop(montoActual: number, tecla: string): number {
  const base = Number.isSafeInteger(montoActual) && montoActual > 0 ? montoActual : 0
  if (tecla === 'borrar') return Math.floor(base / 10)
  if (tecla === '000') return base === 0 ? 0 : Math.min(base * 1000, MONTO_MAXIMO_COP)
  if (/^[0-9]$/.test(tecla)) return Math.min(base * 10 + Number(tecla), MONTO_MAXIMO_COP)
  return base
}

function partirFecha(fechaIso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso)
  if (!m) return null
  const mes = Number(m[2])
  const dia = Number(m[3])
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 ? { anio: Number(m[1]), mes, dia } : null
}

/** Formatea `2026-11-22` como `22 nov` o `22 nov 2026`. */
export function formatearFechaCortaEs(fechaIso: string, incluirAnio = false): string {
  const p = partirFecha(fechaIso)
  if (!p) return fechaIso
  const mes = MESES_CORTOS[p.mes - 1] ?? ''
  return incluirAnio ? `${p.dia} ${mes} ${p.anio}` : `${p.dia} ${mes}`
}

/** Nombre del mes en español en minúsculas para una fecha civil. */
export function nombreMesEs(fechaIso: string): string {
  const p = partirFecha(fechaIso)
  return p ? (MESES_LARGOS[p.mes - 1] ?? '') : ''
}

/** Porcentaje con coma decimal (`28,32 %`). */
export function formatearPorcentajeEs(valor: number, decimales = 2): string {
  return `${valor.toFixed(decimales).replace('.', ',')} %`
}

/** Trunca un CUFE largo para vista móvil sin perder sus extremos. */
export function truncarCufe(cufe: string): string {
  const limpio = cufe.trim()
  return limpio.length <= 18 ? limpio : `${limpio.slice(0, 8)}…${limpio.slice(-8)}`
}
