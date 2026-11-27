import { Link } from 'react-router-dom'
import type { ItemAgenda, ItemCuota } from '../../app/obligaciones'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso, Tarjeta, claseAyudaCampo, claseBotonIcono,
  claseBotonPequenoSecundario, claseBotonPrimario,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { useObligaciones } from './ContextoObligaciones'
import { TarjetaItemAgenda, desplazarPeriodo, formatearPeriodoEs, montoPendienteItem, nombreMesPeriodoEs } from './PiezasObligaciones'

function ctaParaItem(item: ItemAgenda): { destino: string; etiqueta: string } {
  if (item.tipo === 'cuota') {
    const prefijo = item.nCuotas > 0 ? `Cuota ${item.numero}/${item.nCuotas}` : item.descripcion
    return {
      destino: `/obligaciones/pagar/cuota/${encodeURIComponent(item.cuotaId)}`,
      etiqueta: `Registrar pago · ${prefijo} (${formatearPesos(item.restante)})`,
    }
  }
  const monto = item.montoEstimado !== null ? ` (${formatearPesos(item.montoEstimado)})` : ''
  return {
    destino: `/obligaciones/pagar/obligacion/${encodeURIComponent(item.obligacionId)}`,
    etiqueta: `Registrar pago · ${item.nombre}${monto}`,
  }
}

const claveItem = (item: ItemAgenda) => (item.tipo === 'cuota' ? `c-${item.cuotaId}` : `o-${item.obligacionId}`)

export function PantallaObligaciones() {
  const {
    periodo, agenda, incluirPersonales, cargando, errorCarga, toast,
    cambiarPeriodo, alternarIncluirPersonales, recargar, limpiarToast,
  } = useObligaciones()

  const hoy = hoyCivil(new Date())
  const vencidas = agenda?.vencidas ?? []
  const pendientes = agenda?.pendientes ?? []
  const pagadas = agenda?.pagadas ?? []
  const resumen = agenda?.resumen ?? { periodo, consumoReal: 0, capitalPagado: 0, capitalPendiente: 0, costoFinanciero: 0 }

  const totalPendientes = pendientes.reduce((acc, it) => acc + montoPendienteItem(it), 0)
  const totalVencidas = vencidas.reduce((acc, it) => acc + montoPendienteItem(it), 0)
  const abiertasCount = vencidas.length + pendientes.length

  const interesPag = pagadas.filter((i): i is ItemCuota => i.tipo === 'cuota').reduce((acc, c) => acc + (c.interes ?? 0), 0)
  const interesPend = [...vencidas, ...pendientes].filter((i): i is ItemCuota => i.tipo === 'cuota').reduce((acc, c) => acc + (c.interes ?? 0), 0)
  const notaCosto = interesPag > 0 || interesPend > 0 ? `${formatearPesos(interesPag)} pag. · ${formatearPesos(interesPend)} pend.` : 'Balde aparte'

  const primerPendiente = vencidas[0] ?? pendientes[0] ?? null
  const ctaPrincipal = primerPendiente
    ? ctaParaItem(primerPendiente)
    : { destino: '/obligaciones/nuevo-pasivo', etiqueta: '+ Agregar tarjeta, crédito o deuda' }

  const mesTexto = nombreMesPeriodoEs(periodo)
  const subtituloMes = `${formatearPeriodoEs(periodo)} · ${abiertasCount === 0 ? 'Al día' : abiertasCount === 1 ? '1 pendiente' : `${abiertasCount} pendientes`}`

  return (
    <ShellApp
      titulo="Obligaciones del mes"
      subtitulo={subtituloMes}
      mostrarNavegacion
      etiquetaBarraAccion="Acción principal de obligaciones"
      barraAccion={
        primerPendiente ? (
          <div className="flex items-center gap-2">
            <Link to={ctaPrincipal.destino} className={`${claseBotonPrimario} flex-1 no-underline`} data-sin-scroll>
              {ctaPrincipal.etiqueta}
            </Link>
            <Link to="/obligaciones/nuevo-pasivo" className={`${claseBotonPequenoSecundario} shrink-0 no-underline`}>
              + Pasivo
            </Link>
          </div>
        ) : (
          <Link to="/obligaciones/nuevo-pasivo" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>
            + Agregar tarjeta, crédito o deuda
          </Link>
        )
      }
    >
      {toast ? (
        <div className="hogar-toast flex items-center justify-between gap-2 rounded-2xl bg-hogar-tinta px-3.5 py-2.5 text-sm text-white shadow-[var(--hogar-shadow-elevated)]" role="status" aria-live="polite">
          <span className="min-w-0 flex-1 break-words">✓ {toast}</span>
          <button type="button" className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent px-2 font-bold text-[#9be8d0] underline" onClick={limpiarToast}>Cerrar</button>
        </div>
      ) : null}

      {errorCarga ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorCarga}</p>
          <button type="button" className={`${claseBotonPequenoSecundario} mt-1`} onClick={recargar}>Reintentar</button>
        </Aviso>
      ) : null}

      <section aria-labelledby="resumen-contable-heading">
        <h2 id="resumen-contable-heading" className="sr-only">Resumen separado de consumo real del hogar, capital pagado de cuotas y costo financiero</h2>
        <div className="grid grid-cols-3 gap-2">
          <article className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie p-2.5 shadow-[var(--hogar-shadow-card)]">
            <span className="flex min-w-0 items-start gap-1.5 text-[0.6875rem] font-bold leading-[1.2] text-hogar-tinta-suave">
              <span className="mt-[3px] size-2 shrink-0 rounded-full bg-hogar-primario" aria-hidden="true" />
              <span className="min-w-0 break-words">{incluirPersonales ? 'Consumo real (+ pers.)' : 'Consumo real (hogar)'}</span>
            </span>
            <div className="mt-auto flex min-w-0 flex-col gap-0.5">
              <span className="hogar-cop text-[0.9375rem] font-extrabold leading-tight tracking-tight text-hogar-tinta break-words">{formatearPesos(resumen.consumoReal)}</span>
              <span className="text-[0.65rem] leading-[1.2] text-hogar-tinta-suave break-words">{incluirPersonales ? 'Hogar + tus personales' : 'Solo hogar · 1 vez por compra'}</span>
            </div>
          </article>
          <article className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie p-2.5 shadow-[var(--hogar-shadow-card)]">
            <span className="flex min-w-0 items-start gap-1.5 text-[0.6875rem] font-bold leading-[1.2] text-hogar-tinta-suave">
              <span className="mt-[3px] size-2 shrink-0 rounded-full bg-hogar-indigo" aria-hidden="true" />
              <span className="min-w-0 break-words">Capital pagado (cuotas)</span>
            </span>
            <div className="mt-auto flex min-w-0 flex-col gap-0.5">
              <span className="hogar-cop text-[0.9375rem] font-extrabold leading-tight tracking-tight text-hogar-tinta break-words">{formatearPesos(resumen.capitalPagado)}</span>
              <span className="hogar-cop text-[0.65rem] leading-[1.2] text-hogar-tinta-suave break-words">Pagado · {formatearPesos(resumen.capitalPendiente)} pend.</span>
            </div>
          </article>
          <article className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie p-2.5 shadow-[var(--hogar-shadow-card)]">
            <span className="flex min-w-0 items-start gap-1.5 text-[0.6875rem] font-bold leading-[1.2] text-hogar-tinta-suave">
              <span className="mt-[3px] size-2 shrink-0 rounded-full bg-hogar-ambar" aria-hidden="true" />
              <span className="min-w-0 break-words">Costo financ.</span>
            </span>
            <div className="mt-auto flex min-w-0 flex-col gap-0.5">
              <span className="hogar-cop text-[0.9375rem] font-extrabold leading-tight tracking-tight text-hogar-tinta break-words">{formatearPesos(resumen.costoFinanciero)}</span>
              <span className="hogar-cop text-[0.65rem] leading-[1.2] text-hogar-tinta-suave break-words">{notaCosto}</span>
            </div>
          </article>
        </div>
      </section>

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-hogar-borde bg-hogar-superficie p-1.5 shadow-[var(--hogar-shadow-card)]" role="region" aria-label="Cambiar mes calendario">
        <button type="button" className={claseBotonIcono} aria-label="Mes anterior" onClick={() => cambiarPeriodo(desplazarPeriodo(periodo, -1))}>‹</button>
        <span className="text-[0.9375rem] font-extrabold text-hogar-tinta">{formatearPeriodoEs(periodo)}</span>
        <button type="button" className={claseBotonIcono} aria-label="Mes siguiente" onClick={() => cambiarPeriodo(desplazarPeriodo(periodo, 1))}>›</button>
      </div>

      <div className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-hogar-borde bg-hogar-superficie px-3.5 py-2 shadow-[var(--hogar-shadow-card)]">
        <label htmlFor="toggle-incluir-personales" className="min-w-0 flex-1 cursor-pointer text-sm font-bold text-hogar-tinta">
          Incluir mis gastos personales
        </label>
        <div className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
          <input id="toggle-incluir-personales" type="checkbox" role="switch" checked={incluirPersonales} onChange={(e) => void alternarIncluirPersonales(e.target.checked)} className="hogar-switch" />
        </div>
      </div>

      {cargando && !agenda ? (
        <Aviso variante="indigo" icono="◷" role="status"><p className="font-bold">Cargando obligaciones de {mesTexto}…</p></Aviso>
      ) : null}

      {vencidas.length > 0 ? (
        <section aria-labelledby="vencidas-heading" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="vencidas-heading" className="m-0 text-[0.9375rem] font-extrabold text-hogar-peligro">Vencidas</h2>
            <span className="hogar-cop text-[0.8125rem] font-bold text-hogar-peligro">{formatearPesos(totalVencidas)} por pagar</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">{vencidas.map((item) => <TarjetaItemAgenda key={claveItem(item)} item={item} hoy={hoy} />)}</ul>
        </section>
      ) : null}

      <section aria-labelledby="pendientes-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pendientes-heading" className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Pendientes este mes</h2>
          <span className="hogar-cop text-[0.8125rem] font-bold text-hogar-tinta-suave">{formatearPesos(totalPendientes)} por pagar</span>
        </div>
        {pendientes.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">{pendientes.map((item) => <TarjetaItemAgenda key={claveItem(item)} item={item} hoy={hoy} />)}</ul>
        ) : vencidas.length === 0 && !cargando ? (
          <Tarjeta suave>
            <p className="m-0 text-sm font-bold text-hogar-tinta">✓ Sin pagos pendientes en {mesTexto}</p>
          </Tarjeta>
        ) : null}
      </section>

      <section aria-labelledby="pagadas-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pagadas-heading" className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Pagadas en {mesTexto}</h2>
          <span className="text-[0.8125rem] text-hogar-tinta-suave">{pagadas.length} {pagadas.length === 1 ? 'completada' : 'completadas'}</span>
        </div>
        {pagadas.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">{pagadas.map((item) => <TarjetaItemAgenda key={claveItem(item)} item={item} hoy={hoy} />)}</ul>
        ) : !cargando ? (
          <p className={claseAyudaCampo}>Todavía no hay obligaciones pagadas en {mesTexto}.</p>
        ) : null}
      </section>
    </ShellApp>
  )
}
