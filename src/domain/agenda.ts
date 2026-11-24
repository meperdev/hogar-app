import { esFechaCivil, fechaConDia } from './fechas';
import { estadosFifo, type LibroPasivo } from './deuda';

const PATRON_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

const PASO_POR_PERIODICIDAD: Record<
  'mensual' | 'bimestral' | 'trimestral' | 'anual',
  number
> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  anual: 12,
};

/** Periodo 'YYYY-MM' de una fecha civil. */
export function periodoDe(fecha: string): string {
  if (!esFechaCivil(fecha)) {
    throw new RangeError(`No es una fecha civil válida: ${fecha}`);
  }
  return fecha.slice(0, 7);
}

export function esPeriodo(s: unknown): s is string {
  return typeof s === 'string' && PATRON_PERIODO.test(s);
}

function mesDePeriodo(periodo: string): { anio: number; mes: number } {
  return { anio: Number(periodo.slice(0, 4)), mes: Number(periodo.slice(5, 7)) };
}

/**
 * Instancia de una obligación en un periodo: null si está inactiva, si el periodo
 * es anterior al inicio o si no es múltiplo del paso de su periodicidad.
 */
export function instanciaObligacion(
  obligacion: {
    diaVencimiento: number;
    periodicidad: 'mensual' | 'bimestral' | 'trimestral' | 'anual';
    mesInicio: string;
    activa: boolean;
  },
  periodo: string,
): { fechaVencimiento: string } | null {
  if (!obligacion.activa || !esPeriodo(periodo) || !esPeriodo(obligacion.mesInicio)) {
    return null;
  }
  if (periodo < obligacion.mesInicio) {
    return null;
  }
  const inicio = mesDePeriodo(obligacion.mesInicio);
  const actual = mesDePeriodo(periodo);
  const diferencia = (actual.anio - inicio.anio) * 12 + (actual.mes - inicio.mes);
  if (diferencia % PASO_POR_PERIODICIDAD[obligacion.periodicidad] !== 0) {
    return null;
  }
  return { fechaVencimiento: fechaConDia(actual.anio, actual.mes, obligacion.diaVencimiento) };
}

export function estadoObligacion(
  fechaVencimiento: string,
  pagada: boolean,
  hoy: string,
): 'pagada' | 'pendiente' | 'vencida' {
  if (pagada) {
    return 'pagada';
  }
  return fechaVencimiento < hoy ? 'vencida' : 'pendiente';
}

export type ResumenMes = {
  consumoReal: number;
  capitalPagado: number;
  capitalPendiente: number;
  costoFinanciero: number;
};

type EntradaResumen = {
  periodo: string;
  actorId: string;
  incluirPersonales: boolean;
  compras: Array<{
    monto: number;
    fecha: string;
    ambito: 'hogar' | 'personal';
    miembroId: string | null;
  }>;
  libros: Array<{
    ambito: 'hogar' | 'personal';
    ownerMiembroId: string | null;
    libro: LibroPasivo;
  }>;
  hoy: string;
};

/**
 * Resumen del mes: consumo real (compras), capital pagado y pendiente de las
 * cuotas del mes y costo financiero causado. Son tres cifras independientes.
 */
export function resumenMes(entrada: EntradaResumen): ResumenMes {
  const compraVisible = (compra: EntradaResumen['compras'][number]): boolean =>
    compra.ambito === 'hogar' ||
    (entrada.incluirPersonales && compra.miembroId === entrada.actorId);
  const libroVisible = (item: EntradaResumen['libros'][number]): boolean =>
    item.ambito === 'hogar' ||
    (entrada.incluirPersonales && item.ownerMiembroId === entrada.actorId);

  let consumoReal = 0;
  for (const compra of entrada.compras) {
    if (compraVisible(compra) && periodoDe(compra.fecha) === entrada.periodo) {
      consumoReal += compra.monto;
    }
  }

  let capitalPagado = 0;
  let capitalPendiente = 0;
  let costoFinanciero = 0;
  for (const item of entrada.libros) {
    if (!libroVisible(item)) {
      continue;
    }
    const { libro } = item;
    const estados = estadosFifo(libro, entrada.hoy);
    for (const cuota of libro.cuotas) {
      if (periodoDe(cuota.fechaVencimiento) !== entrada.periodo) {
        continue;
      }
      const estado = estados.get(cuota.id);
      if (estado === undefined) {
        continue;
      }
      const interes = libro.costos
        .filter((costo) => costo.cuotaId === cuota.id)
        .reduce((total, costo) => total + costo.monto, 0);
      const capitalCubierto = Math.min(Math.max(estado.cubierto - interes, 0), cuota.capital);
      capitalPagado += capitalCubierto;
      capitalPendiente += cuota.capital - capitalCubierto;
    }
    for (const costo of libro.costos) {
      if (periodoDe(costo.fechaCausacion) === entrada.periodo) {
        costoFinanciero += costo.monto;
      }
    }
  }

  return { consumoReal, capitalPagado, capitalPendiente, costoFinanciero };
}

/** Equivalencia entre tasa efectiva anual y mensual vencida, sin redondear. */
export function equivalenciaTasa(tasa: {
  tipo: 'EA' | 'MV';
  porcentaje: number;
}): { ea: number; mv: number } {
  if (tasa.tipo === 'EA') {
    const mv = (Math.pow(1 + tasa.porcentaje / 100, 1 / 12) - 1) * 100;
    return { ea: tasa.porcentaje, mv };
  }
  const ea = (Math.pow(1 + tasa.porcentaje / 100, 12) - 1) * 100;
  return { ea, mv: tasa.porcentaje };
}

/** Porcentaje a partes por millón: 28,32 % → 283200. */
export function porcentajeAPpm(porcentaje: number): number {
  if (!Number.isFinite(porcentaje) || porcentaje < 0) {
    throw new RangeError(`Porcentaje inválido: ${String(porcentaje)}`);
  }
  return Math.round(porcentaje * 10000);
}
