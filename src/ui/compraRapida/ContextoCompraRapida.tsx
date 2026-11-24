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
import { crearControladorVisualCompraRapida } from './controladorVisual'

export type ToastGuardado = {
  loteId: string
  resumen: string
  conCuotas: boolean
}

export type DatosRecompra = {
  monto?: number | undefined
  categoriaId?: string | null | undefined
  descripcion?: string | undefined
  ambito?: Ambito | undefined
}

type ResultadoIntentoGuardar =
  | { estado: 'guardado'; toast: ToastGuardado }
  | { estado: 'error'; error: ErrorBorrador }
  | { estado: 'confirmar_duplicado' }
  | { estado: 'fallo'; mensaje: string }

type ValorContextoCompraRapida = {
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
  seleccionarCategoria: (categoriaId: string) => void
  seleccionarCuotas: (cuotas: number) => void
  aplicarDatosFactura: (params: {
    factura: DatosFactura
    categoriaId?: string | null | undefined
    nombreComercio?: string | null | undefined
    ambito?: Ambito | undefined
    monto?: number | undefined
    fecha?: string | undefined
  }) => void
  aplicarRecompra: (datos: DatosRecompra) => void
  guardarBorrador: (
    borradorExplicito?: BorradorCompra,
    opciones?: { ignorarDuplicadoInmediato?: boolean },
  ) => Promise<ResultadoIntentoGuardar>
  descartarConfirmacionDuplicado: () => void
  deshacerUltimoGuardado: () => Promise<void>
  anunciarEstado: (texto: string) => void
}

const ContextoCompraRapida = createContext<ValorContextoCompraRapida | null>(null)

function elegirMedioCompatible(
  controlador: ControladorCompraRapida,
  catalogo: CatalogoCompra,
  ambito: Ambito,
  preferidoId: string | null,
): string | null {
  const compatibles = controlador.mediosPara(catalogo, ambito)
  if (preferidoId && compatibles.some((m) => m.id === preferidoId)) {
    return preferidoId
  }
  const tarjeta = compatibles.find((m) => m.tipo === 'tarjeta')
  return tarjeta?.id ?? compatibles[0]?.id ?? null
}

export function ProveedorCompraRapida({
  hogar,
  crearControlador,
  children,
}: {
  hogar: Hogar
  crearControlador?: ((alcance: AlcanceCompra) => ControladorCompraRapida) | undefined
  children: ReactNode
}) {
  const hogarId = hogar.id
  const miembroId = hogar.miembroActual.id

  const controlador = useMemo(() => {
    if (crearControlador) {
      return crearControlador({ hogarId, miembroId })
    }
    return crearControladorVisualCompraRapida(hogar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crearControlador, hogarId, miembroId])

  const [catalogo, setCatalogo] = useState<CatalogoCompra | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [revision, setRevision] = useState(0)
  const [ultimoMedioId, setUltimoMedioId] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<BorradorCompra>(() =>
    controlador.borradorInicial(null),
  )
  const [toastGuardado, setToastGuardado] = useState<ToastGuardado | null>(null)
  const [avisoEstado, setAvisoEstado] = useState('')
  const [confirmacionDuplicado, setConfirmacionDuplicado] = useState(false)
  const [sync, setSync] = useState<EstadoSincronizacion | null>(null)

  const timerToastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const limpiarTimerToast = useCallback(() => {
    if (timerToastRef.current !== null) {
      clearTimeout(timerToastRef.current)
      timerToastRef.current = null
    }
  }, [])

  useEffect(() => limpiarTimerToast, [limpiarTimerToast])

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setErrorCarga('')
    void controlador
      .cargar()
      .then(async ({ catalogo: cat, ultimoMedioId: medioRecordado }) => {
        if (!vigente) return
        setCatalogo(cat)
        setUltimoMedioId(medioRecordado)
        const inicial = controlador.borradorInicial(medioRecordado)
        const medioValido = elegirMedioCompatible(
          controlador,
          cat,
          inicial.ambito,
          inicial.medioId,
        )
        setBorrador({ ...inicial, medioId: medioValido })
        setCargando(false)
        try {
          const estadoSync = await controlador.sincronizacion()
          if (vigente) setSync(estadoSync)
        } catch {
          // El estado de sincronización es informativo y no bloquea la carga
        }
      })
      .catch(() => {
        if (!vigente) return
        setErrorCarga('No pudimos cargar categorías y medios de pago.')
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [controlador, revision])

  const recargarCatalogo = useCallback(() => {
    setRevision((n) => n + 1)
  }, [])

  const mediosDisponibles = useMemo(() => {
    if (!catalogo) return []
    return controlador.mediosPara(catalogo, borrador.ambito)
  }, [catalogo, controlador, borrador.ambito])

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
        const sigueValido = prev.medioId && compatibles.some((m) => m.id === prev.medioId)
        const medioId = sigueValido
          ? prev.medioId
          : elegirMedioCompatible(controlador, catalogo, ambito, ultimoMedioId)
        const medioElegido = compatibles.find((m) => m.id === medioId)
        return {
          ...prev,
          ambito,
          medioId,
          cuotas: medioElegido?.tipo === 'tarjeta' ? prev.cuotas : 1,
        }
      })
    },
    [catalogo, controlador, ultimoMedioId],
  )

  const seleccionarMedio = useCallback(
    (medioId: string) => {
      setConfirmacionDuplicado(false)
      setBorrador((prev) => {
        const medioElegido = mediosDisponibles.find((m) => m.id === medioId)
        return {
          ...prev,
          medioId,
          cuotas: medioElegido?.tipo === 'tarjeta' ? prev.cuotas : 1,
        }
      })
    },
    [mediosDisponibles],
  )

  const seleccionarCategoria = useCallback((categoriaId: string) => {
    setConfirmacionDuplicado(false)
    setBorrador((prev) => ({ ...prev, categoriaId }))
  }, [])

  const seleccionarCuotas = useCallback((cuotas: number) => {
    setConfirmacionDuplicado(false)
    setBorrador((prev) => ({ ...prev, cuotas }))
  }, [])

  const aplicarDatosFactura = useCallback(
    (params: {
      factura: DatosFactura
      categoriaId?: string | null | undefined
      nombreComercio?: string | null | undefined
      ambito?: Ambito | undefined
      monto?: number | undefined
      fecha?: string | undefined
    }) => {
      setConfirmacionDuplicado(false)
      setBorrador((prev) => {
        const ambitoFinal = params.ambito ?? prev.ambito
        const medioId = catalogo
          ? elegirMedioCompatible(controlador, catalogo, ambitoFinal, prev.medioId)
          : prev.medioId
        return {
          ...prev,
          ambito: ambitoFinal,
          medioId,
          monto: params.monto ?? params.factura.montoTotal ?? prev.monto,
          fecha: params.fecha ?? params.factura.fecha ?? prev.fecha,
          categoriaId:
            params.categoriaId !== undefined ? params.categoriaId : prev.categoriaId,
          factura: params.factura,
          nombreComercio:
            params.nombreComercio !== undefined
              ? params.nombreComercio
              : prev.nombreComercio,
          descripcion:
            prev.descripcion || (params.nombreComercio ? params.nombreComercio : ''),
        }
      })
    },
    [catalogo, controlador],
  )

  const aplicarRecompra = useCallback(
    (datos: DatosRecompra) => {
      setConfirmacionDuplicado(false)
      setBorrador((prev) => ({
        ...prev,
        ambito: datos.ambito ?? 'hogar',
        monto: datos.monto ?? prev.monto,
        categoriaId: datos.categoriaId !== undefined ? datos.categoriaId : prev.categoriaId,
        descripcion: datos.descripcion ?? prev.descripcion,
      }))
    },
    [],
  )

  const anunciarEstado = useCallback((texto: string) => {
    setAvisoEstado(texto)
  }, [])

  const guardarBorrador = useCallback(
    async (
      borradorExplicito?: BorradorCompra,
      opciones?: { ignorarDuplicadoInmediato?: boolean },
    ): Promise<ResultadoIntentoGuardar> => {
      if (!catalogo) {
        return { estado: 'fallo', mensaje: 'Todavía están cargando los datos del hogar.' }
      }
      const objetivo = borradorExplicito ?? borrador
      const error = controlador.validar(objetivo, catalogo)
      if (error) {
        setAvisoEstado(error.mensaje)
        return { estado: 'error', error }
      }

      if (!opciones?.ignorarDuplicadoInmediato) {
        const esDuplicado = await controlador.posibleDuplicado(objetivo)
        if (esDuplicado) {
          setConfirmacionDuplicado(true)
          setAvisoEstado(
            'Ya registraste una compra igual hace menos de un minuto. Confirmá si querés guardarla de nuevo.',
          )
          return { estado: 'confirmar_duplicado' }
        }
      }

      setGuardando(true)
      setConfirmacionDuplicado(false)
      try {
        const resultado = await controlador.guardar(objetivo, catalogo)
        const medioUsado = controlador
          .mediosPara(catalogo, objetivo.ambito)
          .find((m) => m.id === objetivo.medioId)
        const toast: ToastGuardado = {
          loteId: resultado.loteId,
          resumen: resultado.resumen,
          conCuotas: medioUsado?.tipo === 'tarjeta' && objetivo.cuotas > 1,
        }

        setUltimoMedioId(objetivo.medioId)
        const siguiente = controlador.borradorInicial(objetivo.medioId)
        const medioSiguiente = elegirMedioCompatible(
          controlador,
          catalogo,
          siguiente.ambito,
          siguiente.medioId,
        )
        setBorrador({ ...siguiente, medioId: medioSiguiente })

        limpiarTimerToast()
        setToastGuardado(toast)
        setAvisoEstado(resultado.resumen)
        timerToastRef.current = setTimeout(() => {
          setToastGuardado(null)
          timerToastRef.current = null
        }, VENTANA_DESHACER_MS)

        try {
          const estadoSync = await controlador.sincronizacion()
          setSync(estadoSync)
        } catch {
          // informativo
        }

        return { estado: 'guardado', toast }
      } catch (causa) {
        const texto =
          causa instanceof Error && causa.message
            ? causa.message
            : 'No pudimos guardar la compra. Intentá de nuevo.'
        setAvisoEstado(texto)
        return { estado: 'fallo', mensaje: texto }
      } finally {
        setGuardando(false)
      }
    },
    [borrador, catalogo, controlador, limpiarTimerToast],
  )

  const descartarConfirmacionDuplicado = useCallback(() => {
    setConfirmacionDuplicado(false)
  }, [])

  const deshacerUltimoGuardado = useCallback(async () => {
    if (!toastGuardado) return
    const { loteId } = toastGuardado
    limpiarTimerToast()
    setToastGuardado(null)
    try {
      await controlador.deshacer(loteId)
      setAvisoEstado('Compra deshecha.')
      try {
        const estadoSync = await controlador.sincronizacion()
        setSync(estadoSync)
      } catch {
        // informativo
      }
    } catch (causa) {
      const texto =
        causa instanceof Error && causa.message
          ? causa.message
          : 'No pudimos deshacer la compra.'
      setAvisoEstado(texto)
    }
  }, [controlador, limpiarTimerToast, toastGuardado])

  const valor: ValorContextoCompraRapida = {
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
    recargarCatalogo,
    setBorrador,
    cambiarAmbito,
    seleccionarMedio,
    seleccionarCategoria,
    seleccionarCuotas,
    aplicarDatosFactura,
    aplicarRecompra,
    guardarBorrador,
    descartarConfirmacionDuplicado,
    deshacerUltimoGuardado,
    anunciarEstado,
  }

  return (
    <ContextoCompraRapida.Provider value={valor}>{children}</ContextoCompraRapida.Provider>
  )
}

export function useCompraRapida(): ValorContextoCompraRapida {
  const ctx = useContext(ContextoCompraRapida)
  if (!ctx) {
    throw new Error('useCompraRapida debe usarse dentro de ProveedorCompraRapida')
  }
  return ctx
}
