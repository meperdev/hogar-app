import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { BorradorPago, EvaluacionPago } from '../../app/obligaciones'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso, AyudaInfo, CampoMontoCop, Insignia, Tarjeta, claseAyudaCampo, claseBotonPequenoSecundario,
  claseBotonPrimario, claseCampoTexto, claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { formatearFechaCortaEs } from '../compraRapida/formatoCop'
import { useObligaciones } from './ContextoObligaciones'
import { TarjetaRadio, etiquetaAmbitoTitular, nombreMesPeriodoEs } from './PiezasObligaciones'

function PagoCuota({ cuotaId, pasivoId }: { cuotaId?: string; pasivoId?: string }) {
  const navigate = useNavigate()
  const { hogar, controlador, medios, buscarCuota, buscarPasivo, recargar, mostrarToast } = useObligaciones()
  const item = cuotaId ? buscarCuota(cuotaId) : null
  const pasivoInfo = pasivoId ? buscarPasivo(pasivoId) : null

  const [borrador, setBorrador] = useState<BorradorPago | null>(null)
  const [cuotaIdInicial, setCuotaIdInicial] = useState<string | null>(cuotaId ?? null)
  const [capitalInicial, setCapitalInicial] = useState(0)
  const [interesInicial, setInteresInicial] = useState<number | null>(null)
  const [enlazarCuota, setEnlazarCuota] = useState(Boolean(cuotaId))
  const [evaluacion, setEvaluacion] = useState<EvaluacionPago | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')

  const capitalRef = useRef<HTMLInputElement>(null)
  const sobrepagoRef = useRef<HTMLButtonElement>(null)
  const evalSeqRef = useRef(0)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setErrorAccion('')
    const promesa = pasivoId
      ? controlador.prepararPagoPasivo(pasivoId)
      : controlador.prepararPagoCuota(cuotaId ?? '')
    void promesa
      .then((inicial) => {
        if (!vigente) return
        const medioPorDefecto =
          inicial.medioId ?? medios.find((m) => m.duenoMiembroId === hogar.miembroActual.id)?.id ?? medios[0]?.id ?? null
        setBorrador({ ...inicial, medioId: medioPorDefecto })
        setCuotaIdInicial(inicial.cuotaId)
        setCapitalInicial(inicial.capital)
        setInteresInicial(inicial.interes)
        setEnlazarCuota(inicial.cuotaId !== null)
        setCargando(false)
      })
      .catch(() => {
        if (!vigente) return
        setErrorAccion(
          pasivoId
            ? 'No pudimos preparar el abono de esta obligación.'
            : 'No pudimos preparar el pago de esta cuota.',
        )
        setCargando(false)
      })
    return () => { vigente = false }
  }, [controlador, cuotaId, pasivoId, hogar.miembroActual.id, medios])

  const borradorEfectivo = useMemo<BorradorPago | null>(() => {
    if (!borrador) return null
    const esParcial = capitalInicial > 0 && borrador.capital > 0 && borrador.capital < capitalInicial
    return { ...borrador, cuotaId: enlazarCuota && !esParcial ? cuotaIdInicial : null }
  }, [borrador, capitalInicial, cuotaIdInicial, enlazarCuota])

  useEffect(() => {
    if (!borradorEfectivo) return
    const seq = ++evalSeqRef.current
    void controlador.evaluarPago(borradorEfectivo)
      .then((res) => { if (evalSeqRef.current === seq) setEvaluacion(res) })
      .catch(() => {
        if (evalSeqRef.current === seq) {
          setEvaluacion({ estado: 'invalido', campo: 'monto', mensaje: 'No pudimos evaluar el pago en este momento.' })
        }
      })
  }, [borradorEfectivo, controlador])

  const miembrosActivos = useMemo(() => hogar.miembros.filter((m) => m.activo), [hogar.miembros])
  const medioSeleccionado = useMemo(() => medios.find((m) => m.id === borrador?.medioId) ?? null, [medios, borrador?.medioId])
  const nombreMiembro = (id: string | null) => hogar.miembros.find((m) => m.id === id)?.nombre ?? 'Miembro'

  const montoMostrado = (borrador?.capital ?? 0) + (borrador?.interes ?? 0)
  const interesEditado = borrador !== null && borrador.interes !== interesInicial
  const aporteEvaluado = evaluacion && 'aporte' in evaluacion ? evaluacion.aporte : undefined
  const saldoDisponible = pasivoInfo?.saldoPendiente ?? 0

  async function ejecutarRegistro(dividirSobrepago: boolean) {
    if (!borradorEfectivo || guardando) return
    setGuardando(true)
    setErrorAccion('')
    try {
      const res = await controlador.registrarPago(borradorEfectivo, { dividirSobrepago })
      mostrarToast(res.resumen)
      recargar()
      navigate('/obligaciones')
    } catch (causa) {
      setErrorAccion(causa instanceof Error && causa.message ? causa.message : 'No pudimos registrar el pago.')
    } finally {
      setGuardando(false)
    }
  }

  const verboBoton = pasivoId ? 'Confirmar abono' : 'Confirmar pago'
  const ctaBarra = !borradorEfectivo || !evaluacion ? (
    <button type="button" className={`${claseBotonPrimario} w-full`} disabled data-sin-scroll>Preparando…</button>
  ) : evaluacion.estado === 'duplicado' ? (
    <button type="button" className={`${claseBotonPrimario} w-full`} disabled data-sin-scroll>Pago duplicado</button>
  ) : evaluacion.estado === 'sobrepago' ? (
    <button type="button" className={`${claseBotonPrimario} w-full`} onClick={() => sobrepagoRef.current?.focus()} data-sin-scroll>
      Revisar sobrepago ({formatearPesos(evaluacion.monto)})
    </button>
  ) : evaluacion.estado === 'invalido' ? (
    <button type="button" className={`${claseBotonPrimario} w-full`} disabled data-sin-scroll>{verboBoton} ({formatearPesos(montoMostrado)})</button>
  ) : (
    <button type="button" className={`${claseBotonPrimario} w-full`} disabled={guardando} onClick={() => void ejecutarRegistro(false)} data-sin-scroll>
      {guardando ? 'Registrando…' : `${verboBoton} (${formatearPesos(evaluacion.monto)})`}
    </button>
  )

  const subtitulo = item
    ? (item.nCuotas > 0 ? `Cuota ${item.numero}/${item.nCuotas} · ${item.descripcion}` : item.descripcion)
    : pasivoInfo
      ? pasivoInfo.nombre
      : 'Abono a obligación'

  return (
    <ShellApp
      titulo={pasivoId ? 'Registrar abono' : 'Registrar pago'}
      subtitulo={subtitulo}
      volverA="/obligaciones"
      etiquetaVolver="Volver a Obligaciones del mes"
      etiquetaBarraAccion="Confirmar pago de obligación"
      barraAccion={ctaBarra}
    >
      {errorAccion ? <Aviso variante="peligro" icono="▲" role="alert"><p>{errorAccion}</p></Aviso> : null}

      {cargando || !borrador || !borradorEfectivo ? (
        <Aviso variante="indigo" icono="◷" role="status"><p className="font-bold">Cargando…</p></Aviso>
      ) : (
        <>
          {item ? (
            <Tarjeta acento="indigo">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">{item.pasivoNombre} · Vence {formatearFechaCortaEs(item.fechaVencimiento)}</h2>
                  <AyudaInfo
                    etiqueta="Información sobre el pago"
                    texto="El abono reduce la deuda sin duplicar compras en tu consumo del mes."
                  />
                </div>
                <Insignia variante={item.ambito === 'hogar' ? 'primario' : 'neutral'}>{etiquetaAmbitoTitular(item.ambito, item.titular)}</Insignia>
              </div>
            </Tarjeta>
          ) : pasivoInfo ? (
            <Tarjeta acento="indigo">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">{pasivoInfo.nombre}</h2>
                  <AyudaInfo
                    etiqueta="Información sobre abonos"
                    texto="El abono reduce el saldo de esta obligación sin duplicar compras a cuotas."
                  />
                </div>
                <Insignia variante={pasivoInfo.ambito === 'hogar' ? 'primario' : 'neutral'}>{etiquetaAmbitoTitular(pasivoInfo.ambito, pasivoInfo.titular)}</Insignia>
              </div>
              <p className={`${claseAyudaCampo} mt-1`}>
                Saldo pendiente: <strong className="hogar-cop text-hogar-tinta">{formatearPesos(pasivoInfo.saldoPendiente)}</strong>
              </p>
            </Tarjeta>
          ) : null}

          <div className="flex flex-col gap-3.5">
            <Tarjeta className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="pago-capital" className={claseEtiquetaCampo}>
                  {pasivoId ? 'Monto a abonar (COP)' : 'Monto a capital (COP)'}
                </label>
                {pasivoId && saldoDisponible > 0 ? (
                  <button
                    type="button"
                    className="cursor-pointer rounded-full border border-hogar-primario/30 bg-hogar-primario-suave px-2.5 py-1 text-xs font-bold text-hogar-primario hover:brightness-95"
                    onClick={() => {
                      setErrorAccion('')
                      setBorrador((p) => (p ? { ...p, capital: saldoDisponible } : p))
                    }}
                  >
                    Pagar todo ({formatearPesos(saldoDisponible)})
                  </button>
                ) : null}
              </div>

              <CampoMontoCop
                inputRef={capitalRef}
                id="pago-capital"
                className="text-2xl font-extrabold"
                placeholder="$0"
                valor={borrador.capital}
                onCambiar={(capital) => {
                  setErrorAccion('')
                  setBorrador((p) => (p ? { ...p, capital } : p))
                }}
              />

              {evaluacion?.estado === 'valido' ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hogar-borde pt-2 text-xs text-hogar-tinta-suave">
                  <span>
                    Saldo restante:{' '}
                    <strong className="hogar-cop text-hogar-tinta">{formatearPesos(evaluacion.saldoDespues)}</strong>
                  </span>
                  <span>
                    {aporteEvaluado
                      ? `Aporte de ${nombreMiembro(aporteEvaluado.miembroId)}`
                      : 'Sin aporte individual ($0)'}
                  </span>
                </div>
              ) : null}
            </Tarjeta>

            {miembrosActivos.length > 1 ? (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className={claseEtiquetaCampo}>¿Quién paga?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {miembrosActivos.map((miembro) => {
                    const medioDelMiembro = medios.find((m) => m.duenoMiembroId === miembro.id)
                    return (
                      <TarjetaRadio key={miembro.id} id={`pagador-${miembro.id}`} name="pagador" value={miembro.id} checked={medioSeleccionado?.duenoMiembroId === miembro.id} disabled={!medioDelMiembro} onChange={() => { if (medioDelMiembro) setBorrador((p) => (p ? { ...p, medioId: medioDelMiembro.id } : p)) }}>
                        {miembro.nombre}
                      </TarjetaRadio>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}

            <div className="grid grid-cols-2 items-end gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="cuenta-origen" className={claseEtiquetaCampo}>Medio de pago</label>
                <select id="cuenta-origen" className={claseCampoTexto} value={borrador.medioId ?? ''} onChange={(e) => setBorrador((p) => (p ? { ...p, medioId: e.target.value || null } : p))}>
                  {medios.length === 0 ? <option value="">Sin medios</option> : null}
                  {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="fecha-pago" className={claseEtiquetaCampo}>Fecha</label>
                <input id="fecha-pago" className={claseCampoTexto} type="date" value={borrador.fecha} onChange={(e) => setBorrador((p) => (p ? { ...p, fecha: e.target.value } : p))} />
              </div>
            </div>

            <details
              open={interesInicial !== null}
              className="rounded-2xl border border-hogar-borde bg-hogar-superficie px-3.5 py-2.5 shadow-[var(--hogar-shadow-card)]"
            >
              <summary className="cursor-pointer select-none text-sm font-bold text-hogar-tinta">
                Intereses o nota (opcional)
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pago-intereses" className={claseEtiquetaCampo}>Intereses / costo financiero</label>
                  <CampoMontoCop
                    id="pago-intereses"
                    className="text-lg font-extrabold"
                    placeholder="$0 (opcional)"
                    valor={borrador.interes ?? 0}
                    aria-describedby="ayuda-intereses"
                    onCambiar={(siguiente) => {
                      setErrorAccion('')
                      setBorrador((p) => (p ? { ...p, interes: siguiente > 0 ? siguiente : null } : p))
                    }}
                  />
                  <p id="ayuda-intereses" className={claseAyudaCampo}>
                    {interesEditado
                      ? 'Interés editado manualmente.'
                      : 'Solo si tu extracto cobra intereses o comisiones.'}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="nota-pago" className={claseEtiquetaCampo}>Nota</label>
                  <input id="nota-pago" className={claseCampoTexto} type="text" placeholder="Ej. Comprobante o referencia" value={borrador.nota} onChange={(e) => setBorrador((p) => (p ? { ...p, nota: e.target.value } : p))} />
                </div>
              </div>
            </details>

            {evaluacion?.estado === 'invalido' && montoMostrado > 0 ? (
              <Aviso variante="peligro" icono="▲" role="alert"><p>{evaluacion.mensaje}</p></Aviso>
            ) : null}

            {evaluacion?.estado === 'duplicado' ? (
              <Tarjeta acento="peligro" className="flex flex-col gap-2.5">
                <Aviso variante="peligro" icono="▲" role="alert">
                  <p><strong className="text-hogar-tinta">Cuota ya pagada</strong> el {formatearFechaCortaEs(evaluacion.existente.fecha)} por <strong className="hogar-cop">{formatearPesos(evaluacion.existente.monto)}</strong>.</p>
                </Aviso>
                <div className="flex flex-wrap gap-2">
                  <Link to="/obligaciones" className={`${claseBotonPequenoSecundario} flex-1 basis-[130px] no-underline`}>Volver</Link>
                  <button type="button" className={`${claseBotonPequenoSecundario} flex-1 basis-[130px]`} onClick={() => { setEnlazarCuota(false); capitalRef.current?.focus() }}>Registrar adelanto libre</button>
                </div>
              </Tarjeta>
            ) : null}

            {evaluacion?.estado === 'sobrepago' ? (
              <Tarjeta acento="ambar" className="flex flex-col gap-2.5">
                <Aviso variante="ambar" icono="▲" role="alert">
                  <p>
                    El abono ({formatearPesos(evaluacion.monto)}) supera el saldo actual ({formatearPesos(evaluacion.tope)}).
                    Si confirmas, {formatearPesos(evaluacion.excedente)} quedará como saldo a favor.
                  </p>
                </Aviso>
                <div className="flex flex-wrap gap-2">
                  <Link to="/obligaciones" className={`${claseBotonPequenoSecundario} flex-1 basis-[130px] no-underline`}>Cancelar</Link>
                  <button ref={sobrepagoRef} type="button" className={`${claseBotonPequenoSecundario} flex-1 basis-[130px] border-hogar-ambar`} disabled={guardando} onClick={() => void ejecutarRegistro(true)}>
                    {guardando ? 'Dividiendo…' : 'Dividir: abono + saldo a favor'}
                  </button>
                </div>
              </Tarjeta>
            ) : null}
          </div>
        </>
      )}
    </ShellApp>
  )
}

function PagoObligacionRecurrente({ obligacionId }: { obligacionId: string }) {
  const navigate = useNavigate()
  const { hogar, controlador, medios, periodo, buscarObligacion, recargar, mostrarToast } = useObligaciones()
  const item = buscarObligacion(obligacionId)

  const [monto, setMonto] = useState(() => item?.montoEstimado ?? 0)
  const [medioId, setMedioId] = useState<string | null>(
    () => medios.find((m) => m.duenoMiembroId === hogar.miembroActual.id)?.id ?? medios[0]?.id ?? null,
  )
  const [fecha, setFecha] = useState(() => hoyCivil(new Date()))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (item && monto === 0 && item.montoEstimado) setMonto(item.montoEstimado) }, [item, monto])
  useEffect(() => {
    if (!medioId && medios.length > 0) setMedioId(medios.find((m) => m.duenoMiembroId === hogar.miembroActual.id)?.id ?? medios[0]?.id ?? null)
  }, [hogar.miembroActual.id, medioId, medios])

  async function confirmar() {
    if (guardando) return
    if (monto <= 0) return setError('Ingresa un monto mayor a $0.')
    if (!medioId) return setError('Elige un medio de pago.')
    setGuardando(true)
    setError('')
    try {
      const res = await controlador.registrarPagoObligacion({ obligacionId, periodo: item?.periodo ?? periodo, medioId, fecha, monto })
      mostrarToast(res.resumen)
      recargar()
      navigate('/obligaciones')
    } catch (causa) {
      setError(causa instanceof Error && causa.message ? causa.message : 'No pudimos registrar el pago.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ShellApp
      titulo="Registrar pago"
      subtitulo={item ? `${item.nombre} · ${item.categoriaNombre}` : 'Obligación del mes'}
      volverA="/obligaciones"
      etiquetaVolver="Volver a Obligaciones del mes"
      etiquetaBarraAccion="Confirmar pago de obligación recurrente"
      barraAccion={<button type="button" className={`${claseBotonPrimario} w-full`} disabled={guardando} onClick={() => void confirmar()} data-sin-scroll>{guardando ? 'Registrando…' : `Confirmar pago (${formatearPesos(monto)})`}</button>}
    >
      {error ? <Aviso variante="peligro" icono="▲" role="alert"><p>{error}</p></Aviso> : null}
      <Tarjeta acento="primario">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">{item ? item.nombre : 'Obligación del hogar'}</h2>
            <AyudaInfo
              etiqueta="Información sobre pago recurrente"
              texto={`Al pagarla se registra también un gasto en ${item?.categoriaNombre ?? 'su categoría'}.`}
            />
          </div>
          <Insignia variante="neutral">{item ? nombreMesPeriodoEs(item.periodo) : 'Hogar'}</Insignia>
        </div>
      </Tarjeta>
      <Tarjeta className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pago-obligacion-monto" className={claseEtiquetaCampo}>Monto pagado (COP)</label>
          <CampoMontoCop
            id="pago-obligacion-monto"
            className="text-2xl font-extrabold"
            valor={monto}
            onCambiar={(m) => { setError(''); setMonto(m) }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="cuenta-origen-obligacion" className={claseEtiquetaCampo}>Medio de pago</label>
            <select id="cuenta-origen-obligacion" className={claseCampoTexto} value={medioId ?? ''} onChange={(e) => setMedioId(e.target.value || null)}>
              {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="fecha-pago-obligacion" className={claseEtiquetaCampo}>Fecha</label>
            <input id="fecha-pago-obligacion" className={claseCampoTexto} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
      </Tarjeta>
    </ShellApp>
  )
}

export function PantallaRegistrarPago() {
  const { tipo, id } = useParams<{ tipo: string; id: string }>()
  if (!id) {
    return (
      <ShellApp titulo="Registrar pago" volverA="/obligaciones" etiquetaVolver="Volver a Obligaciones del mes">
        <Aviso variante="ambar" icono="▲" role="alert"><p>Elige una obligación para registrar su pago.</p></Aviso>
        <Link to="/obligaciones" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>Volver a Obligaciones</Link>
      </ShellApp>
    )
  }
  if (tipo === 'obligacion') return <PagoObligacionRecurrente obligacionId={id} />
  if (tipo === 'pasivo') return <PagoCuota pasivoId={id} />
  return <PagoCuota cuotaId={id} />
}
