import { describe, expect, it } from 'vitest';
import {
  equivalenciaTasa,
  esPeriodo,
  estadoObligacion,
  instanciaObligacion,
  periodoDe,
  porcentajeAPpm,
  resumenMes,
} from './agenda';
import type { LibroPasivo } from './deuda';

describe('periodoDe y esPeriodo', () => {
  it('extrae el periodo YYYY-MM de una fecha civil', () => {
    expect(periodoDe('2026-11-05')).toBe('2026-11');
    expect(periodoDe('2027-01-31')).toBe('2027-01');
  });

  it('reconoce solo periodos válidos', () => {
    expect(esPeriodo('2026-11')).toBe(true);
    expect(esPeriodo('2026-01')).toBe(true);
    expect(esPeriodo('2026-13')).toBe(false);
    expect(esPeriodo('2026-00')).toBe(false);
    expect(esPeriodo('2026-1')).toBe(false);
    expect(esPeriodo('2026-11-01')).toBe(false);
    expect(esPeriodo(null)).toBe(false);
  });
});

describe('instanciaObligacion', () => {
  const mensual = {
    diaVencimiento: 31,
    periodicidad: 'mensual',
    mesInicio: '2026-01',
    activa: true,
  } as const;

  it('ajusta el día al último del mes', () => {
    expect(instanciaObligacion(mensual, '2026-02')).toEqual({ fechaVencimiento: '2026-02-28' });
    expect(instanciaObligacion(mensual, '2026-03')).toEqual({ fechaVencimiento: '2026-03-31' });
  });

  it('solo instancia meses múltiplos del paso', () => {
    const bimestral = {
      diaVencimiento: 15,
      periodicidad: 'bimestral',
      mesInicio: '2026-01',
      activa: true,
    } as const;
    expect(instanciaObligacion(bimestral, '2026-02')).toBeNull();
    expect(instanciaObligacion(bimestral, '2026-03')).toEqual({ fechaVencimiento: '2026-03-15' });
    expect(instanciaObligacion(bimestral, '2026-05')).toEqual({ fechaVencimiento: '2026-05-15' });
    expect(instanciaObligacion(bimestral, '2026-04')).toBeNull();
  });

  it('no instancia meses anteriores al inicio ni obligaciones inactivas', () => {
    expect(instanciaObligacion(mensual, '2025-12')).toBeNull();
    expect(instanciaObligacion({ ...mensual, activa: false }, '2026-02')).toBeNull();
  });

  it('respeta los pasos trimestral y anual', () => {
    const trimestral = {
      diaVencimiento: 5,
      periodicidad: 'trimestral',
      mesInicio: '2026-01',
      activa: true,
    } as const;
    expect(instanciaObligacion(trimestral, '2026-02')).toBeNull();
    expect(instanciaObligacion(trimestral, '2026-04')).toEqual({ fechaVencimiento: '2026-04-05' });
    const anual = {
      diaVencimiento: 1,
      periodicidad: 'anual',
      mesInicio: '2026-03',
      activa: true,
    } as const;
    expect(instanciaObligacion(anual, '2027-02')).toBeNull();
    expect(instanciaObligacion(anual, '2027-03')).toEqual({ fechaVencimiento: '2027-03-01' });
  });
});

describe('estadoObligacion', () => {
  it('deriva pagada, pendiente y vencida', () => {
    expect(estadoObligacion('2026-11-10', true, '2026-12-01')).toBe('pagada');
    expect(estadoObligacion('2026-11-10', false, '2026-11-10')).toBe('pendiente');
    expect(estadoObligacion('2026-11-10', false, '2026-11-11')).toBe('vencida');
  });
});

describe('resumenMes', () => {
  const visa: LibroPasivo = {
    planes: [
      { id: 'p1', fechaInicio: '2026-11-10', capital: 300000, sistema: 'capital_fijo' },
    ],
    cuotas: [
      { id: 'c1', planId: 'p1', numero: 1, fechaVencimiento: '2026-11-25', capital: 100000 },
      { id: 'c2', planId: 'p1', numero: 2, fechaVencimiento: '2026-12-25', capital: 100000 },
      { id: 'c3', planId: 'p1', numero: 3, fechaVencimiento: '2027-01-25', capital: 100000 },
    ],
    costos: [
      {
        id: 'k1',
        cuotaId: 'c1',
        monto: 6299,
        fechaCausacion: '2026-11-25',
        origen: 'calculado',
      },
    ],
    pagos: [
      {
        id: 'a1',
        tipo: 'abono',
        cuotaId: 'c1',
        monto: 106299,
        fecha: '2026-11-25',
        registradoPor: 'camila',
      },
    ],
  };

  const entrada: Parameters<typeof resumenMes>[0] = {
    periodo: '2026-11',
    actorId: 'camila',
    incluirPersonales: false,
    compras: [
      { monto: 1800000, fecha: '2026-11-05', ambito: 'hogar', miembroId: null },
      { monto: 300000, fecha: '2026-11-10', ambito: 'hogar', miembroId: null },
      { monto: 140000, fecha: '2026-11-12', ambito: 'personal', miembroId: 'camila' },
      { monto: 90000, fecha: '2026-12-02', ambito: 'hogar', miembroId: null },
    ],
    libros: [{ ambito: 'hogar', ownerMiembroId: null, libro: visa }],
    hoy: '2026-11-26',
  };

  it('suma el consumo del hogar una sola vez por compra', () => {
    expect(resumenMes(entrada)).toEqual({
      consumoReal: 2100000,
      capitalPagado: 100000,
      capitalPendiente: 0,
      costoFinanciero: 6299,
    });
  });

  it('incluye las compras personales del actor cuando se piden', () => {
    expect(resumenMes({ ...entrada, incluirPersonales: true })).toEqual({
      consumoReal: 2240000,
      capitalPagado: 100000,
      capitalPendiente: 0,
      costoFinanciero: 6299,
    });
  });

  it('un PagoDeDeuda nunca cambia el consumo real', () => {
    const sinPago = resumenMes({
      ...entrada,
      libros: [{ ambito: 'hogar', ownerMiembroId: null, libro: { ...visa, pagos: [] } }],
    });
    expect(sinPago.consumoReal).toBe(resumenMes(entrada).consumoReal);
    expect(sinPago.capitalPagado).toBe(0);
    expect(sinPago.capitalPendiente).toBe(100000);
  });
});

describe('equivalenciaTasa', () => {
  it('convierte EA a MV y devuelve la dada sin redondear', () => {
    const resultado = equivalenciaTasa({ tipo: 'EA', porcentaje: 28.32 });
    expect(resultado.ea).toBe(28.32);
    expect(resultado.mv).toBeCloseTo(2.0997, 4);
  });

  it('convierte MV a EA y conserva la dada en el viaje de ida y vuelta', () => {
    const mv = equivalenciaTasa({ tipo: 'EA', porcentaje: 28.32 }).mv;
    const vuelta = equivalenciaTasa({ tipo: 'MV', porcentaje: mv });
    expect(vuelta.mv).toBe(mv);
    expect(vuelta.ea).toBeCloseTo(28.32, 6);
  });
});

describe('porcentajeAPpm', () => {
  it('lleva el porcentaje a partes por millón', () => {
    expect(porcentajeAPpm(28.32)).toBe(283200);
    expect(porcentajeAPpm(0)).toBe(0);
  });

  it('rechaza porcentajes no finitos o negativos', () => {
    expect(() => porcentajeAPpm(-1)).toThrow(RangeError);
    expect(() => porcentajeAPpm(Number.NaN)).toThrow(RangeError);
    expect(() => porcentajeAPpm(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
