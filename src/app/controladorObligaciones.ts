import { equivalenciaTasa, estadoObligacion, instanciaObligacion, periodoDe, resumenMes } from '../domain/agenda'
import {
  aportePago,
  cargoCuota,
  estadosFifo,
  evaluarAbono,
  type LibroPasivo,
} from '../domain/deuda'
import { hoyCivil } from '../domain/fechas'
import {
  construirLotePago,
  construirLotePagoObligacion,
  construirLotePasivo,
  validarEntradaPasivo,
  type LoteObligaciones,
} from '../domain/loteObligaciones'
import { formatearPesos } from '../domain/pesos'
import type { AlcanceCompra } from './compraRapida'
import type {
  AgendaMes,
  BorradorPago,
  ControladorObligaciones,
  EvaluacionPago,
  ItemAgenda,
  ItemCuota,
  Titular,
} from './obligaciones'

/** Filas visibles para el actor (RLS), tal como vienen de la base. */
export type DatosObligaciones = {
  miembros: { id: string; nombre: string }[]
  categorias: { id: string; nombre: string }[]
  medios: { id: string; nombre: string; owner_miembro_id: string | null }[]
  pasivos: {
    id: string
    tipo: 'tarjeta' | 'credito' | 'deuda'
    nombre: string
    ambito: 'hogar' | 'personal'
    owner_miembro_id: string | null
    ultimos_4: string | null
  }[]
  planes: {
    id: string
    pasivo_id: string
    compra_id: string | null
    fecha_inicio: string
    capital: number
    sistema: 'capital_fijo' | 'cuota_fija' | 'sin_calendario'
    n_cuotas: number | null
  }[]
  cuotas: { id: string; plan_id: string; numero: number; fecha_vencimiento: string; capital: number }[]
  costos: {
    id: string
    pasivo_id: string | null
    cuota_id: string | null
    monto: number
    fecha_causacion: string
    origen: 'calculado' | 'manual'
    seq: number
  }[]
  pagos: {
    id: string
    pasivo_id: string
    tipo: 'abono' | 'saldo_a_favor'
    cuota_id: string | null
    monto: number
    fecha: string
    registrado_por: string
  }[]
  obligaciones: {
    id: string
    nombre: string
    categoria_id: string
    monto_estimado: number | null
    dia_vencimiento: number
    periodicidad: 'mensual' | 'bimestral' | 'trimestral' | 'anual'
    mes_inicio: string
    activa: boolean
  }[]
  compras: {
    id: string
    fecha: string
    monto_total: number
    ambito: 'hogar' | 'personal'
    miembro_id: string | null
    descripcion: string
    obligacion_id: string | null
    periodo: string | null
  }[]
}

export type ResultadoEnvio =
  | { estado: 'aplicado' }
  | { estado: 'rechazado'; motivo: string; detalle?: string }

/** Puerto de datos: lecturas por RLS (con copia local) y envío por `sync_push_obligaciones`. */
export interface ObligacionesPort {
  cargar(): Promise<DatosObligaciones>
  enviar(lote: LoteObligaciones): Promise<ResultadoEnvio>
  leerPreferencia(clave: string): Promise<string | null>
  guardarPreferencia(clave: string, valor: string): Promise<void>
}

export type DependenciasObligaciones = {
  port: ObligacionesPort
  alcance: AlcanceCompra
  ahora: () => Date
  nuevoId: () => string
}

export class ErrorObligaciones extends Error {
  readonly campo: string

  constructor(campo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorObligaciones'
    this.campo = campo
  }
}

export function clavePreferenciaIncluirPersonales(miembroId: string): string {
  return `incluir_personales:${miembroId}`
}

/** Mensaje en español para un rechazo del servidor (la autoridad de I20). */
export function mensajeRechazo(r: { motivo: string; detalle?: string }): string {
  const detalle = r.detalle ?? ''
  if (r.motivo === 'duplicado' && detalle.includes('cuota')) return '▲ Posible pago duplicado'
  if (r.motivo === 'duplicado' && detalle.includes('obligacion')) return 'Esa obligación ya está pagada en ese periodo'
  if (r.motivo === 'invalido' && (detalle.includes('saldo causado') || detalle.includes('excedente'))) {
    return '▲ Posible pago duplicado o sobrepago'
  }
  if (r.motivo === 'conflicto') return 'El interés cambió en otro dispositivo: vuelve a abrir el pago'
  if (r.motivo === 'no_autorizado') return 'No tienes permiso para registrar esto'
  if (r.motivo === 'actualizar_app') return 'Actualiza la app para registrar pagos'
  return 'El servidor rechazó el registro'
}

function libroDe(d: DatosObligaciones, pasivoId: string): LibroPasivo {
  const planes = d.planes.filter((p) => p.pasivo_id === pasivoId)
  const ids = new Set(planes.map((p) => p.id))
  return {
    planes: planes.map((p) => ({ id: p.id, fechaInicio: p.fecha_inicio, capital: p.capital, sistema: p.sistema })),
    cuotas: d.cuotas
      .filter((c) => ids.has(c.plan_id))
      .map((c) => ({ id: c.id, planId: c.plan_id, numero: c.numero, fechaVencimiento: c.fecha_vencimiento, capital: c.capital })),
    costos: d.costos
      .filter((k) => k.pasivo_id === pasivoId)
      .map((k) => ({ id: k.id, cuotaId: k.cuota_id, monto: k.monto, fechaCausacion: k.fecha_causacion, origen: k.origen })),
    pagos: d.pagos
      .filter((g) => g.pasivo_id === pasivoId)
      .map((g) => ({ id: g.id, tipo: g.tipo, cuotaId: g.cuota_id, monto: g.monto, fecha: g.fecha, registradoPor: g.registrado_por })),
  }
}

export function crearControladorObligaciones(dep: DependenciasObligaciones): ControladorObligaciones {
  const { port, alcance } = dep
  const clave = clavePreferenciaIncluirPersonales(alcance.miembroId)
  let datos: DatosObligaciones | null = null
  const cargar = async () => (datos = await port.cargar())
  const vigentes = async () => datos ?? cargar()
  const hoy = () => hoyCivil(dep.ahora())
  const nombreMiembro = (d: DatosObligaciones, id: string) => d.miembros.find((m) => m.id === id)?.nombre ?? 'Otro miembro'
  const incluirPersonales = async () => (await port.leerPreferencia(clave)) === 'true'
  const visible = (ambito: 'hogar' | 'personal', dueno: string | null, incluir: boolean) =>
    ambito === 'hogar' || (incluir && dueno === alcance.miembroId)

  async function enviar(l: LoteObligaciones, resumen: string) {
    const r = await port.enviar(l)
    if (r.estado === 'rechazado') throw new ErrorObligaciones('servidor', mensajeRechazo(r))
    await cargar()
    return { loteId: l.lote_id, resumen }
  }

  /** Libro del pasivo con el interés del formulario aplicado (si se corrigió). */
  function contexto(d: DatosObligaciones, b: BorradorPago) {
    const pasivo = d.pasivos.find((p) => p.id === b.pasivoId)
    if (!pasivo) throw new ErrorObligaciones('pasivo', 'El pasivo no existe o no lo puedes ver')
    const libro = libroDe(d, b.pasivoId)
    const costo = b.cuotaId === null ? undefined : d.costos.find((k) => k.cuota_id === b.cuotaId)
    if (costo && b.interes !== null && b.interes !== costo.monto) {
      libro.costos = libro.costos.map((k) => (k.id === costo.id ? { ...k, monto: b.interes ?? k.monto, origen: 'manual' } : k))
    } else if (!costo && b.interes !== null && b.interes > 0) {
      libro.costos = [...libro.costos, { id: 'nuevo', cuotaId: b.cuotaId, monto: b.interes, fechaCausacion: b.fecha, origen: 'manual' }]
    }
    return { pasivo, libro, costo }
  }

  async function evaluar(b: BorradorPago): Promise<EvaluacionPago> {
    const d = await vigentes()
    const medio = d.medios.find((m) => m.id === b.medioId)
    if (!medio) return { estado: 'invalido', campo: 'medio', mensaje: 'Elige con qué pagaste' }
    if (b.interes !== null && (!Number.isSafeInteger(b.interes) || b.interes < 0)) {
      return { estado: 'invalido', campo: 'interes', mensaje: 'El interés es un monto entero en pesos' }
    }
    const { pasivo, libro } = contexto(d, b)
    const monto = b.capital + (b.interes ?? 0)
    const r = evaluarAbono(libro, { cuotaId: b.cuotaId, monto, fecha: b.fecha })
    const aporte = (m: number) => aportePago({ tipo: 'abono', monto: m }, pasivo.ambito, medio.owner_miembro_id)
    switch (r.estado) {
      case 'duplicado':
        return {
          estado: 'duplicado',
          existente: { fecha: r.existente.fecha, monto: r.existente.monto, registradoPor: nombreMiembro(d, r.existente.registradoPor) },
        }
      case 'sobrepago':
        return { estado: 'sobrepago', monto, tope: r.tope, excedente: r.excedente, aporte: r.tope > 0 ? aporte(r.tope) : null }
      case 'invalido':
        return { estado: 'invalido', campo: r.mensaje.includes('fecha') ? 'fecha' : 'monto', mensaje: r.mensaje }
      case 'valido':
        return { estado: 'valido', monto, saldoAntes: r.saldoAntes, saldoDespues: r.saldoDespues, capitalAplicado: b.capital, aporte: aporte(monto) }
    }
  }

  return {
    async cargarMes(periodo) {
      const d = await cargar()
      const incluir = await incluirPersonales()
      const fechaHoy = hoy()
      const libros = d.pasivos.map((p) => ({ pasivo: p, libro: libroDe(d, p.id) }))
      const resumen = resumenMes({
        periodo,
        actorId: alcance.miembroId,
        incluirPersonales: incluir,
        hoy: fechaHoy,
        compras: d.compras.map((c) => ({ monto: c.monto_total, fecha: c.fecha, ambito: c.ambito, miembroId: c.miembro_id })),
        libros: libros.map(({ pasivo, libro }) => ({ ambito: pasivo.ambito, ownerMiembroId: pasivo.owner_miembro_id, libro })),
      })

      const items: ItemAgenda[] = []
      for (const { pasivo, libro } of libros) {
        if (!visible(pasivo.ambito, pasivo.owner_miembro_id, incluir)) continue
        const estados = estadosFifo(libro, fechaHoy)
        const titular: Titular = pasivo.owner_miembro_id === null
          ? { tipo: 'hogar' }
          : { tipo: 'miembro', miembroId: pasivo.owner_miembro_id, nombre: nombreMiembro(d, pasivo.owner_miembro_id) }
        for (const cuota of libro.cuotas) {
          if (periodoDe(cuota.fechaVencimiento) !== periodo) continue
          const plan = d.planes.find((p) => p.id === cuota.planId)
          const compra = d.compras.find((c) => c.id === plan?.compra_id)
          const costo = libro.costos.find((k) => k.cuotaId === cuota.id)
          const enlace = libro.pagos.find((g) => g.tipo === 'abono' && g.cuotaId === cuota.id)
          const e = estados.get(cuota.id)
          const item: ItemCuota = {
            tipo: 'cuota',
            cuotaId: cuota.id,
            pasivoId: pasivo.id,
            pasivoNombre: pasivo.ultimos_4 ? `${pasivo.nombre} ••${pasivo.ultimos_4}` : pasivo.nombre,
            pasivoTipo: pasivo.tipo,
            ambito: pasivo.ambito,
            titular,
            descripcion: compra?.descripcion ?? pasivo.nombre,
            numero: cuota.numero,
            nCuotas: plan?.n_cuotas ?? 1,
            fechaVencimiento: cuota.fechaVencimiento,
            capital: cuota.capital,
            interes: costo?.monto ?? null,
            interesOrigen: costo?.origen ?? null,
            estado: e?.estado ?? 'pendiente',
            restante: e?.restante ?? cuota.capital,
            pagoEnlazado: enlace ? { fecha: enlace.fecha, monto: enlace.monto, registradoPor: nombreMiembro(d, enlace.registradoPor) } : null,
          }
          items.push(item)
        }
      }
      for (const o of d.obligaciones) {
        const instancia = instanciaObligacion(
          { diaVencimiento: o.dia_vencimiento, periodicidad: o.periodicidad, mesInicio: o.mes_inicio, activa: o.activa },
          periodo,
        )
        if (!instancia) continue
        // La agenda se lee por periodo: un recibo de noviembre pagado en diciembre cierra noviembre.
        const pago = d.compras.find((c) => c.obligacion_id === o.id && c.periodo === periodo)
        items.push({
          tipo: 'obligacion',
          obligacionId: o.id,
          nombre: o.nombre,
          categoriaNombre: d.categorias.find((c) => c.id === o.categoria_id)?.nombre ?? '',
          periodo,
          fechaVencimiento: instancia.fechaVencimiento,
          montoEstimado: o.monto_estimado,
          estado: estadoObligacion(instancia.fechaVencimiento, pago !== undefined, fechaHoy),
          pago: pago ? { fecha: pago.fecha, monto: pago.monto_total } : null,
        })
      }
      items.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
      const agenda: AgendaMes = { resumen: { periodo, ...resumen }, vencidas: [], pendientes: [], pagadas: [] }
      for (const item of items) {
        if (item.estado === 'pagada') agenda.pagadas.push(item)
        else if (item.estado === 'vencida' || (item.estado === 'parcial' && item.fechaVencimiento < fechaHoy)) agenda.vencidas.push(item)
        else agenda.pendientes.push(item)
      }
      return agenda
    },

    leerIncluirPersonales: incluirPersonales,

    async guardarIncluirPersonales(valor) {
      await port.guardarPreferencia(clave, valor ? 'true' : 'false')
    },

    async medios() {
      const d = await vigentes()
      return d.medios.map((m) => ({ id: m.id, nombre: m.nombre, duenoMiembroId: m.owner_miembro_id }))
    },

    async prepararPagoCuota(cuotaId) {
      const d = await vigentes()
      const cuota = d.cuotas.find((c) => c.id === cuotaId)
      const plan = d.planes.find((p) => p.id === cuota?.plan_id)
      if (!cuota || !plan) throw new ErrorObligaciones('cuota', 'La cuota no existe o no la puedes ver')
      const costo = d.costos.find((k) => k.cuota_id === cuotaId)
      return {
        pasivoId: plan.pasivo_id,
        cuotaId,
        medioId: null,
        fecha: cuota.fecha_vencimiento,
        capital: cuota.capital,
        interes: costo?.monto ?? null,
        nota: '',
      }
    },

    evaluarPago: evaluar,

    async registrarPago(b, { dividirSobrepago }) {
      const e = await evaluar(b)
      if (e.estado === 'invalido') throw new ErrorObligaciones(e.campo, e.mensaje)
      if (e.estado === 'duplicado') throw new ErrorObligaciones('cuota', '▲ Posible pago duplicado')
      if (e.estado === 'sobrepago' && !dividirSobrepago) {
        throw new ErrorObligaciones('monto', '▲ Posible pago duplicado o sobrepago')
      }
      const d = await vigentes()
      const { libro, costo } = contexto(d, b)
      const l = construirLotePago({
        hogarId: alcance.hogarId,
        pasivoId: b.pasivoId,
        medioId: b.medioId ?? '',
        fecha: b.fecha,
        cuotaId: b.cuotaId,
        monto: e.monto,
        interes: b.interes === null && !costo ? null : {
          costoId: costo?.id ?? null,
          baseSeq: costo?.seq ?? null,
          estimado: costo?.monto ?? null,
          final: b.interes,
        },
        nota: b.nota,
        division: e.estado === 'sobrepago'
          ? { tope: e.tope, cargoCuota: b.cuotaId === null ? null : cargoCuota(libro, b.cuotaId) }
          : null,
      }, dep.nuevoId)
      return enviar(l, `Pago registrado: ${formatearPesos(e.monto)}`)
    },

    async registrarPagoObligacion(b) {
      const d = await vigentes()
      const o = d.obligaciones.find((x) => x.id === b.obligacionId)
      if (!o) throw new ErrorObligaciones('obligacion', 'La obligación no existe')
      if (!b.medioId) throw new ErrorObligaciones('medio', 'Elige con qué pagaste')
      const l = construirLotePagoObligacion({
        hogarId: alcance.hogarId,
        obligacionId: o.id,
        periodo: b.periodo,
        categoriaId: o.categoria_id,
        descripcion: o.nombre,
        medioId: b.medioId,
        fecha: b.fecha,
        monto: b.monto,
      }, dep.nuevoId)
      return enviar(l, `Pagado: ${o.nombre} ${formatearPesos(b.monto)}`)
    },

    equivalenciaTasa,

    validarPasivo(b) {
      return validarEntradaPasivo({ ...b, hogarId: alcance.hogarId })
    },

    async crearPasivo(b) {
      const l = construirLotePasivo({ ...b, hogarId: alcance.hogarId }, dep.nuevoId)
      return enviar(l, `Pasivo creado: ${b.nombre.trim()}`)
    },
  }
}
