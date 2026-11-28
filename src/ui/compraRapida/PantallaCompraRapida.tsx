import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ErrorBorrador } from '../../app/compraRapida'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoPrimario,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { IconoComentario, IconoQr } from '../Iconos'
import { ShellApp } from '../ShellApp'
import { identidadMedio } from '../marcas'
import { useCompraRapida, type DatosRecompra } from './ContextoCompraRapida'
import {
  CarruselComercios,
  CarruselMedios,
  ChipsCuotas,
  GrillaCategorias,
  SelectorAmbito,
  type ComercioSeleccionado,
} from './PiezasCompra'
import { aplicarTeclaCop, formatearFechaCortaEs, parsearDigitosCop } from './formatoCop'

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'borrar'] as const

function combinarDescripcion(comercio: string | null, nota: string): string {
  const comercioLimpio = comercio?.trim() ?? ''
  const notaLimpia = nota.trim()
  if (!comercioLimpio) return notaLimpia
  if (!notaLimpia) return comercioLimpio
  if (notaLimpia.toLowerCase().startsWith(comercioLimpio.toLowerCase())) return notaLimpia
  return `${comercioLimpio} · ${notaLimpia}`
}

export function PantallaCompraRapida() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    catalogo,
    cargando,
    errorCarga,
    guardando,
    borrador,
    mediosDisponibles,
    medioSeleccionado,
    toastGuardado,
    avisoEstado,
    confirmacionDuplicado,
    sync,
    recargarCatalogo,
    setBorrador,
    cambiarAmbito,
    seleccionarMedio,
    aplicarRecompra,
    guardarBorrador,
    descartarConfirmacionDuplicado,
    anunciarEstado,
  } = useCompraRapida()

  const [verTodas, setVerTodas] = useState(false)
  const [comercioSeleccionado, setComercioSeleccionado] = useState<string | null>(null)
  const [panelNotaAbierto, setPanelNotaAbierto] = useState(false)
  const [errorValidacion, setErrorValidacion] = useState<ErrorBorrador | null>(null)
  const [avisoCuotas, setAvisoCuotas] = useState('')
  const montoRef = useRef<HTMLInputElement>(null)
  const montoBoxRef = useRef<HTMLDivElement>(null)
  const primerChipRef = useRef<HTMLButtonElement>(null)
  const primerMedioRef = useRef<HTMLButtonElement>(null)
  const notaRef = useRef<HTMLInputElement>(null)
  const fechaRef = useRef<HTMLInputElement>(null)
  const recompraRef = useRef(false)

  function cerrarPanelNota() {
    setPanelNotaAbierto(false)
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0)
    }
  }

  useEffect(() => {
    if (!panelNotaAbierto) return
    function cerrarConEscape(evento: KeyboardEvent) {
      if (evento.key === 'Escape') cerrarPanelNota()
    }
    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [panelNotaAbierto])

  function abrirPanelNota() {
    flushSync(() => setPanelNotaAbierto(true))
    notaRef.current?.focus({ preventScroll: true })
  }

  function alternarPanelNota() {
    if (panelNotaAbierto) cerrarPanelNota()
    else abrirPanelNota()
  }

  function pulsarMonto() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(6)
    }
    const el = montoBoxRef.current
    if (!el) return
    el.classList.remove('hogar-monto-pulse')
    void el.offsetWidth
    el.classList.add('hogar-monto-pulse')
  }

  useEffect(() => {
    const estado = location.state as { recompra?: DatosRecompra } | null
    if (estado?.recompra && !recompraRef.current) {
      recompraRef.current = true
      aplicarRecompra(estado.recompra)
    }
  }, [aplicarRecompra, location.state])

  const categorias = useMemo(
    () => (catalogo ? [...catalogo.categorias].sort((a, b) => a.orden - b.orden) : []),
    [catalogo],
  )
  const categoriasVisibles = useMemo(() => {
    if (verTodas || categorias.length <= 6) return categorias
    const top = categorias.slice(0, 6)
    if (borrador.categoriaId && !top.some((c) => c.id === borrador.categoriaId)) {
      const elegida = categorias.find((c) => c.id === borrador.categoriaId)
      if (elegida) return [...top.slice(0, 5), elegida]
    }
    return top
  }, [borrador.categoriaId, categorias, verTodas])

  const mediosSinPrestamo = useMemo(
    () => mediosDisponibles.filter((m) => m.tipo !== 'prestamo'),
    [mediosDisponibles],
  )
  const prestamos = useMemo(
    () => mediosDisponibles.filter((m) => m.tipo === 'prestamo'),
    [mediosDisponibles],
  )
  const hoy = hoyCivil(new Date())
  const subtituloFecha =
    borrador.fecha === hoy
      ? `Hoy, ${formatearFechaCortaEs(borrador.fecha)}`
      : formatearFechaCortaEs(borrador.fecha, true)
  const badgeMonto =
    medioSeleccionado?.tipo === 'tarjeta'
      ? borrador.cuotas === 1
        ? '1 cuota'
        : `${borrador.cuotas} cuotas`
      : medioSeleccionado?.tipo === 'prestamo'
        ? 'Préstamo'
        : 'Contado'

  function cambiarMedio(id: string) {
    const prev = medioSeleccionado
    const next = mediosDisponibles.find((m) => m.id === id)
    setErrorValidacion(null)
    seleccionarMedio(id)
    if (prev?.tipo === 'tarjeta' && next?.tipo !== 'tarjeta') {
      const msg = 'Cuotas disponibles solo con tarjeta de crédito.'
      setAvisoCuotas(msg)
      anunciarEstado(msg)
    } else {
      setAvisoCuotas('')
    }
  }

  const comentariosRapidosCategoria = useMemo(() => {
    if (!borrador.categoriaId) return []
    return (catalogo?.comentariosRapidos ?? []).filter(
      (c) => c.categoriaId === borrador.categoriaId,
    )
  }, [borrador.categoriaId, catalogo?.comentariosRapidos])

  const descripcionCombinada = useMemo(
    () => combinarDescripcion(comercioSeleccionado, borrador.descripcion),
    [borrador.descripcion, comercioSeleccionado],
  )

  function elegirComercio(comercio: ComercioSeleccionado) {
    setErrorValidacion(null)
    const yaActivo = comercioSeleccionado?.trim().toLowerCase() === comercio.nombre.toLowerCase()
    const siguienteComercio = yaActivo ? null : comercio.nombre
    setComercioSeleccionado(siguienteComercio)
    if (!yaActivo && !borrador.categoriaId) {
      let siguienteCategoriaId: string | null = null
      if (
        comercio.categoriaSugeridaId &&
        categorias.some((c) => c.id === comercio.categoriaSugeridaId)
      ) {
        siguienteCategoriaId = comercio.categoriaSugeridaId
      } else if (comercio.categoriaSugerida) {
        const clave = comercio.categoriaSugerida
        const cat = categorias.find((c) =>
          c.nombre
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .includes(clave),
        )
        if (cat) siguienteCategoriaId = cat.id
      }
      if (siguienteCategoriaId) {
        setBorrador((p) => ({ ...p, categoriaId: siguienteCategoriaId }))
      }
    }
  }

  async function intentarGuardar(ignorarDuplicado = false) {
    if (guardando) return
    const borradorEnvio = {
      ...borrador,
      descripcion: descripcionCombinada,
    }
    const res = await guardarBorrador(borradorEnvio, { ignorarDuplicadoInmediato: ignorarDuplicado })
    if (res.estado === 'error') {
      setErrorValidacion(res.error)
      if (res.error.campo === 'monto') montoRef.current?.focus()
      else if (res.error.campo === 'categoria') primerChipRef.current?.focus()
      else if (res.error.campo === 'medio') primerMedioRef.current?.focus()
      else if (res.error.campo === 'descripcion') {
        flushSync(() => setPanelNotaAbierto(true))
        notaRef.current?.focus()
      } else if (res.error.campo === 'fecha') {
        flushSync(() => setPanelNotaAbierto(true))
        fechaRef.current?.focus()
      }
      return
    }
    if (res.estado === 'fallo') return setErrorValidacion({ campo: 'monto', mensaje: res.mensaje })
    setErrorValidacion(null)
    setAvisoCuotas('')
    setComercioSeleccionado(null)
    cerrarPanelNota()
  }

  return (
    <ShellApp
      titulo="Compra rápida"
      subtitulo={subtituloFecha}
      accionDerecha={
        <Link
          to="/compra/escanear"
          className={`${claseBotonPequenoSecundario} no-underline`}
          aria-label="Escanear factura electrónica con QR DIAN"
        >
          <IconoQr className="size-[18px]" />
          <span>QR</span>
        </Link>
      }
      mostrarNavegacion
      compacto
      etiquetaBarraAccion="Guardar compra rápida"
      barraAccion={
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            className={`${claseBotonPrimario} flex-1 ${borrador.monto <= 0 ? 'opacity-65' : ''}`}
            aria-disabled={borrador.monto <= 0 || guardando ? 'true' : undefined}
            data-sin-scroll
            onClick={() => void intentarGuardar(false)}
          >
            {guardando
              ? 'Guardando…'
              : borrador.monto > 0
                ? `Guardar ${formatearPesos(borrador.monto)}`
                : 'Guardar compra'}
          </button>
          <button
            type="button"
            onClick={alternarPanelNota}
            aria-label={
              descripcionCombinada
                ? `Editar comentario: ${descripcionCombinada}`
                : 'Agregar comentario o fecha'
            }
            aria-expanded={panelNotaAbierto}
            aria-controls="panel-comentario-compra"
            className="relative inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-hogar-borde-fuerte bg-hogar-superficie px-3 text-hogar-tinta shadow-[0_2px_8px_-2px_rgba(16,24,20,0.12)] transition-transform duration-150 active:scale-95 hover:bg-hogar-superficie-suave"
          >
            <IconoComentario className="size-5" />
            {descripcionCombinada ? (
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 size-2 rounded-full bg-hogar-primario ring-2 ring-hogar-superficie"
              />
            ) : null}
          </button>
        </div>
      }
      superposicion={
        <div
          data-modal-fondo="comentario-compra"
          className={
            panelNotaAbierto
              ? 'absolute inset-0 z-50 flex flex-col justify-start overflow-y-auto bg-hogar-tinta/40 px-3.5 pt-[calc(env(safe-area-inset-top,0px)+4.75rem)] pb-6 backdrop-blur-[2px]'
              : 'hidden'
          }
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarPanelNota()
          }}
        >
          <div
            id="panel-comentario-compra"
            role="dialog"
            aria-modal="true"
            aria-label="Comentario y fecha de la compra"
            className="hogar-toast w-full rounded-2xl border border-hogar-borde-fuerte bg-hogar-superficie p-4 shadow-[var(--hogar-shadow-elevated)]"
          >
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="m-0 text-sm font-extrabold text-hogar-tinta">Comentario y fecha</h2>
              <button
                type="button"
                className={claseBotonPequenoPrimario}
                onClick={cerrarPanelNota}
              >
                Listo
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="nota-compra" className={claseEtiquetaCampo}>
                    Comentario
                  </label>
                  <Link
                    to="/hogar#comentarios-rapidos"
                    className="text-xs font-bold text-hogar-primario underline"
                    onClick={cerrarPanelNota}
                  >
                    Administrar
                  </Link>
                </div>
                <input
                  ref={notaRef}
                  id="nota-compra"
                  className={claseCampoTexto}
                  type="text"
                  placeholder="Ej. Tanqueada moto, almuerzo…"
                  value={borrador.descripcion}
                  onChange={(e) => setBorrador((p) => ({ ...p, descripcion: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      cerrarPanelNota()
                    }
                  }}
                />
                {comentariosRapidosCategoria.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Comentarios frecuentes en esta categoría">
                    {comentariosRapidosCategoria.map((c) => {
                      const activo = borrador.descripcion.trim().toLowerCase() === c.texto.toLowerCase()
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={activo}
                          className={activo ? claseBotonPequenoPrimario : claseBotonPequenoSecundario}
                          onClick={() =>
                            setBorrador((p) => ({
                              ...p,
                              descripcion: activo ? '' : c.texto,
                            }))
                          }
                        >
                          {c.texto}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
              <div className="flex min-w-0 max-w-full flex-col gap-1.5 overflow-hidden">
                <label htmlFor="fecha-compra" className={claseEtiquetaCampo}>
                  Fecha
                </label>
                <input
                  ref={fechaRef}
                  id="fecha-compra"
                  className={claseCampoTexto}
                  type="date"
                  value={borrador.fecha}
                  onChange={(e) => setBorrador((p) => ({ ...p, fecha: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>
      }
    >
      {!toastGuardado && avisoEstado ? (
        <p className="sr-only" role="status" aria-live="polite">
          {avisoEstado}
        </p>
      ) : null}

      {sync && sync.rechazados.length > 0 ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p className="font-bold">Un registro pendiente fue rechazado al sincronizar:</p>
          <p>{sync.rechazados[0]?.motivo}</p>
        </Aviso>
      ) : sync && sync.pendientes > 0 ? (
        <p className={claseAyudaCampo} role="status">
          {sync.pendientes} {sync.pendientes === 1 ? 'pendiente' : 'pendientes'} por sincronizar
        </p>
      ) : null}

      {errorCarga ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorCarga}</p>
          <button
            type="button"
            className={`${claseBotonPequenoSecundario} mt-1`}
            onClick={recargarCatalogo}
          >
            Reintentar
          </button>
        </Aviso>
      ) : null}

      {errorValidacion ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorValidacion.mensaje}</p>
        </Aviso>
      ) : null}

      {confirmacionDuplicado ? (
        <Aviso variante="ambar" icono="▲" role="alert">
          <p className="font-bold">Posible compra duplicada</p>
          <p>
            Ya registraste {formatearPesos(borrador.monto)} con esta categoría y medio hace menos
            de un minuto.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              className={`${claseBotonPequenoSecundario} border-hogar-ambar text-hogar-tinta`}
              onClick={() => void intentarGuardar(true)}
            >
              Guardar de todas formas
            </button>
            <button
              type="button"
              className={claseBotonPequenoSecundario}
              onClick={descartarConfirmacionDuplicado}
            >
              Cancelar
            </button>
          </div>
        </Aviso>
      ) : null}

      <section aria-labelledby="ambito-heading">
        <h2 id="ambito-heading" className="sr-only">
          Ámbito de la compra
        </h2>
        <SelectorAmbito
          ambito={borrador.ambito}
          onCambiar={(s) => {
            setErrorValidacion(null)
            cambiarAmbito(s)
          }}
        />
      </section>

      <section
        aria-labelledby="monto-heading"
        className="pointer-events-none sticky top-2 z-20"
      >
        <h2 id="monto-heading" className="sr-only">
          Monto en pesos colombianos
        </h2>
        <div className="pointer-events-auto rounded-[22px] border border-hogar-borde-fuerte/75 bg-hogar-superficie/96 px-3.5 py-2 text-right shadow-[0_14px_32px_-8px_rgba(16,24,20,0.24),0_2px_8px_rgba(16,24,20,0.08)] backdrop-blur-md">
          <div className="mb-0.5 flex items-center justify-between gap-2 text-[0.8125rem] text-hogar-tinta-suave">
            <label htmlFor="monto-input" className="inline-flex items-center gap-1.5 font-bold text-hogar-tinta-suave">
              {medioSeleccionado ? (
                <span
                  className="inline-block size-2 rounded-full"
                  style={{
                    backgroundColor: identidadMedio(
                      medioSeleccionado.nombre,
                      medioSeleccionado.tipo === 'tarjeta'
                        ? 'tarjeta'
                        : medioSeleccionado.tipo === 'prestamo'
                          ? 'prestamo'
                          : 'medio',
                    ).fondo,
                  }}
                  aria-hidden="true"
                />
              ) : null}
              <span>Monto</span>
            </label>
            <div className="flex min-w-0 items-center gap-1.5">
              {descripcionCombinada ? (
                <span className="max-w-[140px] truncate rounded-full border border-hogar-borde bg-hogar-fondo px-2 py-0.5 text-[0.6875rem] font-semibold text-hogar-tinta-suave">
                  {descripcionCombinada}
                </span>
              ) : null}
              <Insignia variante="neutral">{badgeMonto}</Insignia>
            </div>
          </div>
          <div ref={montoBoxRef}>
            <input
              ref={montoRef}
              id="monto-input"
              className="hogar-cop min-h-[42px] min-w-11 w-full border-0 bg-transparent py-0.5 text-right text-[2rem] font-extrabold leading-[1.1] tracking-tight text-hogar-tinta focus:outline-none"
              type="text"
              inputMode="numeric"
              value={formatearPesos(borrador.monto)}
              aria-invalid={errorValidacion?.campo === 'monto' ? 'true' : undefined}
              onChange={(e) => {
                setErrorValidacion(null)
                setBorrador((p) => ({ ...p, monto: parsearDigitosCop(e.target.value) }))
              }}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="medio-heading" className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 id="medio-heading" className="m-0 text-[0.875rem] font-extrabold text-hogar-tinta">
            Método de pago
          </h2>
          {medioSeleccionado ? (
            <span className="truncate text-xs font-semibold text-hogar-tinta-suave">
              {medioSeleccionado.nombre}
            </span>
          ) : null}
        </div>

        {mediosSinPrestamo.length > 0 ? (
          <CarruselMedios
            medios={mediosSinPrestamo}
            seleccionadoId={borrador.medioId}
            primerMedioRef={primerMedioRef}
            invalido={errorValidacion?.campo === 'medio'}
            onElegir={cambiarMedio}
          />
        ) : !cargando ? (
          <Tarjeta suave className="flex items-center justify-between gap-2">
            <span className="text-sm text-hogar-tinta-suave">Sin medios configurados.</span>
            <Link to="/hogar#medios-de-pago" className={`${claseBotonPequenoSecundario} no-underline`}>
              Agregar medio
            </Link>
          </Tarjeta>
        ) : null}

        {prestamos.length > 0 ? (
          <div className="flex items-center gap-2">
            <label htmlFor="prestamo-origen" className="sr-only">
              Compra financiada con préstamo
            </label>
            <select
              id="prestamo-origen"
              className={`${claseCampoTexto} text-sm`}
              value={medioSeleccionado?.tipo === 'prestamo' ? medioSeleccionado.id : ''}
              onChange={(e) => {
                const id = e.target.value
                if (id) cambiarMedio(id)
                else if (mediosSinPrestamo[0]) cambiarMedio(mediosSinPrestamo[0].id)
              }}
            >
              <option value="">O usar préstamo en efectivo…</option>
              {prestamos.map((p) => (
                <option key={p.id} value={p.id}>
                  Préstamo: {p.nombre} ({formatearPesos(p.disponible)})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {medioSeleccionado?.tipo === 'prestamo' ? (
          <Aviso variante="indigo" icono="ℹ">
            <p>
              Con préstamo ({formatearPesos(medioSeleccionado.disponible)} disponible). No suma
              aporte hoy.
            </p>
          </Aviso>
        ) : null}

        {medioSeleccionado?.tipo === 'tarjeta' ? (
          <ChipsCuotas
            cuotas={borrador.cuotas}
            ariaLabel={`Número de cuotas en ${medioSeleccionado.nombre}`}
            onElegir={(n, esOtro) => {
              setBorrador((p) => ({ ...p, cuotas: n }))
              if (n > 1 || esOtro) {
                navigate('/compra/cuotas', { state: esOtro ? { abrirOtro: true } : undefined })
              }
            }}
          />
        ) : avisoCuotas ? (
          <p className={claseAyudaCampo}>{avisoCuotas}</p>
        ) : null}
      </section>

      <section aria-labelledby="categoria-heading">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 id="categoria-heading" className="m-0 text-[0.875rem] font-extrabold text-hogar-tinta">
            Categoría
          </h2>
          {categorias.length > 6 ? (
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent px-2 text-[0.8125rem] font-bold text-hogar-primario underline"
              onClick={() => setVerTodas((v) => !v)}
            >
              {verTodas ? 'Ver menos' : 'Ver todas'}
            </button>
          ) : null}
        </div>
        {cargando && categoriasVisibles.length === 0 ? (
          <p className={claseAyudaCampo}>Cargando categorías…</p>
        ) : (
          <GrillaCategorias
            categorias={categoriasVisibles}
            seleccionadaId={borrador.categoriaId}
            primerChipRef={primerChipRef}
            invalida={errorValidacion?.campo === 'categoria'}
            onElegir={(categoriaId) => {
              setErrorValidacion(null)
              setBorrador((p) => ({
                ...p,
                categoriaId: p.categoriaId === categoriaId ? null : categoriaId,
              }))
            }}
          />
        )}
        {comentariosRapidosCategoria.length > 0 ? (
          <div className="hogar-carrusel mt-1.5" role="group" aria-label="Comentarios rápidos">
            {comentariosRapidosCategoria.map((c) => {
              const activo = borrador.descripcion.trim().toLowerCase() === c.texto.toLowerCase()
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={activo}
                  className={`inline-flex min-h-9 shrink-0 snap-start cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                    activo
                      ? 'border-hogar-primario bg-hogar-primario text-white'
                      : 'border-hogar-borde bg-hogar-superficie text-hogar-tinta-suave hover:border-hogar-primario hover:text-hogar-tinta'
                  }`}
                  onClick={() =>
                    setBorrador((p) => ({
                      ...p,
                      descripcion: activo ? '' : c.texto,
                    }))
                  }
                >
                  {activo ? `✓ ${c.texto}` : c.texto}
                </button>
              )
            })}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="comercios-heading" className="flex flex-col gap-1">
        <h2 id="comercios-heading" className="m-0 text-[0.875rem] font-extrabold text-hogar-tinta">
          Comercio
        </h2>
        <CarruselComercios
          comercios={catalogo?.comercios}
          seleccionadoNombre={comercioSeleccionado}
          onElegir={elegirComercio}
        />
      </section>

      <section aria-labelledby="teclado-heading">
        <h2 id="teclado-heading" className="sr-only">
          Teclado numérico en pesos colombianos
        </h2>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Teclado numérico COP">
          {TECLAS.map((t) => {
            const estilo =
              t === '000'
                ? 'border-hogar-primario/20 bg-hogar-primario-suave text-hogar-primario text-[1.0625rem] shadow-[0_2px_0_rgba(15,92,72,0.14)]'
                : t === 'borrar'
                  ? 'border-hogar-borde bg-hogar-superficie-suave text-hogar-tinta text-base shadow-[0_2px_0_rgba(16,24,20,0.06)]'
                  : 'border-hogar-borde bg-hogar-superficie text-hogar-tinta text-[1.1875rem] shadow-[0_2px_0_rgba(16,24,20,0.06),0_1px_2px_rgba(16,24,20,0.04)]'
            return (
              <button
                key={t}
                type="button"
                className={`hogar-cop inline-flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border font-extrabold transition-all duration-100 active:translate-y-[1px] active:scale-[0.96] active:shadow-none ${estilo}`}
                aria-label={
                  t === '000'
                    ? 'Agregar tres ceros (miles)'
                    : t === 'borrar'
                      ? 'Borrar último dígito'
                      : undefined
                }
                onClick={() => {
                  pulsarMonto()
                  setErrorValidacion(null)
                  setBorrador((p) => ({ ...p, monto: aplicarTeclaCop(p.monto, t) }))
                }}
              >
                {t === 'borrar' ? '⌫' : t}
              </button>
            )
          })}
        </div>
      </section>
    </ShellApp>
  )
}
