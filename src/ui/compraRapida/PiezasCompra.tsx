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
  MotivoTarjetaSvg,
  identidadMedio,
  type ComercioRapido,
} from '../marcas'

function vibrarSuave(ms = 6) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms)
  }
}

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
    'relative z-10 inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-1 overflow-hidden rounded-[12px] border-0 bg-transparent px-1.5 py-1.5 text-[0.8125rem] font-bold leading-tight cursor-pointer transition-colors duration-200'
  return (
    <div
      className="relative grid grid-cols-2 rounded-2xl bg-[#e3e7e2] p-1 shadow-[inset_0_1px_2px_rgba(16,24,20,0.08)]"
      role="group"
      aria-label={ariaLabel}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-[12px] shadow-[0_2px_8px_rgba(16,24,20,0.2)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          ambito === 'hogar'
            ? 'translate-x-0 bg-gradient-to-b from-[#136e56] to-[#0c4e3d]'
            : 'translate-x-full bg-gradient-to-b from-[#3650a0] to-[#263a78]'
        }`}
      />
      <button
        type="button"
        className={`${base} ${ambito === 'hogar' ? 'text-white' : 'text-hogar-tinta hover:text-hogar-primario'}`}
        aria-pressed={ambito === 'hogar'}
        onClick={() => {
          vibrarSuave()
          onCambiar('hogar')
        }}
      >
        <span className="block w-full truncate">{ambito === 'hogar' ? '✓ Hogar' : 'Hogar'}</span>
      </button>
      <button
        type="button"
        className={`${base} ${ambito === 'personal' ? 'text-white' : 'text-hogar-tinta hover:text-hogar-indigo'}`}
        aria-pressed={ambito === 'personal'}
        onClick={() => {
          vibrarSuave()
          onCambiar('personal')
        }}
      >
        <span className="block w-full truncate">
          {ambito === 'personal' ? '✓ Personal (solo yo)' : 'Personal (solo yo)'}
        </span>
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
      className={`grid grid-cols-3 gap-1.5 ${invalida ? 'rounded-2xl p-1 ring-2 ring-hogar-peligro' : ''}`}
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
            className={`flex min-h-[64px] w-full min-w-0 max-w-full cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border px-1.5 py-2 text-center transition-all duration-150 active:scale-[0.96] ${
              activa
                ? 'border-transparent bg-gradient-to-b from-[#136e56] to-[#0c4e3d] text-white shadow-[0_4px_10px_-3px_rgba(15,92,72,0.38)]'
                : 'border-hogar-borde bg-hogar-superficie text-hogar-tinta shadow-[0_1px_2px_rgba(16,24,20,0.04)] hover:bg-hogar-superficie-suave'
            }`}
            aria-pressed={activa}
            onClick={() => {
              vibrarSuave()
              onElegir(cat.id)
            }}
          >
            <IconoCategoria
              nombre={cat.nombre}
              icono={cat.icono}
              className={`size-[18px] shrink-0 ${activa ? 'text-[#9be8d0]' : 'text-hogar-tinta-suave'}`}
            />
            <span className="block w-full min-w-0 text-[0.72rem] font-bold leading-[1.15] tracking-[-0.01em] break-words [overflow-wrap:anywhere] line-clamp-2">
              {activa ? `✓ ${cat.nombre}` : cat.nombre}
            </span>
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
            className={`hogar-card-medio flex min-h-[86px] min-w-[152px] max-w-[168px] shrink-0 snap-start cursor-pointer flex-col justify-between gap-2.5 overflow-hidden rounded-[20px] border-0 p-3.5 text-left active:scale-[0.97] ${
              activo
                ? 'hogar-card-medio--activa -translate-y-0.5 opacity-100'
                : 'opacity-85 hover:opacity-100'
            }`}
            style={{
              background: identidad.gradiente,
              color: identidad.texto,
              boxShadow: activo
                ? identidad.sombra
                : '0 2px 8px -2px rgba(16, 24, 20, 0.16)',
            }}
            aria-pressed={activo}
            onClick={() => {
              vibrarSuave()
              onElegir(m.id)
            }}
          >
            <span
              className="pointer-events-none absolute -top-6 -right-6 size-20 rounded-full"
              style={{
                background: `radial-gradient(circle, ${identidad.brillo} 0%, transparent 70%)`,
              }}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute -right-1 -bottom-1 text-white"
              aria-hidden="true"
            >
              <MotivoTarjetaSvg className="size-12" />
            </span>
            <div className="relative z-10 flex w-full items-center justify-between gap-2">
              <Logo className="size-6 shrink-0" />
              {activo ? (
                <span
                  className="hogar-pop inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-hogar-tinta shadow-xs"
                  aria-hidden="true"
                >
                  <IconoCheckSvg className="size-3.5" />
                </span>
              ) : null}
            </div>
            <span className="relative z-10 block w-full truncate text-[0.8125rem] font-extrabold leading-tight tracking-tight">
              {m.nombre}
            </span>
          </button>
        )
      })}
      <Link
        to="/hogar#medios-de-pago"
        className="flex min-h-[86px] min-w-[88px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-[20px] border-[1.5px] border-dashed border-hogar-borde-fuerte bg-hogar-superficie/80 px-3 py-2 text-center text-xs font-bold text-hogar-tinta-suave no-underline transition-all duration-150 hover:bg-hogar-superficie active:scale-[0.97]"
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
            className={`inline-flex min-h-11 max-w-[180px] shrink-0 snap-start cursor-pointer items-center gap-2 overflow-hidden whitespace-nowrap rounded-full border-2 px-3.5 py-2 text-[0.8125rem] font-bold transition-all duration-150 active:scale-[0.95] ${
              activo ? '-translate-y-0.5 ring-2 ring-hogar-primario ring-offset-1' : 'opacity-95 hover:opacity-100'
            }`}
            style={{
              backgroundColor: c.fondo,
              color: c.texto,
              borderColor: activo ? '#ffffff' : 'transparent',
              boxShadow: activo ? c.sombra : '0 2px 6px -2px rgba(16, 24, 20, 0.14)',
            }}
            aria-pressed={activo}
            onClick={() => {
              vibrarSuave()
              onElegir(c)
            }}
          >
            <Logo className="size-4 shrink-0" />
            <span className="truncate">{c.nombre}</span>
            {activo ? <IconoCheckSvg className="hogar-pop size-3.5 shrink-0" /> : null}
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
      ? 'border-transparent bg-gradient-to-b from-[#3650a0] to-[#263a78] text-white shadow-[0_3px_8px_-2px_rgba(45,67,135,0.4)]'
      : 'border-transparent bg-gradient-to-b from-[#136e56] to-[#0c4e3d] text-white shadow-[0_3px_8px_-2px_rgba(15,92,72,0.4)]'
  const claseInactivo =
    'border-hogar-borde bg-hogar-superficie text-hogar-tinta shadow-[0_1px_2px_rgba(16,24,20,0.04)] hover:bg-hogar-superficie-suave'
  const esOtro = cuotas > 1 && !(CHIPS_CUOTAS as readonly number[]).includes(cuotas)

  return (
    <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={ariaLabel}>
      {CHIPS_CUOTAS.map((n) => {
        const activo = cuotas === n
        return (
          <button
            key={n}
            type="button"
            className={`inline-flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border px-1 py-2 text-[0.8125rem] font-semibold transition-all duration-150 active:scale-[0.96] ${activo ? claseActivo : claseInactivo}`}
            aria-pressed={activo}
            aria-label={n === 1 ? '1 cuota' : `${n} cuotas`}
            onClick={() => {
              vibrarSuave()
              onElegir(n, false)
            }}
          >
            {activo ? `✓ ${n}` : n}
          </button>
        )
      })}
      <button
        type="button"
        className={`inline-flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border px-1 py-2 text-[0.8125rem] font-semibold transition-all duration-150 active:scale-[0.96] ${
          esOtro
            ? 'border-transparent bg-gradient-to-b from-[#3650a0] to-[#263a78] text-white shadow-[0_3px_8px_-2px_rgba(45,67,135,0.4)]'
            : claseInactivo
        }`}
        aria-pressed={esOtro}
        aria-label="Otro número de cuotas"
        onClick={() => {
          vibrarSuave()
          onElegir(Math.max(2, cuotas), true)
        }}
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
