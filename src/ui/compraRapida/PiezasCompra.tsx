import type { Ref } from 'react'
import { CHIPS_CUOTAS, type Ambito, type CategoriaOpcion } from '../../app/compraRapida'
import { claseBotonSecundario } from '../ComponentesBase'

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
            className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-2 py-2 text-center text-sm font-semibold leading-tight break-words transition-colors ${
              activa
                ? 'border-hogar-primario bg-hogar-primario text-white'
                : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
            }`}
            aria-pressed={activa}
            onClick={() => onElegir(cat.id)}
          >
            {activa ? `✓ ${cat.nombre}` : cat.nombre}
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
