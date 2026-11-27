import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Ambito, BorradorPasivo, ErrorFormulario } from '../../app/obligaciones'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso, AyudaInfo, Insignia, Tarjeta, claseAyudaCampo, claseBotonPrimario,
  claseBotonSecundario, claseCampoTexto, claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { formatearPorcentajeEs, parsearDigitosCop } from '../compraRapida/formatoCop'
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
      setErrorForm({ campo: 'tasa', mensaje: 'Ingresa un valor de tasa válido (ej. 28,32) o elige Sin tasa.' })
      return tasaRef.current?.focus()
    }
    if (capitalPlan > 0 && sistemaPlan === 'capital_fijo') {
      const n = Number.parseInt(nCuotasPlan, 10)
      if (!Number.isFinite(n) || n < 1 || !fechaPrimeraCuota) {
        return setErrorForm({ campo: 'plan', mensaje: 'Completa el número de cuotas y la fecha de la primera cuota, o elige Sin calendario.' })
      }
    }
    const borrador = construirBorrador()
    const errorValidacion = controlador.validarPasivo(borrador)
    if (errorValidacion) {
      setErrorForm(errorValidacion)
      if (errorValidacion.campo === 'nombre') nombreRef.current?.focus()
      else if (errorValidacion.campo === 'entidad') entidadRef.current?.focus()
      else if (errorValidacion.campo === 'acreedor') acreedorRef.current?.focus()
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
      setErrorForm({ campo: 'general', mensaje: causa instanceof Error && causa.message ? causa.message : 'No pudimos guardar el pasivo.' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ShellApp
      titulo="Nuevo pasivo"
      subtitulo="Tarjeta, crédito o deuda en COP"
      volverA="/obligaciones"
      etiquetaVolver="Volver a Obligaciones del mes"
      etiquetaBarraAccion="Guardar pasivo"
      barraAccion={<button type="button" className={`${claseBotonPrimario} w-full`} disabled={guardando} onClick={() => void manejarGuardar()} data-sin-scroll>{guardando ? 'Guardando…' : 'Guardar pasivo'}</button>}
    >
      {errorForm ? <Aviso variante="peligro" icono="▲" role="alert"><p>{errorForm.mensaje}</p></Aviso> : null}

      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); void manejarGuardar() }} noValidate>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <div className="flex items-center gap-1.5">
            <legend className={claseEtiquetaCampo}>Tipo de pasivo</legend>
            <AyudaInfo
              etiqueta="Información sobre tipo de pasivo"
              texto="Fase 1: Tarjeta y Crédito tienen como titular a un solo miembro. Deuda (informal o no bancaria) admite titular miembro u Hogar."
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <TarjetaRadio id="tipo-tc" name="tipo-instrumento" value="tarjeta" checked={tipo === 'tarjeta'} onChange={() => cambiarTipo('tarjeta')}>Tarjeta</TarjetaRadio>
            <TarjetaRadio id="tipo-credito" name="tipo-instrumento" value="credito" checked={tipo === 'credito'} onChange={() => cambiarTipo('credito')}>Crédito</TarjetaRadio>
            <TarjetaRadio id="tipo-deuda" name="tipo-instrumento" value="deuda" checked={tipo === 'deuda'} onChange={() => cambiarTipo('deuda')}>Deuda</TarjetaRadio>
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <div className="flex items-center gap-1.5">
            <legend className={claseEtiquetaCampo}>Ámbito del pasivo</legend>
            <AyudaInfo
              etiqueta="Información sobre ámbito del pasivo"
              texto="Cada pasivo es un libro de un solo ámbito (inmutable con movimientos). Si usas una tarjeta para ambos ámbitos, lleva dos libros aparte con los mismos últimos 4 dígitos."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TarjetaRadio id="ambito-hogar" name="ambito-pasivo" value="hogar" checked={ambito === 'hogar'} onChange={() => cambiarAmbito('hogar')}>Hogar</TarjetaRadio>
            <TarjetaRadio id="ambito-personal" name="ambito-pasivo" value="personal" checked={ambito === 'personal'} onChange={() => cambiarAmbito('personal')}>Personal (solo yo)</TarjetaRadio>
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nombre-tarjeta" className={claseEtiquetaCampo}>Nombre o alias</label>
          <input ref={nombreRef} id="nombre-tarjeta" className={claseCampoTexto} type="text" value={nombre} placeholder="Ej. Visa ••4521, Crédito vehículo o Préstamo cocina" aria-invalid={errorForm?.campo === 'nombre' ? 'true' : undefined} onChange={(e) => { setErrorForm(null); setNombre(e.target.value) }} />
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <div className="flex items-center gap-1.5">
            <legend className={claseEtiquetaCampo}>Titular del pasivo</legend>
            <AyudaInfo
              etiqueta="Información sobre titular del pasivo"
              texto="Titular Hogar disponible solo para Deuda en fase 1 (ámbito Hogar). Cualquier miembro puede pagar cualquier pasivo sin crear deuda entre ustedes."
            />
          </div>
          <div className={`grid gap-2 ${miembrosActivos.length === 1 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {miembrosActivos.map((miembro) => (
              <TarjetaRadio key={miembro.id} id={`titular-${miembro.id}`} name="titular" value={miembro.id} checked={titularMiembroId === miembro.id} onChange={() => setTitularMiembroId(miembro.id)}>{miembro.nombre}</TarjetaRadio>
            ))}
            <TarjetaRadio id="titular-hogar" name="titular" value="hogar" checked={titularMiembroId === null} disabled={!permiteTitularHogar} onChange={() => setTitularMiembroId(null)}>Hogar*</TarjetaRadio>
          </div>
        </fieldset>

        {tipo === 'tarjeta' ? (
          <>
            <div className="grid grid-cols-2 items-end gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="dia-corte" className={claseEtiquetaCampo}>Día de corte (tarjeta)</label>
                <input id="dia-corte" className={claseCampoTexto} type="number" min={1} max={31} value={diaCorte} onChange={(e) => setDiaCorte(e.target.value)} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="dia-pago" className={claseEtiquetaCampo}>Día límite de pago</label>
                <input id="dia-pago" className={claseCampoTexto} type="number" min={1} max={31} value={diaPago} onChange={(e) => setDiaPago(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 items-end gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="ultimos-4" className={claseEtiquetaCampo}>Últimos 4 dígitos (opcional)</label>
                <input id="ultimos-4" className={claseCampoTexto} type="text" inputMode="numeric" maxLength={4} placeholder="Ej. 4521" value={ultimos4} onChange={(e) => setUltimos4(e.target.value.replace(/\D+/g, '').slice(0, 4))} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="cupo-cop" className={claseEtiquetaCampo}>Cupo en COP (opcional)</label>
                <input id="cupo-cop" className={`${claseCampoTexto} hogar-cop font-bold`} type="text" inputMode="numeric" placeholder="Ej. $6.000.000" value={cupo > 0 ? formatearPesos(cupo) : ''} onChange={(e) => setCupo(parsearDigitosCop(e.target.value))} />
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
              <label htmlFor="referencia-credito" className={claseEtiquetaCampo}>Referencia u obligación (opcional)</label>
              <input id="referencia-credito" className={claseCampoTexto} type="text" placeholder="Ej. Obligación 004192" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="acreedor-deuda" className={claseEtiquetaCampo}>Acreedor externo</label>
            <input ref={acreedorRef} id="acreedor-deuda" className={claseCampoTexto} type="text" placeholder="Ej. Obras & Diseño o familiar externo" value={acreedor} aria-invalid={errorForm?.campo === 'acreedor' ? 'true' : undefined} onChange={(e) => { setErrorForm(null); setAcreedor(e.target.value) }} />
          </div>
        )}

        <Tarjeta className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Tasa de interés (opcional)</h2>
            <Insignia variante="primario">Sin tasa por defecto</Insignia>
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
              <label htmlFor="valor-tasa" className={claseEtiquetaCampo}>Valor de tasa ({modalidadTasa === 'EA' ? '% E.A.' : '% M.V.'})</label>
              <input ref={tasaRef} id="valor-tasa" className={claseCampoTexto} type="text" inputMode="decimal" placeholder={modalidadTasa === 'EA' ? 'Ej. 28,32' : 'Ej. 2,10'} value={valorTasaTexto} aria-describedby="conversion-tasa" aria-invalid={errorForm?.campo === 'tasa' ? 'true' : undefined} onChange={(e) => { setErrorForm(null); setValorTasaTexto(e.target.value) }} />
              <p id="conversion-tasa" className={claseAyudaCampo}>
                {equivalencia
                  ? <>Conversión exacta: <strong className="hogar-cop text-hogar-tinta">{formatearPorcentajeEs(equivalencia.ea, 2)} E.A. ⇄ {formatearPorcentajeEs(equivalencia.mv, 4)} M.V.</strong> (se redondea solo el interés al peso).</>
                  : <>Ejemplo de conversión exacta: <strong>28,32 % E.A. ⇄ 2,0997 % M.V.</strong> (MV = (1 + EA)^(1/12) − 1).</>}
              </p>
            </div>
          ) : (
            <Aviso variante="primario" icono="ℹ">
              <p>Con <strong>Sin tasa</strong> activo, la app no calcula intereses automáticamente y podrás registrarlos a mano como <em>Costo financiero</em> al pagar tu extracto.</p>
            </Aviso>
          )}
        </Tarjeta>

        <Tarjeta acento="indigo" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Capital inicial o desembolso</h2>
            <Insignia variante="indigo">Plan de cuotas</Insignia>
          </div>
          <p className={claseAyudaCampo}>Para deuda previa elige <strong>Saldo inicial</strong>. Para préstamo en efectivo (Crédito o Deuda, nunca Tarjeta) elige <strong>Desembolso</strong>.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="origen-plan" className={claseEtiquetaCampo}>Origen del capital</label>
            <select id="origen-plan" className={claseCampoTexto} value={permiteDesembolso ? origenPlan : 'saldo_inicial'} onChange={(e) => setOrigenPlan(e.target.value === 'desembolso' ? 'desembolso' : 'saldo_inicial')}>
              <option value="saldo_inicial">Saldo inicial (deuda previa existente)</option>
              <option value="desembolso" disabled={!permiteDesembolso}>Desembolso (préstamo en efectivo · solo Crédito o Deuda)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="saldo-inicial-cop" className={claseEtiquetaCampo}>Capital inicial o desembolso en COP (opcional)</label>
            <input id="saldo-inicial-cop" className={`${claseCampoTexto} hogar-cop text-xl font-extrabold`} type="text" inputMode="numeric" placeholder="Ej. $8.400.000" value={capitalPlan > 0 ? formatearPesos(capitalPlan) : ''} onChange={(e) => setCapitalPlan(parsearDigitosCop(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha-saldo-inicial" className={claseEtiquetaCampo}>Fecha del saldo inicial o giro</label>
            <input id="fecha-saldo-inicial" className={claseCampoTexto} type="date" value={fechaPlan} aria-describedby="ayuda-fecha-saldo" onChange={(e) => setFechaPlan(e.target.value)} />
            <p id="ayuda-fecha-saldo" className={claseAyudaCampo}>Define el orden en FIFO del capital inicial o desembolso.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sistema-amortizacion" className={claseEtiquetaCampo}>Sistema de cuotas</label>
            <select id="sistema-amortizacion" className={claseCampoTexto} value={sistemaPlan} aria-describedby="ayuda-sistema" onChange={(e) => setSistemaPlan(e.target.value === 'capital_fijo' ? 'capital_fijo' : 'sin_calendario')}>
              <option value="sin_calendario">Sin calendario (por defecto · abonos libres)</option>
              <option value="capital_fijo">Capital fijo (cuotas iguales de capital)</option>
            </select>
            <p id="ayuda-sistema" className={claseAyudaCampo}>Por defecto se guarda <strong>sin calendario</strong> (sin inventar cuotas ni fechas). Completa las cuotas solo si conoces el calendario.</p>
          </div>
          {sistemaPlan === 'capital_fijo' ? (
            <div className="grid grid-cols-2 gap-2.5">
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

        <Link to="/obligaciones" className={`${claseBotonSecundario} w-full no-underline`}>Cancelar</Link>
      </form>
    </ShellApp>
  )
}
