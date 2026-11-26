import { calcularBalanceMes, formatearPorcentaje } from '../domain/balance'
import { empaquetarExportacion, type PaqueteExportacion } from '../domain/exportacion'
import { hoyCivil } from '../domain/fechas'
import type { Ingreso, RecepcionIngreso } from '../domain/ingresos'
import {
  construirLoteAporte,
  construirLoteIngreso,
  construirLoteMostrarPctIngreso,
  construirLoteRecepcionIngreso,
  ErrorLoteBalance,
  type LoteBalance,
} from '../domain/loteBalance'
import { formatearPesos } from '../domain/pesos'
import type {
  BorradorAporte,
  BorradorIngreso,
  BorradorRecepcion,
  ControladorBalance,
  EstadoAjustes,
  IngresoFijoVista,
  IngresoVariableVista,
  RespaldoHistorial,
  VistaBalanceMes,
} from './balance'
import type { AlcanceCompra } from './compraRapida'
import { clavePreferenciaIncluirPersonales } from './controladorObligaciones'

export type DatosBalance = {
  hogar: {
    id: string
    nombre: string
    mostrar_pct_ingreso: boolean
    seq: number
  }
  miembros: Array<{
    id: string
    nombre: string
    activo: boolean
  }>
  medios: Array<{
    id: string
    nombre: string
    tipo: 'efectivo' | 'cuenta'
    owner_tipo: 'miembro' | 'hogar'
    owner_miembro_id: string | null
  }>
  compras: Array<{
    id: string
    fecha: string
    monto_total: number
    ambito: 'hogar' | 'personal'
    miembro_id: string | null
    pago_tipo: 'contado' | 'financiado'
    medio_de_pago_id: string | null
    financiada_por_pasivo_id: string | null
  }>
  pasivos: Array<{
    id: string
    ambito: 'hogar' | 'personal'
    owner_miembro_id: string | null
  }>
  planes: Array<{
    id: string
    pasivo_id: string
    fecha_inicio: string
    capital: number
  }>
  costos: Array<{
    id: string
    pasivo_id: string | null
    medio_de_pago_id: string | null
    monto: number
    fecha_causacion: string
  }>
  pagos: Array<{
    id: string
    pasivo_id: string
    tipo: 'abono' | 'saldo_a_favor'
    medio_de_pago_id: string
    monto: number
    fecha: string
  }>
  aportes: Array<{
    id: string
    medio_origen_id: string
    medio_destino_id: string
    monto: number
    fecha: string
  }>
  ingresos: Array<{
    id: string
    serie_id: string | null
    miembro_id: string
    tipo: 'fijo' | 'variable'
    descripcion: string
    monto: number
    dia_esperado: number | null
    vigente_desde: string | null
    vigente_hasta: string | null
    fecha: string | null
  }>
  recepciones: Array<{
    id: string
    ingreso_id: string
    serie_id: string
    periodo: string
    recibido: boolean
    monto_recibido: number | null
    fecha_recepcion: string | null
    seq: number
  }>
}

export type ResultadoEnvioBalance =
  | { estado: 'aplicado' }
  | { estado: 'rechazado'; motivo: string; detalle?: string }

export type EstadoLocalDispositivo = {
  pendientesOutbox: number
  ultimaCopiaLocal: string | null
  ultimoMedioNombre: string | null
  historial: RespaldoHistorial[]
}

export interface BalancePort {
  cargar(): Promise<DatosBalance>
  enviar(lote: LoteBalance): Promise<ResultadoEnvioBalance>
  leerPreferencia(clave: string): Promise<string | null>
  guardarPreferencia(clave: string, valor: string): Promise<void>
  estadoLocal(): Promise<EstadoLocalDispositivo>
  exportarAlcances(fecha: string): Promise<{
    hogar: PaqueteExportacion
    personal: PaqueteExportacion
  }>
}

export type DependenciasBalance = {
  port: BalancePort
  alcance: AlcanceCompra
  ahora: () => Date
  nuevoId: () => string
}

export class ErrorBalance extends Error {
  readonly campo: string

  constructor(campo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorBalance'
    this.campo = campo
  }
}

export function mensajeRechazoBalance(r: {
  motivo: string
  detalle?: string
}): string {
  const detalle = r.detalle ?? ''
  if (r.motivo === 'duplicado' && detalle.includes('recepcion_ingreso')) {
    return 'Ese ingreso ya fue marcado como recibido en ese mes'
  }
  if (r.motivo === 'duplicado') {
    return 'Ese registro ya existe en el servidor'
  }
  if (r.motivo === 'conflicto') {
    return 'Otro dispositivo modificó este registro: recarga e intenta de nuevo'
  }
  if (r.motivo === 'no_autorizado') {
    return 'No tienes permiso para registrar este movimiento'
  }
  if (r.motivo === 'actualizar_app') {
    return 'Actualiza la app para sincronizar este cambio'
  }
  return 'El servidor rechazó el registro'
}

function mapearIngresos(filas: DatosBalance['ingresos']): Ingreso[] {
  return filas.map((fila) =>
    fila.tipo === 'fijo'
      ? {
          id: fila.id,
          serieId: fila.serie_id ?? fila.id,
          miembroId: fila.miembro_id,
          tipo: 'fijo',
          descripcion: fila.descripcion,
          monto: fila.monto,
          diaEsperado: fila.dia_esperado ?? 1,
          vigenteDesde: fila.vigente_desde ?? '2026-01-01',
          vigenteHasta: fila.vigente_hasta,
        }
      : {
          id: fila.id,
          serieId: null,
          miembroId: fila.miembro_id,
          tipo: 'variable',
          descripcion: fila.descripcion,
          monto: fila.monto,
          fecha: fila.fecha ?? '2026-01-01',
        },
  )
}

function mapearRecepciones(
  filas: DatosBalance['recepciones'],
): RecepcionIngreso[] {
  return filas.map((r) => ({
    id: r.id,
    ingresoId: r.ingreso_id,
    serieId: r.serie_id,
    periodo: r.periodo,
    recibido: r.recibido,
    montoRecibido: r.monto_recibido,
    fechaRecepcion: r.fecha_recepcion,
  }))
}

export function crearControladorBalance(
  dep: DependenciasBalance,
): ControladorBalance {
  const { port, alcance } = dep
  const clavePersonales = clavePreferenciaIncluirPersonales(alcance.miembroId)
  let cache: DatosBalance | null = null
  const cargar = async () => (cache = await port.cargar())
  const vigentes = async () => cache ?? cargar()

  const leerIncluirPersonales = async () =>
    (await port.leerPreferencia(clavePersonales)) === 'true'

  function construirVista(
    d: DatosBalance,
    periodo: string,
    incluirPersonales: boolean,
  ): VistaBalanceMes {
    const nombres = new Map(d.miembros.map((m) => [m.id, m.nombre]))
    const recepcionPorSerie = new Map(
      d.recepciones
        .filter((r) => r.periodo === periodo)
        .map((r) => [r.serie_id, r]),
    )

    const balance = calcularBalanceMes({
      periodo,
      actorId: alcance.miembroId,
      incluirPersonales,
      miembros: d.miembros,
      medios: d.medios.map((m) => ({
        id: m.id,
        ownerMiembroId: m.owner_miembro_id,
      })),
      compras: d.compras.map((c) => ({
        id: c.id,
        fecha: c.fecha,
        montoTotal: c.monto_total,
        ambito: c.ambito,
        miembroId: c.miembro_id,
        pagoTipo: c.pago_tipo,
        medioDePagoId: c.medio_de_pago_id,
        financiadaPorPasivoId: c.financiada_por_pasivo_id,
      })),
      pasivos: d.pasivos.map((p) => ({
        id: p.id,
        ambito: p.ambito,
        ownerMiembroId: p.owner_miembro_id,
      })),
      planes: d.planes.map((p) => ({
        id: p.id,
        pasivoId: p.pasivo_id,
        fechaInicio: p.fecha_inicio,
        capital: p.capital,
      })),
      costos: d.costos.map((k) => ({
        id: k.id,
        pasivoId: k.pasivo_id,
        medioDePagoId: k.medio_de_pago_id,
        monto: k.monto,
        fechaCausacion: k.fecha_causacion,
      })),
      pagos: d.pagos.map((g) => ({
        id: g.id,
        pasivoId: g.pasivo_id,
        tipo: g.tipo,
        medioDePagoId: g.medio_de_pago_id,
        monto: g.monto,
        fecha: g.fecha,
      })),
      aportes: d.aportes.map((a) => ({
        id: a.id,
        medioOrigenId: a.medio_origen_id,
        medioDestinoId: a.medio_destino_id,
        monto: a.monto,
        fecha: a.fecha,
      })),
      ingresos: mapearIngresos(d.ingresos),
      recepciones: mapearRecepciones(d.recepciones),
    })

    const totalIng = balance.ingresos.total
    const fijos: IngresoFijoVista[] = balance.ingresos.fijos.map((item) => {
      const filaRec = recepcionPorSerie.get(item.serieId) ?? null
      return {
        serieId: item.serieId,
        ingresoId: item.version.id,
        miembroId: item.miembroId,
        miembroNombre: nombres.get(item.miembroId) ?? 'Miembro',
        descripcion: item.descripcion,
        diaEsperado: item.version.diaEsperado,
        fechaEsperada: item.fechaEsperada,
        montoEsperado: item.montoEsperado,
        montoEfectivo: item.montoEfectivo,
        estado: item.estado,
        recepcionId: filaRec?.id ?? null,
        recepcionBaseSeq: filaRec?.seq ?? null,
        fechaRecepcion: item.recepcion?.fechaRecepcion ?? null,
        montoRecibido: item.recepcion?.montoRecibido ?? null,
      }
    })
    const variables: IngresoVariableVista[] = balance.ingresos.variables.map(
      (item) => ({
        id: item.id,
        miembroId: item.miembroId,
        miembroNombre: nombres.get(item.miembroId) ?? 'Miembro',
        descripcion: item.descripcion,
        monto: item.monto,
        fecha: item.fecha,
      }),
    )

    return {
      periodo,
      mostrarPctIngreso: d.hogar.mostrar_pct_ingreso,
      incluirPersonales,
      totalAportes: balance.totalAportes,
      salidasFondoComun: balance.salidasFondoComun,
      gastosPersonalesPropios: balance.gastosPersonalesPropios,
      miembros: balance.miembros,
      ingresos: {
        totalFijos: balance.ingresos.totalFijos,
        totalVariables: balance.ingresos.totalVariables,
        total: totalIng,
        pctFijos: formatearPorcentaje(
          totalIng > 0 ? (balance.ingresos.totalFijos * 100) / totalIng : 0,
        ),
        pctVariables: formatearPorcentaje(
          totalIng > 0 ? (balance.ingresos.totalVariables * 100) / totalIng : 0,
        ),
        fijos,
        variables,
      },
    }
  }

  async function enviarYRecargar(lote: LoteBalance, resumen: string) {
    const r = await port.enviar(lote)
    if (r.estado === 'rechazado') {
      throw new ErrorBalance('servidor', mensajeRechazoBalance(r))
    }
    await cargar()
    return { loteId: lote.lote_id, resumen }
  }

  return {
    async cargarMes(periodo) {
      const [d, incluir] = await Promise.all([cargar(), leerIncluirPersonales()])
      return construirVista(d, periodo, incluir)
    },

    async cambiarMostrarPctIngreso(valor, periodo) {
      const d = await vigentes()
      const lote = construirLoteMostrarPctIngreso(
        {
          hogarId: alcance.hogarId,
          mostrarPctIngreso: valor,
          baseSeq: d.hogar.seq,
        },
        dep.nuevoId,
      )
      await enviarYRecargar(lote, 'Preferencia actualizada')
      const incluir = await leerIncluirPersonales()
      return construirVista(
        cache!,
        periodo ?? hoyCivil(dep.ahora()).slice(0, 7),
        incluir,
      )
    },

    leerIncluirPersonales,

    async guardarIncluirPersonales(valor) {
      await port.guardarPreferencia(clavePersonales, valor ? 'true' : 'false')
    },

    async mediosParaAporte() {
      const d = await vigentes()
      const nombres = new Map(d.miembros.map((m) => [m.id, m.nombre]))
      const opciones = d.medios.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        tipo: m.tipo,
        ownerTipo: m.owner_tipo,
        duenoMiembroId: m.owner_miembro_id,
        duenoNombre:
          m.owner_miembro_id !== null
            ? (nombres.get(m.owner_miembro_id) ?? 'Miembro')
            : null,
      }))
      return {
        origenes: opciones.filter((m) => m.ownerTipo === 'miembro'),
        destinos: opciones.filter((m) => m.ownerTipo === 'hogar'),
      }
    },

    async registrarAporte(b: BorradorAporte) {
      const d = await vigentes()
      const origen = d.medios.find((m) => m.id === b.medioOrigenId)
      const destino = d.medios.find((m) => m.id === b.medioDestinoId)
      try {
        const lote = construirLoteAporte(
          {
            hogarId: alcance.hogarId,
            medioOrigenId: b.medioOrigenId ?? '',
            origenEsMiembro: origen?.owner_tipo === 'miembro',
            medioDestinoId: b.medioDestinoId ?? '',
            destinoEsHogar: destino?.owner_tipo === 'hogar',
            monto: b.monto,
            fecha: b.fecha,
            nota: b.nota,
          },
          dep.nuevoId,
        )
        const dueno =
          origen?.owner_miembro_id !== null && origen?.owner_miembro_id !== undefined
            ? (d.miembros.find((m) => m.id === origen.owner_miembro_id)?.nombre ?? 'Miembro')
            : 'Miembro'
        return await enviarYRecargar(
          lote,
          `Aporte registrado: ${dueno} ${formatearPesos(b.monto)} → ${destino?.nombre ?? 'Fondo común'}`,
        )
      } catch (e) {
        if (e instanceof ErrorLoteBalance) {
          throw new ErrorBalance(e.campo, e.message)
        }
        throw e
      }
    },

    async miembrosActivos() {
      const d = await vigentes()
      return d.miembros.filter((m) => m.activo).map(({ id, nombre }) => ({ id, nombre }))
    },

    async registrarIngreso(b: BorradorIngreso) {
      const d = await vigentes()
      const nombre = d.miembros.find((m) => m.id === b.miembroId)?.nombre ?? 'Miembro'
      try {
        const lote = construirLoteIngreso(
          { ...b, hogarId: alcance.hogarId },
          dep.nuevoId,
        )
        return await enviarYRecargar(
          lote,
          `Ingreso guardado: ${formatearPesos(b.monto)} (${nombre})`,
        )
      } catch (e) {
        if (e instanceof ErrorLoteBalance) {
          throw new ErrorBalance(e.campo, e.message)
        }
        throw e
      }
    },

    async marcarIngresoRecibido(b: BorradorRecepcion) {
      try {
        const lote = construirLoteRecepcionIngreso(
          { ...b, hogarId: alcance.hogarId },
          dep.nuevoId,
        )
        const montoMostrar = b.montoRecibido ?? b.montoEsperado
        return await enviarYRecargar(
          lote,
          `Ingreso marcado como recibido (${formatearPesos(montoMostrar)})`,
        )
      } catch (e) {
        if (e instanceof ErrorLoteBalance) {
          throw new ErrorBalance(e.campo, e.message)
        }
        throw e
      }
    },

    async cargarEstadoAjustes(): Promise<EstadoAjustes> {
      const [d, local] = await Promise.all([cargar(), port.estadoLocal()])
      const actual = d.miembros.find((m) => m.id === alcance.miembroId)
      return {
        mostrarPctIngreso: d.hogar.mostrar_pct_ingreso,
        miembroActualNombre: actual?.nombre ?? 'Miembro',
        pendientesOutbox: local.pendientesOutbox,
        ultimaCopiaLocal: local.ultimaCopiaLocal,
        ultimoMedioNombre: local.ultimoMedioNombre,
        historial: local.historial,
      }
    },

    async exportarAhora() {
      const fecha = hoyCivil(dep.ahora())
      const alcances = await port.exportarAlcances(fecha)
      return {
        fecha,
        hogarZip: empaquetarExportacion(alcances.hogar),
        personalZip: empaquetarExportacion(alcances.personal),
      }
    },
  }
}
