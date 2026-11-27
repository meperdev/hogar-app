import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AlcanceCompra } from '../../app/compraRapida'
import type { Hogar } from '../../app/fundacion'
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

  useEffect(() => {
    let vigente = true
    setCargando(true)
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

  const limpiarToast = useCallback(() => {
    setToast('')
  }, [])

  const mostrarToast = useCallback((mensaje: string) => {
    setToast(mensaje)
    setTimeout(() => {
      setToast((actual) => (actual === mensaje ? '' : actual))
    }, 3500)
  }, [])

  const editarCompra: ControladorGastos['editarCompra'] = useCallback(
    async (entrada) => {
      await controlador.editarCompra(entrada)
      mostrarToast('Compra actualizada')
      recargar()
    },
    [controlador, mostrarToast, recargar],
  )

  const anularCompra: ControladorGastos['anularCompra'] = useCallback(
    async (compraId) => {
      await controlador.anularCompra(compraId)
      mostrarToast('Compra anulada')
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
