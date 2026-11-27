import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CHIPS_CUOTAS, type ErrorBorrador } from '../../app/compraRapida'
import { formatearPesos } from '../../domain/pesos'
import { Aviso, Insignia, Tarjeta, claseAyudaCampo, claseBotonPrimario, claseBotonSecundario, claseCampoTexto, claseEtiquetaCampo } from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { useCompraRapida } from './ContextoCompraRapida'
import { ChipsCuotas, GrillaCategorias, SelectorAmbito } from './PiezasCompra'
import { formatearFechaCortaEs, formatearPorcentajeEs, nombreMesEs, parsearDigitosCop } from './formatoCop'

export function PantallaCompraCuotas() {
  const navigate = useNavigate()
  const location = useLocation()
  const { hogar, controlador, catalogo, guardando, borrador, mediosDisponibles, medioSeleccionado, setBorrador, cambiarAmbito, seleccionarMedio, guardarBorrador } = useCompraRapida()

  const navState = location.state as { abrirOtro?: boolean } | null
  const [otroAbierto, setOtroAbierto] = useState(
    Boolean(navState?.abrirOtro) || !(CHIPS_CUOTAS as readonly number[]).includes(borrador.cuotas),
  )
  const [errorValidacion, setErrorValidacion] = useState<ErrorBorrador | null>(null)

  useEffect(() => {
    if (borrador.cuotas < 2) setBorrador((p) => ({ ...p, cuotas: 3 }))
  }, [borrador.cuotas, setBorrador])

  const tarjeta = medioSeleccionado?.tipo === 'tarjeta' ? medioSeleccionado : mediosDisponibles.find((m) => m.tipo === 'tarjeta') ?? null
  useEffect(() => {
    if (medioSeleccionado?.tipo !== 'tarjeta' && tarjeta) seleccionarMedio(tarjeta.id)
  }, [medioSeleccionado?.tipo, seleccionarMedio, tarjeta])

  const categorias = catalogo ? [...catalogo.categorias].sort((a, b) => a.orden - b.orden) : []
  const nombreCategoria = categorias.find((c) => c.id === borrador.categoriaId)?.nombre ?? 'Sin categoría'
  const cuotas = Math.max(2, borrador.cuotas)
  const borradorCalculo = { ...borrador, medioId: tarjeta?.id ?? borrador.medioId, cuotas }
  const desglose = catalogo && tarjeta ? controlador.desglose(borradorCalculo, catalogo) : null

  const primeraCap = desglose?.cuotas[0]?.capital ?? 0
  const primeraInt = desglose?.cuotas[0]?.interes ?? null
  const resumenCap =
    desglose && desglose.cuotas.length > 0
      ? desglose.cuotas.every((c) => c.capital === primeraCap)
        ? `${desglose.cuotas.length} × ${formatearPesos(primeraCap)}`
        : `${desglose.cuotas.length} cuotas (total ${formatearPesos(desglose.consumoHoy)})`
      : `${cuotas} cuotas`

  const tieneTasa = Boolean(tarjeta?.tasa)
  const textoTasa = tarjeta?.tasa
    ? desglose?.tasaMensualPct != null
      ? `${formatearPorcentajeEs(tarjeta.tasa.ppm / 10_000, 2)} ${tarjeta.tasa.tipo === 'EA' ? 'E.A.' : 'M.V.'} → ${formatearPorcentajeEs(desglose.tasaMensualPct, 4)} M.V.`
      : `${formatearPorcentajeEs(tarjeta.tasa.ppm / 10_000, 2)} ${tarjeta.tasa.tipo === 'EA' ? 'E.A.' : 'M.V.'}`
    : 'Sin tasa configurada'

  async function manejarGuardar() {
    if (guardando) return
    const res = await guardarBorrador(borradorCalculo)
    if (res.estado === 'error') return setErrorValidacion(res.error)
    if (res.estado === 'fallo') return setErrorValidacion({ campo: 'monto', mensaje: res.mensaje })
    setErrorValidacion(null)
    navigate('/compra')
  }

  return (
    <ShellApp
      titulo="Compra a cuotas"
      subtitulo={<><strong className="text-hogar-tinta">{hogar.miembroActual.nombre}</strong> · {formatearFechaCortaEs(borrador.fecha)} · {borrador.ambito === 'hogar' ? 'Hogar' : 'Personal'}</>}
      volverA="/compra"
      etiquetaVolver="Volver a Compra rápida a 1 cuota"
      accionDerecha={<Insignia variante="indigo">{cuotas} cuotas</Insignia>}
      mostrarNavegacion
      etiquetaBarraAccion="Guardar compra a cuotas"
      barraAccion={
        tarjeta ? (
          <button
            type="button"
            className={`${claseBotonPrimario} w-full ${borrador.monto <= 0 ? 'opacity-65' : ''}`}
            aria-disabled={borrador.monto <= 0 || guardando ? 'true' : undefined}
            data-sin-scroll
            onClick={() => void manejarGuardar()}
          >
            {guardando ? 'Guardando…' : `Guardar ${formatearPesos(borrador.monto)} en ${cuotas} cuotas`}
          </button>
        ) : (
          <Link to="/compra" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>Volver a Compra rápida</Link>
        )
      }
    >
      {errorValidacion ? <Aviso variante="peligro" icono="▲" role="alert"><p>{errorValidacion.mensaje}</p></Aviso> : null}

      <SelectorAmbito ambito={borrador.ambito} ariaLabel="Ámbito de la compra a cuotas" onCambiar={(s) => { setErrorValidacion(null); cambiarAmbito(s) }} />

      {!tarjeta ? (
        <Aviso variante="ambar" icono="▲">
          <p className="font-bold">No hay una tarjeta disponible en este ámbito.</p>
          <p>Cambia a <strong>Hogar</strong> o elige un medio de contado en Compra rápida.</p>
        </Aviso>
      ) : (
        <>
          <div className="rounded-2xl border-2 border-hogar-borde-fuerte bg-hogar-superficie px-3.5 py-2 text-right">
            <div className="mb-0.5 flex items-center justify-between gap-2 text-[0.8125rem] text-hogar-tinta-suave">
              <label htmlFor="monto-cuotas-input" className="font-bold text-hogar-tinta-suave">Valor total de la compra (COP)</label>
              <Insignia variante="primario">{nombreCategoria}</Insignia>
            </div>
            <input
              id="monto-cuotas-input"
              className="hogar-cop min-h-[46px] min-w-11 w-full border-0 bg-transparent py-0.5 text-right text-[2rem] font-extrabold leading-[1.15] tracking-tight text-hogar-tinta"
              type="text"
              inputMode="numeric"
              value={formatearPesos(borrador.monto)}
              aria-describedby="monto-cuotas-ayuda"
              onChange={(e) => { setErrorValidacion(null); setBorrador((p) => ({ ...p, monto: parsearDigitosCop(e.target.value) })) }}
            />
            <p id="monto-cuotas-ayuda" className={`${claseAyudaCampo} text-right`}>
              {tarjeta.nombre} · Corte día {tarjeta.diaCorte} · Pago día {tarjeta.diaPago} ({textoTasa})
            </p>
          </div>

          {!borrador.categoriaId ? (
            <section aria-labelledby="categoria-cuotas-heading">
              <h2 id="categoria-cuotas-heading" className="mb-1.5 text-[0.9375rem] font-extrabold text-hogar-tinta">Elige una categoría</h2>
              <GrillaCategorias categorias={categorias.slice(0, 6)} seleccionadaId={borrador.categoriaId} ariaLabel="Categorías" onElegir={(categoriaId) => { setErrorValidacion(null); setBorrador((p) => ({ ...p, categoriaId })) }} />
            </section>
          ) : null}

          <section aria-labelledby="cuotas-heading">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="cuotas-heading" className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Cuotas en {tarjeta.nombre}</h2>
              <span className="text-[0.8125rem] text-hogar-tinta-suave">Solo tarjeta</span>
            </div>
            <ChipsCuotas
              cuotas={cuotas}
              variante="indigo"
              ariaLabel="Elegir número de cuotas"
              onElegir={(n, esOtro) => {
                if (esOtro) setOtroAbierto((v) => !v)
                else if (n === 1) { setBorrador((p) => ({ ...p, cuotas: 1 })); navigate('/compra') }
                else { setOtroAbierto(false); setBorrador((p) => ({ ...p, cuotas: n })) }
              }}
            />
            <details open={otroAbierto} onToggle={(e) => setOtroAbierto(e.currentTarget.open)} className="mt-2 overflow-hidden rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-hogar-tinta">
                <span>¿Otro número de cuotas? (ej. 2, 4, 18, 24)</span>
                <span aria-hidden="true">▾</span>
              </summary>
              <div className="border-t border-hogar-borde bg-hogar-fondo px-3 py-2.5">
                <label htmlFor="cuotas-personalizadas" className={claseEtiquetaCampo}>Número exacto de cuotas</label>
                <input
                  id="cuotas-personalizadas"
                  className={`${claseCampoTexto} mt-1.5`}
                  type="number"
                  min={2}
                  max={48}
                  value={cuotas}
                  onChange={(e) => {
                    const val = Number.parseInt(e.target.value, 10)
                    if (Number.isFinite(val) && val >= 2 && val <= 48) setBorrador((p) => ({ ...p, cuotas: val }))
                  }}
                />
              </div>
            </details>
          </section>

          <Tarjeta acento="primario">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Cómo se registra (sin doble conteo)</h2>
              <Insignia variante="primario">Regla activa</Insignia>
            </div>
            <dl className="m-0 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">1. Consumo hoy (Compra en {nombreCategoria})</dt><dd className="hogar-cop m-0 font-bold text-hogar-tinta">{formatearPesos(desglose?.consumoHoy ?? borrador.monto)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">2. Plan de cuotas (capital en Obligaciones)</dt><dd className="hogar-cop m-0 font-bold text-hogar-tinta">{resumenCap}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">3. Costo financiero est. (cuota 1 · balde aparte)</dt><dd className="hogar-cop m-0 font-bold text-hogar-tinta">{primeraInt !== null ? formatearPesos(primeraInt) : tieneTasa ? '—' : 'Sin tasa (a mano)'}</dd></div>
            </dl>
            <div className="mt-3">
              <Aviso variante="indigo" icono="ℹ">
                <p>
                  <strong className="text-hogar-tinta">Tu gasto en {nombreCategoria} de {nombreMesEs(borrador.fecha) || 'este mes'} será {formatearPesos(borrador.monto)}</strong>
                  {desglose?.cuotas[0] ? `, nunca ${formatearPesos(desglose.consumoHoy + desglose.cuotas[0].capital)}.` : '.'}
                </p>
                {!tieneTasa ? <p>Sin tasa: registrarás intereses a mano en Obligaciones.</p> : <p>Financiar no cuenta como aporte hoy. Las cuotas pasan a <em>Obligaciones</em> y los intereses a <em>Costo financiero</em>.</p>}
              </Aviso>
            </div>
          </Tarjeta>

          {desglose && desglose.cuotas.length > 0 ? (
            <Tarjeta>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Cuotas programadas (corte {tarjeta.diaCorte} · pago {tarjeta.diaPago})</h2>
                <Insignia variante="neutral">Derivado</Insignia>
              </div>
              <dl className="m-0 flex flex-col gap-1.5 text-sm">
                {desglose.cuotas.map((c) => (
                  <div key={c.numero} className="flex flex-wrap justify-between gap-2">
                    <dt className="text-hogar-tinta-suave">Cuota {c.numero} de {desglose.cuotas.length} · {formatearFechaCortaEs(c.fechaVencimiento, true)}</dt>
                    <dd className="hogar-cop m-0 font-bold text-hogar-tinta">{formatearPesos(c.capital)} cap.{c.interes !== null ? ` + ~${formatearPesos(c.interes)} int.` : ''}</dd>
                  </div>
                ))}
                {desglose.interesTotal !== null ? (
                  <div className="mt-1 flex justify-between gap-2 border-t border-hogar-borde pt-2 text-[0.9375rem]">
                    <dt className="font-extrabold text-hogar-tinta">Interés total estimado (balde Costo financiero)</dt>
                    <dd className="hogar-cop m-0 font-extrabold text-hogar-tinta">{formatearPesos(desglose.interesTotal)}</dd>
                  </div>
                ) : null}
              </dl>
            </Tarjeta>
          ) : (
            <p className={claseAyudaCampo}>Ingresa un monto mayor o igual a {cuotas} COP para ver el calendario de cuotas.</p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="nota-cuotas" className={claseEtiquetaCampo}>Descripción de la compra (opcional)</label>
            <input id="nota-cuotas" className={claseCampoTexto} type="text" placeholder="Ej. Mercado Éxito" value={borrador.descripcion} onChange={(e) => setBorrador((p) => ({ ...p, descripcion: e.target.value }))} />
          </div>
          <Link to="/obligaciones" className={`${claseBotonSecundario} w-full no-underline`}>Ver cómo queda en Obligaciones</Link>
        </>
      )}
    </ShellApp>
  )
}
