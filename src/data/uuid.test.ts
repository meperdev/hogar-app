import { describe, expect, it } from 'vitest'
import { uuidV7 } from './uuid'

/** Bytes aleatorios fijos: aísla el orden temporal del azar. */
const aleatorioFijo = (n: number) => new Uint8Array(n).fill(0xff)

const PATRON_UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidV7', () => {
  it.each([0, 1, Date.UTC(2026, 10, 24, 12, 34, 56, 789), 2 ** 44])(
    'genera un UUIDv7 canónico y en minúsculas para el instante %s',
    (ahora) => {
      expect(uuidV7(ahora)).toMatch(PATRON_UUID_V7)
    },
  )

  it('ordena lexicográficamente en el tiempo cuando el azar es el mismo', () => {
    const base = Date.UTC(2026, 10, 24)
    const ids = [base, base + 1, base + 999, base + 1000].map((ms) =>
      uuidV7(ms, aleatorioFijo),
    )

    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('codifica el instante en los primeros 12 dígitos hexadecimales', () => {
    const ahora = Date.UTC(2026, 10, 24, 12, 34, 56, 789)
    const id = uuidV7(ahora)

    expect(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)).toBe(ahora)
  })

  it('usa los 48 bits del instante en big-endian', () => {
    const id = uuidV7(0x12_3456_789abc)

    expect(id.slice(0, 13)).toBe('12345678-9abc')
  })
})
