import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ControladorBalance, VistaBalanceMes } from '../../app/balance'
import type { Hogar } from '../../app/fundacion'
import { hoyCivil } from '../../domain/fechas'
import { useNotificacionesOpcional } from '../Notificaciones'

type ValorContextoBalance = {
  hogar: Hogar
  controlador: ControladorBalance
  periodo: string
  vista: VistaBalanceMes | null
  cargando: boolean
  errorCarga: string
  toast: string
  cambiarPeriodo: (nuevoPeriodo: string) => void
  alternarMostrarPctIngreso: (valor: boolean) => Promise<boolean>
  alternarIncluirPersonales: (valor: boolean) => Promise<void>
  recargar: () => void
  notificar: (mensaje: string) => void
  limpiarToast: () => void
}

const ContextoBalance = createContext<ValorContextoBalance | null>(null)

export function ProveedorBalance({
  hogar,
  crearControlador,
  children,
}: {
  hogar: Hogar
  crearControlador: (alcance: { hogarId: string; miembroId: string }) => ControladorBalance
  children: ReactNode
}) {
  const [controlador] = useState(() =>
    crearControlador({ hogarId: hogar.id, miembroId: hogar.miembroActual.id }),
  )
  const [periodo, setPeriodo] = useState(() => hoyCivil(new Date()).slice(0, 7))
  const [vista, setVista] = useState<VistaBalanceMes | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [toast, setToast] = useState('')
  const [revision, setRevision] = useState(0)
  const notificaciones = useNotificacionesOpcional()
  const vistaRef = useRef<VistaBalanceMes | null>(null)
  vistaRef.current = vista

  useEffect(() => {
    function recargarPorCompras() {
      setRevision((r) => r + 1)
    }
    window.addEventListener('hogar:compras-actualizadas', recargarPorCompras)
    return () => window.removeEventListener('hogar:compras-actualizadas', recargarPorCompras)
  }, [])

  const recargar = useCallback(() => setRevision((r) => r + 1), [])
  const notificar = useCallback(
    (mensaje: string) => {
      setToast(mensaje)
      notificaciones?.publicar({ mensaje, variante: 'exito' })
    },
    [notificaciones],
  )

  useEffect(() => {
    let vigente = true
    if (!vistaRef.current || vistaRef.current.periodo !== periodo) {
      setCargando(true)
    }
    setErrorCarga('')
    void controlador.cargarMes(periodo).then(
      (datos) => {
        if (!vigente) return
        setVista(datos)
        setCargando(false)
      },
      (causa: unknown) => {
        if (!vigente) return
        setErrorCarga(
          causa instanceof Error ? causa.message : 'No pudimos cargar el balance del mes.',
        )
        setCargando(false)
      },
    )
    return () => {
      vigente = false
    }
  }, [controlador, periodo, revision])

  const alternarMostrarPctIngreso = useCallback(
    async (valor: boolean): Promise<boolean> => {
      setErrorCarga('')
      try {
        const actualizada = await controlador.cambiarMostrarPctIngreso(valor, periodo)
        setVista(actualizada)
        return true
      } catch (causa) {
        setErrorCarga(
          causa instanceof Error ? causa.message : 'No pudimos actualizar la preferencia.',
        )
        return false
      }
    },
    [controlador, periodo],
  )

  const alternarIncluirPersonales = useCallback(
    async (valor: boolean) => {
      await controlador.guardarIncluirPersonales(valor)
      recargar()
    },
    [controlador, recargar],
  )

  return (
    <ContextoBalance.Provider
      value={{
        hogar,
        controlador,
        periodo,
        vista,
        cargando,
        errorCarga,
        toast,
        cambiarPeriodo: setPeriodo,
        alternarMostrarPctIngreso,
        alternarIncluirPersonales,
        recargar,
        notificar,
        limpiarToast: () => setToast(''),
      }}
    >
      {children}
    </ContextoBalance.Provider>
  )
}

export function useBalance(): ValorContextoBalance {
  const ctx = useContext(ContextoBalance)
  if (!ctx) {
    throw new Error('useBalance debe usarse dentro de ProveedorBalance')
  }
  return ctx
}
