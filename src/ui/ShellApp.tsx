import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { claseBotonIcono } from './ComponentesBase'
import {
  IconoBalance,
  IconoCompra,
  IconoHogar,
  IconoMascotas,
  IconoObligaciones,
} from './Iconos'

const destinosNavegacion = [
  { to: '/compra', etiqueta: 'Compra', Icono: IconoCompra },
  { to: '/obligaciones', etiqueta: 'Obligaciones', Icono: IconoObligaciones },
  { to: '/balance', etiqueta: 'Balance', Icono: IconoBalance },
  { to: '/mascotas', etiqueta: 'Mascotas', Icono: IconoMascotas },
] as const

export function NavegacionInferior() {
  return (
    <nav className="hogar-bottom-nav" aria-label="Navegación principal">
      {destinosNavegacion.map(({ to, etiqueta, Icono }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex min-h-11 min-w-11 max-w-full flex-col items-center justify-center gap-[3px] border-t-[3px] px-1 py-1.5 text-center text-xs break-words no-underline ${
              isActive
                ? 'border-t-hogar-primario bg-hogar-primario-suave font-extrabold text-hogar-primario'
                : 'border-t-transparent font-semibold text-hogar-tinta-suave hover:bg-hogar-superficie-suave hover:text-hogar-tinta'
            }`
          }
        >
          <Icono className="block size-[22px] shrink-0" />
          <span>{etiqueta}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function ShellApp({
  titulo,
  subtitulo,
  accionDerecha,
  volverA,
  etiquetaVolver,
  marcaInicio = false,
  mostrarNavegacion = false,
  compacto = false,
  etiquetaBarraAccion = 'Acción principal de la pantalla',
  barraAccion,
  pie,
  children,
}: {
  titulo: string
  subtitulo?: ReactNode | undefined
  accionDerecha?: ReactNode | undefined
  volverA?: string | undefined
  etiquetaVolver?: string | undefined
  marcaInicio?: boolean | undefined
  mostrarNavegacion?: boolean | undefined
  compacto?: boolean | undefined
  etiquetaBarraAccion?: string | undefined
  barraAccion?: ReactNode | undefined
  pie?: string | undefined
  children: ReactNode
}) {
  const claseEspacioInferior = mostrarNavegacion
    ? compacto
      ? 'hogar-main-compacto'
      : barraAccion
        ? 'hogar-main-con-nav-y-cta'
        : 'hogar-main-con-nav'
    : 'pb-7'

  const claseCabecera = compacto
    ? 'sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-hogar-borde bg-hogar-superficie px-3.5 py-2'
    : 'sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-hogar-borde bg-hogar-superficie px-4 py-3'

  const claseMain = compacto
    ? `flex flex-1 flex-col outline-none ${claseEspacioInferior}`
    : `flex flex-1 flex-col gap-3.5 px-4 pt-3.5 outline-none ${claseEspacioInferior}`

  return (
    <div className="hogar-shell">
      <header className={claseCabecera}>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {volverA ? (
            <Link
              to={volverA}
              className={claseBotonIcono}
              aria-label={etiquetaVolver ?? 'Volver'}
            >
              ←
            </Link>
          ) : marcaInicio ? (
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-hogar-primario text-white"
              aria-hidden="true"
            >
              <IconoHogar className="size-5" />
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-lg font-extrabold tracking-tight text-hogar-tinta break-words">
              {titulo}
            </h1>
            {subtitulo ? (
              <p className="m-0 mt-0.5 text-[0.8125rem] text-hogar-tinta-suave break-words">
                {subtitulo}
              </p>
            ) : null}
          </div>
        </div>

        {accionDerecha ? <div className="shrink-0">{accionDerecha}</div> : null}
      </header>

      <main id="contenido" tabIndex={-1} className={claseMain}>
        {children}
      </main>

      {pie && !mostrarNavegacion ? (
        <footer className="border-t border-hogar-borde bg-hogar-superficie px-4 py-3 text-center text-xs font-medium text-hogar-tinta-suave">
          {pie}
        </footer>
      ) : null}

      {barraAccion ? (
        <div className="hogar-action-bar" role="region" aria-label={etiquetaBarraAccion}>
          {barraAccion}
        </div>
      ) : null}

      {mostrarNavegacion ? <NavegacionInferior /> : null}
    </div>
  )
}
