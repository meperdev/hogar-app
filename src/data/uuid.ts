/**
 * UUIDv7 del cliente (RFC 9562 §5.7).
 *
 * El servidor asigna `seq`, no ids: los ids de las filas del lote salen del
 * dispositivo. El prefijo temporal de 48 bits hace que los ids generados en
 * orden de reloj también ordenen lexicográficamente, lo que sirve de desempate
 * estable en outbox y catálogo.
 *
 * Estructura (16 bytes):
 * - bytes 0–5: instante unix en milisegundos, 48 bits big-endian.
 * - byte 6: nibble de versión `7` + 12 bits aleatorios.
 * - byte 8: variante `10` + 62 bits aleatorios.
 */

const BYTES = 16
const BYTES_ALEATORIOS = 10
const HEX = '0123456789abcdef'

function aHex(bytes: Uint8Array): string {
  let salida = ''
  for (const byte of bytes) {
    salida += HEX.charAt((byte >> 4) & 0x0f)
    salida += HEX.charAt(byte & 0x0f)
  }
  return salida
}

export function uuidV7(
  ahora: number = Date.now(),
  aleatorio: (n: number) => Uint8Array = (n) =>
    crypto.getRandomValues(new Uint8Array(n)),
): string {
  const bytes = new Uint8Array(BYTES)

  let restante = Math.floor(ahora)
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = restante % 256
    restante = Math.floor(restante / 256)
  }

  const azar = aleatorio(BYTES_ALEATORIOS)
  if (azar.length < BYTES_ALEATORIOS) {
    throw new Error('Se necesitan 10 bytes aleatorios para un UUIDv7')
  }
  for (let i = 0; i < BYTES_ALEATORIOS; i += 1) {
    const destino = i < 6 ? 6 + i : 8 + (i - 6)
    bytes[destino] = azar[i] ?? 0
  }

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = aHex(bytes)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}
