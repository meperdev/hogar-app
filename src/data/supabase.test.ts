import { describe, expect, it } from 'vitest'
import { conectarSupabase } from './supabase'

const CLAVE_PUBLICA = 'sb_publishable_prueba'

describe('conectarSupabase', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'https://proyecto.supabase.co',
  ])('acepta la URL %s', (url) => {
    expect(conectarSupabase(url, CLAVE_PUBLICA)).not.toBeNull()
  })

  it.each(['', 'ftp://127.0.0.1:54321', 'no es una url', undefined])(
    'rechaza la URL %s',
    (url) => {
      expect(conectarSupabase(url, CLAVE_PUBLICA)).toBeNull()
    },
  )

  it('rechaza una clave secreta o vacía', () => {
    expect(conectarSupabase('http://127.0.0.1:54321', 'sb_secret_x')).toBeNull()
    expect(conectarSupabase('http://127.0.0.1:54321', '  ')).toBeNull()
  })

  it('conecta el controlador de compra rápida por actor', () => {
    const servicios = conectarSupabase('http://127.0.0.1:54321', CLAVE_PUBLICA)

    expect(typeof servicios?.compras).toBe('function')
  })

  it('conecta el controlador de obligaciones por actor', () => {
    const servicios = conectarSupabase('http://127.0.0.1:54321', CLAVE_PUBLICA)

    expect(typeof servicios?.obligaciones).toBe('function')
  })

  it('conecta el controlador de balance por actor', () => {
    const servicios = conectarSupabase('http://127.0.0.1:54321', CLAVE_PUBLICA)

    expect(typeof servicios?.balance).toBe('function')
  })

  it('conecta el controlador de despensa de mascotas por actor', () => {
    const servicios = conectarSupabase('http://127.0.0.1:54321', CLAVE_PUBLICA)

    expect(typeof servicios?.mascotas).toBe('function')
  })

  it('conecta el puerto de invitaciones de miembros', () => {
    const servicios = conectarSupabase('http://127.0.0.1:54321', CLAVE_PUBLICA)

    expect(servicios?.invitaciones).toBeDefined()
  })

  it('conecta el puerto de medios de pago', () => {
    const servicios = conectarSupabase('http://127.0.0.1:54321', CLAVE_PUBLICA)

    expect(servicios?.mediosDePago).toBeDefined()
  })
})
