import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { ErrorInvitacion } from '../app/invitaciones'
import { crearPuertoInvitaciones } from './invitaciones'

describe('crearPuertoInvitaciones', () => {
  it('llama las RPCs crear, listar, revocar y canjear validando la respuesta', async () => {
    const rpc = vi.fn(async (nombre: string) => {
      if (nombre === 'crear_invitacion') {
        return {
          data: {
            invitacion_id: '01950000-0000-7000-8000-000000000001',
            token: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
            expira_en: '2026-12-02T15:00:00.000Z',
            hogar_nombre: 'Casa de Ana',
            miembro_objetivo_id: null,
            nota: 'Para Beto',
          },
          error: null,
        }
      }
      if (nombre === 'listar_invitaciones') {
        return {
          data: [
            {
              id: '01950000-0000-7000-8000-000000000001',
              nota: 'Para Beto',
              miembro_objetivo_id: null,
              miembro_objetivo_nombre: null,
              creada_en: '2026-11-25T15:00:00.000Z',
              expira_en: '2026-12-02T15:00:00.000Z',
            },
          ],
          error: null,
        }
      }
      if (nombre === 'revocar_invitacion') {
        return { data: { revocada: true }, error: null }
      }
      return {
        data: {
          hogar_id: '01950000-0000-7000-8000-000000000010',
          miembro_id: '01950000-0000-7000-8000-000000000020',
          hogar_nombre: 'Casa de Ana',
        },
        error: null,
      }
    })

    const puerto = crearPuertoInvitaciones({ rpc } as unknown as SupabaseClient)

    const creada = await puerto.crear({ nota: 'Para Beto' })
    expect(creada.hogarNombre).toBe('Casa de Ana')
    expect(creada.token).toBe('AbCdEfGhIjKlMnOpQrStUvWxYz012345')

    const activas = await puerto.listar()
    expect(activas).toHaveLength(1)
    expect(activas[0]?.nota).toBe('Para Beto')

    const revocada = await puerto.revocar('01950000-0000-7000-8000-000000000001')
    expect(revocada.revocada).toBe(true)

    const canjeada = await puerto.canjear({
      token: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
      nombreMiembro: 'Beto',
    })
    expect(canjeada.hogarNombre).toBe('Casa de Ana')
  })

  it('mapea códigos SQL de permiso, hogar duplicado e invitación vencida a ErrorInvitacion', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'no admin' } })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'ya tiene hogar' } })
      .mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'invitación inválida' } })

    const puerto = crearPuertoInvitaciones({ rpc } as unknown as SupabaseClient)

    await expect(puerto.crear()).rejects.toThrow(ErrorInvitacion)
    await expect(
      puerto.canjear({ token: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345', nombreMiembro: 'Beto' }),
    ).rejects.toThrow(ErrorInvitacion)
    await expect(
      puerto.canjear({ token: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345', nombreMiembro: 'Beto' }),
    ).rejects.toThrow(ErrorInvitacion)
  })
})
