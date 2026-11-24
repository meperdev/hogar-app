import { describe, expect, it } from 'vitest';
import {
  calendarioTarjeta,
  fechasCuotasTarjeta,
  interesesCapitalFijo,
  repartirCapital,
  tasaMensual,
} from './cuotas';

describe('repartirCapital', () => {
  it('reparte el residuo en las primeras cuotas', () => {
    expect(repartirCapital(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(repartirCapital(300000, 3)).toEqual([100000, 100000, 100000]);
  });

  it('suma exactamente el capital y deja cuotas positivas', () => {
    for (const capital of [1, 7, 99999, 1000001]) {
      for (const n of [1, 2, 3, 6, 7, 12, 24]) {
        if (capital < n) {
          expect(() => repartirCapital(capital, n)).toThrow(RangeError);
          continue;
        }
        const partes = repartirCapital(capital, n);
        expect(partes).toHaveLength(n);
        expect(partes.reduce((a, b) => a + b, 0)).toBe(capital);
        expect(partes.every((c) => c > 0)).toBe(true);
        expect(partes).toEqual([...partes].sort((a, b) => b - a));
      }
    }
  });

  it('rechaza entradas inválidas', () => {
    expect(() => repartirCapital(2, 3)).toThrow(RangeError);
    expect(() => repartirCapital(0, 1)).toThrow(RangeError);
    expect(() => repartirCapital(100, 0)).toThrow(RangeError);
    expect(() => repartirCapital(100, 1.5)).toThrow(RangeError);
    expect(() => repartirCapital(100.5, 2)).toThrow(RangeError);
  });
});

describe('fechasCuotasTarjeta', () => {
  it('usa el corte siguiente a la compra y el primer pago posterior', () => {
    expect(fechasCuotasTarjeta('2026-11-22', 15, 25, 3)).toEqual([
      '2026-12-25',
      '2027-01-25',
      '2027-02-25',
    ]);
  });

  it('usa el mismo corte cuando la compra cae el día de corte', () => {
    expect(fechasCuotasTarjeta('2026-11-15', 15, 25, 1)).toEqual(['2026-11-25']);
  });

  it('ajusta el corte 31 al último día de febrero', () => {
    expect(fechasCuotasTarjeta('2027-02-10', 31, 10, 2)).toEqual([
      '2027-03-10',
      '2027-04-10',
    ]);
  });

  it('salta al mes siguiente cuando el pago no es posterior al corte', () => {
    expect(fechasCuotasTarjeta('2026-11-01', 25, 5, 2)).toEqual([
      '2026-12-05',
      '2027-01-05',
    ]);
  });

  it('vuelve a ajustar el día de pago desde el original en cada mes', () => {
    expect(fechasCuotasTarjeta('2026-12-20', 15, 31, 3)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('rechaza entradas inválidas', () => {
    expect(() => fechasCuotasTarjeta('2026-13-01', 15, 25, 3)).toThrow(RangeError);
    expect(() => fechasCuotasTarjeta('2026-11-22', 0, 25, 3)).toThrow(RangeError);
    expect(() => fechasCuotasTarjeta('2026-11-22', 15, 32, 3)).toThrow(RangeError);
    expect(() => fechasCuotasTarjeta('2026-11-22', 15, 25, 0)).toThrow(RangeError);
  });
});

describe('tasaMensual', () => {
  it('convierte E.A. a M.V. en coma flotante', () => {
    expect(tasaMensual({ tipo: 'EA', ppm: 283200 })).toBeCloseTo(0.020997, 5);
    expect(tasaMensual({ tipo: 'EA', ppm: 280000 })).toBeCloseTo(0.0207847, 6);
  });

  it('lee M.V. directo desde partes por millón', () => {
    expect(tasaMensual({ tipo: 'MV', ppm: 20000 })).toBe(0.02);
  });

  it('rechaza tasas inválidas', () => {
    expect(() => tasaMensual({ tipo: 'MV', ppm: -1 })).toThrow(RangeError);
    expect(() => tasaMensual({ tipo: 'EA', ppm: 1.5 })).toThrow(RangeError);
  });
});

describe('interesesCapitalFijo', () => {
  it('redondea el interés una vez por cuota sobre el saldo anterior', () => {
    expect(interesesCapitalFijo([100000, 100000, 100000], 0.02)).toEqual([
      6000, 4000, 2000,
    ]);
  });
});

describe('calendarioTarjeta', () => {
  const base = {
    fechaCompra: '2026-11-22',
    monto: 300000,
    nCuotas: 3,
    diaCorte: 15,
    diaPago: 25,
  } as const;

  it('combina capital, fechas e intereses sin doble conteo', () => {
    const plan = calendarioTarjeta({ ...base, tasa: { tipo: 'EA', ppm: 283200 } });
    expect(plan.cuotas.map((c) => c.capital)).toEqual([100000, 100000, 100000]);
    expect(plan.cuotas.map((c) => c.interes)).toEqual([6299, 4199, 2100]);
    expect(plan.cuotas.map((c) => c.fechaVencimiento)).toEqual([
      '2026-12-25',
      '2027-01-25',
      '2027-02-25',
    ]);
    expect(plan.cuotas.map((c) => c.numero)).toEqual([1, 2, 3]);
    expect(plan.interesTotal).toBe(12598);
    expect(plan.tasaMensual).toBeCloseTo(0.020997, 5);
    const sumaCapital = plan.cuotas.reduce((a, c) => a + c.capital, 0);
    expect(sumaCapital).toBe(base.monto);
  });

  it('no inventa interés cuando no hay tasa', () => {
    const plan = calendarioTarjeta({ ...base, tasa: null });
    expect(plan.cuotas.every((c) => c.interes === null)).toBe(true);
    expect(plan.interesTotal).toBeNull();
    expect(plan.tasaMensual).toBeNull();
    expect(plan.cuotas.reduce((a, c) => a + c.capital, 0)).toBe(base.monto);
  });
});
