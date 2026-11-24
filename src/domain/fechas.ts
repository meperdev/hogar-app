const PATRON_FECHA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

function esBisiesto(anio: number): boolean {
  return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
}

/** Último día del mes (mes 1..12), con años bisiestos. */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  if (!Number.isSafeInteger(anio) || !Number.isSafeInteger(mes) || mes < 1 || mes > 12) {
    throw new RangeError(`Mes inválido: ${String(mes)}`);
  }
  if (mes === 2) {
    return esBisiesto(anio) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

export function esFechaCivil(s: unknown): s is string {
  if (typeof s !== 'string' || !PATRON_FECHA_CIVIL.test(s)) {
    return false;
  }
  const anio = Number(s.slice(0, 4));
  const mes = Number(s.slice(5, 7));
  const dia = Number(s.slice(8, 10));
  if (mes < 1 || mes > 12 || dia < 1) {
    return false;
  }
  return dia <= ultimoDiaDelMes(anio, mes);
}

/** Normaliza año/mes aunque el mes desborde (13 -> enero del año siguiente). */
function normalizarMes(anio: number, mes: number): { anio: number; mes: number } {
  if (!Number.isSafeInteger(anio) || !Number.isSafeInteger(mes)) {
    throw new RangeError(`Año o mes inválido: ${String(anio)}-${String(mes)}`);
  }
  const indice = anio * 12 + (mes - 1);
  const anioNormalizado = Math.floor(indice / 12);
  return { anio: anioNormalizado, mes: indice - anioNormalizado * 12 + 1 };
}

/** Fecha civil con el día ajustado al último del mes ("los días 29 a 31 se ajustan"). */
export function fechaConDia(anio: number, mes: number, dia: number): string {
  if (!Number.isSafeInteger(dia) || dia < 1) {
    throw new RangeError(`Día inválido: ${String(dia)}`);
  }
  const normalizado = normalizarMes(anio, mes);
  const diaAjustado = Math.min(dia, ultimoDiaDelMes(normalizado.anio, normalizado.mes));
  const anioTexto = String(normalizado.anio).padStart(4, '0');
  const mesTexto = String(normalizado.mes).padStart(2, '0');
  const diaTexto = String(diaAjustado).padStart(2, '0');
  return `${anioTexto}-${mesTexto}-${diaTexto}`;
}

export function partesFecha(fecha: string): { anio: number; mes: number; dia: number } {
  if (!esFechaCivil(fecha)) {
    throw new RangeError(`No es una fecha civil válida: ${fecha}`);
  }
  return {
    anio: Number(fecha.slice(0, 4)),
    mes: Number(fecha.slice(5, 7)),
    dia: Number(fecha.slice(8, 10)),
  };
}

/** Fecha civil de hoy en America/Bogota, sin aritmética de zonas horarias propia. */
export function hoyCivil(ahora: Date): string {
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const partes = formato.formatToParts(ahora);
  const buscar = (tipo: 'year' | 'month' | 'day'): string => {
    const parte = partes.find((p) => p.type === tipo);
    if (parte === undefined) {
      throw new RangeError(`No se pudo leer la parte ${tipo} de la fecha`);
    }
    return parte.value;
  };
  return `${buscar('year').padStart(4, '0')}-${buscar('month')}-${buscar('day')}`;
}
