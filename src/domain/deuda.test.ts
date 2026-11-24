import { describe, expect, it } from 'vitest';
import {
  aportePago,
  cargoCuota,
  dividirSobrepago,
  estadosFifo,
  evaluarAbono,
  recorrerLibro,
  saldoCausado,
  type CostoLibro,
  type CuotaLibro,
  type LibroPasivo,
  type PagoLibro,
  type PlanLibro,
} from './deuda';

/** Fixture canónico "Visa ••4521" del data-model: 3 cuotas de 100.000 y un interés de 6.299. */
function planVisa(overrides: Partial<PlanLibro> = {}): PlanLibro {
  return {
    id: 'p1',
    fechaInicio: '2026-11-10',
    capital: 300000,
    sistema: 'capital_fijo',
    ...overrides,
  };
}

const cuotasVisa: CuotaLibro[] = [
  { id: 'c1', planId: 'p1', numero: 1, fechaVencimiento: '2026-11-25', capital: 100000 },
  { id: 'c2', planId: 'p1', numero: 2, fechaVencimiento: '2026-12-25', capital: 100000 },
  { id: 'c3', planId: 'p1', numero: 3, fechaVencimiento: '2027-01-25', capital: 100000 },
];

function costoK1(overrides: Partial<CostoLibro> = {}): CostoLibro {
  return {
    id: 'k1',
    cuotaId: 'c1',
    monto: 6299,
    fechaCausacion: '2026-11-25',
    origen: 'calculado',
    ...overrides,
  };
}

function pagoA1(overrides: Partial<PagoLibro> = {}): PagoLibro {
  return {
    id: 'a1',
    tipo: 'abono',
    cuotaId: 'c1',
    monto: 106299,
    fecha: '2026-11-25',
    registradoPor: 'camila',
    ...overrides,
  };
}

function libroVisa(overrides: Partial<LibroPasivo> = {}): LibroPasivo {
  return {
    planes: [planVisa()],
    cuotas: cuotasVisa,
    costos: [costoK1()],
    pagos: [],
    ...overrides,
  };
}

describe('saldoCausado', () => {
  it('suma el capital del plan y los costos causados hasta la fecha', () => {
    expect(saldoCausado(libroVisa(), '2026-11-25')).toBe(306299);
    expect(saldoCausado(libroVisa(), '2026-11-24')).toBe(300000);
  });

  it('usa el interés corregido del extracto cuando el costo es manual', () => {
    const libro = libroVisa({ costos: [costoK1({ monto: 7000, origen: 'manual' })] });
    expect(saldoCausado(libro, '2026-11-25')).toBe(307000);
    expect(cargoCuota(libro, 'c1')).toBe(107000);
  });

  it('trata el saldo inicial de un plan sin_calendario como cargo en su fecha', () => {
    const libro: LibroPasivo = {
      planes: [
        { id: 'p0', fechaInicio: '2026-10-01', capital: 500000, sistema: 'sin_calendario' },
      ],
      cuotas: [],
      costos: [],
      pagos: [],
    };
    expect(saldoCausado(libro, '2026-10-01')).toBe(500000);
    expect(saldoCausado(libro, '2026-09-30')).toBe(0);
  });
});

describe('cargoCuota', () => {
  it('suma el capital de la cuota y sus costos con cuota_id', () => {
    expect(cargoCuota(libroVisa(), 'c1')).toBe(106299);
    expect(cargoCuota(libroVisa(), 'c2')).toBe(100000);
  });

  it('rechaza una cuota inexistente', () => {
    expect(() => cargoCuota(libroVisa(), 'no-existe')).toThrow(RangeError);
  });
});

describe('evaluarAbono', () => {
  it('acepta un abono que cubre la cuota completa', () => {
    expect(evaluarAbono(libroVisa(), { cuotaId: 'c1', monto: 106299, fecha: '2026-11-25' })).toEqual({
      estado: 'valido',
      saldoAntes: 306299,
      saldoDespues: 200000,
    });
  });

  it('rechaza un monto no positivo y una fecha no civil', () => {
    expect(
      evaluarAbono(libroVisa(), { cuotaId: null, monto: 0, fecha: '2026-11-25' }),
    ).toEqual({ estado: 'invalido', mensaje: 'Ingresa un monto mayor a $0' });
    expect(
      evaluarAbono(libroVisa(), { cuotaId: null, monto: 1000, fecha: '2026-02-30' }),
    ).toEqual({ estado: 'invalido', mensaje: 'La fecha no es válida' });
  });

  it('rechaza un pago parcial con cuota', () => {
    expect(
      evaluarAbono(libroVisa(), { cuotaId: 'c1', monto: 50000, fecha: '2026-11-25' }),
    ).toEqual({
      estado: 'invalido',
      mensaje: 'Un pago parcial no lleva cuota: regístralo como adelanto',
    });
  });

  it('detecta el duplicado antes del tope, aunque el saldo alcance', () => {
    const libro = libroVisa({ pagos: [pagoA1()] });
    const resultado = evaluarAbono(libro, {
      cuotaId: 'c1',
      monto: 106299,
      fecha: '2026-11-26',
    });
    expect(resultado).toEqual({ estado: 'duplicado', existente: pagoA1() });
    expect(saldoCausado(libro, '2026-11-26')).toBe(200000);
  });

  it('detecta el sobrepago contra el saldo causado antes del abono', () => {
    const libro = libroVisa({ pagos: [pagoA1()] });
    expect(
      evaluarAbono(libro, { cuotaId: null, monto: 250000, fecha: '2026-11-26' }),
    ).toEqual({ estado: 'sobrepago', tope: 200000, excedente: 50000 });
  });
});

describe('recorrerLibro', () => {
  const pagoSaf = (overrides: Partial<PagoLibro> = {}): PagoLibro => ({
    id: 's1',
    tipo: 'saldo_a_favor',
    cuotaId: null,
    monto: 50000,
    fecha: '2026-11-26',
    registradoPor: 'camila',
    ...overrides,
  });

  const pagoAdelanto = (overrides: Partial<PagoLibro> = {}): PagoLibro => ({
    id: 'a2',
    tipo: 'abono',
    cuotaId: null,
    monto: 200000,
    fecha: '2026-11-26',
    registradoPor: 'camila',
    ...overrides,
  });

  it('aplica abonos y deja el saldo a favor sin aplicar', () => {
    const libro = libroVisa({ pagos: [pagoA1(), pagoAdelanto(), pagoSaf()] });
    expect(recorrerLibro(libro, null)).toEqual({
      saldo: 0,
      saldoAFavorNoAplicado: 50000,
      violacion: null,
    });
  });

  it('aplica el saldo a favor solo a cargos posteriores a su fecha', () => {
    const libro = libroVisa({
      costos: [
        costoK1(),
        {
          id: 'k2',
          cuotaId: null,
          monto: 3000,
          fechaCausacion: '2026-12-01',
          origen: 'manual',
        },
      ],
      pagos: [pagoA1(), pagoAdelanto(), pagoSaf()],
    });
    expect(recorrerLibro(libro, null)).toEqual({
      saldo: 0,
      saldoAFavorNoAplicado: 47000,
      violacion: null,
    });
  });

  it('marca saldo_a_favor_con_saldo cuando hay saldo pendiente', () => {
    const libro: LibroPasivo = {
      planes: [planVisa()],
      cuotas: [],
      costos: [],
      pagos: [pagoSaf()],
    };
    expect(recorrerLibro(libro, null)).toEqual({
      saldo: 300000,
      saldoAFavorNoAplicado: 50000,
      violacion: { fecha: '2026-11-26', motivo: 'saldo_a_favor_con_saldo' },
    });
  });

  it('marca saldo_negativo cuando un abono excede el saldo', () => {
    const libro: LibroPasivo = {
      planes: [planVisa()],
      cuotas: [],
      costos: [],
      pagos: [pagoAdelanto({ monto: 400000 })],
    };
    expect(recorrerLibro(libro, null)).toEqual({
      saldo: -100000,
      saldoAFavorNoAplicado: 0,
      violacion: { fecha: '2026-11-26', motivo: 'saldo_negativo' },
    });
  });
});

describe('estadosFifo', () => {
  it('marca pagada la cuota cubierta y pendiente la futura', () => {
    const libro = libroVisa({ pagos: [pagoA1()] });
    const estados = estadosFifo(libro, '2026-11-26');
    expect(estados.get('c1')).toEqual({
      cargo: 106299,
      cubierto: 106299,
      restante: 0,
      estado: 'pagada',
    });
    expect(estados.get('c2')).toEqual({
      cargo: 100000,
      cubierto: 0,
      restante: 100000,
      estado: 'pendiente',
    });
    expect(estados.get('c3')?.estado).toBe('pendiente');
  });

  it('marca parcial con su restante y vencida sin pago', () => {
    const libro: LibroPasivo = {
      planes: [
        { id: 'p1', fechaInicio: '2026-11-01', capital: 100000, sistema: 'capital_fijo' },
      ],
      cuotas: [
        { id: 'c1', planId: 'p1', numero: 1, fechaVencimiento: '2026-11-25', capital: 100000 },
      ],
      costos: [],
      pagos: [
        {
          id: 'a1',
          tipo: 'abono',
          cuotaId: null,
          monto: 60000,
          fecha: '2026-11-20',
          registradoPor: 'camila',
        },
      ],
    };
    expect(estadosFifo(libro, '2026-11-26').get('c1')).toEqual({
      cargo: 100000,
      cubierto: 60000,
      restante: 40000,
      estado: 'parcial',
    });
    expect(estadosFifo({ ...libro, pagos: [] }, '2026-11-26').get('c1')?.estado).toBe('vencida');
  });

  it('cubre el saldo a favor aplicado además de los abonos', () => {
    // El saldo a favor cubre un cargo posterior (el capital de p2) y ese monto
    // aplicado vuelve a estar disponible para la cola FIFO.
    const libro: LibroPasivo = {
      planes: [
        { id: 'p1', fechaInicio: '2026-11-01', capital: 100000, sistema: 'capital_fijo' },
        { id: 'p2', fechaInicio: '2026-11-15', capital: 20000, sistema: 'capital_fijo' },
      ],
      cuotas: [
        { id: 'c1', planId: 'p1', numero: 1, fechaVencimiento: '2026-11-25', capital: 100000 },
        { id: 'c2', planId: 'p2', numero: 1, fechaVencimiento: '2026-12-20', capital: 20000 },
      ],
      costos: [],
      pagos: [
        {
          id: 'a1',
          tipo: 'abono',
          cuotaId: null,
          monto: 100000,
          fecha: '2026-11-05',
          registradoPor: 'camila',
        },
        {
          id: 's1',
          tipo: 'saldo_a_favor',
          cuotaId: null,
          monto: 50000,
          fecha: '2026-11-10',
          registradoPor: 'camila',
        },
      ],
    };
    const estados = estadosFifo(libro, '2026-11-26');
    expect(estados.get('c1')).toEqual({
      cargo: 100000,
      cubierto: 100000,
      restante: 0,
      estado: 'pagada',
    });
    expect(estados.get('c2')).toEqual({
      cargo: 20000,
      cubierto: 20000,
      restante: 0,
      estado: 'pagada',
    });
  });
});

describe('dividirSobrepago', () => {
  it('divide el exceso entre abono y saldo a favor', () => {
    expect(dividirSobrepago(250000, 200000)).toEqual({ abono: 200000, saldoAFavor: 50000 });
    expect(dividirSobrepago(5000, 0)).toEqual({ abono: null, saldoAFavor: 5000 });
  });

  it('rechaza un monto que no supera el tope', () => {
    expect(() => dividirSobrepago(5000, 5000)).toThrow(RangeError);
    expect(() => dividirSobrepago(4000, 5000)).toThrow(RangeError);
  });
});

describe('aportePago', () => {
  it('solo aporta el abono de un libro del hogar desde un medio de un miembro', () => {
    expect(aportePago({ tipo: 'abono', monto: 106299 }, 'hogar', 'camila')).toEqual({
      miembroId: 'camila',
      monto: 106299,
    });
    expect(aportePago({ tipo: 'abono', monto: 106299 }, 'hogar', null)).toBeNull();
    expect(aportePago({ tipo: 'abono', monto: 106299 }, 'personal', 'camila')).toBeNull();
    expect(aportePago({ tipo: 'saldo_a_favor', monto: 50000 }, 'hogar', 'camila')).toBeNull();
  });
});
