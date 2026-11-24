import { describe, expect, it } from 'vitest';
import { esPesos, formatearPesos, pesos, redondearPeso } from './pesos';

describe('pesos', () => {
  it('reconoce solo enteros seguros como Pesos', () => {
    expect(esPesos(85000)).toBe(true);
    expect(esPesos(-5000)).toBe(true);
    expect(esPesos(1.5)).toBe(false);
    expect(esPesos('85000')).toBe(false);
    expect(esPesos(Number.NaN)).toBe(false);
  });

  it('crea Pesos solo con enteros seguros', () => {
    expect(pesos(85000)).toBe(85000);
    expect(() => pesos(1.5)).toThrow(RangeError);
    expect(() => pesos(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });

  it('redondea al peso más cercano con medio hacia arriba', () => {
    expect(redondearPeso(2.5)).toBe(3);
    expect(redondearPeso(2.4999)).toBe(2);
    expect(redondearPeso(0)).toBe(0);
  });

  it('rechaza negativos y valores no finitos al redondear', () => {
    expect(() => redondearPeso(-1)).toThrow(RangeError);
    expect(() => redondearPeso(Number.NaN)).toThrow(RangeError);
    expect(() => redondearPeso(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('formatea pesos colombianos con punto de miles y sin decimales', () => {
    expect(formatearPesos(85000)).toBe('$85.000');
    expect(formatearPesos(0)).toBe('$0');
    expect(formatearPesos(1234567)).toBe('$1.234.567');
    expect(formatearPesos(-5000)).toBe('-$5.000');
    expect(() => formatearPesos(1.5)).toThrow(RangeError);
  });
});
