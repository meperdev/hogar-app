import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { ErrorMedioDePago } from '../app/mediosDePago'
import { crearMediosDePagoSupabase } from './mediosDePago'

const HOGAR_ID = '018f4a1e-0000-7000-8000-000000000001'
const MIEMBRO_ID = '018f4a1e-0000-7000-8000-0000000000a1'
const MEDIO_ID = '018f4a1e-0000-7000-8000-000000000301'

describe('crearMediosDePagoSupabase', () => {
  it('lista, crea, archiva y reordena medios de pago mediante Supabase', async () => {
    const orderPorNombre = vi.fn(async () => ({
      data: [
        {
          id: MEDIO_ID,
          nombre: 'Nequi',
          tipo: 'cuenta',
          owner_tipo: 'miembro',
          owner_miembro_id: MIEMBRO_ID,
          activo: true,
          orden: 0,
        },
      ],
      error: null,
    }))
    const order = vi.fn(() => ({ order: orderPorNombre }))
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'crear_medio_de_pago') {
        return {
          data: {
            id: MEDIO_ID,
            nombre: 'Nequi',
            tipo: 'cuenta',
            owner_tipo: 'miembro',
            owner_miembro_id: MIEMBRO_ID,
            activo: true,
            orden: 1,
          },
          error: null,
        }
      }
      if (fn === 'reordenar_medios_de_pago') {
        return { data: { orden: [MEDIO_ID] }, error: null }
      }
      return { data: { id: MEDIO_ID, activo: false }, error: null }
    })

    const cliente = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({ order }),
          }),
        }),
      }),
      rpc,
    } as unknown as SupabaseClient

    const puerto = crearMediosDePagoSupabase(cliente)
    const lista = await puerto.listar(HOGAR_ID)
    expect(lista).toHaveLength(1)
    expect(lista[0]?.ownerTipo).toBe('miembro')
    expect(lista[0]?.orden).toBe(0)

    const creado = await puerto.crear({ nombre: '  Nequi ', tipo: 'cuenta', ownerTipo: 'miembro' })
    expect(creado.nombre).toBe('Nequi')
    expect(creado.orden).toBe(1)
    expect(rpc).toHaveBeenCalledWith('crear_medio_de_pago', {
      p_nombre: 'Nequi',
      p_tipo: 'cuenta',
      p_owner_tipo: 'miembro',
    })

    const archivado = await puerto.cambiarActivo(MEDIO_ID, false)
    expect(archivado).toEqual({ id: MEDIO_ID, activo: false })

    await puerto.reordenar([MEDIO_ID])
    expect(rpc).toHaveBeenCalledWith('reordenar_medios_de_pago', { p_ids: [MEDIO_ID] })
  })

  it('mapea duplicado 23505 y permiso 42501 a ErrorMedioDePago', async () => {
    const cliente = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: { code: '23505' } })
        .mockResolvedValueOnce({ data: null, error: { code: '42501' } }),
    } as unknown as SupabaseClient

    const puerto = crearMediosDePagoSupabase(cliente)
    await expect(
      puerto.crear({ nombre: 'Nequi', tipo: 'cuenta', ownerTipo: 'miembro' }),
    ).rejects.toThrow(ErrorMedioDePago)
    await expect(puerto.cambiarActivo(MEDIO_ID, false)).rejects.toThrow(ErrorMedioDePago)
  })
})
