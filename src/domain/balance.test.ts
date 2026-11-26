import { describe, expect, it } from 'vitest'
import {
  aplicacionesSaldoAFavor,
  calcularBalanceMes,
  formatearPorcentaje,
  type EntradaBalanceMes,
} from './balance'

const ANA = '01950000-0000-7000-8000-000000000001'
const BETO = '01950000-0000-7000-8000-000000000002'
const CUENTA_ANA = '01950000-0000-7000-8000-000000000011'
const CUENTA_BETO = '01950000-0000-7000-8000-000000000012'
const CUENTA_COMUN = '01950000-0000-7000-8000-000000000013'

function entradaBase(): EntradaBalanceMes {
  return {
    periodo: '2026-11',
    actorId: ANA,
    incluirPersonales: false,
    miembros: [
      { id: ANA, nombre: 'Ana', activo: true },
      { id: BETO, nombre: 'Beto', activo: true },
    ],
    medios: [
      { id: CUENTA_ANA, ownerMiembroId: ANA },
      { id: CUENTA_BETO, ownerMiembroId: BETO },
      { id: CUENTA_COMUN, ownerMiembroId: null },
    ],
    compras: [],
    pasivos: [],
    planes: [],
    costos: [],
    pagos: [],
    aportes: [],
    ingresos: [],
    recepciones: [],
  }
}

describe('balance de pareja (I6, I7, I10, I17, I18, I19)', () => {
  it('formatea porcentajes con coma decimal y redondeo mitad hacia arriba a 1 decimal', () => {
    expect(formatearPorcentaje(58)).toBe('58,0 %')
    expect(formatearPorcentaje(56.666666)).toBe('56,7 %')
    expect(formatearPorcentaje(43.333333)).toBe('43,3 %')
    expect(formatearPorcentaje(39.53488)).toBe('39,5 %')
    expect(formatearPorcentaje(0)).toBe('0,0 %')
    expect(formatearPorcentaje(12.35)).toBe('12,4 %')
  })

  it('T-d-1 y T-d-2: reproduce exactamente el ejemplo d (aportes, fondo común e ingresos)', () => {
    const entrada = entradaBase()
    entrada.ingresos = [
      {
        id: 'ing-ana',
        serieId: 'ing-ana',
        miembroId: ANA,
        tipo: 'fijo',
        descripcion: 'Salario',
        monto: 4_500_000,
        diaEsperado: 30,
        vigenteDesde: '2026-01-01',
        vigenteHasta: null,
      },
      {
        id: 'ing-beto',
        serieId: 'ing-beto',
        miembroId: BETO,
        tipo: 'fijo',
        descripcion: 'Salario',
        monto: 2_000_000,
        diaEsperado: 15,
        vigenteDesde: '2026-01-01',
        vigenteHasta: null,
      },
      {
        id: 'ing-beto-var',
        serieId: null,
        miembroId: BETO,
        tipo: 'variable',
        descripcion: 'Freelance',
        monto: 1_500_000,
        fecha: '2026-11-20',
      },
    ]
    entrada.recepciones = [
      {
        id: 'rec-ana',
        ingresoId: 'ing-ana',
        serieId: 'ing-ana',
        periodo: '2026-11',
        recibido: true,
        montoRecibido: null,
        fechaRecepcion: '2026-11-30',
      },
      {
        id: 'rec-beto',
        ingresoId: 'ing-beto',
        serieId: 'ing-beto',
        periodo: '2026-11',
        recibido: true,
        montoRecibido: null,
        fechaRecepcion: '2026-11-15',
      },
    ]
    entrada.aportes = [
      { id: 'ap-1', medioOrigenId: CUENTA_ANA, medioDestinoId: CUENTA_COMUN, monto: 1_500_000, fecha: '2026-11-01' },
      { id: 'ap-2', medioOrigenId: CUENTA_BETO, medioDestinoId: CUENTA_COMUN, monto: 1_000_000, fecha: '2026-11-15' },
    ]
    entrada.compras = [
      { id: 'c1', fecha: '2026-11-08', montoTotal: 200_000, ambito: 'hogar', miembroId: null, pagoTipo: 'contado', medioDePagoId: CUENTA_ANA, financiadaPorPasivoId: null },
      { id: 'c2', fecha: '2026-11-15', montoTotal: 300_000, ambito: 'hogar', miembroId: null, pagoTipo: 'contado', medioDePagoId: CUENTA_BETO, financiadaPorPasivoId: null },
      { id: 'c3', fecha: '2026-11-22', montoTotal: 900_000, ambito: 'hogar', miembroId: null, pagoTipo: 'contado', medioDePagoId: CUENTA_COMUN, financiadaPorPasivoId: null },
    ]

    const bal = calcularBalanceMes(entrada)
    expect(bal.totalAportes).toBe(3_000_000)
    expect(bal.salidasFondoComun).toBe(900_000)

    const ana = bal.miembros.find((m) => m.miembroId === ANA)!
    const beto = bal.miembros.find((m) => m.miembroId === BETO)!
    expect(ana.aporte).toBe(1_700_000)
    expect(ana.pctTotal).toBe('56,7 %')
    expect(ana.pctIngreso).toBe('37,8 %')
    expect(beto.aporte).toBe(1_300_000)
    expect(beto.pctTotal).toBe('43,3 %')
    expect(beto.pctIngreso).toBe('37,1 %')

    // I7: nunca existe saldo o deuda entre miembros
    expect('deuda' in bal).toBe(false)
    expect('diferencia' in bal).toBe(false)
  })

  it('T-i-1: recibo de Ana por $4.300.000 cambia solo % de su ingreso a 39,5 %', () => {
    const entrada = entradaBase()
    entrada.ingresos = [
      { id: 'ing-ana', serieId: 'ing-ana', miembroId: ANA, tipo: 'fijo', descripcion: 'Salario', monto: 4_500_000, diaEsperado: 30, vigenteDesde: '2026-01-01', vigenteHasta: null },
    ]
    entrada.recepciones = [
      { id: 'rec-ana', ingresoId: 'ing-ana', serieId: 'ing-ana', periodo: '2026-11', recibido: true, montoRecibido: 4_300_000, fechaRecepcion: '2026-11-30' },
    ]
    entrada.aportes = [
      { id: 'ap-1', medioOrigenId: CUENTA_ANA, medioDestinoId: CUENTA_COMUN, monto: 1_700_000, fecha: '2026-11-01' },
    ]
    const bal = calcularBalanceMes(entrada)
    const ana = bal.miembros.find((m) => m.miembroId === ANA)!
    expect(ana.ingresoMes).toBe(4_300_000)
    expect(ana.pctIngreso).toBe('39,5 %')
  })

  it('excluye compras personales, financiadas por desembolso y pagos a pasivos personales; aplica pago cruzado de tarjeta hogar', () => {
    const entrada = entradaBase()
    entrada.incluirPersonales = true
    entrada.pasivos = [
      { id: 'visa-ana-hogar', ambito: 'hogar', ownerMiembroId: ANA },
      { id: 'visa-ana-personal', ambito: 'personal', ownerMiembroId: ANA },
      { id: 'credito-efectivo', ambito: 'hogar', ownerMiembroId: ANA },
    ]
    entrada.compras = [
      // Compra personal de Ana: NO suma aporte ni con incluirPersonales=true
      { id: 'cp', fecha: '2026-11-03', montoTotal: 140_000, ambito: 'personal', miembroId: ANA, pagoTipo: 'contado', medioDePagoId: CUENTA_ANA, financiadaPorPasivoId: null },
      // Compra financiada con desembolso: NO suma aporte al comprarse (I19)
      { id: 'cd', fecha: '2026-11-05', montoTotal: 1_200_000, ambito: 'hogar', miembroId: null, pagoTipo: 'contado', medioDePagoId: null, financiadaPorPasivoId: 'credito-efectivo' },
      // Compra financiada con tarjeta: NO suma aporte al comprarse
      { id: 'cf', fecha: '2026-11-10', montoTotal: 300_000, ambito: 'hogar', miembroId: null, pagoTipo: 'financiado', medioDePagoId: null, financiadaPorPasivoId: null },
    ]
    entrada.pagos = [
      // Beto paga cuota de tarjeta hogar de Ana -> aporta a Beto
      { id: 'p1', pasivoId: 'visa-ana-hogar', tipo: 'abono', medioDePagoId: CUENTA_BETO, monto: 104_157, fecha: '2026-11-10' },
      // Ana paga su tarjeta personal -> NO aporta ($0)
      { id: 'p2', pasivoId: 'visa-ana-personal', tipo: 'abono', medioDePagoId: CUENTA_ANA, monto: 80_000, fecha: '2026-11-12' },
    ]
    entrada.costos = [
      // Costo directo hogar pagado desde Cuenta Ana -> aporta a Ana
      { id: 'k1', pasivoId: null, medioDePagoId: CUENTA_ANA, monto: 15_000, fechaCausacion: '2026-11-18' },
      // Costo personal en pasivo personal de Ana -> NO aporta, sí entra en gastosPersonalesPropios
      { id: 'k2', pasivoId: 'visa-ana-personal', medioDePagoId: null, monto: 5_000, fechaCausacion: '2026-11-20' },
    ]

    const bal = calcularBalanceMes(entrada)
    const ana = bal.miembros.find((m) => m.miembroId === ANA)!
    const beto = bal.miembros.find((m) => m.miembroId === BETO)!

    expect(ana.aporte).toBe(15_000)
    expect(beto.aporte).toBe(104_157)
    expect(bal.totalAportes).toBe(119_157)
    expect(bal.gastosPersonalesPropios).toBe(145_000)
  })

  it('T-h-2 / I10: saldo_a_favor en pasivo hogar no aporta al entregarse y sí aporta en el mes del cargo futuro que cubre', () => {
    const mediosPorId = new Map([
      [CUENTA_ANA, { id: CUENTA_ANA, ownerMiembroId: ANA }],
      [CUENTA_BETO, { id: CUENTA_BETO, ownerMiembroId: BETO }],
    ])
    const aplicaciones = aplicacionesSaldoAFavor(
      {
        planes: [{ id: 'pl-1', fechaInicio: '2026-11-10', capital: 300_000 }],
        costos: [
          { id: 'k-1', monto: 6_235, fechaCausacion: '2026-12-10' },
          { id: 'k-2', monto: 4_157, fechaCausacion: '2027-01-10' },
          { id: 'k-3', monto: 2_078, fechaCausacion: '2027-02-10' },
        ],
        pagos: [
          { id: 'p-1', tipo: 'abono', medioDePagoId: CUENTA_ANA, monto: 310_392, fecha: '2027-01-25' },
          { id: 'p-saf', tipo: 'saldo_a_favor', medioDePagoId: CUENTA_ANA, monto: 4_157, fecha: '2027-01-25' },
        ],
      },
      mediosPorId,
    )
    expect(aplicaciones).toEqual([
      { periodo: '2027-02', miembroId: ANA, monto: 2_078 },
    ])

    const entradaEne = entradaBase()
    entradaEne.periodo = '2027-01'
    entradaEne.pasivos = [{ id: 'visa', ambito: 'hogar', ownerMiembroId: ANA }]
    entradaEne.planes = [{ id: 'pl-1', pasivoId: 'visa', fechaInicio: '2026-11-10', capital: 300_000 }]
    entradaEne.costos = [
      { id: 'k-1', pasivoId: 'visa', medioDePagoId: null, monto: 6_235, fechaCausacion: '2026-12-10' },
      { id: 'k-2', pasivoId: 'visa', medioDePagoId: null, monto: 4_157, fechaCausacion: '2027-01-10' },
      { id: 'k-3', pasivoId: 'visa', medioDePagoId: null, monto: 2_078, fechaCausacion: '2027-02-10' },
    ]
    entradaEne.pagos = [
      { id: 'p-1', pasivoId: 'visa', tipo: 'abono', medioDePagoId: CUENTA_ANA, monto: 100_000, fecha: '2027-01-25' },
      { id: 'p-saf', pasivoId: 'visa', tipo: 'saldo_a_favor', medioDePagoId: CUENTA_ANA, monto: 4_157, fecha: '2027-01-25' },
    ]
    expect(calcularBalanceMes(entradaEne).miembros.find((m) => m.miembroId === ANA)?.aporte).toBe(100_000)

    const entradaFeb = { ...entradaEne, periodo: '2027-02' }
    expect(calcularBalanceMes(entradaFeb).miembros.find((m) => m.miembroId === ANA)?.aporte).toBe(2_078)
  })

  it('maneja miembro con $0 aporte y miembro sin ingresos registrados en el mes', () => {
    const entrada = entradaBase()
    entrada.aportes = [
      { id: 'ap-1', medioOrigenId: CUENTA_ANA, medioDestinoId: CUENTA_COMUN, monto: 500_000, fecha: '2026-11-10' },
    ]
    const bal = calcularBalanceMes(entrada)
    const ana = bal.miembros.find((m) => m.miembroId === ANA)!
    const beto = bal.miembros.find((m) => m.miembroId === BETO)!
    expect(ana.pctTotal).toBe('100,0 %')
    expect(ana.pctIngreso).toBeNull()
    expect(beto.aporte).toBe(0)
    expect(beto.pctTotal).toBe('0,0 %')
    expect(beto.pctIngreso).toBeNull()
  })
})
