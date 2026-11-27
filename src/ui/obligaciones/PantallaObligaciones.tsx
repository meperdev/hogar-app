import { Link } from 'react-router-dom'
import type { ItemAgenda, ItemCuota } from '../../app/obligaciones'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso, FilaSwitchPersonal, Insignia, SelectorMes, Tarjeta, claseAyudaCampo,
  claseBotonPequenoPrimario, claseBotonPequenoSecundario, claseBotonPrimario,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { useObligaciones } from './ContextoObligaciones'
import { TarjetaItemAgenda, etiquetaAmbitoTitular, montoPendienteItem } from './PiezasObligaciones'
import { formatearPeriodoEs, nombreMesPeriodoEs } from '../periodos'

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
    periodo, agenda, incluirPersonales, cargando, errorCarga,
    cambiarPeriodo, alternarIncluirPersonales, recargar,
  } = useObligaciones()

  const hoy = hoyCivil(new Date())
  const vencidas = agenda?.vencidas ?? []
  const pendientes = agenda?.pendientes ?? []
  const pagadas = agenda?.pagadas ?? []
  const pasivos = agenda?.pasivos ?? []
  const resumen = agenda?.resumen ?? { periodo, consumoReal: 0, capitalPagado: 0, capitalPendiente: 0, costoFinanciero: 0 }

  const totalPendientes = pendientes.reduce((acc, it) => acc + montoPendienteItem(it), 0)
  const totalVencidas = vencidas.reduce((acc, it) => acc + montoPendienteItem(it), 0)
  const totalSaldoPasivos = pasivos.reduce((acc, p) => acc + p.saldoPendiente, 0)
  const abiertasCount = vencidas.length + pendientes.length

  const interesPag = pagadas.filter((i): i is ItemCuota => i.tipo === 'cuota').reduce((acc, c) => acc + (c.interes ?? 0), 0)
  const interesPend = [...vencidas, ...pendientes].filter((i): i is ItemCuota => i.tipo === 'cuota').reduce((acc, c) => acc + (c.interes ?? 0), 0)
  const notaCosto = interesPag > 0 || interesPend > 0 ? `${formatearPesos(interesPag)} pag. · ${formatearPesos(interesPend)} pend.` : 'Balde aparte'

  const primerPendiente = vencidas[0] ?? pendientes[0] ?? null
  const primerPasivoConSaldo = pasivos.find((p) => p.saldoPendiente > 0) ?? null
  const ctaPrincipal = primerPendiente
    ? ctaParaItem(primerPendiente)
    : primerPasivoConSaldo
      ? {
          destino: `/obligaciones/pagar/pasivo/${encodeURIComponent(primerPasivoConSaldo.pasivoId)}`,
          etiqueta: `Registrar abono · ${primerPasivoConSaldo.nombre} (${formatearPesos(primerPasivoConSaldo.saldoPendiente)})`,
        }
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
        primerPendiente || primerPasivoConSaldo ? (
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
      {errorCarga ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorCarga}</p>
          <button type="button" className={`${claseBotonPequenoSecundario} mt-1`} onClick={recargar}>Reintentar</button>
        </Aviso>
      ) : null}

      <section aria-labelledby="resumen-contable-heading">
        <h2 id="resumen-contable-heading" className="sr-only">Resumen separado de consumo real del hogar, capital pagado de cuotas y costo financiero</h2>
        <div className="flex flex-col gap-2">
          <article className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie px-3.5 py-3 shadow-[var(--hogar-shadow-card)]">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-start gap-1.5 text-xs font-bold leading-[1.2] text-hogar-tinta-suave">
                <span className="mt-[3px] size-2 shrink-0 rounded-full bg-hogar-primario" aria-hidden="true" />
                <span className="min-w-0 break-words">{incluirPersonales ? 'Consumo real (+ pers.)' : 'Consumo real (hogar)'}</span>
              </span>
              <span className="text-[0.7rem] leading-snug text-hogar-tinta-suave">
                {incluirPersonales ? 'Hogar + tus personales' : 'Solo hogar · 1 vez por compra'}
              </span>
            </div>
            <span className="hogar-cop shrink-0 text-xl font-extrabold leading-tight tracking-tight text-hogar-tinta">
              {formatearPesos(resumen.consumoReal)}
            </span>
          </article>
          <div className="grid grid-cols-2 gap-2">
            <article className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie p-3 shadow-[var(--hogar-shadow-card)]">
              <span className="flex min-w-0 items-start gap-1.5 text-xs font-bold leading-[1.2] text-hogar-tinta-suave">
                <span className="mt-[3px] size-2 shrink-0 rounded-full bg-hogar-indigo" aria-hidden="true" />
                <span className="min-w-0 break-words">Capital pagado (cuotas)</span>
              </span>
              <div className="mt-auto flex min-w-0 flex-col gap-0.5">
                <span className="hogar-cop text-base font-extrabold leading-tight tracking-tight text-hogar-tinta break-words">{formatearPesos(resumen.capitalPagado)}</span>
                <span className="hogar-cop text-[0.7rem] leading-[1.2] text-hogar-tinta-suave break-words">Pagado · {formatearPesos(resumen.capitalPendiente)} pend.</span>
              </div>
            </article>
            <article className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie p-3 shadow-[var(--hogar-shadow-card)]">
              <span className="flex min-w-0 items-start gap-1.5 text-xs font-bold leading-[1.2] text-hogar-tinta-suave">
                <span className="mt-[3px] size-2 shrink-0 rounded-full bg-hogar-ambar" aria-hidden="true" />
                <span className="min-w-0 break-words">Costo financiero</span>
              </span>
              <div className="mt-auto flex min-w-0 flex-col gap-0.5">
                <span className="hogar-cop text-base font-extrabold leading-tight tracking-tight text-hogar-tinta break-words">{formatearPesos(resumen.costoFinanciero)}</span>
                <span className="hogar-cop text-[0.7rem] leading-[1.2] text-hogar-tinta-suave break-words">{notaCosto}</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <SelectorMes
        periodo={periodo}
        onCambiar={cambiarPeriodo}
        ariaLabel="Cambiar mes calendario"
        pie={
          <FilaSwitchPersonal
            id="toggle-incluir-personales"
            checked={incluirPersonales}
            onChange={(v) => void alternarIncluirPersonales(v)}
            ayuda="Apagado por defecto. Incluye tus pasivos y compras personales sin mezclarlos con el hogar."
            etiquetaAyuda="Información sobre gastos personales en obligaciones"
          />
        }
      />

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

      {pasivos.length > 0 ? (
        <section aria-labelledby="pasivos-activos-heading" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="pasivos-activos-heading" className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
              Tarjetas, créditos y deudas
            </h2>
            <span className="hogar-cop text-[0.8125rem] font-bold text-hogar-tinta-suave">
              {totalSaldoPasivos > 0 ? `${formatearPesos(totalSaldoPasivos)} saldo` : 'Al día'}
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {pasivos.map((p) => (
              <li key={p.pasivoId}>
                <Tarjeta
                  acento={p.saldoPendiente > 0 ? 'indigo' : 'ninguno'}
                  className="flex flex-col gap-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta break-words">
                        {p.nombre}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Insignia variante={p.ambito === 'hogar' ? 'primario' : 'neutral'}>
                          {etiquetaAmbitoTitular(p.ambito, p.titular)}
                        </Insignia>
                        {p.tieneSinCalendario && p.saldoPendiente > 0 ? (
                          <Insignia variante="indigo">Abonos libres</Insignia>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block text-[0.6875rem] font-bold uppercase tracking-wide text-hogar-tinta-suave">
                        Saldo
                      </span>
                      <span className="hogar-cop text-base font-extrabold text-hogar-tinta">
                        {formatearPesos(p.saldoPendiente)}
                      </span>
                    </div>
                  </div>
                  {p.saldoPendiente > 0 ? (
                    <Link
                      to={`/obligaciones/pagar/pasivo/${encodeURIComponent(p.pasivoId)}`}
                      className={`${claseBotonPequenoPrimario} w-full no-underline`}
                    >
                      Registrar abono
                    </Link>
                  ) : null}
                </Tarjeta>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
