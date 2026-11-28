import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Ambito, BorradorPasivo, ErrorFormulario } from '../../app/obligaciones'
import { hoyCivil } from '../../domain/fechas'
import {
  Aviso, AyudaInfo, CampoMontoCop, Insignia, Tarjeta, claseAyudaCampo, claseBotonPrimario,
  claseCampoTexto, claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { formatearPorcentajeEs } from '../compraRapida/formatoCop'
import { useObligaciones } from './ContextoObligaciones'
import { ATAJOS_ENTIDADES_FINANCIERAS, identidadMedio } from '../marcas'
import { TarjetaRadio, parsearPorcentajeEs } from './PiezasObligaciones'

type TipoPasivo = BorradorPasivo['tipo']
type ModalidadTasa = 'ninguna' | 'EA' | 'MV'
type SistemaPlan = 'sin_calendario' | 'capital_fijo'

export function PantallaNuevoPasivo() {
  const navigate = useNavigate()
  const { hogar, controlador, recargar, mostrarToast } = useObligaciones()
  const miembrosActivos = useMemo(() => hogar.miembros.filter((m) => m.activo), [hogar.miembros])

  const [tipo, setTipo] = useState<TipoPasivo>('tarjeta')
  const [ambito, setAmbito] = useState<Ambito>('hogar')
  const [nombre, setNombre] = useState('')
  const [titularMiembroId, setTitularMiembroId] = useState<string | null>(hogar.miembroActual.id)
  const [diaCorte, setDiaCorte] = useState('15')
  const [diaPago, setDiaPago] = useState('25')
  const [ultimos4, setUltimos4] = useState('')
  const [cupo, setCupo] = useState(0)
  const [entidad, setEntidad] = useState('')
  const [referencia, setReferencia] = useState('')
  const [acreedor, setAcreedor] = useState('')
  const [modalidadTasa, setModalidadTasa] = useState<ModalidadTasa>('ninguna')
  const [valorTasaTexto, setValorTasaTexto] = useState('')
  const [origenPlan, setOrigenPlan] = useState<'saldo_inicial' | 'desembolso'>('saldo_inicial')
  const [capitalPlan, setCapitalPlan] = useState(0)
  const [fechaPlan, setFechaPlan] = useState(() => hoyCivil(new Date()))
  const [sistemaPlan, setSistemaPlan] = useState<SistemaPlan>('sin_calendario')
  const [nCuotasPlan, setNCuotasPlan] = useState('')
  const [fechaPrimeraCuota, setFechaPrimeraCuota] = useState('')
  const [errorForm, setErrorForm] = useState<ErrorFormulario | null>(null)
  const [guardando, setGuardando] = useState(false)

  const nombreRef = useRef<HTMLInputElement>(null)
  const entidadRef = useRef<HTMLInputElement>(null)
  const acreedorRef = useRef<HTMLInputElement>(null)
  const tasaRef = useRef<HTMLInputElement>(null)

  const permiteTitularHogar = tipo === 'deuda' && ambito === 'hogar'
  const permiteDesembolso = tipo !== 'tarjeta'
  const porcentajeParseado = modalidadTasa === 'ninguna' ? null : parsearPorcentajeEs(valorTasaTexto)

  const equivalencia = useMemo(() => {
    if (modalidadTasa === 'ninguna' || porcentajeParseado === null) return null
    try { return controlador.equivalenciaTasa({ tipo: modalidadTasa, porcentaje: porcentajeParseado }) } catch { return null }
  }, [controlador, modalidadTasa, porcentajeParseado])

  function cambiarTipo(siguiente: TipoPasivo) {
    setTipo(siguiente)
    setErrorForm(null)
    if (siguiente !== 'deuda' && titularMiembroId === null) setTitularMiembroId(hogar.miembroActual.id)
    if (siguiente === 'tarjeta' && origenPlan === 'desembolso') setOrigenPlan('saldo_inicial')
  }

  function cambiarAmbito(siguiente: Ambito) {
    setAmbito(siguiente)
    setErrorForm(null)
    if (siguiente === 'personal' && titularMiembroId === null) setTitularMiembroId(hogar.miembroActual.id)
  }

  function construirBorrador(): BorradorPasivo {
    const nCuotas = Number.parseInt(nCuotasPlan, 10)
    const corteNum = Number.parseInt(diaCorte, 10)
    const pagoNum = Number.parseInt(diaPago, 10)
    return {
      tipo,
      nombre: nombre.trim(),
      ambito,
      titularMiembroId: permiteTitularHogar ? titularMiembroId : (titularMiembroId ?? hogar.miembroActual.id),
      tasa: modalidadTasa !== 'ninguna' && porcentajeParseado !== null ? { tipo: modalidadTasa, porcentaje: porcentajeParseado } : null,
      tarjeta: tipo === 'tarjeta' ? { diaCorte: Number.isFinite(corteNum) ? corteNum : 0, diaPago: Number.isFinite(pagoNum) ? pagoNum : 0, ultimos4: ultimos4.trim() || null, cupo: cupo > 0 ? cupo : null } : null,
      credito: tipo === 'credito' ? { entidad: entidad.trim(), referencia: referencia.trim() || null } : null,
      deuda: tipo === 'deuda' ? { acreedor: acreedor.trim() } : null,
      plan: capitalPlan > 0 ? {
        origen: permiteDesembolso ? origenPlan : 'saldo_inicial',
        capital: capitalPlan,
        fechaInicio: fechaPlan,
        calendario: sistemaPlan === 'capital_fijo' && Number.isFinite(nCuotas) && nCuotas > 0 && fechaPrimeraCuota ? { nCuotas, fechaPrimeraCuota } : null,
      } : null,
    }
  }

  async function manejarGuardar() {
    if (guardando) return
    if (modalidadTasa !== 'ninguna' && porcentajeParseado === null) {
      setErrorForm({ campo: 'tasa', mensaje: 'Ingresa una tasa válida (ej. 28,32) o elige Sin tasa.' })
      return tasaRef.current?.focus()
    }
    if (capitalPlan > 0 && sistemaPlan === 'capital_fijo') {
      const n = Number.parseInt(nCuotasPlan, 10)
      if (!Number.isFinite(n) || n < 1 || !fechaPrimeraCuota) {
        return setErrorForm({ campo: 'plan', mensaje: 'Completa el número de cuotas y la primera fecha, o elige Abonos libres.' })
      }
    }
    const borrador = construirBorrador()
    const errorValidacion = controlador.validarPasivo(borrador)
    if (errorValidacion) {
      setErrorForm(errorValidacion)
      if (errorValidacion.campo === 'nombre') nombreRef.current?.focus()
      else if (errorValidacion.campo === 'entidad' || errorValidacion.campo === 'credito') entidadRef.current?.focus()
      else if (errorValidacion.campo === 'acreedor' || errorValidacion.campo === 'deuda') acreedorRef.current?.focus()
      else if (errorValidacion.campo === 'tasa') tasaRef.current?.focus()
      return
    }
    setGuardando(true)
    setErrorForm(null)
    try {
      const res = await controlador.crearPasivo(borrador)
      mostrarToast(res.resumen)
      recargar()
      navigate('/obligaciones')
    } catch (causa) {
      setErrorForm({ campo: 'general', mensaje: causa instanceof Error && causa.message ? causa.message : 'No pudimos guardar la obligación.' })
    } finally {
      setGuardando(false)
    }
  }

  const placeholderNombre =
    tipo === 'tarjeta'
      ? 'Ej. Visa ••4521'
      : tipo === 'credito'
        ? 'Ej. Crédito libre inversión'
        : 'Ej. Préstamo remodelación'

  return (
    <ShellApp
      titulo="Nueva obligación"
      subtitulo="Tarjeta de crédito, crédito libre o deuda externa"
      volverA="/obligaciones"
      etiquetaVolver="Volver a Obligaciones del mes"
      etiquetaBarraAccion="Guardar obligación"
      barraAccion={<button type="button" className={`${claseBotonPrimario} w-full`} disabled={guardando} onClick={() => void manejarGuardar()} data-sin-scroll>{guardando ? 'Guardando…' : 'Guardar obligación'}</button>}
    >
      {errorForm ? <Aviso variante="peligro" icono="▲" role="alert"><p>{errorForm.mensaje}</p></Aviso> : null}

      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); void manejarGuardar() }} noValidate>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <div className="flex items-center gap-1.5">
            <legend className={claseEtiquetaCampo}>Tipo de deuda</legend>
            <AyudaInfo
              etiqueta="Información sobre tipo de deuda"
              texto="Deuda externa puede quedar a nombre del Hogar o de un miembro. Tarjeta y Crédito libre van a nombre de un miembro."
            />
          </div>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de deuda">
            {[
              {
                id: 'tipo-tc',
                valor: 'tarjeta' as const,
                etiqueta: 'Tarjeta de crédito',
                icono: (
                  <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                    <path d="M2.5 10h19" />
                    <path d="M6.5 15h4" />
                  </svg>
                ),
              },
              {
                id: 'tipo-credito',
                valor: 'credito' as const,
                etiqueta: 'Crédito libre',
                icono: (
                  <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <path d="M3 10h18L12 4 3 10Z" />
                    <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 18h18" />
                  </svg>
                ),
              },
              {
                id: 'tipo-deuda',
                valor: 'deuda' as const,
                etiqueta: 'Deuda externa',
                icono: (
                  <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                    <path d="M16 11h5M18.5 8.5v5" />
                  </svg>
                ),
              },
            ].map((opcion) => {
              const marcado = tipo === opcion.valor
              return (
                <label
                  key={opcion.id}
                  htmlFor={opcion.id}
                  className={`flex min-h-[76px] min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-center text-xs font-bold leading-tight transition-all duration-150 ${
                    marcado
                      ? 'border-hogar-primario bg-hogar-primario-suave text-hogar-primario shadow-[0_3px_10px_-3px_rgba(15,92,72,0.28)]'
                      : 'border-hogar-borde bg-hogar-superficie text-hogar-tinta hover:bg-hogar-superficie-suave'
                  }`}
                >
                  <input
                    id={opcion.id}
                    type="radio"
                    name="tipo-instrumento"
                    value={opcion.valor}
                    checked={marcado}
                    onChange={() => cambiarTipo(opcion.valor)}
                    className="sr-only"
                  />
                  {opcion.icono}
                  <span className="break-words">{opcion.etiqueta}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <div className="flex items-center gap-1.5">
            <legend className={claseEtiquetaCampo}>Ámbito</legend>
            <AyudaInfo
              etiqueta="Información sobre ámbito"
              texto="Hogar es visible y pagable entre ambos; Personal solo la ves tú."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TarjetaRadio id="ambito-hogar" name="ambito-pasivo" value="hogar" checked={ambito === 'hogar'} onChange={() => cambiarAmbito('hogar')}>Hogar</TarjetaRadio>
            <TarjetaRadio id="ambito-personal" name="ambito-pasivo" value="personal" checked={ambito === 'personal'} onChange={() => cambiarAmbito('personal')}>Personal</TarjetaRadio>
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nombre-tarjeta" className={claseEtiquetaCampo}>Nombre o alias</label>
          <input ref={nombreRef} id="nombre-tarjeta" className={claseCampoTexto} type="text" value={nombre} placeholder={placeholderNombre} aria-invalid={errorForm?.campo === 'nombre' ? 'true' : undefined} onChange={(e) => { setErrorForm(null); setNombre(e.target.value) }} />
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <div className="flex items-center gap-1.5">
            <legend className={claseEtiquetaCampo}>Titular</legend>
            <AyudaInfo
              etiqueta="Información sobre titular"
              texto="Titular Hogar aplica para Deuda externa compartida. Cualquiera de los dos puede abonar a obligaciones del hogar."
            />
          </div>
          <div className={`grid gap-2 ${miembrosActivos.length === 1 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {miembrosActivos.map((miembro) => (
              <TarjetaRadio key={miembro.id} id={`titular-${miembro.id}`} name="titular" value={miembro.id} checked={titularMiembroId === miembro.id} onChange={() => setTitularMiembroId(miembro.id)}>{miembro.nombre}</TarjetaRadio>
            ))}
            <TarjetaRadio id="titular-hogar" name="titular" value="hogar" checked={titularMiembroId === null} disabled={!permiteTitularHogar} onChange={() => setTitularMiembroId(null)}>Hogar</TarjetaRadio>
          </div>
        </fieldset>

        {tipo === 'tarjeta' ? (
          <>
            <div className="grid grid-cols-2 items-end gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="dia-corte" className={claseEtiquetaCampo}>Día de corte</label>
                <input id="dia-corte" className={claseCampoTexto} type="number" min={1} max={31} value={diaCorte} onChange={(e) => setDiaCorte(e.target.value)} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="dia-pago" className={claseEtiquetaCampo}>Día límite de pago</label>
                <input id="dia-pago" className={claseCampoTexto} type="number" min={1} max={31} value={diaPago} onChange={(e) => setDiaPago(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 items-end gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="ultimos-4" className={claseEtiquetaCampo}>Últimos 4 (opcional)</label>
                <input id="ultimos-4" className={claseCampoTexto} type="text" inputMode="numeric" maxLength={4} placeholder="Ej. 4521" value={ultimos4} onChange={(e) => setUltimos4(e.target.value.replace(/\D+/g, '').slice(0, 4))} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="cupo-cop" className={claseEtiquetaCampo}>Cupo (opcional)</label>
                <CampoMontoCop id="cupo-cop" className="font-bold" placeholder="Ej. $6.000.000" valor={cupo} onCambiar={setCupo} />
              </div>
            </div>
          </>
        ) : tipo === 'credito' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="entidad-credito" className={claseEtiquetaCampo}>Entidad financiera</label>
              <div
                className="hogar-carrusel"
                role="group"
                aria-label="Entidades financieras frecuentes"
              >
                {ATAJOS_ENTIDADES_FINANCIERAS.map((banco) => {
                  const activo = entidad.trim().toLowerCase() === banco.toLowerCase()
                  const idVisual = identidadMedio(banco, 'cuenta')
                  const { Logo } = idVisual
                  return (
                    <button
                      key={banco}
                      type="button"
                      className={`inline-flex min-h-11 shrink-0 snap-start cursor-pointer items-center gap-2 rounded-full border-2 px-3.5 py-2 text-xs font-bold transition-transform duration-150 active:scale-[0.95] ${
                        activo ? '-translate-y-0.5 ring-2 ring-hogar-primario ring-offset-1' : 'opacity-95 hover:opacity-100'
                      }`}
                      style={{
                        background: idVisual.gradiente,
                        color: idVisual.texto,
                        borderColor: activo ? idVisual.acento : 'transparent',
                        boxShadow: activo ? idVisual.sombra : '0 2px 6px -2px rgba(16, 24, 20, 0.16)',
                      }}
                      aria-pressed={activo}
                      onClick={() => {
                        setErrorForm(null)
                        setEntidad(activo ? '' : banco)
                      }}
                    >
                      <Logo className="size-4 shrink-0" />
                      <span>{banco}</span>
                    </button>
                  )
                })}
              </div>
              <input ref={entidadRef} id="entidad-credito" className={claseCampoTexto} type="text" placeholder="Ej. Bancolombia, Davivienda" value={entidad} aria-invalid={errorForm?.campo === 'entidad' ? 'true' : undefined} onChange={(e) => { setErrorForm(null); setEntidad(e.target.value) }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="referencia-credito" className={claseEtiquetaCampo}>Referencia (opcional)</label>
              <input id="referencia-credito" className={claseCampoTexto} type="text" placeholder="Ej. Obligación 004192" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="acreedor-deuda" className={claseEtiquetaCampo}>¿A quién se le debe?</label>
            <input ref={acreedorRef} id="acreedor-deuda" className={claseCampoTexto} type="text" placeholder="Ej. Familiar, amigo o empresa" value={acreedor} aria-invalid={errorForm?.campo === 'acreedor' ? 'true' : undefined} onChange={(e) => { setErrorForm(null); setAcreedor(e.target.value) }} />
          </div>
        )}

        <Tarjeta className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Tasa de interés (opcional)</h2>
              <AyudaInfo
                etiqueta="Información sobre tasa de interés"
                texto="En Sin tasa puedes ingresar intereses manualmente si aparecen en tu extracto."
              />
            </div>
            <Insignia variante="primario">Opcional</Insignia>
          </div>
          <fieldset className="m-0 border-0 p-0">
            <legend className="sr-only">Modalidad de tasa de interés</legend>
            <div className="grid grid-cols-3 gap-2">
              <TarjetaRadio id="tasa-ninguna" name="tipo-tasa" value="ninguna" checked={modalidadTasa === 'ninguna'} onChange={() => { setModalidadTasa('ninguna'); setErrorForm(null) }}>Sin tasa</TarjetaRadio>
              <TarjetaRadio id="tasa-ea" name="tipo-tasa" value="EA" checked={modalidadTasa === 'EA'} onChange={() => { setModalidadTasa('EA'); setErrorForm(null) }}>% E.A.</TarjetaRadio>
              <TarjetaRadio id="tasa-mv" name="tipo-tasa" value="MV" checked={modalidadTasa === 'MV'} onChange={() => { setModalidadTasa('MV'); setErrorForm(null) }}>% M.V.</TarjetaRadio>
            </div>
          </fieldset>
          {modalidadTasa !== 'ninguna' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="valor-tasa" className={claseEtiquetaCampo}>Valor ({modalidadTasa === 'EA' ? '% E.A.' : '% M.V.'})</label>
              <input ref={tasaRef} id="valor-tasa" className={claseCampoTexto} type="text" inputMode="decimal" placeholder={modalidadTasa === 'EA' ? 'Ej. 28,32' : 'Ej. 2,10'} value={valorTasaTexto} aria-describedby="conversion-tasa" aria-invalid={errorForm?.campo === 'tasa' ? 'true' : undefined} onChange={(e) => { setErrorForm(null); setValorTasaTexto(e.target.value) }} />
              {equivalencia ? (
                <p id="conversion-tasa" className={claseAyudaCampo}>
                  Equivale a <strong className="hogar-cop text-hogar-tinta">{formatearPorcentajeEs(equivalencia.ea, 2)} E.A. ⇄ {formatearPorcentajeEs(equivalencia.mv, 4)} M.V.</strong>
                </p>
              ) : null}
            </div>
          ) : null}
        </Tarjeta>

        <Tarjeta acento="indigo" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Saldo o monto actual</h2>
              <AyudaInfo
                etiqueta="Información sobre saldo inicial"
                texto="Si ya venías pagando esta deuda elige Deuda previa; si recibiste plata nueva elige Préstamo en efectivo."
              />
            </div>
            <Insignia variante="indigo">Opcional</Insignia>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="saldo-inicial-cop" className={claseEtiquetaCampo}>Monto en COP (opcional)</label>
            <CampoMontoCop id="saldo-inicial-cop" className="text-xl font-extrabold" placeholder="$0" valor={capitalPlan} onCambiar={setCapitalPlan} />
          </div>
          <div className="grid grid-cols-2 items-end gap-2.5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="origen-plan" className={claseEtiquetaCampo}>Origen</label>
              <select id="origen-plan" className={claseCampoTexto} value={permiteDesembolso ? origenPlan : 'saldo_inicial'} onChange={(e) => setOrigenPlan(e.target.value === 'desembolso' ? 'desembolso' : 'saldo_inicial')}>
                <option value="saldo_inicial">Deuda previa</option>
                <option value="desembolso" disabled={!permiteDesembolso}>Préstamo en efectivo</option>
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="fecha-saldo-inicial" className={claseEtiquetaCampo}>Fecha</label>
              <input id="fecha-saldo-inicial" className={claseCampoTexto} type="date" value={fechaPlan} onChange={(e) => setFechaPlan(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sistema-amortizacion" className={claseEtiquetaCampo}>Forma de pago</label>
            <select id="sistema-amortizacion" className={claseCampoTexto} value={sistemaPlan} onChange={(e) => setSistemaPlan(e.target.value === 'capital_fijo' ? 'capital_fijo' : 'sin_calendario')}>
              <option value="sin_calendario">Abonos libres</option>
              <option value="capital_fijo">Cuotas mensuales fijas</option>
            </select>
          </div>
          {sistemaPlan === 'capital_fijo' ? (
            <div className="grid grid-cols-2 items-end gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="n-cuotas-inicial" className={claseEtiquetaCampo}>N.º cuotas</label>
                <input id="n-cuotas-inicial" className={claseCampoTexto} type="number" min={1} max={360} placeholder="Ej. 24" value={nCuotasPlan} onChange={(e) => setNCuotasPlan(e.target.value)} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="fecha-primera-cuota" className={claseEtiquetaCampo}>Primera cuota</label>
                <input id="fecha-primera-cuota" className={claseCampoTexto} type="date" value={fechaPrimeraCuota} onChange={(e) => setFechaPrimeraCuota(e.target.value)} />
              </div>
            </div>
          ) : null}
        </Tarjeta>
      </form>
    </ShellApp>
  )
}
