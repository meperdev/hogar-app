import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  VENTANA_DESHACER_MS,
  type AlcanceCompra,
  type Ambito,
  type BorradorCompra,
  type CatalogoCompra,
  type ControladorCompraRapida,
  type DatosFactura,
  type ErrorBorrador,
  type EstadoSincronizacion,
  type MedioOpcion,
} from '../../app/compraRapida'
import type { Hogar } from '../../app/fundacion'
import { useNotificacionesOpcional } from '../Notificaciones'

export type ToastGuardado = { loteId: string; resumen: string; conCuotas: boolean }
export type DatosRecompra = {
  monto?: number | undefined
  categoriaId?: string | null | undefined
  descripcion?: string | undefined
  ambito?: Ambito | undefined
}
type ResultadoGuardarUI =
  | { estado: 'guardado'; toast: ToastGuardado }
  | { estado: 'error'; error: ErrorBorrador }
  | { estado: 'confirmar_duplicado' }
  | { estado: 'fallo'; mensaje: string }

type ValorContexto = {
  hogar: Hogar
  controlador: ControladorCompraRapida
  catalogo: CatalogoCompra | null
  cargando: boolean
  errorCarga: string
  guardando: boolean
  borrador: BorradorCompra
  mediosDisponibles: MedioOpcion[]
  medioSeleccionado: MedioOpcion | null
  toastGuardado: ToastGuardado | null
  avisoEstado: string
  confirmacionDuplicado: boolean
  sync: EstadoSincronizacion | null
  recargarCatalogo: () => void
  setBorrador: React.Dispatch<React.SetStateAction<BorradorCompra>>
  cambiarAmbito: (ambito: Ambito) => void
  seleccionarMedio: (medioId: string) => void
  aplicarDatosFactura: (p: {
    factura: DatosFactura
    categoriaId?: string | null | undefined
    nombreComercio?: string | null | undefined
    ambito?: Ambito | undefined
    monto?: number | undefined
    fecha?: string | undefined
  }) => void
  aplicarRecompra: (datos: DatosRecompra) => void
  guardarBorrador: (b?: BorradorCompra, opts?: { ignorarDuplicadoInmediato?: boolean }) => Promise<ResultadoGuardarUI>
  descartarConfirmacionDuplicado: () => void
  deshacerUltimoGuardado: () => Promise<void>
  anunciarEstado: (texto: string) => void
}

const ContextoCompraRapida = createContext<ValorContexto | null>(null)

function medioCompatible(ctrl: ControladorCompraRapida, cat: CatalogoCompra, ambito: Ambito, preferido: string | null) {
  const compatibles = ctrl.mediosPara(cat, ambito)
  if (preferido && compatibles.some((m) => m.id === preferido)) return preferido
  return compatibles.find((m) => m.tipo === 'tarjeta')?.id ?? compatibles[0]?.id ?? null
}

export function ProveedorCompraRapida({
  hogar,
  crearControlador,
  children,
}: {
  hogar: Hogar
  crearControlador: (alcance: AlcanceCompra) => ControladorCompraRapida
  children: ReactNode
}) {
  const hogarId = hogar.id
  const miembroId = hogar.miembroActual.id
  const controlador = useMemo(() => crearControlador({ hogarId, miembroId }), [crearControlador, hogarId, miembroId])

  const [catalogo, setCatalogo] = useState<CatalogoCompra | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [revision, setRevision] = useState(0)
  const [ultimoMedioId, setUltimoMedioId] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<BorradorCompra>(() => controlador.borradorInicial(null))
  const [toastGuardado, setToastGuardado] = useState<ToastGuardado | null>(null)
  const [avisoEstado, setAvisoEstado] = useState('')
  const [confirmacionDuplicado, setConfirmacionDuplicado] = useState(false)
  const [sync, setSync] = useState<EstadoSincronizacion | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendientesPreviosRef = useRef(0)
  const notificaciones = useNotificacionesOpcional()

  const notificarComprasActualizadas = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('hogar:compras-actualizadas'))
    }
  }, [])

  const limpiarTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])
  useEffect(() => limpiarTimer, [limpiarTimer])

  const refrescarSync = useCallback(async () => {
    try {
      const siguiente = await controlador.sincronizacion()
      const previos = pendientesPreviosRef.current
      pendientesPreviosRef.current = siguiente.pendientes
      setSync(siguiente)
      if (previos > 0 && siguiente.pendientes < previos) {
        notificarComprasActualizadas()
      }
    } catch {
      // informativo
    }
  }, [controlador, notificarComprasActualizadas])

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setErrorCarga('')
    void controlador
      .cargar()
      .then(async ({ catalogo: cat, ultimoMedioId: med }) => {
        if (!vigente) return
        setCatalogo(cat)
        setUltimoMedioId(med)
        const ini = controlador.borradorInicial(med)
        setBorrador({ ...ini, medioId: medioCompatible(controlador, cat, ini.ambito, ini.medioId) })
        setCargando(false)
        await refrescarSync()
      })
      .catch(() => {
        if (vigente) {
          setErrorCarga('No pudimos cargar categorías y medios de pago.')
          setCargando(false)
        }
      })
    return () => {
      vigente = false
    }
  }, [controlador, refrescarSync, revision])

  const mediosDisponibles = useMemo(
    () => (catalogo ? controlador.mediosPara(catalogo, borrador.ambito) : []),
    [catalogo, controlador, borrador.ambito],
  )
  const medioSeleccionado = useMemo(
    () => mediosDisponibles.find((m) => m.id === borrador.medioId) ?? null,
    [mediosDisponibles, borrador.medioId],
  )

  const cambiarAmbito = useCallback(
    (ambito: Ambito) => {
      setConfirmacionDuplicado(false)
      setBorrador((prev) => {
        if (!catalogo) return { ...prev, ambito }
        const compatibles = controlador.mediosPara(catalogo, ambito)
        const medioId =
          prev.medioId && compatibles.some((m) => m.id === prev.medioId)
            ? prev.medioId
            : medioCompatible(controlador, catalogo, ambito, ultimoMedioId)
        const elegido = compatibles.find((m) => m.id === medioId)
        return { ...prev, ambito, medioId, cuotas: elegido?.tipo === 'tarjeta' ? prev.cuotas : 1 }
      })
    },
    [catalogo, controlador, ultimoMedioId],
  )

  const seleccionarMedio = useCallback(
    (medioId: string) => {
      setConfirmacionDuplicado(false)
      setBorrador((prev) => {
        const elegido = mediosDisponibles.find((m) => m.id === medioId)
        return { ...prev, medioId, cuotas: elegido?.tipo === 'tarjeta' ? prev.cuotas : 1 }
      })
    },
    [mediosDisponibles],
  )

  const aplicarDatosFactura = useCallback(
    (p: {
      factura: DatosFactura
      categoriaId?: string | null | undefined
      nombreComercio?: string | null | undefined
      ambito?: Ambito | undefined
      monto?: number | undefined
      fecha?: string | undefined
    }) => {
      setConfirmacionDuplicado(false)
      setBorrador((prev) => {
        const ambito = p.ambito ?? prev.ambito
        return {
          ...prev,
          ambito,
          medioId: catalogo ? medioCompatible(controlador, catalogo, ambito, prev.medioId) : prev.medioId,
          monto: p.monto ?? p.factura.montoTotal ?? prev.monto,
          fecha: p.fecha ?? p.factura.fecha ?? prev.fecha,
          categoriaId: p.categoriaId !== undefined ? p.categoriaId : prev.categoriaId,
          factura: p.factura,
          nombreComercio: p.nombreComercio !== undefined ? p.nombreComercio : prev.nombreComercio,
          descripcion: prev.descripcion || p.nombreComercio || '',
        }
      })
    },
    [catalogo, controlador],
  )

  const aplicarRecompra = useCallback((d: DatosRecompra) => {
    setConfirmacionDuplicado(false)
    setBorrador((prev) => ({
      ...prev,
      ambito: d.ambito ?? 'hogar',
      monto: d.monto ?? prev.monto,
      categoriaId: d.categoriaId !== undefined ? d.categoriaId : prev.categoriaId,
      descripcion: d.descripcion ?? prev.descripcion,
    }))
  }, [])

  const deshacerPorLote = useCallback(
    async (loteId: string) => {
      limpiarTimer()
      notificaciones?.cerrar(`compra-${loteId}`)
      setToastGuardado((actual) => (actual?.loteId === loteId ? null : actual))
      try {
        await controlador.deshacer(loteId)
        setAvisoEstado('Compra deshecha.')
        notificaciones?.publicar({
          mensaje: 'Compra deshecha.',
          variante: 'info',
          duracionMs: 3200,
        })
        await refrescarSync()
        notificarComprasActualizadas()
      } catch (causa) {
        const msg =
          causa instanceof Error && causa.message
            ? causa.message
            : 'No pudimos deshacer la compra.'
        setAvisoEstado(msg)
        notificaciones?.publicar({ mensaje: msg, variante: 'peligro', duracionMs: 4200 })
      }
    },
    [controlador, limpiarTimer, notificarComprasActualizadas, notificaciones, refrescarSync],
  )

  const guardarBorrador = useCallback(
    async (b?: BorradorCompra, opts?: { ignorarDuplicadoInmediato?: boolean }): Promise<ResultadoGuardarUI> => {
      if (!catalogo) return { estado: 'fallo', mensaje: 'Todavía están cargando los datos del hogar.' }
      const obj = b ?? borrador
      const error = controlador.validar(obj, catalogo)
      if (error) {
        setAvisoEstado(error.mensaje)
        return { estado: 'error', error }
      }
      if (!opts?.ignorarDuplicadoInmediato && (await controlador.posibleDuplicado(obj))) {
        setConfirmacionDuplicado(true)
        setAvisoEstado('Posible compra duplicada. Confirma si quieres guardarla de nuevo.')
        return { estado: 'confirmar_duplicado' }
      }
      setGuardando(true)
      setConfirmacionDuplicado(false)
      try {
        const res = await controlador.guardar(obj, catalogo)
        const usado = controlador.mediosPara(catalogo, obj.ambito).find((m) => m.id === obj.medioId)
        const toast: ToastGuardado = { loteId: res.loteId, resumen: res.resumen, conCuotas: usado?.tipo === 'tarjeta' && obj.cuotas > 1 }
        setUltimoMedioId(obj.medioId)
        const sig = controlador.borradorInicial(obj.medioId)
        setBorrador({ ...sig, medioId: medioCompatible(controlador, catalogo, sig.ambito, sig.medioId) })
        limpiarTimer()
        setToastGuardado(toast)
        setAvisoEstado(res.resumen)
        notificaciones?.publicar({
          id: `compra-${res.loteId}`,
          mensaje: res.resumen,
          variante: 'exito',
          duracionMs: VENTANA_DESHACER_MS,
          acciones: [
            ...(toast.conCuotas
              ? [{ tipo: 'enlace' as const, etiqueta: 'Ver cuotas', to: '/obligaciones' }]
              : []),
            {
              tipo: 'boton' as const,
              etiqueta: 'Deshacer',
              onClick: () => void deshacerPorLote(res.loteId),
            },
          ],
        })
        timerRef.current = setTimeout(() => {
          setToastGuardado(null)
          timerRef.current = null
        }, VENTANA_DESHACER_MS)
        await refrescarSync()
        notificarComprasActualizadas()
        return { estado: 'guardado', toast }
      } catch (causa) {
        const mensaje = causa instanceof Error && causa.message ? causa.message : 'No pudimos guardar la compra.'
        setAvisoEstado(mensaje)
        return { estado: 'fallo', mensaje }
      } finally {
        setGuardando(false)
      }
    },
    [
      borrador,
      catalogo,
      controlador,
      deshacerPorLote,
      limpiarTimer,
      notificarComprasActualizadas,
      notificaciones,
      refrescarSync,
    ],
  )

  const deshacerUltimoGuardado = useCallback(async () => {
    if (!toastGuardado) return
    await deshacerPorLote(toastGuardado.loteId)
  }, [deshacerPorLote, toastGuardado])

  return (
    <ContextoCompraRapida.Provider
      value={{
        hogar,
        controlador,
        catalogo,
        cargando,
        errorCarga,
        guardando,
        borrador,
        mediosDisponibles,
        medioSeleccionado,
        toastGuardado,
        avisoEstado,
        confirmacionDuplicado,
        sync,
        recargarCatalogo: () => setRevision((n) => n + 1),
        setBorrador,
        cambiarAmbito,
        seleccionarMedio,
        aplicarDatosFactura,
        aplicarRecompra,
        guardarBorrador,
        descartarConfirmacionDuplicado: () => setConfirmacionDuplicado(false),
        deshacerUltimoGuardado,
        anunciarEstado: setAvisoEstado,
      }}
    >
      {children}
    </ContextoCompraRapida.Provider>
  )
}

export function useCompraRapida(): ValorContexto {
  const ctx = useContext(ContextoCompraRapida)
  if (!ctx) throw new Error('useCompraRapida debe usarse dentro de ProveedorCompraRapida')
  return ctx
}

export function useRecargarCatalogoCompraOpcional(): (() => void) | null {
  return useContext(ContextoCompraRapida)?.recargarCatalogo ?? null
}
