import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'

export type VarianteNotificacion = 'exito' | 'info' | 'peligro'

export type AccionNotificacion =
  | { tipo: 'enlace'; etiqueta: string; to: string }
  | {
      tipo: 'boton'
      etiqueta: string
      onClick: () => void
      cerrarAlPulsar?: boolean | undefined
    }

export type EntradaNotificacion = {
  id?: string | undefined
  mensaje: string
  variante?: VarianteNotificacion | undefined
  duracionMs?: number | null | undefined
  acciones?: readonly AccionNotificacion[] | undefined
  onCerrar?: (() => void) | undefined
}

type NotificacionInterna = {
  id: string
  mensaje: string
  variante: VarianteNotificacion
  duracionMs: number | null
  acciones: readonly AccionNotificacion[]
  onCerrar?: (() => void) | undefined
}

type ValorContextoNotificaciones = {
  publicar: (entrada: EntradaNotificacion) => string
  cerrar: (id: string) => void
  limpiar: () => void
}

const ContextoNotificaciones = createContext<ValorContextoNotificaciones | null>(null)

const DURACION_DEFECTO_MS = 4200
const MAX_NOTIFICACIONES = 5

const estilosIcono: Record<VarianteNotificacion, { fondo: string; simbolo: string }> = {
  exito: { fondo: 'bg-emerald-400/20 text-[#9be8d0]', simbolo: '✓' },
  info: { fondo: 'bg-sky-400/20 text-sky-200', simbolo: 'i' },
  peligro: { fondo: 'bg-rose-400/20 text-rose-200', simbolo: '▲' },
}

function CapsulaNotificacion({
  item,
  esFondo = false,
  extrasApiladas = 0,
  expandido = false,
  onAlternarPila,
  onCerrar,
}: {
  item: NotificacionInterna
  esFondo?: boolean | undefined
  extrasApiladas?: number | undefined
  expandido?: boolean | undefined
  onAlternarPila?: (() => void) | undefined
  onCerrar: (id: string) => void
}) {
  const icono = estilosIcono[item.variante]
  const puedeExpandir = !esFondo && extrasApiladas > 0 && !expandido

  return (
    <div
      role={esFondo ? undefined : 'status'}
      aria-live={esFondo ? undefined : 'polite'}
      aria-hidden={esFondo ? 'true' : undefined}
      onClick={puedeExpandir ? onAlternarPila : undefined}
      className={`hogar-pill-toast flex min-h-11 items-center gap-2 rounded-full border border-white/14 bg-[#141e1b]/94 px-3.5 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_14px_34px_-10px_rgba(10,18,15,0.48),0_2px_8px_rgba(0,0,0,0.2)] backdrop-blur-xl ${
        puedeExpandir ? 'cursor-pointer' : ''
      }`}
    >
      <span
        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-extrabold ${icono.fondo}`}
        aria-hidden="true"
      >
        {icono.simbolo}
      </span>

      <span className="min-w-0 flex-1 leading-snug break-words">{item.mensaje}</span>

      {!esFondo ? (
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(evento) => evento.stopPropagation()}
        >
          {item.acciones.map((accion) =>
            accion.tipo === 'enlace' ? (
              <Link
                key={accion.etiqueta}
                to={accion.to}
                onClick={() => onCerrar(item.id)}
                className="inline-flex min-h-8 items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold text-[#9be8d0] no-underline transition-colors hover:bg-white/10"
              >
                {accion.etiqueta}
              </Link>
            ) : (
              <button
                key={accion.etiqueta}
                type="button"
                onClick={() => {
                  accion.onClick()
                  if (accion.cerrarAlPulsar !== false) onCerrar(item.id)
                }}
                className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 px-2.5 py-1 text-xs font-bold text-[#9be8d0] transition-colors hover:bg-white/18"
              >
                {accion.etiqueta}
              </button>
            ),
          )}

          {puedeExpandir ? (
            <button
              type="button"
              onClick={onAlternarPila}
              aria-label={`Ver ${extrasApiladas} notificaciones más`}
              className="inline-flex min-h-7 min-w-7 cursor-pointer items-center justify-center rounded-full border border-white/16 bg-white/12 px-2 text-[0.6875rem] font-extrabold text-white transition-colors hover:bg-white/22"
            >
              +{extrasApiladas}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onCerrar(item.id)}
            aria-label="Cerrar notificación"
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-xs font-bold text-white/70 transition-colors hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function ProveedorNotificaciones({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<NotificacionInterna[]>([])
  const [expandido, setExpandido] = useState(false)
  const secuenciaRef = useRef(0)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const listaRef = useRef<NotificacionInterna[]>([])
  const expandidoRef = useRef(false)
  listaRef.current = lista
  expandidoRef.current = expandido

  const limpiarTimerId = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const cerrar = useCallback(
    (id: string) => {
      limpiarTimerId(id)
      const removida = listaRef.current.find((n) => n.id === id)
      setLista((actual) => {
        const siguiente = actual.filter((n) => n.id !== id)
        if (siguiente.length <= 1) setExpandido(false)
        return siguiente
      })
      removida?.onCerrar?.()
    },
    [limpiarTimerId],
  )

  const programarTimer = useCallback(
    (id: string, duracionMs: number | null) => {
      limpiarTimerId(id)
      if (duracionMs === null || duracionMs <= 0 || expandidoRef.current) return
      const timer = setTimeout(() => {
        cerrar(id)
      }, duracionMs)
      timersRef.current.set(id, timer)
    },
    [cerrar, limpiarTimerId],
  )

  const publicar = useCallback(
    (entrada: EntradaNotificacion): string => {
      secuenciaRef.current += 1
      const id = entrada.id ?? `noti-${secuenciaRef.current}`
      const duracionMs =
        entrada.duracionMs === undefined ? DURACION_DEFECTO_MS : entrada.duracionMs
      const nuevo: NotificacionInterna = {
        id,
        mensaje: entrada.mensaje,
        variante: entrada.variante ?? 'exito',
        duracionMs,
        acciones: entrada.acciones ?? [],
        onCerrar: entrada.onCerrar,
      }
      setLista((actual) => [nuevo, ...actual.filter((n) => n.id !== id)].slice(0, MAX_NOTIFICACIONES))
      programarTimer(id, duracionMs)
      return id
    },
    [programarTimer],
  )

  const limpiar = useCallback(() => {
    for (const timer of timersRef.current.values()) clearTimeout(timer)
    timersRef.current.clear()
    setExpandido(false)
    setLista([])
  }, [])

  useEffect(() => {
    if (expandido) {
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    } else {
      for (const item of listaRef.current) {
        if (!timersRef.current.has(item.id) && item.duracionMs !== null) {
          programarTimer(item.id, item.duracionMs)
        }
      }
    }
  }, [expandido, programarTimer])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const frente = lista[0]
  const respaldo = lista.slice(1, 3)

  return (
    <ContextoNotificaciones.Provider value={{ publicar, cerrar, limpiar }}>
      {lista.length > 0 ? (
        <div
          data-notificaciones-bandeja
          className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+10px)] left-1/2 z-[60] w-[min(calc(100vw-24px),366px)] -translate-x-1/2"
        >
          {expandido && lista.length > 1 ? (
            <div className="pointer-events-auto flex flex-col gap-2">
              {lista.slice(0, 4).map((item) => (
                <CapsulaNotificacion
                  key={item.id}
                  item={item}
                  expandido
                  onCerrar={cerrar}
                />
              ))}
              <button
                type="button"
                onClick={() => setExpandido(false)}
                className="mx-auto cursor-pointer rounded-full border border-white/14 bg-[#141e1b]/88 px-3 py-1 text-[0.6875rem] font-bold text-white/85 shadow-md backdrop-blur-lg"
              >
                Apilar avisos
              </button>
            </div>
          ) : frente ? (
            <div className="relative">
              {respaldo.map((item, idx) => (
                <div
                  key={item.id}
                  data-notificacion-apilada={idx + 1}
                  className="pointer-events-none absolute inset-x-0 top-0 transition-all duration-200"
                  style={{
                    zIndex: 20 - idx * 10,
                    transform:
                      idx === 0 ? 'translateY(9px) scale(0.94)' : 'translateY(17px) scale(0.88)',
                    opacity: idx === 0 ? 0.78 : 0.48,
                  }}
                >
                  <CapsulaNotificacion item={item} esFondo onCerrar={cerrar} />
                </div>
              ))}
              <div className="pointer-events-auto relative z-30">
                <CapsulaNotificacion
                  item={frente}
                  extrasApiladas={lista.length - 1}
                  onAlternarPila={() => setExpandido(true)}
                  onCerrar={cerrar}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </ContextoNotificaciones.Provider>
  )
}

export function useNotificaciones(): ValorContextoNotificaciones {
  const ctx = useContext(ContextoNotificaciones)
  if (!ctx) throw new Error('useNotificaciones debe usarse dentro de ProveedorNotificaciones')
  return ctx
}

export function useNotificacionesOpcional(): ValorContextoNotificaciones | null {
  return useContext(ContextoNotificaciones)
}
