import { afterEach, describe, expect, it } from 'vitest'
import {
  guardarTokenInvitacionPendiente,
  leerTokenInvitacionPendiente,
  limpiarTokenInvitacionPendiente,
} from './invitaciones'

function crearAlmacen() {
  const mapa = new Map<string, string>()
  return {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mapa.set(k, v)
    },
    removeItem: (k: string) => {
      mapa.delete(k)
    },
  }
}

afterEach(() => {
  limpiarTokenInvitacionPendiente(crearAlmacen())
})

describe('almacenamiento temporal de token pendiente', () => {
  it('guarda, lee y limpia un token válido de invitación en sessionStorage', () => {
    const store = crearAlmacen()
    const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'

    guardarTokenInvitacionPendiente(token, store)
    expect(leerTokenInvitacionPendiente(store)).toBe(token)

    limpiarTokenInvitacionPendiente(store)
    expect(leerTokenInvitacionPendiente(store)).toBeNull()
  })

  it('ignora tokens inválidos al guardar', () => {
    const store = crearAlmacen()
    guardarTokenInvitacionPendiente('invalido', store)
    expect(leerTokenInvitacionPendiente(store)).toBeNull()
  })
})
