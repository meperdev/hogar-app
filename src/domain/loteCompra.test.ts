import { describe, expect, it } from 'vitest'
import {
  aporteDeCompra,
  construirLoteCompra,
  consumoDelHogar,
  ErrorLote,
  type EntradaLoteCompra,
} from './loteCompra'

function generadorIds() {
  let n = 0
  return () => `id-${++n}`
}

const ANA = 'miembro-ana'
const base: EntradaLoteCompra = {
  hogarId: 'hogar-1',
  actorId: ANA,
  fecha: '2026-11-22',
  descripcion: 'Mercado',
  monto: 85000,
  categoriaId: 'cat-mercado',
  ambito: 'hogar',
  pago: { tipo: 'medio', medioDePagoId: 'medio-efectivo-ana' },
  factura: null,
  alias: null,
}

const visa = {
  tipo: 'tarjeta' as const,
  pasivoId: 'pasivo-visa',
  ambito: 'hogar' as const,
  nCuotas: 3,
  diaCorte: 15,
  diaPago: 25,
  tasa: { tipo: 'EA' as const, ppm: 283200 },
}

describe('construirLoteCompra', () => {
  it('compra de contado del hogar: una compra, sin plan, sin dueño personal', () => {
    const lote = construirLoteCompra(base, generadorIds())
    const [compra] = lote.filas.compra
    expect(lote.schema_version).toBe(1)
    expect(compra).toMatchObject({
      monto_total: 85000,
      ambito: 'hogar',
      miembro_id: null,
      pago_tipo: 'contado',
      medio_de_pago_id: 'medio-efectivo-ana',
      financiada_por_pasivo_id: null,
      origen: 'manual',
    })
    expect(lote.filas.plan_de_cuotas).toEqual([])
    expect(lote.filas.cuota).toEqual([])
    expect(lote.filas.costo_financiero).toEqual([])
    expect(lote.lote_id).not.toBe(compra.id)
    // El servidor fija quién registra; el lote no lo manda.
    expect(compra).not.toHaveProperty('registrado_por')
  })

  it('compra personal: queda a nombre del actor y no aporta al hogar', () => {
    const lote = construirLoteCompra({ ...base, ambito: 'personal' }, generadorIds())
    const [compra] = lote.filas.compra
    expect(compra.ambito).toBe('personal')
    expect(compra.miembro_id).toBe(ANA)
    expect(consumoDelHogar([compra])).toBe(0)
    expect(aporteDeCompra(compra, ANA)).toBeNull()
  })

  it('compra del hogar de contado con medio de un miembro aporta a ese miembro', () => {
    const [compra] = construirLoteCompra(base, generadorIds()).filas.compra
    expect(aporteDeCompra(compra, ANA)).toEqual({ miembroId: ANA, monto: 85000 })
    expect(aporteDeCompra(compra, null)).toBeNull()
  })

  it('financiada con préstamo: marca el pasivo, no crea plan y no aporta', () => {
    const lote = construirLoteCompra(
      {
        ...base,
        monto: 60000,
        pago: {
          tipo: 'prestamo',
          pasivoId: 'pasivo-cocina',
          ambito: 'hogar',
          disponible: 100000,
          fechaGiro: '2026-11-10',
        },
      },
      generadorIds(),
    )
    const [compra] = lote.filas.compra
    expect(compra).toMatchObject({
      pago_tipo: 'contado',
      medio_de_pago_id: null,
      financiada_por_pasivo_id: 'pasivo-cocina',
    })
    expect(lote.filas.plan_de_cuotas).toEqual([])
    expect(consumoDelHogar([compra])).toBe(60000)
    expect(aporteDeCompra(compra, ANA)).toBeNull()
  })

  it('préstamo: rechaza superar lo disponible y comprar antes del giro', () => {
    const prestamo = {
      tipo: 'prestamo' as const,
      pasivoId: 'p',
      ambito: 'hogar' as const,
      disponible: 40000,
      fechaGiro: '2026-11-10',
    }
    expect(() => construirLoteCompra({ ...base, monto: 41000, pago: prestamo }, generadorIds()))
      .toThrow(ErrorLote)
    expect(() =>
      construirLoteCompra({ ...base, monto: 1000, fecha: '2026-11-05', pago: prestamo }, generadorIds()),
    ).toThrow('anterior al desembolso')
  })

  it('a cuotas con tarjeta: consumo una sola vez, cuotas y costo financiero aparte', () => {
    const lote = construirLoteCompra({ ...base, monto: 300000, pago: visa }, generadorIds())
    const [compra] = lote.filas.compra
    const [plan] = lote.filas.plan_de_cuotas
    expect(compra.pago_tipo).toBe('financiado')
    expect(compra.medio_de_pago_id).toBeNull()
    expect(plan).toMatchObject({
      origen: 'compra',
      compra_id: compra.id,
      pasivo_id: 'pasivo-visa',
      capital: 300000,
      fecha_inicio: '2026-11-22',
      n_cuotas: 3,
      fecha_primera_cuota: '2026-12-25',
      tasa_tipo: 'EA',
      tasa_ppm: 283200,
    })
    expect(lote.filas.cuota.map((c) => [c.numero, c.fecha_vencimiento, c.capital])).toEqual([
      [1, '2026-12-25', 100000],
      [2, '2027-01-25', 100000],
      [3, '2027-02-25', 100000],
    ])
    expect(lote.filas.costo_financiero.map((c) => [c.monto, c.fecha_causacion])).toEqual([
      [6299, '2026-12-25'],
      [4199, '2027-01-25'],
      [2100, '2027-02-25'],
    ])
    for (const [i, costo] of lote.filas.costo_financiero.entries()) {
      expect(costo).toMatchObject({ tipo: 'interes', origen: 'calculado', pasivo_id: 'pasivo-visa' })
      expect(costo.cuota_id).toBe(lote.filas.cuota[i]?.id)
    }
    // Sin doble conteo: el consumo es el monto total; ni cuotas ni intereses suman.
    expect(consumoDelHogar([compra])).toBe(300000)
    expect(lote.filas.cuota.reduce((s, c) => s + c.capital, 0)).toBe(compra.monto_total)
    expect(aporteDeCompra(compra, ANA)).toBeNull()
  })

  it('tarjeta sin tasa: cuotas de capital y ningún interés inventado', () => {
    const lote = construirLoteCompra(
      { ...base, monto: 100000, pago: { ...visa, tasa: null } },
      generadorIds(),
    )
    expect(lote.filas.cuota.map((c) => c.capital)).toEqual([33334, 33333, 33333])
    expect(lote.filas.costo_financiero).toEqual([])
    expect(lote.filas.plan_de_cuotas[0]).toMatchObject({ tasa_tipo: null, tasa_ppm: null })
  })

  it('tarjeta a 1 cuota: plan de una cuota en el primer pago tras el corte', () => {
    const lote = construirLoteCompra({ ...base, pago: { ...visa, nCuotas: 1, tasa: null } }, generadorIds())
    expect(lote.filas.cuota).toHaveLength(1)
    expect(lote.filas.cuota[0]).toMatchObject({ fecha_vencimiento: '2026-12-25', capital: 85000 })
  })

  it('rechaza mezclar ámbitos entre la compra y el libro del pasivo', () => {
    expect(() =>
      construirLoteCompra({ ...base, ambito: 'personal', pago: visa }, generadorIds()),
    ).toThrow('Ese medio es del hogar')
  })

  it('rechaza montos no enteros, cero o cuotas inválidas', () => {
    expect(() => construirLoteCompra({ ...base, monto: 0 }, generadorIds())).toThrow(
      'Ingresa un monto mayor a $0',
    )
    expect(() => construirLoteCompra({ ...base, monto: 850.5 }, generadorIds())).toThrow(ErrorLote)
    expect(() =>
      construirLoteCompra({ ...base, pago: { ...visa, nCuotas: 0 } }, generadorIds()),
    ).toThrow(ErrorLote)
    expect(() =>
      construirLoteCompra({ ...base, monto: 2, pago: { ...visa, nCuotas: 3 } }, generadorIds()),
    ).toThrow('no alcanza')
  })

  describe('factura y alias', () => {
    const cufe = 'a'.repeat(96)
    const factura = { origen: 'qr' as const, cufe, nitComercio: '890900608', iva: 13571 }

    it('precarga cufe, NIT e IVA informativo sin sumarlo al total', () => {
      const [compra] = construirLoteCompra({ ...base, factura }, generadorIds()).filas.compra
      expect(compra).toMatchObject({
        cufe,
        nit_comercio: '890900608',
        iva: 13571,
        monto_total: 85000,
        origen: 'qr',
      })
    })

    it('crea el alias solo en compras del hogar', () => {
      const alias = { nombre: 'Almacenes Éxito', categoriaSugeridaId: 'cat-mercado' }
      const hogar = construirLoteCompra({ ...base, factura, alias }, generadorIds())
      expect(hogar.filas.alias_comercio).toEqual([
        expect.objectContaining({ nit_comercio: '890900608', nombre: 'Almacenes Éxito' }),
      ])
      const personal = construirLoteCompra({ ...base, ambito: 'personal', factura, alias }, generadorIds())
      expect(personal.filas.alias_comercio).toEqual([])
    })

    it('rechaza un IVA mayor que el total', () => {
      expect(() =>
        construirLoteCompra({ ...base, monto: 10000, factura }, generadorIds()),
      ).toThrow('no puede superar el total')
    })
  })
})
