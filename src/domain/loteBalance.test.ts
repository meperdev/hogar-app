import { describe, expect, it } from 'vitest'
import {
  construirLoteAporte,
  construirLoteIngreso,
  construirLoteMostrarPctIngreso,
  construirLoteRecepcionIngreso,
  ErrorLoteBalance,
} from './loteBalance'

const HOGAR = '01950000-0000-7000-8000-000000000010'
const MIEMBRO = '01950000-0000-7000-8000-000000000001'
const MEDIO_MIEMBRO = '01950000-0000-7000-8000-000000000011'
const MEDIO_HOGAR = '01950000-0000-7000-8000-000000000013'

function secuenciaIds() {
  let n = 1
  return () => `01950000-0000-7000-8000-${String(n++).padStart(12, '0')}`
}

describe('lotes de balance (I17, I22, I24)', () => {
  it('construye lote de Aporte válido y rechaza miembro -> miembro', () => {
    const lote = construirLoteAporte(
      {
        hogarId: HOGAR,
        medioOrigenId: MEDIO_MIEMBRO,
        origenEsMiembro: true,
        medioDestinoId: MEDIO_HOGAR,
        destinoEsHogar: true,
        monto: 500_000,
        fecha: '2026-11-22',
        nota: '  Quincena  ',
      },
      secuenciaIds(),
    )
    expect(lote.tipo).toBe('aporte')
    expect(lote.filas.aporte).toHaveLength(1)
    expect(lote.filas.aporte![0]).toMatchObject({
      medio_origen_id: MEDIO_MIEMBRO,
      medio_destino_id: MEDIO_HOGAR,
      monto: 500_000,
      fecha: '2026-11-22',
      nota: 'Quincena',
    })

    expect(() =>
      construirLoteAporte(
        {
          hogarId: HOGAR,
          medioOrigenId: MEDIO_MIEMBRO,
          origenEsMiembro: true,
          medioDestinoId: '01950000-0000-7000-8000-000000000012',
          destinoEsHogar: false,
          monto: 100_000,
          fecha: '2026-11-22',
          nota: '',
        },
        secuenciaIds(),
      ),
    ).toThrow(ErrorLoteBalance)
  })

  it('construye lote de Ingreso fijo con serie_id estable y recepción opcional en el mismo lote', () => {
    const lote = construirLoteIngreso(
      {
        hogarId: HOGAR,
        miembroId: MIEMBRO,
        tipo: 'fijo',
        descripcion: 'Salario',
        monto: 4_500_000,
        diaEsperado: 30,
        vigenteDesde: '2026-11-01',
        marcarRecibido: {
          periodo: '2026-11',
          fechaRecepcion: '2026-11-25',
          montoRecibido: 4_300_000,
        },
      },
      secuenciaIds(),
    )
    expect(lote.tipo).toBe('ingreso')
    expect(lote.filas.ingreso).toHaveLength(1)
    const filaIngreso = lote.filas.ingreso![0]!
    expect(filaIngreso.serie_id).toBe(filaIngreso.id)
    expect(filaIngreso.fecha).toBeNull()
    expect(lote.filas.recepcion_ingreso).toHaveLength(1)
    expect(lote.filas.recepcion_ingreso![0]).toMatchObject({
      ingreso_id: filaIngreso.id,
      periodo: '2026-11',
      recibido: true,
      monto_recibido: 4_300_000,
      fecha_recepcion: '2026-11-25',
    })
  })

  it('construye lote de RecepcionIngreso (null cuando coincide con esperado) y preferencia de hogar', () => {
    const rec = construirLoteRecepcionIngreso(
      {
        hogarId: HOGAR,
        ingresoId: '01950000-0000-7000-8000-000000000099',
        periodo: '2026-11',
        montoEsperado: 4_500_000,
        montoRecibido: 4_500_000,
        fechaRecepcion: '2026-11-30',
        recepcionExistente: null,
      },
      secuenciaIds(),
    )
    expect(rec.filas.recepcion_ingreso![0]).toMatchObject({
      monto_recibido: null,
      recibido: true,
    })

    const pref = construirLoteMostrarPctIngreso(
      { hogarId: HOGAR, mostrarPctIngreso: true, baseSeq: 4 },
      secuenciaIds(),
    )
    expect(pref.tipo).toBe('hogar_preferencia')
    expect(pref.filas.hogar![0]).toMatchObject({
      id: HOGAR,
      base_seq: 4,
      mostrar_pct_ingreso: true,
    })
  })
})
