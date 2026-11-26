import { describe, expect, it } from 'vitest'
import {
  diaEsperadoEnMes,
  evaluarSerieFijaEnMes,
  resumenIngresosMes,
  versionIngresoSerie,
  type Ingreso,
  type IngresoFijo,
  type RecepcionIngreso,
} from './ingresos'

const ANA = '01950000-0000-7000-8000-000000000001'
const BETO = '01950000-0000-7000-8000-000000000002'

describe('ingresos fijos por serie y recibos (I22, I24)', () => {
  it('T-i-5: cambio de monto y de día a mitad de mes aplica el día 1 en ambos órdenes de días (10->20 y 20->10)', () => {
    const serieId = '01950000-0000-7000-8000-000000000101'
    const base = (dia1: number, dia2: number): IngresoFijo[] => [
      {
        id: serieId,
        serieId,
        miembroId: ANA,
        tipo: 'fijo',
        descripcion: 'Salario',
        monto: 4_500_000,
        diaEsperado: dia1,
        vigenteDesde: '2026-01-01',
        vigenteHasta: '2026-11-15',
      },
      {
        id: '01950000-0000-7000-8000-000000000102',
        serieId,
        miembroId: ANA,
        tipo: 'fijo',
        descripcion: 'Salario',
        monto: 4_700_000,
        diaEsperado: dia2,
        vigenteDesde: '2026-11-16',
        vigenteHasta: null,
      },
    ]

    for (const [d1, d2] of [
      [10, 20],
      [20, 10],
    ] as const) {
      const versiones = base(d1, d2)
      expect(versionIngresoSerie(versiones, '2026-10')?.id).toBe(serieId)
      expect(versionIngresoSerie(versiones, '2026-11')?.id).toBe(serieId)
      expect(versionIngresoSerie(versiones, '2026-11')?.monto).toBe(4_500_000)
      expect(versionIngresoSerie(versiones, '2026-12')?.monto).toBe(4_700_000)
    }
  })

  it('T-i-6: arranque a mitad de mes y cierre terminal en el mismo mes', () => {
    const serieAbierta: IngresoFijo[] = [
      {
        id: 's1',
        serieId: 's1',
        miembroId: ANA,
        tipo: 'fijo',
        descripcion: 'Arriendo',
        monto: 3_000_000,
        diaEsperado: 5,
        vigenteDesde: '2026-11-20',
        vigenteHasta: null,
      },
    ]
    expect(versionIngresoSerie(serieAbierta, '2026-10')).toBeNull()
    expect(versionIngresoSerie(serieAbierta, '2026-11')?.monto).toBe(3_000_000)
    expect(versionIngresoSerie(serieAbierta, '2026-12')?.monto).toBe(3_000_000)

    const serieTerminalMismoMes: IngresoFijo[] = [
      {
        id: 's2',
        serieId: 's2',
        miembroId: ANA,
        tipo: 'fijo',
        descripcion: 'Contrato corto',
        monto: 3_000_000,
        diaEsperado: 5,
        vigenteDesde: '2026-11-20',
        vigenteHasta: '2026-11-25',
      },
    ]
    expect(versionIngresoSerie(serieTerminalMismoMes, '2026-10')).toBeNull()
    expect(versionIngresoSerie(serieTerminalMismoMes, '2026-11')?.monto).toBe(3_000_000)
    expect(versionIngresoSerie(serieTerminalMismoMes, '2026-12')).toBeNull()

    const conReciboNov = evaluarSerieFijaEnMes(
      serieTerminalMismoMes,
      [
        {
          id: 'r1',
          ingresoId: 's2',
          serieId: 's2',
          periodo: '2026-11',
          recibido: true,
          montoRecibido: 3_200_000,
          fechaRecepcion: '2026-11-25',
        },
      ],
      '2026-11',
    )
    expect(conReciboNov?.montoEfectivo).toBe(3_200_000)
    expect(conReciboNov?.estado).toBe('recibido')
    expect(evaluarSerieFijaEnMes(serieTerminalMismoMes, [], '2026-12')).toBeNull()

    // Cierre a mitad de mes en un mes posterior al arranque sigue cubriendo ese mes por el día 1.
    const cierreMesPosterior: IngresoFijo[] = [
      {
        id: 's3',
        serieId: 's3',
        miembroId: ANA,
        tipo: 'fijo',
        descripcion: 'Bono',
        monto: 1_000_000,
        diaEsperado: 15,
        vigenteDesde: '2026-10-01',
        vigenteHasta: '2026-11-25',
      },
    ]
    expect(versionIngresoSerie(cierreMesPosterior, '2026-11')?.monto).toBe(1_000_000)
    expect(versionIngresoSerie(cierreMesPosterior, '2026-12')).toBeNull()
  })

  it('T-i-1 y T-i-2: recibo con monto distinto gana sobre el esperado sin alterar Ingreso.monto', () => {
    const ingresos: Ingreso[] = [
      {
        id: 'ing-ana',
        serieId: 'ing-ana',
        miembroId: ANA,
        tipo: 'fijo',
        descripcion: 'Salario',
        monto: 4_500_000,
        diaEsperado: 30,
        vigenteDesde: '2026-01-01',
        vigenteHasta: null,
      },
      {
        id: 'ing-beto',
        serieId: 'ing-beto',
        miembroId: BETO,
        tipo: 'fijo',
        descripcion: 'Salario',
        monto: 2_000_000,
        diaEsperado: 15,
        vigenteDesde: '2026-01-01',
        vigenteHasta: null,
      },
      {
        id: 'ing-var',
        serieId: null,
        miembroId: BETO,
        tipo: 'variable',
        descripcion: 'Freelance',
        monto: 1_500_000,
        fecha: '2026-11-20',
      },
    ]
    const recepciones: RecepcionIngreso[] = [
      {
        id: 'rec-ana',
        ingresoId: 'ing-ana',
        serieId: 'ing-ana',
        periodo: '2026-11',
        recibido: true,
        montoRecibido: 4_300_000,
        fechaRecepcion: '2026-11-30',
      },
      {
        id: 'rec-beto',
        ingresoId: 'ing-beto',
        serieId: 'ing-beto',
        periodo: '2026-11',
        recibido: true,
        montoRecibido: null,
        fechaRecepcion: '2026-11-15',
      },
    ]

    const nov = resumenIngresosMes(ingresos, recepciones, '2026-11', [
      { id: ANA },
      { id: BETO },
    ])
    expect(nov.totalFijos).toBe(6_300_000)
    expect(nov.totalVariables).toBe(1_500_000)
    expect(nov.total).toBe(7_800_000)
    expect(nov.porMiembro.get(ANA)).toBe(4_300_000)
    expect(nov.porMiembro.get(BETO)).toBe(3_500_000)
    expect(ingresos[0]?.monto).toBe(4_500_000)

    const dic = resumenIngresosMes(ingresos, recepciones, '2026-12', [
      { id: ANA },
      { id: BETO },
    ])
    expect(dic.porMiembro.get(ANA)).toBe(4_500_000)
    expect(dic.porMiembro.get(BETO)).toBe(2_000_000)
    expect(dic.fijos.every((f) => f.estado === 'esperado')).toBe(true)
  })

  it('T-i-7: el recibo ligado a versión anterior de la misma serie aplica y no cambia diciembre', () => {
    const serieId = 's-cambio'
    const ingresos: IngresoFijo[] = [
      {
        id: 'v1',
        serieId,
        miembroId: ANA,
        tipo: 'fijo',
        descripcion: 'Salario',
        monto: 4_500_000,
        diaEsperado: 10,
        vigenteDesde: '2026-01-01',
        vigenteHasta: '2026-11-15',
      },
      {
        id: 'v2',
        serieId,
        miembroId: ANA,
        tipo: 'fijo',
        descripcion: 'Salario',
        monto: 4_700_000,
        diaEsperado: 20,
        vigenteDesde: '2026-11-16',
        vigenteHasta: null,
      },
    ]
    const recepciones: RecepcionIngreso[] = [
      {
        id: 'r-nov',
        ingresoId: 'v1',
        serieId,
        periodo: '2026-11',
        recibido: true,
        montoRecibido: 4_700_000,
        fechaRecepcion: '2026-11-16',
      },
    ]
    const nov = evaluarSerieFijaEnMes(ingresos, recepciones, '2026-11')
    expect(nov?.version.id).toBe('v1')
    expect(nov?.montoEsperado).toBe(4_500_000)
    expect(nov?.montoEfectivo).toBe(4_700_000)

    const dic = evaluarSerieFijaEnMes(ingresos, recepciones, '2026-12')
    expect(dic?.version.id).toBe('v2')
    expect(dic?.montoEfectivo).toBe(4_700_000)
    expect(dic?.estado).toBe('esperado')
  })

  it('ajusta el día esperado 31 al último día del mes calendario', () => {
    expect(diaEsperadoEnMes(31, '2026-11')).toBe('2026-11-30')
    expect(diaEsperadoEnMes(31, '2026-02')).toBe('2026-02-28')
    expect(diaEsperadoEnMes(31, '2024-02')).toBe('2024-02-29')
  })
})
