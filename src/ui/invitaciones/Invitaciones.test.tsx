// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Hogar, Servicios, Sesion } from '../../app/fundacion'
import type { InvitacionActiva, InvitacionesPort } from '../../app/invitaciones'
import { RutasFundacion } from '../RutasFundacion'

const raices: Root[] = []

function hogarDePrueba(rol: 'admin' | 'miembro' = 'admin', conMiembroSinCuenta = false): Hogar {
  const ana = { id: 'm-ana', nombre: 'Ana', rol, activo: true, tieneCuenta: true }
  const beto = { id: 'm-beto', nombre: 'Beto', rol: 'miembro' as const, activo: true, tieneCuenta: false }
  return {
    id: 'h-1',
    nombre: 'Casa de Ana',
    miembroActual: ana,
    miembros: conMiembroSinCuenta ? [ana, beto] : [ana],
  }
}

function montarApp(ruta: string, servicios: Servicios) {
  const contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
  const raiz = createRoot(contenedor)
  raices.push(raiz)
  act(() => {
    raiz.render(
      <MemoryRouter initialEntries={[ruta]}>
        <RutasFundacion servicios={servicios} />
      </MemoryRouter>,
    )
  })
  return { contenedor }
}

const esperar = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

function escribir(el: HTMLInputElement | HTMLSelectElement, valor: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  act(() => {
    setter?.call(el, valor)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

afterEach(() => {
  for (const r of raices.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
  sessionStorage.clear()
})

describe('UI Invitación de miembros', () => {
  it('muestra tarjeta cálida en /hogar para admin, crea postal compartible y revoca invitación', async () => {
    const activas: InvitacionActiva[] = []
    const port: InvitacionesPort = {
      crear: vi.fn(async (entrada) => {
        const inv = {
          invitacionId: 'inv-1',
          token: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
          expiraEn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          hogarNombre: 'Casa de Ana',
          miembroObjetivoId: entrada?.miembroObjetivoId ?? null,
          nota: entrada?.nota ?? null,
        }
        activas.unshift({
          id: inv.invitacionId,
          nota: inv.nota,
          miembroObjetivoId: inv.miembroObjetivoId,
          miembroObjetivoNombre: null,
          creadaEn: new Date().toISOString(),
          expiraEn: inv.expiraEn,
        })
        return inv
      }),
      listar: vi.fn(async () => [...activas]),
      revocar: vi.fn(async () => {
        activas.length = 0
        return { revocada: true }
      }),
      canjear: vi.fn(),
    }

    const hogar = hogarDePrueba('admin', false)
    const { contenedor } = montarApp('/hogar', {
      auth: {
        observarSesion: (cb) => {
          cb({ usuarioId: 'u-ana' })
          return () => {}
        },
        pedirCodigo: vi.fn(),
        verificarCodigo: vi.fn(),
        salir: vi.fn(),
      },
      hogares: {
        cargar: vi.fn(async () => hogar),
        crear: vi.fn(),
      },
      invitaciones: port,
    })
    await esperar()

    expect(contenedor.textContent).toContain('¿Te está gustando usar hogar-app?')
    expect(contenedor.textContent).not.toMatch(/urgente|obligatorio/i)

    const btnAbrir = Array.from(contenedor.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Invitar a alguien'),
    )
    expect(btnAbrir).toBeTruthy()
    await act(async () => {
      btnAbrir!.click()
    })

    escribir(contenedor.querySelector('#inv-nota') as HTMLInputElement, 'Para Beto')
    const btnCrear = Array.from(contenedor.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Crear enlace de invitación'),
    )
    await act(async () => {
      btnCrear!.click()
    })
    await esperar()

    expect(contenedor.textContent).toContain('AbCdEfGhIjKlMnOpQrStUvWxYz012345')
    expect(contenedor.textContent).toContain('Copiar mensaje')
    expect(contenedor.textContent).toContain('Copiar enlace')

    const btnCancelar = Array.from(contenedor.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancelar invitación'),
    )
    await act(async () => {
      btnCancelar!.click()
    })
    await esperar()
    expect(port.revocar).toHaveBeenCalledWith('inv-1')
  })

  it('oculta tarjeta de invitación si el usuario conectado no es administrador', async () => {
    const port: InvitacionesPort = {
      crear: vi.fn(),
      listar: vi.fn(async () => []),
      revocar: vi.fn(),
      canjear: vi.fn(),
    }
    const { contenedor } = montarApp('/hogar', {
      auth: {
        observarSesion: (cb) => {
          cb({ usuarioId: 'u-beto' })
          return () => {}
        },
        pedirCodigo: vi.fn(),
        verificarCodigo: vi.fn(),
        salir: vi.fn(),
      },
      hogares: {
        cargar: vi.fn(async () => hogarDePrueba('miembro')),
        crear: vi.fn(),
      },
      invitaciones: port,
    })
    await esperar()

    expect(contenedor.textContent).not.toContain('¿Te está gustando usar hogar-app?')
  })

  it('conserva token en /unirme durante OTP y canjea para entrar al hogar', async () => {
    let sesionActual: Sesion | null = null
    let notificar: (s: Sesion | null) => void = () => {}
    let canjeado = false

    const port: InvitacionesPort = {
      crear: vi.fn(),
      listar: vi.fn(async () => []),
      revocar: vi.fn(),
      canjear: vi.fn(async ({ token }) => {
        canjeado = true
        return { hogarId: 'h-1', miembroId: 'm-beto', hogarNombre: `Casa ${token.slice(0, 4)}` }
      }),
    }

    const { contenedor } = montarApp('/unirme?token=AbCdEfGhIjKlMnOpQrStUvWxYz012345', {
      auth: {
        observarSesion: (cb) => {
          notificar = cb
          cb(sesionActual)
          return () => {}
        },
        pedirCodigo: vi.fn(),
        verificarCodigo: vi.fn(),
        salir: vi.fn(),
      },
      hogares: {
        cargar: vi.fn(async () => (canjeado ? hogarDePrueba('miembro') : null)),
        crear: vi.fn(),
      },
      invitaciones: port,
    })

    // Sin sesión: redirige a /ingresar con aviso cálido de invitación pendiente
    expect(contenedor.textContent).toContain('Tienes una invitación pendiente')

    // Usuario inicia sesión sin hogar -> va a /unirme y canjea con su nombre
    await act(async () => {
      sesionActual = { usuarioId: 'u-beto' }
      notificar(sesionActual)
    })
    await esperar()

    expect(contenedor.textContent).toContain('Te invitaron a sumarte a un hogar')
    escribir(contenedor.querySelector('#unirme-nombre') as HTMLInputElement, 'Beto')
    await act(async () => {
      contenedor.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await esperar()

    expect(port.canjear).toHaveBeenCalledWith({
      token: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
      nombreMiembro: 'Beto',
    })
    expect(contenedor.textContent).toContain('Compra rápida')
  })
})
