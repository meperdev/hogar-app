import { describe, expect, it } from 'vitest'
import {
  crc32,
  empaquetarExportacion,
  generarZip,
  serializarCsv,
} from './exportacion'

function leerEntradasZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decodificador = new TextDecoder()
  const entradas = new Map<string, string>()
  let offset = 0
  while (offset + 4 <= bytes.length) {
    const firma = view.getUint32(offset, true)
    if (firma !== 0x04034b50) break
    const tamanoComprimido = view.getUint32(offset + 18, true)
    const largoNombre = view.getUint16(offset + 26, true)
    const largoExtra = view.getUint16(offset + 28, true)
    const inicioNombre = offset + 30
    const nombre = decodificador.decode(bytes.subarray(inicioNombre, inicioNombre + largoNombre))
    const inicioDatos = inicioNombre + largoNombre + largoExtra
    const contenido = decodificador.decode(bytes.subarray(inicioDatos, inicioDatos + tamanoComprimido))
    entradas.set(nombre, contenido)
    offset = inicioDatos + tamanoComprimido
  }
  return entradas
}

describe('exportación ZIP y CSV (JSON + CSV, alcances separados)', () => {
  it('calcula el CRC-32 IEEE estándar para el vector "123456789"', () => {
    const bytes = new TextEncoder().encode('123456789')
    expect(crc32(bytes)).toBe(0xcbf43926)
  })

  it('serializa CSV RFC 4180 escapando comillas, comas y saltos de línea', () => {
    const csv = serializarCsv([
      { id: '1', nota: 'Pan, leche', monto: 5000, vacio: null },
      { id: '2', nota: 'Dice "hola"\nfin', monto: 8000, vacio: undefined },
    ])
    expect(csv).toBe(
      'id,monto,nota,vacio\r\n1,5000,"Pan, leche",\r\n2,8000,"Dice ""hola""\nfin",\r\n',
    )
  })

  it('empaqueta exactamente dos ZIPs separados con datos.json y un CSV por tabla', () => {
    const zipHogar = empaquetarExportacion({
      alcance: 'hogar',
      fecha: '2026-11-25',
      tablas: {
        compra: [{ id: 'c-hogar', monto_total: 120_000, ambito: 'hogar' }],
        aporte: [{ id: 'ap-1', monto: 500_000 }],
      },
    })
    const zipPersonal = empaquetarExportacion({
      alcance: 'personal',
      fecha: '2026-11-25',
      tablas: {
        compra: [{ id: 'c-mia', monto_total: 45_000, ambito: 'personal' }],
      },
    })

    expect(zipHogar.nombreArchivo).toBe('hogar-2026-11-25.zip')
    expect(zipPersonal.nombreArchivo).toBe('personal-2026-11-25.zip')

    const entradasHogar = leerEntradasZip(zipHogar.bytes)
    expect([...entradasHogar.keys()]).toEqual(['datos.json', 'aporte.csv', 'compra.csv'])
    expect(entradasHogar.get('datos.json')).toContain('c-hogar')
    expect(entradasHogar.get('datos.json')).not.toContain('c-mia')

    const entradasPersonal = leerEntradasZip(zipPersonal.bytes)
    expect([...entradasPersonal.keys()]).toEqual(['datos.json', 'compra.csv'])
    expect(entradasPersonal.get('datos.json')).toContain('c-mia')
    expect(entradasPersonal.get('datos.json')).not.toContain('c-hogar')

    // Firma EOCD al final
    const zipVacio = generarZip([])
    expect(new DataView(zipVacio.buffer).getUint32(0, true)).toBe(0x06054b50)
  })
})
