/** Monto en pesos colombianos: siempre un entero seguro (COP no usa centavos). */
export type Pesos = number & { readonly __marca: 'Pesos' };

export function esPesos(n: unknown): n is Pesos {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

export function pesos(n: number): Pesos {
  if (!esPesos(n)) {
    throw new RangeError(`No es un monto entero en COP: ${String(n)}`);
  }
  return n;
}

/** Redondea al peso más cercano con el medio hacia arriba (solo válido para x >= 0). */
export function redondearPeso(x: number): Pesos {
  if (!Number.isFinite(x) || x < 0) {
    throw new RangeError(`No se puede redondear un peso desde ${String(x)}`);
  }
  return pesos(Math.floor(x + 0.5));
}

/** Formato colombiano sin decimales: 85000 -> "$85.000", -5000 -> "-$5.000". */
export function formatearPesos(n: number): string {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`No es un monto entero en COP: ${String(n)}`);
  }
  const negativo = n < 0;
  const digitos = Math.abs(n).toString();
  const grupos: string[] = [];
  for (let fin = digitos.length; fin > 0; fin -= 3) {
    grupos.unshift(digitos.slice(Math.max(0, fin - 3), fin));
  }
  return `${negativo ? '-' : ''}$${grupos.join('.')}`;
}
