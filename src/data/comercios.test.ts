import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { ErrorComercio } from '../app/comercios'
import { crearComerciosSupabase } from './comercios'

const HOGAR_ID = '018f4a1e-0000-7000-8000-000000000001'
const CAT_ID = '018f4a1e-0000-7000-8000-0000000000c1'
const COMERCIO_ID = '018f4a1e-0000-7000-8000-000000000401'

describe('crearComerciosSupabase', () => {
  it('lista, crea, edita, archiva y reordena comercios frecuentes', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'crear_comercio_frecuente') {
        return {
          data: {
            id: COMERCIO_ID,
            nombre: 'Dollarcity',
            categoria_sugerida_id: CAT_ID,
            activo: true,
            orden: 1,
          },
          error: null,
        }
      }
      if (fn === 'editar_comercio_frecuente') {
        return {
          data: {
            id: COMERCIO_ID,
            nombre: 'Dollarcity Centro',
            categoria_sugerida_id: null,
            activo: true,
            orden: 1,
          },
          error: null,
        }
      }
      if (fn === 'archivar_comercio_frecuente') {
        return { data: { id: COMERCIO_ID, activo: false }, error: null }
      }
      return { data: { orden: [COMERCIO_ID] }, error: null }
    })

    const cliente = {
      from: (tabla: string) => {
        if (tabla === 'comercio_frecuente') {
          return {
            select: () => ({
              eq: () => ({
                is: async () => ({
                  data: [
                    {
                      id: COMERCIO_ID,
                      nombre: 'D1',
                      categoria_sugerida_id: CAT_ID,
                      activo: true,
                      orden: 0,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => ({
                  data: [{ id: CAT_ID, nombre: 'Mercado', icono: 'mercado', orden: 1 }],
                  error: null,
                }),
              }),
            }),
          }),
        }
      },
      rpc,
    } as unknown as SupabaseClient

    const puerto = crearComerciosSupabase(cliente)
    const datos = await puerto.listar(HOGAR_ID)
    expect(datos.comercios[0]?.nombre).toBe('D1')
    expect(datos.categorias[0]?.nombre).toBe('Mercado')

    const creado = await puerto.crear({ nombre: '  Dollarcity ', categoriaSugeridaId: CAT_ID })
    expect(creado.nombre).toBe('Dollarcity')
    expect(rpc).toHaveBeenCalledWith('crear_comercio_frecuente', {
      p_nombre: 'Dollarcity',
      p_categoria_sugerida_id: CAT_ID,
    })

    const editado = await puerto.editar({
      comercioId: COMERCIO_ID,
      nombre: 'Dollarcity Centro',
      categoriaSugeridaId: null,
    })
    expect(editado.nombre).toBe('Dollarcity Centro')

    const archivado = await puerto.cambiarActivo(COMERCIO_ID, false)
    expect(archivado).toEqual({ id: COMERCIO_ID, activo: false })

    await puerto.reordenar([COMERCIO_ID])
    expect(rpc).toHaveBeenCalledWith('reordenar_comercios_frecuentes', { p_ids: [COMERCIO_ID] })
  })

  it('mapea duplicado 23505 y permiso 42501 a ErrorComercio', async () => {
    const cliente = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: { code: '23505' } })
        .mockResolvedValueOnce({ data: null, error: { code: '42501' } }),
    } as unknown as SupabaseClient

    const puerto = crearComerciosSupabase(cliente)
    await expect(
      puerto.crear({ nombre: 'D1', categoriaSugeridaId: null }),
    ).rejects.toThrow(ErrorComercio)
    await expect(puerto.cambiarActivo(COMERCIO_ID, false)).rejects.toThrow(ErrorComercio)
  })
})
