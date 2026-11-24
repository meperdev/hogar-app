/**
 * IVA contenido en un total que ya lo incluye, con aritmética entera y medio
 * hacia arriba: $85.000 con IVA 19% incluido => $13.571.
 */
export function ivaIncluido(total: number, tasaPct = 19): number {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`Total inválido: ${String(total)}`);
  }
  if (!Number.isSafeInteger(tasaPct) || tasaPct < 0 || tasaPct > 100) {
    throw new RangeError(`Tarifa de IVA inválida: ${String(tasaPct)}`);
  }
  const numerador = 2 * total * tasaPct + (100 + tasaPct);
  const denominador = 2 * (100 + tasaPct);
  return Math.floor(numerador / denominador);
}

const PATRON_MONTO_DIAN = /^\d+(\.\d+)?$/;

/**
 * Convierte un monto DIAN con punto decimal a pesos enteros redondeando desde el
 * texto (sin coma flotante): '85000.50' => 85001.
 */
export function decimalAPesos(texto: string): number | null {
  const limpio = texto.trim();
  if (!PATRON_MONTO_DIAN.test(limpio)) {
    return null;
  }
  const [parteEntera = '', parteDecimal = ''] = limpio.split('.');
  const entero = Number(parteEntera);
  if (!Number.isSafeInteger(entero)) {
    return null;
  }
  const primerDecimal = parteDecimal.charAt(0);
  const redondeo = primerDecimal !== '' && primerDecimal >= '5' ? 1 : 0;
  const resultado = entero + redondeo;
  return Number.isSafeInteger(resultado) ? resultado : null;
}
