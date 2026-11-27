import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorMascotas } from '../../app/controladorMascotas'
import { mascotasDeItem, type CategoriaEstadoDespensa, type EstadoItemDespensa, type ItemDespensa, type Mascota, type TipoInsumo } from '../../domain/mascotas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoPrimario,
  claseBotonPequenoSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
  type AcentoTarjeta,
  type VarianteInsignia,
} from '../ComponentesBase'
import { formatearFechaCortaEs } from '../compraRapida/formatoCop'

const ETIQUETA_TIPO: Record<TipoInsumo, string> = {
  comida: 'Comida',
  higiene: 'Higiene',
  salud: 'Salud',
  otro: 'Otro',
}

const INSIGNIA_ESTADO: Record<CategoriaEstadoDespensa, { variante: VarianteInsignia; texto: string; acento: AcentoTarjeta }> = {
  alerta: { variante: 'peligro', texto: '▲ Por acabarse', acento: 'peligro' },
  revisar: { variante: 'ambar', texto: '▲ Revisar nivel', acento: 'ambar' },
  medio: { variante: 'indigo', texto: '● Media', acento: 'indigo' },
  bien: { variante: 'primario', texto: '✓ Bien', acento: 'primario' },
  desconocido: { variante: 'neutral', texto: '○ Sin registros aún', acento: 'ninguno' },
}

const COLOR_BARRA: Record<CategoriaEstadoDespensa, string> = {
  alerta: 'bg-hogar-peligro',
  revisar: 'bg-hogar-ambar',
  medio: 'bg-hogar-indigo',
  bien: 'bg-hogar-primario',
  desconocido: 'bg-hogar-borde-fuerte',
}

export function nombreMascotaOCompartido(
  itemOrId: string | null | Pick<ItemDespensa, 'mascotaId' | 'mascotaIds'>,
  mascotas: Mascota[],
): string {
  const ids =
    typeof itemOrId === 'string' || itemOrId === null
      ? itemOrId
        ? [itemOrId]
        : []
      : mascotasDeItem(itemOrId)
  if (ids.length === 0) return 'Todas (compartido)'
  const nombres = ids
    .map((id) => mascotas.find((m) => m.id === id)?.nombre)
    .filter((n): n is string => Boolean(n))
  if (nombres.length === 0) return 'Mascota'
  if (nombres.length <= 3) return nombres.join(', ')
  return `${nombres.slice(0, 2).join(', ')} +${nombres.length - 2}`
}

export function BarraNivel({
  nombre,
  nivel,
  estado,
}: {
  nombre: string
  nivel: number
  estado: CategoriaEstadoDespensa
}) {
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-hogar-superficie-suave"
      role="progressbar"
      aria-label={`Nivel observado de ${nombre}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={nivel}
      aria-valuetext={`${nivel} % restante`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${COLOR_BARRA[estado]}`}
        style={{
          width: `${nivel}%`,
          backgroundImage:
            estado === 'alerta'
              ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.28) 4px, rgba(255,255,255,0.28) 8px)'
              : undefined,
        }}
      />
    </div>
  )
}

export function TarjetaInsumo({
  estadoItem,
  mascotas,
  onAjustarNivel,
}: {
  estadoItem: EstadoItemDespensa
  mascotas: Mascota[]
  onAjustarNivel: (itemId: string, nivelPct: number) => Promise<void>
}) {
  const { item, ultimaObservacion, nivelActual, vidaUtilDias, proximaCompraEstimada, diasRestantes, estado } =
    estadoItem
  const metaEstado = INSIGNIA_ESTADO[estado]
  const [valorNivel, setValorNivel] = useState(() => String(nivelActual ?? 50))
  const [guardando, setGuardando] = useState(false)
  const [errorAjuste, setErrorAjuste] = useState('')

  const mascotaLabel = nombreMascotaOCompartido(item, mascotas)
  const tipoLabel = ETIQUETA_TIPO[item.tipo]
  const precioLabel = item.montoHabitual !== null ? ` · Ref. ${formatearPesos(item.montoHabitual)}` : ''
  const diasUi = diasRestantes === null ? null : Math.max(0, diasRestantes)

  async function enviarAjuste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const numero = Number(valorNivel)
    if (!Number.isSafeInteger(numero) || numero < 0 || numero > 100) {
      setErrorAjuste('Ingresa un porcentaje entero entre 0 y 100.')
      return
    }
    setGuardando(true)
    setErrorAjuste('')
    try {
      await onAjustarNivel(item.id, numero)
    } catch (err) {
      setErrorAjuste(err instanceof ErrorMascotas ? err.message : 'No se pudo guardar el ajuste.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <li className="list-none">
      <Tarjeta acento={metaEstado.acento} className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta break-words">
              {item.nombre}
            </h3>
            <p className="m-0 mt-0.5 text-xs text-hogar-tinta-suave break-words">
              {mascotaLabel} · {tipoLabel}
              {precioLabel}
            </p>
          </div>
          <Insignia variante={metaEstado.variante}>{metaEstado.texto}</Insignia>
        </div>

        {nivelActual !== null && ultimaObservacion !== null ? (
          <div className="flex flex-col gap-1.5">
            <BarraNivel nombre={item.nombre} nivel={nivelActual} estado={estado} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-hogar-tinta">
              <span>
                <strong>{nivelActual} % obs.</strong>
                {diasUi !== null ? (
                  <>
                    {' '}
                    · <strong>{diasUi === 0 ? '0 días (revisar)' : `${diasUi} días rest.`}</strong>
                  </>
                ) : null}
              </span>
              {proximaCompraEstimada !== null ? (
                <span className="text-hogar-tinta-suave">
                  Reposición: <strong className="text-hogar-tinta">{formatearFechaCortaEs(proximaCompraEstimada)}</strong>
                </span>
              ) : (
                <span className="text-hogar-tinta-suave">Sin frecuencia estimada</span>
              )}
            </div>
            <p className={claseAyudaCampo}>
              Obs. {formatearFechaCortaEs(ultimaObservacion.fecha)}
              {vidaUtilDias !== null && item.frecuenciaDias !== null
                ? ` · Vida útil: ${vidaUtilDias} días · Frec.: ${item.frecuenciaDias} días · Umbral: ${item.umbralAlertaPct} %`
                : ` · Umbral: ${item.umbralAlertaPct} %`}
            </p>
          </div>
        ) : (
          <p className={claseAyudaCampo}>
            Sin registros aún. Registra una compra o ajusta el nivel observado.
          </p>
        )}

        <Link
          to={`/mascotas/recomprar/${encodeURIComponent(item.id)}`}
          className={`${claseBotonPequenoSecundario} w-full no-underline`}
        >
          {item.montoHabitual !== null
            ? `Recomprar ${formatearPesos(item.montoHabitual)}`
            : 'Recomprar'}
        </Link>

        <details className="hogar-details rounded-2xl border border-hogar-borde bg-hogar-superficie-suave px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-hogar-tinta">
            <span>Ajustar nivel observado</span>
            <span className="hogar-chevron inline-block" aria-hidden="true">▾</span>
          </summary>
          <form className="mt-2.5 flex flex-col gap-2" onSubmit={enviarAjuste} noValidate>
            <div className="flex flex-wrap gap-1.5">
              {[0, 20, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={claseBotonPequenoSecundario}
                  onClick={() => setValorNivel(String(pct))}
                >
                  {pct} %
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`nivel-${item.id}`} className={claseEtiquetaCampo}>
                Nivel observado (% restante, 0–100)
              </label>
              <input
                id={`nivel-${item.id}`}
                type="number"
                min={0}
                max={100}
                className={claseCampoTexto}
                value={valorNivel}
                onChange={(e) => setValorNivel(e.target.value)}
                disabled={guardando}
              />
            </div>
            {errorAjuste ? (
              <Aviso variante="peligro" icono="▲" role="alert">
                <p>{errorAjuste}</p>
              </Aviso>
            ) : null}
            <button
              type="submit"
              className={`${claseBotonPequenoPrimario} w-full`}
              disabled={guardando}
            >
              {guardando ? 'Guardando…' : 'Guardar ajuste de nivel'}
            </button>
          </form>
        </details>
      </Tarjeta>
    </li>
  )
}
