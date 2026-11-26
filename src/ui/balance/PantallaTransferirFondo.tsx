import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { MedioAporteOpcion } from '../../app/balance'
import { hoyCivil } from '../../domain/fechas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { parsearDigitosCop } from '../compraRapida/formatoCop'
import { ListaDesglose, nombreMesPeriodoEs } from '../obligaciones/PiezasObligaciones'
import { useBalance } from './ContextoBalance'

export function PantallaTransferirFondo() {
  const navigate = useNavigate()
  const { controlador, periodo, notificar, recargar } = useBalance()

  const [origenes, setOrigenes] = useState<MedioAporteOpcion[]>([])
  const [destinos, setDestinos] = useState<MedioAporteOpcion[]>([])
  const [medioOrigenId, setMedioOrigenId] = useState('')
  const [medioDestinoId, setMedioDestinoId] = useState('')
  const [montoTexto, setMontoTexto] = useState('')
  const [fecha, setFecha] = useState(() => hoyCivil(new Date()))
  const [nota, setNota] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    void controlador.mediosParaAporte().then(
      (res) => {
        if (!vigente) return
        setOrigenes(res.origenes)
        setDestinos(res.destinos)
        setMedioOrigenId(res.origenes[0]?.id ?? '')
        setMedioDestinoId(res.destinos[0]?.id ?? '')
        setCargando(false)
      },
      (causa: unknown) => {
        if (!vigente) return
        setError(causa instanceof Error ? causa.message : 'No pudimos cargar los medios de pago.')
        setCargando(false)
      },
    )
    return () => {
      vigente = false
    }
  }, [controlador])

  const monto = parsearDigitosCop(montoTexto)
  const origenSel = origenes.find((m) => m.id === medioOrigenId) ?? null
  const destinoSel = destinos.find((m) => m.id === medioDestinoId) ?? null
  const mes = nombreMesPeriodoEs(fecha.slice(0, 7) || periodo)

  async function guardar(e?: FormEvent) {
    e?.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const r = await controlador.registrarAporte({
        medioOrigenId: medioOrigenId || null,
        medioDestinoId: medioDestinoId || null,
        monto,
        fecha,
        nota,
      })
      notificar(r.resumen)
      recargar()
      navigate('/balance')
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No pudimos registrar la transferencia.')
    } finally {
      setEnviando(false)
    }
  }

  const faltanMedios = !cargando && (origenes.length === 0 || destinos.length === 0)

  return (
    <ShellApp
      titulo="Transferir al fondo común"
      subtitulo="Aporte de un miembro al medio del hogar"
      volverA="/balance"
      etiquetaVolver="Volver a Balance de pareja"
      accionDerecha={<Insignia variante="primario">Aporte</Insignia>}
      etiquetaBarraAccion="Registrar transferencia al fondo común"
      barraAccion={
        <button
          type="button"
          className={`${claseBotonPrimario} w-full`}
          disabled={cargando || enviando || faltanMedios}
          data-sin-scroll
          onClick={() => void guardar()}
        >
          {enviando
            ? 'Registrando…'
            : monto > 0
              ? `Registrar transferencia (${formatearPesos(monto)})`
              : 'Registrar transferencia'}
        </button>
      }
    >
      <Aviso variante="primario" icono="✓">
        <p>
          <strong className="text-hogar-tinta">Sin doble conteo:</strong> esta transferencia suma al{' '}
          <strong className="text-hogar-tinta">
            aporte de {origenSel?.duenoNombre ?? 'quien envía'}
          </strong>{' '}
          y no cuenta como consumo. Cuando después paguen un gasto desde el fondo común, no
          volverá a sumarse como aporte de nadie.
        </p>
      </Aviso>

      {faltanMedios ? (
        <Aviso variante="ambar" icono="▲" role="alert">
          <p>
            Necesitas al menos un medio de pago de un miembro y un medio del hogar (cuenta o caja
            común) para registrar transferencias al fondo común.
          </p>
        </Aviso>
      ) : null}

      {error ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{error}</p>
        </Aviso>
      ) : null}

      <form className="flex flex-col gap-3.5" onSubmit={(e) => void guardar(e)} noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="medio-origen" className={claseEtiquetaCampo}>
            Medio de origen (de un miembro)
          </label>
          <select
            id="medio-origen"
            className={claseCampoTexto}
            value={medioOrigenId}
            disabled={cargando || enviando || origenes.length === 0}
            onChange={(e) => setMedioOrigenId(e.target.value)}
          >
            {origenes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} {m.duenoNombre ? `· ${m.duenoNombre}` : ''} (miembro)
              </option>
            ))}
          </select>
          <p className={claseAyudaCampo}>
            El aportante siempre se deriva del dueño del medio de origen.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="medio-destino" className={claseEtiquetaCampo}>
            Medio de destino (del hogar)
          </label>
          <select
            id="medio-destino"
            className={claseCampoTexto}
            value={medioDestinoId}
            disabled={cargando || enviando || destinos.length === 0}
            onChange={(e) => setMedioDestinoId(e.target.value)}
          >
            {destinos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} · Hogar
              </option>
            ))}
          </select>
          <p className={claseAyudaCampo}>
            Solo aparecen medios cuyo dueño es el hogar. Las transferencias entre miembros no crean
            deuda ni aporte.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="monto-aporte" className={claseEtiquetaCampo}>
            Monto a transferir en COP (entero)
          </label>
          <input
            id="monto-aporte"
            className={`${claseCampoTexto} hogar-cop text-xl font-extrabold`}
            type="text"
            inputMode="numeric"
            placeholder="$0"
            value={montoTexto}
            disabled={enviando}
            onChange={(e) => {
              const n = parsearDigitosCop(e.target.value)
              setMontoTexto(n > 0 ? formatearPesos(n) : '')
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha-aporte" className={claseEtiquetaCampo}>
              Fecha civil
            </label>
            <input
              id="fecha-aporte"
              className={claseCampoTexto}
              type="date"
              value={fecha}
              disabled={enviando}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nota-aporte" className={claseEtiquetaCampo}>
              Nota (opcional)
            </label>
            <input
              id="nota-aporte"
              className={claseCampoTexto}
              type="text"
              placeholder="Ej. Quincena nov"
              value={nota}
              disabled={enviando}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
        </div>

        <Tarjeta suave>
          <h2 className="m-0 mb-2 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Resumen de la transferencia
          </h2>
          <ListaDesglose
            filas={[
              {
                etiqueta: 'Aportante (dueño del origen)',
                valor: origenSel?.duenoNombre ?? '—',
              },
              {
                etiqueta: 'Destino (fondo común)',
                valor: destinoSel?.nombre ?? '—',
              },
              {
                etiqueta: `Suma al aporte de ${mes}`,
                valor: formatearPesos(monto),
                total: true,
              },
            ]}
          />
        </Tarjeta>

        <Link to="/balance" className={`${claseBotonSecundario} w-full no-underline`}>
          Cancelar
        </Link>
      </form>
    </ShellApp>
  )
}
