import type { ReactNode } from 'react'
import type {
  CategoriaResumenGasto,
  FiltroAmbitoGastos,
  MovimientoGasto,
} from '../../app/gastos'
import { formatearPesos } from '../../domain/pesos'
import { Insignia, Tarjeta } from '../ComponentesBase'
import { formatearFechaCortaEs } from '../compraRapida/formatoCop'
import { IconoCategoria, identidadMedio } from '../marcas'

const PALETA_CATEGORIAS = [
  '#0f5c48',
  '#3650a0',
  '#c97a16',
  '#c03953',
  '#0d8a8a',
  '#6d3fc4',
  '#d65a31',
  '#475569',
] as const

export function colorCategoria(indice: number): string {
  return PALETA_CATEGORIAS[indice % PALETA_CATEGORIAS.length] ?? '#0f5c48'
}

export function SelectorAmbitoGastos({
  ambito,
  onCambiar,
}: {
  ambito: FiltroAmbitoGastos
  onCambiar: (siguiente: FiltroAmbitoGastos) => void
}) {
  const base =
    'relative z-10 inline-flex min-h-11 w-full min-w-0 items-center justify-center overflow-hidden rounded-[12px] border-0 bg-transparent px-1 py-1.5 text-center text-[0.72rem] font-bold leading-tight cursor-pointer transition-colors duration-200'
  const desplazamiento =
    ambito === 'hogar'
      ? 'translate-x-0 bg-gradient-to-b from-[#136e56] to-[#0c4e3d]'
      : ambito === 'personal'
        ? 'translate-x-full bg-gradient-to-b from-[#3650a0] to-[#263a78]'
        : 'translate-x-[200%] bg-gradient-to-b from-[#2b3631] to-[#161e1b]'

  return (
    <div
      className="relative grid grid-cols-3 rounded-2xl bg-[#e3e7e2] p-1 shadow-[inset_0_1px_2px_rgba(16,24,20,0.08)]"
      role="group"
      aria-label="Filtrar gastos por ámbito"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/3)] rounded-[12px] shadow-[0_2px_8px_rgba(16,24,20,0.2)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${desplazamiento}`}
      />
      <button
        type="button"
        className={`${base} ${ambito === 'hogar' ? 'text-white' : 'text-hogar-tinta hover:text-hogar-primario'}`}
        aria-pressed={ambito === 'hogar'}
        onClick={() => onCambiar('hogar')}
      >
        <span className="block w-full truncate">Hogar</span>
      </button>
      <button
        type="button"
        className={`${base} ${ambito === 'personal' ? 'text-white' : 'text-hogar-tinta hover:text-hogar-indigo'}`}
        aria-pressed={ambito === 'personal'}
        onClick={() => onCambiar('personal')}
      >
        <span className="block w-full truncate">Mis personales</span>
      </button>
      <button
        type="button"
        className={`${base} ${ambito === 'todos' ? 'text-white' : 'text-hogar-tinta'}`}
        aria-pressed={ambito === 'todos'}
        onClick={() => onCambiar('todos')}
      >
        <span className="block w-full truncate">Todos</span>
      </button>
    </div>
  )
}

export function DonaCategorias({
  categorias,
  total,
  cantidadCompras,
  categoriaActivaId,
  onAlternarCategoria,
}: {
  categorias: CategoriaResumenGasto[]
  total: number
  cantidadCompras: number
  categoriaActivaId: string | null
  onAlternarCategoria: (categoriaId: string) => void
}) {
  const radio = 72
  const circunferencia = 2 * Math.PI * radio
  const activa = categoriaActivaId
    ? categorias.find((c) => c.categoriaId === categoriaActivaId) ?? null
    : null

  let acumulado = 0
  const segmentos = categorias.map((cat, idx) => {
    const largoBruto = (cat.proporcionPct / 100) * circunferencia
    const gap = categorias.length > 1 ? Math.min(2.2, largoBruto * 0.2) : 0
    const largo = Math.max(0, largoBruto - gap)
    const offset = -acumulado
    acumulado += largoBruto
    return { cat, color: colorCategoria(idx), largo, offset }
  })

  const montoCentro = formatearPesos(activa ? activa.total : total)
  const claseMontoCentro =
    montoCentro.length >= 12 ? 'text-xs' : montoCentro.length >= 9 ? 'text-sm' : 'text-base'

  return (
    <div className="relative mx-auto flex size-[200px] items-center justify-center">
      <svg
        className="size-full -rotate-90"
        viewBox="0 0 180 180"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="90"
          cy="90"
          r={radio}
          fill="none"
          stroke="#eaeeea"
          strokeWidth="18"
        />
        {total > 0
          ? segmentos.map(({ cat, color, largo, offset }) => {
              const esActiva = categoriaActivaId === cat.categoriaId
              const atenuada = categoriaActivaId !== null && !esActiva
              return (
                <circle
                  key={cat.categoriaId}
                  cx="90"
                  cy="90"
                  r={radio}
                  fill="none"
                  stroke={color}
                  strokeWidth={esActiva ? 21 : 18}
                  strokeDasharray={`${largo} ${circunferencia}`}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                  className={`cursor-pointer transition-all duration-300 ease-out ${
                    atenuada ? 'opacity-30' : 'opacity-100'
                  }`}
                  onClick={() => onAlternarCategoria(cat.categoriaId)}
                />
              )
            })
          : null}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        {activa ? (
          <>
            <span className="max-w-full truncate text-[0.6875rem] font-bold text-hogar-tinta-suave">
              {activa.nombre}
            </span>
            <span className={`hogar-cop font-extrabold leading-tight text-hogar-tinta ${claseMontoCentro}`}>
              {montoCentro}
            </span>
            <span className="hogar-cop text-[0.6875rem] font-bold text-hogar-primario">
              {activa.pctTexto}
            </span>
          </>
        ) : (
          <>
            <span className="text-[0.6875rem] font-bold text-hogar-tinta-suave">
              {cantidadCompras === 1 ? '1 compra' : `${cantidadCompras} compras`}
            </span>
            <span className={`hogar-cop font-extrabold leading-tight text-hogar-tinta ${claseMontoCentro}`}>
              {montoCentro}
            </span>
            <span className="text-[0.6875rem] font-semibold text-hogar-tinta-suave">
              Total del mes
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export function ListaCategoriasGasto({
  categorias,
  categoriaActivaId,
  onAlternarCategoria,
}: {
  categorias: CategoriaResumenGasto[]
  categoriaActivaId: string | null
  onAlternarCategoria: (categoriaId: string) => void
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {categorias.map((cat, idx) => {
        const color = colorCategoria(idx)
        const activa = categoriaActivaId === cat.categoriaId
        return (
          <li key={cat.categoriaId}>
            <button
              type="button"
              aria-pressed={activa}
              onClick={() => onAlternarCategoria(cat.categoriaId)}
              className={`flex w-full min-h-11 cursor-pointer flex-col gap-2 rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-150 active:scale-[0.99] ${
                activa
                  ? 'border-hogar-primario bg-hogar-primario-suave/55 shadow-[0_4px_12px_-4px_rgba(15,92,72,0.28)]'
                  : 'border-hogar-borde bg-hogar-superficie shadow-[var(--hogar-shadow-card)] hover:bg-hogar-superficie-suave/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-xl text-white shadow-xs"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  >
                    <IconoCategoria nombre={cat.nombre} icono={cat.icono} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-hogar-tinta">
                      {cat.nombre}
                    </span>
                    <span className="block text-xs text-hogar-tinta-suave">
                      {cat.cantidad === 1 ? '1 compra' : `${cat.cantidad} compras`}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="hogar-cop block text-sm font-extrabold text-hogar-tinta">
                    {formatearPesos(cat.total)}
                  </span>
                  <span className="hogar-cop block text-xs font-bold text-hogar-tinta-suave">
                    {cat.pctTexto}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-hogar-superficie-suave">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.max(4, Math.min(100, cat.proporcionPct))}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export { ModalEditarGasto } from './ModalEditarGasto'

export function ListaMovimientosGasto({
  movimientos,
  seleccionadoId,
  onSeleccionar,
  renderDetalle,
}: {
  movimientos: MovimientoGasto[]
  seleccionadoId?: string | null | undefined
  onSeleccionar?: ((mov: MovimientoGasto) => void) | undefined
  renderDetalle?: ((mov: MovimientoGasto) => ReactNode) | undefined
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {movimientos.map((mov) => {
        const tipoVisual =
          mov.medioTipo === 'efectivo'
            ? 'efectivo'
            : mov.medioTipo === 'tarjeta'
              ? 'tarjeta'
              : mov.medioTipo === 'prestamo'
                ? 'prestamo'
                : 'cuenta'
        const identidad = identidadMedio(mov.medioNombre, tipoVisual)
        const { Logo } = identidad
        const titulo = mov.descripcion.trim() || mov.categoriaNombre
        const abierto = seleccionadoId === mov.id

        const cabecera = (
          <div className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-2xl shadow-[0_3px_8px_-2px_rgba(16,24,20,0.22)]"
                style={{ background: identidad.gradiente, color: identidad.texto }}
                aria-hidden="true"
              >
                <Logo className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-extrabold text-hogar-tinta">
                  {titulo}
                </p>
                <p className="m-0 mt-0.5 truncate text-xs text-hogar-tinta-suave">
                  {formatearFechaCortaEs(mov.fecha)} · {mov.categoriaNombre} · {mov.medioNombre}
                  {mov.ambito === 'hogar' ? ` · ${mov.registradoPorNombre}` : ''}
                </p>
                {mov.ambito === 'personal' || (mov.cuotas !== null && mov.cuotas > 1) ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {mov.ambito === 'personal' ? (
                      <Insignia variante="indigo">Personal</Insignia>
                    ) : null}
                    {mov.cuotas !== null && mov.cuotas > 1 ? (
                      <Insignia variante="neutral">{mov.cuotas} cuotas</Insignia>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hogar-cop text-sm font-extrabold text-hogar-tinta">
                {formatearPesos(mov.montoTotal)}
              </span>
              {onSeleccionar ? (
                <span
                  aria-hidden="true"
                  className={`inline-block text-base font-bold text-hogar-tinta-tenue transition-transform duration-150 ${
                    abierto ? 'rotate-90' : ''
                  }`}
                >
                  ›
                </span>
              ) : null}
            </div>
          </div>
        )

        return (
          <li key={mov.id}>
            <Tarjeta
              acento={abierto ? 'primario' : 'ninguno'}
              className="overflow-hidden p-0 transition hover:border-hogar-borde-fuerte"
            >
              {onSeleccionar ? (
                <button
                  type="button"
                  aria-expanded={abierto}
                  onClick={() => onSeleccionar(mov)}
                  className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-hogar-primario"
                >
                  {cabecera}
                </button>
              ) : (
                cabecera
              )}
              {abierto ? renderDetalle?.(mov) : null}
            </Tarjeta>
          </li>
        )
      })}
    </ul>
  )
}
