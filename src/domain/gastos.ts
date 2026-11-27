import { esPeriodo, periodoDe } from './agenda'
import { formatearPorcentaje } from './balance'
import { pesos } from './pesos'

export type FiltroAmbitoGastos = 'hogar' | 'personal' | 'todos'
export type TipoMedioGasto = 'efectivo' | 'cuenta' | 'tarjeta' | 'prestamo' | 'otro'

export type CompraGasto = {
  id: string
  fecha: string
  descripcion: string
  montoTotal: number
  categoriaId: string
  ambito: 'hogar' | 'personal'
  miembroId: string | null
  pagoTipo: 'contado' | 'financiado'
  medioDePagoId: string | null
  financiadaPorPasivoId: string | null
  obligacionId: string | null
  registradoPor: string
  origen: 'manual' | 'qr' | 'ocr' | 'correo'
}

export type CategoriaGasto = {
  id: string
  nombre: string
  icono: string | null
  orden: number
  activa?: boolean | undefined
}

export type MedioGasto = {
  id: string
  nombre: string
  tipo: 'efectivo' | 'cuenta'
  activo?: boolean | undefined
  orden?: number | undefined
}

export type PasivoGasto = {
  id: string
  nombre: string
  tipo: 'tarjeta' | 'credito' | 'deuda'
}

export type PlanCompraGasto = {
  compraId: string
  pasivoId: string
  nCuotas: number | null
}

export type MiembroGasto = {
  id: string
  nombre: string
}

export type EntradaResumenGastos = {
  periodo: string
  actorId: string
  ambito: FiltroAmbitoGastos
  compras: CompraGasto[]
  categorias: CategoriaGasto[]
  medios: MedioGasto[]
  pasivos: PasivoGasto[]
  planes: PlanCompraGasto[]
  miembros: MiembroGasto[]
}

export type CategoriaResumenGasto = {
  categoriaId: string
  nombre: string
  icono: string | null
  total: number
  cantidad: number
  pctTexto: string
  proporcionPct: number
}

export type MovimientoGasto = {
  id: string
  fecha: string
  descripcion: string
  montoTotal: number
  categoriaId: string
  categoriaNombre: string
  categoriaIcono: string | null
  ambito: 'hogar' | 'personal'
  pagoTipo: 'contado' | 'financiado'
  medioDePagoId: string | null
  financiadaPorPasivoId: string | null
  obligacionId: string | null
  medioNombre: string
  medioTipo: TipoMedioGasto
  cuotas: number | null
  registradoPorNombre: string
  origen: 'manual' | 'qr' | 'ocr' | 'correo'
}

export type ComparativaMesAnterior = {
  totalAnterior: number
  diferencia: number
  pctTexto: string
}

export type ResumenGastosMes = {
  periodo: string
  ambito: FiltroAmbitoGastos
  total: number
  cantidadCompras: number
  promedioPorCompra: number
  comparativaAnterior: ComparativaMesAnterior | null
  categorias: CategoriaResumenGasto[]
  movimientos: MovimientoGasto[]
  categoriasDisponibles: CategoriaGasto[]
  mediosDisponibles: MedioGasto[]
}

export function periodoAnterior(periodo: string): string {
  if (!esPeriodo(periodo)) {
    throw new RangeError(`Periodo inválido: ${periodo}`)
  }
  const anio = Number(periodo.slice(0, 4))
  const mes = Number(periodo.slice(5, 7))
  if (mes === 1) {
    return `${String(anio - 1).padStart(4, '0')}-12`
  }
  return `${String(anio).padStart(4, '0')}-${String(mes - 1).padStart(2, '0')}`
}

function compraEnAmbito(
  compra: CompraGasto,
  ambito: FiltroAmbitoGastos,
  actorId: string,
): boolean {
  if (ambito === 'hogar') return compra.ambito === 'hogar'
  if (ambito === 'personal') {
    return compra.ambito === 'personal' && compra.miembroId === actorId
  }
  return (
    compra.ambito === 'hogar' ||
    (compra.ambito === 'personal' && compra.miembroId === actorId)
  )
}

function resolverMedioMovimiento(
  compra: CompraGasto,
  mediosPorId: Map<string, MedioGasto>,
  pasivosPorId: Map<string, PasivoGasto>,
  planesPorCompraId: Map<string, PlanCompraGasto>,
): { medioNombre: string; medioTipo: TipoMedioGasto; cuotas: number | null } {
  if (compra.pagoTipo === 'contado' && compra.medioDePagoId) {
    const medio = mediosPorId.get(compra.medioDePagoId)
    if (medio) {
      return { medioNombre: medio.nombre, medioTipo: medio.tipo, cuotas: null }
    }
  }
  if (compra.financiadaPorPasivoId) {
    const pasivo = pasivosPorId.get(compra.financiadaPorPasivoId)
    if (pasivo) {
      return { medioNombre: pasivo.nombre, medioTipo: 'prestamo', cuotas: null }
    }
  }
  const plan = planesPorCompraId.get(compra.id)
  if (plan) {
    const pasivo = pasivosPorId.get(plan.pasivoId)
    return {
      medioNombre: pasivo?.nombre ?? 'Tarjeta / crédito',
      medioTipo: pasivo?.tipo === 'tarjeta' ? 'tarjeta' : 'prestamo',
      cuotas: plan.nCuotas,
    }
  }
  return { medioNombre: 'Medio de pago', medioTipo: 'otro', cuotas: null }
}

/**
 * Resume los gastos del mes por categoría y lista cada compra una sola vez
 * en su fecha civil (sin doble conteo de cuotas ni pagos a pasivos).
 */
export function calcularResumenGastos(entrada: EntradaResumenGastos): ResumenGastosMes {
  if (!esPeriodo(entrada.periodo)) {
    throw new RangeError(`Periodo inválido: ${entrada.periodo}`)
  }

  const prevPeriodo = periodoAnterior(entrada.periodo)
  const categoriasPorId = new Map(entrada.categorias.map((c) => [c.id, c]))
  const mediosPorId = new Map(entrada.medios.map((m) => [m.id, m]))
  const pasivosPorId = new Map(entrada.pasivos.map((p) => [p.id, p]))
  const planesPorCompraId = new Map(entrada.planes.map((pl) => [pl.compraId, pl]))
  const miembrosPorId = new Map(entrada.miembros.map((m) => [m.id, m.nombre]))

  let total = 0
  let totalAnterior = 0
  const gruposCategoria = new Map<
    string,
    { categoriaId: string; nombre: string; icono: string | null; total: number; cantidad: number }
  >()
  const movimientos: MovimientoGasto[] = []

  for (const compra of entrada.compras) {
    if (!compraEnAmbito(compra, entrada.ambito, entrada.actorId)) continue

    const periodoCompra = periodoDe(compra.fecha)
    const monto = pesos(compra.montoTotal)

    if (periodoCompra === prevPeriodo) {
      totalAnterior += monto
      continue
    }

    if (periodoCompra !== entrada.periodo) continue

    total += monto

    const categoria = categoriasPorId.get(compra.categoriaId)
    const categoriaNombre = categoria?.nombre ?? 'Otro'
    const categoriaIcono = categoria?.icono ?? null

    const grupo = gruposCategoria.get(compra.categoriaId) ?? {
      categoriaId: compra.categoriaId,
      nombre: categoriaNombre,
      icono: categoriaIcono,
      total: 0,
      cantidad: 0,
    }
    grupo.total += monto
    grupo.cantidad += 1
    gruposCategoria.set(compra.categoriaId, grupo)

    const medioResuelto = resolverMedioMovimiento(
      compra,
      mediosPorId,
      pasivosPorId,
      planesPorCompraId,
    )

    movimientos.push({
      id: compra.id,
      fecha: compra.fecha,
      descripcion: compra.descripcion,
      montoTotal: monto,
      categoriaId: compra.categoriaId,
      categoriaNombre,
      categoriaIcono,
      ambito: compra.ambito,
      pagoTipo: compra.pagoTipo,
      medioDePagoId: compra.medioDePagoId,
      financiadaPorPasivoId: compra.financiadaPorPasivoId,
      obligacionId: compra.obligacionId,
      medioNombre: medioResuelto.medioNombre,
      medioTipo: medioResuelto.medioTipo,
      cuotas: medioResuelto.cuotas,
      registradoPorNombre: miembrosPorId.get(compra.registradoPor) ?? 'Miembro',
      origen: compra.origen,
    })
  }

  const cantidadCompras = movimientos.length
  const promedioPorCompra = cantidadCompras > 0 ? Math.round(total / cantidadCompras) : 0

  const categorias: CategoriaResumenGasto[] = [...gruposCategoria.values()]
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
    .map((g) => {
      const pct = total > 0 ? (g.total * 100) / total : 0
      return {
        categoriaId: g.categoriaId,
        nombre: g.nombre,
        icono: g.icono,
        total: g.total,
        cantidad: g.cantidad,
        pctTexto: formatearPorcentaje(pct),
        proporcionPct: pct,
      }
    })

  movimientos.sort(
    (a, b) =>
      b.fecha.localeCompare(a.fecha) ||
      b.montoTotal - a.montoTotal ||
      a.id.localeCompare(b.id),
  )

  const comparativaAnterior: ComparativaMesAnterior | null =
    totalAnterior > 0
      ? {
          totalAnterior,
          diferencia: total - totalAnterior,
          pctTexto: formatearPorcentaje((Math.abs(total - totalAnterior) * 100) / totalAnterior),
        }
      : null

  const categoriasDisponibles = entrada.categorias
    .filter((c) => c.activa !== false)
    .slice()
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))

  const mediosDisponibles = entrada.medios
    .filter((m) => m.activo !== false)
    .slice()
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))

  return {
    periodo: entrada.periodo,
    ambito: entrada.ambito,
    total,
    cantidadCompras,
    promedioPorCompra,
    comparativaAnterior,
    categorias,
    movimientos,
    categoriasDisponibles,
    mediosDisponibles,
  }
}
