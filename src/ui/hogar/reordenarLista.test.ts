import { describe, expect, it } from 'vitest'
import {
  calcularDesplazamientoHermano,
  calcularIndiceDestino,
  limitarNumero,
  moverElemento,
} from './reordenarLista'

describe('reordenarLista', () => {
  const centros = [100, 180, 260]

  it('mantiene el índice original cuando el desplazamiento es menor a medio bloque', () => {
    expect(calcularIndiceDestino(0, 120, centros)).toBe(0)
    expect(calcularIndiceDestino(1, 155, centros)).toBe(1)
    expect(calcularIndiceDestino(1, 205, centros)).toBe(1)
  })

  it('cambia exactamente una posición al cruzar el punto medio del vecino', () => {
    expect(calcularIndiceDestino(0, 145, centros)).toBe(1)
    expect(calcularIndiceDestino(2, 215, centros)).toBe(1)
  })

  it('limita el destino al principio y final cuando el puntero sale de la lista', () => {
    expect(calcularIndiceDestino(1, -50, centros)).toBe(0)
    expect(calcularIndiceDestino(0, 999, centros)).toBe(2)
    expect(limitarNumero(150, -80, 80)).toBe(80)
    expect(limitarNumero(-120, -80, 80)).toBe(-80)
  })

  it('desplaza solo a los hermanos entre origen y destino', () => {
    expect(calcularDesplazamientoHermano(0, 0, 2, 80)).toBe(0)
    expect(calcularDesplazamientoHermano(1, 0, 2, 80)).toBe(-80)
    expect(calcularDesplazamientoHermano(2, 0, 2, 80)).toBe(-80)

    expect(calcularDesplazamientoHermano(0, 2, 1, 80)).toBe(0)
    expect(calcularDesplazamientoHermano(1, 2, 1, 80)).toBe(80)
  })

  it('reordena inmutablemente sin perder ni duplicar elementos', () => {
    const original = ['a', 'b', 'c']
    expect(moverElemento(original, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moverElemento(original, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(original).toEqual(['a', 'b', 'c'])
  })
})
