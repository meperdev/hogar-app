// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogoCompra, ControladorCompraRapida } from '../../app/compraRapida'
import { crearControladorCompraRapida } from '../../app/controladorCompraRapida'
import type { Hogar, Servicios, Sesion } from '../../app/fundacion'
import { PuertoEnMemoria } from '../../app/puertoEnMemoria'
import { RutasFundacion } from '../RutasFundacion'

const mockJsQr = vi.hoisted(() => vi.fn())
vi.mock('jsqr', () => ({ default: mockJsQr }))

const raices: Root[] = []
const CUFE_VALIDO = 'a8f39d2c'.repeat(12)
const CUFE_URL = 'c4b18e09'.repeat(12)

const CATALOGO_PRUEBA: CatalogoCompra = {
  categorias: [
    { id: '018f4a1e-0000-7000-8000-000000000101', nombre: 'Mercado', icono: null, orden: 1 },
    { id: '018f4a1e-0000-7000-8000-000000000102', nombre: 'Mascotas', icono: null, orden: 2 },
    { id: '018f4a1e-0000-7000-8000-000000000103', nombre: 'Transporte', icono: null, orden: 3 },
    { id: '018f4a1e-0000-7000-8000-000000000104', nombre: 'Arriendo', icono: null, orden: 4 },
    { id: '018f4a1e-0000-7000-8000-000000000105', nombre: 'Servicios', icono: null, orden: 5 },
    { id: '018f4a1e-0000-7000-8000-000000000106', nombre: 'Hogar', icono: null, orden: 6 },
  ],
  medios: [
    { tipo: 'tarjeta', id: '018f4a1e-0000-7000-8000-000000000201', nombre: 'Visa ••4521 (Santiago)', ambito: 'hogar', ultimos4: '4521', diaCorte: 15, diaPago: 25, tasa: { tipo: 'EA', ppm: 283200 } },
    { tipo: 'medio', id: '018f4a1e-0000-7000-8000-000000000202', nombre: 'Efectivo', ambito: null },
    { tipo: 'prestamo', id: '018f4a1e-0000-7000-8000-000000000203', nombre: 'Remodelación cocina (Hogar)', ambito: 'hogar', disponible: 2_500_000, fechaGiro: '2026-10-01' },
  ],
}

function hogarDePrueba(): Hogar {
  const santiago = { id: '018f4a1e-0000-7000-8000-0000000000a1', nombre: 'Santiago', rol: 'admin' as const, activo: true }
  return { id: '018f4a1e-0000-7000-8000-000000000001', nombre: 'Casa Santiago y Ana', miembroActual: santiago, miembros: [santiago] }
}

function crearControladorReal(hogar: Hogar) {
  const port = new PuertoEnMemoria(CATALOGO_PRUEBA)
  port.preferencias.set(`ultimo_medio_de_pago_id:${hogar.miembroActual.id}`, CATALOGO_PRUEBA.medios[0]!.id)
  port.alias.set('890900608', { nombreComercio: 'Almacenes Éxito', categoriaId: CATALOGO_PRUEBA.categorias[0]!.id })
  let seq = 0
  const controlador = crearControladorCompraRapida({
    port,
    alcance: { hogarId: hogar.id, miembroId: hogar.miembroActual.id },
    ahora: () => new Date('2026-11-22T15:00:00Z'),
    nuevoId: () => `018f4a1e-0000-7000-8000-${String(++seq).padStart(12, '0')}`,
    programar: () => {},
  })
  return { controlador, port }
}

async function montarApp(opts?: { rutaInicial?: string; controlador?: ControladorCompraRapida }) {
  const hogar = hogarDePrueba()
  let notificar: (sesion: Sesion | null) => void = () => {}
  const servicios: Servicios = {
    auth: { observarSesion: (cb) => { notificar = cb; return () => {} }, pedirCodigo: vi.fn(async () => {}), verificarCodigo: vi.fn(async () => {}), salir: vi.fn(async () => notificar(null)) },
    hogares: { cargar: vi.fn(async () => hogar), crear: vi.fn(async () => ({ hogarId: hogar.id, miembroId: hogar.miembroActual.id })) },
    ...(opts?.controlador ? { compras: () => opts.controlador! } : {}),
  }
  const contenedor = document.createElement('div')
  document.body.append(contenedor)
  const raiz = createRoot(contenedor)
  raices.push(raiz)
  await act(async () => { raiz.render(<MemoryRouter initialEntries={[opts?.rutaInicial ?? '/']}><RutasFundacion servicios={servicios} /></MemoryRouter>) })
  await act(async () => notificar({ usuarioId: hogar.miembroActual.id }))
  await act(async () => { await Promise.resolve() })
  return { contenedor }
}

function escribir(input: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const boton = (c: HTMLElement, texto: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)
const tecla = (c: HTMLElement, texto: string) => [...(c.querySelector('[aria-label="Teclado numérico COP"]')?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === texto)

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => {
  await act(async () => { for (const r of raices.splice(0)) r.unmount() })
  document.body.innerHTML = ''
})

describe('Compra rápida UI (controlador real)', () => {
  it('muestra la pantalla vacía cuando servicios.compras es undefined', async () => {
    const { contenedor } = await montarApp()
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')
    expect(contenedor.textContent).toContain('Núcleo 1 · Próximo paso')
    expect(contenedor.querySelector('#monto-input')).toBeNull()
  })

  it('registra mercado $85.000 en 3 acciones y deshace en PuertoEnMemoria', async () => {
    const { controlador, port } = crearControladorReal(hogarDePrueba())
    const { contenedor } = await montarApp({ controlador })

    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')
    expect(boton(contenedor, '✓ Hogar')?.getAttribute('aria-pressed')).toBe('true')

    await act(async () => tecla(contenedor, '8')?.click())
    await act(async () => tecla(contenedor, '5')?.click())
    await act(async () => tecla(contenedor, '000')?.click())
    expect(contenedor.querySelector<HTMLInputElement>('#monto-input')?.value).toBe('$85.000')

    await act(async () => boton(contenedor, 'Mercado')?.click())
    const cta = contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')
    expect(cta?.textContent).toBe('Guardar $85.000')
    expect(cta?.className).toContain('min-h-11')

    await act(async () => cta?.click())
    expect(port.pendientes.size).toBe(1)
    expect(contenedor.querySelector('[role="status"]')?.textContent).toContain('Guardado: Mercado $85.000')

    await act(async () => boton(contenedor, 'Deshacer')?.click())
    expect(port.pendientes.size).toBe(0)
    expect(contenedor.textContent).toContain('Compra deshecha.')
  })

  it('valida $0, falta de categoría y foco en nota si falla descripción', async () => {
    const { controlador } = crearControladorReal(hogarDePrueba())
    const { contenedor } = await montarApp({ controlador })
    const cta = contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')
    expect(cta?.getAttribute('aria-disabled')).toBe('true')

    await act(async () => cta?.click())
    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain('Ingresa un monto mayor a $0')
    expect(document.activeElement?.id).toBe('monto-input')

    await act(async () => tecla(contenedor, '5')?.click())
    await act(async () => tecla(contenedor, '000')?.click())
    await act(async () => cta?.click())
    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain('Elige una categoría para guardar')
    expect(document.activeElement?.textContent).toContain('Mercado')

    const segundo = await montarApp({ controlador: { ...controlador, validar: () => ({ campo: 'descripcion', mensaje: 'Descripción inválida' }) } })
    await act(async () => segundo.contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(document.activeElement?.id).toBe('nota-compra')
  })

  it('cambia a Personal, oculta cuotas al pasar de tarjeta a préstamo y pide confirmación < 60 s real', async () => {
    const { controlador, port } = crearControladorReal(hogarDePrueba())
    const { contenedor } = await montarApp({ controlador })

    await act(async () => boton(contenedor, 'Personal (solo yo)')?.click())
    expect(contenedor.textContent).toContain('Solo visible para Santiago · Excluida del balance del hogar')

    await act(async () => boton(contenedor, 'Hogar')?.click())
    await act(async () => boton(contenedor, 'Visa ••4521 (Santiago)')?.click())
    expect(contenedor.querySelector('[aria-label^="Número de cuotas"]')).not.toBeNull()

    const select = contenedor.querySelector<HTMLSelectElement>('#prestamo-origen')!
    await act(async () => { select.value = CATALOGO_PRUEBA.medios[2]!.id; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(contenedor.querySelector('[aria-label^="Número de cuotas"]')).toBeNull()
    expect(contenedor.textContent).toContain('Cuotas disponibles solo con tarjeta de crédito.')

    await act(async () => { select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })) })
    const registrar = async () => {
      await act(async () => tecla(contenedor, '5')?.click())
      await act(async () => tecla(contenedor, '000')?.click())
      await act(async () => boton(contenedor, 'Mercado')?.click())
      await act(async () => contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    }
    await registrar()
    await registrar()
    expect(contenedor.textContent).toContain('Posible compra duplicada')
    expect(port.registros).toHaveLength(1)

    await act(async () => boton(contenedor, 'Guardar de todas formas')?.click())
    expect(port.registros).toHaveLength(2)
  })

  it('calcula desglose real sin doble conteo en Compra a cuotas y maneja desglose null sin decir "Sin tasa"', async () => {
    const { controlador, port } = crearControladorReal(hogarDePrueba())
    const { contenedor } = await montarApp({ controlador })

    await act(async () => contenedor.querySelector<HTMLButtonElement>('button[aria-label="3 cuotas"]')?.click())
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra a cuotas')
    expect(contenedor.textContent).not.toContain('Sin tasa configurada')
    expect(contenedor.textContent).toContain('28,32 % E.A.')

    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#monto-cuotas-input')!, '300000'))
    expect(contenedor.textContent).toContain('3 × $100.000')
    expect(contenedor.textContent).toContain('$12.598')

    await act(async () => boton(contenedor, 'Otro')?.click())
    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#cuotas-personalizadas')!, '4'))
    expect(contenedor.textContent).toContain('4 × $75.000')

    await act(async () => boton(contenedor, 'Mercado')?.click())
    await act(async () => contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(port.pendientes.size).toBe(1)
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')
    expect(contenedor.textContent).toContain('Ver cuotas')
  })

  it('escanea QR DIAN real (Formato 1, Duplicado y Formato 2 solo URL)', async () => {
    const { controlador } = crearControladorReal(hogarDePrueba())
    const { contenedor } = await montarApp({ rutaInicial: '/compra/escanear', controlador })

    const qrCampos = `NumFac: FE99\nFecFac: 2026-11-22\nNitFac: 890900608\nValIva: 13571\nValTolFac: 85000\nCUFE: ${CUFE_VALIDO}\nhttps://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${CUFE_VALIDO}`
    await act(async () => escribir(contenedor.querySelector<HTMLTextAreaElement>('#qr-texto-manual')!, qrCampos))
    await act(async () => boton(contenedor, 'Leer contenido QR localmente')?.click())

    expect(contenedor.textContent).toContain('Almacenes Éxito')
    expect(contenedor.textContent).toContain('$13.571')
    expect(boton(contenedor, '✓ Mercado')?.getAttribute('aria-pressed')).toBe('true')
    const linkDian = [...contenedor.querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent?.includes('Verificar en la DIAN'))
    expect(linkDian?.getAttribute('rel')).toBe('noopener noreferrer')

    await act(async () => contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(contenedor.querySelector('h1')?.textContent).toBe('Compra rápida')

    await act(async () => contenedor.querySelector<HTMLAnchorElement>('a[href="/compra/escanear"]')?.click())
    await act(async () => escribir(contenedor.querySelector<HTMLTextAreaElement>('#qr-texto-manual')!, qrCampos))
    await act(async () => boton(contenedor, 'Leer contenido QR localmente')?.click())
    expect(contenedor.textContent).toContain('Esta factura ya está registrada.')

    await act(async () => boton(contenedor, 'Escanear otra factura')?.click())
    await act(async () => escribir(contenedor.querySelector<HTMLTextAreaElement>('#qr-texto-manual')!, `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${CUFE_URL}`))
    await act(async () => boton(contenedor, 'Leer contenido QR localmente')?.click())
    expect(contenedor.textContent).toContain('QR solo con URL')
    expect(contenedor.querySelector<HTMLInputElement>('#url-cufe')?.value).toBe(CUFE_URL)
  })

  it('abre la cámara y decodifica el QR con jsqr cuando falta BarcodeDetector (iOS Safari)', async () => {
    const { controlador } = crearControladorReal(hogarDePrueba())
    const stopTrack = vi.fn()
    const mediaStream = { getTracks: () => [{ stop: stopTrack }] }
    const getUserMedia = vi.fn(async () => mediaStream)
    vi.stubGlobal('BarcodeDetector', undefined)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })

    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(640 * 480 * 4),
        width: 640,
        height: 480,
      })),
    } as unknown as CanvasRenderingContext2D)
    const playSpy = vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined)

    const qrCampos = `NumFac: FE99\nFecFac: 2026-11-22\nNitFac: 890900608\nValIva: 13571\nValTolFac: 85000\nCUFE: ${CUFE_VALIDO}`
    mockJsQr.mockReturnValue({ data: qrCampos })

    try {
      const { contenedor } = await montarApp({ controlador, rutaInicial: '/compra/escanear' })
      expect(getUserMedia).toHaveBeenCalledTimes(1)
      const video = contenedor.querySelector('video')
      expect(video).not.toBeNull()
      expect(video?.srcObject).toBe(mediaStream)
      if (video) {
        Object.defineProperty(video, 'readyState', { configurable: true, value: 4 })
        Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 })
        Object.defineProperty(video, 'videoHeight', { configurable: true, value: 480 })
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350))
      })

      expect(mockJsQr).toHaveBeenCalled()
      expect(contenedor.textContent).toContain('Precargado para confirmar')
      expect(contenedor.textContent).toContain('Almacenes Éxito')
      expect(stopTrack).toHaveBeenCalled()
    } finally {
      mockJsQr.mockReset()
      ctxSpy.mockRestore()
      playSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
