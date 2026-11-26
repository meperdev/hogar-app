import { useEffect, useState, type FormEvent } from 'react'
import type { Hogar } from '../../app/fundacion'
import { ErrorInvitacion, type InvitacionActiva, type InvitacionCreada, type InvitacionesPort } from '../../app/invitaciones'
import {
  construirEnlaceInvitacion,
  construirMensajeInvitacion,
  textoVigenciaInvitacion,
} from '../../domain/invitaciones'
import {
  Aviso,
  claseAyudaCampo,
  claseBotonPequenoPrimario,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'

function IconoSobreInvitacion() {
  return (
    <span
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-hogar-primario shadow-xs ring-1 ring-hogar-primario/15"
      aria-hidden="true"
    >
      <svg
        className="size-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M4 8.5 12 14l8-5.5" />
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M18.5 3.5v3M17 5h3" />
      </svg>
    </span>
  )
}

export function TarjetaInvitacionHogar({
  hogar,
  invitaciones,
}: {
  hogar: Hogar
  invitaciones: InvitacionesPort
}) {
  const [abierto, setAbierto] = useState(false)
  const [nota, setNota] = useState('')
  const [miembroObjetivoId, setMiembroObjetivoId] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')
  const [postal, setPostal] = useState<InvitacionCreada | null>(null)
  const [activas, setActivas] = useState<InvitacionActiva[]>([])
  const [copiado, setCopiado] = useState<'mensaje' | 'enlace' | ''>('')
  const [revocandoId, setRevocandoId] = useState<string | null>(null)

  const miembrosSinCuenta = hogar.miembros.filter(
    (m) => m.activo && m.tieneCuenta === false,
  )
  const esPrimerMiembro = hogar.miembros.filter((m) => m.activo).length <= 1

  useEffect(() => {
    let vigente = true
    void invitaciones
      .listar()
      .then((lista) => {
        if (vigente) setActivas(lista)
      })
      .catch(() => {
        // Si falla la carga de pendientes no bloquea /hogar ni oculta la invitación.
      })
    return () => {
      vigente = false
    }
  }, [invitaciones])

  const origen =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://hogar-app.pages.dev'

  const enlacePostal = postal ? construirEnlaceInvitacion(origen, postal.token) : ''
  const mensajePostal = postal
    ? construirMensajeInvitacion({
        hogarNombre: postal.hogarNombre,
        enlace: enlacePostal,
        nota: postal.nota,
      })
    : ''

  async function manejarCrear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCreando(true)
    setError('')
    setCopiado('')
    try {
      const creada = await invitaciones.crear({
        miembroObjetivoId: miembroObjetivoId || null,
        nota: nota.trim() || null,
      })
      setPostal(creada)
      setAbierto(false)
      setNota('')
      setMiembroObjetivoId('')
      const actualizadas = await invitaciones.listar().catch(() => null)
      if (actualizadas) setActivas(actualizadas)
    } catch (err) {
      setError(
        err instanceof ErrorInvitacion
          ? err.message
          : 'No se pudo generar la invitación. Intenta de nuevo.',
      )
    } finally {
      setCreando(false)
    }
  }

  async function copiar(texto: string, tipo: 'mensaje' | 'enlace') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto)
      }
      setCopiado(tipo)
    } catch {
      setError('No se pudo copiar automáticamente; selecciona el texto manualmente.')
    }
  }

  async function compartirNativo() {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return
    try {
      await navigator.share({
        title: `Invitación a ${postal?.hogarNombre ?? hogar.nombre}`,
        text: mensajePostal,
        url: enlacePostal,
      })
    } catch {
      // El usuario canceló la hoja nativa de compartir.
    }
  }

  async function manejarRevocar(id: string) {
    setRevocandoId(id)
    setError('')
    try {
      await invitaciones.revocar(id)
      setActivas((prev) => prev.filter((item) => item.id !== id))
      if (postal?.invitacionId === id) setPostal(null)
    } catch (err) {
      setError(err instanceof ErrorInvitacion ? err.message : 'No se pudo cancelar la invitación.')
    } finally {
      setRevocandoId(null)
    }
  }

  return (
    <section
      aria-labelledby="invitacion-hogar-titulo"
      className="flex flex-col gap-3 rounded-2xl border border-hogar-primario/25 bg-hogar-primario-suave p-4 text-hogar-tinta shadow-xs"
    >
      <div className="flex items-start gap-3">
        <IconoSobreInvitacion />
        <div className="min-w-0 flex-1 space-y-1">
          <h2
            id="invitacion-hogar-titulo"
            className="m-0 text-base font-extrabold tracking-[-0.02em] text-hogar-primario-fuerte"
          >
            {esPrimerMiembro
              ? '¿Te está gustando usar hogar-app?'
              : `¿Quieres invitar a alguien más a ${hogar.nombre}?`}
          </h2>
          <p className="m-0 text-sm leading-relaxed text-hogar-tinta">
            {esPrimerMiembro
              ? `Invita a tu pareja o a quien comparte los gastos contigo para disfrutar juntos de ${hogar.nombre}, cada uno con su espacio personal privado.`
              : `Comparte un enlace personal de un solo uso para que se sume a ${hogar.nombre} cuando lo necesiten.`}
          </p>
        </div>
      </div>

      {!abierto && !postal ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={claseBotonPrimario}
            onClick={() => {
              setAbierto(true)
              setError('')
            }}
          >
            Invitar a alguien
          </button>
          <span className="text-xs font-medium text-hogar-primario-fuerte">
            Enlace privado · Vence en 7 días
          </span>
        </div>
      ) : null}

      {abierto ? (
        <form
          className="flex flex-col gap-3 rounded-xl border border-hogar-borde bg-hogar-superficie p-3.5"
          onSubmit={manejarCrear}
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="inv-nota" className={claseEtiquetaCampo}>
              Nota para recordar a quién se la envías (opcional)
            </label>
            <input
              id="inv-nota"
              type="text"
              className={claseCampoTexto}
              placeholder="Ej. Para Beto"
              maxLength={120}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              disabled={creando}
            />
          </div>

          {miembrosSinCuenta.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inv-miembro-objetivo" className={claseEtiquetaCampo}>
                ¿Vincular con un miembro ya registrado? (opcional)
              </label>
              <select
                id="inv-miembro-objetivo"
                className={claseCampoTexto}
                value={miembroObjetivoId}
                onChange={(e) => setMiembroObjetivoId(e.target.value)}
                disabled={creando}
              >
                <option value="">Persona nueva en {hogar.nombre}</option>
                {miembrosSinCuenta.map((m) => (
                  <option key={m.id} value={m.id}>
                    Vincular con {m.nombre}
                  </option>
                ))}
              </select>
              <p className={claseAyudaCampo}>
                Si ya habías anotado movimientos suyos sin cuenta, conservará su historial.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${claseBotonPrimario} flex-1`} disabled={creando}>
              {creando ? 'Preparando enlace…' : 'Crear enlace de invitación'}
            </button>
            <button
              type="button"
              className={claseBotonSecundario}
              disabled={creando}
              onClick={() => setAbierto(false)}
            >
              Ahora no
            </button>
          </div>
        </form>
      ) : null}

      {postal ? (
        <div
          className="flex flex-col gap-3 rounded-xl border border-hogar-primario/30 bg-hogar-superficie p-3.5"
          role="region"
          aria-label="Invitación lista para compartir"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-sm font-extrabold text-hogar-primario-fuerte">
              ✓ Tu invitación está lista
            </p>
            <span className="text-xs font-semibold text-hogar-tinta-suave">
              {textoVigenciaInvitacion(postal.expiraEn, new Date())} · Un solo uso
            </span>
          </div>

          <p className="m-0 rounded-lg bg-hogar-fondo p-2.5 text-sm leading-relaxed text-hogar-tinta break-words">
            {mensajePostal}
          </p>

          <p className="m-0 font-mono text-xs text-hogar-tinta-suave break-all">
            {enlacePostal}
          </p>

          <div className="flex flex-wrap gap-2">
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
              <button
                type="button"
                className={`${claseBotonPequenoPrimario} flex-1`}
                onClick={() => void compartirNativo()}
              >
                Compartir
              </button>
            ) : null}
            <button
              type="button"
              className={`${claseBotonPequenoPrimario} flex-1`}
              onClick={() => void copiar(mensajePostal, 'mensaje')}
            >
              {copiado === 'mensaje' ? '✓ Mensaje copiado' : 'Copiar mensaje'}
            </button>
            <button
              type="button"
              className={claseBotonPequenoSecundario}
              onClick={() => void copiar(enlacePostal, 'enlace')}
            >
              {copiado === 'enlace' ? '✓ Enlace copiado' : 'Copiar enlace'}
            </button>
          </div>

          <button
            type="button"
            className="self-start border-0 bg-transparent p-0 text-xs font-bold text-hogar-primario underline cursor-pointer min-h-11 inline-flex items-center"
            onClick={() => {
              setPostal(null)
              setAbierto(true)
              setCopiado('')
            }}
          >
            + Crear otra invitación
          </button>
        </div>
      ) : null}

      {error ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{error}</p>
        </Aviso>
      ) : null}

      {activas.length > 0 ? (
        <div className="flex flex-col gap-2 pt-1">
          <p className="m-0 text-xs font-bold text-hogar-primario-fuerte">
            Invitaciones pendientes ({activas.length})
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {activas.map((item) => {
              const etiqueta =
                item.nota || item.miembroObjetivoNombre || 'Invitación abierta del hogar'
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hogar-borde bg-hogar-superficie px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-bold text-hogar-tinta break-words">{etiqueta}</p>
                    <p className="m-0 text-xs text-hogar-tinta-suave">
                      {textoVigenciaInvitacion(item.expiraEn, new Date())}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={claseBotonPequenoSecundario}
                    disabled={revocandoId === item.id}
                    onClick={() => void manejarRevocar(item.id)}
                  >
                    {revocandoId === item.id ? 'Cancelando…' : 'Cancelar invitación'}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
