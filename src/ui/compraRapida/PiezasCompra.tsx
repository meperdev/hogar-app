import type { Ref } from 'react'
import { Link } from 'react-router-dom'
import {
  CHIPS_CUOTAS,
  type Ambito,
  type CategoriaOpcion,
  type MedioOpcion,
} from '../../app/compraRapida'
import { claseBotonSecundario } from '../ComponentesBase'
import {
  COMERCIOS_RAPIDOS,
  IconoCategoria,
  IconoCheckSvg,
  identidadMedio,
  type ComercioRapido,
} from '../marcas'

export function SelectorAmbito({
  ambito,
  onCambiar,
  ariaLabel = 'Ámbito de la compra: Hogar o Personal',
}: {
  ambito: Ambito
  onCambiar: (siguiente: Ambito) => void
  ariaLabel?: string | undefined
}) {
  const base =
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border-[1.5px] px-2.5 py-1.5 text-sm font-bold cursor-pointer transition-colors'
  const activo = 'border-hogar-primario bg-hogar-primario text-white'
  const inactivo = 'border-transparent bg-transparent text-hogar-tinta hover:bg-hogar-superficie'
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie-suave p-[3px]"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={`${base} ${ambito === 'hogar' ? activo : inactivo}`}
        aria-pressed={ambito === 'hogar'}
        onClick={() => onCambiar('hogar')}
      >
        {ambito === 'hogar' ? '✓ Hogar' : 'Hogar'}
      </button>
      <button
        type="button"
        className={`${base} ${ambito === 'personal' ? activo : inactivo}`}
        aria-pressed={ambito === 'personal'}
        onClick={() => onCambiar('personal')}
      >
        {ambito === 'personal' ? '✓ Personal (solo yo)' : 'Personal (solo yo)'}
      </button>
    </div>
  )
}

export function GrillaCategorias({
  categorias,
  seleccionadaId,
  onElegir,
  primerChipRef,
  invalida = false,
  ariaLabel = 'Categorías frecuentes',
}: {
  categorias: CategoriaOpcion[]
  seleccionadaId: string | null
  onElegir: (id: string) => void
  primerChipRef?: Ref<HTMLButtonElement> | undefined
  invalida?: boolean | undefined
  ariaLabel?: string | undefined
}) {
  return (
    <div
      className={`grid grid-cols-3 gap-1.5 ${invalida ? 'rounded-xl p-1 ring-2 ring-hogar-peligro' : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {categorias.map((cat, idx) => {
        const activa = seleccionadaId === cat.id
        return (
          <button
            key={cat.id}
            ref={idx === 0 ? primerChipRef : undefined}
            type="button"
            className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border-[1.5px] px-2 py-2 text-center text-[0.8125rem] font-semibold leading-tight break-words transition-colors ${
              activa
                ? 'border-hogar-primario bg-hogar-primario text-white shadow-xs'
                : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
            }`}
            aria-pressed={activa}
            onClick={() => onElegir(cat.id)}
          >
            <IconoCategoria nombre={cat.nombre} icono={cat.icono} />
            <span>{activa ? `✓ ${cat.nombre}` : cat.nombre}</span>
          </button>
        )
      })}
    </div>
  )
}

export function CarruselMedios({
  medios,
  seleccionadoId,
  primerMedioRef,
  invalido = false,
  onElegir,
}: {
  medios: MedioOpcion[]
  seleccionadoId: string | null
  primerMedioRef?: Ref<HTMLButtonElement> | undefined
  invalido?: boolean | undefined
  onElegir: (id: string) => void
}) {
  return (
    <div
      className={`hogar-carrusel ${invalido ? 'rounded-2xl ring-2 ring-hogar-peligro' : ''}`}
      role="group"
      aria-label="Elegir medio de pago"
    >
      {medios.map((m, idx) => {
        const activo = m.id === seleccionadoId
        const tipoVisual =
          m.tipo === 'tarjeta' ? 'tarjeta' : m.tipo === 'prestamo' ? 'prestamo' : 'medio'
        const identidad = identidadMedio(m.nombre, tipoVisual)
        const { Logo } = identidad
        return (
          <button
            key={m.id}
            ref={idx === 0 ? primerMedioRef : undefined}
            type="button"
            className={`flex min-h-[76px] min-w-[144px] max-w-[164px] shrink-0 snap-start cursor-pointer flex-col justify-between gap-2.5 rounded-2xl border-2 p-3 text-left transition-transform active:scale-[0.98] ${
              activo ? 'shadow-md' : 'opacity-85 hover:opacity-100'
            }`}
            style={{
              backgroundColor: identidad.fondo,
              color: identidad.texto,
              borderColor: activo ? identidad.bordeActivo : 'transparent',
            }}
            aria-pressed={activo}
            onClick={() => onElegir(m.id)}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <Logo className="size-6 shrink-0" />
              {activo ? (
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-hogar-tinta"
                  aria-hidden="true"
                >
                  <IconoCheckSvg className="size-3.5" />
                </span>
              ) : null}
            </div>
            <span className="block w-full truncate text-[0.8125rem] font-extrabold leading-tight">
              {m.nombre}
            </span>
          </button>
        )
      })}
      <Link
        to="/hogar#medios-de-pago"
        className="flex min-h-[76px] min-w-[84px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-hogar-borde-fuerte bg-hogar-superficie px-3 py-2 text-center text-xs font-bold text-hogar-tinta-suave no-underline hover:bg-hogar-superficie-suave"
        aria-label="Agregar o gestionar medios de pago"
      >
        <svg
          className="size-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Nuevo</span>
      </Link>
    </div>
  )
}

export function CarruselComercios({
  descripcionActual,
  onElegir,
}: {
  descripcionActual: string
  onElegir: (comercio: ComercioRapido) => void
}) {
  const actual = descripcionActual.trim().toLowerCase()
  return (
    <div className="hogar-carrusel" role="group" aria-label="Comercios frecuentes">
      {COMERCIOS_RAPIDOS.map((c) => {
        const activo = actual === c.nombre.toLowerCase()
        const { Logo } = c
        return (
          <button
            key={c.id}
            type="button"
            className={`inline-flex min-h-11 shrink-0 snap-start cursor-pointer items-center gap-2 rounded-full border-2 px-3.5 py-2 text-[0.8125rem] font-bold transition-transform active:scale-[0.97] ${
              activo ? 'shadow-sm ring-2 ring-hogar-primario ring-offset-1' : 'border-transparent'
            }`}
            style={{
              backgroundColor: c.fondo,
              color: c.texto,
              borderColor: activo ? '#ffffff' : 'transparent',
            }}
            aria-pressed={activo}
            onClick={() => onElegir(c)}
          >
            <Logo className="size-4 shrink-0" />
            <span>{c.nombre}</span>
            {activo ? <IconoCheckSvg className="size-3.5 shrink-0" /> : null}
          </button>
        )
      })}
    </div>
  )
}

export function ChipsCuotas({
  cuotas,
  onElegir,
  ariaLabel,
  variante = 'primario',
}: {
  cuotas: number
  onElegir: (n: number, esOtro: boolean) => void
  ariaLabel: string
  variante?: 'primario' | 'indigo' | undefined
}) {
  const claseActivo =
    variante === 'indigo'
      ? 'border-hogar-indigo bg-hogar-indigo text-white'
      : 'border-hogar-primario bg-hogar-primario text-white'
  const claseInactivo =
    'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
  const esOtro = cuotas > 1 && !(CHIPS_CUOTAS as readonly number[]).includes(cuotas)

  return (
    <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={ariaLabel}>
      {CHIPS_CUOTAS.map((n) => {
        const activo = cuotas === n
        return (
          <button
            key={n}
            type="button"
            className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-1 py-2 text-[0.8125rem] font-semibold ${activo ? claseActivo : claseInactivo}`}
            aria-pressed={activo}
            aria-label={n === 1 ? '1 cuota' : `${n} cuotas`}
            onClick={() => onElegir(n, false)}
          >
            {activo ? `✓ ${n}` : n}
          </button>
        )
      })}
      <button
        type="button"
        className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-1 py-2 text-[0.8125rem] font-semibold ${esOtro ? 'border-hogar-indigo bg-hogar-indigo text-white' : claseInactivo}`}
        aria-pressed={esOtro}
        aria-label="Otro número de cuotas"
        onClick={() => onElegir(Math.max(2, cuotas), true)}
      >
        Otro
      </button>
    </div>
  )
}

export function EnlaceDian({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <a
      className={`${claseBotonSecundario} w-full no-underline`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      Verificar en la DIAN (opcional) ↗
    </a>
  )
}
