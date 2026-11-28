import { describe, expect, it } from 'vitest'
import { calcularResumenGastos, periodoAnterior, type EntradaResumenGastos } from './gastos'

function baseEntrada(overrides?: Partial<EntradaResumenGastos>): EntradaResumenGastos {
  return {
    periodo: '2026-11',
    actorId: 'santiago',
    ambito: 'hogar',
    compras: [
      {
        id: 'c1',
        fecha: '2026-11-12',
        descripcion: 'D1',
        montoTotal: 150_000,
        categoriaId: 'cat-mercado',
        ambito: 'hogar',
        miembroId: null,
        pagoTipo: 'contado',
        medioDePagoId: 'mp-bancolombia',
        financiadaPorPasivoId: null,
        obligacionId: null,
        registradoPor: 'santiago',
        origen: 'manual',
      },
      {
        id: 'c2',
        fecha: '2026-11-18',
        descripcion: 'Carulla',
        montoTotal: 50_000,
        categoriaId: 'cat-mercado',
        ambito: 'hogar',
        miembroId: null,
        pagoTipo: 'contado',
        medioDePagoId: 'mp-nequi',
        financiadaPorPasivoId: null,
        obligacionId: null,
        registradoPor: 'laura',
        origen: 'qr',
      },
      {
        id: 'c3',
        fecha: '2026-11-20',
        descripcion: 'Licuadora Homecenter',
        montoTotal: 300_000,
        categoriaId: 'cat-hogar',
        ambito: 'hogar',
        miembroId: null,
        pagoTipo: 'financiado',
        medioDePagoId: null,
        financiadaPorPasivoId: null,
        obligacionId: null,
        registradoPor: 'santiago',
        origen: 'manual',
      },
      {
        id: 'c4',
        fecha: '2026-11-21',
        descripcion: 'Café personal',
        montoTotal: 25_000,
        categoriaId: 'cat-entretenimiento',
        ambito: 'personal',
        miembroId: 'santiago',
        pagoTipo: 'contado',
        medioDePagoId: 'mp-nequi',
        financiadaPorPasivoId: null,
        obligacionId: null,
        registradoPor: 'santiago',
        origen: 'manual',
      },
      {
        id: 'c5',
        fecha: '2026-11-22',
        descripcion: 'Privado de Laura',
        montoTotal: 90_000,
        categoriaId: 'cat-salud',
        ambito: 'personal',
        miembroId: 'laura',
        pagoTipo: 'contado',
        medioDePagoId: 'mp-bancolombia',
        financiadaPorPasivoId: null,
        obligacionId: null,
        registradoPor: 'laura',
        origen: 'manual',
      },
      {
        id: 'c6',
        fecha: '2026-10-15',
        descripcion: 'Mercado octubre',
        montoTotal: 400_000,
        categoriaId: 'cat-mercado',
        ambito: 'hogar',
        miembroId: null,
        pagoTipo: 'contado',
        medioDePagoId: 'mp-bancolombia',
        financiadaPorPasivoId: null,
        obligacionId: null,
        registradoPor: 'santiago',
        origen: 'manual',
      },
    ],
    categorias: [
      { id: 'cat-mercado', nombre: 'Mercado', icono: 'mercado', orden: 1 },
      { id: 'cat-hogar', nombre: 'Hogar', icono: 'hogar', orden: 2 },
      { id: 'cat-entretenimiento', nombre: 'Entretenimiento', icono: 'entretenimiento', orden: 3 },
      { id: 'cat-salud', nombre: 'Salud', icono: 'salud', orden: 4 },
    ],
    medios: [
      { id: 'mp-bancolombia', nombre: 'Bancolombia', tipo: 'cuenta' },
      { id: 'mp-nequi', nombre: 'Nequi', tipo: 'cuenta' },
    ],
    pasivos: [{ id: 'tc-visa', nombre: 'Visa ••4521', tipo: 'tarjeta' }],
    planes: [{ compraId: 'c3', pasivoId: 'tc-visa', nCuotas: 6 }],
    miembros: [
      { id: 'santiago', nombre: 'Santiago' },
      { id: 'laura', nombre: 'Laura' },
    ],
    ...overrides,
  }
}

describe('dominio gastos generales', () => {
  it('calcula periodo anterior correctamente incluyendo cambio de año', () => {
    expect(periodoAnterior('2026-11')).toBe('2026-10')
    expect(periodoAnterior('2026-01')).toBe('2025-12')
  })

  it('agrupa por categoría en ámbito hogar, resuelve tarjetas/cuotas y compara contra el mes previo', () => {
    const res = calcularResumenGastos(baseEntrada())

    expect(res.total).toBe(500_000)
    expect(res.cantidadCompras).toBe(3)
    expect(res.promedioPorCompra).toBe(166_667)
    expect(res.comparativaAnterior).toEqual({
      totalAnterior: 400_000,
      diferencia: 100_000,
      pctTexto: '25,0 %',
    })

    expect(res.categorias).toEqual([
      {
        categoriaId: 'cat-hogar',
        nombre: 'Hogar',
        icono: 'hogar',
        total: 300_000,
        cantidad: 1,
        pctTexto: '60,0 %',
        proporcionPct: 60,
      },
      {
        categoriaId: 'cat-mercado',
        nombre: 'Mercado',
        icono: 'mercado',
        total: 200_000,
        cantidad: 2,
        pctTexto: '40,0 %',
        proporcionPct: 40,
      },
    ])

    expect(res.movimientos.map((m) => m.id)).toEqual(['c3', 'c2', 'c1'])
    expect(res.movimientos[0]).toMatchObject({
      medioNombre: 'Visa ••4521',
      medioTipo: 'tarjeta',
      cuotas: 6,
      registradoPorNombre: 'Santiago',
    })
  })

  it('aísla gastos personales propios en personal y todos sin exponer compras privadas de otro miembro', () => {
    const personal = calcularResumenGastos(baseEntrada({ ambito: 'personal' }))
    expect(personal.total).toBe(25_000)
    expect(personal.movimientos.map((m) => m.id)).toEqual(['c4'])
    expect(personal.comparativaAnterior).toBeNull()

    const todos = calcularResumenGastos(baseEntrada({ ambito: 'todos' }))
    expect(todos.total).toBe(525_000)
    expect(todos.movimientos.map((m) => m.id)).toEqual(['c4', 'c3', 'c2', 'c1'])
  })

  it('lista abonos a obligaciones del mes aparte sin sumarlos al consumo real ni categorías', () => {
    const res = calcularResumenGastos({
      ...baseEntrada({ ambito: 'hogar' }),
      pagosDeuda: [
        {
          id: 'pg-hogar',
          pasivoId: 'pas-visa',
          pasivoNombre: 'Visa ••4521',
          pasivoTipo: 'tarjeta',
          pasivoAmbito: 'hogar',
          pasivoOwnerMiembroId: 'santiago',
          tipo: 'abono',
          monto: 150_000,
          fecha: '2026-11-26',
          medioDePagoId: 'mp-nequi',
          registradoPor: 'santiago',
          nota: 'Abono mensual',
        },
        {
          id: 'pg-personal-otro',
          pasivoId: 'pas-otro',
          pasivoNombre: 'Deuda Camila',
          pasivoTipo: 'deuda',
          pasivoAmbito: 'personal',
          pasivoOwnerMiembroId: 'laura',
          tipo: 'abono',
          monto: 90_000,
          fecha: '2026-11-26',
          medioDePagoId: 'mp-nequi',
          registradoPor: 'laura',
          nota: null,
        },
        {
          id: 'pg-saldo-favor',
          pasivoId: 'pas-visa',
          pasivoNombre: 'Visa ••4521',
          pasivoTipo: 'tarjeta',
          pasivoAmbito: 'hogar',
          pasivoOwnerMiembroId: 'santiago',
          tipo: 'saldo_a_favor',
          monto: 20_000,
          fecha: '2026-11-26',
          medioDePagoId: 'mp-nequi',
          registradoPor: 'santiago',
          nota: null,
        },
      ],
    })

    expect(res.total).toBe(500_000)
    expect(res.totalAbonosDeuda).toBe(150_000)
    expect(res.abonosDeuda).toEqual([
      {
        id: 'pg-hogar',
        fecha: '2026-11-26',
        pasivoNombre: 'Visa ••4521',
        pasivoTipo: 'tarjeta',
        ambito: 'hogar',
        monto: 150_000,
        medioNombre: 'Nequi',
        medioTipo: 'cuenta',
        registradoPorNombre: 'Santiago',
        nota: 'Abono mensual',
      },
    ])
  })

  it('ordena compras del mismo día dejando arriba la registrada más recientemente (creadoEn desc)', () => {
    const res = calcularResumenGastos({
      ...baseEntrada({ ambito: 'hogar' }),
      compras: [
        {
          id: 'c-arriendo',
          fecha: '2026-11-27',
          creadoEn: '2026-11-27T08:00:00.000Z',
          descripcion: 'Arriendo noviembre',
          montoTotal: 2_400_000,
          categoriaId: 'cat-hogar',
          ambito: 'hogar',
          miembroId: null,
          pagoTipo: 'contado',
          medioDePagoId: 'mp-bancolombia',
          financiadaPorPasivoId: null,
          obligacionId: null,
          registradoPor: 'santiago',
          origen: 'manual',
        },
        {
          id: 'c-uber',
          fecha: '2026-11-27',
          creadoEn: '2026-11-27T19:15:00.000Z',
          descripcion: 'Uber regreso',
          montoTotal: 18_500,
          categoriaId: 'cat-mercado',
          ambito: 'hogar',
          miembroId: null,
          pagoTipo: 'contado',
          medioDePagoId: 'mp-nequi',
          financiadaPorPasivoId: null,
          obligacionId: null,
          registradoPor: 'laura',
          origen: 'manual',
        },
      ],
    })

    expect(res.movimientos.map((m) => m.id)).toEqual(['c-uber', 'c-arriendo'])
  })
})
