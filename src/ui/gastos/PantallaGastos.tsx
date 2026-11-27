import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  AyudaInfo,
  Insignia,
  SelectorMes,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoPrimario,
  claseBotonPequenoSecundario,
  claseCampoTexto,
} from '../ComponentesBase'
import { useNotificacionesOpcional } from '../Notificaciones'
import { ShellApp } from '../ShellApp'
import {
  formatearFechaCortaEs,
} from '../compraRapida/formatoCop'
import { identidadMedio } from '../marcas'
import {
  formatearPeriodoEs,
  nombreMesPeriodoEs,
} from '../periodos'
import { useGastos } from './ContextoGastos'
import {
  DonaCategorias,
  ListaCategoriasGasto,
  ListaMovimientosGasto,
  SelectorAmbitoGastos,
} from './PiezasGastos'

import { ModalEditarGasto } from './ModalEditarGasto'

export function PantallaGastos() {
  const {
    periodo,
    ambito,
    vista,
    cargando,
    errorCarga,
    toast,
    limpiarToast,
    cambiarPeriodo,
    cambiarAmbito,
    recargar,
    editarCompra,
    anularCompra,
  } = useGastos()

  const [categoriaActivaId, setCategoriaActivaId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [movSeleccionadoId, setMovSeleccionadoId] = useState<string | null>(null)
  const primeraCargaRef = useRef(true)
  const yaCargadoRef = useRef(vista !== null)
  const notificaciones = useNotificacionesOpcional()

  useEffect(() => {
    if (yaCargadoRef.current) {
      recargar()
    }
  }, [recargar])

  useEffect(() => {
    if (primeraCargaRef.current) {
      primeraCargaRef.current = false
      if (!cargando) recargar()
      return
    }
    recargar()
  }, [recargar])

  useEffect(() => {
    setCategoriaActivaId(null)
  }, [periodo, ambito])

  const mesTexto = nombreMesPeriodoEs(periodo)
  const total = vista?.total ?? 0
  const cantidadCompras = vista?.cantidadCompras ?? 0
  const promedioPorCompra = vista?.promedioPorCompra ?? 0
  const categorias = vista?.categorias ?? []
  const movimientos = vista?.movimientos ?? []

  const categoriaActiva = useMemo(
    () => categorias.find((c) => c.categoriaId === categoriaActivaId) ?? null,
    [categorias, categoriaActivaId],
  )

  const movimientosFiltrados = useMemo(() => {
    const query = busqueda.trim().toLowerCase()
    return movimientos.filter((m) => {
      if (categoriaActivaId && m.categoriaId !== categoriaActivaId) return false
      if (!query) return true
      return (
        m.descripcion.toLowerCase().includes(query) ||
        m.categoriaNombre.toLowerCase().includes(query) ||
        m.medioNombre.toLowerCase().includes(query)
      )
    })
  }, [movimientos, categoriaActivaId, busqueda])

  const comparativa = vista?.comparativaAnterior ?? null

  function alternarCategoria(id: string) {
    setCategoriaActivaId((actual) => (actual === id ? null : id))
  }

  return (
    <ShellApp
      titulo="Gastos generales"
      subtitulo={`${formatearPeriodoEs(periodo)} · ${cantidadCompras === 1 ? '1 compra' : `${cantidadCompras} compras`}`}
      accionDerecha={
        <Link to="/compra" className={`${claseBotonPequenoSecundario} no-underline`}>
          + Compra
        </Link>
      }
      mostrarNavegacion
    >
      {toast && !notificaciones ? (
        <div
          className="hogar-pill-toast fixed top-3 left-1/2 z-[60] flex min-h-11 w-[min(calc(100vw-24px),366px)] -translate-x-1/2 items-center justify-between gap-2 rounded-full bg-[#141e1b]/94 px-3.5 py-2 text-[0.8125rem] font-semibold text-white shadow-[var(--hogar-shadow-elevated)]"
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1 break-words">{toast}</span>
          <button
            type="button"
            onClick={limpiarToast}
            className="cursor-pointer rounded-full border-0 bg-white/15 px-2 py-0.5 text-xs font-bold text-white hover:bg-white/25"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      ) : null}

      {vista?.sinConexion ? (
        <Aviso variante="ambar" icono="◷" role="status">
          <p>Modo sin conexión: mostrando la última copia guardada en este dispositivo.</p>
        </Aviso>
      ) : null}

      {errorCarga ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorCarga}</p>
          <button
            type="button"
            className={`${claseBotonPequenoSecundario} mt-1`}
            onClick={recargar}
          >
            Reintentar
          </button>
        </Aviso>
      ) : null}

      <SelectorMes periodo={periodo} onCambiar={cambiarPeriodo} />

      <SelectorAmbitoGastos ambito={ambito} onCambiar={cambiarAmbito} />

      <Tarjeta acento="primario" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="m-0 text-xs font-bold uppercase tracking-wide text-hogar-tinta-suave">
                {ambito === 'hogar'
                  ? 'Gasto del hogar'
                  : ambito === 'personal'
                    ? 'Tus gastos personales'
                    : 'Hogar + tus personales'}
              </p>
              <AyudaInfo
                etiqueta="Información del cálculo de gastos"
                texto="Se agrupa por fecha de compra y cada compra cuenta una sola vez, incluso si se paga a cuotas."
              />
            </div>
            <p className="hogar-cop m-0 mt-0.5 text-2xl font-extrabold tracking-tight text-hogar-tinta">
              {formatearPesos(total)}
            </p>
          </div>
          {comparativa ? (
            <Insignia variante={comparativa.diferencia <= 0 ? 'primario' : 'ambar'}>
              {comparativa.diferencia > 0
                ? `↑ ${comparativa.pctTexto} vs mes ant.`
                : comparativa.diferencia < 0
                  ? `↓ ${comparativa.pctTexto} vs mes ant.`
                  : 'Igual al mes ant.'}
            </Insignia>
          ) : null}
        </div>

        <DonaCategorias
          categorias={categorias}
          total={total}
          cantidadCompras={cantidadCompras}
          categoriaActivaId={categoriaActivaId}
          onAlternarCategoria={alternarCategoria}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hogar-borde pt-2.5 text-xs text-hogar-tinta-suave">
          <span>
            Promedio por compra:{' '}
            <strong className="hogar-cop text-hogar-tinta">
              {formatearPesos(promedioPorCompra)}
            </strong>
          </span>
          {(vista?.totalAbonosDeuda ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1">
              Abonos a obligaciones:{' '}
              <strong className="hogar-cop text-hogar-indigo">
                {formatearPesos(vista?.totalAbonosDeuda ?? 0)}
              </strong>
              <AyudaInfo
                etiqueta="Información sobre abonos a obligaciones"
                texto="Pagos a tarjetas, créditos y deudas del mes. Se muestran aparte del consumo para no contar dos veces compras a cuotas."
              />
            </span>
          ) : null}
        </div>
      </Tarjeta>

      {cargando && !vista ? (
        <Aviso variante="indigo" icono="◷" role="status">
          <p className="font-bold">Cargando gastos de {mesTexto}…</p>
        </Aviso>
      ) : null}

      <section aria-labelledby="gastos-categorias-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="gastos-categorias-heading" className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Por categoría
          </h2>
          {categoriaActiva ? (
            <button
              type="button"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border-0 bg-transparent px-2 text-xs font-bold text-hogar-primario underline"
              onClick={() => setCategoriaActivaId(null)}
            >
              Ver todas
            </button>
          ) : null}
        </div>

        {categorias.length > 0 ? (
          <ListaCategoriasGasto
            categorias={categorias}
            categoriaActivaId={categoriaActivaId}
            onAlternarCategoria={alternarCategoria}
          />
        ) : !cargando ? (
          <Tarjeta suave className="flex flex-col items-start gap-2.5">
            <p className="m-0 text-sm font-bold text-hogar-tinta">
              Sin compras registradas en {mesTexto}.
            </p>
            <Link to="/compra" className={`${claseBotonPequenoPrimario} no-underline`}>
              Registrar compra
            </Link>
          </Tarjeta>
        ) : null}
      </section>

      {movimientos.length > 0 ? (
        <section aria-labelledby="gastos-movimientos-heading" className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="gastos-movimientos-heading"
              className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta"
            >
              Movimientos
            </h2>
            <span className="text-xs font-semibold text-hogar-tinta-suave">
              {movimientosFiltrados.length} de {movimientos.length}
            </span>
          </div>

          {categoriaActiva ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-hogar-primario-suave px-3 py-1.5 text-xs font-bold text-hogar-primario">
              <span>Filtrado por: {categoriaActiva.nombre}</span>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent font-extrabold text-hogar-primario underline"
                onClick={() => setCategoriaActivaId(null)}
              >
                Quitar filtro
              </button>
            </div>
          ) : null}

          <div>
            <label htmlFor="buscar-gasto" className="sr-only">
              Buscar comercio, categoría o medio de pago
            </label>
            <input
              id="buscar-gasto"
              type="search"
              className={claseCampoTexto}
              placeholder="Buscar comercio, categoría o medio…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          {movimientosFiltrados.length > 0 ? (
            <ListaMovimientosGasto
              movimientos={movimientosFiltrados}
              seleccionadoId={movSeleccionadoId}
              onSeleccionar={(mov) =>
                setMovSeleccionadoId((actual) => (actual === mov.id ? null : mov.id))
              }
              renderDetalle={(mov) => (
                <ModalEditarGasto
                  movimiento={mov}
                  categorias={vista?.categoriasDisponibles ?? []}
                  medios={vista?.mediosDisponibles ?? []}
                  onCerrar={() => setMovSeleccionadoId(null)}
                  onGuardar={editarCompra}
                  onAnular={anularCompra}
                />
              )}
            />
          ) : (
            <p className={claseAyudaCampo}>
              Ninguna compra coincide con «{busqueda.trim()}».
            </p>
          )}
        </section>
      ) : null}

      {(vista?.abonosDeuda?.length ?? 0) > 0 ? (
        <section aria-labelledby="gastos-abonos-heading" className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h2
                id="gastos-abonos-heading"
                className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta"
              >
                Abonos a obligaciones
              </h2>
              <AyudaInfo
                etiqueta="Información de abonos en gastos"
                texto="Salidas registradas en Obligaciones. No se suman al consumo arriba para evitar doble conteo."
              />
            </div>
            <Link
              to="/obligaciones"
              className="text-xs font-bold text-hogar-primario no-underline hover:underline"
            >
              Ver obligaciones →
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {(vista?.abonosDeuda ?? []).map((abono) => {
              const identidad = identidadMedio(
                abono.medioNombre,
                abono.medioTipo === 'efectivo' ? 'efectivo' : 'cuenta',
              )
              const { Logo } = identidad
              return (
                <li
                  key={abono.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-hogar-borde bg-hogar-superficie p-3 shadow-[var(--hogar-shadow-card)]"
                >
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
                        Abono · {abono.pasivoNombre}
                      </p>
                      <p className="m-0 mt-0.5 truncate text-xs text-hogar-tinta-suave">
                        {formatearFechaCortaEs(abono.fecha)} · {abono.medioNombre} · {abono.registradoPorNombre}
                        {abono.nota ? ` · ${abono.nota}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="hogar-cop shrink-0 text-sm font-extrabold text-hogar-indigo">
                    {formatearPesos(abono.monto)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </ShellApp>
  )
}
