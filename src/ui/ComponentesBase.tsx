import type { ReactNode } from 'react'

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
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold leading-snug whitespace-normal break-words ${estilosInsignia[variante]} ${className}`.trim()}
    >
      {children}
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
