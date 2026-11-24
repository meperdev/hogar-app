import { describe, expect, it } from 'vitest'
import {
  aplicarTeclaCop,
  formatearFechaCortaEs,
  formatearPorcentajeEs,
  nombreMesEs,
  parsearDigitosCop,
  truncarCufe,
} from './formatoCop'

describe('utilidades visuales de compra rápida', () => {
  it('compone $85.000 con 8 -> 5 -> 000, borra y parsea dígitos', () => {
    let monto = aplicarTeclaCop(0, '000')
    expect(monto).toBe(0)
    monto = aplicarTeclaCop(aplicarTeclaCop(aplicarTeclaCop(monto, '8'), '5'), '000')
    expect(monto).toBe(85000)
    expect(aplicarTeclaCop(monto, 'borrar')).toBe(8500)
    expect(parsearDigitosCop('$85.000')).toBe(85000)
    expect(parsearDigitosCop('')).toBe(0)
  })

  it('formatea fechas cortas, mes, porcentajes y CUFE truncado', () => {
    expect(formatearFechaCortaEs('2026-11-22')).toBe('22 nov')
    expect(formatearFechaCortaEs('2026-11-22', true)).toBe('22 nov 2026')
    expect(nombreMesEs('2026-11-22')).toBe('noviembre')
    expect(formatearPorcentajeEs(28.32, 2)).toBe('28,32 %')
    expect(truncarCufe('a8f39d2c11112222710e92e1')).toBe('a8f39d2c…710e92e1')
  })
})
