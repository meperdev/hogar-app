import { Link } from 'react-router-dom'
import type { Hogar } from '../app/fundacion'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseBotonSecundario,
} from './ComponentesBase'
import { ShellApp } from './ShellApp'

export function PantallaCompraVacia({ hogar }: { hogar: Hogar }) {
  return (
    <ShellApp
      titulo="Compra rápida"
      subtitulo={`${hogar.miembroActual.nombre} · ${hogar.nombre}`}
      accionDerecha={
        <Link to="/hogar" className={`${claseBotonPequenoSecundario} no-underline`}>
          Mi hogar
        </Link>
      }
      mostrarNavegacion
      barraAccion={
        <Link to="/hogar" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>
          Volver a {hogar.nombre}
        </Link>
      }
    >
      <Tarjeta acento="primario">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Núcleo 1 · Próximo paso
          </h2>
          <Insignia variante="neutral">◷ En preparación</Insignia>
        </div>
        <p className="m-0 text-sm text-hogar-tinta-suave">
          Aquí vas a registrar compras en pocos toques con selector{' '}
          <strong className="text-hogar-tinta">Hogar | Personal</strong>, teclado numérico COP
          con <strong className="text-hogar-tinta">000</strong>, cuotas y lectura local de QR
          DIAN.
        </p>
      </Tarjeta>

      <Aviso variante="indigo" icono="ℹ">
        <p>
          <strong className="text-hogar-tinta">Sin doble conteo:</strong> cada compra suma una
          sola vez al consumo por su fecha civil. Las cuotas y los intereses se siguen aparte en
          Obligaciones.
        </p>
      </Aviso>

      <Tarjeta suave>
        <h2 className="mb-2 text-[0.9375rem] font-extrabold text-hogar-tinta">
          Alcance activo hoy
        </h2>
        <dl className="m-0 flex flex-col gap-1.5 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Miembro conectado</dt>
            <dd className="m-0 font-bold text-hogar-tinta">{hogar.miembroActual.nombre}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Ámbito por defecto</dt>
            <dd className="m-0 font-bold text-hogar-tinta">Hogar (compartido)</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Moneda</dt>
            <dd className="hogar-cop m-0 font-bold text-hogar-tinta">COP enteros</dd>
          </div>
        </dl>
      </Tarjeta>
    </ShellApp>
  )
}

export function PantallaGastosVacia({ hogar }: { hogar: Hogar }) {
  return (
    <ShellApp
      titulo="Gastos generales"
      subtitulo={`${hogar.nombre} · $0 este mes`}
      accionDerecha={
        <Link to="/compra" className={`${claseBotonPequenoSecundario} no-underline`}>
          + Compra
        </Link>
      }
      mostrarNavegacion
    >
      <Tarjeta acento="primario">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Resumen por categoría
          </h2>
          <span className="hogar-cop font-extrabold text-hogar-tinta">$0</span>
        </div>
        <p className="m-0 text-sm text-hogar-tinta-suave">
          Aquí verás cuánto gastan al mes en Mercado, Transporte, Hogar y cada categoría, sin
          contar dos veces las compras a cuotas.
        </p>
      </Tarjeta>
    </ShellApp>
  )
}

export function PantallaObligacionesVacia({ hogar }: { hogar: Hogar }) {
  return (
    <ShellApp
      titulo="Obligaciones del mes"
      subtitulo={`${hogar.nombre} · 0 cuotas pendientes`}
      accionDerecha={
        <Link to="/hogar" className={`${claseBotonPequenoSecundario} no-underline`}>
          Mi hogar
        </Link>
      }
      mostrarNavegacion
      barraAccion={
        <Link to="/hogar" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>
          Volver a {hogar.nombre}
        </Link>
      }
    >
      <section aria-labelledby="resumen-vacio-obligaciones">
        <h2 id="resumen-vacio-obligaciones" className="sr-only">
          Resumen mensual sin movimientos
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <article className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie p-2.5 shadow-[var(--hogar-shadow-card)]">
            <span className="flex min-w-0 items-start gap-1.5 text-[0.6875rem] font-bold leading-[1.2] text-hogar-tinta-suave">
              <span className="mt-[3px] size-2 shrink-0 rounded-full bg-hogar-primario" aria-hidden="true" />
              <span className="min-w-0 break-words">Consumo real (hogar)</span>
            </span>
            <div className="mt-auto flex min-w-0 flex-col gap-0.5">
              <span className="hogar-cop text-[0.9375rem] font-extrabold leading-tight tracking-tight text-hogar-tinta break-words">
                $0
              </span>
              <span className="text-[0.65rem] leading-[1.2] text-hogar-tinta-suave break-words">
                1 vez por compra
              </span>
            </div>
          </article>
          <article className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie p-2.5 shadow-[var(--hogar-shadow-card)]">
            <span className="flex min-w-0 items-start gap-1.5 text-[0.6875rem] font-bold leading-[1.2] text-hogar-tinta-suave">
              <span className="mt-[3px] size-2 shrink-0 rounded-full bg-hogar-indigo" aria-hidden="true" />
              <span className="min-w-0 break-words">Capital pagado (cuotas)</span>
            </span>
            <div className="mt-auto flex min-w-0 flex-col gap-0.5">
              <span className="hogar-cop text-[0.9375rem] font-extrabold leading-tight tracking-tight text-hogar-tinta break-words">
                $0
              </span>
              <span className="text-[0.65rem] leading-[1.2] text-hogar-tinta-suave break-words">
                $0 pendiente
              </span>
            </div>
          </article>
          <article className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie p-2.5 shadow-[var(--hogar-shadow-card)]">
            <span className="flex min-w-0 items-start gap-1.5 text-[0.6875rem] font-bold leading-[1.2] text-hogar-tinta-suave">
              <span className="mt-[3px] size-2 shrink-0 rounded-full bg-hogar-ambar" aria-hidden="true" />
              <span className="min-w-0 break-words">Costo financ.</span>
            </span>
            <div className="mt-auto flex min-w-0 flex-col gap-0.5">
              <span className="hogar-cop text-[0.9375rem] font-extrabold leading-tight tracking-tight text-hogar-tinta break-words">
                $0
              </span>
              <span className="text-[0.65rem] leading-[1.2] text-hogar-tinta-suave break-words">
                Balde aparte
              </span>
            </div>
          </article>
        </div>
      </section>

      <Aviso variante="indigo" icono="ℹ">
        <p>
          <strong className="text-hogar-tinta">Sin doble conteo:</strong> consumo real, capital de
          cuotas y costo financiero nunca se suman entre sí. Todos los totales se derivan en el
          dispositivo.
        </p>
      </Aviso>

      <Tarjeta acento="indigo">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Núcleo 2 · Sin pasivos ni cuotas aún
          </h2>
          <Insignia variante="neutral">◷ En preparación</Insignia>
        </div>
        <p className="m-0 text-sm text-hogar-tinta-suave">
          Cuando llegue el módulo de Obligaciones podrás registrar tarjetas, créditos, deudas y
          pagos de cuotas con cálculo derivado.
        </p>
      </Tarjeta>
    </ShellApp>
  )
}

export function PantallaBalanceVacia({ hogar }: { hogar: Hogar }) {
  const activos = hogar.miembros.filter((m) => m.activo).length

  return (
    <ShellApp
      titulo="Balance de pareja"
      subtitulo={hogar.nombre}
      mostrarNavegacion
      barraAccion={
        <Link to="/hogar" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>
          Ver miembros del hogar
        </Link>
      }
    >
      <Aviso variante="primario" icono="✓">
        <p>
          <strong className="text-hogar-tinta">Aporte libre:</strong> cada miembro aporta lo que
          quiere o puede al hogar. Nunca se generan saldos ni deudas entre ustedes.
        </p>
      </Aviso>

      <Tarjeta acento="primario">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Aportes del mes al hogar
          </h2>
          <span className="hogar-cop font-extrabold text-hogar-tinta">$0</span>
        </div>
        <p className="m-0 text-sm text-hogar-tinta-suave">
          Todavía no hay aportes ni ingresos registrados para este mes calendario. Miembros activos
          en el hogar: <strong className="text-hogar-tinta">{activos}</strong>.
        </p>
      </Tarjeta>

      <Tarjeta suave>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Núcleo 3 · Reglas de privacidad
          </h2>
          <Insignia variante="neutral">◷ En preparación</Insignia>
        </div>
        <p className="m-0 text-sm text-hogar-tinta-suave">
          Las vistas <strong className="text-hogar-tinta">Mostrar % de su ingreso</strong> e{' '}
          <strong className="text-hogar-tinta">Incluir mis gastos personales</strong> permanecen
          apagadas por defecto, y los gastos personales nunca suman como aporte al hogar.
        </p>
      </Tarjeta>
    </ShellApp>
  )
}

export function PantallaMascotasVacia({ hogar }: { hogar: Hogar }) {
  return (
    <ShellApp
      titulo="Despensa de mascotas"
      subtitulo={`${hogar.nombre} · 0 alertas`}
      accionDerecha={
        <Link to="/hogar" className={`${claseBotonPequenoSecundario} no-underline`}>
          Mi hogar
        </Link>
      }
      mostrarNavegacion
      barraAccion={
        <Link to="/hogar" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>
          Volver a {hogar.nombre}
        </Link>
      }
    >
      <Tarjeta acento="primario">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
              Gasto en Mascotas (hogar)
            </h2>
            <p className="m-0 mt-1 text-[0.8125rem] text-hogar-tinta-suave">
              Derivado · Solo ámbito hogar y categoría Mascotas
            </p>
          </div>
          <span className="hogar-cop shrink-0 text-base font-extrabold text-hogar-tinta">$0</span>
        </div>
      </Tarjeta>

      <Tarjeta acento="ambar">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Núcleo 4 · Sin insumos registrados
          </h2>
          <Insignia variante="neutral">◷ En preparación</Insignia>
        </div>
        <p className="m-0 text-sm text-hogar-tinta-suave">
          Aquí vas a gestionar comida, higiene, salud y otros recurrentes de tus mascotas con
          nivel derivado, alerta desde el <strong className="text-hogar-tinta">20 %</strong> y
          recompra rápida.
        </p>
      </Tarjeta>
    </ShellApp>
  )
}

export function PantallaAjustesFundacion({
  hogar,
  onSalir,
  saliendo,
  errorSalir,
}: {
  hogar: Hogar
  onSalir: () => void
  saliendo: boolean
  errorSalir: string
}) {
  return (
    <ShellApp
      titulo="Ajustes y exportación"
      subtitulo={hogar.nombre}
      volverA="/hogar"
      etiquetaVolver={`Volver a ${hogar.nombre}`}
      accionDerecha={<Insignia variante="primario">Fundación</Insignia>}
      mostrarNavegacion
    >
      {errorSalir ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorSalir}</p>
        </Aviso>
      ) : null}

      <Tarjeta acento="primario">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Configuración del hogar
          </h2>
          <Insignia variante="primario">✓ Activo</Insignia>
        </div>
        <dl className="m-0 flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Hogar</dt>
            <dd className="m-0 font-bold text-hogar-tinta">{hogar.nombre}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Moneda y formato</dt>
            <dd className="hogar-cop m-0 font-bold text-hogar-tinta">COP enteros ($300.000)</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Zona horaria civil</dt>
            <dd className="m-0 font-bold text-hogar-tinta">America/Bogota</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Vista «% de su ingreso»</dt>
            <dd className="m-0 font-bold text-hogar-tinta">Apagada por defecto</dd>
          </div>
        </dl>
      </Tarjeta>

      <Tarjeta acento="indigo">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Exportación y copia local
          </h2>
          <Insignia variante="neutral">◷ Próxima fase</Insignia>
        </div>
        <p className="m-0 text-sm text-hogar-tinta-suave">
          La exportación semanal generará dos archivos ZIP separados por miembro —{' '}
          <strong className="text-hogar-tinta">Hogar (compartido)</strong> y{' '}
          <strong className="text-hogar-tinta">Mis personales</strong> (JSON + CSV) — junto con la
          copia local aislada por actor en IndexedDB.
        </p>
      </Tarjeta>

      <Tarjeta>
        <h2 className="mb-2 text-[0.9375rem] font-extrabold text-hogar-tinta">Sesión actual</h2>
        <p className="m-0 mb-3 text-sm text-hogar-tinta-suave">
          Sesión activa como{' '}
          <strong className="text-hogar-tinta">{hogar.miembroActual.nombre}</strong> (
          {hogar.miembroActual.rol === 'admin' ? 'Administrador' : 'Miembro'}).
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={`${claseBotonSecundario} w-full`}
            disabled={saliendo}
            onClick={onSalir}
          >
            Cerrar sesión
          </button>
          <Link to="/hogar" className={`${claseBotonPequenoSecundario} w-full no-underline`}>
            Volver a {hogar.nombre}
          </Link>
        </div>
      </Tarjeta>
    </ShellApp>
  )
}
