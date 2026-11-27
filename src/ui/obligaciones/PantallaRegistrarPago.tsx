import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { BorradorPago, EvaluacionPago } from '../../app/obligaciones'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso, AyudaInfo, CampoMontoCop, Insignia, Tarjeta, claseAyudaCampo, claseBotonPequenoSecundario,
  claseBotonPrimario, claseBotonSecundario, claseCampoTexto, claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { formatearFechaCortaEs, parsearDigitosCop } from '../compraRapida/formatoCop'
import { useObligaciones } from './ContextoObligaciones'
import { ListaDesglose, TarjetaRadio, etiquetaAmbitoTitular, nombreMesPeriodoEs, type FilaDesglose } from './PiezasObligaciones'

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
            ? 'No pudimos preparar el abono de este pasivo.'
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
  const fechaCorta = borrador ? formatearFechaCortaEs(borrador.fecha) : ''
  const aporteEvaluado = evaluacion && 'aporte' in evaluacion ? evaluacion.aporte : undefined

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

  const ctaBarra = !borradorEfectivo || !evaluacion ? (
    <button type="button" className={`${claseBotonPrimario} w-full`} disabled data-sin-scroll>Preparando pago…</button>
  ) : evaluacion.estado === 'duplicado' ? (
    <button type="button" className={`${claseBotonPrimario} w-full`} disabled data-sin-scroll>Pago duplicado rechazado</button>
  ) : evaluacion.estado === 'sobrepago' ? (
    <button type="button" className={`${claseBotonPrimario} w-full`} onClick={() => sobrepagoRef.current?.focus()} data-sin-scroll>
      Revisar sobrepago ({formatearPesos(evaluacion.monto)})
    </button>
  ) : evaluacion.estado === 'invalido' ? (
    <button type="button" className={`${claseBotonPrimario} w-full`} disabled data-sin-scroll>Confirmar pago ({formatearPesos(montoMostrado)})</button>
  ) : (
    <button type="button" className={`${claseBotonPrimario} w-full`} disabled={guardando} onClick={() => void ejecutarRegistro(false)} data-sin-scroll>
      {guardando ? 'Registrando…' : `Confirmar pago (${formatearPesos(evaluacion.monto)})`}
    </button>
  )

  const filasDesglose: FilaDesglose[] = !borradorEfectivo
    ? []
    : evaluacion?.estado === 'valido'
      ? [
          { etiqueta: `Saldo causado al ${fechaCorta} (tope único del abono)`, valor: formatearPesos(evaluacion.saldoAntes) },
          { etiqueta: 'Capital aplicado (no suma al consumo)', valor: formatearPesos(evaluacion.capitalAplicado) },
          { etiqueta: `Interés ligado a la cuota (${interesEditado ? 'manual' : 'Costo financiero'})`, valor: borradorEfectivo.interes !== null ? formatearPesos(borradorEfectivo.interes) : '$0 (sin tasa)' },
          { etiqueta: `Abono total el ${fechaCorta} (PagoDeDeuda)`, valor: formatearPesos(evaluacion.monto), total: true },
          { etiqueta: 'Saldo derivado después del pago', valor: formatearPesos(evaluacion.saldoDespues) },
          {
            etiqueta: 'Aporte individual (solo cuenta personal en pasivo hogar)',
            valor: evaluacion.aporte ? `${formatearPesos(evaluacion.aporte.monto)} · ${nombreMiembro(evaluacion.aporte.miembroId)}` : '$0 (sin aporte individual)',
          },
        ]
      : evaluacion?.estado === 'sobrepago'
        ? [
            { etiqueta: `Tope de abono al ${fechaCorta} (saldo causado)`, valor: formatearPesos(evaluacion.tope) },
            { etiqueta: 'Excedente a saldo a favor', valor: formatearPesos(evaluacion.excedente) },
            { etiqueta: 'Total a dividir con confirmación', valor: formatearPesos(evaluacion.monto), total: true },
          ]
        : [
            { etiqueta: 'Capital ingresado', valor: formatearPesos(borradorEfectivo.capital) },
            { etiqueta: 'Interés ingresado', valor: borradorEfectivo.interes !== null ? formatearPesos(borradorEfectivo.interes) : '$0 (sin tasa)' },
            { etiqueta: 'Total del abono', valor: formatearPesos(montoMostrado), total: true },
          ]

  const subtitulo = item ? (item.nCuotas > 0 ? `Cuota ${item.numero}/${item.nCuotas} · ${item.descripcion}` : item.descripcion) : 'Pago de cuota'

  return (
    <ShellApp
      titulo="Registrar pago"
      subtitulo={subtitulo}
      volverA="/obligaciones"
      etiquetaVolver="Volver a Obligaciones del mes"
      accionDerecha={<Insignia variante="indigo">Pasivo</Insignia>}
      etiquetaBarraAccion="Confirmar pago de obligación"
      barraAccion={ctaBarra}
    >
      {errorAccion ? <Aviso variante="peligro" icono="▲" role="alert"><p>{errorAccion}</p></Aviso> : null}

      {cargando || !borrador || !borradorEfectivo ? (
        <Aviso variante="indigo" icono="◷" role="status"><p className="font-bold">Cargando desglose del pago…</p></Aviso>
      ) : (
        <>
          {item ? (
            <Tarjeta acento="indigo">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">{item.pasivoNombre} · Vence {formatearFechaCortaEs(item.fechaVencimiento)}</h2>
                  <AyudaInfo
                    etiqueta="Información sobre el pago de cuotas"
                    texto="El pago reduce el saldo del pasivo sin volver a sumar al consumo del mes. El interés entra al balde aparte de Costo financiero."
                  />
                </div>
                <Insignia variante={item.ambito === 'hogar' ? 'primario' : 'neutral'}>{etiquetaAmbitoTitular(item.ambito, item.titular)}</Insignia>
              </div>
            </Tarjeta>
          ) : pasivoInfo ? (
            <Tarjeta acento="indigo">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Abono libre · {pasivoInfo.nombre}</h2>
                  <AyudaInfo
                    etiqueta="Información sobre abono libre"
                    texto="El abono reduce el saldo del pasivo sin volver a sumar al consumo del mes. El interés entra al balde aparte de Costo financiero."
                  />
                </div>
                <Insignia variante={pasivoInfo.ambito === 'hogar' ? 'primario' : 'neutral'}>{etiquetaAmbitoTitular(pasivoInfo.ambito, pasivoInfo.titular)}</Insignia>
              </div>
              <p className={`${claseAyudaCampo} mt-1`}>
                Saldo pendiente actual: <strong className="hogar-cop text-hogar-tinta">{formatearPesos(pasivoInfo.saldoPendiente)}</strong>
              </p>
            </Tarjeta>
          ) : null}

          {!enlazarCuota && !pasivoId ? (
            <Aviso variante="indigo" icono="ℹ" role="status">
              <p><strong className="text-hogar-tinta">Modo adelanto sin cuota:</strong> este pago se evaluará sin <code>cuota_id</code>, sujeto al tope del saldo causado a la fecha.</p>
            </Aviso>
          ) : null}

          <div className="flex flex-col gap-3.5">
            {miembrosActivos.length > 0 ? (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className={claseEtiquetaCampo}>¿Quién realiza este pago?</legend>
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

            {aporteEvaluado ? (
              <Aviso variante="primario" icono="✓">
                <p>
                  <strong className="text-hogar-tinta">Aporte libre{item ? ` (${etiquetaAmbitoTitular(item.ambito, item.titular)})` : ''}:</strong>{' '}
                  este abono cuenta como aporte individual de <strong className="text-hogar-tinta">{nombreMiembro(aporteEvaluado.miembroId)} ({formatearPesos(aporteEvaluado.monto)})</strong> sin generar deuda entre ustedes. Desde <strong>«Cuenta común · Hogar»</strong> no hay aporte individual.
                </p>
              </Aviso>
            ) : aporteEvaluado === null ? (
              <Aviso variante="indigo" icono="ℹ">
                <p>
                  <strong className="text-hogar-tinta">Sin aporte individual ($0):</strong>{' '}
                  {item?.ambito === 'personal'
                    ? 'es un pasivo personal y sus pagos no suman al balance del hogar.'
                    : 'salida del fondo común o libro personal; no suma aporte individual.'}
                </p>
              </Aviso>
            ) : null}

            <Tarjeta className="flex flex-col gap-3.5">
              <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Desglose del pago (COP enteros · {fechaCorta})</h2>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pago-capital" className={claseEtiquetaCampo}>Capital aplicado {pasivoId ? 'al pasivo' : 'a la cuota'} (no suma al consumo)</label>
                <CampoMontoCop
                  inputRef={capitalRef}
                  id="pago-capital"
                  className="text-xl font-extrabold"
                  valor={borrador.capital}
                  aria-describedby="ayuda-capital"
                  onCambiar={(capital) => {
                    setErrorAccion('')
                    setBorrador((p) => (p ? { ...p, capital } : p))
                  }}
                />
                <p id="ayuda-capital" className={claseAyudaCampo}>
                  {pasivoId
                    ? `Saldo pendiente sugerido: ${formatearPesos(capitalInicial)}. Puedes abonar parcial o totalmente.`
                    : borrador.capital > 0 && borrador.capital < capitalInicial
                      ? 'Pago parcial: se registrará sin enlazar la cuota (FIFO).'
                      : `Capital sugerido de la cuota: ${formatearPesos(capitalInicial)}. Editable si haces abono parcial o extraordinario.`}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pago-intereses" className={claseEtiquetaCampo}>Interés ligado a la cuota · Costo financiero (cargado al pasivo)</label>
                <input
                  id="pago-intereses"
                  className={`${claseCampoTexto} hogar-cop text-xl font-extrabold`}
                  type="text"
                  inputMode="numeric"
                  value={borrador.interes !== null ? formatearPesos(borrador.interes) : ''}
                  placeholder="$0 (opcional)"
                  aria-describedby="ayuda-intereses"
                  onChange={(e) => {
                    setErrorAccion('')
                    const limpio = e.target.value.replace(/\D+/g, '')
                    const siguiente = limpio ? parsearDigitosCop(limpio) : null
                    setBorrador((p) => (p ? { ...p, interes: siguiente !== null && siguiente > 0 ? siguiente : null } : p))
                  }}
                />
                <p id="ayuda-intereses" className={claseAyudaCampo}>
                  {interesEditado
                    ? 'Interés editado contra el extracto: se enviará tal cual para guardarse con origen manual.'
                    : interesInicial === null
                      ? 'Este pasivo está en Sin tasa. Ingresa intereses o comisiones solo si tu extracto los cobra.'
                      : 'Estimación editable contra el extracto real (balde aparte Costo financiero). Si lo corriges, quedará como manual.'}
                </p>
              </div>
              <ListaDesglose filas={filasDesglose} />
            </Tarjeta>

            <div className="grid grid-cols-2 items-end gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="cuenta-origen" className={claseEtiquetaCampo}>Medio de origen</label>
                  <AyudaInfo
                    etiqueta="Información sobre medio de origen"
                    texto="Cuenta personal aporta al dueño del medio; Cuenta común no genera aporte individual."
                  />
                </div>
                <select id="cuenta-origen" className={claseCampoTexto} value={borrador.medioId ?? ''} onChange={(e) => setBorrador((p) => (p ? { ...p, medioId: e.target.value || null } : p))}>
                  {medios.length === 0 ? <option value="">Sin medios disponibles</option> : null}
                  {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="fecha-pago" className={claseEtiquetaCampo}>Fecha de pago</label>
                  <AyudaInfo
                    etiqueta="Información sobre fecha de pago"
                    texto="Define el saldo causado a esa fecha."
                  />
                </div>
                <input id="fecha-pago" className={claseCampoTexto} type="date" value={borrador.fecha} onChange={(e) => setBorrador((p) => (p ? { ...p, fecha: e.target.value } : p))} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="nota-pago" className={claseEtiquetaCampo}>Nota (opcional)</label>
              <input id="nota-pago" className={claseCampoTexto} type="text" placeholder="Ej. Comprobante o referencia bancaria" value={borrador.nota} onChange={(e) => setBorrador((p) => (p ? { ...p, nota: e.target.value } : p))} />
            </div>

            {evaluacion?.estado === 'invalido' ? <Aviso variante="peligro" icono="▲" role="alert"><p>{evaluacion.mensaje}</p></Aviso> : null}

            {evaluacion?.estado === 'duplicado' ? (
              <Tarjeta acento="peligro" className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Protección contra pago duplicado</h2>
                  <Insignia variante="peligro">▲ Rechazado</Insignia>
                </div>
                <Aviso variante="peligro" icono="▲" role="alert">
                  <p><strong className="text-hogar-tinta">Posible pago duplicado (cuota ya cubierta).</strong></p>
                  <p>Ya existe un abono registrado el <strong>{formatearFechaCortaEs(evaluacion.existente.fecha)}</strong> por <strong className="hogar-cop">{formatearPesos(evaluacion.existente.monto)}</strong> ({evaluacion.existente.registradoPor}). No se puede confirmar ni dividir.</p>
                </Aviso>
                <div className="flex flex-wrap gap-2">
                  <Link to="/obligaciones" className={`${claseBotonPequenoSecundario} flex-1 basis-[130px] no-underline`}>Cancelar y revisar pagos</Link>
                  <button type="button" className={`${claseBotonPequenoSecundario} flex-1 basis-[130px]`} onClick={() => { setEnlazarCuota(false); capitalRef.current?.focus() }}>Registrar adelanto sin cuota</button>
                </div>
              </Tarjeta>
            ) : null}

            {evaluacion?.estado === 'sobrepago' ? (
              <Tarjeta acento="ambar" className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Sobrepago sobre el saldo causado</h2>
                  <Insignia variante="ambar">▲ Confirmación</Insignia>
                </div>
                <Aviso variante="ambar" icono="▲" role="alert">
                  <p><strong className="text-hogar-tinta">Posible pago duplicado o sobrepago (monto mayor al saldo causado).</strong></p>
                  <p>El monto ({formatearPesos(evaluacion.monto)}) supera el saldo causado ({formatearPesos(evaluacion.tope)}). Con confirmación explícita se registrará en el mismo lote un <em>abono</em> de {formatearPesos(evaluacion.tope)} y un <em>saldo a favor</em> de {formatearPesos(evaluacion.excedente)} (no reduce capital ni costos ni aporta hasta cubrir un cargo futuro del hogar).</p>
                </Aviso>
                <div className="flex flex-wrap gap-2">
                  <Link to="/obligaciones" className={`${claseBotonPequenoSecundario} flex-1 basis-[130px] no-underline`}>Cancelar</Link>
                  <button ref={sobrepagoRef} type="button" className={`${claseBotonPequenoSecundario} flex-1 basis-[130px] border-hogar-ambar`} disabled={guardando} onClick={() => void ejecutarRegistro(true)}>
                    {guardando ? 'Dividiendo…' : 'Dividir: abono + saldo a favor'}
                  </button>
                </div>
              </Tarjeta>
            ) : null}

            <Link to="/obligaciones" className={`${claseBotonSecundario} w-full no-underline`}>Cancelar</Link>
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
    if (!medioId) return setError('Elige un medio de origen para registrar el pago.')
    setGuardando(true)
    setError('')
    try {
      const res = await controlador.registrarPagoObligacion({ obligacionId, periodo: item?.periodo ?? periodo, medioId, fecha, monto })
      mostrarToast(res.resumen)
      recargar()
      navigate('/obligaciones')
    } catch (causa) {
      setError(causa instanceof Error && causa.message ? causa.message : 'No pudimos registrar el pago de la obligación.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ShellApp
      titulo="Registrar pago"
      subtitulo={item ? `${item.nombre} · ${item.categoriaNombre}` : 'Obligación recurrente'}
      volverA="/obligaciones"
      etiquetaVolver="Volver a Obligaciones del mes"
      accionDerecha={<Insignia variante="primario">Obligación</Insignia>}
      etiquetaBarraAccion="Confirmar pago de obligación recurrente"
      barraAccion={<button type="button" className={`${claseBotonPrimario} w-full`} disabled={guardando} onClick={() => void confirmar()} data-sin-scroll>{guardando ? 'Registrando…' : `Confirmar pago (${formatearPesos(monto)})`}</button>}
    >
      {error ? <Aviso variante="peligro" icono="▲" role="alert"><p>{error}</p></Aviso> : null}
      <Tarjeta acento="primario">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">{item ? item.nombre : 'Obligación del hogar'}</h2>
          <Insignia variante="neutral">{item ? `Periodo ${nombreMesPeriodoEs(item.periodo)}` : 'Obligación del hogar'}</Insignia>
        </div>
        <p className={claseAyudaCampo}>Al pagarla se crea una Compra en <strong>{item?.categoriaNombre ?? 'su categoría'}</strong> para este periodo. Cierra la agenda del periodo y suma al gasto real en la fecha de pago.</p>
      </Tarjeta>
      <Tarjeta className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pago-obligacion-monto" className={claseEtiquetaCampo}>Monto pagado en COP (enteros)</label>
          <CampoMontoCop
            id="pago-obligacion-monto"
            className="text-xl font-extrabold"
            valor={monto}
            onCambiar={(m) => { setError(''); setMonto(m) }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="cuenta-origen-obligacion" className={claseEtiquetaCampo}>Medio de origen</label>
            <select id="cuenta-origen-obligacion" className={claseCampoTexto} value={medioId ?? ''} onChange={(e) => setMedioId(e.target.value || null)}>
              {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="fecha-pago-obligacion" className={claseEtiquetaCampo}>Fecha de pago</label>
            <input id="fecha-pago-obligacion" className={claseCampoTexto} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
      </Tarjeta>
      <Link to="/obligaciones" className={`${claseBotonSecundario} w-full no-underline`}>Cancelar</Link>
    </ShellApp>
  )
}

export function PantallaRegistrarPago() {
  const { tipo, id } = useParams<{ tipo: string; id: string }>()
  if (!id) {
    return (
      <ShellApp titulo="Registrar pago" volverA="/obligaciones" etiquetaVolver="Volver a Obligaciones del mes">
        <Aviso variante="ambar" icono="▲" role="alert"><p>Elige una cuota u obligación desde la agenda del mes para registrar su pago.</p></Aviso>
        <Link to="/obligaciones" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>Volver a Obligaciones</Link>
      </ShellApp>
    )
  }
  if (tipo === 'obligacion') return <PagoObligacionRecurrente obligacionId={id} />
  if (tipo === 'pasivo') return <PagoCuota pasivoId={id} />
  return <PagoCuota cuotaId={id} />
}
