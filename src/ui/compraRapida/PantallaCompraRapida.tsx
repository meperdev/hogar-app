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
import { useCompraRapida, type DatosRecompra } from './ContextoCompraRapida'
import { ChipsCuotas, GrillaCategorias, SelectorAmbito } from './PiezasCompra'
import { aplicarTeclaCop, formatearFechaCortaEs, nombreMesEs, parsearDigitosCop } from './formatoCop'

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
  const primerChipRef = useRef<HTMLButtonElement>(null)
  const medioDetailsRef = useRef<HTMLDetailsElement>(null)
  const notaDetailsRef = useRef<HTMLDetailsElement>(null)
  const notaRef = useRef<HTMLInputElement>(null)
  const fechaRef = useRef<HTMLInputElement>(null)
  const recompraRef = useRef(false)

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

  const mediosSinPrestamo = useMemo(() => mediosDisponibles.filter((m) => m.tipo !== 'prestamo'), [mediosDisponibles])
  const prestamos = useMemo(() => mediosDisponibles.filter((m) => m.tipo === 'prestamo'), [mediosDisponibles])
  const hoy = hoyCivil(new Date())
  const subtituloFecha = borrador.fecha === hoy ? `Hoy, ${formatearFechaCortaEs(borrador.fecha)}` : formatearFechaCortaEs(borrador.fecha, true)
  const badgeMonto =
    medioSeleccionado?.tipo === 'tarjeta'
      ? borrador.cuotas === 1 ? '1 cuota' : `${borrador.cuotas} cuotas`
      : medioSeleccionado?.tipo === 'prestamo' ? 'Préstamo' : 'Contado'

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

  async function intentarGuardar(ignorarDuplicado = false) {
    if (guardando) return
    const res = await guardarBorrador(undefined, { ignorarDuplicadoInmediato: ignorarDuplicado })
    if (res.estado === 'error') {
      setErrorValidacion(res.error)
      if (res.error.campo === 'monto') montoRef.current?.focus()
      else if (res.error.campo === 'categoria') primerChipRef.current?.focus()
      else if (res.error.campo === 'medio' && medioDetailsRef.current) medioDetailsRef.current.open = true
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
      subtitulo={<><strong className="text-hogar-tinta">{hogar.miembroActual.nombre}</strong> · {subtituloFecha}</>}
      accionDerecha={
        <Link to="/compra/escanear" className={`${claseBotonPequenoSecundario} no-underline`} aria-label="Escanear factura electrónica con QR DIAN">
          <IconoQr className="size-[18px]" />
          <span>Escanear</span>
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
          {guardando ? 'Guardando…' : borrador.monto > 0 ? `Guardar ${formatearPesos(borrador.monto)}` : 'Guardar compra'}
        </button>
      }
    >
      {toastGuardado ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-hogar-tinta px-3 py-2 text-sm text-white" role="status" aria-live="polite">
          <span className="min-w-0 flex-1 break-words">✓ {toastGuardado.resumen}</span>
          <div className="flex shrink-0 items-center gap-1">
            {toastGuardado.conCuotas ? (
              <Link to="/obligaciones" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 font-bold text-[#9be8d0] underline">Ver cuotas</Link>
            ) : null}
            <button type="button" className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent px-2.5 py-1.5 font-bold text-[#9be8d0] underline" onClick={() => void deshacerUltimoGuardado()}>
              Deshacer
            </button>
          </div>
        </div>
      ) : avisoEstado ? (
        <p className="sr-only" role="status" aria-live="polite">{avisoEstado}</p>
      ) : null}

      {sync && sync.rechazados.length > 0 ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p className="font-bold">Un registro pendiente fue rechazado al sincronizar:</p>
          <p>{sync.rechazados[0]?.motivo}</p>
        </Aviso>
      ) : sync && sync.pendientes > 0 ? (
        <p className={claseAyudaCampo} role="status">
          Guardado en el dispositivo ({sync.pendientes} {sync.pendientes === 1 ? 'pendiente' : 'pendientes'} de sincronizar)
        </p>
      ) : null}

      {errorCarga ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorCarga}</p>
          <button type="button" className={`${claseBotonPequenoSecundario} mt-1`} onClick={recargarCatalogo}>Reintentar</button>
        </Aviso>
      ) : null}

      {errorValidacion ? <Aviso variante="peligro" icono="▲" role="alert"><p>{errorValidacion.mensaje}</p></Aviso> : null}

      {confirmacionDuplicado ? (
        <Aviso variante="ambar" icono="▲" role="alert">
          <p className="font-bold">Posible compra duplicada</p>
          <p>Ya registraste {formatearPesos(borrador.monto)} con esta categoría y medio hace menos de un minuto.</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" className={`${claseBotonPequenoSecundario} border-hogar-ambar text-hogar-tinta`} onClick={() => void intentarGuardar(true)}>Guardar de todas formas</button>
            <button type="button" className={claseBotonPequenoSecundario} onClick={descartarConfirmacionDuplicado}>Cancelar</button>
          </div>
        </Aviso>
      ) : null}

      <section aria-labelledby="ambito-heading">
        <h2 id="ambito-heading" className="sr-only">Ámbito de la compra</h2>
        <SelectorAmbito ambito={borrador.ambito} onCambiar={(s) => { setErrorValidacion(null); cambiarAmbito(s) }} />
        {borrador.ambito === 'personal' ? (
          <p className="m-0 mt-1 text-xs font-semibold text-hogar-indigo">
            Solo visible para {hogar.miembroActual.nombre} · Excluida del balance del hogar
          </p>
        ) : null}
      </section>

      <section aria-labelledby="monto-heading">
        <h2 id="monto-heading" className="sr-only">Paso 1: Monto en pesos colombianos</h2>
        <div className="rounded-2xl border-2 border-hogar-borde-fuerte bg-hogar-superficie px-3 py-1.5 text-right">
          <div className="mb-0.5 flex items-center justify-between gap-2 text-[0.8125rem] text-hogar-tinta-suave">
            <label htmlFor="monto-input" className="font-bold text-hogar-tinta-suave">Monto en COP (sin centavos)</label>
            <Insignia variante="neutral">{badgeMonto}</Insignia>
          </div>
          <input
            ref={montoRef}
            id="monto-input"
            className="hogar-cop min-h-[46px] min-w-11 w-full border-0 bg-transparent py-0.5 text-right text-[2rem] font-extrabold leading-[1.15] tracking-tight text-hogar-tinta"
            type="text"
            inputMode="numeric"
            value={formatearPesos(borrador.monto)}
            aria-describedby="monto-ayuda"
            aria-invalid={errorValidacion?.campo === 'monto' ? 'true' : undefined}
            onChange={(e) => { setErrorValidacion(null); setBorrador((p) => ({ ...p, monto: parsearDigitosCop(e.target.value) })) }}
          />
          <p id="monto-ayuda" className={`${claseAyudaCampo} text-right`}>
            Consumo único en {nombreMesEs(borrador.fecha) || 'el mes'} · {borrador.ambito === 'hogar' ? 'Hogar' : 'Personal'}
          </p>
        </div>
      </section>

      <section aria-labelledby="categoria-heading">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 id="categoria-heading" className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Categoría (más usadas)</h2>
          {categorias.length > 6 ? (
            <button type="button" className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent px-2 text-[0.8125rem] font-bold text-hogar-primario underline" onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? 'Ver menos' : 'Ver todas'}
            </button>
          ) : (
            <span className="text-[0.8125rem] text-hogar-tinta-suave">1 toque</span>
          )}
        </div>
        {cargando && categoriasVisibles.length === 0 ? (
          <p className={claseAyudaCampo}>Cargando categorías…</p>
        ) : (
          <GrillaCategorias
            categorias={categoriasVisibles}
            seleccionadaId={borrador.categoriaId}
            primerChipRef={primerChipRef}
            invalida={errorValidacion?.campo === 'categoria'}
            onElegir={(categoriaId) => { setErrorValidacion(null); setBorrador((p) => ({ ...p, categoriaId })) }}
          />
        )}
      </section>

      <section aria-labelledby="medio-heading" className="flex flex-col gap-1.5">
        <h2 id="medio-heading" className="sr-only">Medio de pago, préstamo y cuotas</h2>
        <details ref={medioDetailsRef} className="overflow-hidden rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-hogar-tinta">
            <span className="min-w-0 truncate">Medio: <strong>{medioSeleccionado?.nombre ?? 'Sin seleccionar'}</strong></span>
            <Insignia variante="neutral">{medioSeleccionado?.tipo === 'prestamo' ? 'Préstamo ▾' : 'Local ▾'}</Insignia>
          </summary>
          <div className="flex flex-col gap-2.5 border-t border-hogar-borde bg-hogar-fondo px-3 py-2.5">
            <p className={claseAyudaCampo}>Último medio recordado en este dispositivo (preferencia local por miembro, no se sincroniza).</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Elegir medio de pago">
              {mediosSinPrestamo.map((m) => {
                const activo = m.id === borrador.medioId
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-2.5 py-2 text-sm font-semibold ${
                      activo ? 'border-hogar-primario bg-hogar-primario text-white' : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                    }`}
                    aria-pressed={activo}
                    onClick={() => cambiarMedio(m.id)}
                  >
                    {activo ? `✓ ${m.nombre}` : m.nombre}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="prestamo-origen" className={claseEtiquetaCampo}>O compra financiada con préstamo en efectivo</label>
              <select
                id="prestamo-origen"
                className={claseCampoTexto}
                value={medioSeleccionado?.tipo === 'prestamo' ? medioSeleccionado.id : ''}
                aria-describedby="ayuda-prestamo"
                onChange={(e) => {
                  const id = e.target.value
                  if (id) cambiarMedio(id)
                  else if (mediosSinPrestamo[0]) cambiarMedio(mediosSinPrestamo[0].id)
                }}
              >
                <option value="">No — pago con el medio elegido</option>
                {prestamos.map((p) => (
                  <option key={p.id} value={p.id}>Financiada con préstamo: {p.nombre} (disp. {formatearPesos(p.disponible)})</option>
                ))}
              </select>
              <p id="ayuda-prestamo" className={claseAyudaCampo}>Vincula la compra al desembolso del préstamo sin crear otro plan. No suma aporte hoy.</p>
            </div>
            <Link to="/hogar#medios-de-pago" className={`${claseBotonPequenoSecundario} w-full no-underline`}>
              Gestionar o agregar medio de pago
            </Link>
          </div>
        </details>

        {medioSeleccionado?.tipo === 'prestamo' ? (
          <Aviso variante="indigo" icono="ℹ">
            <p>Consumo con desembolso ({formatearPesos(medioSeleccionado.disponible)} disponible). No crea otro plan de cuotas ni suma aporte hoy.</p>
          </Aviso>
        ) : null}

        {medioSeleccionado?.tipo === 'tarjeta' ? (
          <ChipsCuotas
            cuotas={borrador.cuotas}
            ariaLabel={`Número de cuotas en ${medioSeleccionado.nombre}`}
            onElegir={(n, esOtro) => {
              setBorrador((p) => ({ ...p, cuotas: n }))
              if (n > 1 || esOtro) navigate('/compra/cuotas', { state: esOtro ? { abrirOtro: true } : undefined })
            }}
          />
        ) : avisoCuotas ? (
          <p className={claseAyudaCampo}>{avisoCuotas}</p>
        ) : null}
      </section>

      <section aria-labelledby="teclado-heading">
        <h2 id="teclado-heading" className="sr-only">Teclado numérico en pesos colombianos</h2>
        <div className="grid grid-cols-3 gap-[5px]" role="group" aria-label="Teclado numérico COP">
          {TECLAS.map((t) => {
            const estilo =
              t === '000'
                ? 'border-hogar-primario bg-hogar-primario-suave text-hogar-primario text-[1.0625rem]'
                : t === 'borrar'
                  ? 'border-hogar-borde-fuerte bg-hogar-superficie-suave text-hogar-tinta text-base'
                  : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta text-[1.1875rem]'
            return (
              <button
                key={t}
                type="button"
                className={`hogar-cop inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] font-extrabold hover:opacity-90 ${estilo}`}
                aria-label={t === '000' ? 'Agregar tres ceros (miles)' : t === 'borrar' ? 'Borrar último dígito' : undefined}
                onClick={() => { setErrorValidacion(null); setBorrador((p) => ({ ...p, monto: aplicarTeclaCop(p.monto, t) })) }}
              >
                {t === 'borrar' ? '⌫' : t}
              </button>
            )
          })}
        </div>
      </section>

      <details ref={notaDetailsRef} className="overflow-hidden rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-hogar-tinta">
          <span>Nota, comercio o fecha (opcional)</span>
          <span aria-hidden="true">▾</span>
        </summary>
        <div className="flex flex-col gap-2.5 border-t border-hogar-borde bg-hogar-fondo px-3 py-2.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nota-compra" className={claseEtiquetaCampo}>Descripción o comercio</label>
            <input ref={notaRef} id="nota-compra" className={claseCampoTexto} type="text" placeholder="Ej. Almacenes Éxito" value={borrador.descripcion} onChange={(e) => setBorrador((p) => ({ ...p, descripcion: e.target.value }))} />
          </div>
          <div className="min-w-0 max-w-full overflow-hidden flex flex-col gap-1.5">
            <label htmlFor="fecha-compra" className={claseEtiquetaCampo}>Fecha civil del consumo</label>
            <input ref={fechaRef} id="fecha-compra" className={claseCampoTexto} type="date" value={borrador.fecha} onChange={(e) => setBorrador((p) => ({ ...p, fecha: e.target.value }))} />
          </div>
        </div>
      </details>

      {!medioSeleccionado && mediosDisponibles.length === 0 && !cargando ? (
        <Tarjeta suave className="flex flex-col gap-2">
          <p className="m-0 text-sm text-hogar-tinta-suave">No encontramos medios de pago configurados para este ámbito.</p>
          <Link to="/hogar#medios-de-pago" className={`${claseBotonPequenoSecundario} w-full no-underline`}>
            Crear medio de pago
          </Link>
        </Tarjeta>
      ) : null}
    </ShellApp>
  )
}
