import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AlcanceCompra } from '../../app/compraRapida'
import type { Hogar } from '../../app/fundacion'
import type { ControladorMascotas, VistaDespensa } from '../../app/mascotas'
import { hoyCivil } from '../../domain/fechas'

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

  useEffect(() => {
    let vigente = true
    setCargando(true)
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
        recargar: () => setRevision((actual) => actual + 1),
        mostrarToast: setToast,
        limpiarToast: () => setToast(''),
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
