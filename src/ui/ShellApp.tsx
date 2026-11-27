import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { claseBotonIcono } from './ComponentesBase'
import {
  IconoBalance,
  IconoCompra,
  IconoGastos,
  IconoHogar,
  IconoMascotas,
  IconoObligaciones,
} from './Iconos'

const destinosNavegacion = [
  { to: '/compra', etiqueta: 'Compra', Icono: IconoCompra },
  { to: '/gastos', etiqueta: 'Gastos', Icono: IconoGastos },
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
            `group flex min-h-11 min-w-0 max-w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl px-0.5 py-1 text-center text-[0.625rem] leading-tight no-underline transition-transform duration-150 active:scale-95 ${
              isActive
                ? 'font-extrabold text-hogar-primario'
                : 'font-semibold text-hogar-tinta-suave hover:text-hogar-tinta'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 transition-all duration-200 ${
                  isActive
                    ? 'bg-hogar-primario-suave text-hogar-primario shadow-[inset_0_0_0_1px_rgba(15,92,72,0.14)]'
                    : 'bg-transparent text-current group-hover:bg-hogar-superficie-suave'
                }`}
              >
                <Icono className="block size-5 shrink-0" />
              </span>
              <span className="block w-full truncate">{etiqueta}</span>
            </>
          )}
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
  superposicion,
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
  superposicion?: ReactNode | undefined
  pie?: string | undefined
  children: ReactNode
}) {
  const { pathname } = useLocation()
  const mostrarAccesoPerfil =
    mostrarNavegacion && !volverA && !marcaInicio && pathname !== '/hogar'

  const claseEspacioInferior = mostrarNavegacion
    ? compacto
      ? 'hogar-main-compacto'
      : barraAccion
        ? 'hogar-main-con-nav-y-cta'
        : 'hogar-main-con-nav'
    : barraAccion
      ? 'hogar-main-sin-nav-con-cta'
      : 'pb-7'

  const claseCabecera = compacto ? 'hogar-header hogar-header--compacto' : 'hogar-header'

  const claseMain = compacto
    ? `hogar-main-scroll flex flex-col outline-none ${claseEspacioInferior}`
    : `hogar-main-scroll flex flex-col gap-3.5 px-4 pt-3.5 outline-none ${claseEspacioInferior}`

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
            <img
              src="/icons/icon-192.png"
              alt=""
              aria-hidden="true"
              className="size-10 shrink-0 rounded-2xl object-cover shadow-[0_4px_10px_-3px_rgba(16,24,20,0.22)]"
            />
          ) : mostrarAccesoPerfil ? (
            <Link
              to="/hogar"
              className={claseBotonIcono}
              aria-label="Mi perfil, hogar y cerrar sesión"
              title="Mi perfil y hogar"
            >
              <IconoHogar className="size-5 text-hogar-primario" />
            </Link>
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

      <main
        id="contenido"
        key={pathname}
        tabIndex={-1}
        className={`${claseMain} hogar-pantalla-enter`}
      >
        {children}
      </main>

      {pie && !mostrarNavegacion ? (
        <footer className="shrink-0 border-t border-hogar-borde bg-hogar-superficie/90 px-4 py-3 text-center text-xs font-medium text-hogar-tinta-suave">
          {pie}
        </footer>
      ) : null}

      {barraAccion ? (
        <div
          className={`hogar-action-bar ${mostrarNavegacion ? '' : 'hogar-action-bar--fondo'}`.trim()}
          role="region"
          aria-label={etiquetaBarraAccion}
        >
          {barraAccion}
        </div>
      ) : null}

      {mostrarNavegacion ? <NavegacionInferior /> : null}
      {superposicion ?? null}
    </div>
  )
}
