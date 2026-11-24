import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CHIPS_CUOTAS, type Ambito, type ErrorBorrador } from '../../app/compraRapida'
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
import {
  aplicarTeclaCop,
  fechaHoyBogota,
  formatearCop,
  formatearFechaCortaEs,
  nombreMesEs,
  parsearDigitosCop,
} from './formatoCop'

const TECLAS_COP = [
  { valor: '1', etiqueta: '1', tipo: 'digito' },
  { valor: '2', etiqueta: '2', tipo: 'digito' },
  { valor: '3', etiqueta: '3', tipo: 'digito' },
  { valor: '4', etiqueta: '4', tipo: 'digito' },
  { valor: '5', etiqueta: '5', tipo: 'digito' },
  { valor: '6', etiqueta: '6', tipo: 'digito' },
  { valor: '7', etiqueta: '7', tipo: 'digito' },
  { valor: '8', etiqueta: '8', tipo: 'digito' },
  { valor: '9', etiqueta: '9', tipo: 'digito' },
  {
    valor: '000',
    etiqueta: '000',
    tipo: 'acento',
    ariaLabel: 'Agregar tres ceros (miles)',
  },
  { valor: '0', etiqueta: '0', tipo: 'digito' },
  {
    valor: 'borrar',
    etiqueta: '⌫',
    tipo: 'util',
    ariaLabel: 'Borrar último dígito',
  },
] as const

export function SelectorAmbito({
  ambito,
  onCambiar,
  ariaLabel = 'Ámbito de la compra: Hogar o Personal',
}: {
  ambito: Ambito
  onCambiar: (siguiente: Ambito) => void
  ariaLabel?: string | undefined
}) {
  const claseBase =
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border-[1.5px] px-2.5 py-1.5 text-sm font-bold cursor-pointer transition-colors'
  const claseActivo = 'border-hogar-primario bg-hogar-primario text-white'
  const claseInactivo = 'border-transparent bg-transparent text-hogar-tinta hover:bg-hogar-superficie'

  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie-suave p-[3px]"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={`${claseBase} ${ambito === 'hogar' ? claseActivo : claseInactivo}`}
        aria-pressed={ambito === 'hogar'}
        onClick={() => onCambiar('hogar')}
      >
        {ambito === 'hogar' ? '✓ Hogar' : 'Hogar'}
      </button>
      <button
        type="button"
        className={`${claseBase} ${ambito === 'personal' ? claseActivo : claseInactivo}`}
        aria-pressed={ambito === 'personal'}
        onClick={() => onCambiar('personal')}
      >
        {ambito === 'personal' ? '✓ Personal (solo yo)' : 'Personal (solo yo)'}
      </button>
    </div>
  )
}

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
    seleccionarCategoria,
    seleccionarCuotas,
    aplicarRecompra,
    guardarBorrador,
    descartarConfirmacionDuplicado,
    deshacerUltimoGuardado,
    anunciarEstado,
  } = useCompraRapida()

  const [verTodasCategorias, setVerTodasCategorias] = useState(false)
  const [errorValidacion, setErrorValidacion] = useState<ErrorBorrador | null>(null)
  const [avisoCuotasOcultas, setAvisoCuotasOcultas] = useState('')

  const montoInputRef = useRef<HTMLInputElement>(null)
  const primerChipCategoriaRef = useRef<HTMLButtonElement>(null)
  const recompraAplicadaRef = useRef(false)

  // Soporte de entrada desde Despensa de mascotas ("Recomprar")
  useEffect(() => {
    const estado = location.state as { recompra?: DatosRecompra } | null
    if (estado?.recompra && !recompraAplicadaRef.current) {
      recompraAplicadaRef.current = true
      aplicarRecompra(estado.recompra)
    }
  }, [aplicarRecompra, location.state])

  const categoriasOrdenadas = useMemo(
    () => (catalogo ? [...catalogo.categorias].sort((a, b) => a.orden - b.orden) : []),
    [catalogo],
  )

  const categoriasVisibles = useMemo(() => {
    if (verTodasCategorias || categoriasOrdenadas.length <= 6) {
      return categoriasOrdenadas
    }
    const frecuentes = categoriasOrdenadas.slice(0, 6)
    if (
      borrador.categoriaId &&
      !frecuentes.some((c) => c.id === borrador.categoriaId)
    ) {
      const elegida = categoriasOrdenadas.find((c) => c.id === borrador.categoriaId)
      if (elegida) return [...frecuentes.slice(0, 5), elegida]
    }
    return frecuentes
  }, [borrador.categoriaId, categoriasOrdenadas, verTodasCategorias])

  const mediosSinPrestamo = useMemo(
    () => mediosDisponibles.filter((m) => m.tipo !== 'prestamo'),
    [mediosDisponibles],
  )

  const prestamosCompatibles = useMemo(
    () => mediosDisponibles.filter((m) => m.tipo === 'prestamo'),
    [mediosDisponibles],
  )

  const hoy = fechaHoyBogota()
  const subtituloFecha =
    borrador.fecha === hoy
      ? `Hoy, ${formatearFechaCortaEs(borrador.fecha)}`
      : formatearFechaCortaEs(borrador.fecha, true)

  const etiquetaBadgeMonto =
    medioSeleccionado?.tipo === 'tarjeta'
      ? borrador.cuotas === 1
        ? '1 cuota'
        : `${borrador.cuotas} cuotas`
      : medioSeleccionado?.tipo === 'prestamo'
        ? 'Préstamo'
        : 'Contado'

  function manejarTecla(valor: string) {
    setErrorValidacion(null)
    setBorrador((prev) => ({
      ...prev,
      monto: aplicarTeclaCop(prev.monto, valor),
    }))
  }

  function manejarCambioMedio(medioId: string) {
    const anterior = medioSeleccionado
    const siguiente = mediosDisponibles.find((m) => m.id === medioId)
    setErrorValidacion(null)
    seleccionarMedio(medioId)
    if (anterior?.tipo === 'tarjeta' && siguiente?.tipo !== 'tarjeta') {
      const nota = 'Cuotas disponibles solo con tarjeta de crédito.'
      setAvisoCuotasOcultas(nota)
      anunciarEstado(nota)
    } else {
      setAvisoCuotasOcultas('')
    }
  }

  function manejarElegirCuotas(n: number, abrirOtro = false) {
    seleccionarCuotas(n)
    if (n > 1 || abrirOtro) {
      navigate('/compra/cuotas', { state: abrirOtro ? { abrirOtro: true } : undefined })
    }
  }

  async function intentarGuardar(ignorarDuplicado = false) {
    if (guardando) return
    const resultado = await guardarBorrador(undefined, {
      ignorarDuplicadoInmediato: ignorarDuplicado,
    })
    if (resultado.estado === 'error') {
      setErrorValidacion(resultado.error)
      if (resultado.error.campo === 'monto') {
        montoInputRef.current?.focus()
      } else if (resultado.error.campo === 'categoria') {
        primerChipCategoriaRef.current?.focus()
      }
      return
    }
    if (resultado.estado === 'fallo') {
      setErrorValidacion({ campo: 'monto', mensaje: resultado.mensaje })
      return
    }
    setErrorValidacion(null)
    setAvisoCuotasOcultas('')
  }

  const textoBotonGuardar = guardando
    ? 'Guardando…'
    : borrador.monto > 0
      ? `Guardar ${formatearCop(borrador.monto)}`
      : 'Guardar compra'

  return (
    <ShellApp
      titulo="Compra rápida"
      subtitulo={
        <>
          <strong className="text-hogar-tinta">{hogar.miembroActual.nombre}</strong> ·{' '}
          {subtituloFecha}
        </>
      }
      accionDerecha={
        <Link
          to="/compra/escanear"
          className={`${claseBotonPequenoSecundario} no-underline`}
          aria-label="Escanear factura electrónica con QR DIAN"
        >
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
          className={`${claseBotonPrimario} w-full ${
            borrador.monto <= 0 ? 'opacity-65' : ''
          }`}
          aria-disabled={borrador.monto <= 0 || guardando ? 'true' : undefined}
          data-sin-scroll
          onClick={() => void intentarGuardar(false)}
        >
          {textoBotonGuardar}
        </button>
      }
    >
      {/* Región aria-live para feedback no bloqueante */}
      {toastGuardado ? (
        <div
          className="flex items-center justify-between gap-2 rounded-xl bg-hogar-tinta px-3 py-2 text-sm text-white"
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
          Guardado en el dispositivo ({sync.pendientes}{' '}
          {sync.pendientes === 1 ? 'pendiente' : 'pendientes'} de sincronizar)
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
            Ya registraste {formatearCop(borrador.monto)} con esta categoría y medio hace
            menos de un minuto.
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

      {/* Ámbito: Hogar | Personal */}
      <section aria-labelledby="ambito-heading">
        <h2 id="ambito-heading" className="sr-only">
          Ámbito de la compra
        </h2>
        <SelectorAmbito
          ambito={borrador.ambito}
          onCambiar={(siguiente) => {
            setErrorValidacion(null)
            cambiarAmbito(siguiente)
          }}
        />
        {borrador.ambito === 'personal' ? (
          <p className="m-0 mt-1 text-xs font-semibold text-hogar-indigo">
            Solo visible para {hogar.miembroActual.nombre} · Excluida del balance del hogar
          </p>
        ) : null}
      </section>

      {/* Paso 1: Monto entero COP */}
      <section aria-labelledby="monto-heading">
        <h2 id="monto-heading" className="sr-only">
          Paso 1: Monto en pesos colombianos
        </h2>
        <div className="rounded-2xl border-2 border-hogar-borde-fuerte bg-hogar-superficie px-3 py-1.5 text-right">
          <div className="mb-0.5 flex items-center justify-between gap-2 text-[0.8125rem] text-hogar-tinta-suave">
            <label htmlFor="monto-input" className="font-bold text-hogar-tinta-suave">
              Monto en COP (sin centavos)
            </label>
            <Insignia variante="neutral">{etiquetaBadgeMonto}</Insignia>
          </div>
          <input
            ref={montoInputRef}
            id="monto-input"
            className="hogar-cop min-h-[46px] min-w-11 w-full border-0 bg-transparent py-0.5 text-right text-[2rem] font-extrabold leading-[1.15] tracking-tight text-hogar-tinta"
            type="text"
            inputMode="numeric"
            value={formatearCop(borrador.monto)}
            aria-describedby="monto-ayuda"
            aria-invalid={errorValidacion?.campo === 'monto' ? 'true' : undefined}
            onChange={(e) => {
              setErrorValidacion(null)
              setBorrador((prev) => ({
                ...prev,
                monto: parsearDigitosCop(e.target.value),
              }))
            }}
          />
          <p id="monto-ayuda" className={`${claseAyudaCampo} text-right`}>
            Consumo único en {nombreMesEs(borrador.fecha) || 'el mes'} ·{' '}
            {borrador.ambito === 'hogar' ? 'Hogar' : 'Personal'}
          </p>
        </div>
      </section>

      {/* Paso 2: Categorías frecuentes */}
      <section aria-labelledby="categoria-heading">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="categoria-heading"
            className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta"
          >
            Categoría (más usadas)
          </h2>
          {categoriasOrdenadas.length > 6 ? (
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent px-2 text-[0.8125rem] font-bold text-hogar-primario underline"
              onClick={() => setVerTodasCategorias((v) => !v)}
            >
              {verTodasCategorias ? 'Ver menos' : 'Ver todas'}
            </button>
          ) : (
            <span className="text-[0.8125rem] text-hogar-tinta-suave">1 toque</span>
          )}
        </div>

        {cargando && categoriasVisibles.length === 0 ? (
          <p className={claseAyudaCampo}>Cargando categorías…</p>
        ) : (
          <div
            className={`grid grid-cols-3 gap-1.5 ${
              errorValidacion?.campo === 'categoria'
                ? 'rounded-xl p-1 ring-2 ring-hogar-peligro'
                : ''
            }`}
            role="group"
            aria-label="Categorías frecuentes"
          >
            {categoriasVisibles.map((cat, idx) => {
              const activa = borrador.categoriaId === cat.id
              return (
                <button
                  key={cat.id}
                  ref={idx === 0 ? primerChipCategoriaRef : undefined}
                  type="button"
                  className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-xl border-[1.5px] px-2 py-2 text-center text-sm font-semibold leading-tight break-words transition-colors ${
                    activa
                      ? 'border-hogar-primario bg-hogar-primario text-white'
                      : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                  }`}
                  aria-pressed={activa}
                  onClick={() => {
                    setErrorValidacion(null)
                    seleccionarCategoria(cat.id)
                  }}
                >
                  {activa ? `✓ ${cat.nombre}` : cat.nombre}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Medio de pago recordado + préstamo + cuotas */}
      <section aria-labelledby="medio-heading" className="flex flex-col gap-1.5">
        <h2 id="medio-heading" className="sr-only">
          Medio de pago, préstamo y cuotas
        </h2>

        <details className="overflow-hidden rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-hogar-tinta">
            <span className="min-w-0 truncate">
              Medio: <strong>{medioSeleccionado?.nombre ?? 'Sin seleccionar'}</strong>
            </span>
            <Insignia variante="neutral">
              {medioSeleccionado?.tipo === 'prestamo' ? 'Préstamo ▾' : 'Local ▾'}
            </Insignia>
          </summary>

          <div className="flex flex-col gap-2.5 border-t border-hogar-borde bg-hogar-fondo px-3 py-2.5">
            <p className={claseAyudaCampo}>
              Último medio recordado en este dispositivo (preferencia local por miembro, no se
              sincroniza).
            </p>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Elegir medio de pago">
              {mediosSinPrestamo.map((m) => {
                const activo = m.id === borrador.medioId
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-2.5 py-2 text-sm font-semibold ${
                      activo
                        ? 'border-hogar-primario bg-hogar-primario text-white'
                        : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                    }`}
                    aria-pressed={activo}
                    onClick={() => manejarCambioMedio(m.id)}
                  >
                    {activo ? `✓ ${m.nombre}` : m.nombre}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="prestamo-origen" className={claseEtiquetaCampo}>
                O compra financiada con préstamo en efectivo
              </label>
              <select
                id="prestamo-origen"
                className={claseCampoTexto}
                value={
                  medioSeleccionado?.tipo === 'prestamo' ? medioSeleccionado.id : ''
                }
                aria-describedby="ayuda-prestamo"
                onChange={(e) => {
                  const id = e.target.value
                  if (id) {
                    manejarCambioMedio(id)
                  } else if (mediosSinPrestamo[0]) {
                    manejarCambioMedio(mediosSinPrestamo[0].id)
                  }
                }}
              >
                <option value="">No — pago con el medio elegido</option>
                {prestamosCompatibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    Financiada con préstamo: {p.nombre} (disp. {formatearCop(p.disponible)})
                  </option>
                ))}
              </select>
              <p id="ayuda-prestamo" className={claseAyudaCampo}>
                Vincula la compra al plan de desembolso del préstamo sin crear otro plan de
                cuotas. No suma aporte hoy; aporta al pagar cargos del hogar.
              </p>
            </div>
          </div>
        </details>

        {medioSeleccionado?.tipo === 'prestamo' ? (
          <Aviso variante="indigo" icono="ℹ">
            <p>
              Consumo con desembolso ({formatearCop(medioSeleccionado.disponible)} disponible).
              No crea otro plan de cuotas ni suma aporte hoy.
            </p>
          </Aviso>
        ) : null}

        {medioSeleccionado?.tipo === 'tarjeta' ? (
          <div
            className="grid grid-cols-5 gap-1.5"
            role="group"
            aria-label={`Número de cuotas en ${medioSeleccionado.nombre}`}
          >
            {CHIPS_CUOTAS.map((n) => {
              const activo = borrador.cuotas === n
              return (
                <button
                  key={n}
                  type="button"
                  className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-1 py-2 text-[0.8125rem] font-semibold ${
                    activo
                      ? 'border-hogar-primario bg-hogar-primario text-white'
                      : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                  }`}
                  aria-pressed={activo}
                  aria-label={n === 1 ? '1 cuota' : `${n} cuotas`}
                  onClick={() => manejarElegirCuotas(n)}
                >
                  {activo ? `✓ ${n}` : n}
                </button>
              )
            })}
            <button
              type="button"
              className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-1 py-2 text-[0.8125rem] font-semibold ${
                borrador.cuotas > 1 && !(CHIPS_CUOTAS as readonly number[]).includes(borrador.cuotas)
                  ? 'border-hogar-indigo bg-hogar-indigo text-white'
                  : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
              }`}
              aria-label="Otro número de cuotas"
              onClick={() => manejarElegirCuotas(Math.max(2, borrador.cuotas), true)}
            >
              Otro
            </button>
          </div>
        ) : avisoCuotasOcultas ? (
          <p className={claseAyudaCampo}>{avisoCuotasOcultas}</p>
        ) : null}
      </section>

      {/* Teclado numérico COP con tecla 000 */}
      <section aria-labelledby="teclado-heading">
        <h2 id="teclado-heading" className="sr-only">
          Teclado numérico en pesos colombianos
        </h2>
        <div
          className="grid grid-cols-3 gap-[5px]"
          role="group"
          aria-label="Teclado numérico COP"
        >
          {TECLAS_COP.map((tecla) => {
            const estiloTecla =
              tecla.tipo === 'acento'
                ? 'border-hogar-primario bg-hogar-primario-suave text-hogar-primario text-[1.0625rem]'
                : tecla.tipo === 'util'
                  ? 'border-hogar-borde-fuerte bg-hogar-superficie-suave text-hogar-tinta text-base'
                  : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta text-[1.1875rem]'
            return (
              <button
                key={tecla.valor}
                type="button"
                className={`hogar-cop inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] font-extrabold hover:opacity-90 ${estiloTecla}`}
                aria-label={'ariaLabel' in tecla ? tecla.ariaLabel : undefined}
                onClick={() => manejarTecla(tecla.valor)}
              >
                {tecla.etiqueta}
              </button>
            )
          })}
        </div>
      </section>

      {/* Nota, comercio y fecha opcionales colapsados */}
      <details className="overflow-hidden rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-hogar-tinta">
          <span>Nota, comercio o fecha (opcional)</span>
          <span aria-hidden="true">▾</span>
        </summary>
        <div className="flex flex-col gap-2.5 border-t border-hogar-borde bg-hogar-fondo px-3 py-2.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nota-compra" className={claseEtiquetaCampo}>
              Descripción o comercio
            </label>
            <input
              id="nota-compra"
              className={claseCampoTexto}
              type="text"
              placeholder="Ej. Almacenes Éxito"
              value={borrador.descripcion}
              onChange={(e) =>
                setBorrador((prev) => ({ ...prev, descripcion: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha-compra" className={claseEtiquetaCampo}>
              Fecha civil del consumo
            </label>
            <input
              id="fecha-compra"
              className={claseCampoTexto}
              type="date"
              value={borrador.fecha}
              onChange={(e) =>
                setBorrador((prev) => ({ ...prev, fecha: e.target.value }))
              }
            />
          </div>
        </div>
      </details>

      {borrador.ambito === 'hogar' &&
      !medioSeleccionado &&
      mediosDisponibles.length === 0 &&
      !cargando ? (
        <Tarjeta suave>
          <p className="m-0 text-sm text-hogar-tinta-suave">
            No encontramos medios de pago configurados para este ámbito.
          </p>
        </Tarjeta>
      ) : null}
    </ShellApp>
  )
}
