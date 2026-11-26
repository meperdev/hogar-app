import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  claseAyudaCampo,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { parsearDigitosCop } from '../compraRapida/formatoCop'
import { TarjetaRadio } from '../obligaciones/PiezasObligaciones'
import { useBalance } from './ContextoBalance'

export function PantallaRegistrarIngreso() {
  const navigate = useNavigate()
  const { hogar, controlador, periodo, notificar, recargar } = useBalance()
  const miembros = hogar.miembros.filter((m) => m.activo)
  const hoy = hoyCivil(new Date())

  const [miembroId, setMiembroId] = useState(hogar.miembroActual.id)
  const [tipo, setTipo] = useState<'fijo' | 'variable'>('variable')
  const [descripcion, setDescripcion] = useState('')
  const [montoTexto, setMontoTexto] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [diaEsperado, setDiaEsperado] = useState('30')
  const [yaRecibido, setYaRecibido] = useState(false)
  const [fechaRecepcion, setFechaRecepcion] = useState(hoy)
  const [montoRecibidoTexto, setMontoRecibidoTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const monto = parsearDigitosCop(montoTexto)

  async function guardar(e?: FormEvent) {
    e?.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const borrador =
        tipo === 'variable'
          ? {
              tipo: 'variable' as const,
              miembroId,
              descripcion,
              monto,
              fecha,
            }
          : {
              tipo: 'fijo' as const,
              miembroId,
              descripcion,
              monto,
              diaEsperado: Number(diaEsperado),
              vigenteDesde: fecha,
              marcarRecibido: yaRecibido
                ? {
                    periodo: fecha.slice(0, 7) || periodo,
                    fechaRecepcion,
                    montoRecibido: parsearDigitosCop(montoRecibidoTexto) || null,
                  }
                : null,
            }
      const r = await controlador.registrarIngreso(borrador)
      notificar(r.resumen)
      recargar()
      navigate('/balance')
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No pudimos guardar el ingreso.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ShellApp
      titulo="Registrar ingreso"
      subtitulo="Fijo (recurrente) o variable"
      volverA="/balance"
      etiquetaVolver="Volver a Balance de pareja"
      etiquetaBarraAccion="Guardar ingreso"
      barraAccion={
        <button
          type="button"
          className={`${claseBotonPrimario} w-full`}
          disabled={enviando}
          data-sin-scroll
          onClick={() => void guardar()}
        >
          {enviando ? 'Guardando…' : 'Guardar ingreso'}
        </button>
      }
    >
      {error ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{error}</p>
        </Aviso>
      ) : null}

      <form className="flex flex-col gap-3.5" onSubmit={(e) => void guardar(e)} noValidate>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={claseEtiquetaCampo}>Miembro del hogar</legend>
          <div className="grid grid-cols-2 gap-2">
            {miembros.map((m) => (
              <TarjetaRadio
                key={m.id}
                id={`miembro-${m.id}`}
                name="miembro"
                value={m.id}
                checked={miembroId === m.id}
                onChange={() => setMiembroId(m.id)}
              >
                {m.nombre}
              </TarjetaRadio>
            ))}
          </div>
          <p className={claseAyudaCampo}>
            En este hogar ambos miembros pueden ver los ingresos declarados.
          </p>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={claseEtiquetaCampo}>Tipo de ingreso</legend>
          <div className="grid grid-cols-2 gap-2">
            <TarjetaRadio
              id="tipo-fijo"
              name="tipo-ingreso"
              value="fijo"
              checked={tipo === 'fijo'}
              onChange={() => setTipo('fijo')}
            >
              Fijo (mensual)
            </TarjetaRadio>
            <TarjetaRadio
              id="tipo-variable"
              name="tipo-ingreso"
              value="variable"
              checked={tipo === 'variable'}
              onChange={() => setTipo('variable')}
            >
              Variable (al llegar)
            </TarjetaRadio>
          </div>
          <p className={claseAyudaCampo}>
            Los ingresos fijos guardan día esperado y se marcan recibidos cada mes (incluso si
            llega un monto distinto); los variables se registran cuando llegan.
          </p>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="concepto-ingreso" className={claseEtiquetaCampo}>
            Descripción
          </label>
          <input
            id="concepto-ingreso"
            className={claseCampoTexto}
            type="text"
            value={descripcion}
            placeholder="Ej. Salario, Comisión, Freelance"
            disabled={enviando}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="monto-ingreso" className={claseEtiquetaCampo}>
            Monto en COP (entero, sin centavos)
          </label>
          <input
            id="monto-ingreso"
            className={`${claseCampoTexto} hogar-cop text-xl font-extrabold`}
            type="text"
            inputMode="numeric"
            value={montoTexto}
            placeholder="$0"
            disabled={enviando}
            onChange={(e) => {
              const n = parsearDigitosCop(e.target.value)
              setMontoTexto(n > 0 ? formatearPesos(n) : '')
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha-ingreso" className={claseEtiquetaCampo}>
              {tipo === 'fijo' ? 'Vigente desde' : 'Fecha recibido'}
            </label>
            <input
              id="fecha-ingreso"
              className={claseCampoTexto}
              type="date"
              value={fecha}
              disabled={enviando}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          {tipo === 'fijo' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dia-esperado" className={claseEtiquetaCampo}>
                Día esperado (1–31)
              </label>
              <input
                id="dia-esperado"
                className={claseCampoTexto}
                type="number"
                min={1}
                max={31}
                value={diaEsperado}
                disabled={enviando}
                onChange={(e) => setDiaEsperado(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        {tipo === 'fijo' ? (
          <div className="flex flex-col gap-2 rounded-xl border border-hogar-borde bg-hogar-superficie p-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-bold text-hogar-tinta">
              <input
                type="checkbox"
                checked={yaRecibido}
                disabled={enviando}
                onChange={(e) => setYaRecibido(e.target.checked)}
                className="size-5 accent-hogar-primario"
              />
              <span>Ya lo recibí este mes</span>
            </label>
            {yaRecibido ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="fecha-rec-alta" className={claseEtiquetaCampo}>
                    Fecha recepción
                  </label>
                  <input
                    id="fecha-rec-alta"
                    className={claseCampoTexto}
                    type="date"
                    value={fechaRecepcion}
                    disabled={enviando}
                    onChange={(e) => setFechaRecepcion(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="monto-rec-alta" className={claseEtiquetaCampo}>
                    Monto real (opcional)
                  </label>
                  <input
                    id="monto-rec-alta"
                    className={`${claseCampoTexto} hogar-cop`}
                    type="text"
                    inputMode="numeric"
                    placeholder="Igual al base"
                    value={montoRecibidoTexto}
                    disabled={enviando}
                    onChange={(e) => {
                      const n = parsearDigitosCop(e.target.value)
                      setMontoRecibidoTexto(n > 0 ? formatearPesos(n) : '')
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <Aviso variante="indigo" icono="ℹ">
          <p>
            La vista «% de su ingreso» viene{' '}
            <strong className="text-hogar-tinta">apagada por defecto</strong> en Balance de pareja
            y nunca obliga ni calcula aportes mínimos entre ustedes.
          </p>
        </Aviso>

        <Link to="/balance" className={`${claseBotonSecundario} w-full no-underline`}>
          Cancelar
        </Link>
      </form>
    </ShellApp>
  )
}
