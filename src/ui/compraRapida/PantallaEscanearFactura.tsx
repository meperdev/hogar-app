import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CHIPS_CUOTAS,
  type Ambito,
  type CompraExistente,
  type DatosFactura,
} from '../../app/compraRapida'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonIndigo,
  claseBotonPequenoPrimario,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { useCompraRapida } from './ContextoCompraRapida'
import { SelectorAmbito } from './PantallaCompraRapida'
import {
  esUrlDianValida,
  fechaHoyBogota,
  formatearCop,
  formatearFechaCortaEs,
  parsearDigitosCop,
  truncarCufe,
} from './formatoCop'

type EstadoVisor =
  | { paso: 'leyendo'; errorQr: string }
  | {
      paso: 'precargado'
      factura: DatosFactura
      sugerencia: { nombreComercio: string; categoriaId: string | null } | null
    }
  | { paso: 'solo_url'; factura: DatosFactura }
  | { paso: 'duplicado'; existente: CompraExistente; urlVerificacion: string | null }

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike
  }
}

export function PantallaEscanearFactura() {
  const navigate = useNavigate()
  const {
    hogar,
    controlador,
    catalogo,
    guardando,
    borrador,
    medioSeleccionado,
    aplicarDatosFactura,
    seleccionarCuotas,
    guardarBorrador,
  } = useCompraRapida()

  const [visor, setVisor] = useState<EstadoVisor>({ paso: 'leyendo', errorQr: '' })
  const [textoQrManual, setTextoQrManual] = useState('')
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [avisoOcr, setAvisoOcr] = useState('')

  // Campos editables al confirmar factura
  const [ambitoLocal, setAmbitoLocal] = useState<Ambito>(borrador.ambito)
  const [categoriaLocal, setCategoriaLocal] = useState<string | null>(borrador.categoriaId)
  const [montoLocal, setMontoLocal] = useState<number>(0)
  const [ivaLocal, setIvaLocal] = useState<number | null>(null)
  const [fechaLocal, setFechaLocal] = useState<string>(fechaHoyBogota())
  const [nombreComercioLocal, setNombreComercioLocal] = useState<string>('')
  const [nitEditable, setNitEditable] = useState<string>('')
  const [errorGuardar, setErrorGuardar] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const inputOcrRef = useRef<HTMLInputElement>(null)

  const categoriasOrdenadas = catalogo
    ? [...catalogo.categorias].sort((a, b) => a.orden - b.orden)
    : []

  async function procesarTextoQr(texto: string) {
    setErrorGuardar('')
    const resultado = await controlador.escanear(texto)
    if (resultado.estado === 'invalido') {
      setVisor({ paso: 'leyendo', errorQr: resultado.mensaje })
      return
    }
    if (resultado.estado === 'duplicado') {
      setVisor({
        paso: 'duplicado',
        existente: resultado.existente,
        urlVerificacion: resultado.urlVerificacion,
      })
      return
    }

    const { factura, sugerencia, formato } = resultado
    setMontoLocal(factura.montoTotal ?? 0)
    setIvaLocal(factura.iva)
    setFechaLocal(factura.fecha ?? fechaHoyBogota())
    setNitEditable(factura.nitComercio ?? '')
    setNombreComercioLocal(sugerencia?.nombreComercio ?? '')
    setCategoriaLocal(sugerencia?.categoriaId ?? null)

    if (formato === 'url') {
      setVisor({ paso: 'solo_url', factura })
    } else {
      setVisor({ paso: 'precargado', factura, sugerencia })
    }
  }

  // Intento progresivo de cámara + BarcodeDetector cuando está leyendo QR
  useEffect(() => {
    if (visor.paso !== 'leyendo') return
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window === 'undefined' ||
      !window.BarcodeDetector
    ) {
      return
    }

    let cancelado = false
    let stream: MediaStream | null = null
    let timerDeteccion: ReturnType<typeof setInterval> | null = null

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((media) => {
        if (cancelado) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream = media
        setCamaraActiva(true)
        if (videoRef.current) {
          videoRef.current.srcObject = media
        }
        const Detector = window.BarcodeDetector
        if (!Detector) return
        const detector = new Detector({ formats: ['qr_code'] })
        timerDeteccion = setInterval(() => {
          if (!videoRef.current || cancelado) return
          void detector
            .detect(videoRef.current)
            .then((codigos) => {
              const valor = codigos[0]?.rawValue
              if (valor && !cancelado) {
                void procesarTextoQr(valor)
              }
            })
            .catch(() => {
              // Ignorar frames sin lectura
            })
        }, 450)
      })
      .catch(() => {
        if (!cancelado) setCamaraActiva(false)
      })

    return () => {
      cancelado = true
      setCamaraActiva(false)
      if (timerDeteccion) clearInterval(timerDeteccion)
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visor.paso])

  function manejarEnviarQrManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void procesarTextoQr(textoQrManual)
  }

  function construirBorradorFactura(factura: DatosFactura, origen: 'qr' | 'ocr') {
    const medios = catalogo ? controlador.mediosPara(catalogo, ambitoLocal) : []
    const medioCompatible =
      borrador.medioId && medios.some((m) => m.id === borrador.medioId)
        ? borrador.medioId
        : medios[0]?.id ?? null

    const nitLimpio = nitEditable.trim() || factura.nitComercio
    return {
      ...borrador,
      ambito: ambitoLocal,
      monto: montoLocal,
      categoriaId: categoriaLocal,
      fecha: fechaLocal || fechaHoyBogota(),
      medioId: medioCompatible,
      cuotas: 1,
      descripcion: nombreComercioLocal.trim() || borrador.descripcion,
      factura: {
        ...factura,
        origen,
        nitComercio: nitLimpio,
        fecha: fechaLocal || factura.fecha,
        montoTotal: montoLocal > 0 ? montoLocal : factura.montoTotal,
        iva: ivaLocal,
      },
      // I23: una compra personal nunca crea ni actualiza AliasComercio compartido
      nombreComercio:
        ambitoLocal === 'hogar' ? nombreComercioLocal.trim() || null : null,
    }
  }

  async function manejarGuardarFactura(factura: DatosFactura, origen: 'qr' | 'ocr') {
    setErrorGuardar('')
    const candidato = construirBorradorFactura(factura, origen)
    const resultado = await guardarBorrador(candidato)
    if (resultado.estado === 'error') {
      setErrorGuardar(resultado.error.mensaje)
      return
    }
    if (resultado.estado === 'fallo') {
      setErrorGuardar(resultado.mensaje)
      return
    }
    navigate('/compra')
  }

  function pasarACuotas(factura: DatosFactura, cuotas: number, abrirOtro = false) {
    aplicarDatosFactura({
      factura,
      categoriaId: categoriaLocal,
      nombreComercio: ambitoLocal === 'hogar' ? nombreComercioLocal.trim() || null : null,
      ambito: ambitoLocal,
      monto: montoLocal,
      fecha: fechaLocal,
    })
    seleccionarCuotas(cuotas)
    navigate('/compra/cuotas', { state: abrirOtro ? { abrirOtro: true } : undefined })
  }

  function pasarAManual(factura?: DatosFactura) {
    if (factura) {
      aplicarDatosFactura({
        factura,
        categoriaId: categoriaLocal,
        nombreComercio: ambitoLocal === 'hogar' ? nombreComercioLocal.trim() || null : null,
        ambito: ambitoLocal,
        monto: montoLocal,
        fecha: fechaLocal,
      })
    }
    navigate('/compra')
  }

  const facturaActual =
    visor.paso === 'precargado' || visor.paso === 'solo_url' ? visor.factura : null

  const barraAccion =
    visor.paso === 'precargado' ? (
      <button
        type="button"
        className={`${claseBotonPrimario} w-full ${montoLocal <= 0 ? 'opacity-65' : ''}`}
        aria-disabled={montoLocal <= 0 || guardando ? 'true' : undefined}
        data-sin-scroll
        onClick={() => void manejarGuardarFactura(visor.factura, 'qr')}
      >
        {guardando ? 'Guardando…' : `Guardar factura (${formatearCop(montoLocal)})`}
      </button>
    ) : visor.paso === 'solo_url' ? (
      <button
        type="button"
        className={`${claseBotonPrimario} w-full ${montoLocal <= 0 ? 'opacity-65' : ''}`}
        aria-disabled={montoLocal <= 0 || guardando ? 'true' : undefined}
        data-sin-scroll
        onClick={() =>
          void manejarGuardarFactura(
            visor.factura,
            avisoOcr ? 'ocr' : visor.factura.origen,
          )
        }
      >
        {guardando ? 'Guardando…' : `Guardar gasto (${formatearCop(montoLocal)})`}
      </button>
    ) : (
      <Link to="/compra" className={`${claseBotonSecundario} w-full no-underline`} data-sin-scroll>
        Volver a Compra rápida
      </Link>
    )

  return (
    <ShellApp
      titulo="Escanear factura"
      subtitulo="QR DIAN, OCR del tiquete o manual"
      volverA="/compra"
      etiquetaVolver="Volver a Compra rápida"
      accionDerecha={<Insignia variante="primario">Sin DIAN</Insignia>}
      mostrarNavegacion
      etiquetaBarraAccion="Acción principal de factura escaneada"
      barraAccion={barraAccion}
    >
      <input
        ref={inputOcrRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Seleccionar o tomar foto del tiquete para OCR"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          if (!archivo) return
          setAvisoOcr(
            `Foto capturada (${archivo.name}). Completá el total y la fecha del tiquete debajo.`,
          )
          if (visor.paso === 'leyendo') {
            setVisor({
              paso: 'solo_url',
              factura: {
                origen: 'ocr',
                cufe: `ocr-${Date.now()}`,
                nitComercio: null,
                fecha: fechaHoyBogota(),
                montoTotal: null,
                iva: null,
                urlVerificacion: null,
              },
            })
          }
        }}
      />

      {errorGuardar ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorGuardar}</p>
        </Aviso>
      ) : null}

      {/* ============================================================ */}
      {/* ESTADO 1: LEYENDO QR                                         */}
      {/* ============================================================ */}
      {visor.paso === 'leyendo' ? (
        <Tarjeta className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
              Leyendo QR DIAN
            </h2>
            <Insignia variante="neutral">
              {camaraActiva ? 'Cámara activa' : 'Lectura local'}
            </Insignia>
          </div>

          <div
            className="flex flex-col items-center gap-3 rounded-2xl border-2 border-hogar-tinta bg-[#121c18] p-4 text-center text-white"
            role="region"
            aria-label="Visor de cámara para escanear código QR de factura DIAN"
          >
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[#7ae5c3] bg-[#1f332b] px-2.5 py-1 text-[0.8125rem] font-bold text-[#b7f5e1]"
              role="status"
              aria-live="polite"
            >
              ● Buscando código QR DIAN…
            </span>

            {camaraActiva ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-44 w-44 rounded-xl border-2 border-dashed border-[#7ae5c3] object-cover"
              />
            ) : (
              <div className="flex size-[180px] flex-col items-center justify-center gap-2 rounded-xl border-[3px] border-dashed border-[#7ae5c3] bg-white/5 p-3">
                <svg
                  width="76"
                  height="76"
                  viewBox="0 0 88 88"
                  fill="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="6" y="6" width="24" height="24" rx="2" stroke="#7AE5C3" strokeWidth="4" />
                  <rect x="13" y="13" width="10" height="10" fill="#7AE5C3" />
                  <rect x="58" y="6" width="24" height="24" rx="2" stroke="#7AE5C3" strokeWidth="4" />
                  <rect x="65" y="13" width="10" height="10" fill="#7AE5C3" />
                  <rect x="6" y="58" width="24" height="24" rx="2" stroke="#7AE5C3" strokeWidth="4" />
                  <rect x="13" y="65" width="10" height="10" fill="#7AE5C3" />
                  <rect x="42" y="42" width="10" height="10" fill="#FFFFFF" />
                  <rect x="58" y="42" width="10" height="10" fill="#FFFFFF" />
                  <rect x="42" y="58" width="10" height="10" fill="#FFFFFF" />
                  <rect x="68" y="62" width="14" height="14" fill="#7AE5C3" />
                </svg>
                <span className="text-[0.8125rem] font-bold">Apunta al QR de la factura</span>
              </div>
            )}

            <p className="m-0 text-[0.8125rem] text-[#d6e2dd]">
              Lectura 100 % local en tu dispositivo. Funciona sin internet y sin consultar el
              portal de la DIAN.
            </p>
          </div>

          {visor.errorQr ? (
            <Aviso variante="ambar" icono="▲" role="alert">
              <p>{visor.errorQr}</p>
            </Aviso>
          ) : null}

          <form className="flex flex-col gap-2" onSubmit={manejarEnviarQrManual}>
            <label htmlFor="qr-texto-manual" className={claseEtiquetaCampo}>
              Pegar contenido o URL del QR DIAN
            </label>
            <textarea
              id="qr-texto-manual"
              className={`${claseCampoTexto} min-h-[76px] font-mono text-xs`}
              placeholder="Ej. NitFac: 890900608&#10;ValTolFac: 85000&#10;CUFE: ..."
              value={textoQrManual}
              onChange={(e) => setTextoQrManual(e.target.value)}
            />
            <button type="submit" className={`${claseBotonPequenoPrimario} w-full`}>
              Leer contenido QR localmente
            </button>
          </form>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={claseBotonSecundario}
              onClick={() => inputOcrRef.current?.click()}
            >
              Tomar foto (OCR)
            </button>
            <Link to="/compra" className={`${claseBotonSecundario} no-underline`}>
              Ingresar manual
            </Link>
          </div>
        </Tarjeta>
      ) : null}

      {/* ============================================================ */}
      {/* ESTADO 2: PRECARGADO PARA CONFIRMAR (FORMATO 1 CON CAMPOS)   */}
      {/* ============================================================ */}
      {visor.paso === 'precargado' ? (
        <Tarjeta acento="primario" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
              Precargado para confirmar
            </h2>
            <Insignia variante="primario">✓ QR con campos</Insignia>
          </div>

          <dl className="m-0 flex flex-col gap-1.5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="min-w-0 flex-1 text-hogar-tinta-suave">
                Comercio {visor.factura.nitComercio ? `(NIT ${visor.factura.nitComercio})` : ''}
              </dt>
              <dd className="m-0 font-bold text-hogar-tinta">
                {visor.sugerencia?.nombreComercio ?? 'Comercio nuevo'}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="min-w-0 flex-1 text-hogar-tinta-suave">Fecha civil factura</dt>
              <dd className="m-0 font-bold text-hogar-tinta">
                {formatearFechaCortaEs(fechaLocal, true)}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="min-w-0 flex-1 text-hogar-tinta-suave">Total (COP enteros)</dt>
              <dd className="hogar-cop m-0 text-lg font-extrabold text-hogar-tinta">
                {formatearCop(montoLocal)}
              </dd>
            </div>
            {ivaLocal !== null ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="min-w-0 flex-1 text-hogar-tinta-suave">
                  IVA incluido (informativo)
                </dt>
                <dd className="hogar-cop m-0 font-bold text-hogar-tinta">
                  {formatearCop(ivaLocal)}
                </dd>
              </div>
            ) : null}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="min-w-0 flex-1 text-hogar-tinta-suave">
                CUFE (único en tu alcance)
              </dt>
              <dd className="m-0 font-mono text-[0.8125rem] font-bold text-hogar-tinta break-all">
                {truncarCufe(visor.factura.cufe)}
              </dd>
            </div>
          </dl>

          <p className={claseAyudaCampo}>
            {ivaLocal !== null
              ? `El IVA (${formatearCop(ivaLocal)}) es informativo y ya viene incluido en ${formatearCop(montoLocal)} (nunca se suma aparte). `
              : ''}
            El QR no trae líneas de producto (en Fase 2 llegan desde el ZIP por correo).
          </p>

          <SelectorAmbito
            ambito={ambitoLocal}
            ariaLabel="Ámbito de la factura: Hogar o Personal"
            onCambiar={setAmbitoLocal}
          />

          <p className={claseAyudaCampo}>
            Si la guardas como <strong>Personal</strong>, no modifica filas compartidas del
            hogar (como el alias del comercio).
          </p>

          {ambitoLocal === 'hogar' && !visor.sugerencia?.nombreComercio && visor.factura.nitComercio ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="alias-comercio-input" className={claseEtiquetaCampo}>
                Nombre del comercio para el hogar (opcional)
              </label>
              <input
                id="alias-comercio-input"
                className={claseCampoTexto}
                type="text"
                placeholder="Ej. Almacenes Éxito"
                value={nombreComercioLocal}
                onChange={(e) => setNombreComercioLocal(e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <h3 className="m-0 mb-2 text-[0.9375rem] font-extrabold text-hogar-tinta">
              {visor.sugerencia?.categoriaId
                ? 'Confirma categoría (sugerida por alias del comercio)'
                : 'Elige una categoría'}
            </h3>
            <div
              className="grid grid-cols-3 gap-1.5"
              role="group"
              aria-label="Confirmar categoría de la factura"
            >
              {categoriasOrdenadas.slice(0, 6).map((cat) => {
                const activa = categoriaLocal === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-2 py-2 text-sm font-semibold ${
                      activa
                        ? 'border-hogar-primario bg-hogar-primario text-white'
                        : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                    }`}
                    aria-pressed={activa}
                    onClick={() => setCategoriaLocal(cat.id)}
                  >
                    {activa ? `✓ ${cat.nombre}` : cat.nombre}
                  </button>
                )
              })}
            </div>
          </div>

          <Aviso variante="indigo" icono="ℹ">
            <p>
              <strong>Medio recordado (local):</strong>{' '}
              {medioSeleccionado?.nombre ?? 'Sin medio'} · <strong>1 cuota</strong>. Si la
              difieres a cuotas, el consumo se cuenta una sola vez hoy.
            </p>
          </Aviso>

          {medioSeleccionado?.tipo === 'tarjeta' ? (
            <div
              className="grid grid-cols-5 gap-1.5"
              role="group"
              aria-label="Cuotas de la compra escaneada"
            >
              {CHIPS_CUOTAS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-1 py-2 text-[0.8125rem] font-semibold ${
                    n === 1
                      ? 'border-hogar-primario bg-hogar-primario text-white'
                      : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                  }`}
                  aria-pressed={n === 1}
                  aria-label={n === 1 ? '1 cuota' : `${n} cuotas`}
                  onClick={() => {
                    if (n > 1) pasarACuotas(visor.factura, n)
                  }}
                >
                  {n === 1 ? '✓ 1' : n}
                </button>
              ))}
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-hogar-borde-fuerte bg-hogar-superficie px-1 py-2 text-[0.8125rem] font-semibold text-hogar-tinta hover:bg-hogar-superficie-suave"
                aria-label="Otro número de cuotas"
                onClick={() => pasarACuotas(visor.factura, 2, true)}
              >
                Otro
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className={`${claseBotonSecundario} w-full`}
            onClick={() => setVisor({ paso: 'leyendo', errorQr: '' })}
          >
            Escanear otro QR
          </button>

          {esUrlDianValida(visor.factura.urlVerificacion) ? (
            <>
              <a
                className={`${claseBotonSecundario} w-full no-underline`}
                href={visor.factura.urlVerificacion!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Verificar en la DIAN (opcional) ↗
              </a>
              <p className={claseAyudaCampo}>
                Abre la URL oficial en tu navegador para verificación manual. No es necesario
                para guardar el gasto.
              </p>
            </>
          ) : null}
        </Tarjeta>
      ) : null}

      {/* ============================================================ */}
      {/* ESTADO 3: SOLO URL (FORMATO 2 -> OCR O MANUAL)               */}
      {/* ============================================================ */}
      {visor.paso === 'solo_url' ? (
        <Tarjeta acento="ambar" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
              QR solo con URL
            </h2>
            <Insignia variante="ambar">▲ Faltan campos</Insignia>
          </div>

          <Aviso variante="ambar" icono="▲">
            <p>
              <strong>CUFE capturado:</strong>{' '}
              <span className="font-mono text-[0.8125rem] break-all">
                {truncarCufe(visor.factura.cufe)}
              </span>
            </p>
            <p>
              Este QR no trae total ni fecha y la app no consulta la DIAN automáticamente. Usa
              OCR del tiquete o completa los datos a mano.
            </p>
          </Aviso>

          {avisoOcr ? (
            <Aviso variante="indigo" icono="ℹ" role="status">
              <p>{avisoOcr}</p>
            </Aviso>
          ) : null}

          <button
            type="button"
            className={`${claseBotonIndigo} w-full`}
            onClick={() => inputOcrRef.current?.click()}
          >
            Leer total y fecha con OCR del tiquete
          </button>

          <SelectorAmbito
            ambito={ambitoLocal}
            ariaLabel="Ámbito de la factura: Hogar o Personal"
            onCambiar={setAmbitoLocal}
          />

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="url-total-cop" className={claseEtiquetaCampo}>
                Total de la factura en COP (entero)
              </label>
              <input
                id="url-total-cop"
                className={`${claseCampoTexto} hogar-cop text-xl font-extrabold`}
                type="text"
                inputMode="numeric"
                placeholder="Ej. $85.000"
                value={montoLocal > 0 ? formatearCop(montoLocal) : ''}
                onChange={(e) => setMontoLocal(parsearDigitosCop(e.target.value))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="url-comercio" className={claseEtiquetaCampo}>
                NIT o nombre del comercio
              </label>
              <input
                id="url-comercio"
                className={claseCampoTexto}
                type="text"
                placeholder="Ej. 890900608 · D1 o Carulla"
                value={nombreComercioLocal}
                onChange={(e) => setNombreComercioLocal(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="url-fecha" className={claseEtiquetaCampo}>
                  Fecha factura
                </label>
                <input
                  id="url-fecha"
                  className={claseCampoTexto}
                  type="date"
                  value={fechaLocal}
                  onChange={(e) => setFechaLocal(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="url-iva" className={claseEtiquetaCampo}>
                  IVA COP (opcional)
                </label>
                <input
                  id="url-iva"
                  className={claseCampoTexto}
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej. $13.571"
                  value={ivaLocal !== null ? formatearCop(ivaLocal) : ''}
                  onChange={(e) => {
                    const val = parsearDigitosCop(e.target.value)
                    setIvaLocal(val > 0 ? val : null)
                  }}
                />
              </div>
            </div>

            <div>
              <h3 className="m-0 mb-1.5 text-sm font-bold text-hogar-tinta">Categoría</h3>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Categoría">
                {categoriasOrdenadas.slice(0, 6).map((cat) => {
                  const activa = categoriaLocal === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-2 py-2 text-sm font-semibold ${
                        activa
                          ? 'border-hogar-primario bg-hogar-primario text-white'
                          : 'border-hogar-borde-fuerte bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                      }`}
                      aria-pressed={activa}
                      onClick={() => setCategoriaLocal(cat.id)}
                    >
                      {activa ? `✓ ${cat.nombre}` : cat.nombre}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="url-cufe" className={claseEtiquetaCampo}>
                CUFE / CUDE extraído (para evitar duplicados)
              </label>
              <input
                id="url-cufe"
                className={`${claseCampoTexto} font-mono text-xs`}
                type="text"
                value={visor.factura.cufe}
                readOnly
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`${claseBotonPrimario} w-full`}
                disabled={guardando}
                onClick={() =>
                  void manejarGuardarFactura(
                    visor.factura,
                    avisoOcr ? 'ocr' : visor.factura.origen,
                  )
                }
              >
                Guardar gasto
              </button>
              <button
                type="button"
                className={`${claseBotonSecundario} w-full`}
                onClick={() => pasarAManual(visor.factura)}
              >
                Ir a ingreso manual
              </button>
            </div>
          </div>

          {esUrlDianValida(visor.factura.urlVerificacion) ? (
            <a
              className={`${claseBotonSecundario} w-full no-underline`}
              href={visor.factura.urlVerificacion!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Verificar en la DIAN (opcional) ↗
            </a>
          ) : null}
        </Tarjeta>
      ) : null}

      {/* ============================================================ */}
      {/* ESTADO 4: FACTURA DUPLICADA (DEDUPE POR CUFE)                */}
      {/* ============================================================ */}
      {visor.paso === 'duplicado' ? (
        <Tarjeta acento="peligro" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
              Factura duplicada
            </h2>
            <Insignia variante="peligro">▲ Ya registrada</Insignia>
          </div>

          <Aviso variante="peligro" icono="▲" role="alert">
            <p className="font-bold">Esta factura ya está registrada.</p>
            <p>
              Ya tiene una compra guardada en el hogar o en tus personales. No se creó un
              segundo registro para evitar doble conteo.
            </p>
          </Aviso>

          <Tarjeta suave>
            <h3 className="m-0 mb-2 text-[0.9375rem] font-extrabold text-hogar-tinta">
              Registro existente (hogar o personal propio)
            </h3>
            <dl className="m-0 flex flex-col gap-1.5 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-hogar-tinta-suave">Detalle</dt>
                <dd className="m-0 font-bold text-hogar-tinta">
                  {visor.existente.descripcion}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-hogar-tinta-suave">Monto</dt>
                <dd className="hogar-cop m-0 font-bold text-hogar-tinta">
                  {formatearCop(visor.existente.montoTotal)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-hogar-tinta-suave">Fecha</dt>
                <dd className="m-0 font-bold text-hogar-tinta">
                  {formatearFechaCortaEs(visor.existente.fecha, true)}
                </dd>
              </div>
            </dl>
          </Tarjeta>

          <Aviso variante="indigo" icono="ℹ">
            <p>
              <strong>Privacidad en compras personales:</strong> la detección de duplicados
              solo revisa compras del hogar y <strong>tus propias</strong> compras personales.
              Una compra personal del otro miembro <strong>nunca se detecta ni se insinúa</strong>{' '}
              (ni siquiera con «ya está registrada»).
            </p>
          </Aviso>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`${claseBotonPrimario} w-full`}
              onClick={() => {
                setTextoQrManual('')
                setVisor({ paso: 'leyendo', errorQr: '' })
              }}
            >
              Escanear otra factura
            </button>
            <Link to="/compra" className={`${claseBotonSecundario} w-full no-underline`}>
              Volver a Compra rápida
            </Link>
          </div>

          {esUrlDianValida(visor.urlVerificacion) ? (
            <a
              className={`${claseBotonSecundario} w-full no-underline`}
              href={visor.urlVerificacion!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Verificar en la DIAN (opcional) ↗
            </a>
          ) : null}
        </Tarjeta>
      ) : null}

      {facturaActual ? (
        <p className="sr-only">
          Registrando factura como {hogar.miembroActual.nombre}
        </p>
      ) : null}
    </ShellApp>
  )
}
