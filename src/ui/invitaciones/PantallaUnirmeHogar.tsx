import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ErrorInvitacion,
  leerTokenInvitacionPendiente,
  limpiarTokenInvitacionPendiente,
  type InvitacionesPort,
} from '../../app/invitaciones'
import { extraerTokenInvitacion } from '../../domain/invitaciones'
import {
  Aviso,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'

export function PantallaUnirmeHogar({
  invitaciones,
  recargarHogar,
  onSalir,
  saliendo,
  errorSalir,
}: {
  invitaciones?: InvitacionesPort | undefined
  recargarHogar: () => void
  onSalir: () => void
  saliendo: boolean
  errorSalir: string
}) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [entradaToken, setEntradaToken] = useState(
    () => params.get('token') ?? leerTokenInvitacionPendiente() ?? '',
  )
  const [nombreMiembro, setNombreMiembro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const deUrl = params.get('token')
    if (deUrl) setEntradaToken(deUrl)
  }, [params])

  async function manejarSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!invitaciones) {
      setError('El servicio de invitaciones no está conectado todavía.')
      return
    }
    const token = extraerTokenInvitacion(entradaToken)
    if (!token) {
      setError('Pega el enlace o código de invitación completo para continuar.')
      return
    }
    setOcupado(true)
    setError('')
    try {
      await invitaciones.canjear({
        token,
        nombreMiembro: nombreMiembro.trim() || null,
      })
      limpiarTokenInvitacionPendiente()
      recargarHogar()
      navigate('/compra', { replace: true })
    } catch (err) {
      setError(
        err instanceof ErrorInvitacion
          ? err.message
          : 'No se pudo validar tu invitación. Revisa el enlace e intenta de nuevo.',
      )
    } finally {
      setOcupado(false)
    }
  }

  return (
    <ShellApp
      titulo="Te invitaron a sumarte a un hogar"
      subtitulo="Aceptar invitación · Espacio compartido y privado"
      marcaInicio
      accionDerecha={
        <button
          type="button"
          className={claseBotonPequenoSecundario}
          disabled={saliendo}
          onClick={onSalir}
        >
          Cerrar sesión
        </button>
      }
      pie="Montos enteros en COP · Offline-first"
    >
      {errorSalir ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorSalir}</p>
        </Aviso>
      ) : null}

      <Aviso variante="primario" icono="✓">
        <p>
          Vas a compartir los gastos del hogar con tranquilidad. Tus compras personales siempre
          serán privadas y solo tú las ves.
        </p>
      </Aviso>

      <Tarjeta>
        <form className="flex flex-col gap-3.5" onSubmit={manejarSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="unirme-token" className={claseEtiquetaCampo}>
              Enlace o código de invitación
            </label>
            <input
              id="unirme-token"
              type="text"
              className={claseCampoTexto}
              placeholder="Pega aquí el enlace o código recibido"
              value={entradaToken}
              aria-invalid={error ? 'true' : undefined}
              onChange={(e) => setEntradaToken(e.target.value)}
              disabled={ocupado}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="unirme-nombre" className={claseEtiquetaCampo}>
              Tu nombre en el hogar
            </label>
            <input
              id="unirme-nombre"
              type="text"
              autoComplete="name"
              className={claseCampoTexto}
              placeholder="Ej. Beto"
              value={nombreMiembro}
              aria-describedby="ayuda-unirme-nombre"
              onChange={(e) => setNombreMiembro(e.target.value)}
              disabled={ocupado}
            />
            <p id="ayuda-unirme-nombre" className={claseAyudaCampo}>
              Si quien te invitó ya seleccionó tu nombre en el hogar, puedes dejarlo vacío.
            </p>
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
            {ocupado ? 'Uniéndote al hogar…' : 'Unirme al hogar'}
          </button>

          <Link
            to="/crear-hogar"
            className={`${claseBotonSecundario} w-full no-underline`}
            onClick={() => limpiarTokenInvitacionPendiente()}
          >
            Prefiero crear mi propio hogar
          </Link>
        </form>
      </Tarjeta>
    </ShellApp>
  )
}
