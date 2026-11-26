import { describe, expect, it } from 'vitest'
import {
  construirEnlaceInvitacion,
  construirMensajeInvitacion,
  extraerTokenInvitacion,
  textoVigenciaInvitacion,
} from './invitaciones'

describe('invitaciones de hogar', () => {
  it('extrae el token desde un enlace completo, ruta relativa o código directo', () => {
    const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
    expect(extraerTokenInvitacion(`https://hogar.app/unirme?token=${token}`)).toBe(token)
    expect(extraerTokenInvitacion(`  /unirme?token=${token}  `)).toBe(token)
    expect(extraerTokenInvitacion(`  ${token}  `)).toBe(token)
    expect(extraerTokenInvitacion('corto')).toBeNull()
    expect(extraerTokenInvitacion('https://hogar.app/unirme?otro=123')).toBeNull()
  })

  it('construye enlace limpio y mensaje cálido no agresivo en español neutro', () => {
    const enlace = construirEnlaceInvitacion('https://hogar.app/', 'AbCdEfGhIjKlMnOpQrStUvWxYz012345')
    expect(enlace).toBe('https://hogar.app/unirme?token=AbCdEfGhIjKlMnOpQrStUvWxYz012345')

    const msg = construirMensajeInvitacion({
      hogarNombre: 'Casa de Ana',
      enlace,
      nota: 'Para Beto',
    })
    expect(msg).toContain('Casa de Ana')
    expect(msg).toContain(enlace)
    expect(msg).toContain('Para Beto')
    expect(msg).not.toMatch(/deud|oblig|urge/i)
  })

  it('calcula texto legible de vigencia', () => {
    const ahora = new Date('2026-11-25T15:00:00.000Z')
    expect(textoVigenciaInvitacion('2026-12-02T15:00:00.000Z', ahora)).toBe('Vence en 7 días')
    expect(textoVigenciaInvitacion('2026-11-26T15:00:00.000Z', ahora)).toBe('Vence mañana')
    expect(textoVigenciaInvitacion('2026-11-25T20:00:00.000Z', ahora)).toBe('Vence hoy')
  })
})
