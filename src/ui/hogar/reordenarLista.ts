/** Mueve un elemento de `desde` hacia `hasta` sin mutar la lista original. */
export function moverElemento<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  if (
    desde < 0 ||
    hasta < 0 ||
    desde >= lista.length ||
    hasta >= lista.length ||
    desde === hasta
  ) {
    return [...lista]
  }
  const copia = [...lista]
  const [movido] = copia.splice(desde, 1)
  if (movido === undefined) return [...lista]
  copia.splice(hasta, 0, movido)
  return copia
}

/** Acota un número al rango `[min, max]`. */
export function limitarNumero(valor: number, min: number, max: number): number {
  if (min > max) return min
  return Math.min(Math.max(valor, min), max)
}

/**
 * Calcula el índice destino usando centros fijos medidos antes de iniciar el arrastre.
 * Evita realimentar `getBoundingClientRect()` transformados durante el movimiento.
 */
export function calcularIndiceDestino(
  indiceOrigen: number,
  centroArrastradoY: number,
  centrosSlots: readonly number[],
): number {
  if (centrosSlots.length === 0) return 0
  let mejorIndice = limitarNumero(indiceOrigen, 0, centrosSlots.length - 1)
  let menorDistancia = Math.abs(centroArrastradoY - (centrosSlots[mejorIndice] ?? 0))

  for (let i = 0; i < centrosSlots.length; i += 1) {
    const distancia = Math.abs(centroArrastradoY - (centrosSlots[i] ?? 0))
    if (distancia < menorDistancia) {
      menorDistancia = distancia
      mejorIndice = i
    }
  }
  return mejorIndice
}

/**
 * Calcula cuánto debe desplazarse visualmente un hermano no arrastrado mientras el elemento
 * en `indiceOrigen` apunta temporalmente a `indiceDestino`.
 */
export function calcularDesplazamientoHermano(
  indice: number,
  indiceOrigen: number,
  indiceDestino: number,
  pasoPx: number,
): number {
  if (indice === indiceOrigen || indiceOrigen === indiceDestino) return 0
  if (indiceOrigen < indiceDestino && indice > indiceOrigen && indice <= indiceDestino) {
    return -pasoPx
  }
  if (indiceOrigen > indiceDestino && indice >= indiceDestino && indice < indiceOrigen) {
    return pasoPx
  }
  return 0
}
