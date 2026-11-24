import { describe, expect, it } from 'vitest'
import {
  aplicarTeclaCop,
  calcularDesgloseTarjetaVisual,
  esUrlDianValida,
  formatearCop,
  formatearFechaCortaEs,
  formatearPorcentajeEs,
  parsearDigitosCop,
  parsearQrDianVisual,
  truncarCufe,
} from './formatoCop'

describe('formatoCop y teclado numérico COP', () => {
  it('formatea pesos enteros con separador de miles sin centavos', () => {
    expect(formatearCop(0)).toBe('$0')
    expect(formatearCop(85000)).toBe('$85.000')
    expect(formatearCop(300000)).toBe('$300.000')
    expect(formatearCop(1250000)).toBe('$1.250.000')
  })

  it('compone $85.000 con 8 -> 5 -> 000 y soporta borrar', () => {
    let monto = 0
    monto = aplicarTeclaCop(monto, '000')
    expect(monto).toBe(0)
    monto = aplicarTeclaCop(monto, '8')
    monto = aplicarTeclaCop(monto, '5')
    monto = aplicarTeclaCop(monto, '000')
    expect(monto).toBe(85000)
    expect(formatearCop(monto)).toBe('$85.000')

    monto = aplicarTeclaCop(monto, 'borrar')
    expect(monto).toBe(8500)
  })

  it('parsea dígitos desde texto formateado', () => {
    expect(parsearDigitosCop('$85.000')).toBe(85000)
    expect(parsearDigitosCop('')).toBe(0)
  })
})

describe('calcularDesgloseTarjetaVisual', () => {
  it('reproduce exactamente la simulación $300.000 en 3 cuotas del mockup (corte 15, pago 25, 28,32 % E.A.)', () => {
    const desglose = calcularDesgloseTarjetaVisual({
      monto: 300000,
      cuotas: 3,
      fechaCompra: '2026-11-22',
      diaCorte: 15,
      diaPago: 25,
      tasa: { tipo: 'EA', ppm: 283200 },
    })

    expect(desglose.consumoHoy).toBe(300000)
    expect(desglose.tasaMensualPct).toBe(2.0997)
    expect(desglose.interesTotal).toBe(12598)
    expect(desglose.cuotas).toEqual([
      { numero: 1, fechaVencimiento: '2026-12-25', capital: 100000, interes: 6299 },
      { numero: 2, fechaVencimiento: '2027-01-25', capital: 100000, interes: 4199 },
      { numero: 3, fechaVencimiento: '2027-02-25', capital: 100000, interes: 2100 },
    ])
  })

  it('asigna los pesos residuales a las primeras r cuotas en capital_fijo ($100.000 / 3)', () => {
    const desglose = calcularDesgloseTarjetaVisual({
      monto: 100000,
      cuotas: 3,
      fechaCompra: '2026-11-10',
      diaCorte: 15,
      diaPago: 25,
      tasa: null,
    })

    expect(desglose.cuotas.map((c) => c.capital)).toEqual([33334, 33333, 33333])
    expect(desglose.cuotas.map((c) => c.fechaVencimiento)).toEqual([
      '2026-11-25',
      '2026-12-25',
      '2027-01-25',
    ])
    expect(desglose.interesTotal).toBeNull()
    expect(desglose.tasaMensualPct).toBeNull()
    expect(desglose.cuotas.every((c) => c.interes === null)).toBe(true)
  })

  it('ajusta día de pago <= corte al mes siguiente y días 29-31 en febrero', () => {
    const desglose = calcularDesgloseTarjetaVisual({
      monto: 60000,
      cuotas: 2,
      fechaCompra: '2026-01-28',
      diaCorte: 28,
      diaPago: 5,
      tasa: null,
    })
    expect(desglose.cuotas.map((c) => c.fechaVencimiento)).toEqual([
      '2026-02-05',
      '2026-03-05',
    ])

    const finDeMes = calcularDesgloseTarjetaVisual({
      monto: 60000,
      cuotas: 2,
      fechaCompra: '2026-01-10',
      diaCorte: 15,
      diaPago: 31,
      tasa: null,
    })
    expect(finDeMes.cuotas.map((c) => c.fechaVencimiento)).toEqual([
      '2026-01-31',
      '2026-02-28',
    ])
  })
})

describe('parsearQrDianVisual y helpers de presentación', () => {
  it('parsea Formato 1 con campos, redondea centavos, ignora DocAdq y aplica alias', () => {
    const qr = [
      'NumFac: FE1234',
      'FecFac: 2026-11-22',
      'NitFac: 890900608',
      'DocAdq: 1020304050',
      'ValIva: 13571.43',
      'ValTolFac: 85000.40',
      'CUFE: a8f39d2c710e92e1abcdef01',
      'URL: https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=a8f39d2c710e92e1abcdef01',
    ].join('\n')

    const res = parsearQrDianVisual(qr, (nit) =>
      nit === '890900608'
        ? { nombreComercio: 'Almacenes Éxito', categoriaId: 'cat-mercado' }
        : null,
    )

    expect(res).toEqual({
      estado: 'precargado',
      formato: 'campos',
      factura: {
        origen: 'qr',
        cufe: 'a8f39d2c710e92e1abcdef01',
        nitComercio: '890900608',
        fecha: '2026-11-22',
        montoTotal: 85000,
        iva: 13571,
        urlVerificacion:
          'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=a8f39d2c710e92e1abcdef01',
      },
      sugerencia: { nombreComercio: 'Almacenes Éxito', categoriaId: 'cat-mercado' },
    })
    expect(JSON.stringify(res)).not.toContain('1020304050')
  })

  it('parsea Formato 2 solo URL con documentkey', () => {
    const res = parsearQrDianVisual(
      'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=c4b18e09f21a90c1882a44a2',
    )
    expect(res).toEqual({
      estado: 'precargado',
      formato: 'url',
      factura: {
        origen: 'qr',
        cufe: 'c4b18e09f21a90c1882a44a2',
        nitComercio: null,
        fecha: null,
        montoTotal: null,
        iva: null,
        urlVerificacion:
          'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=c4b18e09f21a90c1882a44a2',
      },
      sugerencia: null,
    })
  })

  it('rechaza URLs no oficiales de la DIAN y textos no válidos', () => {
    expect(esUrlDianValida('https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=1')).toBe(
      true,
    )
    expect(esUrlDianValida('https://evil.example.com/dian.gov.co')).toBe(false)
    expect(esUrlDianValida('http://catalogo-vpfe.dian.gov.co/doc')).toBe(false)
    expect(parsearQrDianVisual('texto cualquiera').estado).toBe('invalido')
  })

  it('formatea fechas, porcentajes y CUFE truncado', () => {
    expect(formatearFechaCortaEs('2026-11-22')).toBe('22 nov')
    expect(formatearFechaCortaEs('2026-11-22', true)).toBe('22 nov 2026')
    expect(formatearPorcentajeEs(28.32, 2)).toBe('28,32 %')
    expect(truncarCufe('a8f39d2c11112222710e92e1')).toBe('a8f39d2c…710e92e1')
  })
})
