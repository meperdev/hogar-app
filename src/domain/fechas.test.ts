import { describe, expect, it } from 'vitest';
import {
  esFechaCivil,
  fechaConDia,
  hoyCivil,
  partesFecha,
  ultimoDiaDelMes,
} from './fechas';

describe('fechas civiles', () => {
  it('calcula la fecha civil de Bogotá a partir de un instante UTC', () => {
    expect(hoyCivil(new Date('2026-12-01T04:30:00Z'))).toBe('2026-11-30');
    expect(hoyCivil(new Date('2026-12-01T05:30:00Z'))).toBe('2026-12-01');
  });

  it('rechaza fechas civiles inexistentes', () => {
    expect(esFechaCivil('2026-12-01')).toBe(true);
    expect(esFechaCivil('2026-02-30')).toBe(false);
    expect(esFechaCivil('2026-13-01')).toBe(false);
    expect(esFechaCivil('2026-1-01')).toBe(false);
    expect(esFechaCivil('hola')).toBe(false);
  });

  it('conoce el último día de cada mes, con años bisiestos', () => {
    expect(ultimoDiaDelMes(2028, 2)).toBe(29);
    expect(ultimoDiaDelMes(2027, 2)).toBe(28);
    expect(ultimoDiaDelMes(2026, 4)).toBe(30);
    expect(ultimoDiaDelMes(2026, 12)).toBe(31);
  });

  it('ajusta el día al último del mes y normaliza meses desbordados', () => {
    expect(fechaConDia(2027, 2, 31)).toBe('2027-02-28');
    expect(fechaConDia(2026, 13, 5)).toBe('2027-01-05');
    expect(fechaConDia(2026, 0, 5)).toBe('2025-12-05');
    expect(fechaConDia(2026, 11, 22)).toBe('2026-11-22');
  });

  it('parte una fecha civil válida', () => {
    expect(partesFecha('2026-11-22')).toEqual({ anio: 2026, mes: 11, dia: 22 });
    expect(() => partesFecha('2026-02-30')).toThrow(RangeError);
  });
});
