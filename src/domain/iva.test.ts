import { describe, expect, it } from 'vitest';
import { decimalAPesos, ivaIncluido } from './iva';

describe('ivaIncluido', () => {
  it('extrae el IVA incluido en el total con aritmética entera', () => {
    expect(ivaIncluido(85000)).toBe(13571);
    expect(ivaIncluido(119000)).toBe(19000);
    expect(ivaIncluido(0)).toBe(0);
  });

  it('acepta otra tarifa y rechaza entradas inválidas', () => {
    expect(ivaIncluido(100000, 0)).toBe(0);
    expect(() => ivaIncluido(-1)).toThrow(RangeError);
    expect(() => ivaIncluido(85000, 101)).toThrow(RangeError);
    expect(() => ivaIncluido(85000.5)).toThrow(RangeError);
  });
});

describe('decimalAPesos', () => {
  it('convierte montos DIAN con punto decimal a pesos enteros', () => {
    expect(decimalAPesos('85000.40')).toBe(85000);
    expect(decimalAPesos('85000.50')).toBe(85001);
    expect(decimalAPesos('13571.43')).toBe(13571);
    expect(decimalAPesos('85000')).toBe(85000);
    expect(decimalAPesos(' 85000 ')).toBe(85000);
  });

  it('devuelve null para textos que no son montos', () => {
    expect(decimalAPesos('abc')).toBeNull();
    expect(decimalAPesos('-5')).toBeNull();
    expect(decimalAPesos('85000.')).toBeNull();
    expect(decimalAPesos('')).toBeNull();
  });
});
