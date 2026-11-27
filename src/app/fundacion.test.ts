import { describe, expect, it, vi } from 'vitest'
import {
  crearHogar,
  estadoInvitacion,
  pedirCodigo,
  verificarCodigo,
} from './fundacion'

const nuevoHogar = { hogarId: 'hogar-nuevo', miembroId: 'primer-admin' }

function puertos() {
  return {
    pedirCodigo: vi.fn(async () => {}),
    verificarCodigo: vi.fn(async () => {}),
    observarSesion: vi.fn(() => () => {}),
    salir: vi.fn(async () => {}),
    crear: vi.fn(async () => nuevoHogar),
    cargar: vi.fn(async () => null),
  }
}

describe('ingreso por correo', () => {
  it('pide el código solo para un correo válido', async () => {
    const auth = puertos()
    await expect(pedirCodigo(auth, 'sin-arroba')).rejects.toThrow(
      'Ingresa un correo válido.',
    )
    expect(auth.pedirCodigo).not.toHaveBeenCalled()
    await pedirCodigo(auth, '  ana@example.test  ')
    expect(auth.pedirCodigo).toHaveBeenCalledExactlyOnceWith('ana@example.test')
  })

  it('verifica seis dígitos y conserva el cero inicial', async () => {
    const auth = puertos()
    await expect(verificarCodigo(auth, 'ana@example.test', '12345'))
      .rejects.toThrow('Ingresa el código de seis dígitos.')
    expect(auth.verificarCodigo).not.toHaveBeenCalled()
    await verificarCodigo(auth, 'ana@example.test', ' 012345 ')
    expect(auth.verificarCodigo).toHaveBeenCalledExactlyOnceWith(
      'ana@example.test', '012345',
    )
  })
})

describe('crear hogar', () => {
  it('no llama al servidor si falta algún nombre', async () => {
    const hogares = puertos()
    await expect(crearHogar(hogares, { nombre: ' ', nombreMiembro: 'Ana' }))
      .rejects.toThrow('Ingresa el nombre del hogar y tu nombre.')
    await expect(crearHogar(hogares, { nombre: 'Casa', nombreMiembro: '' }))
      .rejects.toThrow('Ingresa el nombre del hogar y tu nombre.')
    expect(hogares.crear).not.toHaveBeenCalled()
  })

  it('crea el hogar y su admin en una sola llamada', async () => {
    const hogares = puertos()
    const resultado = await crearHogar(hogares, {
      nombre: ' Casa ',
      nombreMiembro: ' Ana ',
    })
    expect(hogares.crear).toHaveBeenCalledExactlyOnceWith({
      nombre: 'Casa', nombreMiembro: 'Ana',
    })
    expect(resultado).toEqual(nuevoHogar)
  })
})

it('distingue falta de permiso de invitación aún no disponible', () => {
  expect(estadoInvitacion('miembro')).toBe('sin-permiso')
  expect(estadoInvitacion('admin')).toBe('pendiente')
})
