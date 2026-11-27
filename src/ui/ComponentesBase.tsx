import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { formatearPesos } from '../domain/pesos'
import { parsearDigitosCop } from './compraRapida/formatoCop'
import { desplazarPeriodo, formatearPeriodoEs } from './periodos'

const botonBase =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-center text-[0.9375rem] font-bold leading-tight whitespace-normal break-words transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'

export const claseBotonPrimario = `${botonBase} border-transparent bg-gradient-to-b from-[#136e56] to-[#0c4e3d] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_12px_-3px_rgba(15,92,72,0.38)] hover:brightness-105`

export const claseBotonIndigo = `${botonBase} border-transparent bg-gradient-to-b from-[#3650a0] to-[#263a78] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_12px_-3px_rgba(45,67,135,0.35)] hover:brightness-105`

export const claseBotonSecundario = `${botonBase} border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta shadow-[0_1px_2px_rgba(16,24,20,0.05)] hover:bg-hogar-superficie-suave`

export const claseBotonPequenoPrimario =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-1.5 rounded-xl border border-transparent bg-gradient-to-b from-[#136e56] to-[#0c4e3d] px-3.5 py-2 text-center text-sm font-bold leading-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_8px_-2px_rgba(15,92,72,0.34)] whitespace-normal break-words transition-all duration-150 active:scale-[0.97] hover:brightness-105 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'

export const claseBotonPequenoSecundario =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-1.5 rounded-xl border border-hogar-borde-fuerte bg-hogar-superficie px-3.5 py-2 text-center text-sm font-bold leading-tight text-hogar-tinta shadow-[0_1px_2px_rgba(16,24,20,0.05)] whitespace-normal break-words transition-all duration-150 active:scale-[0.97] hover:bg-hogar-superficie-suave cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'

export const claseBotonIcono =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-2xl border border-hogar-borde bg-hogar-superficie/90 p-2 font-bold text-hogar-tinta shadow-[0_1px_2px_rgba(16,24,20,0.05)] no-underline transition-all duration-150 active:scale-95 hover:bg-hogar-superficie cursor-pointer'

export const claseCampoTexto =
  'min-h-[46px] w-full min-w-0 max-w-full rounded-xl border border-hogar-borde-fuerte bg-hogar-superficie px-3.5 py-2.5 text-base text-hogar-tinta shadow-[inset_0_1px_2px_rgba(16,24,20,0.03)] transition-all placeholder:text-hogar-tinta-suave focus:border-hogar-primario focus:ring-2 focus:ring-hogar-primario/15 disabled:bg-hogar-superficie-suave disabled:opacity-70'

export const claseEtiquetaCampo = 'text-sm font-bold text-hogar-tinta break-words'

export const claseAyudaCampo = 'm-0 text-[0.8125rem] text-hogar-tinta-suave break-words'

export type VarianteInsignia = 'primario' | 'indigo' | 'ambar' | 'peligro' | 'neutral'

const estilosInsignia: Record<VarianteInsignia, string> = {
  primario: 'border-hogar-primario/20 bg-hogar-primario-suave text-hogar-primario',
  indigo: 'border-hogar-indigo/20 bg-hogar-indigo-suave text-hogar-indigo',
  ambar: 'border-hogar-ambar/25 bg-hogar-ambar-suave text-hogar-ambar',
  peligro: 'border-hogar-peligro/20 bg-hogar-peligro-suave text-hogar-peligro',
  neutral: 'border-hogar-borde-fuerte bg-hogar-superficie-suave text-hogar-tinta',
}

export function Insignia({
  variante = 'neutral',
  children,
  className = '',
}: {
  variante?: VarianteInsignia | undefined
  children: ReactNode
  className?: string | undefined
}) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-bold leading-snug whitespace-normal break-words ${estilosInsignia[variante]} ${className}`.trim()}
    >
      {children}
    </span>
  )
}

export function AyudaInfo({
  texto,
  etiqueta = 'Más información',
  alinear: _alinear,
  className = '',
}: {
  texto: string
  etiqueta?: string | undefined
  alinear?: 'izquierda' | 'derecha' | undefined
  className?: string | undefined
}) {
  const [abierto, setAbierto] = useState(false)
  const [posicion, setPosicion] = useState<{
    top: number
    left: number
    width: number
    arrowLeft: number
    arriba: boolean
  } | null>(null)
  const botonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!abierto) {
      setPosicion(null)
      return
    }
    function calcular() {
      const boton = botonRef.current
      if (!boton) return
      const vw = window.innerWidth || 390
      const vh = window.innerHeight || 844
      const margen = 12
      const ancho = Math.min(264, Math.max(160, vw - margen * 2))
      const rect = boton.getBoundingClientRect()
      const centroBoton = rect.left + rect.width / 2
      const left = Math.max(margen, Math.min(centroBoton - ancho / 2, vw - ancho - margen))
      const alto = popoverRef.current?.offsetHeight || 96
      const cabeAbajo = rect.bottom + 8 + alto <= vh - margen
      const cabeArriba = rect.top - 8 - alto >= margen
      const arriba = !cabeAbajo && cabeArriba
      const top = arriba
        ? rect.top - 8 - alto
        : Math.max(margen, Math.min(rect.bottom + 8, vh - alto - margen))
      const arrowLeft = Math.max(14, Math.min(centroBoton - left, ancho - 14))
      setPosicion({ top, left, width: ancho, arrowLeft, arriba })
    }
    calcular()
    window.addEventListener('resize', calcular)
    return () => window.removeEventListener('resize', calcular)
  }, [abierto, texto])

  useEffect(() => {
    if (!abierto) return
    function cerrarSiFuera(evento: PointerEvent) {
      const objetivo = evento.target as Node
      if (botonRef.current?.contains(objetivo) || popoverRef.current?.contains(objetivo)) return
      setAbierto(false)
    }
    function cerrarConEscape(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false)
    }
    function cerrarAlDesplazar() {
      setAbierto(false)
    }
    document.addEventListener('pointerdown', cerrarSiFuera)
    document.addEventListener('keydown', cerrarConEscape)
    window.addEventListener('scroll', cerrarAlDesplazar, true)
    return () => {
      document.removeEventListener('pointerdown', cerrarSiFuera)
      document.removeEventListener('keydown', cerrarConEscape)
      window.removeEventListener('scroll', cerrarAlDesplazar, true)
    }
  }, [abierto])

  const popover =
    abierto && typeof document !== 'undefined'
      ? createPortal(
          <span
            ref={popoverRef}
            role="note"
            style={{
              position: 'fixed',
              top: posicion?.top ?? -9999,
              left: posicion?.left ?? 12,
              width: posicion?.width ?? 264,
              visibility: posicion ? 'visible' : 'hidden',
            }}
            className="z-[70] rounded-xl border border-hogar-borde-fuerte bg-hogar-superficie p-2.5 text-left text-xs font-normal leading-relaxed text-hogar-tinta shadow-[var(--hogar-shadow-elevated)]"
          >
            {posicion ? (
              <span
                aria-hidden="true"
                style={{ left: posicion.arrowLeft - 5 }}
                className={`absolute size-2.5 rotate-45 border-hogar-borde-fuerte bg-hogar-superficie ${
                  posicion.arriba
                    ? '-bottom-[6px] border-r border-b'
                    : '-top-[6px] border-t border-l'
                }`}
              />
            ) : null}
            {texto}
          </span>,
          document.body,
        )
      : null

  return (
    <span className={`relative inline-flex items-center ${className}`.trim()}>
      <button
        ref={botonRef}
        type="button"
        aria-label={etiqueta}
        aria-expanded={abierto}
        onClick={(evento) => {
          evento.stopPropagation()
          setAbierto((actual) => !actual)
        }}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-hogar-borde-fuerte bg-hogar-superficie-suave text-[0.7rem] font-extrabold text-hogar-tinta-suave transition-colors hover:border-hogar-primario hover:text-hogar-primario"
      >
        <span aria-hidden="true">i</span>
      </button>
      {popover}
    </span>
  )
}

export type VarianteAviso = 'primario' | 'indigo' | 'ambar' | 'peligro'

const estilosAviso: Record<VarianteAviso, string> = {
  primario: 'border-hogar-primario/25 bg-hogar-primario-suave text-hogar-tinta',
  indigo: 'border-hogar-indigo/25 bg-hogar-indigo-suave text-hogar-tinta',
  ambar: 'border-hogar-ambar/25 bg-hogar-ambar-suave text-hogar-tinta',
  peligro: 'border-hogar-peligro/25 bg-hogar-peligro-suave text-hogar-tinta',
}

export function Aviso({
  variante = 'indigo',
  icono,
  role,
  children,
  className = '',
}: {
  variante?: VarianteAviso | undefined
  icono: string
  role?: 'alert' | 'status' | undefined
  children: ReactNode
  className?: string | undefined
}) {
  return (
    <div
      role={role}
      className={`hogar-toast flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-sm shadow-[0_1px_2px_rgba(16,24,20,0.04)] ${estilosAviso[variante]} ${className}`.trim()}
    >
      <span className="shrink-0 font-extrabold leading-snug" aria-hidden="true">
        {icono}
      </span>
      <div className="min-w-0 flex-1 space-y-1 break-words">{children}</div>
    </div>
  )
}

export function CampoMontoCop({
  valor,
  onCambiar,
  id,
  placeholder = '$0',
  className = '',
  inputRef,
  disabled = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  valor: number | null
  onCambiar: (monto: number) => void
  id?: string | undefined
  placeholder?: string | undefined
  className?: string | undefined
  inputRef?: Ref<HTMLInputElement> | undefined
  disabled?: boolean | undefined
  'aria-label'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: 'true' | undefined
}) {
  return (
    <input
      ref={inputRef}
      id={id}
      className={`${claseCampoTexto} hogar-cop ${className}`.trim()}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      value={valor && valor > 0 ? formatearPesos(valor) : ''}
      onChange={(e) => onCambiar(parsearDigitosCop(e.target.value))}
    />
  )
}

export function TarjetaRadio({
  id,
  name,
  value,
  checked,
  disabled = false,
  onChange,
  children,
}: {
  id: string
  name: string
  value: string
  checked: boolean
  disabled?: boolean | undefined
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label
      htmlFor={id}
      className={`relative flex min-h-[46px] min-w-11 items-center gap-2 rounded-xl border-[1.5px] px-3 py-2.5 text-sm font-semibold transition-colors ${
        disabled
          ? 'cursor-not-allowed border-hogar-borde bg-hogar-superficie-suave text-hogar-tinta-suave opacity-65'
          : checked
            ? 'cursor-pointer border-hogar-primario bg-hogar-primario-suave text-hogar-tinta'
            : 'cursor-pointer border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
      }`}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="m-0 size-[18px] shrink-0 accent-hogar-primario"
      />
      <span className="min-w-0 break-words leading-tight">{children}</span>
    </label>
  )
}

export function TarjetaSeleccion({
  id,
  checked,
  disabled = false,
  onChange,
  children,
}: {
  id: string
  checked: boolean
  disabled?: boolean | undefined
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <label
      htmlFor={id}
      className={`relative flex min-h-11 min-w-11 items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-sm font-bold transition-colors ${
        disabled
          ? 'cursor-not-allowed border-hogar-borde bg-hogar-superficie-suave text-hogar-tinta-suave opacity-65'
          : checked
            ? 'cursor-pointer border-hogar-primario bg-hogar-primario-suave text-hogar-primario-fuerte'
            : 'cursor-pointer border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="m-0 size-[18px] shrink-0 accent-hogar-primario"
      />
      <span className="min-w-0 break-words leading-tight">{children}</span>
    </label>
  )
}

export function FilaSwitchPersonal({
  id,
  checked,
  disabled = false,
  onChange,
  etiqueta = 'Incluir mis gastos personales',
  ayuda,
  etiquetaAyuda = 'Información sobre gastos personales',
}: {
  id: string
  checked: boolean
  disabled?: boolean | undefined
  onChange: (valor: boolean) => void
  etiqueta?: string | undefined
  ayuda?: string | undefined
  etiquetaAyuda?: string | undefined
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-hogar-borde/80 bg-hogar-fondo/45 px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <label
          htmlFor={id}
          className="cursor-pointer text-xs font-bold text-hogar-tinta-suave"
        >
          {etiqueta}
        </label>
        {ayuda ? <AyudaInfo etiqueta={etiquetaAyuda} texto={ayuda} /> : null}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="hogar-switch hogar-switch--sm"
      />
    </div>
  )
}

export function SelectorMes({
  periodo,
  onCambiar,
  ariaLabel = 'Cambiar mes calendario',
  subtitulo,
  pie,
}: {
  periodo: string
  onCambiar: (siguiente: string) => void
  ariaLabel?: string | undefined
  subtitulo?: ReactNode | undefined
  pie?: ReactNode | undefined
}) {
  return (
    <div className="shrink-0 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie shadow-[var(--hogar-shadow-card)]">
      <div className="flex items-center justify-between gap-2 p-1.5" role="group" aria-label={ariaLabel}>
        <button
          type="button"
          className={claseBotonIcono}
          aria-label="Mes anterior"
          onClick={() => onCambiar(desplazarPeriodo(periodo, -1))}
        >
          ‹
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-center">
          <span className="text-[0.9375rem] font-extrabold leading-tight text-hogar-tinta">
            {formatearPeriodoEs(periodo)}
          </span>
          {subtitulo ?? null}
        </div>
        <button
          type="button"
          className={claseBotonIcono}
          aria-label="Mes siguiente"
          onClick={() => onCambiar(desplazarPeriodo(periodo, 1))}
        >
          ›
        </button>
      </div>
      {pie ?? null}
    </div>
  )
}

export type AcentoTarjeta = 'ninguno' | 'primario' | 'indigo' | 'ambar' | 'peligro'

const estilosAcento: Record<AcentoTarjeta, string> = {
  ninguno: 'border-hogar-borde',
  primario: 'border-hogar-primario/22',
  indigo: 'border-hogar-indigo/22',
  ambar: 'border-hogar-ambar/28',
  peligro: 'border-hogar-peligro/28',
}

export function Tarjeta({
  acento = 'ninguno',
  suave = false,
  className = '',
  children,
}: {
  acento?: AcentoTarjeta | undefined
  suave?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}) {
  const fondo = suave ? 'bg-hogar-superficie-suave' : 'bg-hogar-superficie'
  return (
    <div
      className={`min-w-0 max-w-full rounded-2xl border p-4 shadow-[var(--hogar-shadow-card)] transition-shadow ${fondo} ${estilosAcento[acento]} ${className}`.trim()}
    >
      {children}
    </div>
  )
}
