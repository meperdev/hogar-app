import { hoyCivil } from './fechas'
import { diasEntreFechas } from './mascotas'

const PATRON_TOKEN = /^[A-Za-z0-9_-]{16,128}$/

/**
 * Extrae el token de invitación desde una URL completa, ruta relativa (`/unirme?token=...`)
 * o código pegado directamente. Devuelve `null` si no cumple el formato seguro.
 */
export function extraerTokenInvitacion(entrada: string): string | null {
  const texto = entrada.trim()
  if (!texto) return null

  if (PATRON_TOKEN.test(texto)) return texto

  try {
    const url = texto.startsWith('http://') || texto.startsWith('https://')
      ? new URL(texto)
      : new URL(texto, 'https://hogar.local')
    const candidato = url.searchParams.get('token')?.trim() ?? ''
    return PATRON_TOKEN.test(candidato) ? candidato : null
  } catch {
    const match = /[?&]token=([A-Za-z0-9_-]{16,128})/.exec(texto)
    return match?.[1] ?? null
  }
}

export function construirEnlaceInvitacion(origen: string, token: string): string {
  const base = origen.replace(/\/+$/, '')
  return `${base}/unirme?token=${encodeURIComponent(token)}`
}

/**
 * Mensaje cálido, amigable y nada agresivo en español neutro listo para compartir
 * por WhatsApp, Telegram o correo.
 */
export function construirMensajeInvitacion({
  hogarNombre,
  enlace,
  nota,
}: {
  hogarNombre: string
  enlace: string
  nota?: string | null | undefined
}): string {
  const destino = nota?.trim() ? ` (${nota.trim()})` : ''
  return (
    `¡Hola! Estoy usando MeperHome para organizar los gastos de ${hogarNombre} `
    + `de forma clara y tranquila.${destino ? ` Esta invitación es${destino}.` : ''} `
    + `Si te gustaría sumarte y llevar el hogar juntos, entra con este enlace `
    + `(válido por 7 días): ${enlace}`
  )
}

export function textoVigenciaInvitacion(expiraEnIso: string, ahora: Date): string {
  const expiraMs = Date.parse(expiraEnIso)
  if (!Number.isFinite(expiraMs)) return 'Vence en 7 días'
  if (expiraMs <= ahora.getTime()) return 'Vencida'
  const dias = diasEntreFechas(hoyCivil(ahora), hoyCivil(new Date(expiraMs)))
  if (dias <= 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  return `Vence en ${dias} días`
}
