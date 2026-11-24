import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CHIPS_CUOTAS, type ErrorBorrador } from '../../app/compraRapida'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { useCompraRapida } from './ContextoCompraRapida'
import { SelectorAmbito } from './PantallaCompraRapida'
import {
  formatearCop,
  formatearFechaCortaEs,
  formatearPorcentajeEs,
  nombreMesEs,
  parsearDigitosCop,
} from './formatoCop'

export function PantallaCompraCuotas() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    hogar,
    controlador,
    catalogo,
    guardando,
    borrador,
    mediosDisponibles,
    medioSeleccionado,
    setBorrador,
    cambiarAmbito,
    seleccionarMedio,
    seleccionarCategoria,
    seleccionarCuotas,
    guardarBorrador,
  } = useCompraRapida()

  const estadoNavegacion = location.state as { abrirOtro?: boolean } | null
  const [otroAbierto, setOtroAbierto] = useState(
    Boolean(estadoNavegacion?.abrirOtro) ||
      !(CHIPS_CUOTAS as readonly number[]).includes(borrador.cuotas),
  )
  const [errorValidacion, setErrorValidacion] = useState<ErrorBorrador | null>(null)

  // Asegurar que la pantalla de cuotas tenga al menos 2 cuotas seleccionadas
  useEffect(() => {
    if (borrador.cuotas < 2) {
      seleccionarCuotas(3)
    }
  }, [borrador.cuotas, seleccionarCuotas])

  // Si el medio actual no es tarjeta, intentar elegir la primera tarjeta compatible del ámbito
  const tarjetaCompatible =
    medioSeleccionado?.tipo === 'tarjeta'
      ? medioSeleccionado
      : mediosDisponibles.find((m) => m.tipo === 'tarjeta') ?? null

  useEffect(() => {
    if (medioSeleccionado?.tipo !== 'tarjeta' && tarjetaCompatible) {
      seleccionarMedio(tarjetaCompatible.id)
    }
  }, [medioSeleccionado?.tipo, seleccionarMedio, tarjetaCompatible])

  const categoriasOrdenadas = catalogo
    ? [...catalogo.categorias].sort((a, b) => a.orden - b.orden)
    : []

  const categoriaSeleccionada = categoriasOrdenadas.find(
    (c) => c.id === borrador.categoriaId,
  )
  const nombreCategoria = categoriaSeleccionada?.nombre ?? 'Sin categoría'

  const cuotasEfectivas = Math.max(2, borrador.cuotas)
  const borradorCalculo = {
    ...borrador,
    medioId: tarjetaCompatible?.id ?? borrador.medioId,
    cuotas: cuotasEfectivas,
  }
  const desglose =
    catalogo && tarjetaCompatible ? controlador.desglose(borradorCalculo, catalogo) : null

  const primeraCuotaCapital = desglose?.cuotas[0]?.capital ?? 0
  const primeraCuotaInteres = desglose?.cuotas[0]?.interes ?? null
  const todasIguales =
    desglose !== null &&
    desglose.cuotas.length > 0 &&
    desglose.cuotas.every((c) => c.capital === primeraCuotaCapital)

  const resumenCapitalCuotas =
    desglose && desglose.cuotas.length > 0
      ? todasIguales
        ? `${desglose.cuotas.length} × ${formatearCop(primeraCuotaCapital)}`
        : `${desglose.cuotas.length} cuotas (total ${formatearCop(desglose.consumoHoy)})`
      : `${cuotasEfectivas} cuotas`

  async function manejarGuardar() {
    if (guardando) return
    const res = await guardarBorrador(borradorCalculo)
    if (res.estado === 'error') {
      setErrorValidacion(res.error)
      return
    }
    if (res.estado === 'fallo') {
      setErrorValidacion({ campo: 'monto', mensaje: res.mensaje })
      return
    }
    setErrorValidacion(null)
    navigate('/compra')
  }

  const tieneTasa = Boolean(tarjetaCompatible?.tasa)
  const textoTasa = tarjetaCompatible?.tasa
    ? desglose?.tasaMensualPct !== null && desglose
      ? `${formatearPorcentajeEs(tarjetaCompatible.tasa.ppm / 10_000, 2)} ${tarjetaCompatible.tasa.tipo === 'EA' ? 'E.A.' : 'M.V.'} → ${formatearPorcentajeEs(desglose.tasaMensualPct, 4)} M.V.`
      : `${formatearPorcentajeEs(tarjetaCompatible.tasa.ppm / 10_000, 2)} ${tarjetaCompatible.tasa.tipo === 'EA' ? 'E.A.' : 'M.V.'}`
    : 'Sin tasa configurada'

  const mesTexto = nombreMesEs(borrador.fecha) || 'este mes'
  const ejemploSinDobleConteo =
    desglose && desglose.cuotas[0]
      ? formatearCop(desglose.consumoHoy + desglose.cuotas[0].capital)
      : formatearCop(borrador.monto)

  return (
    <ShellApp
      titulo="Compra a cuotas"
      subtitulo={
        <>
          <strong className="text-hogar-tinta">{hogar.miembroActual.nombre}</strong> ·{' '}
          {formatearFechaCortaEs(borrador.fecha)} ·{' '}
          {borrador.ambito === 'hogar' ? 'Hogar' : 'Personal'}
        </>
      }
      volverA="/compra"
      etiquetaVolver="Volver a Compra rápida a 1 cuota"
      accionDerecha={<Insignia variante="indigo">{cuotasEfectivas} cuotas</Insignia>}
      mostrarNavegacion
      etiquetaBarraAccion="Guardar compra a cuotas"
      barraAccion={
        tarjetaCompatible ? (
          <button
            type="button"
            className={`${claseBotonPrimario} w-full ${
              borrador.monto <= 0 ? 'opacity-65' : ''
            }`}
            aria-disabled={borrador.monto <= 0 || guardando ? 'true' : undefined}
            data-sin-scroll
            onClick={() => void manejarGuardar()}
          >
            {guardando
              ? 'Guardando…'
              : `Guardar ${formatearCop(borrador.monto)} en ${cuotasEfectivas} cuotas`}
          </button>
        ) : (
          <Link to="/compra" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>
            Volver a Compra rápida
          </Link>
        )
      }
    >
      {errorValidacion ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorValidacion.mensaje}</p>
        </Aviso>
      ) : null}

      {/* Ámbito Hogar | Personal */}
      <section aria-labelledby="ambito-cuotas-heading">
        <h2 id="ambito-cuotas-heading" className="sr-only">
          Ámbito de la compra a cuotas
        </h2>
        <SelectorAmbito
          ambito={borrador.ambito}
          onCambiar={(siguiente) => {
            setErrorValidacion(null)
            cambiarAmbito(siguiente)
          }}
        />
      </section>

      {!tarjetaCompatible ? (
        <Aviso variante="ambar" icono="▲">
          <p className="font-bold">No hay una tarjeta disponible en este ámbito.</p>
          <p>
            Cambiá a <strong>Hogar</strong> o elegí un medio de contado en Compra rápida.
          </p>
        </Aviso>
      ) : (
        <>
          {/* Valor total de la compra */}
          <section aria-labelledby="monto-cuotas-heading">
            <h2 id="monto-cuotas-heading" className="sr-only">
              Monto total del consumo
            </h2>
            <div className="rounded-2xl border-2 border-hogar-borde-fuerte bg-hogar-superficie px-3.5 py-2 text-right">
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[0.8125rem] text-hogar-tinta-suave">
                <label htmlFor="monto-cuotas-input" className="font-bold text-hogar-tinta-suave">
                  Valor total de la compra (COP)
                </label>
                <Insignia variante="primario">{nombreCategoria}</Insignia>
              </div>
              <input
                id="monto-cuotas-input"
                className="hogar-cop min-h-[46px] min-w-11 w-full border-0 bg-transparent py-0.5 text-right text-[2rem] font-extrabold leading-[1.15] tracking-tight text-hogar-tinta"
                type="text"
                inputMode="numeric"
                value={formatearCop(borrador.monto)}
                aria-describedby="monto-cuotas-ayuda"
                onChange={(e) => {
                  setErrorValidacion(null)
                  setBorrador((prev) => ({
                    ...prev,
                    monto: parsearDigitosCop(e.target.value),
                  }))
                }}
              />
              <p id="monto-cuotas-ayuda" className={`${claseAyudaCampo} text-right`}>
                {tarjetaCompatible.nombre} · Corte día {tarjetaCompatible.diaCorte} · Pago día{' '}
                {tarjetaCompatible.diaPago} ({textoTasa})
              </p>
            </div>
          </section>

          {/* Selector de categoría si aún no eligió */}
          {!borrador.categoriaId ? (
            <section aria-labelledby="categoria-cuotas-heading">
              <h2
                id="categoria-cuotas-heading"
                className="mb-1.5 text-[0.9375rem] font-extrabold text-hogar-tinta"
              >
                Elegí una categoría
              </h2>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Categorías">
                {categoriasOrdenadas.slice(0, 6).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie px-2 py-2 text-sm font-semibold text-hogar-tinta hover:bg-hogar-superficie-suave"
                    aria-pressed={false}
                    onClick={() => {
                      setErrorValidacion(null)
                      seleccionarCategoria(cat.id)
                    }}
                  >
                    {cat.nombre}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {/* Selector de cuotas 1 / 3 / 6 / 12 / Otro */}
          <section aria-labelledby="cuotas-heading">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2
                id="cuotas-heading"
                className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta"
              >
                Cuotas en {tarjetaCompatible.nombre}
              </h2>
              <span className="text-[0.8125rem] text-hogar-tinta-suave">Solo tarjeta</span>
            </div>

            <div
              className="grid grid-cols-5 gap-1.5"
              role="group"
              aria-label="Elegir número de cuotas"
            >
              {CHIPS_CUOTAS.map((n) => {
                const activo = cuotasEfectivas === n
                return (
                  <button
                    key={n}
                    type="button"
                    className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-1 py-2 text-[0.8125rem] font-semibold ${
                      activo
                        ? 'border-hogar-indigo bg-hogar-indigo text-white'
                        : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                    }`}
                    aria-pressed={activo}
                    aria-label={n === 1 ? '1 cuota' : `${n} cuotas`}
                    onClick={() => {
                      if (n === 1) {
                        seleccionarCuotas(1)
                        navigate('/compra')
                      } else {
                        setOtroAbierto(false)
                        seleccionarCuotas(n)
                      }
                    }}
                  >
                    {activo ? `✓ ${n}` : n}
                  </button>
                )
              })}
              <button
                type="button"
                className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-1 py-2 text-[0.8125rem] font-semibold ${
                  !(CHIPS_CUOTAS as readonly number[]).includes(cuotasEfectivas)
                    ? 'border-hogar-indigo bg-hogar-indigo text-white'
                    : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                }`}
                aria-pressed={!(CHIPS_CUOTAS as readonly number[]).includes(cuotasEfectivas)}
                aria-label="Otro número de cuotas"
                onClick={() => setOtroAbierto((v) => !v)}
              >
                Otro
              </button>
            </div>

            <details
              open={otroAbierto}
              onToggle={(e) => setOtroAbierto(e.currentTarget.open)}
              className="mt-2 overflow-hidden rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-hogar-tinta">
                <span>¿Otro número de cuotas? (ej. 2, 4, 18, 24)</span>
                <span aria-hidden="true">▾</span>
              </summary>
              <div className="border-t border-hogar-borde bg-hogar-fondo px-3 py-2.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cuotas-personalizadas" className={claseEtiquetaCampo}>
                    Número exacto de cuotas
                  </label>
                  <input
                    id="cuotas-personalizadas"
                    className={claseCampoTexto}
                    type="number"
                    min={2}
                    max={48}
                    value={cuotasEfectivas}
                    onChange={(e) => {
                      const val = Number.parseInt(e.target.value, 10)
                      if (Number.isFinite(val) && val >= 2 && val <= 48) {
                        seleccionarCuotas(val)
                      }
                    }}
                  />
                </div>
              </div>
            </details>
          </section>

          {/* Desglose explícito SIN DOBLE CONTEO */}
          <Tarjeta acento="primario">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
                Cómo se registra (sin doble conteo)
              </h2>
              <Insignia variante="primario">Regla activa</Insignia>
            </div>

            <dl className="m-0 flex flex-col gap-1.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="min-w-0 flex-1 text-hogar-tinta-suave">
                  1. Consumo hoy (Compra en {nombreCategoria})
                </dt>
                <dd className="hogar-cop m-0 font-bold text-hogar-tinta">
                  {formatearCop(desglose?.consumoHoy ?? borrador.monto)}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="min-w-0 flex-1 text-hogar-tinta-suave">
                  2. Plan de cuotas (capital en Obligaciones)
                </dt>
                <dd className="hogar-cop m-0 font-bold text-hogar-tinta">
                  {resumenCapitalCuotas}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="min-w-0 flex-1 text-hogar-tinta-suave">
                  3. Costo financiero est. (cuota 1 · balde aparte)
                </dt>
                <dd className="hogar-cop m-0 font-bold text-hogar-tinta">
                  {primeraCuotaInteres !== null
                    ? formatearCop(primeraCuotaInteres)
                    : tieneTasa
                      ? '—'
                      : 'Sin tasa (a mano)'}
                </dd>
              </div>
            </dl>

            <div className="mt-3">
              <Aviso variante="indigo" icono="ℹ">
                <p>
                  <strong className="text-hogar-tinta">
                    Tu gasto en {nombreCategoria} de {mesTexto} será{' '}
                    {formatearCop(borrador.monto)}
                  </strong>
                  {borrador.monto > 0 ? `, nunca ${ejemploSinDobleConteo}.` : '.'}
                </p>
                {!tieneTasa ? (
                  <p>Sin tasa: registrarás intereses a mano en Obligaciones.</p>
                ) : (
                  <p>
                    Financiar no cuenta como aporte hoy. Las cuotas pasan a{' '}
                    <em>Obligaciones del mes</em> y los intereses al balde aparte{' '}
                    <em>Costo financiero</em> (tasa exacta E.A.→M.V., redondeando solo el
                    interés al peso).
                  </p>
                )}
              </Aviso>
            </div>
          </Tarjeta>

          {/* Calendario de cuotas */}
          {desglose && desglose.cuotas.length > 0 ? (
            <Tarjeta>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
                  Cuotas programadas (corte {tarjetaCompatible.diaCorte} · pago{' '}
                  {tarjetaCompatible.diaPago})
                </h2>
                <Insignia variante="neutral">Derivado</Insignia>
              </div>
              <dl className="m-0 flex flex-col gap-1.5 text-sm">
                {desglose.cuotas.map((c) => (
                  <div
                    key={c.numero}
                    className="flex flex-wrap items-baseline justify-between gap-2"
                  >
                    <dt className="min-w-0 flex-1 text-hogar-tinta-suave">
                      Cuota {c.numero} de {desglose.cuotas.length} ·{' '}
                      {formatearFechaCortaEs(c.fechaVencimiento, true)}
                    </dt>
                    <dd className="hogar-cop m-0 font-bold text-hogar-tinta">
                      {formatearCop(c.capital)} cap.
                      {c.interes !== null ? ` + ~${formatearCop(c.interes)} int.` : ''}
                    </dd>
                  </div>
                ))}
                {desglose.interesTotal !== null ? (
                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 border-t border-hogar-borde pt-2 text-[0.9375rem]">
                    <dt className="min-w-0 flex-1 font-extrabold text-hogar-tinta">
                      Interés total estimado (balde Costo financiero)
                    </dt>
                    <dd className="hogar-cop m-0 font-extrabold text-hogar-tinta">
                      {formatearCop(desglose.interesTotal)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Tarjeta>
          ) : (
            <p className={claseAyudaCampo}>
              Ingresá un monto mayor o igual a {cuotasEfectivas} COP para ver el calendario de
              cuotas.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="nota-cuotas" className={claseEtiquetaCampo}>
              Descripción de la compra (opcional)
            </label>
            <input
              id="nota-cuotas"
              className={claseCampoTexto}
              type="text"
              placeholder="Ej. Mercado Éxito"
              value={borrador.descripcion}
              onChange={(e) =>
                setBorrador((prev) => ({ ...prev, descripcion: e.target.value }))
              }
            />
          </div>

          <Link
            to="/obligaciones"
            className={`${claseBotonSecundario} w-full no-underline`}
          >
            Ver cómo queda en Obligaciones
          </Link>
        </>
      )}
    </ShellApp>
  )
}
