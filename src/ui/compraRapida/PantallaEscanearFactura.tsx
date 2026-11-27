import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import jsQR from 'jsqr'
import type { Ambito, CompraExistente, DatosFactura } from '../../app/compraRapida'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import { Aviso, Insignia, Tarjeta, claseAyudaCampo, claseBotonPequenoPrimario, claseBotonPrimario, claseBotonSecundario, claseCampoTexto, claseEtiquetaCampo } from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { useCompraRapida } from './ContextoCompraRapida'
import { ChipsCuotas, EnlaceDian, GrillaCategorias, SelectorAmbito } from './PiezasCompra'
import { formatearFechaCortaEs, parsearDigitosCop, truncarCufe } from './formatoCop'

type Visor =
  | { paso: 'leyendo'; errorQr: string }
  | { paso: 'precargado'; factura: DatosFactura; sugerencia: { nombreComercio: string; categoriaId: string | null } | null }
  | { paso: 'solo_url'; factura: DatosFactura }
  | { paso: 'duplicado'; existente: CompraExistente; urlVerificacion: string | null }

interface DetectorQr { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> }
declare global { interface Window { BarcodeDetector?: new (opts?: { formats?: string[] }) => DetectorQr } }

export function PantallaEscanearFactura() {
  const navigate = useNavigate()
  const { controlador, catalogo, guardando, borrador, medioSeleccionado, aplicarDatosFactura, guardarBorrador } = useCompraRapida()

  const hoy = hoyCivil(new Date())
  const [visor, setVisor] = useState<Visor>({ paso: 'leyendo', errorQr: '' })
  const [textoQr, setTextoQr] = useState('')
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [errorCamara, setErrorCamara] = useState('')
  const [ambitoLocal, setAmbitoLocal] = useState<Ambito>(borrador.ambito)
  const [categoriaLocal, setCategoriaLocal] = useState<string | null>(borrador.categoriaId)
  const [montoLocal, setMontoLocal] = useState(0)
  const [ivaLocal, setIvaLocal] = useState<number | null>(null)
  const [fechaLocal, setFechaLocal] = useState(hoy)
  const [comercioLocal, setComercioLocal] = useState('')
  const [errorGuardar, setErrorGuardar] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const categorias = catalogo ? [...catalogo.categorias].sort((a, b) => a.orden - b.orden).slice(0, 6) : []

  async function procesarQr(texto: string) {
    setErrorGuardar('')
    const res = await controlador.escanear(texto)
    if (res.estado === 'invalido') return setVisor({ paso: 'leyendo', errorQr: res.mensaje })
    if (res.estado === 'duplicado') return setVisor({ paso: 'duplicado', existente: res.existente, urlVerificacion: res.urlVerificacion })
    setMontoLocal(res.factura.montoTotal ?? 0)
    setIvaLocal(res.factura.iva)
    setFechaLocal(res.factura.fecha ?? hoy)
    setComercioLocal(res.sugerencia?.nombreComercio ?? '')
    setCategoriaLocal(res.sugerencia?.categoriaId ?? null)
    setVisor(res.formato === 'url' ? { paso: 'solo_url', factura: res.factura } : { paso: 'precargado', factura: res.factura, sugerencia: res.sugerencia })
  }

  useEffect(() => {
    if (visor.paso !== 'leyendo' || !navigator.mediaDevices?.getUserMedia) return
    let cancelado = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let leyendoFrame = false
    const lienzo = document.createElement('canvas')
    const contexto = lienzo.getContext('2d', { willReadFrequently: true })
    setErrorCamara('')

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((media) => {
        if (cancelado) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream = media
        streamRef.current = media
        setCamaraActiva(true)
        if (videoRef.current) {
          videoRef.current.srcObject = media
          videoRef.current.muted = true
          videoRef.current.setAttribute('playsinline', 'true')
          void videoRef.current.play().catch(() => {})
        }
        const Detector = window.BarcodeDetector
        const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null

        timer = setInterval(() => {
          const video = videoRef.current
          if (!video || cancelado || leyendoFrame) return
          leyendoFrame = true

          if (detector) {
            void detector
              .detect(video)
              .then((codes) => {
                const val = codes[0]?.rawValue
                if (val && !cancelado) {
                  if (timer) clearInterval(timer)
                  void procesarQr(val)
                }
              })
              .catch(() => {})
              .finally(() => {
                leyendoFrame = false
              })
            return
          }

          try {
            if (contexto && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
              const escala = Math.min(1, 640 / video.videoWidth)
              const ancho = Math.max(1, Math.round(video.videoWidth * escala))
              const alto = Math.max(1, Math.round(video.videoHeight * escala))
              if (lienzo.width !== ancho || lienzo.height !== alto) {
                lienzo.width = ancho
                lienzo.height = alto
              }
              contexto.drawImage(video, 0, 0, ancho, alto)
              const imagen = contexto.getImageData(0, 0, ancho, alto)
              const resultado = jsQR(imagen.data, ancho, alto, {
                inversionAttempts: 'attemptBoth',
              })
              if (resultado?.data && !cancelado) {
                if (timer) clearInterval(timer)
                void procesarQr(resultado.data)
              }
            }
          } finally {
            leyendoFrame = false
          }
        }, 280)
      })
      .catch(() => {
        if (!cancelado) {
          setCamaraActiva(false)
          setErrorCamara('No pudimos abrir la cámara. Revisá los permisos del navegador o pegá el QR abajo.')
        }
      })

    return () => {
      cancelado = true
      setCamaraActiva(false)
      if (timer) clearInterval(timer)
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visor.paso])

  useEffect(() => {
    const video = videoRef.current
    const media = streamRef.current
    if (!camaraActiva || !video || !media) return
    if (video.srcObject !== media) {
      video.srcObject = media
      video.muted = true
      video.setAttribute('playsinline', 'true')
      void video.play().catch(() => {})
    }
  }, [camaraActiva])

  function transferirABorrador(factura: DatosFactura) {
    aplicarDatosFactura({
      factura,
      categoriaId: categoriaLocal,
      nombreComercio: ambitoLocal === 'hogar' ? comercioLocal.trim() || null : null,
      ambito: ambitoLocal,
      monto: montoLocal,
      fecha: fechaLocal,
    })
  }

  async function guardarFactura(factura: DatosFactura) {
    setErrorGuardar('')
    const medios = catalogo ? controlador.mediosPara(catalogo, ambitoLocal) : []
    const medioId = borrador.medioId && medios.some((m) => m.id === borrador.medioId) ? borrador.medioId : medios[0]?.id ?? null
    const res = await guardarBorrador({
      ...borrador,
      ambito: ambitoLocal,
      monto: montoLocal,
      categoriaId: categoriaLocal,
      fecha: fechaLocal || hoy,
      medioId,
      cuotas: 1,
      descripcion: comercioLocal.trim() || borrador.descripcion,
      factura: { ...factura, fecha: fechaLocal || factura.fecha, montoTotal: montoLocal > 0 ? montoLocal : factura.montoTotal, iva: ivaLocal },
      nombreComercio: ambitoLocal === 'hogar' ? comercioLocal.trim() || null : null,
    })
    if (res.estado === 'error') return setErrorGuardar(res.error.mensaje)
    if (res.estado === 'fallo') return setErrorGuardar(res.mensaje)
    navigate('/compra')
  }

  return (
    <ShellApp
      titulo="Escanear factura"
      subtitulo="QR DIAN o ingreso manual"
      volverA="/compra"
      etiquetaVolver="Volver a Compra rápida"
      accionDerecha={<Insignia variante="primario">Sin DIAN</Insignia>}
      mostrarNavegacion
      etiquetaBarraAccion="Acción principal de factura escaneada"
      barraAccion={
        visor.paso === 'precargado' || visor.paso === 'solo_url' ? (
          <button
            type="button"
            className={`${claseBotonPrimario} w-full ${montoLocal <= 0 ? 'opacity-65' : ''}`}
            aria-disabled={montoLocal <= 0 || guardando ? 'true' : undefined}
            data-sin-scroll
            onClick={() => void guardarFactura(visor.factura)}
          >
            {guardando ? 'Guardando…' : visor.paso === 'precargado' ? `Guardar factura (${formatearPesos(montoLocal)})` : `Guardar gasto (${formatearPesos(montoLocal)})`}
          </button>
        ) : (
          <Link to="/compra" className={`${claseBotonSecundario} w-full no-underline`} data-sin-scroll>Volver a Compra rápida</Link>
        )
      }
    >
      {errorGuardar ? <Aviso variante="peligro" icono="▲" role="alert"><p>{errorGuardar}</p></Aviso> : null}

      {visor.paso === 'leyendo' ? (
        <Tarjeta className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Leyendo QR DIAN</h2>
            <Insignia variante="neutral">{camaraActiva ? 'Cámara activa' : 'Lectura local'}</Insignia>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-hogar-tinta bg-[#121c18] p-4 text-center text-white" role="region" aria-label="Visor de cámara para escanear código QR de factura DIAN">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#7ae5c3] bg-[#1f332b] px-2.5 py-1 text-[0.8125rem] font-bold text-[#b7f5e1]" role="status" aria-live="polite">
              ● Buscando código QR DIAN…
            </span>
            <div className="relative aspect-square w-full max-w-[260px] overflow-hidden rounded-xl border-2 border-dashed border-[#7ae5c3] bg-black/40">
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              {!camaraActiva ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#121c18]/80 p-3">
                  <span className="text-[0.8125rem] font-bold">Apunta al QR de la factura</span>
                </div>
              ) : null}
            </div>
            <p className="m-0 text-[0.8125rem] text-[#d6e2dd]">Lectura 100 % local en tu dispositivo sin consultar la DIAN. Si preferís, pegá el QR abajo.</p>
          </div>
          {errorCamara ? <Aviso variante="ambar" icono="▲" role="status"><p>{errorCamara}</p></Aviso> : null}
          {visor.errorQr ? <Aviso variante="ambar" icono="▲" role="alert"><p>{visor.errorQr}</p></Aviso> : null}
          <form className="flex flex-col gap-2" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); void procesarQr(textoQr) }}>
            <label htmlFor="qr-texto-manual" className={claseEtiquetaCampo}>Pegar contenido o URL del QR DIAN</label>
            <textarea id="qr-texto-manual" className={`${claseCampoTexto} min-h-[72px] font-mono text-xs`} placeholder="Ej. NitFac: 890900608&#10;ValTolFac: 85000&#10;CUFE: ..." value={textoQr} onChange={(e) => setTextoQr(e.target.value)} />
            <button type="submit" className={`${claseBotonPequenoPrimario} w-full`}>Leer contenido QR localmente</button>
          </form>
          <Link to="/compra" className={`${claseBotonSecundario} w-full no-underline`}>Ingresar manual</Link>
        </Tarjeta>
      ) : null}

      {visor.paso === 'precargado' ? (
        <Tarjeta acento="primario" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Precargado para confirmar</h2>
            <Insignia variante="primario">✓ QR con campos</Insignia>
          </div>
          <dl className="m-0 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">Comercio {visor.factura.nitComercio ? `(NIT ${visor.factura.nitComercio})` : ''}</dt><dd className="m-0 font-bold text-hogar-tinta">{visor.sugerencia?.nombreComercio ?? 'Comercio nuevo'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">Fecha civil factura</dt><dd className="m-0 font-bold text-hogar-tinta">{formatearFechaCortaEs(fechaLocal, true)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">Total (COP enteros)</dt><dd className="hogar-cop m-0 text-lg font-extrabold text-hogar-tinta">{formatearPesos(montoLocal)}</dd></div>
            {ivaLocal !== null ? <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">IVA incluido (informativo)</dt><dd className="hogar-cop m-0 font-bold text-hogar-tinta">{formatearPesos(ivaLocal)}</dd></div> : null}
            <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">CUFE (único en tu alcance)</dt><dd className="m-0 font-mono text-[0.8125rem] font-bold text-hogar-tinta">{truncarCufe(visor.factura.cufe)}</dd></div>
          </dl>
          <p className={claseAyudaCampo}>{ivaLocal !== null ? `El IVA (${formatearPesos(ivaLocal)}) es informativo y ya viene incluido en ${formatearPesos(montoLocal)}. ` : ''}El QR no trae líneas de producto.</p>
          <SelectorAmbito ambito={ambitoLocal} ariaLabel="Ámbito de la factura: Hogar o Personal" onCambiar={setAmbitoLocal} />
          <p className={claseAyudaCampo}>Si la guardas como <strong>Personal</strong>, no modifica filas compartidas del hogar (como el alias).</p>
          {ambitoLocal === 'hogar' && !visor.sugerencia?.nombreComercio && visor.factura.nitComercio ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="alias-comercio-input" className={claseEtiquetaCampo}>Nombre del comercio para el hogar (opcional)</label>
              <input id="alias-comercio-input" className={claseCampoTexto} type="text" placeholder="Ej. Almacenes Éxito" value={comercioLocal} onChange={(e) => setComercioLocal(e.target.value)} />
            </div>
          ) : null}
          <div>
            <h3 className="m-0 mb-2 text-[0.9375rem] font-extrabold text-hogar-tinta">{visor.sugerencia?.categoriaId ? 'Confirma categoría (sugerida por alias)' : 'Elige una categoría'}</h3>
            <GrillaCategorias categorias={categorias} seleccionadaId={categoriaLocal} ariaLabel="Confirmar categoría de la factura" onElegir={setCategoriaLocal} />
          </div>
          <Aviso variante="indigo" icono="ℹ"><p><strong>Medio recordado (local):</strong> {medioSeleccionado?.nombre ?? 'Sin medio'} · <strong>1 cuota</strong>.</p></Aviso>
          {medioSeleccionado?.tipo === 'tarjeta' ? (
            <ChipsCuotas
              cuotas={1}
              ariaLabel="Cuotas de la compra escaneada"
              onElegir={(n, esOtro) => {
                if (n > 1 || esOtro) { transferirABorrador(visor.factura); navigate('/compra/cuotas', { state: esOtro ? { abrirOtro: true } : undefined }) }
              }}
            />
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={claseBotonSecundario} onClick={() => setVisor({ paso: 'leyendo', errorQr: '' })}>Escanear otro QR</button>
            <button type="button" className={claseBotonSecundario} onClick={() => { transferirABorrador(visor.factura); navigate('/compra') }}>Editar manualmente</button>
          </div>
          <EnlaceDian url={visor.factura.urlVerificacion} />
        </Tarjeta>
      ) : null}

      {visor.paso === 'solo_url' ? (
        <Tarjeta acento="ambar" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">QR solo con URL</h2>
            <Insignia variante="ambar">▲ Faltan campos</Insignia>
          </div>
          <Aviso variante="ambar" icono="▲">
            <p><strong>CUFE capturado:</strong> <span className="font-mono text-[0.8125rem]">{truncarCufe(visor.factura.cufe)}</span></p>
            <p>Este QR no trae total ni fecha y la app no consulta la DIAN. Completá los datos a mano (OCR del tiquete llega en una próxima versión).</p>
          </Aviso>
          <SelectorAmbito ambito={ambitoLocal} ariaLabel="Ámbito de la factura: Hogar o Personal" onCambiar={setAmbitoLocal} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="url-total-cop" className={claseEtiquetaCampo}>Total de la factura en COP (entero)</label>
            <input id="url-total-cop" className={`${claseCampoTexto} hogar-cop text-xl font-extrabold`} type="text" inputMode="numeric" placeholder="Ej. $85.000" value={montoLocal > 0 ? formatearPesos(montoLocal) : ''} onChange={(e) => setMontoLocal(parsearDigitosCop(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="url-comercio" className={claseEtiquetaCampo}>NIT o nombre del comercio</label>
            <input id="url-comercio" className={claseCampoTexto} type="text" placeholder="Ej. 890900608 · D1" value={comercioLocal} onChange={(e) => setComercioLocal(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0 max-w-full overflow-hidden flex flex-col gap-1.5">
              <label htmlFor="url-fecha" className={claseEtiquetaCampo}>Fecha factura</label>
              <input id="url-fecha" className={claseCampoTexto} type="date" value={fechaLocal} onChange={(e) => setFechaLocal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="url-iva" className={claseEtiquetaCampo}>IVA COP (opcional)</label>
              <input id="url-iva" className={claseCampoTexto} type="text" inputMode="numeric" placeholder="Ej. $13.571" value={ivaLocal !== null ? formatearPesos(ivaLocal) : ''} onChange={(e) => { const v = parsearDigitosCop(e.target.value); setIvaLocal(v > 0 ? v : null) }} />
            </div>
          </div>
          <GrillaCategorias categorias={categorias} seleccionadaId={categoriaLocal} ariaLabel="Categoría" onElegir={setCategoriaLocal} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="url-cufe" className={claseEtiquetaCampo}>CUFE / CUDE extraído (para evitar duplicados)</label>
            <input id="url-cufe" className={`${claseCampoTexto} font-mono text-xs`} type="text" value={visor.factura.cufe} readOnly />
          </div>
          <button type="button" className={`${claseBotonSecundario} w-full`} onClick={() => { transferirABorrador(visor.factura); navigate('/compra') }}>Ir a ingreso manual</button>
          <EnlaceDian url={visor.factura.urlVerificacion} />
        </Tarjeta>
      ) : null}

      {visor.paso === 'duplicado' ? (
        <Tarjeta acento="peligro" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Factura duplicada</h2>
            <Insignia variante="peligro">▲ Ya registrada</Insignia>
          </div>
          <Aviso variante="peligro" icono="▲" role="alert">
            <p className="font-bold">Esta factura ya está registrada.</p>
            <p>Ya tiene una compra guardada en el hogar o en tus personales. No se creó un segundo registro.</p>
          </Aviso>
          <Tarjeta suave>
            <dl className="m-0 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">Detalle</dt><dd className="m-0 font-bold text-hogar-tinta">{visor.existente.descripcion}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">Monto</dt><dd className="hogar-cop m-0 font-bold text-hogar-tinta">{formatearPesos(visor.existente.montoTotal)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-hogar-tinta-suave">Fecha</dt><dd className="m-0 font-bold text-hogar-tinta">{formatearFechaCortaEs(visor.existente.fecha, true)}</dd></div>
            </dl>
          </Tarjeta>
          <Aviso variante="indigo" icono="ℹ"><p><strong>Privacidad en compras personales:</strong> la detección solo revisa compras del hogar y <strong>tus propias</strong> personales; las ajenas nunca se detectan ni insinúan.</p></Aviso>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={claseBotonPrimario} onClick={() => { setTextoQr(''); setVisor({ paso: 'leyendo', errorQr: '' }) }}>Escanear otra factura</button>
            <Link to="/compra" className={`${claseBotonSecundario} no-underline`}>Volver a Compra rápida</Link>
          </div>
          <EnlaceDian url={visor.urlVerificacion} />
        </Tarjeta>
      ) : null}
    </ShellApp>
  )
}
