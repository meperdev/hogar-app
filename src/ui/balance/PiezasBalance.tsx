import { useState } from 'react'
import type { AporteMiembroVista, IngresoFijoVista } from '../../app/balance'
import { formatearPesos } from '../../domain/pesos'
import {
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoPrimario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { formatearFechaCortaEs, parsearDigitosCop } from '../compraRapida/formatoCop'
import { nombreMesPeriodoEs } from '../obligaciones/PiezasObligaciones'

export function InterruptorBalance({
  id,
  etiqueta,
  ayuda,
  checked,
  disabled = false,
  onChange,
}: {
  id: string
  etiqueta: string
  ayuda: string
  checked: boolean
  disabled?: boolean | undefined
  onChange: (valor: boolean) => void
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-hogar-borde bg-hogar-superficie px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className="block cursor-pointer text-sm font-bold text-hogar-tinta break-words"
        >
          {etiqueta}
        </label>
        <p className={claseAyudaCampo}>{ayuda}</p>
      </div>
      <div className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="size-6 cursor-pointer accent-hogar-primario"
        />
      </div>
    </div>
  )
}

export function BarraProporcional({
  miembros,
  totalAportes,
}: {
  miembros: AporteMiembroVista[]
  totalAportes: number
}) {
  const primero = miembros[0]
  const segundo = miembros[1]
  const anchoPrimero =
    totalAportes > 0 && primero ? Math.round((primero.aporte * 100) / totalAportes) : 50
  const anchoSegundo = Math.max(0, 100 - anchoPrimero)
  const etiqueta = miembros
    .map((m) => `${m.nombre} ${m.pctTotal}`)
    .join(', ')

  return (
    <div>
      <div
        className="flex h-3.5 w-full overflow-hidden rounded-full border border-hogar-borde-fuerte bg-hogar-superficie-suave"
        role="img"
        aria-label={`Distribución de aportes: ${etiqueta}`}
      >
        {totalAportes > 0 ? (
          <>
            {primero && primero.aporte > 0 ? (
              <div className="h-full bg-hogar-primario" style={{ width: `${anchoPrimero}%` }} />
            ) : null}
            {segundo && segundo.aporte > 0 ? (
              <div className="h-full hogar-barra-indigo" style={{ width: `${anchoSegundo}%` }} />
            ) : null}
          </>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[0.8125rem] text-hogar-tinta">
        {miembros.map((m, idx) => (
          <span key={m.miembroId} className="inline-flex items-center gap-1.5">
            <span
              className={`inline-block size-3 rounded-sm border border-hogar-tinta ${
                idx === 0 ? 'bg-hogar-primario' : 'hogar-muestra-indigo'
              }`}
              aria-hidden="true"
            />
            <strong>{m.nombre}</strong> · <span className="hogar-cop">{m.pctTotal}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function TarjetaMiembroBalance({
  miembro,
  indice,
  periodo,
  mostrarPctIngreso,
}: {
  miembro: AporteMiembroVista
  indice: number
  periodo: string
  mostrarPctIngreso: boolean
}) {
  const mes = nombreMesPeriodoEs(periodo)
  const partes: string[] = []
  if (miembro.desglose.comprasContado > 0) {
    partes.push(`compras ${formatearPesos(miembro.desglose.comprasContado)}`)
  }
  if (miembro.desglose.pagosDeuda > 0) {
    partes.push(`pagos de deuda ${formatearPesos(miembro.desglose.pagosDeuda)}`)
  }
  if (miembro.desglose.costosDirectos > 0) {
    partes.push(`costos ${formatearPesos(miembro.desglose.costosDirectos)}`)
  }
  if (miembro.desglose.transferenciasFondoComun > 0) {
    partes.push(
      `fondo común ${formatearPesos(miembro.desglose.transferenciasFondoComun)}`,
    )
  }

  return (
    <li>
      <Tarjeta acento={indice === 0 ? 'primario' : 'indigo'} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 basis-[160px]">
            <h3 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta break-words">
              {miembro.nombre}
            </h3>
            {mostrarPctIngreso ? (
              miembro.pctIngreso !== null ? (
                <p className="m-0 mt-0.5 text-[0.8125rem] text-hogar-tinta-suave">
                  <strong className="text-hogar-tinta">{miembro.pctIngreso}</strong> de sus ingresos
                  de {mes} ({formatearPesos(miembro.ingresoMes)})
                </p>
              ) : (
                <p className="m-0 mt-0.5 text-[0.8125rem] text-hogar-tinta-suave">
                  Sin ingresos registrados este mes
                </p>
              )
            ) : (
              <p className="m-0 mt-0.5 text-[0.8125rem] text-hogar-tinta-suave">
                Solo aportes al hogar (compras, pagos a pasivos Hogar y fondo común)
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="hogar-cop block text-base font-extrabold text-hogar-tinta">
              {formatearPesos(miembro.aporte)}
            </span>
            <span className="hogar-cop block text-xs text-hogar-tinta-suave">
              {miembro.pctTotal} del total
            </span>
          </div>
        </div>
        <p className={claseAyudaCampo}>
          {partes.length > 0 ? `Incluye: ${partes.join(', ')}.` : 'Sin aportes al hogar este mes.'}
        </p>
      </Tarjeta>
    </li>
  )
}

export function TarjetaIngresoFijo({
  item,
  ocupado,
  onConfirmarRecibido,
}: {
  item: IngresoFijoVista
  ocupado: boolean
  onConfirmarRecibido: (datos: {
    ingresoId: string
    montoEsperado: number
    montoRecibido: number
    fechaRecepcion: string
    recepcionExistente: { id: string; baseSeq: number } | null
  }) => Promise<void>
}) {
  const [montoTexto, setMontoTexto] = useState(formatearPesos(item.montoEfectivo))
  const [fecha, setFecha] = useState(item.fechaRecepcion ?? item.fechaEsperada)
  const [error, setError] = useState('')

  const esRecibido = item.estado === 'recibido'
  const difiere = esRecibido && item.montoRecibido !== null && item.montoRecibido !== item.montoEsperado

  async function confirmar() {
    const monto = parsearDigitosCop(montoTexto)
    if (monto <= 0) {
      setError('Ingresa un monto mayor a $0')
      return
    }
    setError('')
    try {
      await onConfirmarRecibido({
        ingresoId: item.ingresoId,
        montoEsperado: item.montoEsperado,
        montoRecibido: monto,
        fechaRecepcion: fecha,
        recepcionExistente:
          item.recepcionId && item.recepcionBaseSeq !== null
            ? { id: item.recepcionId, baseSeq: item.recepcionBaseSeq }
            : null,
      })
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo confirmar')
    }
  }

  return (
    <li>
      <Tarjeta
        acento={esRecibido ? 'ninguno' : 'ambar'}
        suave={esRecibido}
        className="flex flex-col gap-2.5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 basis-[160px]">
            <h3 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta break-words">
              {item.descripcion} · {item.miembroNombre}
            </h3>
            <p className="m-0 mt-0.5 text-[0.8125rem] text-hogar-tinta-suave">
              Fijo · Día esperado: {formatearFechaCortaEs(item.fechaEsperada)}
              {difiere ? ` · Base: ${formatearPesos(item.montoEsperado)}` : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="hogar-cop block text-base font-extrabold text-hogar-tinta">
              {formatearPesos(item.montoEfectivo)}
            </span>
            {esRecibido ? (
              <Insignia variante="primario">
                ✓ Recibido {item.fechaRecepcion ? formatearFechaCortaEs(item.fechaRecepcion) : ''}
              </Insignia>
            ) : (
              <Insignia variante="ambar">◷ Esperado</Insignia>
            )}
          </div>
        </div>

        {difiere ? (
          <p className={claseAyudaCampo}>
            Recibido con monto distinto al esperado. El balance usa {formatearPesos(item.montoEfectivo)} sin cambiar la base.
          </p>
        ) : null}

        {!esRecibido ? (
          <details className="overflow-hidden rounded-xl border border-hogar-borde-fuerte bg-hogar-superficie">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-bold text-hogar-tinta">
              <span>Marcar recibido (puede variar el monto)</span>
              <span aria-hidden="true">▾</span>
            </summary>
            <div className="flex flex-col gap-2.5 border-t border-hogar-borde bg-hogar-fondo p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`monto-rec-${item.serieId}`}
                    className={claseEtiquetaCampo}
                  >
                    Monto recibido (COP)
                  </label>
                  <input
                    id={`monto-rec-${item.serieId}`}
                    aria-label={`Monto recibido ${item.descripcion}`}
                    className={`${claseCampoTexto} hogar-cop font-bold`}
                    type="text"
                    inputMode="numeric"
                    value={montoTexto}
                    disabled={ocupado}
                    onChange={(e) => {
                      const n = parsearDigitosCop(e.target.value)
                      setMontoTexto(n > 0 ? formatearPesos(n) : '')
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`fecha-rec-${item.serieId}`}
                    className={claseEtiquetaCampo}
                  >
                    Fecha recepción
                  </label>
                  <input
                    id={`fecha-rec-${item.serieId}`}
                    className={claseCampoTexto}
                    type="date"
                    value={fecha}
                    disabled={ocupado}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
              </div>
              <p className={claseAyudaCampo}>
                Si llegó un valor distinto al esperado, el balance usará el monto recibido sin cambiar tu salario base.
              </p>
              {error ? (
                <p role="alert" className="m-0 text-xs font-bold text-hogar-peligro">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className={`${claseBotonPequenoPrimario} w-full`}
                disabled={ocupado}
                onClick={() => void confirmar()}
              >
                {ocupado ? 'Guardando…' : 'Confirmar recibido'}
              </button>
            </div>
          </details>
        ) : null}
      </Tarjeta>
    </li>
  )
}
