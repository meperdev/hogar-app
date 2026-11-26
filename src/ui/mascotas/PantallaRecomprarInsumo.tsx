import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorMascotas } from '../../app/controladorMascotas'
import type { Ambito } from '../../app/mascotas'
import { hoyCivil } from '../../domain/fechas'
import {
  Aviso,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoPrimario,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { parsearDigitosCop } from '../compraRapida/formatoCop'
import { useMascotas } from './ContextoMascotas'
import { nombreMascotaOCompartido } from './PiezasMascotas'

export function PantallaRecomprarInsumo() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const { controlador, vista, cargando, recargar, mostrarToast } = useMascotas()

  const itemEstado = vista?.items.find((e) => e.item.id === itemId) ?? null
  const item = itemEstado?.item ?? null
  const mediosDisponibles = vista?.medios ?? []

  const [ambito, setAmbito] = useState<Ambito>('hogar')
  const [montoTexto, setMontoTexto] = useState('')
  const [fecha, setFecha] = useState(() => vista?.hoy ?? hoyCivil(new Date()))
  const [descripcion, setDescripcion] = useState('')
  const [medioId, setMedioId] = useState('')
  const [cuotasTexto, setCuotasTexto] = useState('1')
  const [actualizarHabitual, setActualizarHabitual] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!item || !vista) return
    setMontoTexto((actual) => (actual === '' && item.montoHabitual !== null ? String(item.montoHabitual) : actual))
    setFecha((actual) => actual || vista.hoy)
    setDescripcion((actual) => {
      if (actual !== '') return actual
      const sufijo = item.mascotaId ? ` · ${nombreMascotaOCompartido(item.mascotaId, vista.mascotas)}` : ''
      return `${item.nombre}${sufijo}`
    })
  }, [item, vista])

  const mediosDelAmbito = mediosDisponibles.filter(
    (m) => m.ambito === null || m.ambito === ambito,
  )
  const medioEfectivo =
    mediosDelAmbito.find((m) => m.id === medioId) ?? mediosDelAmbito[0] ?? null

  if (cargando && !vista) {
    return (
      <ShellApp titulo="Recomprar insumo" subtitulo="Cargando datos…" volverA="/mascotas">
        <Aviso variante="indigo" icono="◷" role="status">
          <p className="font-bold">Cargando insumo…</p>
        </Aviso>
      </ShellApp>
    )
  }

  if (!item) {
    return (
      <ShellApp titulo="Recomprar insumo" subtitulo="Insumo no disponible" volverA="/mascotas">
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>No encontramos este insumo en tu despensa.</p>
        </Aviso>
        <Link to="/mascotas" className={`${claseBotonSecundario} w-full no-underline`}>
          Volver a Despensa de mascotas
        </Link>
      </ShellApp>
    )
  }

  async function manejarSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!item || !medioEfectivo) {
      setError('Selecciona un medio de pago disponible para este ámbito.')
      return
    }
    const monto = parsearDigitosCop(montoTexto)
    const cuotas = medioEfectivo.tipo === 'tarjeta' ? Number(cuotasTexto || '1') : 1

    setGuardando(true)
    setError('')
    try {
      await controlador.recomprar({
        itemId: item.id,
        mascotaId: item.mascotaId,
        fecha,
        descripcion,
        monto,
        ambito,
        medioId: medioEfectivo.id,
        cuotas,
        actualizarMontoHabitual: ambito === 'hogar' ? actualizarHabitual : false,
      })
      mostrarToast('Recompra guardada · Nivel en 100 %')
      recargar()
      navigate('/mascotas')
    } catch (err) {
      setError(err instanceof ErrorMascotas ? err.message : 'No se pudo guardar la recompra.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ShellApp
      titulo="Recomprar insumo"
      subtitulo={`${item.nombre} · Resetea nivel a 100 %`}
      volverA="/mascotas"
      etiquetaVolver="Volver a Despensa de mascotas"
      etiquetaBarraAccion="Guardar recompra"
      barraAccion={
        <button
          type="submit"
          form="form-recomprar"
          className={`${claseBotonPrimario} w-full`}
          disabled={guardando || !medioEfectivo}
          data-sin-scroll
        >
          {guardando ? 'Guardando…' : 'Guardar compra y nivel 100 %'}
        </button>
      }
    >
      <form id="form-recomprar" className="flex flex-col gap-3" onSubmit={manejarSubmit} noValidate>
        <Tarjeta acento="primario" className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ámbito de la compra">
            <button
              type="button"
              className={ambito === 'hogar' ? claseBotonPequenoPrimario : claseBotonPequenoSecundario}
              aria-pressed={ambito === 'hogar'}
              onClick={() => setAmbito('hogar')}
              disabled={guardando}
            >
              Hogar
            </button>
            <button
              type="button"
              className={ambito === 'personal' ? claseBotonPequenoPrimario : claseBotonPequenoSecundario}
              aria-pressed={ambito === 'personal'}
              onClick={() => {
                setAmbito('personal')
                setActualizarHabitual(false)
              }}
              disabled={guardando}
            >
              Personal
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="recompra-monto" className={claseEtiquetaCampo}>
              Monto pagado (COP enteros)
            </label>
            <input
              id="recompra-monto"
              type="text"
              inputMode="numeric"
              className={claseCampoTexto}
              placeholder="Ej. 165000"
              value={montoTexto}
              onChange={(e) => setMontoTexto(e.target.value)}
              disabled={guardando}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="recompra-fecha" className={claseEtiquetaCampo}>
              Fecha de la compra
            </label>
            <input
              id="recompra-fecha"
              type="date"
              className={claseCampoTexto}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              disabled={guardando}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="recompra-medio" className={claseEtiquetaCampo}>
              Medio de pago o tarjeta
            </label>
            <select
              id="recompra-medio"
              className={claseCampoTexto}
              value={medioEfectivo?.id ?? ''}
              onChange={(e) => setMedioId(e.target.value)}
              disabled={guardando || mediosDelAmbito.length === 0}
            >
              {mediosDelAmbito.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>

          {medioEfectivo?.tipo === 'tarjeta' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="recompra-cuotas" className={claseEtiquetaCampo}>
                Número de cuotas
              </label>
              <input
                id="recompra-cuotas"
                type="number"
                min={1}
                max={360}
                className={claseCampoTexto}
                value={cuotasTexto}
                onChange={(e) => setCuotasTexto(e.target.value)}
                disabled={guardando}
              />
              <p className={claseAyudaCampo}>
                Sin doble conteo: el total suma una vez en Mascotas hoy y sus cuotas van a Obligaciones.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="recompra-descripcion" className={claseEtiquetaCampo}>
              Descripción
            </label>
            <input
              id="recompra-descripcion"
              type="text"
              className={claseCampoTexto}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              disabled={guardando}
            />
          </div>

          {ambito === 'hogar' ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-bold text-hogar-tinta">
              <input
                id="recompra-actualizar-habitual"
                type="checkbox"
                checked={actualizarHabitual}
                onChange={(e) => setActualizarHabitual(e.target.checked)}
                disabled={guardando}
              />
              <span>Actualizar monto habitual compartido del insumo</span>
            </label>
          ) : (
            <Aviso variante="indigo" icono="ℹ">
              <p>
                Compra personal: solo tú ves su registro y nunca modifica el monto habitual ni la despensa compartida.
              </p>
            </Aviso>
          )}

          {error ? (
            <Aviso variante="peligro" icono="▲" role="alert">
              <p>{error}</p>
            </Aviso>
          ) : null}

          <Link to="/mascotas" className={`${claseBotonSecundario} w-full no-underline`}>
            Cancelar
          </Link>
        </Tarjeta>
      </form>
    </ShellApp>
  )
}
