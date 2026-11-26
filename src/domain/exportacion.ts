export type AlcanceExportacion = 'hogar' | 'personal'

export type PaqueteExportacion = {
  alcance: AlcanceExportacion
  fecha: string
  tablas: Record<string, Array<Record<string, unknown>>>
}

export type ZipExportado = {
  alcance: AlcanceExportacion
  nombreArchivo: string
  bytes: Uint8Array
  tamanoBytes: number
  cantidadArchivos: number
}

const TABLA_CRC32 = (() => {
  const tabla = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    tabla[i] = c >>> 0
  }
  return tabla
})()

/** CRC-32 IEEE 802.3 sin signo para encabezados ZIP. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = TABLA_CRC32[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function escaparCeldaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  const texto =
    typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
  if (/[",\r\n]/.test(texto)) {
    return `"${texto.replaceAll('"', '""')}"`
  }
  return texto
}

/** Serializa una tabla de filas homogéneas en CSV RFC 4180 con encabezados ordenados. */
export function serializarCsv(filas: Array<Record<string, unknown>>): string {
  if (filas.length === 0) return ''
  const columnasSet = new Set<string>()
  for (const fila of filas) {
    for (const clave of Object.keys(fila)) {
      columnasSet.add(clave)
    }
  }
  const columnas = [...columnasSet].sort()
  if (columnas.length === 0) return ''

  const lineas = [columnas.map(escaparCeldaCsv).join(',')]
  for (const fila of filas) {
    lineas.push(columnas.map((col) => escaparCeldaCsv(fila[col])).join(','))
  }
  return `${lineas.join('\r\n')}\r\n`
}

/**
 * Escritor ZIP minimalista (método STORE = 0, UTF-8) en TypeScript puro sin
 * dependencias externas.
 */
export function generarZip(
  archivos: Array<{ nombre: string; contenido: Uint8Array }>,
): Uint8Array {
  const encoder = new TextEncoder()
  const locales: Uint8Array[] = []
  const centrales: Uint8Array[] = []
  let offset = 0

  for (const archivo of archivos) {
    const nombreBytes = encoder.encode(archivo.nombre)
    const datos = archivo.contenido
    const suma = crc32(datos)

    const local = new Uint8Array(30 + nombreBytes.length + datos.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed: 2.0
    lv.setUint16(6, 0x0800, true) // UTF-8
    lv.setUint16(8, 0, true) // STORE
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0x5421, true)
    lv.setUint32(14, suma, true)
    lv.setUint32(18, datos.length, true)
    lv.setUint32(22, datos.length, true)
    lv.setUint16(26, nombreBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nombreBytes, 30)
    local.set(datos, 30 + nombreBytes.length)

    const central = new Uint8Array(46 + nombreBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x5421, true)
    cv.setUint32(16, suma, true)
    cv.setUint32(20, datos.length, true)
    cv.setUint32(24, datos.length, true)
    cv.setUint16(28, nombreBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(nombreBytes, 46)

    locales.push(local)
    centrales.push(central)
    offset += local.length
  }

  const tamanoCentral = centrales.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, archivos.length, true)
  ev.setUint16(10, archivos.length, true)
  ev.setUint32(12, tamanoCentral, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const total = offset + tamanoCentral + eocd.length
  const salida = new Uint8Array(total)
  let pos = 0
  for (const bloque of [...locales, ...centrales, eocd]) {
    salida.set(bloque, pos)
    pos += bloque.length
  }
  return salida
}

/**
 * Empaqueta un único alcance (`hogar` o `personal`) en un archivo ZIP con
 * `datos.json` más un CSV por tabla (architecture §9.1).
 */
export function empaquetarExportacion(
  paquete: PaqueteExportacion,
): ZipExportado {
  const encoder = new TextEncoder()
  const tablasOrdenadas = Object.keys(paquete.tablas).sort()
  const jsonContenido = JSON.stringify(
    {
      alcance: paquete.alcance,
      fecha: paquete.fecha,
      tablas: Object.fromEntries(
        tablasOrdenadas.map((nombre) => [nombre, paquete.tablas[nombre] ?? []]),
      ),
    },
    null,
    2,
  )

  const archivos: Array<{ nombre: string; contenido: Uint8Array }> = [
    { nombre: 'datos.json', contenido: encoder.encode(jsonContenido) },
  ]
  for (const tabla of tablasOrdenadas) {
    const csv = serializarCsv(paquete.tablas[tabla] ?? [])
    archivos.push({
      nombre: `${tabla}.csv`,
      contenido: encoder.encode(csv),
    })
  }

  const bytes = generarZip(archivos)
  return {
    alcance: paquete.alcance,
    nombreArchivo: `${paquete.alcance}-${paquete.fecha}.zip`,
    bytes,
    tamanoBytes: bytes.length,
    cantidadArchivos: archivos.length,
  }
}
