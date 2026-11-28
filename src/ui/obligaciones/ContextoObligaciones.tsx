import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AlcanceCompra } from '../../app/compraRapida'
import type { Hogar } from '../../app/fundacion'
import type {
  AgendaMes,
  ControladorObligaciones,
  EditarPagoEntrada,
  ItemCuota,
  ItemObligacion,
  ItemPasivoSaldo,
  MedioPagoOpcion,
} from '../../app/obligaciones'
import { hoyCivil } from '../../domain/fechas'
import { useNotificacionesOpcional } from '../Notificaciones'

type ValorContextoObligaciones = {
  hogar: Hogar
  controlador: ControladorObligaciones
  periodo: string
  agenda: AgendaMes | null
  medios: MedioPagoOpcion[]
  incluirPersonales: boolean
  cargando: boolean
  errorCarga: string
  toast: string
  cambiarPeriodo: (siguiente: string) => void
  alternarIncluirPersonales: (valor: boolean) => Promise<void>
  recargar: () => void
  mostrarToast: (mensaje: string) => void
  limpiarToast: () => void
  buscarCuota: (cuotaId: string) => ItemCuota | null
  buscarObligacion: (obligacionId: string) => ItemObligacion | null
  buscarPasivo: (pasivoId: string) => ItemPasivoSaldo | null
  editarPago: (entrada: EditarPagoEntrada) => Promise<void>
  eliminarPago: (pagoId: string) => Promise<void>
}

const ContextoObligaciones = createContext<ValorContextoObligaciones | null>(null)

export function ProveedorObligaciones({
  hogar, crearControlador, periodoInicial, children,
}: {
  hogar: Hogar
  crearControlador: (alcance: AlcanceCompra) => ControladorObligaciones
  periodoInicial?: string | undefined
  children: ReactNode
}) {
  const hogarId = hogar.id
  const miembroId = hogar.miembroActual.id
  const controlador = useMemo(() => crearControlador({ hogarId, miembroId }), [crearControlador, hogarId, miembroId])

  const [periodo, setPeriodo] = useState(() => periodoInicial ?? hoyCivil(new Date()).slice(0, 7))
  const [agenda, setAgenda] = useState<AgendaMes | null>(null)
  const [medios, setMedios] = useState<MedioPagoOpcion[]>([])
  const [incluirPersonales, setIncluirPersonales] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [toast, setToast] = useState('')
  const [revision, setRevision] = useState(0)
  const agendaRef = useRef<AgendaMes | null>(null)
  agendaRef.current = agenda
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
    window.addEventListener('hogar:compras-actualizadas', recargarPorActualizacion)
    return () => window.removeEventListener('hogar:compras-actualizadas', recargarPorActualizacion)
  }, [])

  useEffect(() => {
    let vigente = true
    if (!agendaRef.current || agendaRef.current.resumen.periodo !== periodo) {
      setCargando(true)
    }
    setErrorCarga('')
    void Promise.all([controlador.cargarMes(periodo), controlador.leerIncluirPersonales(), controlador.medios()])
      .then(([agendaCargada, prefPersonales, mediosCargados]) => {
        if (!vigente) return
        setAgenda(agendaCargada)
        setIncluirPersonales(prefPersonales)
        setMedios(mediosCargados)
        setCargando(false)
      })
      .catch(() => {
        if (!vigente) return
        setErrorCarga('No pudimos cargar las obligaciones del mes.')
        setCargando(false)
      })
    return () => { vigente = false }
  }, [controlador, periodo, revision])

  const alternarIncluirPersonales = useCallback(async (valor: boolean) => {
    setIncluirPersonales(valor)
    try {
      await controlador.guardarIncluirPersonales(valor)
      setAgenda(await controlador.cargarMes(periodo))
    } catch {
      setIncluirPersonales(!valor)
      setErrorCarga('No pudimos actualizar la preferencia local.')
    }
  }, [controlador, periodo])

  const todos = useMemo(() => (agenda ? [...agenda.vencidas, ...agenda.pendientes, ...agenda.pagadas] : []), [agenda])
  const buscarCuota = useCallback(
    (cuotaId: string) => todos.find((i): i is ItemCuota => i.tipo === 'cuota' && i.cuotaId === cuotaId) ?? null,
    [todos],
  )
  const buscarObligacion = useCallback(
    (obligacionId: string) => todos.find((i): i is ItemObligacion => i.tipo === 'obligacion' && i.obligacionId === obligacionId) ?? null,
    [todos],
  )
  const buscarPasivo = useCallback(
    (pasivoId: string) => agenda?.pasivos?.find((p) => p.pasivoId === pasivoId) ?? null,
    [agenda],
  )

  const recargar = useCallback(() => setRevision((actual) => actual + 1), [])

  const editarPago = useCallback(
    async (entrada: EditarPagoEntrada) => {
      if (!controlador.editarPago) {
        throw new Error('La edición de abonos no está disponible.')
      }
      await controlador.editarPago(entrada)
      mostrarToast('Abono actualizado')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hogar:compras-actualizadas'))
      }
      recargar()
    },
    [controlador, mostrarToast, recargar],
  )

  const eliminarPago = useCallback(
    async (pagoId: string) => {
      if (!controlador.eliminarPago) {
        throw new Error('La eliminación de abonos no está disponible.')
      }
      await controlador.eliminarPago(pagoId)
      mostrarToast('Abono eliminado')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hogar:compras-actualizadas'))
      }
      recargar()
    },
    [controlador, mostrarToast, recargar],
  )

  return (
    <ContextoObligaciones.Provider
      value={{
        hogar, controlador, periodo, agenda, medios, incluirPersonales, cargando, errorCarga, toast,
        cambiarPeriodo: setPeriodo, alternarIncluirPersonales,
        recargar,
        mostrarToast,
        limpiarToast: () => setToast(''),
        buscarCuota, buscarObligacion, buscarPasivo,
        editarPago,
        eliminarPago,
      }}
    >
      {children}
    </ContextoObligaciones.Provider>
  )
}

export function useObligaciones(): ValorContextoObligaciones {
  const ctx = useContext(ContextoObligaciones)
  if (!ctx) throw new Error('useObligaciones debe usarse dentro de ProveedorObligaciones')
  return ctx
}
