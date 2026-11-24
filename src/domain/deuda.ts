import { esFechaCivil } from './fechas';

export type PlanLibro = {
  id: string;
  fechaInicio: string;
  capital: number;
  sistema: 'capital_fijo' | 'cuota_fija' | 'sin_calendario';
};

export type CuotaLibro = {
  id: string;
  planId: string;
  numero: number;
  fechaVencimiento: string;
  capital: number;
};

export type CostoLibro = {
  id: string;
  cuotaId: string | null;
  monto: number;
  fechaCausacion: string;
  origen: 'calculado' | 'manual';
};

export type PagoLibro = {
  id: string;
  tipo: 'abono' | 'saldo_a_favor';
  cuotaId: string | null;
  monto: number;
  fecha: string;
  registradoPor: string;
};

export type LibroPasivo = {
  planes: PlanLibro[];
  cuotas: CuotaLibro[];
  costos: CostoLibro[];
  pagos: PagoLibro[];
};

export type MotivoViolacion = 'saldo_negativo' | 'saldo_a_favor_con_saldo';

export type Violacion = { fecha: string; motivo: MotivoViolacion };

export type RecorridoLibro = {
  saldo: number;
  saldoAFavorNoAplicado: number;
  violacion: Violacion | null;
};

export type EstadoCuota = 'pagada' | 'parcial' | 'pendiente' | 'vencida';

export type EstadoCuotaFifo = {
  cargo: number;
  cubierto: number;
  restante: number;
  estado: EstadoCuota;
};

export type ResultadoAbono =
  | { estado: 'duplicado'; existente: PagoLibro }
  | { estado: 'sobrepago'; tope: number; excedente: number }
  | { estado: 'valido'; saldoAntes: number; saldoDespues: number }
  | { estado: 'invalido'; mensaje: string };

/** Cargos del libro: el capital de cada plan y cada costo financiero. Las cuotas no cargan. */
function cargosDelLibro(libro: LibroPasivo): Array<{ fecha: string; monto: number }> {
  const cargos: Array<{ fecha: string; monto: number }> = [];
  for (const plan of libro.planes) {
    cargos.push({ fecha: plan.fechaInicio, monto: plan.capital });
  }
  for (const costo of libro.costos) {
    cargos.push({ fecha: costo.fechaCausacion, monto: costo.monto });
  }
  return cargos;
}

function compararIds(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Recorre el libro fecha por fecha y deriva el saldo, el saldo a favor no aplicado
 * y la primera violación (nunca negativo, saldo a favor solo con saldo en cero).
 */
export function recorrerLibro(libro: LibroPasivo, hasta: string | null): RecorridoLibro {
  const cargos = cargosDelLibro(libro);
  const fechas = new Set<string>();
  for (const cargo of cargos) {
    fechas.add(cargo.fecha);
  }
  for (const pago of libro.pagos) {
    fechas.add(pago.fecha);
  }
  const ordenadas = [...fechas]
    .filter((fecha) => hasta === null || fecha <= hasta)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let saldo = 0;
  let pool = 0;
  let violacion: Violacion | null = null;

  for (const fecha of ordenadas) {
    const cargosFecha = cargos
      .filter((cargo) => cargo.fecha === fecha)
      .reduce((total, cargo) => total + cargo.monto, 0);
    const cubierto = Math.min(pool, cargosFecha);
    pool -= cubierto;
    saldo += cargosFecha - cubierto;

    const abonos = libro.pagos
      .filter((pago) => pago.tipo === 'abono' && pago.fecha === fecha)
      .sort(compararIds);
    for (const abono of abonos) {
      if (abono.monto > saldo && violacion === null) {
        violacion = { fecha, motivo: 'saldo_negativo' };
      }
      saldo -= abono.monto;
    }

    const saldosAFavor = libro.pagos
      .filter((pago) => pago.tipo === 'saldo_a_favor' && pago.fecha === fecha)
      .reduce((total, pago) => total + pago.monto, 0);
    if (saldosAFavor > 0 && saldo > 0 && violacion === null) {
      violacion = { fecha, motivo: 'saldo_a_favor_con_saldo' };
    }
    pool += saldosAFavor;
  }

  return { saldo, saldoAFavorNoAplicado: pool, violacion };
}

/** Tope de un abono nuevo a esa fecha: el saldo causado antes de aplicarlo. */
export function saldoCausado(libro: LibroPasivo, fecha: string): number {
  return recorrerLibro(libro, fecha).saldo;
}

type EntradaCola = {
  fecha: string;
  clase: 0 | 1;
  planInicio: string;
  numero: number;
  id: string;
  cargo: number;
  cuotaId: string | null;
  fechaVencimiento: string | null;
};

/**
 * Cola FIFO de cargos programados: cuotas (capital + costos con cuota_id), costos
 * sin cuota y el capital de planes sin_calendario. Los pagos cubren la cola en orden.
 */
export function estadosFifo(libro: LibroPasivo, hoy: string): Map<string, EstadoCuotaFifo> {
  const planesPorId = new Map(libro.planes.map((plan) => [plan.id, plan]));
  const entradas: EntradaCola[] = [];

  for (const cuota of libro.cuotas) {
    const plan = planesPorId.get(cuota.planId);
    const costosCuota = libro.costos
      .filter((costo) => costo.cuotaId === cuota.id)
      .reduce((total, costo) => total + costo.monto, 0);
    entradas.push({
      fecha: cuota.fechaVencimiento,
      clase: 1,
      planInicio: plan?.fechaInicio ?? '',
      numero: cuota.numero,
      id: cuota.id,
      cargo: cuota.capital + costosCuota,
      cuotaId: cuota.id,
      fechaVencimiento: cuota.fechaVencimiento,
    });
  }

  for (const costo of libro.costos) {
    if (costo.cuotaId !== null) {
      continue;
    }
    entradas.push({
      fecha: costo.fechaCausacion,
      clase: 0,
      planInicio: '',
      numero: 0,
      id: costo.id,
      cargo: costo.monto,
      cuotaId: null,
      fechaVencimiento: null,
    });
  }

  for (const plan of libro.planes) {
    if (plan.sistema !== 'sin_calendario') {
      continue;
    }
    entradas.push({
      fecha: plan.fechaInicio,
      clase: 1,
      planInicio: plan.fechaInicio,
      numero: 0,
      id: plan.id,
      cargo: plan.capital,
      cuotaId: null,
      fechaVencimiento: null,
    });
  }

  entradas.sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      a.clase - b.clase ||
      a.planInicio.localeCompare(b.planInicio) ||
      a.numero - b.numero ||
      a.id.localeCompare(b.id),
  );

  const totalAbonos = libro.pagos
    .filter((pago) => pago.tipo === 'abono')
    .reduce((total, pago) => total + pago.monto, 0);
  const totalSaldosAFavor = libro.pagos
    .filter((pago) => pago.tipo === 'saldo_a_favor')
    .reduce((total, pago) => total + pago.monto, 0);
  const noAplicado = recorrerLibro(libro, null).saldoAFavorNoAplicado;
  let disponible = totalAbonos + (totalSaldosAFavor - noAplicado);

  const estados = new Map<string, EstadoCuotaFifo>();
  for (const entrada of entradas) {
    const cubierto = Math.min(entrada.cargo, disponible);
    disponible -= cubierto;
    if (entrada.cuotaId === null) {
      continue;
    }
    const restante = entrada.cargo - cubierto;
    let estado: EstadoCuota;
    if (restante === 0) {
      estado = 'pagada';
    } else if (cubierto > 0) {
      estado = 'parcial';
    } else {
      estado = (entrada.fechaVencimiento ?? '') < hoy ? 'vencida' : 'pendiente';
    }
    estados.set(entrada.cuotaId, { cargo: entrada.cargo, cubierto, restante, estado });
  }

  return estados;
}

/** Cargo de una cuota: su capital más los costos enlazados a ella. */
export function cargoCuota(libro: LibroPasivo, cuotaId: string): number {
  const cuota = libro.cuotas.find((candidata) => candidata.id === cuotaId);
  if (cuota === undefined) {
    throw new RangeError(`No existe la cuota ${cuotaId} en el libro`);
  }
  const costosCuota = libro.costos
    .filter((costo) => costo.cuotaId === cuotaId)
    .reduce((total, costo) => total + costo.monto, 0);
  return cuota.capital + costosCuota;
}

/** Evalúa un abono nuevo antes de registrarlo contra el libro vigente. */
export function evaluarAbono(
  libro: LibroPasivo,
  pago: { cuotaId: string | null; monto: number; fecha: string },
): ResultadoAbono {
  if (!Number.isSafeInteger(pago.monto) || pago.monto <= 0) {
    return { estado: 'invalido', mensaje: 'Ingresa un monto mayor a $0' };
  }
  if (!esFechaCivil(pago.fecha)) {
    return { estado: 'invalido', mensaje: 'La fecha no es válida' };
  }
  if (pago.cuotaId !== null) {
    const existente = libro.pagos.find(
      (candidato) => candidato.tipo === 'abono' && candidato.cuotaId === pago.cuotaId,
    );
    if (existente !== undefined) {
      return { estado: 'duplicado', existente };
    }
    if (pago.monto < cargoCuota(libro, pago.cuotaId)) {
      return {
        estado: 'invalido',
        mensaje: 'Un pago parcial no lleva cuota: regístralo como adelanto',
      };
    }
  }
  const tope = saldoCausado(libro, pago.fecha);
  if (pago.monto > tope) {
    return { estado: 'sobrepago', tope, excedente: pago.monto - tope };
  }
  return { estado: 'valido', saldoAntes: tope, saldoDespues: tope - pago.monto };
}

/** Divide un sobrepago confirmado en el abono hasta el tope y el saldo a favor del exceso. */
export function dividirSobrepago(
  monto: number,
  tope: number,
): { abono: number | null; saldoAFavor: number } {
  if (monto <= tope) {
    throw new RangeError(`El monto ${monto} no supera el tope ${tope}`);
  }
  return { abono: tope > 0 ? tope : null, saldoAFavor: monto - tope };
}

/** Aporte del mes: solo un abono a un libro del hogar desde el medio de un miembro. */
export function aportePago(
  pago: { tipo: 'abono' | 'saldo_a_favor'; monto: number },
  ambitoPasivo: 'hogar' | 'personal',
  duenoMedio: string | null,
): { miembroId: string; monto: number } | null {
  if (pago.tipo !== 'abono' || ambitoPasivo !== 'hogar' || duenoMedio === null) {
    return null;
  }
  return { miembroId: duenoMedio, monto: pago.monto };
}
