// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hogar, Servicios, Sesion } from '../../app/fundacion'
import type {
  AgendaMes, BorradorPago, BorradorPasivo, ControladorObligaciones, EvaluacionPago, MedioPagoOpcion,
} from '../../app/obligaciones'
import { RutasFundacion } from '../RutasFundacion'

const raices: Root[] = []
const MEDIOS: MedioPagoOpcion[] = [
  { id: 'med-nequi', nombre: 'Nequi · Camila', duenoMiembroId: 'm-camila' },
  { id: 'med-bancolombia', nombre: 'Bancolombia · Santiago', duenoMiembroId: 'm-santiago' },
  { id: 'med-comun', nombre: 'Cuenta común · Hogar', duenoMiembroId: null },
]

function hogarDePrueba(): Hogar {
  const santiago = { id: 'm-santiago', nombre: 'Santiago', rol: 'admin' as const, activo: true }
  const camila = { id: 'm-camila', nombre: 'Camila', rol: 'miembro' as const, activo: true }
  return { id: 'h-1', nombre: 'Casa Santiago y Camila', miembroActual: camila, miembros: [santiago, camila] }
}

function agendaBase(periodo = '2026-11'): AgendaMes {
  return {
    resumen: { periodo, consumoReal: 3_112_000, capitalPagado: 220_000, capitalPendiente: 450_000, costoFinanciero: 68_799 },
    vencidas: [{
      tipo: 'cuota', cuotaId: 'cuota-vencida', pasivoId: 'pas-visa', pasivoNombre: 'Visa ••4521', pasivoTipo: 'tarjeta',
      ambito: 'hogar', titular: { tipo: 'miembro', miembroId: 'm-santiago', nombre: 'Santiago' },
      descripcion: 'Farmacia', numero: 1, nCuotas: 2, fechaVencimiento: '2026-11-10',
      capital: 50_000, interes: null, interesOrigen: null, estado: 'vencida', restante: 50_000, pagoEnlazado: null,
    }],
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
    pagadas: [{
      tipo: 'cuota', cuotaId: 'cuota-mc', pasivoId: 'pas-mc', pasivoNombre: 'Mastercard ••8834', pasivoTipo: 'tarjeta',
      ambito: 'hogar', titular: { tipo: 'miembro', miembroId: 'm-camila', nombre: 'Camila' },
      descripcion: 'Cuota Mastercard ••8834', numero: 1, nCuotas: 1, fechaVencimiento: '2026-11-20',
      capital: 220_000, interes: 14_500, interesOrigen: 'manual', estado: 'pagada', restante: 0,
      pagoEnlazado: { fecha: '2026-11-20', monto: 234_500, registradoPor: 'Santiago' },
    }],
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
  const prepararPagoPasivo = vi.fn(async (pasivoId: string): Promise<BorradorPago> => ({
    pasivoId, cuotaId: null, medioId: 'med-nequi', fecha: '2026-11-27', capital: 0, interes: null, nota: '',
  }))
  const eliminarPasivo = vi.fn(async () => ({
    accion: 'eliminado' as const,
    resumen: 'Obligación eliminada',
  }))
  const evaluarPago = vi.fn(async (b: BorradorPago): Promise<EvaluacionPago> => {
    const monto = b.capital + (b.interes ?? 0)
    const medio = MEDIOS.find((m) => m.id === b.medioId)
    const aporte = medio?.duenoMiembroId ? { miembroId: medio.duenoMiembroId, monto } : null
    if (monto <= 0) return { estado: 'invalido', campo: 'monto', mensaje: 'El monto debe ser mayor a $0.' }
    const tope = 306_299
    if (monto > tope) return { estado: 'sobrepago', monto, tope, excedente: monto - tope, aporte }
    return { estado: 'valido', monto, saldoAntes: tope, saldoDespues: tope - monto, capitalAplicado: b.capital, aporte }
  })
  const registrarPago = vi.fn(async (b: BorradorPago) => ({ loteId: 'lote-1', resumen: `Abono: ${b.capital + (b.interes ?? 0)}` }))
  const registrarPagoObligacion = vi.fn(async () => ({ loteId: 'lote-obl', resumen: 'Obligación pagada' }))
  const equivalenciaTasa = vi.fn((tasa: { tipo: 'EA' | 'MV'; porcentaje: number }) =>
    tasa.tipo === 'EA'
      ? { ea: tasa.porcentaje, mv: (Math.pow(1 + tasa.porcentaje / 100, 1 / 12) - 1) * 100 }
      : { ea: (Math.pow(1 + tasa.porcentaje / 100, 12) - 1) * 100, mv: tasa.porcentaje },
  )
  const validarPasivo = vi.fn((b: BorradorPasivo) =>
    !b.nombre ? { campo: 'nombre', mensaje: 'Ingresa un nombre o alias.' } : null,
  )
  const crearPasivo = vi.fn(async (b: BorradorPasivo) => ({ loteId: 'lote-pas', resumen: `Guardado: ${b.nombre}` }))

  const controlador: ControladorObligaciones = {
    cargarMes, leerIncluirPersonales: vi.fn(async () => incluirPersonales), guardarIncluirPersonales,
    medios: vi.fn(async () => MEDIOS), prepararPagoCuota, prepararPagoPasivo, evaluarPago, registrarPago,
    registrarPagoObligacion, equivalenciaTasa, validarPasivo, crearPasivo, eliminarPasivo, ...overrides,
  }
  return { controlador, espias: { cargarMes, guardarIncluirPersonales, registrarPago, registrarPagoObligacion, equivalenciaTasa, crearPasivo, eliminarPasivo } }
}

async function montar(opts?: { rutaInicial?: string; controlador?: ControladorObligaciones }) {
  const hogar = hogarDePrueba()
  let notificar: (sesion: Sesion | null) => void = () => {}
  const servicios: Servicios = {
    auth: { observarSesion: (cb) => { notificar = cb; return () => {} }, pedirCodigo: vi.fn(async () => {}), verificarCodigo: vi.fn(async () => {}), salir: vi.fn(async () => notificar(null)) },
    hogares: { cargar: vi.fn(async () => hogar), crear: vi.fn(async () => ({ hogarId: hogar.id, miembroId: hogar.miembroActual.id })) },
    ...(opts?.controlador ? { obligaciones: () => opts.controlador! } : {}),
  }
  const contenedor = document.createElement('div')
  document.body.append(contenedor)
  const raiz = createRoot(contenedor)
  raices.push(raiz)
  await act(async () => { raiz.render(<MemoryRouter initialEntries={[opts?.rutaInicial ?? '/obligaciones']}><RutasFundacion servicios={servicios} /></MemoryRouter>) })
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
const botonPorTexto = (c: HTMLElement, texto: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => {
  await act(async () => { for (const r of raices.splice(0)) r.unmount() })
  document.body.innerHTML = ''
})

describe('Obligaciones del mes UI', () => {
  it('mantiene PantallaObligacionesVacia cuando servicios.obligaciones es undefined', async () => {
    const { contenedor } = await montar({ rutaInicial: '/obligaciones' })
    expect(contenedor.textContent).toContain('Núcleo 2 · Sin pasivos ni cuotas aún')
  })

  it('muestra las 3 tarjetas separadas, listas vencidas/pendientes/pagadas, CTA sin scroll y toggle local', async () => {
    const { controlador, espias } = crearControladorMock()
    const { contenedor } = await montar({ rutaInicial: '/obligaciones', controlador })

    expect(contenedor.textContent).toContain('$3.112.000')
    expect(contenedor.textContent).toContain('$220.000')
    expect(contenedor.textContent).toContain('$450.000 pend.')
    expect(contenedor.textContent).toContain('$68.799')
    expect(contenedor.querySelector('[aria-labelledby="resumen-contable-heading"] .grid-cols-3')).toBeNull()
    expect(contenedor.querySelector('[aria-labelledby="resumen-contable-heading"] .grid-cols-2')).not.toBeNull()
    expect(contenedor.textContent).toContain('Hogar · titular Santiago')
    expect(contenedor.textContent).toContain('Hogar · titular Hogar')

    const kpis = [...contenedor.querySelectorAll('section[aria-labelledby="resumen-contable-heading"] article')]
    expect(kpis).toHaveLength(3)
    for (const kpi of kpis) {
      expect(kpi.className).toContain('min-w-0')
      expect(kpi.className).toContain('overflow-hidden')
      expect(kpi.className).toContain('justify-between')
      expect(kpi.querySelector('span.items-start')).not.toBeNull()
    }

    const headings = [...contenedor.querySelectorAll('h2')].map((h) => h.textContent?.trim())
    expect(headings.indexOf('Vencidas')).toBeLessThan(headings.indexOf('Pendientes este mes'))
    expect(headings.indexOf('Pendientes este mes')).toBeLessThan(headings.findIndex((t) => t?.startsWith('Pagadas en ')))

    const cta = contenedor.querySelector<HTMLAnchorElement>('a[data-sin-scroll]')
    expect(cta?.className).toContain('min-h-11')
    expect(cta?.textContent).toContain('+ Nueva obligación')
    expect(cta?.getAttribute('href')).toBe('/obligaciones/nuevo-pasivo')

    await act(async () => { contenedor.querySelector<HTMLInputElement>('#toggle-incluir-personales')?.click() })
    expect(espias.guardarIncluirPersonales).toHaveBeenCalledWith(true)
    expect(contenedor.textContent).toContain('$3.252.000')

    await act(async () => { contenedor.querySelector<HTMLButtonElement>('button[aria-label="Mes anterior"]')?.click() })
    expect(espias.cargarMes).toHaveBeenCalledTimes(3)
  })

  it('envía interés editado sin recalcularlo, lee aporte desde evaluación y muestra ayuda Sin tasa', async () => {
    const { controlador, espias } = crearControladorMock()
    const { contenedor } = await montar({ rutaInicial: '/obligaciones/pagar/cuota/cuota-1', controlador })

    expect(contenedor.querySelector('nav.hogar-bottom-nav')).toBeNull()
    expect(contenedor.querySelector('.hogar-action-bar--fondo')).not.toBeNull()
    expect(contenedor.textContent).toContain('Aporte de Camila')

    const inputInteres = contenedor.querySelector<HTMLInputElement>('#pago-intereses')!
    await act(async () => escribir(inputInteres, '7100'))
    await act(async () => { await Promise.resolve() })
    expect(inputInteres.value).toBe('$7.100')
    expect(contenedor.textContent).toContain('Interés editado manualmente')

    await act(async () => cambiarSelect(contenedor.querySelector('#cuenta-origen')!, 'med-comun'))
    await act(async () => { await Promise.resolve() })
    expect(contenedor.textContent).toContain('Sin aporte individual ($0)')

    await act(async () => contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(espias.registrarPago).toHaveBeenCalledWith(
      expect.objectContaining({ cuotaId: 'cuota-1', capital: 100_000, interes: 7_100, medioId: 'med-comun' }),
      { dividirSobrepago: false },
    )

    const sinTasa = await montar({ rutaInicial: '/obligaciones/pagar/cuota/cuota-vencida', controlador })
    expect(sinTasa.contenedor.querySelector<HTMLInputElement>('#pago-intereses')?.value).toBe('')
    expect(sinTasa.contenedor.textContent).toContain('Solo si tu extracto cobra intereses')
  })

  it('rechaza duplicado de cuota_id y permite adelanto sin cuota', async () => {
    const evaluarPago = vi.fn(async (b: BorradorPago): Promise<EvaluacionPago> =>
      b.cuotaId !== null
        ? { estado: 'duplicado', existente: { fecha: '2026-11-20', monto: 106_299, registradoPor: 'Santiago' } }
        : { estado: 'valido', monto: b.capital + (b.interes ?? 0), saldoAntes: 200_000, saldoDespues: 93_701, capitalAplicado: b.capital, aporte: { miembroId: 'm-camila', monto: b.capital + (b.interes ?? 0) } },
    )
    const { controlador, espias } = crearControladorMock({ evaluarPago })
    const { contenedor } = await montar({ rutaInicial: '/obligaciones/pagar/cuota/cuota-1', controlador })

    expect(contenedor.textContent).toContain('Cuota ya pagada')
    expect(contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.disabled).toBe(true)

    await act(async () => botonPorTexto(contenedor, 'Registrar adelanto libre')?.click())
    await act(async () => { await Promise.resolve() })
    await act(async () => contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(espias.registrarPago).toHaveBeenCalledWith(expect.objectContaining({ cuotaId: null }), { dividirSobrepago: false })
  })

  it('exige confirmación explícita para sobrepago y paga obligación recurrente', async () => {
    const { controlador, espias } = crearControladorMock()
    const { contenedor } = await montar({ rutaInicial: '/obligaciones/pagar/cuota/cuota-1', controlador })

    await act(async () => escribir(contenedor.querySelector('#pago-capital')!, '350000'))
    await act(async () => { await Promise.resolve() })
    expect(contenedor.textContent).toContain('El abono ($356.299) supera el saldo actual ($306.299)')

    await act(async () => contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(espias.registrarPago).not.toHaveBeenCalled()

    await act(async () => botonPorTexto(contenedor, 'Dividir: abono + saldo a favor')?.click())
    expect(espias.registrarPago).toHaveBeenCalledWith(expect.objectContaining({ capital: 350_000, interes: 6_299 }), { dividirSobrepago: true })

    const obl = await montar({ rutaInicial: '/obligaciones/pagar/obligacion/obl-epm', controlador })
    await act(async () => obl.contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())
    expect(espias.registrarPagoObligacion).toHaveBeenCalledWith(expect.objectContaining({ obligacionId: 'obl-epm', monto: 285_000 }))
  })

  it('muestra Nuevo pasivo con Sin tasa preseleccionado, conversión E.A.⇄M.V. y reglas de titular/ámbito', async () => {
    const { controlador, espias } = crearControladorMock()
    const { contenedor } = await montar({ rutaInicial: '/obligaciones/nuevo-pasivo', controlador })

    expect(contenedor.querySelector<HTMLInputElement>('#tasa-ninguna')?.checked).toBe(true)
    expect(contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.disabled).toBe(true)
    expect(contenedor.querySelector<HTMLOptionElement>('#origen-plan option[value="desembolso"]')?.disabled).toBe(true)

    await act(async () => contenedor.querySelector<HTMLInputElement>('#tasa-ea')?.click())
    await act(async () => escribir(contenedor.querySelector('#valor-tasa')!, '28,32'))
    expect(contenedor.textContent).toContain('28,32 % E.A. ⇄ 2,0997 % M.V.')

    await act(async () => contenedor.querySelector<HTMLInputElement>('#tipo-deuda')?.click())
    await act(async () => contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.click())
    await act(async () => contenedor.querySelector<HTMLInputElement>('#ambito-personal')?.click())
    expect(contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.disabled).toBe(true)

    await act(async () => contenedor.querySelector<HTMLInputElement>('#tipo-credito')?.click())
    await act(async () => botonPorTexto(contenedor, 'Bancolombia')?.click())
    expect((contenedor.querySelector('#entidad-credito') as HTMLInputElement).value).toBe('Bancolombia')

    await act(async () => contenedor.querySelector<HTMLInputElement>('#tipo-deuda')?.click())
    await act(async () => contenedor.querySelector<HTMLInputElement>('#ambito-hogar')?.click())
    await act(async () => contenedor.querySelector<HTMLInputElement>('#titular-hogar')?.click())
    await act(async () => escribir(contenedor.querySelector('#nombre-tarjeta')!, 'Préstamo cocina'))
    await act(async () => escribir(contenedor.querySelector('#acreedor-deuda')!, 'Obras & Diseño'))
    await act(async () => cambiarSelect(contenedor.querySelector('#origen-plan')!, 'desembolso'))
    await act(async () => escribir(contenedor.querySelector('#saldo-inicial-cop')!, '8400000'))
    await act(async () => contenedor.querySelector<HTMLButtonElement>('button[data-sin-scroll]')?.click())

    expect(espias.crearPasivo).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'deuda', nombre: 'Préstamo cocina', ambito: 'hogar', titularMiembroId: null,
        tasa: { tipo: 'EA', porcentaje: 28.32 }, deuda: { acreedor: 'Obras & Diseño' },
        plan: expect.objectContaining({ origen: 'desembolso', capital: 8_400_000, calendario: null }),
      }),
    )
  })

  it('muestra pasivos sin calendario, evita duplicar botón con cuotas abiertas, permite eliminar y prepara abono desde $0', async () => {
    const agendaConPasivo: AgendaMes = {
      ...agendaBase('2026-11'),
      pasivos: [
        {
          pasivoId: 'pas-kiroi',
          nombre: 'Cuenta pendiente Kiroi',
          tipo: 'deuda',
          ambito: 'hogar',
          titular: { tipo: 'hogar' },
          saldoPendiente: 1_426_000,
          tieneSinCalendario: true,
          cuotasAbiertasMes: 0,
          abonos: [
            {
              id: 'abono-1',
              fecha: '2026-11-18',
              monto: 300_000,
              medioNombre: 'Nequi · Camila',
              registradoPor: 'Camila',
              nota: 'Abono quincena',
              tipo: 'abono',
            },
          ],
        },
        {
          pasivoId: 'pas-visa',
          nombre: 'Visa ••4521',
          tipo: 'tarjeta',
          ambito: 'hogar',
          titular: { tipo: 'miembro', miembroId: 'm-santiago', nombre: 'Santiago' },
          saldoPendiente: 150_000,
          tieneSinCalendario: false,
          cuotasAbiertasMes: 2,
        },
      ],
    }
    const { controlador, espias } = crearControladorMock({
      cargarMes: vi.fn(async () => agendaConPasivo),
    })
    const { contenedor } = await montar({ rutaInicial: '/obligaciones', controlador })

    expect(contenedor.textContent).toContain('Deudas, tarjetas y créditos')
    expect(contenedor.textContent).toContain('Cuenta pendiente Kiroi')
    expect(contenedor.textContent).toContain('Deuda externa')
    expect(contenedor.textContent).toContain('Tarjeta de crédito')
    expect(contenedor.textContent).toContain('Abonos libres')
    expect(contenedor.textContent).toContain('$1.426.000')
    expect(contenedor.textContent).toContain('Abonos registrados (1)')
    expect(contenedor.textContent).toContain('Camila · Nequi · Camila')
    expect(contenedor.textContent).toContain('Abono quincena')
    expect(contenedor.textContent).toContain('$300.000')
    expect(contenedor.querySelector('a[href="/obligaciones/pagar/pasivo/pas-kiroi"]')).not.toBeNull()
    expect(contenedor.querySelector('a[href="/obligaciones/pagar/pasivo/pas-visa"]')).toBeNull()

    await act(async () => {
      contenedor.querySelector<HTMLButtonElement>('button[aria-label="Eliminar Cuenta pendiente Kiroi"]')?.click()
    })
    expect(contenedor.textContent).toContain('¿Eliminar «Cuenta pendiente Kiroi»?')
    await act(async () => botonPorTexto(contenedor, 'Sí, eliminar')?.click())
    expect(espias.eliminarPasivo).toHaveBeenCalledWith('pas-kiroi')

    const { contenedor: contAbono } = await montar({
      rutaInicial: '/obligaciones/pagar/pasivo/pas-kiroi',
      controlador,
    })
    expect(contAbono.textContent).toContain('Cuenta pendiente Kiroi')
    expect(contAbono.querySelector<HTMLInputElement>('#pago-capital')?.value).toBe('')
    await act(async () => botonPorTexto(contAbono, 'Pagar todo ($1.426.000)')?.click())
    expect(contAbono.querySelector<HTMLInputElement>('#pago-capital')?.value).toBe('$1.426.000')
  })
})
