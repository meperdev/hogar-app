import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ErrorBorrador } from '../../app/compraRapida'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { IconoQr } from '../Iconos'
import { ShellApp } from '../ShellApp'
import { identidadMedio, type ComercioRapido } from '../marcas'
import { useCompraRapida, type DatosRecompra } from './ContextoCompraRapida'
import {
  CarruselComercios,
  CarruselMedios,
  ChipsCuotas,
  GrillaCategorias,
  SelectorAmbito,
} from './PiezasCompra'
import { aplicarTeclaCop, formatearFechaCortaEs, parsearDigitosCop } from './formatoCop'

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'borrar'] as const

export function PantallaCompraRapida() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    hogar,
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
    deshacerUltimoGuardado,
    anunciarEstado,
  } = useCompraRapida()

  const [verTodas, setVerTodas] = useState(false)
  const [errorValidacion, setErrorValidacion] = useState<ErrorBorrador | null>(null)
  const [avisoCuotas, setAvisoCuotas] = useState('')
  const montoRef = useRef<HTMLInputElement>(null)
  const montoBoxRef = useRef<HTMLDivElement>(null)
  const primerChipRef = useRef<HTMLButtonElement>(null)
  const primerMedioRef = useRef<HTMLButtonElement>(null)
  const notaDetailsRef = useRef<HTMLDetailsElement>(null)
  const notaRef = useRef<HTMLInputElement>(null)
  const fechaRef = useRef<HTMLInputElement>(null)
  const recompraRef = useRef(false)

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

  function elegirComercio(comercio: ComercioRapido) {
    setErrorValidacion(null)
    const yaActivo = borrador.descripcion.trim().toLowerCase() === comercio.nombre.toLowerCase()
    const nuevaDescripcion = yaActivo ? '' : comercio.nombre
    let siguienteCategoriaId = borrador.categoriaId
    if (!yaActivo && !borrador.categoriaId) {
      const cat = categorias.find((c) =>
        c.nombre
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(comercio.categoriaSugerida),
      )
      if (cat) siguienteCategoriaId = cat.id
    }
    setBorrador((p) => ({
      ...p,
      descripcion: nuevaDescripcion,
      categoriaId: siguienteCategoriaId,
    }))
  }

  async function intentarGuardar(ignorarDuplicado = false) {
    if (guardando) return
    const res = await guardarBorrador(undefined, { ignorarDuplicadoInmediato: ignorarDuplicado })
    if (res.estado === 'error') {
      setErrorValidacion(res.error)
      if (res.error.campo === 'monto') montoRef.current?.focus()
      else if (res.error.campo === 'categoria') primerChipRef.current?.focus()
      else if (res.error.campo === 'medio') primerMedioRef.current?.focus()
      else if (res.error.campo === 'descripcion') {
        if (notaDetailsRef.current) notaDetailsRef.current.open = true
        notaRef.current?.focus()
      } else if (res.error.campo === 'fecha') {
        if (notaDetailsRef.current) notaDetailsRef.current.open = true
        fechaRef.current?.focus()
      }
      return
    }
    if (res.estado === 'fallo') return setErrorValidacion({ campo: 'monto', mensaje: res.mensaje })
    setErrorValidacion(null)
    setAvisoCuotas('')
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
        <button
          type="button"
          className={`${claseBotonPrimario} w-full ${borrador.monto <= 0 ? 'opacity-65' : ''}`}
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
      }
    >
      {toastGuardado ? (
        <div
          className="hogar-toast flex items-center justify-between gap-2 rounded-2xl bg-hogar-tinta px-3.5 py-2 text-sm text-white shadow-[var(--hogar-shadow-elevated)]"
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1 break-words">✓ {toastGuardado.resumen}</span>
          <div className="flex shrink-0 items-center gap-1">
            {toastGuardado.conCuotas ? (
              <Link
                to="/obligaciones"
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 font-bold text-[#9be8d0] underline"
              >
                Ver cuotas
              </Link>
            ) : null}
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent px-2.5 py-1.5 font-bold text-[#9be8d0] underline"
              onClick={() => void deshacerUltimoGuardado()}
            >
              Deshacer
            </button>
          </div>
        </div>
      ) : avisoEstado ? (
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
        {borrador.ambito === 'personal' ? (
          <p className="m-0 mt-1 text-xs font-semibold text-hogar-indigo">
            Solo visible para {hogar.miembroActual.nombre} · Excluida del balance del hogar
          </p>
        ) : null}
      </section>

      <section aria-labelledby="monto-heading">
        <h2 id="monto-heading" className="sr-only">
          Monto en pesos colombianos
        </h2>
        <div className="rounded-[22px] border border-hogar-borde bg-hogar-superficie px-4 py-2.5 text-right shadow-[var(--hogar-shadow-card)]">
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
            <Insignia variante="neutral">{badgeMonto}</Insignia>
          </div>
          <div ref={montoBoxRef}>
            <input
              ref={montoRef}
              id="monto-input"
              className="hogar-cop min-h-[46px] min-w-11 w-full border-0 bg-transparent py-0.5 text-right text-[2.125rem] font-extrabold leading-[1.1] tracking-tight text-hogar-tinta focus:outline-none"
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
              setBorrador((p) => ({ ...p, categoriaId }))
            }}
          />
        )}
      </section>

      <section aria-labelledby="comercios-heading" className="flex flex-col gap-1">
        <h2 id="comercios-heading" className="m-0 text-[0.875rem] font-extrabold text-hogar-tinta">
          Comercio
        </h2>
        <CarruselComercios descripcionActual={borrador.descripcion} onElegir={elegirComercio} />
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
                className={`hogar-cop inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-2xl border font-extrabold transition-all duration-100 active:translate-y-[1px] active:scale-[0.96] active:shadow-none ${estilo}`}
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

      <details
        ref={notaDetailsRef}
        className="hogar-details overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie shadow-[var(--hogar-shadow-card)]"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 text-sm font-semibold text-hogar-tinta">
          <span>
            Nota o fecha
            {borrador.descripcion.trim() ? `: ${borrador.descripcion.trim()}` : ''}
          </span>
          <span className="hogar-chevron inline-block" aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className="flex flex-col gap-2.5 border-t border-hogar-borde bg-hogar-fondo px-3 py-2.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nota-compra" className={claseEtiquetaCampo}>
              Nota
            </label>
            <input
              ref={notaRef}
              id="nota-compra"
              className={claseCampoTexto}
              type="text"
              placeholder="Ej. Almacenes Éxito"
              value={borrador.descripcion}
              onChange={(e) => setBorrador((p) => ({ ...p, descripcion: e.target.value }))}
            />
          </div>
          <div className="min-w-0 max-w-full overflow-hidden flex flex-col gap-1.5">
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
      </details>
    </ShellApp>
  )
}
