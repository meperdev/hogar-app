import { esFechaCivil, fechaConDia, partesFecha, ultimoDiaDelMes } from './fechas';
import { redondearPeso } from './pesos';

/** Tasa en partes por millón: 28 % E.A. = { tipo: 'EA', ppm: 280000 }. */
export type Tasa = { tipo: 'EA' | 'MV'; ppm: number };

function validarTasa(tasa: Tasa): void {
  if (!Number.isSafeInteger(tasa.ppm) || tasa.ppm < 0) {
    throw new RangeError(`Tasa inválida en partes por millón: ${String(tasa.ppm)}`);
  }
}

/** Convierte la tasa a mensual vencida sin redondear la conversión. */
export function tasaMensual(tasa: Tasa): number {
  validarTasa(tasa);
  if (tasa.tipo === 'MV') {
    return tasa.ppm / 1e6;
  }
  return Math.pow(1 + tasa.ppm / 1e6, 1 / 12) - 1;
}

/**
 * Reparte un capital entero en n cuotas: las primeras r llevan base + 1.
 * La suma es exactamente el capital y ninguna cuota queda en cero.
 */
export function repartirCapital(capital: number, n: number): number[] {
  if (!Number.isSafeInteger(capital) || !Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`Reparto inválido: capital ${String(capital)}, cuotas ${String(n)}`);
  }
  if (capital < n) {
    throw new RangeError(`El capital ${capital} no alcanza para ${n} cuotas positivas`);
  }
  const base = Math.floor(capital / n);
  const residuo = capital % n;
  return Array.from({ length: n }, (_, indice) => (indice < residuo ? base + 1 : base));
}

function desplazarMes(anio: number, mes: number, meses: number): { anio: number; mes: number } {
  const indice = anio * 12 + (mes - 1) + meses;
  const anioDesplazado = Math.floor(indice / 12);
  return { anio: anioDesplazado, mes: indice - anioDesplazado * 12 + 1 };
}

function claveFecha(anio: number, mes: number, dia: number): number {
  return anio * 10000 + mes * 100 + dia;
}

function validarDiaDelMes(dia: number, nombre: string): void {
  if (!Number.isSafeInteger(dia) || dia < 1 || dia > 31) {
    throw new RangeError(`Día de ${nombre} inválido: ${String(dia)}`);
  }
}

/**
 * Corte 1 = primer día de corte >= fecha de compra; pago 1 = primer día de pago
 * estrictamente posterior al corte; cada cuota siguiente avanza un mes reajustando
 * el día de pago original al último del mes cuando hace falta.
 */
export function fechasCuotasTarjeta(
  fechaCompra: string,
  diaCorte: number,
  diaPago: number,
  n: number,
): string[] {
  if (!esFechaCivil(fechaCompra)) {
    throw new RangeError(`Fecha de compra inválida: ${fechaCompra}`);
  }
  validarDiaDelMes(diaCorte, 'corte');
  validarDiaDelMes(diaPago, 'pago');
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`Número de cuotas inválido: ${String(n)}`);
  }

  const compra = partesFecha(fechaCompra);
  const corteDelMes = Math.min(diaCorte, ultimoDiaDelMes(compra.anio, compra.mes));
  let corte: { anio: number; mes: number; dia: number };
  if (compra.dia <= corteDelMes) {
    corte = { anio: compra.anio, mes: compra.mes, dia: corteDelMes };
  } else {
    const siguiente = desplazarMes(compra.anio, compra.mes, 1);
    corte = { ...siguiente, dia: Math.min(diaCorte, ultimoDiaDelMes(siguiente.anio, siguiente.mes)) };
  }

  let pago: { anio: number; mes: number; dia: number } = {
    anio: corte.anio,
    mes: corte.mes,
    dia: Math.min(diaPago, ultimoDiaDelMes(corte.anio, corte.mes)),
  };
  if (claveFecha(pago.anio, pago.mes, pago.dia) <= claveFecha(corte.anio, corte.mes, corte.dia)) {
    const siguiente = desplazarMes(corte.anio, corte.mes, 1);
    pago = { ...siguiente, dia: Math.min(diaPago, ultimoDiaDelMes(siguiente.anio, siguiente.mes)) };
  }

  return Array.from({ length: n }, (_, indice) => {
    const mesCuota = desplazarMes(pago.anio, pago.mes, indice);
    return fechaConDia(mesCuota.anio, mesCuota.mes, diaPago);
  });
}

/**
 * Interés de capital fijo: se redondea solo el interés de cada cuota, calculado
 * sobre el saldo de capital anterior.
 */
export function interesesCapitalFijo(capitales: number[], i: number): number[] {
  if (!Number.isFinite(i) || i < 0) {
    throw new RangeError(`Tasa mensual inválida: ${String(i)}`);
  }
  let saldo = capitales.reduce((total, capital) => total + capital, 0);
  return capitales.map((capital) => {
    const interes = redondearPeso(saldo * i);
    saldo -= capital;
    return interes;
  });
}

export type CuotaCalculada = {
  numero: number;
  fechaVencimiento: string;
  capital: number;
  interes: number | null;
};

export type CalendarioTarjeta = {
  cuotas: CuotaCalculada[];
  interesTotal: number | null;
  tasaMensual: number | null;
};

/** Calendario completo de una compra a cuotas con tarjeta. Sin tasa no hay interés. */
export function calendarioTarjeta(p: {
  fechaCompra: string;
  monto: number;
  nCuotas: number;
  diaCorte: number;
  diaPago: number;
  tasa: Tasa | null;
}): CalendarioTarjeta {
  const capitales = repartirCapital(p.monto, p.nCuotas);
  const fechas = fechasCuotasTarjeta(p.fechaCompra, p.diaCorte, p.diaPago, p.nCuotas);
  const i = p.tasa === null ? null : tasaMensual(p.tasa);
  const intereses: Array<number | null> =
    i === null ? capitales.map(() => null) : interesesCapitalFijo(capitales, i);

  const cuotas: CuotaCalculada[] = capitales.map((capital, indice) => ({
    numero: indice + 1,
    fechaVencimiento: fechas[indice] ?? '',
    capital,
    interes: intereses[indice] ?? null,
  }));

  let interesTotal: number | null = null;
  if (i !== null) {
    interesTotal = intereses.reduce<number>((total, interes) => total + (interes ?? 0), 0);
  }

  return { cuotas, interesTotal, tasaMensual: i };
}
