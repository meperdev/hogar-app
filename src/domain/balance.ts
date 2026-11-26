import { esPeriodo, periodoDe } from './agenda'
import {
  resumenIngresosMes,
  type Ingreso,
  type RecepcionIngreso,
  type ResumenIngresosMes,
} from './ingresos'
import { pesos } from './pesos'

export type MiembroBalance = {
  id: string
  nombre: string
  activo: boolean
}

export type MedioBalance = {
  id: string
  ownerMiembroId: string | null
}

export type CompraBalance = {
  id: string
  fecha: string
  montoTotal: number
  ambito: 'hogar' | 'personal'
  miembroId: string | null
  pagoTipo: 'contado' | 'financiado'
  medioDePagoId: string | null
  financiadaPorPasivoId: string | null
}

export type PasivoBalance = {
  id: string
  ambito: 'hogar' | 'personal'
  ownerMiembroId: string | null
}

export type PlanBalance = {
  id: string
  pasivoId: string
  fechaInicio: string
  capital: number
}

export type CostoBalance = {
  id: string
  pasivoId: string | null
  medioDePagoId: string | null
  monto: number
  fechaCausacion: string
}

export type PagoBalance = {
  id: string
  pasivoId: string
  tipo: 'abono' | 'saldo_a_favor'
  medioDePagoId: string
  monto: number
  fecha: string
}

export type AporteTransferencia = {
  id: string
  medioOrigenId: string
  medioDestinoId: string
  monto: number
  fecha: string
}

export type EntradaBalanceMes = {
  periodo: string
  actorId: string
  incluirPersonales: boolean
  miembros: MiembroBalance[]
  medios: MedioBalance[]
  compras: CompraBalance[]
  pasivos: PasivoBalance[]
  planes: PlanBalance[]
  costos: CostoBalance[]
  pagos: PagoBalance[]
  aportes: AporteTransferencia[]
  ingresos: Ingreso[]
  recepciones: RecepcionIngreso[]
}

export type DesgloseAporteMiembro = {
  comprasContado: number
  pagosDeuda: number
  costosDirectos: number
  transferenciasFondoComun: number
}

export type AporteMiembroMes = {
  miembroId: string
  nombre: string
  activo: boolean
  aporte: number
  desglose: DesgloseAporteMiembro
  pctTotal: string
  ingresoMes: number
  pctIngreso: string | null
}

export type BalanceMes = {
  periodo: string
  totalAportes: number
  salidasFondoComun: number
  gastosPersonalesPropios: number
  miembros: AporteMiembroMes[]
  ingresos: ResumenIngresosMes
}

export type AplicacionSaldoAFavor = {
  periodo: string
  miembroId: string
  monto: number
}

/**
 * Formatea un porcentaje con exactamente un decimal y coma española (58,0 %),
 * redondeando mitades hacia arriba solo al mostrarse.
 */
export function formatearPorcentaje(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new RangeError(`Porcentaje inválido: ${String(valor)}`)
  }
  const decimas = Math.floor(valor * 10 + 0.5)
  const texto = (decimas / 10).toFixed(1).replace('.', ',')
  return `${texto} %`
}

/**
 * Orden determinista de aplicación de `saldo_a_favor` a cargos posteriores
 * del mismo pasivo (I10): FIFO por `(fecha, id)` del crédito y orden cronológico
 * de cargos `(fecha, id)`. Cada monto aplicado es aporte del dueño del medio en
 * el mes del cargo cubierto.
 */
export function aplicacionesSaldoAFavor(
  libro: {
    planes: Array<{ id: string; fechaInicio: string; capital: number }>
    costos: Array<{ id: string; monto: number; fechaCausacion: string }>
    pagos: Array<{
      id: string
      tipo: 'abono' | 'saldo_a_favor'
      medioDePagoId: string
      monto: number
      fecha: string
    }>
  },
  mediosPorId: Map<string, MedioBalance>,
): AplicacionSaldoAFavor[] {
  const cargos = [
    ...libro.planes.map((p) => ({
      fecha: p.fechaInicio,
      id: p.id,
      monto: p.capital,
    })),
    ...libro.costos.map((k) => ({
      fecha: k.fechaCausacion,
      id: k.id,
      monto: k.monto,
    })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))

  const creditos = libro.pagos
    .filter((p) => p.tipo === 'saldo_a_favor')
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
    .map((p) => ({
      fecha: p.fecha,
      restante: p.monto,
      miembroId: mediosPorId.get(p.medioDePagoId)?.ownerMiembroId ?? null,
    }))

  const aplicaciones: AplicacionSaldoAFavor[] = []
  for (const cargo of cargos) {
    let porCubrir = cargo.monto
    for (const credito of creditos) {
      if (porCubrir === 0) break
      if (credito.restante === 0 || credito.fecha >= cargo.fecha) continue
      const tomado = Math.min(porCubrir, credito.restante)
      credito.restante -= tomado
      porCubrir -= tomado
      if (credito.miembroId !== null) {
        aplicaciones.push({
          periodo: periodoDe(cargo.fecha),
          miembroId: credito.miembroId,
          monto: tomado,
        })
      }
    }
  }
  return aplicaciones
}

function nuevoDesglose(): DesgloseAporteMiembro {
  return {
    comprasContado: 0,
    pagosDeuda: 0,
    costosDirectos: 0,
    transferenciasFondoComun: 0,
  }
}

/**
 * Calcula el balance derivado del mes calendario (I6, I7, I17, I18, I19).
 * Nunca persiste totales ni produce saldos/deudas entre miembros.
 */
export function calcularBalanceMes(entrada: EntradaBalanceMes): BalanceMes {
  if (!esPeriodo(entrada.periodo)) {
    throw new RangeError(`Periodo inválido: ${entrada.periodo}`)
  }

  const mediosPorId = new Map(entrada.medios.map((m) => [m.id, m]))
  const pasivosPorId = new Map(entrada.pasivos.map((p) => [p.id, p]))
  const desglosePorMiembro = new Map<string, DesgloseAporteMiembro>()
  for (const m of entrada.miembros) {
    desglosePorMiembro.set(m.id, nuevoDesglose())
  }

  let salidasFondoComun = 0
  let gastosPersonalesPropios = 0

  const sumarAporte = (
    miembroId: string,
    campo: keyof DesgloseAporteMiembro,
    monto: number,
  ) => {
    const desglose = desglosePorMiembro.get(miembroId)
    if (desglose) desglose[campo] += pesos(monto)
  }

  // 1. Compras de contado del hogar (excluye financiadas por desembolso y personales).
  for (const compra of entrada.compras) {
    if (periodoDe(compra.fecha) !== entrada.periodo) continue
    if (compra.ambito === 'personal') {
      if (entrada.incluirPersonales && compra.miembroId === entrada.actorId) {
        gastosPersonalesPropios += pesos(compra.montoTotal)
      }
      continue
    }
    if (compra.pagoTipo !== 'contado' || compra.medioDePagoId === null) continue
    const dueno = mediosPorId.get(compra.medioDePagoId)?.ownerMiembroId ?? null
    if (dueno === null) {
      salidasFondoComun += pesos(compra.montoTotal)
    } else {
      sumarAporte(dueno, 'comprasContado', compra.montoTotal)
    }
  }

  // 2. Pagos a pasivos del hogar (abonos directos + saldos a favor aplicados en el mes).
  for (const pago of entrada.pagos) {
    if (pago.tipo !== 'abono' || periodoDe(pago.fecha) !== entrada.periodo) continue
    const pasivo = pasivosPorId.get(pago.pasivoId)
    if (!pasivo || pasivo.ambito !== 'hogar') continue
    const dueno = mediosPorId.get(pago.medioDePagoId)?.ownerMiembroId ?? null
    if (dueno === null) {
      salidasFondoComun += pesos(pago.monto)
    } else {
      sumarAporte(dueno, 'pagosDeuda', pago.monto)
    }
  }

  for (const pasivo of entrada.pasivos) {
    if (pasivo.ambito !== 'hogar') continue
    const aplicaciones = aplicacionesSaldoAFavor(
      {
        planes: entrada.planes.filter((pl) => pl.pasivoId === pasivo.id),
        costos: entrada.costos.filter((k) => k.pasivoId === pasivo.id),
        pagos: entrada.pagos.filter((g) => g.pasivoId === pasivo.id),
      },
      mediosPorId,
    )
    for (const app of aplicaciones) {
      if (app.periodo === entrada.periodo) {
        sumarAporte(app.miembroId, 'pagosDeuda', app.monto)
      }
    }
  }

  // 3. Costos financieros pagados directo (hogar) y costos personales propios.
  for (const costo of entrada.costos) {
    if (periodoDe(costo.fechaCausacion) !== entrada.periodo) continue
    if (costo.medioDePagoId !== null) {
      const dueno = mediosPorId.get(costo.medioDePagoId)?.ownerMiembroId ?? null
      if (dueno === null) {
        salidasFondoComun += pesos(costo.monto)
      } else {
        sumarAporte(dueno, 'costosDirectos', costo.monto)
      }
      continue
    }
    if (entrada.incluirPersonales && costo.pasivoId !== null) {
      const pasivo = pasivosPorId.get(costo.pasivoId)
      if (pasivo?.ambito === 'personal' && pasivo.ownerMiembroId === entrada.actorId) {
        gastosPersonalesPropios += pesos(costo.monto)
      }
    }
  }

  // 4. Transferencias al fondo común (Aporte: miembro -> medio del hogar).
  for (const aporte of entrada.aportes) {
    if (periodoDe(aporte.fecha) !== entrada.periodo) continue
    const origen = mediosPorId.get(aporte.medioOrigenId)
    const destino = mediosPorId.get(aporte.medioDestinoId)
    if (!origen || origen.ownerMiembroId === null) continue
    if (destino && destino.ownerMiembroId !== null) continue
    sumarAporte(origen.ownerMiembroId, 'transferenciasFondoComun', aporte.monto)
  }

  const ingresos = resumenIngresosMes(
    entrada.ingresos,
    entrada.recepciones,
    entrada.periodo,
    entrada.miembros,
  )

  let totalAportes = 0
  const acumulados = entrada.miembros.map((m) => {
    const desglose = desglosePorMiembro.get(m.id) ?? nuevoDesglose()
    const total =
      desglose.comprasContado +
      desglose.pagosDeuda +
      desglose.costosDirectos +
      desglose.transferenciasFondoComun
    totalAportes += total
    return { miembro: m, desglose, total }
  })

  const miembros: AporteMiembroMes[] = acumulados.map(({ miembro, desglose, total }) => {
    const ingresoMes = ingresos.porMiembro.get(miembro.id) ?? 0
    return {
      miembroId: miembro.id,
      nombre: miembro.nombre,
      activo: miembro.activo,
      aporte: total,
      desglose,
      pctTotal: formatearPorcentaje(
        totalAportes > 0 ? (total * 100) / totalAportes : 0,
      ),
      ingresoMes,
      pctIngreso:
        ingresoMes > 0 ? formatearPorcentaje((total * 100) / ingresoMes) : null,
    }
  })

  return {
    periodo: entrada.periodo,
    totalAportes,
    salidasFondoComun,
    gastosPersonalesPropios,
    miembros,
    ingresos,
  }
}
