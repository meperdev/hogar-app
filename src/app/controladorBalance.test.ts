import { describe, expect, it } from 'vitest'
import {
  crearControladorBalance,
  ErrorBalance,
  type BalancePort,
  type DatosBalance,
  type ResultadoEnvioBalance,
} from './controladorBalance'
import type { LoteBalance } from '../domain/loteBalance'

const HOGAR = '01950000-0000-7000-8000-000000000010'
const ANA = '01950000-0000-7000-8000-000000000001'
const BETO = '01950000-0000-7000-8000-000000000002'
const CUENTA_ANA = '01950000-0000-7000-8000-000000000011'
const CUENTA_BETO = '01950000-0000-7000-8000-000000000012'
const CUENTA_COMUN = '01950000-0000-7000-8000-000000000013'

function crearPuertoMemoria(): BalancePort & {
  datos: DatosBalance
  enviados: LoteBalance[]
  proximoRechazo: ResultadoEnvioBalance | null
} {
  const preferencias = new Map<string, string>()
  const datos: DatosBalance = {
    hogar: { id: HOGAR, nombre: 'Casa', mostrar_pct_ingreso: false, seq: 1 },
    miembros: [
      { id: ANA, nombre: 'Ana', activo: true },
      { id: BETO, nombre: 'Beto', activo: true },
    ],
    medios: [
      { id: CUENTA_ANA, nombre: 'Cuenta Ana', tipo: 'cuenta', owner_tipo: 'miembro', owner_miembro_id: ANA, activo: true },
      { id: CUENTA_BETO, nombre: 'Cuenta Beto', tipo: 'cuenta', owner_tipo: 'miembro', owner_miembro_id: BETO, activo: true },
      { id: CUENTA_COMUN, nombre: 'Cuenta común', tipo: 'cuenta', owner_tipo: 'hogar', owner_miembro_id: null, activo: true },
    ],
    compras: [
      { id: 'c-1', fecha: '2026-11-08', monto_total: 200_000, ambito: 'hogar', miembro_id: null, pago_tipo: 'contado', medio_de_pago_id: CUENTA_ANA, financiada_por_pasivo_id: null },
      { id: 'c-per', fecha: '2026-11-09', monto_total: 140_000, ambito: 'personal', miembro_id: ANA, pago_tipo: 'contado', medio_de_pago_id: CUENTA_ANA, financiada_por_pasivo_id: null },
    ],
    pasivos: [],
    planes: [],
    costos: [],
    pagos: [],
    aportes: [
      { id: 'ap-1', medio_origen_id: CUENTA_ANA, medio_destino_id: CUENTA_COMUN, monto: 1_500_000, fecha: '2026-11-01' },
      { id: 'ap-2', medio_origen_id: CUENTA_BETO, medio_destino_id: CUENTA_COMUN, monto: 1_300_000, fecha: '2026-11-15' },
    ],
    ingresos: [
      { id: 'ing-ana', serie_id: 'ing-ana', miembro_id: ANA, tipo: 'fijo', descripcion: 'Salario Ana', monto: 4_500_000, dia_esperado: 30, vigente_desde: '2026-01-01', vigente_hasta: null, fecha: null },
      { id: 'ing-beto', serie_id: 'ing-beto', miembro_id: BETO, tipo: 'fijo', descripcion: 'Salario Beto', monto: 2_000_000, dia_esperado: 15, vigente_desde: '2026-01-01', vigente_hasta: null, fecha: null },
    ],
    recepciones: [],
  }

  let seq = 10
  const port = {
    datos,
    enviados: [] as LoteBalance[],
    proximoRechazo: null as ResultadoEnvioBalance | null,
    async cargar() {
      return structuredClone(datos)
    },
    async enviar(lote: LoteBalance): Promise<ResultadoEnvioBalance> {
      port.enviados.push(lote)
      if (port.proximoRechazo) {
        const r = port.proximoRechazo
        port.proximoRechazo = null
        return r
      }
      if (lote.tipo === 'hogar_preferencia') {
        const fila = lote.filas.hogar![0]!
        datos.hogar.mostrar_pct_ingreso = Boolean(fila.mostrar_pct_ingreso)
        datos.hogar.seq = ++seq
      } else if (lote.tipo === 'aporte') {
        const f = lote.filas.aporte![0]!
        datos.aportes.push({
          id: String(f.id),
          medio_origen_id: String(f.medio_origen_id),
          medio_destino_id: String(f.medio_destino_id),
          monto: Number(f.monto),
          fecha: String(f.fecha),
        })
      } else if (lote.tipo === 'ingreso') {
        for (const f of lote.filas.ingreso ?? []) {
          datos.ingresos.push({
            id: String(f.id),
            serie_id: (f.serie_id as string | null) ?? null,
            miembro_id: String(f.miembro_id),
            tipo: f.tipo as 'fijo' | 'variable',
            descripcion: String(f.descripcion),
            monto: Number(f.monto),
            dia_esperado: (f.dia_esperado as number | null) ?? null,
            vigente_desde: (f.vigente_desde as string | null) ?? null,
            vigente_hasta: (f.vigente_hasta as string | null) ?? null,
            fecha: (f.fecha as string | null) ?? null,
          })
        }
      } else if (lote.tipo === 'recepcion_ingreso') {
        const r = lote.filas.recepcion_ingreso![0]!
        const ing = datos.ingresos.find((i) => i.id === r.ingreso_id)!
        datos.recepciones.push({
          id: String(r.id),
          ingreso_id: String(r.ingreso_id),
          serie_id: ing.serie_id!,
          periodo: String(r.periodo),
          recibido: Boolean(r.recibido),
          monto_recibido: (r.monto_recibido as number | null) ?? null,
          fecha_recepcion: (r.fecha_recepcion as string | null) ?? null,
          seq: ++seq,
        })
      }
      return { estado: 'aplicado' }
    },
    async leerPreferencia(clave: string) {
      return preferencias.get(clave) ?? null
    },
    async guardarPreferencia(clave: string, valor: string) {
      preferencias.set(clave, valor)
    },
    async estadoLocal() {
      return {
        pendientesOutbox: 0,
        ultimaCopiaLocal: '2026-11-25T15:00:00.000Z',
        ultimoMedioNombre: 'Cuenta Ana',
        historial: [],
      }
    },
    async exportarAlcances(fecha: string) {
      return {
        hogar: { alcance: 'hogar' as const, fecha, tablas: { compra: [{ id: 'c-1', ambito: 'hogar' }] } },
        personal: { alcance: 'personal' as const, fecha, tablas: { compra: [{ id: 'c-per', ambito: 'personal' }] } },
      }
    },
  }
  return port
}

function crearControlador(port: BalancePort) {
  let n = 1
  return crearControladorBalance({
    port,
    alcance: { hogarId: HOGAR, miembroId: ANA },
    ahora: () => new Date('2026-11-25T15:00:00-05:00'),
    nuevoId: () => `01950000-0000-7000-8000-${String(n++).padStart(12, '0')}`,
  })
}

describe('controlador de balance de pareja', () => {
  it('deriva aportes, porcentajes e ingresos; respeta switches apagados por defecto', async () => {
    const port = crearPuertoMemoria()
    const ctrl = crearControlador(port)

    const vista = await ctrl.cargarMes('2026-11')
    expect(vista.mostrarPctIngreso).toBe(false)
    expect(vista.incluirPersonales).toBe(false)
    expect(vista.totalAportes).toBe(3_000_000)
    expect(vista.gastosPersonalesPropios).toBe(0)
    expect(vista.miembros.find((m) => m.miembroId === ANA)?.pctTotal).toBe('56,7 %')
    expect(vista.miembros.find((m) => m.miembroId === BETO)?.pctTotal).toBe('43,3 %')

    await ctrl.guardarIncluirPersonales(true)
    const vistaConPersonales = await ctrl.cargarMes('2026-11')
    expect(vistaConPersonales.incluirPersonales).toBe(true)
    expect(vistaConPersonales.gastosPersonalesPropios).toBe(140_000)
    expect(vistaConPersonales.totalAportes).toBe(3_000_000)
  })

  it('cambia Hogar.mostrar_pct_ingreso con base_seq y propaga conflicto', async () => {
    const port = crearPuertoMemoria()
    const ctrl = crearControlador(port)
    const actualizada = await ctrl.cambiarMostrarPctIngreso(true)
    expect(actualizada.mostrarPctIngreso).toBe(true)

    port.proximoRechazo = { estado: 'rechazado', motivo: 'conflicto' }
    await expect(ctrl.cambiarMostrarPctIngreso(false)).rejects.toThrow(ErrorBalance)
  })

  it('registra aporte al fondo común, ingreso y recepción con monto distinto', async () => {
    const port = crearPuertoMemoria()
    const ctrl = crearControlador(port)

    const medios = await ctrl.mediosParaAporte()
    expect(medios.origenes.every((m) => m.ownerTipo === 'miembro')).toBe(true)
    expect(medios.destinos.every((m) => m.ownerTipo === 'hogar')).toBe(true)

    await ctrl.registrarAporte({
      medioOrigenId: CUENTA_BETO,
      medioDestinoId: CUENTA_COMUN,
      monto: 200_000,
      fecha: '2026-11-25',
      nota: 'Extra',
    })
    await ctrl.marcarIngresoRecibido({
      ingresoId: 'ing-ana',
      periodo: '2026-11',
      montoEsperado: 4_500_000,
      montoRecibido: 4_300_000,
      fechaRecepcion: '2026-11-25',
      recepcionExistente: null,
    })
    await ctrl.registrarIngreso({
      tipo: 'variable',
      miembroId: BETO,
      descripcion: 'Bono',
      monto: 500_000,
      fecha: '2026-11-25',
    })

    const vista = await ctrl.cargarMes('2026-11')
    expect(vista.totalAportes).toBe(3_200_000)
    expect(vista.ingresos.total).toBe(6_800_000)
    expect(vista.ingresos.fijos.find((f) => f.ingresoId === 'ing-ana')?.montoEfectivo).toBe(4_300_000)
  })

  it('exporta dos ZIP separados (Hogar y Mis personales) sin mezclar filas', async () => {
    const port = crearPuertoMemoria()
    const ctrl = crearControlador(port)
    const res = await ctrl.exportarAhora()
    expect(res.hogarZip.nombreArchivo).toBe('hogar-2026-11-25.zip')
    expect(res.personalZip.nombreArchivo).toBe('personal-2026-11-25.zip')
    expect(res.hogarZip.bytes.length).toBeGreaterThan(0)
    expect(res.personalZip.bytes.length).toBeGreaterThan(0)
  })

  it('conserva aportes históricos de medios archivados y solo oculta los inactivos al transferir (I9)', async () => {
    const port = crearPuertoMemoria()
    port.datos.medios[0]!.activo = false
    const ctrl = crearControlador(port)

    const vista = await ctrl.cargarMes('2026-11')
    expect(vista.miembros.find((m) => m.miembroId === ANA)?.aporte).toBe(1_700_000)
    expect(vista.totalAportes).toBe(3_000_000)

    const medios = await ctrl.mediosParaAporte()
    expect(medios.origenes.some((m) => m.id === CUENTA_ANA)).toBe(false)
    expect(medios.origenes.some((m) => m.id === CUENTA_BETO)).toBe(true)
  })

  it('obtiene medios recién agregados en mediosParaAporte sin depender de caché previa', async () => {
    const port = crearPuertoMemoria()
    const ctrl = crearControlador(port)

    await ctrl.cargarMes('2026-11')
    port.datos.medios.push({
      id: '01950000-0000-7000-8000-000000000099',
      nombre: 'Nequi Sofía',
      tipo: 'cuenta',
      owner_tipo: 'miembro',
      owner_miembro_id: BETO,
      activo: true,
    })

    const medios = await ctrl.mediosParaAporte()
    expect(medios.origenes.some((m) => m.id === '01950000-0000-7000-8000-000000000099')).toBe(true)
  })
})
