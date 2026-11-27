const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

function partirPeriodo(periodo: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo)
  if (!m) return null
  const mes = Number(m[2])
  return mes >= 1 && mes <= 12 ? { anio: Number(m[1]), mes } : null
}

export function formatearPeriodoEs(periodo: string): string {
  const p = partirPeriodo(periodo)
  if (!p) return periodo
  const nombre = MESES[p.mes - 1] ?? ''
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${p.anio}`
}

export function nombreMesPeriodoEs(periodo: string): string {
  const p = partirPeriodo(periodo)
  return p ? (MESES[p.mes - 1] ?? periodo) : periodo
}

export function desplazarPeriodo(periodo: string, deltaMeses: number): string {
  const p = partirPeriodo(periodo)
  if (!p) return periodo
  const total = p.anio * 12 + (p.mes - 1) + deltaMeses
  const anio = Math.floor(total / 12)
  return `${String(anio).padStart(4, '0')}-${String(total - anio * 12 + 1).padStart(2, '0')}`
}
