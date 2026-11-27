// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hogar, Servicios, Sesion } from '../app/fundacion'
import { RutasFundacion } from './RutasFundacion'

const raices: Root[] = []

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(async () => {
  await act(async () => {
    for (const raiz of raices.splice(0)) {
      raiz.unmount()
    }
  })
  document.body.innerHTML = ''
})

async function montar(servicios: Servicios, rutaInicial = '/') {
  const contenedor = document.createElement('div')
  document.body.append(contenedor)
  const raiz = createRoot(contenedor)
  raices.push(raiz)
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={[rutaInicial]}>
        <RutasFundacion servicios={servicios} />
      </MemoryRouter>,
    )
  })
  return { contenedor, raiz }
}

function escribirCampo(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function hogarEjemplo(rolActual: 'admin' | 'miembro' = 'admin'): Hogar {
  const ana = { id: 'ana', nombre: 'Ana', rol: rolActual, activo: true }
  const beto = { id: 'beto', nombre: 'Beto', rol: 'miembro' as const, activo: false }
  return {
    id: 'casa',
    nombre: 'Casa de Ana',
    miembroActual: ana,
    miembros: [ana, beto],
  }
}

function crearServiciosBase(overrides?: {
  cargar?: Servicios['hogares']['cargar']
  crear?: Servicios['hogares']['crear']
  pedirCodigo?: Servicios['auth']['pedirCodigo']
  verificarCodigo?: Servicios['auth']['verificarCodigo']
}) {
  let notificar: (sesion: Sesion | null) => void = () => {}
  const dejarDeObservar = vi.fn()
  const servicios: Servicios = {
    auth: {
      observarSesion(observar) {
        notificar = observar
        return dejarDeObservar
      },
      pedirCodigo: overrides?.pedirCodigo ?? vi.fn(async () => {}),
      verificarCodigo: overrides?.verificarCodigo ?? vi.fn(async () => {}),
      salir: vi.fn(async () => notificar(null)),
    },
    hogares: {
      cargar:
        overrides?.cargar ??
        vi.fn(async () => {
          const admin = { id: 'admin', nombre: 'Ana', rol: 'admin' as const, activo: true }
          return { id: 'casa', nombre: 'Casa de Ana', miembroActual: admin, miembros: [admin] }
        }),
      crear: overrides?.crear ?? vi.fn(async () => ({ hogarId: 'casa', miembroId: 'admin' })),
    },
  }
  return {
    servicios,
    notificar: (sesion: Sesion | null) => notificar(sesion),
    dejarDeObservar,
  }
}

it('espera la sesión antes de mostrar contenido y limpia el hogar al salir', async () => {
  let notificar: (sesion: Sesion | null) => void = () => {}
  const dejarDeObservar = vi.fn()
  const servicios: Servicios = {
    auth: {
      observarSesion(observar) {
        notificar = observar
        return dejarDeObservar
      },
      pedirCodigo: vi.fn(),
      verificarCodigo: vi.fn(),
      salir: vi.fn(async () => notificar(null)),
    },
    hogares: {
      cargar: vi.fn(async () => {
        const admin = { id: 'admin', nombre: 'Ana', rol: 'admin' as const, activo: true }
        return { id: 'casa', nombre: 'Casa de Ana', miembroActual: admin, miembros: [admin] }
      }),
      crear: vi.fn(),
    },
  }
    const contenedor = document.createElement('div')
    document.body.append(contenedor)
    const raiz = createRoot(contenedor)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    try {
      await act(async () =>
        raiz.render(
          <MemoryRouter initialEntries={['/hogar']}>
            <RutasFundacion servicios={servicios} />
          </MemoryRouter>,
        ),
      )
      expect(contenedor.textContent).toContain('Restaurando sesión')
      expect(contenedor.querySelector('form')).toBeNull()
      expect(servicios.hogares.cargar).not.toHaveBeenCalled()

      await act(async () => notificar({ usuarioId: 'ana' }))
      expect(servicios.hogares.cargar).toHaveBeenCalledExactlyOnceWith({ usuarioId: 'ana' })
      expect(contenedor.querySelector('h1')?.textContent).toBe('Casa de Ana')
      const salir = [...contenedor.querySelectorAll('button')].find(
        (boton) => boton.textContent === 'Cerrar sesión',
      )
      expect(salir).toBeDefined()
      await act(async () => salir?.click())
      expect(servicios.auth.salir).toHaveBeenCalledOnce()
      expect(contenedor.textContent).not.toContain('Casa de Ana')
      expect(contenedor.querySelector('h1')?.textContent).toBe('Ingresa a hogar-app')
    } finally {
      await act(async () => raiz.unmount())
      contenedor.remove()
      vi.unstubAllGlobals()
    }
    expect(dejarDeObservar).toHaveBeenCalledOnce()
  })

describe('Flujo de ingreso OTP', () => {
  it('valida correo, envía código, verifica conservando cero inicial y permite cambiar correo', async () => {
    const { servicios, notificar } = crearServiciosBase()
    const { contenedor } = await montar(servicios)
    await act(async () => notificar(null))

    expect(contenedor.querySelector('h1')?.textContent).toBe('Ingresa a hogar-app')
    expect(contenedor.querySelector('main#contenido')?.getAttribute('tabindex')).toBe('-1')
    const inputCorreo = contenedor.querySelector<HTMLInputElement>('#ingreso-correo')
    expect(inputCorreo).not.toBeNull()
    expect(contenedor.querySelector('label[for="ingreso-correo"]')).not.toBeNull()

    await act(async () => {
      if (inputCorreo) escribirCampo(inputCorreo, 'sin-arroba')
    })
    await act(async () => {
      contenedor.querySelector('form')?.requestSubmit()
    })
    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain(
      'Ingresa un correo válido.',
    )
    expect(servicios.auth.pedirCodigo).not.toHaveBeenCalled()

    await act(async () => {
      if (inputCorreo) escribirCampo(inputCorreo, '  ana@example.test  ')
    })
    await act(async () => {
      contenedor.querySelector('form')?.requestSubmit()
    })
    expect(servicios.auth.pedirCodigo).toHaveBeenCalledExactlyOnceWith('ana@example.test')
    expect(contenedor.textContent).toContain('Ingresa el código que enviamos a ana@example.test.')

    const inputCodigo = contenedor.querySelector<HTMLInputElement>('#ingreso-codigo')
    expect(inputCodigo).not.toBeNull()
    expect(contenedor.querySelector('label[for="ingreso-codigo"]')).not.toBeNull()

    await act(async () => {
      if (inputCodigo) escribirCampo(inputCodigo, '012345')
    })
    await act(async () => {
      contenedor.querySelector('form')?.requestSubmit()
    })
    expect(servicios.auth.verificarCodigo).toHaveBeenCalledExactlyOnceWith(
      'ana@example.test',
      '012345',
    )

    const volverCorreo = [...contenedor.querySelectorAll('button')].find(
      (boton) => boton.textContent === 'Cambiar correo o pedir otro código',
    )
    expect(volverCorreo).toBeDefined()
    await act(async () => volverCorreo?.click())
    expect(contenedor.querySelector('#ingreso-correo')).not.toBeNull()
  })
})

describe('Alta de hogar y recuperación de errores', () => {
  it('redirige a crear hogar cuando no existe uno, valida nombres y recarga al crear', async () => {
    const cargar = vi
      .fn<Servicios['hogares']['cargar']>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(hogarEjemplo())
    const { servicios, notificar } = crearServiciosBase({ cargar })
    const { contenedor } = await montar(servicios)
    await act(async () => notificar({ usuarioId: 'ana' }))

    expect(contenedor.querySelector('h1')?.textContent).toBe('Crea tu hogar')
    expect(contenedor.querySelector('label[for="hogar-nombre"]')).not.toBeNull()
    expect(contenedor.querySelector('label[for="hogar-miembro"]')).not.toBeNull()

    await act(async () => {
      contenedor.querySelector('form')?.requestSubmit()
    })
    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain(
      'Ingresa el nombre del hogar y tu nombre.',
    )
    expect(servicios.hogares.crear).not.toHaveBeenCalled()

    const inputNombre = contenedor.querySelector<HTMLInputElement>('#hogar-nombre')
    const inputMiembro = contenedor.querySelector<HTMLInputElement>('#hogar-miembro')
    await act(async () => {
      if (inputNombre) escribirCampo(inputNombre, ' Casa de Ana ')
      if (inputMiembro) escribirCampo(inputMiembro, ' Ana ')
    })
    await act(async () => {
      contenedor.querySelector('form')?.requestSubmit()
    })

    expect(servicios.hogares.crear).toHaveBeenCalledExactlyOnceWith({
      nombre: 'Casa de Ana',
      nombreMiembro: 'Ana',
    })
    expect(cargar).toHaveBeenCalledTimes(2)
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')
  })

  it('muestra estado de error al cargar el hogar y permite reintentar', async () => {
    const cargar = vi
      .fn<Servicios['hogares']['cargar']>()
      .mockRejectedValueOnce(new Error('fallo de red'))
      .mockResolvedValueOnce(hogarEjemplo())
    const { servicios, notificar } = crearServiciosBase({ cargar })
    const { contenedor } = await montar(servicios)
    await act(async () => notificar({ usuarioId: 'ana' }))

    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos cargar el hogar.',
    )
    const reintentar = [...contenedor.querySelectorAll('button')].find(
      (boton) => boton.textContent === 'Reintentar',
    )
    expect(reintentar).toBeDefined()
    await act(async () => reintentar?.click())
    expect(cargar).toHaveBeenCalledTimes(2)
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')
  })
})

describe('Shell autenticado, navegación e invitaciones', () => {
  it('abre Compra rápida por defecto al iniciar sesión y navega entre los 4 núcleos y /hogar', async () => {
    const { servicios, notificar } = crearServiciosBase({
      cargar: vi.fn(async () => hogarEjemplo('admin')),
    })
    const { contenedor } = await montar(servicios)
    await act(async () => notificar({ usuarioId: 'ana' }))

    expect(contenedor.querySelectorAll('h1')).toHaveLength(1)
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')
    const linkCompraActivo = [...contenedor.querySelectorAll<HTMLAnchorElement>('nav a')].find(
      (enlace) => enlace.getAttribute('aria-current') === 'page',
    )
    expect(linkCompraActivo?.textContent?.trim()).toBe('Compra')

    const casos: Array<[string, string]> = [
      ['Compra', 'Compra rápida'],
      ['Gastos', 'Gastos generales'],
      ['Obligaciones', 'Obligaciones del mes'],
      ['Balance', 'Balance de pareja'],
      ['Mascotas', 'Despensa de mascotas'],
    ]

    for (const [etiqueta, tituloEsperado] of casos) {
      const link = [...contenedor.querySelectorAll<HTMLAnchorElement>('nav a')].find(
        (enlace) => enlace.textContent?.trim() === etiqueta,
      )
      expect(link).toBeDefined()
      await act(async () => {
        link?.click()
      })
      expect(contenedor.querySelector('h1')?.textContent).toBe(tituloEsperado)
      const linkActivo = [...contenedor.querySelectorAll<HTMLAnchorElement>('nav a')].find(
        (enlace) => enlace.getAttribute('aria-current') === 'page',
      )
      expect(linkActivo?.textContent?.trim()).toBe(etiqueta)
    }

    const linkBalance = [...contenedor.querySelectorAll<HTMLAnchorElement>('nav a')].find(
      (enlace) => enlace.textContent?.trim() === 'Balance',
    )
    await act(async () => {
      linkBalance?.click()
    })
    const linkAjustes = [...contenedor.querySelectorAll<HTMLAnchorElement>('a')].find(
      (enlace) => enlace.textContent?.trim() === 'Ajustes',
    )
    expect(linkAjustes).toBeDefined()
    await act(async () => {
      linkAjustes?.click()
    })
    expect(contenedor.querySelector('h1')?.textContent).toBe('Ajustes y exportación')

    const linkVolver = contenedor.querySelector<HTMLAnchorElement>(
      'a[aria-label="Volver a Casa de Ana"]',
    )
    expect(linkVolver).not.toBeNull()
    await act(async () => {
      linkVolver?.click()
    })
    expect(contenedor.querySelector('h1')?.textContent).toBe('Casa de Ana')
    expect(contenedor.textContent).toContain('Ana — Administrador (tú)')
    expect(contenedor.textContent).toContain('Beto — Miembro · Inactivo')
    expect(contenedor.textContent).toContain(
      'La invitación a nuevos miembros todavía no está disponible.',
    )
  })

  it('oculta el aviso de invitación cuando el miembro no es administrador', async () => {
    const { servicios, notificar } = crearServiciosBase({
      cargar: vi.fn(async () => hogarEjemplo('miembro')),
    })
    const { contenedor } = await montar(servicios, '/hogar')
    await act(async () => notificar({ usuarioId: 'ana' }))

    expect(contenedor.querySelector('h1')?.textContent).toBe('Casa de Ana')
    expect(contenedor.textContent).not.toContain(
      'La invitación a nuevos miembros todavía no está disponible.',
    )
  })

  it('muestra acceso directo al perfil/hogar desde Compra y permite agregar medios de pago', async () => {
    const listar = vi.fn(async () => [
      {
        id: 'mp-1',
        nombre: 'Efectivo (Ana)',
        tipo: 'efectivo' as const,
        ownerTipo: 'miembro' as const,
        ownerMiembroId: 'ana-id',
        activo: true,
      },
    ])
    const crear = vi.fn(async (entrada: { nombre: string; tipo: 'efectivo' | 'cuenta'; ownerTipo: 'miembro' | 'hogar' }) => ({
      id: 'mp-2',
      nombre: entrada.nombre.trim(),
      tipo: entrada.tipo,
      ownerTipo: entrada.ownerTipo,
      ownerMiembroId: entrada.ownerTipo === 'miembro' ? 'ana-id' : null,
      activo: true,
    }))
    const { servicios, notificar } = crearServiciosBase({
      cargar: vi.fn(async () => hogarEjemplo('admin')),
    })
    servicios.mediosDePago = {
      listar,
      crear,
      cambiarActivo: vi.fn(async (id, activo) => ({ id, activo })),
    }

    const { contenedor } = await montar(servicios)
    await act(async () => notificar({ usuarioId: 'ana' }))

    const linkPerfil = contenedor.querySelector<HTMLAnchorElement>(
      'a[aria-label="Mi perfil, hogar y cerrar sesión"]',
    )
    expect(linkPerfil).not.toBeNull()
    await act(async () => {
      linkPerfil?.click()
    })
    expect(contenedor.querySelector('h1')?.textContent).toBe('Casa de Ana')
    expect(contenedor.textContent).toContain('Medios de pago (contado)')
    expect(contenedor.textContent).toContain('Efectivo (Ana)')

    const botonAgregar = [...contenedor.querySelectorAll('button')].find(
      (b) => b.textContent === '+ Agregar medio',
    )
    expect(botonAgregar).toBeDefined()
    await act(async () => {
      botonAgregar?.click()
    })

    const inputNombre = contenedor.querySelector<HTMLInputElement>('#medio-nuevo-nombre')
    expect(inputNombre).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(inputNombre, 'Nequi Ana')
      inputNombre?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const form = inputNombre?.closest('form')
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(crear).toHaveBeenCalledWith({ nombre: 'Nequi Ana', tipo: 'cuenta', ownerTipo: 'miembro' })
    expect(contenedor.textContent).toContain('Nequi Ana')
  })
})
