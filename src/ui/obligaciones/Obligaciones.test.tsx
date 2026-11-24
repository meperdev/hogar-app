// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hogar, Servicios, Sesion } from '../../app/fundacion'
import type {
  AgendaMes,
  BorradorPago,
  BorradorPasivo,
  ControladorObligaciones,
  EvaluacionPago,
  MedioPagoOpcion,
} from '../../app/obligaciones'
import { RutasFundacion } from '../RutasFundacion'

const raices: Root[] = []

function hogarDePrueba(): Hogar {
  const santiago = { id: 'm-santiago', nombre: 'Santiago', rol: 'admin' as const, activo: true }
  const camila = { id: 'm-camila', nombre: 'Camila', rol: 'miembro' as const, activo: true }
  return { id: 'h-1', nombre: 'Casa Santiago y Camila', miembroActual: camila, miembros: [santiago, camila] }
}

const MEDIOS: MedioPagoOpcion[] = [
  { id: 'med-nequi', nombre: 'Nequi · Camila', duenoMiembroId: 'm-camila' },
  { id: 'med-bancolombia', nombre: 'Bancolombia · Santiago', duenoMiembroId: 'm-santiago' },
  { id: 'med-comun', nombre: 'Cuenta común · Hogar', duenoMiembroId: null },
]

function agendaBase(periodo = '2026-11'): AgendaMes {
  return {
    resumen: { periodo, consumoReal: 3_112_000, capitalPagado: 220_000, capitalPendiente: 450_000, costoFinanciero: 68_799 },
    vencidas: [
      {
        tipo: 'cuota', cuotaId: 'cuota-vencida', pasivoId: 'pas-visa', pasivoNombre: 'Visa ••4521', pasivoTipo: 'tarjeta',
        ambito: 'hogar', titular: { tipo: 'miembro', miembroId: 'm-santiago', nombre: 'Santiago' },
        descripcion: 'Farmacia', numero: 1, nCuotas: 2, fechaVencimiento: '2026-11-10',
        capital: 50_000, interes: null, interesOrigen: null, estado: 'vencida', restante: 50_000, pagoEnlazado: null,
      },
    ],
    pendientes: [
      {
        tipo: 'cuota', cuotaId: 'cuota-1', pasivoId: 'pas-visa', pasivoNombre: 'Visa ••4521', pasivoTipo: 'tarjeta',
        ambito: 'hogar', titular: { tipo: 'miembro', miembroId: 'm-santiago', nombre: 'Santiago' },
        descripcion: 'Mercado Éxito', numero: 1, nCuotas: 3, fechaVencimiento: '2026-11-25',
        capital: 100_000, interes: 6_299, interesOrigen: 'calculado', estado: 'pendiente', restante: 106_299, pagoEnlazado: null,
      },
      {
        tipo: 'cuota', cuotaId: 'cuota-cocina', pasivoId: 'pas-cocina', pasivoNombre: 'Deuda Obras & Diseño', pasivoTipo: 'deuda',
        ambito: 'hogar', titular: { tipo: 'hogar' }, descripcion: 'Préstamo remodelación cocina',
        numero: 6, nCuotas: 24, fechaVencimiento: '2026-11-28',
        capital: 350_000, interes: 48_000, interesOrigen: 'calculado', estado: 'pendiente', restante: 398_000, pagoEnlazado: null,
      },
      {
        tipo: 'obligacion', obligacionId: 'obl-epm', nombre: 'Servicios públicos EPM', categoriaNombre: 'Servicios',
        periodo, fechaVencimiento: '2026-11-27', montoEstimado: 285_000, estado: 'pendiente', pago: null,
      },
    ],
    pagadas: [
      {
        tipo: 'cuota', cuotaId: 'cuota-mc', pasivoId: 'pas-mc', pasivoNombre: 'Mastercard ••8834', pasivoTipo: 'tarjeta',
        ambito: 'hogar', titular: { tipo: 'miembro', miembroId: 'm-camila', nombre: 'Camila' },
        descripcion: 'Cuota Mastercard ••8834', numero: 1, nCuotas: 1, fechaVencimiento: '2026-11-20',
        capital: 220_000, interes: 14_500, interesOrigen: 'manual', estado: 'pagada', restante: 0,
        pagoEnlazado: { fecha: '2026-11-20', monto: 234_500, registradoPor: 'Santiago' },
      },
      {
        tipo: 'obligacion', obligacionId: 'obl-arriendo', nombre: 'Arriendo apartamento', categoriaNombre: 'Arriendo',
        periodo, fechaVencimiento: '2026-11-05', montoEstimado: 1_800_000, estado: 'pagada', pago: { fecha: '2026-11-05', monto: 1_800_000 },
      },
    ],
  }
}

function crearControladorMock(overrides?: Partial<ControladorObligaciones>) {
  let incluirPersonales = false
  const cargarMes = vi.fn(async (periodo: string) => {
    const base = agendaBase(periodo)
    return incluirPersonales ? { ...base, resumen: { ...base.resumen, consumoReal: base.resumen.consumoReal + 140_000 } } : base
  })
  const guardarIncluirPersonales = vi.fn(async (v: boolean) => { incluirPersonales = v })
  const prepararPagoCuota = vi.fn(async (cuotaId: string): Promise<BorradorPago> =>
    cuotaId === 'cuota-vencida'
      ? { pasivoId: 'pas-visa', cuotaId, medioId: 'med-nequi', fecha: '2026-11-24', capital: 50_000, interes: null, nota: '' }
      : { pasivoId: 'pas-visa', cuotaId, medioId: 'med-nequi', fecha: '2026-11-25', capital: 100_000, interes: 6_299, nota: '' },
  )
  const evaluarPago = vi.fn(async (b: BorradorPago): Promise<EvaluacionPago> => {
    const monto = b.capital + (b.interes ?? 0)
    const medio = MEDIOS.find((m) => m.id === b.medioId)
    const aporte = medio?.duenoMiembroId ? { miembroId: medio.duenoMiembroId, monto } : null
    if (monto <= 0) return { estado: 'invalido', campo: 'monto', mensaje: 'El monto debe ser mayor a $0.' }
    const tope = 306_299
    if (monto > tope) return { estado: 'sobrepago', monto, tope, excedente: monto - tope, aporte }
    return { estado: 'valido', monto, saldoAntes: tope, saldoDespues: tope - monto, capitalAplicado: b.capital, aporte }
  })
  const registrarPago = vi.fn(async (b: BorradorPago) => ({
    loteId: 'lote-pago-1', resumen: `Abono registrado: $${(b.capital + (b.interes ?? 0)).toLocaleString('es-CO')}`,
  }))
  const registrarPagoObligacion = vi.fn(async () => ({ loteId: 'lote-obl-1', resumen: 'Obligación pagada: Servicios públicos EPM' }))
  const equivalenciaTasa = vi.fn((tasa: { tipo: 'EA' | 'MV'; porcentaje: number }) =>
    tasa.tipo === 'EA'
      ? { ea: tasa.porcentaje, mv: (Math.pow(1 + tasa.porcentaje / 100, 1 / 12) - 1) * 100 }
      : { ea: (Math.pow(1 + tasa.porcentaje / 100, 12) - 1) * 100, mv: tasa.porcentaje },
  )
  const validarPasivo = vi.fn((b: BorradorPasivo) => {
    if (!b.nombre) return { campo: 'nombre', mensaje: 'Ingresa un nombre o alias para el pasivo.' }
    if (b.tipo === 'credito' && !b.credito?.entidad) return { campo: 'entidad', mensaje: 'Ingresa la entidad financiera del crédito.' }
    if (b.tipo === 'deuda' && !b.deuda?.acreedor) return { campo: 'acreedor', mensaje: 'Ingresa el acreedor externo de la deuda.' }
    return null
  })
  const crearPasivo = vi.fn(async (b: BorradorPasivo) => ({ loteId: 'lote-pasivo-1', resumen: `Pasivo guardado: ${b.nombre}` }))

  const controlador: ControladorObligaciones = {
    cargarMes, leerIncluirPersonales: vi.fn(async () => incluirPersonales), guardarIncluirPersonales,
    medios: vi.fn(async () => MEDIOS), prepararPagoCuota, evaluarPago, registrarPago,
    registrarPagoObligacion, equivalenciaTasa, validarPasivo, crearPasivo, ...overrides,
  }
  return {
    controlador,
    espias: { cargarMes, guardarIncluirPersonales, evaluarPago, registrarPago, registrarPagoObligacion, equivalenciaTasa, crearPasivo },
  }
}

async function montar(opts?: { rutaInicial?: string; controlador?: ControladorObligaciones }) {
  const hogar = hogarDePrueba()
  let notificar: (sesion: Sesion | null) => void = () => {}
  const servicios: Servicios = {
    auth: {
      observarSesion: (cb) => { notificar = cb; return () => {} },
      pedirCodigo: vi.fn(async () => {}), verificarCodigo: vi.fn(async () => {}),
      salir: vi.fn(async () => notificar(null)),
    },
    hogares: {
      cargar: vi.fn(async () => hogar),
      crear: vi.fn(async () => ({ hogarId: hogar.id, miembroId: hogar.miembroActual.id })),
    },
    ...(opts?.controlador ? { obligaciones: () => opts.controlador! } : {}),
  }
  const contenedor = document.createElement('div')
  document.body.append(contenedor)
  const raiz = createRoot(contenedor)
  raices.push(raiz)
  await act(async () => {
    raiz.render(<MemoryRouter initialEntries={[opts?.rutaInicial ?? '/obligaciones']}><RutasFundacion servicios={servicios} /></MemoryRouter>)
  })
  await act(async () => notificar({ usuarioId: hogar.miembroActual.id }))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  return { contenedor }
}

function escribir(input: HTMLInputElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function cambiarSelect(select: HTMLSelectElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, valor)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

const botonPorTexto = (c: HTMLElement, texto: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => {
  await act(async () => { for (const r of raices.splice(0)) r.unmount() })
  document.body.innerHTML = ''
})

describe('Obligaciones del mes UI', () => {
  it('mantiene PantallaObligacionesVacia cuando servicios.obligaciones es undefined', async () => {
    const { contenedor } = await montar({ rutaInicial: '/obligaciones' })
    expect(contenedor.querySelector('h1')?.textContent).toBe('Obligaciones del mes')
    expect(contenedor.textContent).toContain('Núcleo 2 · Sin pasivos ni cuotas aún')
  })

  it('muestra las 3 tarjetas separadas, listas vencidas/pendientes/pagadas, CTA sin scroll y toggle local', async () => {
    const { controlador, espias } = crearControladorMock()
    const { contenedor } = await montar({ rutaInicial: '/obligaciones', controlador })

    expect(contenedor.querySelector('h1')?.textContent).toBe('Obligaciones del mes')
    expect(contenedor.textContent).toContain('$3.112.000')
    expect(contenedor.textContent).toContain('$220.000')
    expect(contenedor.textContent).toContain('$450.000 pend.')
    expect(contenedor.textContent).toContain('$68.799')
    expect(contenedor.textContent).toContain('Sin doble conteo:')

    const headings = [...contenedor.querySelectorAll('h2')].map((h) => h.textContent?.trim())
    const idxVencidas = headings.indexOf('Vencidas')
    const idxPendientes = headings.indexOf('Pendientes este mes')
    const idxPagadas = headings.findIndex((t) => t?.startsWith('Pagadas en '))
    expect(idxVencidas).toBeGreaterThan(-1)
    expect(idxPendientes).toBeGreaterThan(idxVencidas)
    expect(idxPagadas).toBeGreaterThan(idxPendientes)

    expect(contenedor.textContent).toContain('Hogar · titular Santiago')
    expect(contenedor.textContent).toContain('Hogar · titular Hogar')
    expect(contenedor.textContent).toContain('Interés manual')

    const cta = contenedor.querySelector<HTMLAnchorElement>('a[data-sin-scroll]')
    expect(cta?.className).toContain('min-h-11')
    expect(cta?.textContent).toContain('Registrar pago · Cuota 1/2 ($50.000)')

    const toggle = contenedor.querySelector<HTMLInputElement>('#toggle-incluir-personales')
    expect(toggle?.checked).toBe(false)
    await act(async () => { toggle?.click() })
    expect(espias.guardarIncluirPersonales).toHaveBeenCalledWith(true)
    expect(contenedor.textContent).toContain('$3.252.000')

    await act(async () => { contenedor.querySelector<HTMLButtonElement>('button[aria-label="Mes anterior"]')?.click() })
    expect(espias.cargarMes).toHaveBeenCalledTimes(3)
  })

  it('envía interés editado sin recalcularlo, muestra ayuda Sin tasa y actualiza avisos de aporte', async () => {
    const { controlador, espias } = crearControladorMock()
    const { contenedor } = await montar({ rutaInicial: '/obligaciones/pagar/cuota/cuota-1', controlador })

    expect(contenedor.querySelector('h1')?.textContent).toBe('Registrar pago')
    expect(contenedor.querySelector('nav.hogar-bottom-nav')).toBeNull()
    expect(contenedor.querySelector('.hogar-action-bar--fondo')).not.toBeNull()
    expect(contenedor.querySelector<HTMLInputElement>('#pago-intereses')?.value).toBe('$6.299')
    expect(contenedor.textContent).toContain('Aporte libre')

    const inputInteres = contenedor.querySelector<HTMLInputElement>('#pago-intereses')!
    await act(async () => escribir(inputInteres, '7100'))
    await act(async () => { await Promise.resolve() })
    expect(inputInteres.value).toBe('$7.100')
    expect(contenedor.textContent).toContain('origen manual')

    await act(async () => cambiarSelect(contenedor.querySelector('#cuenta-origen')!, 'med-comun'))
    await act(async () => { await Promise.resolve() })
    expect(contenedor.textContent).toContain('no hay aporte individual')

    const cta = contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')!
    expect(cta.textContent).toBe('Confirmar pago ($107.100)')
    await act(async () => cta.click())

    expect(espias.registrarPago).toHaveBeenCalledWith(
      expect.objectContaining({ cuotaId: 'cuota-1', capital: 100_000, interes: 7_100, medioId: 'med-comun' }),
      { dividirSobrepago: false },
    )
    expect(contenedor.querySelector('h1')?.textContent).toBe('Obligaciones del mes')

    const sinTasa = await montar({ rutaInicial: '/obligaciones/pagar/cuota/cuota-vencida', controlador })
    expect(sinTasa.contenedor.querySelector<HTMLInputElement>('#pago-intereses')?.value).toBe('')
    expect(sinTasa.contenedor.textContent).toContain('Este pasivo está en Sin tasa')
  })

  it('rechaza duplicado de cuota_id sin permitir confirmar ni dividir, y permite adelanto sin cuota', async () => {
    const evaluarPago = vi.fn(async (b: BorradorPago): Promise<EvaluacionPago> => {
      if (b.cuotaId !== null) {
        return { estado: 'duplicado', existente: { fecha: '2026-11-20', monto: 106_299, registradoPor: 'Santiago' } }
      }
      const monto = b.capital + (b.interes ?? 0)
      return { estado: 'valido', monto, saldoAntes: 200_000, saldoDespues: 200_000 - monto, capitalAplicado: b.capital, aporte: { miembroId: 'm-camila', monto } }
    })
    const { controlador, espias } = crearControladorMock({ evaluarPago })
    const { contenedor } = await montar({ rutaInicial: '/obligaciones/pagar/cuota/cuota-1', controlador })

    expect(contenedor.textContent).toContain('Posible pago duplicado (cuota ya cubierta)')
    expect(contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.disabled).toBe(true)

    await act(async () => botonPorTexto(contenedor, 'Registrar adelanto sin cuota')?.click())
    await act(async () => { await Promise.resolve() })
    expect(contenedor.textContent).toContain('Modo adelanto sin cuota')
    await act(async () => contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(espias.registrarPago).toHaveBeenCalledWith(expect.objectContaining({ cuotaId: null }), { dividirSobrepago: false })
  })

  it('exige confirmación explícita para sobrepago (abono + saldo a favor) y paga obligación recurrente', async () => {
    const { controlador, espias } = crearControladorMock()
    const { contenedor } = await montar({ rutaInicial: '/obligaciones/pagar/cuota/cuota-1', controlador })

    await act(async () => escribir(contenedor.querySelector('#pago-capital')!, '350000'))
    await act(async () => { await Promise.resolve() })
    expect(contenedor.textContent).toContain('Posible pago duplicado o sobrepago')

    await act(async () => contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(espias.registrarPago).not.toHaveBeenCalled()

    await act(async () => botonPorTexto(contenedor, 'Dividir: abono + saldo a favor')?.click())
    expect(espias.registrarPago).toHaveBeenCalledWith(
      expect.objectContaining({ capital: 350_000, interes: 6_299 }),
      { dividirSobrepago: true },
    )

    const obl = await montar({ rutaInicial: '/obligaciones/pagar/obligacion/obl-epm', controlador })
    expect(obl.contenedor.querySelector<HTMLInputElement>('#pago-obligacion-monto')?.value).toBe('$285.000')
    await act(async () => obl.contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(espias.registrarPagoObligacion).toHaveBeenCalledWith(expect.objectContaining({ obligacionId: 'obl-epm', monto: 285_000 }))
  })

  it('muestra Nuevo pasivo con Sin tasa preseleccionado, conversión E.A.⇄M.V. y reglas de titular/ámbito', async () => {
    const { controlador, espias } = crearControladorMock()
    const { contenedor } = await montar({ rutaInicial: '/obligaciones/nuevo-pasivo', controlador })

    expect(contenedor.querySelector('h1')?.textContent).toBe('Nuevo pasivo')
    expect(contenedor.querySelector<HTMLInputElement>('#tasa-ninguna')?.checked).toBe(true)
    expect(contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.disabled).toBe(true)
    expect(contenedor.querySelector<HTMLOptionElement>('#origen-plan option[value="desembolso"]')?.disabled).toBe(true)

    await act(async () => contenedor.querySelector<HTMLInputElement>('#tasa-ea')?.click())
    await act(async () => escribir(contenedor.querySelector('#valor-tasa')!, '28,32'))
    expect(espias.equivalenciaTasa).toHaveBeenCalledWith({ tipo: 'EA', porcentaje: 28.32 })
    expect(contenedor.textContent).toContain('28,32 % E.A. ⇄ 2,0997 % M.V.')

    await act(async () => contenedor.querySelector<HTMLInputElement>('#tipo-deuda')?.click())
    expect(contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.disabled).toBe(false)
    await act(async () => contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.click())
    await act(async () => contenedor.querySelector<HTMLInputElement>('#ambito-personal')?.click())
    expect(contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.disabled).toBe(true)
    expect(contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.checked).toBe(false)

    await act(async () => contenedor.querySelector<HTMLInputElement>('#ambito-hogar')?.click())
    await act(async () => contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.click())
    await act(async () => escribir(contenedor.querySelector('#nombre-tarjeta')!, 'Préstamo cocina'))
    await act(async () => escribir(contenedor.querySelector('#acreedor-deuda')!, 'Obras & Diseño'))
    await act(async () => cambiarSelect(contenedor.querySelector('#origen-plan')!, 'desembolso'))
    await act(async () => escribir(contenedor.querySelector('#saldo-inicial-cop')!, '8400000'))

    const cta = contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')!
    expect(cta.className).toContain('min-h-11')
    await act(async () => cta.click())

    expect(espias.crearPasivo).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'deuda', nombre: 'Préstamo cocina', ambito: 'hogar', titularMiembroId: null,
        tasa: { tipo: 'EA', porcentaje: 28.32 }, deuda: { acreedor: 'Obras & Diseño' },
        plan: expect.objectContaining({ origen: 'desembolso', capital: 8_400_000, calendario: null }),
      }),
    )
    expect(contenedor.querySelector('h1')?.textContent).toBe('Obligaciones del mes')
  })
})
