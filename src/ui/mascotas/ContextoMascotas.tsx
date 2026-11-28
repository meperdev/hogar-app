import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AlcanceCompra } from '../../app/compraRapida'
import type { Hogar } from '../../app/fundacion'
import type { ControladorMascotas, VistaDespensa } from '../../app/mascotas'
import { hoyCivil } from '../../domain/fechas'
import { EVENTO_CATALOGO_ACTUALIZADO, EVENTO_COMPRAS_ACTUALIZADAS } from '../eventosDatos'
import { useNotificacionesOpcional } from '../Notificaciones'

type ValorContextoMascotas = {
  hogar: Hogar
  controlador: ControladorMascotas
  periodo: string
  vista: VistaDespensa | null
  cargando: boolean
  errorCarga: string
  toast: string
  cambiarPeriodo: (siguiente: string) => void
  recargar: () => void
  mostrarToast: (mensaje: string) => void
  limpiarToast: () => void
}

const ContextoMascotas = createContext<ValorContextoMascotas | null>(null)

export function ProveedorMascotas({
  hogar,
  crearControlador,
  periodoInicial,
  children,
}: {
  hogar: Hogar
  crearControlador: (alcance: AlcanceCompra) => ControladorMascotas
  periodoInicial?: string | undefined
  children: ReactNode
}) {
  const hogarId = hogar.id
  const miembroId = hogar.miembroActual.id
  const controlador = useMemo(
    () => crearControlador({ hogarId, miembroId }),
    [crearControlador, hogarId, miembroId],
  )

  const [periodo, setPeriodo] = useState(() => periodoInicial ?? hoyCivil(new Date()).slice(0, 7))
  const [vista, setVista] = useState<VistaDespensa | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [toast, setToast] = useState('')
  const [revision, setRevision] = useState(0)
  const vistaRef = useRef<VistaDespensa | null>(null)
  vistaRef.current = vista
  const notificaciones = useNotificacionesOpcional()
  const mostrarToast = useCallback(
    (mensaje: string) => {
      setToast(mensaje)
      notificaciones?.publicar({ mensaje, variante: 'exito' })
    },
    [notificaciones],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const recargarPorActualizacion = () => setRevision((actual) => actual + 1)
    window.addEventListener(EVENTO_COMPRAS_ACTUALIZADAS, recargarPorActualizacion)
    window.addEventListener(EVENTO_CATALOGO_ACTUALIZADO, recargarPorActualizacion)
    return () => {
      window.removeEventListener(EVENTO_COMPRAS_ACTUALIZADAS, recargarPorActualizacion)
      window.removeEventListener(EVENTO_CATALOGO_ACTUALIZADO, recargarPorActualizacion)
    }
  }, [])

  useEffect(() => {
    let vigente = true
    if (!vistaRef.current || vistaRef.current.periodo !== periodo) {
      setCargando(true)
    }
    setErrorCarga('')
    void controlador
      .cargar(periodo)
      .then((cargada) => {
        if (!vigente) return
        setVista(cargada)
        setCargando(false)
      })
      .catch(() => {
        if (!vigente) return
        setErrorCarga('No pudimos cargar la despensa de mascotas.')
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [controlador, periodo, revision])

  const recargar = useCallback(() => setRevision((actual) => actual + 1), [])
  const limpiarToast = useCallback(() => setToast(''), [])

  return (
    <ContextoMascotas.Provider
      value={{
        hogar,
        controlador,
        periodo,
        vista,
        cargando,
        errorCarga,
        toast,
        cambiarPeriodo: setPeriodo,
        recargar,
        mostrarToast,
        limpiarToast,
      }}
    >
      {children}
    </ContextoMascotas.Provider>
  )
}

export function useMascotas(): ValorContextoMascotas {
  const ctx = useContext(ContextoMascotas)
  if (!ctx) throw new Error('useMascotas debe usarse dentro de ProveedorMascotas')
  return ctx
}
