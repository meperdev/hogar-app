import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Ambito, ItemAgenda, Titular } from '../../app/obligaciones'
import { formatearPesos } from '../../domain/pesos'
import { Insignia, Tarjeta, TarjetaRadio, claseAyudaCampo, claseBotonSecundario, type AcentoTarjeta } from '../ComponentesBase'
import { formatearFechaCortaEs } from '../compraRapida/formatoCop'
import { nombreMesPeriodoEs } from '../periodos'
export { desplazarPeriodo, formatearPeriodoEs, nombreMesPeriodoEs } from '../periodos'
export { TarjetaRadio }

export function diasEntreFechasCiviles(desdeIso: string, hastaIso: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(desdeIso)
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hastaIso)
  if (!a || !b) return null
  return Math.round(
    (Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) - Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))) / 86_400_000,
  )
}

export function parsearPorcentajeEs(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!limpio || !/^\d+(\.\d+)?$/.test(limpio)) return null
  const valor = Number(limpio)
  return Number.isFinite(valor) && valor >= 0 ? valor : null
}

export function etiquetaAmbitoTitular(ambito: Ambito, titular: Titular): string {
  return `${ambito === 'hogar' ? 'Hogar' : 'Personal'} · titular ${titular.tipo === 'hogar' ? 'Hogar' : titular.nombre}`
}

export function montoPendienteItem(item: ItemAgenda): number {
  return item.tipo === 'cuota' ? item.restante : (item.montoEstimado ?? 0)
}

export type FilaDesglose = { etiqueta: ReactNode; valor: ReactNode; total?: boolean | undefined }

export function ListaDesglose({ filas }: { filas: FilaDesglose[] }) {
  return (
    <dl className="m-0 flex min-w-0 max-w-full flex-col gap-1.5">
      {filas.map((fila, idx) => (
        <div key={idx} className={`flex min-w-0 max-w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm ${fila.total ? 'mt-1 border-t border-hogar-borde pt-2 text-[0.9375rem]' : ''}`}>
          <dt className={`min-w-0 flex-1 basis-[120px] break-words ${fila.total ? 'font-extrabold text-hogar-tinta' : 'text-hogar-tinta-suave'}`}>{fila.etiqueta}</dt>
          <dd className={`hogar-cop m-0 ml-auto min-w-0 max-w-full text-right break-words text-hogar-tinta ${fila.total ? 'font-extrabold' : 'font-bold'}`}>{fila.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

export function TarjetaItemAgenda({ item, hoy }: { item: ItemAgenda; hoy: string }) {
  const dias = diasEntreFechasCiviles(hoy, item.fechaVencimiento)
  const esPagada = item.estado === 'pagada'
  const esVencida = item.estado === 'vencida'
  const vencePronto = !esPagada && !esVencida && dias !== null && dias >= 0 && dias <= 3
  const atraso = dias !== null && dias < 0 ? Math.abs(dias) : null

  const acento: AcentoTarjeta = esPagada
    ? 'ninguno'
    : esVencida
      ? 'peligro'
      : vencePronto || (item.tipo === 'cuota' && item.estado === 'parcial')
        ? 'ambar'
        : item.tipo === 'cuota' ? 'indigo' : 'primario'

  const baseFecha = formatearFechaCortaEs(item.fechaVencimiento)
  const textoVencimiento = esPagada || dias === null
    ? `Vence ${baseFecha}`
    : dias < 0
      ? `Venció ${baseFecha} (hace ${atraso} ${atraso === 1 ? 'día' : 'días'})`
      : dias === 0
        ? `Vence hoy (${baseFecha})`
        : dias <= 3 ? `Vence ${baseFecha} (en ${dias} ${dias === 1 ? 'día' : 'días'})` : `Vence ${baseFecha}`

  const badgeEstado = esPagada ? (
    <Insignia variante="primario">{item.tipo === 'cuota' && item.pagoEnlazado ? `✓ Pagado por ${item.pagoEnlazado.registradoPor}` : '✓ Pagado'}</Insignia>
  ) : esVencida ? (
    <Insignia variante="peligro">{atraso ? `▲ Vencida hace ${atraso} ${atraso === 1 ? 'día' : 'días'}` : '▲ Vencida'}</Insignia>
  ) : item.tipo === 'cuota' && item.estado === 'parcial' ? (
    <Insignia variante="ambar">◐ Parcial ({formatearPesos(item.restante)} pend.)</Insignia>
  ) : vencePronto ? (
    <Insignia variante="ambar">▲ Vence pronto</Insignia>
  ) : (
    <Insignia variante="neutral">◷ Pendiente</Insignia>
  )

  const esCuota = item.tipo === 'cuota'
  const titulo = esCuota ? (item.nCuotas > 0 ? `Cuota ${item.numero}/${item.nCuotas} · ${item.descripcion}` : item.descripcion) : item.nombre
  const meta = esCuota
    ? esPagada && item.pagoEnlazado
      ? `${item.pasivoNombre} · Pagó ${item.pagoEnlazado.registradoPor} el ${formatearFechaCortaEs(item.pagoEnlazado.fecha)}`
      : `${item.pasivoNombre} · ${textoVencimiento}`
    : esPagada && item.pago
      ? `Obligación del hogar · Pagada el ${formatearFechaCortaEs(item.pago.fecha)}`
      : `Obligación del hogar · ${textoVencimiento}`
  const monto = esCuota
    ? formatearPesos(esPagada ? (item.pagoEnlazado?.monto ?? item.capital + (item.interes ?? 0)) : item.restante)
    : item.pago ? formatearPesos(item.pago.monto) : item.montoEstimado !== null ? formatearPesos(item.montoEstimado) : 'Por definir'
  const subMonto = esCuota
    ? `${formatearPesos(item.capital)} cap.${item.interes !== null ? ` + ${formatearPesos(item.interes)} int.` : ' · Sin tasa'}`
    : `Consumo · ${item.categoriaNombre}`
  const destinoPago = esCuota
    ? `/obligaciones/pagar/cuota/${encodeURIComponent(item.cuotaId)}`
    : `/obligaciones/pagar/obligacion/${encodeURIComponent(item.obligacionId)}`

  return (
    <li>
      <Tarjeta acento={acento} suave={esPagada} className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1 basis-[160px]">
            <h3 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta break-words">{titulo}</h3>
            <p className="m-0 mt-0.5 text-[0.8125rem] text-hogar-tinta-suave break-words">{meta}</p>
          </div>
          <div className="shrink-0 text-right">
            <span className="hogar-cop block text-base font-extrabold text-hogar-tinta">{monto}</span>
            <span className="hogar-cop block text-xs text-hogar-tinta-suave">{subMonto}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {badgeEstado}
          {esCuota ? (
            <>
              {!esPagada ? <Insignia variante="indigo">Cuota pendiente</Insignia> : null}
              <Insignia variante={item.ambito === 'hogar' ? 'primario' : 'neutral'}>{etiquetaAmbitoTitular(item.ambito, item.titular)}</Insignia>
              {item.interesOrigen === 'manual' ? <Insignia variante="neutral">Interés manual</Insignia> : item.interes === null ? <Insignia variante="neutral">Sin tasa</Insignia> : null}
            </>
          ) : (
            <Insignia variante="neutral">Obligación del hogar</Insignia>
          )}
        </div>
        {!esPagada ? (
          <Link to={destinoPago} className={`${claseBotonSecundario} w-full no-underline`}>Registrar pago</Link>
        ) : !esCuota && item.pago && !item.pago.fecha.startsWith(item.periodo) ? (
          <p className={claseAyudaCampo}>
            Cerró {nombreMesPeriodoEs(item.periodo)} en agenda; sumó al consumo en la fecha de pago ({formatearFechaCortaEs(item.pago.fecha)}).
          </p>
        ) : null}
      </Tarjeta>
    </li>
  )
}
