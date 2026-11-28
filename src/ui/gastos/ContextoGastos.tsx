import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AlcanceCompra } from '../../app/compraRapida'
import type { Hogar } from '../../app/fundacion'
import { useNotificacionesOpcional } from '../Notificaciones'
import type { ControladorGastos, FiltroAmbitoGastos, VistaGastosMes } from '../../app/gastos'
import { hoyCivil } from '../../domain/fechas'

type ValorContextoGastos = {
  hogar: Hogar
  controlador: ControladorGastos
  periodo: string
  ambito: FiltroAmbitoGastos
  vista: VistaGastosMes | null
  cargando: boolean
  errorCarga: string
  toast: string
  limpiarToast: () => void
  cambiarPeriodo: (siguiente: string) => void
  cambiarAmbito: (siguiente: FiltroAmbitoGastos) => void
  recargar: () => void
  editarCompra: ControladorGastos['editarCompra']
  anularCompra: ControladorGastos['anularCompra']
  editarAbono: NonNullable<ControladorGastos['editarAbono']>
  eliminarAbono: NonNullable<ControladorGastos['eliminarAbono']>
}

const ContextoGastos = createContext<ValorContextoGastos | null>(null)

export function ProveedorGastos({
  hogar,
  crearControlador,
  periodoInicial,
  children,
}: {
  hogar: Hogar
  crearControlador: (alcance: AlcanceCompra) => ControladorGastos
  periodoInicial?: string | undefined
  children: ReactNode
}) {
  const hogarId = hogar.id
  const miembroId = hogar.miembroActual.id
  const controlador = useMemo(
    () => crearControlador({ hogarId, miembroId }),
    [crearControlador, hogarId, miembroId],
  )

  const [periodo, setPeriodo] = useState(
    () => periodoInicial ?? hoyCivil(new Date()).slice(0, 7),
  )
  const [ambito, setAmbito] = useState<FiltroAmbitoGastos>('hogar')
  const [vista, setVista] = useState<VistaGastosMes | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [toast, setToast] = useState('')
  const [revision, setRevision] = useState(0)
  const vistaRef = useRef<VistaGastosMes | null>(null)
  vistaRef.current = vista
  const notificaciones = useNotificacionesOpcional()

  useEffect(() => {
    let vigente = true
    if (!vistaRef.current) {
      setCargando(true)
    }
    setErrorCarga('')
    void controlador
      .cargarMes(periodo, ambito)
      .then((res) => {
        if (!vigente) return
        setVista(res)
        setCargando(false)
      })
      .catch((causa: unknown) => {
        if (!vigente) return
        setErrorCarga(
          causa instanceof Error ? causa.message : 'No pudimos cargar los gastos del mes.',
        )
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [controlador, periodo, ambito, revision])

  const recargar = useCallback(() => {
    setRevision((actual) => actual + 1)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const manejarActualizacion = () => recargar()
    window.addEventListener('hogar:compras-actualizadas', manejarActualizacion)
    return () => {
      window.removeEventListener('hogar:compras-actualizadas', manejarActualizacion)
    }
  }, [recargar])

  const limpiarToast = useCallback(() => {
    setToast('')
  }, [])

  const mostrarToast = useCallback(
    (mensaje: string) => {
      setToast(mensaje)
      notificaciones?.publicar({ mensaje, variante: 'exito' })
      setTimeout(() => {
        setToast((actual) => (actual === mensaje ? '' : actual))
      }, 3500)
    },
    [notificaciones],
  )

  const editarCompra: ControladorGastos['editarCompra'] = useCallback(
    async (entrada) => {
      await controlador.editarCompra(entrada)
      mostrarToast('Compra actualizada')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hogar:compras-actualizadas'))
      }
      recargar()
    },
    [controlador, mostrarToast, recargar],
  )

  const anularCompra: ControladorGastos['anularCompra'] = useCallback(
    async (compraId) => {
      await controlador.anularCompra(compraId)
      mostrarToast('Compra anulada')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hogar:compras-actualizadas'))
      }
      recargar()
    },
    [controlador, mostrarToast, recargar],
  )

  const editarAbono: NonNullable<ControladorGastos['editarAbono']> = useCallback(
    async (entrada) => {
      if (!controlador.editarAbono) {
        throw new Error('La edición de abonos no está disponible.')
      }
      await controlador.editarAbono(entrada)
      mostrarToast('Abono actualizado')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hogar:compras-actualizadas'))
      }
      recargar()
    },
    [controlador, mostrarToast, recargar],
  )

  const eliminarAbono: NonNullable<ControladorGastos['eliminarAbono']> = useCallback(
    async (pagoId) => {
      if (!controlador.eliminarAbono) {
        throw new Error('La eliminación de abonos no está disponible.')
      }
      await controlador.eliminarAbono(pagoId)
      mostrarToast('Abono eliminado')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hogar:compras-actualizadas'))
      }
      recargar()
    },
    [controlador, mostrarToast, recargar],
  )

  return (
    <ContextoGastos.Provider
      value={{
        hogar,
        controlador,
        periodo,
        ambito,
        vista,
        cargando,
        errorCarga,
        toast,
        limpiarToast,
        cambiarPeriodo: setPeriodo,
        cambiarAmbito: setAmbito,
        recargar,
        editarCompra,
        anularCompra,
        editarAbono,
        eliminarAbono,
      }}
    >
      {children}
    </ContextoGastos.Provider>
  )
}

export function useGastos(): ValorContextoGastos {
  const ctx = useContext(ContextoGastos)
  if (!ctx) throw new Error('useGastos debe usarse dentro de ProveedorGastos')
  return ctx
}
