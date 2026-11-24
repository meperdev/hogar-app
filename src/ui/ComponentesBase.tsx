import type { ReactNode } from 'react'

const botonBase =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-center text-[0.9375rem] font-bold leading-tight whitespace-normal break-words transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'

export const claseBotonPrimario = `${botonBase} border-transparent bg-hogar-primario text-white hover:bg-hogar-primario-fuerte`

export const claseBotonIndigo = `${botonBase} border-transparent bg-hogar-indigo text-white hover:opacity-95`

export const claseBotonSecundario = `${botonBase} border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave`

export const claseBotonPequenoPrimario =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-1.5 rounded-xl border-2 border-transparent bg-hogar-primario px-3 py-2 text-center text-sm font-bold leading-tight text-white whitespace-normal break-words hover:bg-hogar-primario-fuerte cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'

export const claseBotonPequenoSecundario =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-1.5 rounded-xl border-2 border-hogar-borde-fuerte bg-hogar-superficie px-3 py-2 text-center text-sm font-bold leading-tight text-hogar-tinta whitespace-normal break-words hover:bg-hogar-superficie-suave cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'

export const claseBotonIcono =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-hogar-borde-fuerte bg-hogar-superficie p-2 font-bold text-hogar-tinta no-underline hover:bg-hogar-superficie-suave cursor-pointer'

export const claseCampoTexto =
  'min-h-[46px] w-full min-w-0 max-w-full rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie px-3 py-2.5 text-base text-hogar-tinta placeholder:text-hogar-tinta-suave disabled:bg-hogar-superficie-suave disabled:opacity-70'

export const claseEtiquetaCampo = 'text-sm font-bold text-hogar-tinta break-words'

export const claseAyudaCampo = 'm-0 text-[0.8125rem] text-hogar-tinta-suave break-words'

export type VarianteInsignia = 'primario' | 'indigo' | 'ambar' | 'peligro' | 'neutral'

const estilosInsignia: Record<VarianteInsignia, string> = {
  primario: 'border-hogar-primario bg-hogar-primario-suave text-hogar-primario',
  indigo: 'border-hogar-indigo bg-hogar-indigo-suave text-hogar-indigo',
  ambar: 'border-hogar-ambar bg-hogar-ambar-suave text-hogar-ambar',
  peligro: 'border-hogar-peligro bg-hogar-peligro-suave text-hogar-peligro',
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
  primario: 'border-hogar-primario bg-hogar-primario-suave text-hogar-tinta',
  indigo: 'border-hogar-indigo bg-hogar-indigo-suave text-hogar-tinta',
  ambar: 'border-hogar-ambar bg-hogar-ambar-suave text-hogar-tinta',
  peligro: 'border-hogar-peligro bg-hogar-peligro-suave text-hogar-tinta',
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
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${estilosAviso[variante]} ${className}`.trim()}
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
  ninguno: '',
  primario: 'border-l-4 border-l-hogar-primario',
  indigo: 'border-l-4 border-l-hogar-indigo',
  ambar: 'border-l-4 border-l-hogar-ambar',
  peligro: 'border-l-4 border-l-hogar-peligro',
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
      className={`min-w-0 max-w-full rounded-2xl border border-hogar-borde p-3.5 ${fondo} ${estilosAcento[acento]} ${className}`.trim()}
    >
      {children}
    </div>
  )
}
