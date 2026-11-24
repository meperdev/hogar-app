import { describe, expect, it } from 'vitest'
import {
  aplicarTeclaCop,
  esUrlDianValida,
  fechaHoyBogota,
  formatearCop,
  formatearFechaCortaEs,
  formatearPorcentajeEs,
  nombreMesEs,
  parsearDigitosCop,
  truncarCufe,
} from './formatoCop'

describe('formatoCop y utilidades de presentación', () => {
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

  it('valida solo URLs HTTPS oficiales de la DIAN', () => {
    expect(
      esUrlDianValida('https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=1'),
    ).toBe(true)
    expect(esUrlDianValida('https://evil.example.com/dian.gov.co')).toBe(false)
    expect(esUrlDianValida('http://catalogo-vpfe.dian.gov.co/doc')).toBe(false)
  })

  it('formatea fechas civiles, mes, porcentajes y CUFE truncado', () => {
    expect(fechaHoyBogota(new Date('2026-11-24T04:00:00Z'))).toBe('2026-11-23')
    expect(formatearFechaCortaEs('2026-11-22')).toBe('22 nov')
    expect(formatearFechaCortaEs('2026-11-22', true)).toBe('22 nov 2026')
    expect(nombreMesEs('2026-11-22')).toBe('noviembre')
    expect(formatearPorcentajeEs(28.32, 2)).toBe('28,32 %')
    expect(truncarCufe('a8f39d2c11112222710e92e1')).toBe('a8f39d2c…710e92e1')
  })
})
