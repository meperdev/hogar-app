import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import {
  crearHogar,
  ErrorFundacion,
  estadoInvitacion,
  pedirCodigo,
  verificarCodigo,
  type AuthPort,
  type Hogar,
  type HogarPort,
  type Servicios,
  type Sesion,
} from '../app/fundacion'
import {
  guardarTokenInvitacionPendiente,
  leerTokenInvitacionPendiente,
  limpiarTokenInvitacionPendiente,
} from '../app/invitaciones'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from './ComponentesBase'
import {
  PantallaAjustesFundacion,
  PantallaBalanceVacia,
  PantallaCompraVacia,
  PantallaGastosVacia,
  PantallaMascotasVacia,
  PantallaObligacionesVacia,
} from './PantallasNucleos'
import { ShellApp } from './ShellApp'
import { ProveedorCompraRapida, useRecargarCatalogoCompraOpcional } from './compraRapida/ContextoCompraRapida'
import { PantallaCompraCuotas } from './compraRapida/PantallaCompraCuotas'
import { PantallaCompraRapida } from './compraRapida/PantallaCompraRapida'
import { PantallaEscanearFactura } from './compraRapida/PantallaEscanearFactura'
import { ProveedorGastos } from './gastos/ContextoGastos'
import { PantallaGastos } from './gastos/PantallaGastos'
import { ProveedorObligaciones } from './obligaciones/ContextoObligaciones'
import { PantallaNuevoPasivo } from './obligaciones/PantallaNuevoPasivo'
import { PantallaObligaciones } from './obligaciones/PantallaObligaciones'
import { PantallaRegistrarPago } from './obligaciones/PantallaRegistrarPago'
import { ProveedorBalance } from './balance/ContextoBalance'
import { PantallaAjustesExportar } from './balance/PantallaAjustesExportar'
import { PantallaBalance } from './balance/PantallaBalance'
import { PantallaRegistrarIngreso } from './balance/PantallaRegistrarIngreso'
import { PantallaTransferirFondo } from './balance/PantallaTransferirFondo'
import { ProveedorMascotas } from './mascotas/ContextoMascotas'
import { ProveedorNotificaciones } from './Notificaciones'
import { PantallaMascotas } from './mascotas/PantallaMascotas'
import { PantallaNuevoInsumo } from './mascotas/PantallaNuevoInsumo'
import { PantallaRecomprarInsumo } from './mascotas/PantallaRecomprarInsumo'
import { PantallaUnirmeHogar } from './invitaciones/PantallaUnirmeHogar'
import { TarjetaInvitacionHogar } from './invitaciones/TarjetaInvitacionHogar'
import { TarjetaComentariosRapidos } from './hogar/TarjetaComentariosRapidos'
import { TarjetaComercios } from './hogar/TarjetaComercios'
import { TarjetaMediosDePago } from './hogar/TarjetaMediosDePago'

function mensaje(error: unknown, porDefecto: string) {
  return error instanceof ErrorFundacion ? error.message : porDefecto
}

function useAccion() {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  async function ejecutar(accion: () => Promise<void>, porDefecto: string) {
    setOcupado(true)
    setError('')
    try {
      await accion()
    } catch (causa) {
      setError(mensaje(causa, porDefecto))
    } finally {
      setOcupado(false)
    }
  }
  return { ocupado, error, ejecutar, limpiar: () => setError('') }
}

function BotonSalir({ ocupado, onSalir }: { ocupado: boolean; onSalir: () => void }) {
  return (
    <button
      type="button"
      className={claseBotonPequenoSecundario}
      disabled={ocupado}
      onClick={onSalir}
    >
      Cerrar sesión
    </button>
  )
}

function Ingreso({ auth }: { auth: AuthPort }) {
  const [correo, setCorreo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [enviado, setEnviado] = useState(false)
  const { ejecutar, limpiar, ocupado, error } = useAccion()
  const tieneInvitacionPendiente = leerTokenInvitacionPendiente() !== null

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    void ejecutar(async () => {
      if (enviado) await verificarCodigo(auth, correo, codigo)
      else {
        await pedirCodigo(auth, correo)
        setEnviado(true)
      }
    }, 'No pudimos iniciar sesión. Intenta de nuevo.')
  }

  return (
    <ShellApp
      titulo="Ingresa a MeperHome"
      subtitulo="Sin contraseña · Código por correo"
      marcaInicio
      accionDerecha={<Insignia variante="primario">Fundación</Insignia>}
      pie="Montos enteros en COP · Offline-first"
    >
      {tieneInvitacionPendiente && !enviado ? (
        <Aviso variante="primario" icono="✉" role="status">
          <p>
            <strong className="text-hogar-tinta">Tienes una invitación pendiente:</strong> ingresa
            con tu correo para aceptar y unirte al hogar.
          </p>
        </Aviso>
      ) : null}

      {enviado ? (
        <Aviso variante="primario" icono="✓" role="status">
          <p>Ingresa el código que enviamos a {correo.trim()}.</p>
        </Aviso>
      ) : null}

      <Tarjeta acento="primario">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            {enviado ? 'Código de verificación' : 'Acceso por correo'}
          </h2>
          <Insignia variante={enviado ? 'indigo' : 'primario'}>
            {enviado ? 'Paso 2 de 2 · Verificación' : 'Paso 1 de 2 · Correo'}
          </Insignia>
        </div>

        {!enviado ? (
          <p className="m-0 mb-3 text-sm text-hogar-tinta-suave">
            Te enviamos un código de seis dígitos por correo.
          </p>
        ) : null}

        <form className="flex flex-col gap-3.5" onSubmit={enviar} noValidate>
          {enviado ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ingreso-codigo" className={claseEtiquetaCampo}>
                Código de seis dígitos
              </label>
              <input
                id="ingreso-codigo"
                className={`${claseCampoTexto} text-center font-mono text-xl font-bold tracking-[0.25em]`}
                value={codigo}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                aria-describedby="ayuda-ingreso-codigo"
                aria-invalid={error ? 'true' : undefined}
                onChange={(e) => setCodigo(e.target.value)}
                required
                disabled={ocupado}
              />
              <p id="ayuda-ingreso-codigo" className={claseAyudaCampo}>
                Conserva los ceros iniciales si tu código empieza por 0.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ingreso-correo" className={claseEtiquetaCampo}>
                Correo electrónico
              </label>
              <input
                id="ingreso-correo"
                className={claseCampoTexto}
                value={correo}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="nombre@correo.com"
                aria-describedby="ayuda-ingreso-correo"
                aria-invalid={error ? 'true' : undefined}
                onChange={(e) => setCorreo(e.target.value)}
                required
                disabled={ocupado}
              />
              <p id="ayuda-ingreso-correo" className={claseAyudaCampo}>
                Sin contraseña que recordar ni recuperar.
              </p>
            </div>
          )}

          {error ? (
            <Aviso variante="peligro" icono="▲" role="alert">
              <p>{error}</p>
            </Aviso>
          ) : null}

          <button
            type="submit"
            className={`${claseBotonPrimario} w-full`}
            disabled={ocupado}
            data-sin-scroll
          >
            {ocupado ? 'Un momento…' : enviado ? 'Verificar código' : 'Enviar código'}
          </button>

          {enviado ? (
            <button
              type="button"
              className={`${claseBotonSecundario} w-full`}
              disabled={ocupado}
              onClick={() => {
                setEnviado(false)
                setCodigo('')
                limpiar()
              }}
            >
              Cambiar correo o pedir otro código
            </button>
          ) : null}
        </form>
      </Tarjeta>

      <Aviso variante="indigo" icono="ℹ">
        <p>
          <strong className="text-hogar-tinta">Privacidad y COP enteros:</strong> las compras
          personales son privadas de su dueño y nunca se inventan saldos o deudas entre miembros.
        </p>
      </Aviso>
    </ShellApp>
  )
}

function AltaHogar({
  hogares,
  recargar,
  onSalir,
  saliendo,
  errorSalir,
}: {
  hogares: HogarPort
  recargar: () => void
  onSalir: () => void
  saliendo: boolean
  errorSalir: string
}) {
  const [nombre, setNombre] = useState('')
  const [nombreMiembro, setNombreMiembro] = useState('')
  const { ejecutar, ocupado, error } = useAccion()

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    void ejecutar(async () => {
      await crearHogar(hogares, { nombre, nombreMiembro })
      recargar()
    }, 'No pudimos crear el hogar. Intenta de nuevo.')
  }

  return (
    <ShellApp
      titulo="Crea tu hogar"
      subtitulo="Primer administrador · Paso inicial"
      marcaInicio
      accionDerecha={<BotonSalir ocupado={saliendo} onSalir={onSalir} />}
      pie="Montos enteros en COP · Offline-first"
    >
      {errorSalir ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorSalir}</p>
        </Aviso>
      ) : null}

      <Aviso variante="primario" icono="✓">
        <p>
          Serás su primer administrador. Se prepararán las categorías base del hogar y tu
          espacio personal privado.
        </p>
      </Aviso>

      <Tarjeta acento="primario">
        <h2 className="m-0 mb-3 text-[0.9375rem] font-extrabold text-hogar-tinta">
          Datos iniciales
        </h2>
        <form className="flex flex-col gap-3.5" onSubmit={enviar} noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hogar-nombre" className={claseEtiquetaCampo}>
              Nombre del hogar
            </label>
            <input
              id="hogar-nombre"
              className={claseCampoTexto}
              value={nombre}
              placeholder="Ej. Casa de Ana"
              aria-invalid={error ? 'true' : undefined}
              onChange={(e) => setNombre(e.target.value)}
              required
              disabled={ocupado}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="hogar-miembro" className={claseEtiquetaCampo}>
              Tu nombre
            </label>
            <input
              id="hogar-miembro"
              className={claseCampoTexto}
              value={nombreMiembro}
              autoComplete="name"
              placeholder="Ej. Ana"
              aria-invalid={error ? 'true' : undefined}
              onChange={(e) => setNombreMiembro(e.target.value)}
              required
              disabled={ocupado}
            />
          </div>

          {error ? (
            <Aviso variante="peligro" icono="▲" role="alert">
              <p>{error}</p>
            </Aviso>
          ) : null}

          <button
            type="submit"
            className={`${claseBotonPrimario} w-full`}
            disabled={ocupado}
            data-sin-scroll
          >
            {ocupado ? 'Creando…' : 'Crear hogar'}
          </button>
        </form>
      </Tarjeta>

      <Tarjeta acento="primario">
        <h2 className="m-0 mb-3 text-[0.9375rem] font-extrabold text-hogar-tinta">
          ¿Te invitaron a un hogar existente?
        </h2>
        <p className="m-0 mb-3 text-sm text-hogar-tinta-suave">
          Si te compartieron un enlace o código de invitación, únete directamente sin crear un
          hogar aparte.
        </p>
        <Link to="/unirme" className={`${claseBotonSecundario} w-full no-underline`}>
          Tengo una invitación
        </Link>
      </Tarjeta>

      <Aviso variante="indigo" icono="ℹ">
        <p>
          <strong className="text-hogar-tinta">Aporte libre:</strong> cada miembro ve solo los
          hechos compartidos del hogar y sus propias compras personales.
        </p>
      </Aviso>
    </ShellApp>
  )
}

const enlacesNucleos = [
  { to: '/compra', titulo: 'Compra rápida', nota: 'Ámbito hogar o personal en pocos toques' },
  { to: '/gastos', titulo: 'Gastos generales', nota: 'Resumen por categoría y movimientos del mes' },
  {
    to: '/obligaciones',
    titulo: 'Obligaciones del mes',
    nota: 'Cuotas, pasivos y costo financiero separados',
  },
  { to: '/balance', titulo: 'Balance de pareja', nota: 'Aporte libre por mes calendario' },
  {
    to: '/mascotas',
    titulo: 'Despensa de mascotas',
    nota: 'Niveles derivados y alertas de reposición',
  },
] as const

function ResumenHogar({
  hogar,
  invitaciones,
  mediosDePago,
  comercios,
  comentariosRapidos,
  onSalir,
  saliendo,
  errorSalir,
}: {
  hogar: Hogar
  invitaciones?: Servicios['invitaciones']
  mediosDePago?: Servicios['mediosDePago']
  comercios?: Servicios['comercios']
  comentariosRapidos?: Servicios['comentariosRapidos']
  onSalir: () => void
  saliendo: boolean
  errorSalir: string
}) {
  const rolActual = hogar.miembroActual.rol === 'admin' ? 'Administrador' : 'Miembro'
  const recargarCompra = useRecargarCatalogoCompraOpcional()

  return (
    <ShellApp
      titulo={hogar.nombre}
      subtitulo={`${hogar.miembroActual.nombre} · ${rolActual}`}
      accionDerecha={<BotonSalir ocupado={saliendo} onSalir={onSalir} />}
      mostrarNavegacion
    >
      {errorSalir ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorSalir}</p>
        </Aviso>
      ) : null}

      <Tarjeta acento="primario">
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/compra"
            className={`${claseBotonPrimario} w-full no-underline`}
            data-sin-scroll
          >
            Ir a Compra rápida
          </Link>
          <Link to="/ajustes" className={`${claseBotonSecundario} w-full no-underline`}>
            Ajustes
          </Link>
        </div>
      </Tarjeta>

      <section aria-labelledby="miembros-titulo" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="miembros-titulo"
            className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta"
          >
            Miembros
          </h2>
          <span className="text-[0.8125rem] text-hogar-tinta-suave">
            {hogar.miembros.length} {hogar.miembros.length === 1 ? 'registrado' : 'registrados'}
          </span>
        </div>

        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {hogar.miembros.map((m) => {
            const esActual = m.id === hogar.miembroActual.id
            const nombreRol = m.rol === 'admin' ? 'Administrador' : 'Miembro'
            return (
              <li key={m.id}>
                <Tarjeta
                  acento={m.activo ? (esActual ? 'primario' : 'indigo') : 'ninguno'}
                  suave={!m.activo}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta break-words">
                        {m.nombre} — {nombreRol}
                        {esActual ? ' (tú)' : ''}
                        {m.activo ? '' : ' · Inactivo'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {esActual ? <Insignia variante="indigo">Tu sesión</Insignia> : null}
                      <Insignia variante={m.activo ? 'primario' : 'neutral'}>
                        {m.activo ? '✓ Activo' : 'Inactivo'}
                      </Insignia>
                    </div>
                  </div>
                </Tarjeta>
              </li>
            )
          })}
        </ul>
      </section>

      {mediosDePago ? (
        <TarjetaMediosDePago
          hogar={hogar}
          mediosDePago={mediosDePago}
          {...(recargarCompra ? { onCambio: recargarCompra } : {})}
        />
      ) : null}

      {comercios ? (
        <TarjetaComercios
          hogar={hogar}
          comercios={comercios}
          {...(recargarCompra ? { onCambio: recargarCompra } : {})}
        />
      ) : null}

      {comentariosRapidos ? (
        <TarjetaComentariosRapidos
          hogar={hogar}
          comentariosRapidos={comentariosRapidos}
          {...(recargarCompra ? { onCambio: recargarCompra } : {})}
        />
      ) : null}

      {hogar.miembroActual.rol === 'admin' ? (
        invitaciones ? (
          <TarjetaInvitacionHogar hogar={hogar} invitaciones={invitaciones} />
        ) : estadoInvitacion(hogar.miembroActual.rol) === 'pendiente' ? (
          <Aviso variante="indigo" icono="◷">
            <p>La invitación a nuevos miembros todavía no está disponible.</p>
          </Aviso>
        ) : null
      ) : null}

      <section aria-labelledby="nucleos-titulo" className="flex flex-col gap-2.5">
        <h2
          id="nucleos-titulo"
          className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta"
        >
          Los cuatro núcleos
        </h2>
        <ul className="m-0 grid list-none gap-2 p-0">
          {enlacesNucleos.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="group flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-hogar-borde bg-hogar-superficie px-3.5 py-3 text-hogar-tinta shadow-[var(--hogar-shadow-card)] no-underline transition-all duration-150 hover:border-hogar-primario/30 hover:bg-hogar-primario-suave/60 hover:text-hogar-primario active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{item.titulo}</span>
                  <span className="block text-xs text-hogar-tinta-suave">{item.nota}</span>
                </span>
                <span className="shrink-0 font-bold transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </ShellApp>
  )
}

type Carga = 'cargando' | 'error' | Hogar | null

function HogarConSesion({ servicios, sesion }: { servicios: Servicios; sesion: Sesion }) {
  const [carga, setCarga] = useState<Carga>('cargando')
  const [revision, setRevision] = useState(0)
  const { ejecutar, ocupado, error } = useAccion()
  const { auth, hogares } = servicios
  const { usuarioId } = sesion

  useEffect(() => {
    let vigente = true
    void hogares.cargar({ usuarioId }).then(
      (hogar) => {
        if (vigente) setCarga(hogar)
      },
      () => {
        if (vigente) setCarga('error')
      },
    )
    return () => {
      vigente = false
    }
  }, [hogares, usuarioId, revision])

  function recargar() {
    setCarga('cargando')
    setRevision((actual) => actual + 1)
  }

  function salir() {
    void ejecutar(() => auth.salir(), 'No pudimos cerrar sesión. Intenta de nuevo.')
  }

  if (carga === 'cargando') {
    return (
      <ShellApp
        titulo="Cargando tu hogar"
        subtitulo="Preparando tu espacio"
        marcaInicio
        accionDerecha={<BotonSalir ocupado={ocupado} onSalir={salir} />}
        pie="Montos enteros en COP · Offline-first"
      >
        {error ? (
          <Aviso variante="peligro" icono="▲" role="alert">
            <p>{error}</p>
          </Aviso>
        ) : null}
        <Aviso variante="indigo" icono="◷" role="status">
          <p className="font-bold">Cargando hogar…</p>
        </Aviso>
      </ShellApp>
    )
  }

  if (carga === 'error') {
    return (
      <ShellApp
        titulo="No pudimos cargar el hogar"
        subtitulo="Revisa tu conexión con Supabase"
        marcaInicio
        accionDerecha={<BotonSalir ocupado={ocupado} onSalir={salir} />}
        pie="Montos enteros en COP · Offline-first"
      >
        {error ? (
          <Aviso variante="peligro" icono="▲" role="alert">
            <p>{error}</p>
          </Aviso>
        ) : null}
        <Aviso variante="peligro" icono="▲" role="alert">
          <p className="font-bold">No pudimos cargar el hogar.</p>
          <p>Intenta nuevamente cuando el servidor responda.</p>
        </Aviso>
        <button
          type="button"
          className={`${claseBotonPrimario} w-full`}
          onClick={recargar}
          data-sin-scroll
        >
          Reintentar
        </button>
      </ShellApp>
    )
  }

  if (!carga) {
    const destinoPorDefecto = leerTokenInvitacionPendiente() ? '/unirme' : '/crear-hogar'
    return (
      <Routes>
        <Route
          path="/crear-hogar"
          element={
            <AltaHogar
              hogares={hogares}
              recargar={recargar}
              onSalir={salir}
              saliendo={ocupado}
              errorSalir={error}
            />
          }
        />
        <Route
          path="/unirme"
          element={
            <PantallaUnirmeHogar
              invitaciones={servicios.invitaciones}
              recargarHogar={recargar}
              onSalir={salir}
              saliendo={ocupado}
              errorSalir={error}
            />
          }
        />
        <Route path="*" element={<Navigate to={destinoPorDefecto} replace />} />
      </Routes>
    )
  }

  const rutasHogar = (
    <Routes>
      <Route path="/" element={<Navigate to="/compra" replace />} />
      {servicios.compras ? (
        <>
          <Route path="/compra" element={<PantallaCompraRapida />} />
          <Route path="/compra/cuotas" element={<PantallaCompraCuotas />} />
          <Route path="/compra/escanear" element={<PantallaEscanearFactura />} />
        </>
      ) : (
        <>
          <Route path="/compra" element={<PantallaCompraVacia hogar={carga} />} />
          <Route path="/compra/*" element={<Navigate to="/compra" replace />} />
        </>
      )}
      <Route
        path="/hogar"
        element={
          <ResumenHogar
            hogar={carga}
            invitaciones={servicios.invitaciones}
            mediosDePago={servicios.mediosDePago}
            comercios={servicios.comercios}
            comentariosRapidos={servicios.comentariosRapidos}
            onSalir={salir}
            saliendo={ocupado}
            errorSalir={error}
          />
        }
      />
      <Route
        path="/unirme"
        element={
          <ShellApp
            titulo={carga.nombre}
            subtitulo="Ya perteneces a un hogar activo"
            volverA="/hogar"
            etiquetaVolver={`Volver a ${carga.nombre}`}
            mostrarNavegacion
          >
            <Aviso variante="indigo" icono="ℹ">
              <p>
                Tu cuenta ya forma parte de <strong className="text-hogar-tinta">{carga.nombre}</strong>.
              </p>
            </Aviso>
            <Link
              to="/hogar"
              className={`${claseBotonPrimario} w-full no-underline`}
              onClick={() => limpiarTokenInvitacionPendiente()}
            >
              Volver a {carga.nombre}
            </Link>
          </ShellApp>
        }
      />
      {servicios.obligaciones ? (
        <>
          <Route path="/obligaciones" element={<PantallaObligaciones />} />
          <Route path="/obligaciones/pagar/:tipo/:id" element={<PantallaRegistrarPago />} />
          <Route path="/obligaciones/nuevo-pasivo" element={<PantallaNuevoPasivo />} />
        </>
      ) : (
        <>
          <Route path="/obligaciones" element={<PantallaObligacionesVacia hogar={carga} />} />
          <Route path="/obligaciones/*" element={<Navigate to="/obligaciones" replace />} />
        </>
      )}
      {servicios.balance ? (
        <>
          <Route path="/balance" element={<PantallaBalance />} />
          <Route path="/balance/transferir" element={<PantallaTransferirFondo />} />
          <Route path="/balance/nuevo-ingreso" element={<PantallaRegistrarIngreso />} />
        </>
      ) : (
        <>
          <Route path="/balance" element={<PantallaBalanceVacia hogar={carga} />} />
          <Route path="/balance/*" element={<Navigate to="/balance" replace />} />
        </>
      )}
      {servicios.gastos ? (
        <Route path="/gastos" element={<PantallaGastos />} />
      ) : (
        <Route path="/gastos" element={<PantallaGastosVacia hogar={carga} />} />
      )}
      {servicios.mascotas ? (
        <>
          <Route path="/mascotas" element={<PantallaMascotas />} />
          <Route path="/mascotas/nuevo-insumo" element={<PantallaNuevoInsumo />} />
          <Route path="/mascotas/recomprar/:itemId" element={<PantallaRecomprarInsumo />} />
        </>
      ) : (
        <>
          <Route path="/mascotas" element={<PantallaMascotasVacia hogar={carga} />} />
          <Route path="/mascotas/*" element={<Navigate to="/mascotas" replace />} />
        </>
      )}
      <Route
        path="/ajustes"
        element={
          servicios.balance ? (
            <PantallaAjustesExportar
              onSalir={salir}
              saliendo={ocupado}
              errorSalir={error}
            />
          ) : (
            <PantallaAjustesFundacion
              hogar={carga}
              onSalir={salir}
              saliendo={ocupado}
              errorSalir={error}
            />
          )
        }
      />
      <Route path="/crear-hogar" element={<Navigate to="/compra" replace />} />
      <Route path="*" element={<Navigate to="/compra" replace />} />
    </Routes>
  )

  let contenido = rutasHogar
  if (servicios.balance) {
    contenido = (
      <ProveedorBalance hogar={carga} crearControlador={servicios.balance}>
        {contenido}
      </ProveedorBalance>
    )
  }
  if (servicios.obligaciones) {
    contenido = (
      <ProveedorObligaciones hogar={carga} crearControlador={servicios.obligaciones}>
        {contenido}
      </ProveedorObligaciones>
    )
  }
  if (servicios.mascotas) {
    contenido = (
      <ProveedorMascotas hogar={carga} crearControlador={servicios.mascotas}>
        {contenido}
      </ProveedorMascotas>
    )
  }
  if (servicios.compras) {
    contenido = (
      <ProveedorCompraRapida hogar={carga} crearControlador={servicios.compras}>
        {contenido}
      </ProveedorCompraRapida>
    )
  }
  if (servicios.gastos) {
    contenido = (
      <ProveedorGastos hogar={carga} crearControlador={servicios.gastos}>
        {contenido}
      </ProveedorGastos>
    )
  }

  return contenido
}

function RedireccionInvitacionSinSesion() {
  const [params] = useSearchParams()
  const token = params.get('token')
  if (token) {
    guardarTokenInvitacionPendiente(token)
  }
  return <Navigate to="/ingresar" replace />
}

export function RutasFundacion({ servicios }: { servicios: Servicios }) {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined)
  const { auth } = servicios
  useEffect(() => auth.observarSesion(setSesion), [auth])

  if (sesion === undefined) {
    return (
      <ShellApp
        titulo="MeperHome"
        subtitulo="Verificando tu sesión"
        marcaInicio
        accionDerecha={<Insignia variante="primario">Fundación</Insignia>}
        pie="Montos enteros en COP · Offline-first"
      >
        <Aviso variante="indigo" icono="◷" role="status">
          <p className="font-bold">Restaurando sesión…</p>
          <p>Comprobando credenciales guardadas en este dispositivo.</p>
        </Aviso>
      </ShellApp>
    )
  }

  const contenidoFinal = sesion ? (
    <HogarConSesion key={sesion.usuarioId} servicios={servicios} sesion={sesion} />
  ) : (
    <Routes>
      <Route path="/ingresar" element={<Ingreso auth={auth} />} />
      <Route path="/unirme" element={<RedireccionInvitacionSinSesion />} />
      <Route path="*" element={<Navigate to="/ingresar" replace />} />
    </Routes>
  )

  return <ProveedorNotificaciones>{contenidoFinal}</ProveedorNotificaciones>
}
