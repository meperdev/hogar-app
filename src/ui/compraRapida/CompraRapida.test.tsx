// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ControladorCompraRapida } from '../../app/compraRapida'
import type { Hogar, Servicios, Sesion } from '../../app/fundacion'
import { RutasFundacion } from '../RutasFundacion'
import { crearControladorFalsoCompraRapida } from './controladorFalso'

const raices: Root[] = []

function hogarDePrueba(): Hogar {
  const santiago = {
    id: '018f4a1e-0000-7000-8000-0000000000a1',
    nombre: 'Santiago',
    rol: 'admin' as const,
    activo: true,
  }
  return {
    id: '018f4a1e-0000-7000-8000-000000000001',
    nombre: 'Casa Santiago y Ana',
    miembroActual: santiago,
    miembros: [santiago],
  }
}

async function montarApp(opciones?: {
  rutaInicial?: string
  comprasFactory?: Servicios['compras']
}) {
  const hogar = hogarDePrueba()
  let notificar: (sesion: Sesion | null) => void = () => {}

  const servicios: Servicios = {
    auth: {
      observarSesion(observar) {
        notificar = observar
        return () => {}
      },
      pedirCodigo: vi.fn(async () => {}),
      verificarCodigo: vi.fn(async () => {}),
      salir: vi.fn(async () => notificar(null)),
    },
    hogares: {
      cargar: vi.fn(async () => hogar),
      crear: vi.fn(async () => ({ hogarId: hogar.id, miembroId: hogar.miembroActual.id })),
    },
    ...(opciones?.comprasFactory ? { compras: opciones.comprasFactory } : {}),
  }

  const contenedor = document.createElement('div')
  document.body.append(contenedor)
  const raiz = createRoot(contenedor)
  raices.push(raiz)

  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={[opciones?.rutaInicial ?? '/']}>
        <RutasFundacion servicios={servicios} />
      </MemoryRouter>,
    )
  })
  await act(async () => {
    notificar({ usuarioId: hogar.miembroActual.id })
  })
  // Esperar carga asíncrona de catálogo
  await act(async () => {
    await Promise.resolve()
  })

  return { contenedor, hogar }
}

function escribirInput(input: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function buscarBoton(contenedor: HTMLElement, texto: string): HTMLButtonElement | undefined {
  return [...contenedor.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === texto,
  )
}

function buscarTecla(contenedor: HTMLElement, texto: string): HTMLButtonElement | undefined {
  const teclado = contenedor.querySelector('[aria-label="Teclado numérico COP"]')
  if (!teclado) return undefined
  return [...teclado.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === texto,
  )
}

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

describe('Compra rápida UI (Núcleo 1)', () => {
  it('muestra la pantalla vacía cuando servicios.compras no está definido', async () => {
    const { contenedor } = await montarApp()

    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')
    expect(contenedor.textContent).toContain('Núcleo 1 · Próximo paso')
    expect(contenedor.querySelector('#monto-input')).toBeNull()
  })

  it('abre en Compra rápida por defecto y registra mercado $85.000 en 3 acciones con Deshacer', async () => {
    const hogar = hogarDePrueba()
    const base = crearControladorFalsoCompraRapida(hogar)
    const espiaGuardar = vi.spyOn(base, 'guardar')
    const espiaDeshacer = vi.spyOn(base, 'deshacer')

    const { contenedor } = await montarApp({
      comprasFactory: () => base,
    })

    // Pantalla por defecto y accesibilidad básica
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')
    expect(contenedor.querySelectorAll('h1')).toHaveLength(1)
    const navActivo = [...contenedor.querySelectorAll('nav a')].find(
      (a) => a.getAttribute('aria-current') === 'page',
    )
    expect(navActivo?.textContent?.trim()).toBe('Compra')

    // Ámbito Hogar activo por defecto
    const btnHogar = buscarBoton(contenedor, '✓ Hogar')
    expect(btnHogar?.getAttribute('aria-pressed')).toBe('true')

    // Acción 1: ingresar $85.000 con teclado numérico (8 -> 5 -> 000)
    await act(async () => buscarBoton(contenedor, '8')?.click())
    await act(async () => buscarBoton(contenedor, '5')?.click())
    await act(async () => buscarBoton(contenedor, '000')?.click())

    const montoInput = contenedor.querySelector<HTMLInputElement>('#monto-input')
    expect(montoInput?.value).toBe('$85.000')

    // Acción 2: elegir categoría Mercado
    await act(async () => buscarBoton(contenedor, 'Mercado')?.click())
    expect(buscarBoton(contenedor, '✓ Mercado')?.getAttribute('aria-pressed')).toBe('true')

    // Acción 3: guardar en barra fija visible (data-sin-scroll)
    const ctaGuardar = contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')
    expect(ctaGuardar?.textContent).toBe('Guardar $85.000')
    expect(ctaGuardar?.className).toContain('min-h-11')

    await act(async () => ctaGuardar?.click())

    expect(espiaGuardar).toHaveBeenCalledOnce()
    const [borradorEnviado] = espiaGuardar.mock.calls[0]!
    expect(borradorEnviado.ambito).toBe('hogar')
    expect(borradorEnviado.monto).toBe(85000)
    expect(borradorEnviado.cuotas).toBe(1)

    // Toast no bloqueante con botón Deshacer
    const status = contenedor.querySelector('[role="status"]')
    expect(status?.textContent).toContain('Guardado: Mercado $85.000')
    const btnDeshacer = buscarBoton(contenedor, 'Deshacer')
    expect(btnDeshacer).toBeDefined()

    await act(async () => btnDeshacer?.click())
    expect(espiaDeshacer).toHaveBeenCalledOnce()
    expect(contenedor.textContent).toContain('Compra deshecha.')
  })

  it('valida monto $0 con aria-disabled y foco, y falta de categoría enfocando primer chip', async () => {
    const { contenedor } = await montarApp({
      comprasFactory: () => crearControladorFalsoCompraRapida(hogarDePrueba()),
    })

    const cta = contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')
    expect(cta?.getAttribute('aria-disabled')).toBe('true')

    // Intentar guardar con monto $0
    await act(async () => cta?.click())
    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain(
      'Ingresa un monto mayor a $0',
    )
    expect(document.activeElement?.id).toBe('monto-input')

    // Ingresar monto sin categoría y guardar
    await act(async () => buscarBoton(contenedor, '5')?.click())
    await act(async () => buscarBoton(contenedor, '000')?.click())
    await act(async () => cta?.click())

    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain(
      'Elige una categoría para guardar',
    )
    expect(document.activeElement?.textContent).toContain('Mercado')
  })

  it('cambia a Personal mostrando etiqueta de privacidad y oculta cuotas al elegir préstamo en efectivo', async () => {
    const { contenedor } = await montarApp({
      comprasFactory: () => crearControladorFalsoCompraRapida(hogarDePrueba()),
    })

    // Cambiar a Personal
    await act(async () => buscarBoton(contenedor, 'Personal (solo yo)')?.click())
    expect(contenedor.textContent).toContain(
      'Solo visible para Santiago · Excluida del balance del hogar',
    )

    // Volver a Hogar y seleccionar préstamo en efectivo
    await act(async () => buscarBoton(contenedor, 'Hogar')?.click())
    expect(contenedor.querySelector('[aria-label^="Número de cuotas"]')).not.toBeNull()

    const selectPrestamo = contenedor.querySelector<HTMLSelectElement>('#prestamo-origen')
    expect(selectPrestamo).not.toBeNull()
    await act(async () => {
      if (selectPrestamo) {
        selectPrestamo.value = 'pasivo-prestamo-cocina'
        selectPrestamo.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    // Al elegir préstamo en efectivo desaparecen los chips de cuotas y aparece el aviso
    expect(contenedor.querySelector('[aria-label^="Número de cuotas"]')).toBeNull()
    expect(contenedor.textContent).toContain('Cuotas disponibles solo con tarjeta de crédito.')
    expect(contenedor.textContent).toContain('No crea otro plan de cuotas ni suma aporte hoy.')
  })

  it('pide confirmación inline cuando posibleDuplicado retorna true en < 60 s', async () => {
    const hogar = hogarDePrueba()
    const base = crearControladorFalsoCompraRapida(hogar)
    const controlador: ControladorCompraRapida = {
      ...base,
      posibleDuplicado: vi.fn(async () => true),
      guardar: vi.fn(base.guardar),
    }

    const { contenedor } = await montarApp({
      comprasFactory: () => controlador,
    })

    await act(async () => buscarBoton(contenedor, '8')?.click())
    await act(async () => buscarBoton(contenedor, '5')?.click())
    await act(async () => buscarBoton(contenedor, '000')?.click())
    await act(async () => buscarBoton(contenedor, 'Mercado')?.click())
    await act(async () =>
      contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click(),
    )

    expect(contenedor.textContent).toContain('Posible compra duplicada')
    expect(controlador.guardar).not.toHaveBeenCalled()

    await act(async () => buscarBoton(contenedor, 'Guardar de todas formas')?.click())
    expect(controlador.guardar).toHaveBeenCalledOnce()
  })

  it('navega a Compra a cuotas, muestra desglose sin doble conteo y permite Otro número de cuotas', async () => {
    const hogar = hogarDePrueba()
    const base = crearControladorFalsoCompraRapida(hogar)
    const espiaGuardar = vi.spyOn(base, 'guardar')

    const { contenedor } = await montarApp({
      comprasFactory: () => base,
    })

    await act(async () => buscarTecla(contenedor, '3')?.click())
    await act(async () => buscarTecla(contenedor, '0')?.click())
    await act(async () => buscarTecla(contenedor, '0')?.click())
    await act(async () => buscarTecla(contenedor, '000')?.click())
    await act(async () => buscarBoton(contenedor, 'Mercado')?.click())

    // Tocar chip 3 cuotas -> abre variante Compra a cuotas
    const chip3 = contenedor.querySelector<HTMLButtonElement>('button[aria-label="3 cuotas"]')
    await act(async () => chip3?.click())

    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra a cuotas')
    expect(contenedor.textContent).toContain('Cómo se registra (sin doble conteo)')
    expect(contenedor.textContent).toContain('3 × $100.000')
    expect(contenedor.textContent).toContain('$12.598')

    // Probar Otro número de cuotas (4)
    await act(async () =>
      contenedor.querySelector<HTMLButtonElement>('button[aria-label="Otro número de cuotas"]')?.click(),
    )
    const inputOtro = contenedor.querySelector<HTMLInputElement>('#cuotas-personalizadas')
    expect(inputOtro).not.toBeNull()
    await act(async () => {
      if (inputOtro) escribirInput(inputOtro, '4')
    })
    expect(contenedor.textContent).toContain('4 × $75.000')

    // Guardar en 4 cuotas vuelve a Compra rápida con toast y enlace Ver cuotas
    const ctaCuotas = contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')
    expect(ctaCuotas?.textContent).toBe('Guardar $300.000 en 4 cuotas')
    await act(async () => ctaCuotas?.click())

    expect(espiaGuardar).toHaveBeenCalledOnce()
    expect(espiaGuardar.mock.calls[0]![0].cuotas).toBe(4)
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')
    expect(contenedor.textContent).toContain('Ver cuotas')
  })

  it('cubre los estados de Escanear factura: Formato 1 con campos, Formato 2 solo URL y Duplicada', async () => {
    const hogar = hogarDePrueba()
    const base = crearControladorFalsoCompraRapida(hogar)
    const espiaGuardar = vi.spyOn(base, 'guardar')

    const { contenedor } = await montarApp({
      rutaInicial: '/compra/escanear',
      comprasFactory: () => base,
    })

    expect(contenedor.querySelector('h1')?.textContent).toBe('Escanear factura')
    expect(contenedor.textContent).toContain('Leyendo QR DIAN')

    const qrCampos = [
      'NumFac: FE99',
      'FecFac: 2026-11-22',
      'NitFac: 890900608',
      'ValIva: 13571',
      'ValTolFac: 85000',
      'CUFE: a8f39d2c710e92e1abcdef01',
      'URL: https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=a8f39d2c710e92e1abcdef01',
    ].join('\n')

    const textarea = contenedor.querySelector<HTMLTextAreaElement>('#qr-texto-manual')
    await act(async () => {
      if (textarea) escribirInput(textarea, qrCampos)
    })
    await act(async () => buscarBoton(contenedor, 'Leer contenido QR localmente')?.click())

    // Estado 2: Precargado con alias y categoría sugerida Mercado
    expect(contenedor.textContent).toContain('Precargado para confirmar')
    expect(contenedor.textContent).toContain('Almacenes Éxito')
    expect(contenedor.textContent).toContain('$13.571')
    expect(buscarBoton(contenedor, '✓ Mercado')?.getAttribute('aria-pressed')).toBe('true')

    const linkDian = [...contenedor.querySelectorAll<HTMLAnchorElement>('a')].find((a) =>
      a.textContent?.includes('Verificar en la DIAN'),
    )
    expect(linkDian?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(linkDian?.getAttribute('target')).toBe('_blank')

    // Guardar factura precargada
    const ctaFactura = contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')
    expect(ctaFactura?.textContent).toBe('Guardar factura ($85.000)')
    await act(async () => ctaFactura?.click())

    expect(espiaGuardar).toHaveBeenCalledOnce()
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')

    // Volver al escáner e intentar el mismo CUFE -> Estado 4: Factura duplicada
    const linkEscanear = contenedor.querySelector<HTMLAnchorElement>('a[href="/compra/escanear"]')
    await act(async () => linkEscanear?.click())
    const textarea2 = contenedor.querySelector<HTMLTextAreaElement>('#qr-texto-manual')
    await act(async () => {
      if (textarea2) escribirInput(textarea2, qrCampos)
    })
    await act(async () => buscarBoton(contenedor, 'Leer contenido QR localmente')?.click())

    expect(contenedor.textContent).toContain('Esta factura ya está registrada.')
    expect(contenedor.textContent).toContain('Privacidad en compras personales')

    // Volver a leer e ingresar Formato 2 solo URL -> Estado 3
    await act(async () => buscarBoton(contenedor, 'Escanear otra factura')?.click())
    const textarea3 = contenedor.querySelector<HTMLTextAreaElement>('#qr-texto-manual')
    await act(async () => {
      if (textarea3) {
        escribirInput(
          textarea3,
          'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=c4b18e09f21a90c1882a44a2',
        )
      }
    })
    await act(async () => buscarBoton(contenedor, 'Leer contenido QR localmente')?.click())

    expect(contenedor.textContent).toContain('QR solo con URL')
    expect(contenedor.textContent).toContain('Leer total y fecha con OCR del tiquete')
    expect(contenedor.querySelector<HTMLInputElement>('#url-cufe')?.value).toBe(
      'c4b18e09f21a90c1882a44a2',
    )
  })

  it('no muestra "Sin tasa configurada" cuando desglose retorna null por monto $0 y enfoca nota si falla descripcion', async () => {
    const hogar = hogarDePrueba()
    const base = crearControladorFalsoCompraRapida(hogar)
    const controlador: ControladorCompraRapida = {
      ...base,
      desglose: () => null,
      validar: () => ({ campo: 'descripcion', mensaje: 'Descripción demasiado larga' }),
    }

    const { contenedor } = await montarApp({
      rutaInicial: '/compra/cuotas',
      comprasFactory: () => controlador,
    })

    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra a cuotas')
    expect(contenedor.textContent).not.toContain('Sin tasa configurada')
    expect(contenedor.textContent).not.toContain('Sin tasa: registrarás intereses')
    expect(contenedor.textContent).toContain('28,32 % E.A.')
    expect(contenedor.textContent).toContain('Ingresá un monto mayor o igual a')

    await act(async () => {
      contenedor.querySelector<HTMLAnchorElement>('a[aria-label="Volver a Compra rápida a 1 cuota"]')?.click()
    })
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')

    await act(async () => {
      contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click()
    })
    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain(
      'Descripción demasiado larga',
    )
    expect(document.activeElement?.id).toBe('nota-compra')
  })
})
