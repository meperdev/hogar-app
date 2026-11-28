import { useState, type FormEvent } from 'react'
import type { EditarPagoEntrada } from '../../app/obligaciones'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  claseBotonPequenoPrimario,
  claseBotonPequenoSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { parsearDigitosCop } from '../compraRapida/formatoCop'

export type DatosAbonoEditable = {
  id: string
  monto: number
  fecha: string
  medioDePagoId: string | null
  nota: string | null
  incluirEnGastos: boolean
  categoriaGastoId: string | null
}

export type OpcionMedioAbono = {
  id: string
  nombre: string
  ownerNombre?: string | null | undefined
}

export type OpcionCategoriaAbono = {
  id: string
  nombre: string
}

function elegirCategoriaInicial(
  actualId: string | null,
  categorias: OpcionCategoriaAbono[],
): string {
  if (actualId && categorias.some((c) => c.id === actualId)) return actualId
  const otros = categorias.find((c) => c.nombre.trim().toLowerCase() === 'otros')
  return otros?.id ?? categorias[0]?.id ?? ''
}

export function EditorAbonoInline({
  abono,
  medios,
  categorias,
  onGuardar,
  onEliminar,
  onCerrar,
}: {
  abono: DatosAbonoEditable
  medios: OpcionMedioAbono[]
  categorias: OpcionCategoriaAbono[]
  onGuardar: (entrada: EditarPagoEntrada) => Promise<void>
  onEliminar?: ((pagoId: string) => Promise<void>) | undefined
  onCerrar: () => void
}) {
  const [monto, setMonto] = useState(abono.monto)
  const [fecha, setFecha] = useState(abono.fecha)
  const [medioId, setMedioId] = useState(() => abono.medioDePagoId ?? medios[0]?.id ?? '')
  const [nota, setNota] = useState(abono.nota ?? '')
  const [incluirEnGastos, setIncluirEnGastos] = useState(abono.incluirEnGastos)
  const [categoriaGastoId, setCategoriaGastoId] = useState(() =>
    elegirCategoriaInicial(abono.categoriaGastoId, categorias),
  )
  const [guardando, setGuardando] = useState(false)
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState('')

  const ocupado = guardando || eliminando
  const idPrefijo = `editar-abono-${abono.id.slice(0, 8)}`

  async function manejarGuardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (ocupado) return
    if (!Number.isFinite(monto) || monto <= 0) {
      setError('El monto debe ser mayor que cero.')
      return
    }
    if (!fecha) {
      setError('Selecciona una fecha válida.')
      return
    }
    if (!medioId) {
      setError('Selecciona un método de pago.')
      return
    }
    if (incluirEnGastos && categorias.length > 0 && !categoriaGastoId) {
      setError('Selecciona una categoría para el gasto.')
      return
    }
    setError('')
    setGuardando(true)
    try {
      await onGuardar({
        pagoId: abono.id,
        monto,
        fecha,
        medioId,
        nota: nota.trim(),
        incluirEnGastos,
        categoriaGastoId: incluirEnGastos ? categoriaGastoId || null : null,
      })
      onCerrar()
    } catch (causa) {
      setError(
        causa instanceof Error && causa.message
          ? causa.message
          : 'No se pudo actualizar el abono.',
      )
    } finally {
      setGuardando(false)
    }
  }

  async function manejarEliminar() {
    if (!onEliminar || ocupado) return
    setError('')
    setEliminando(true)
    try {
      await onEliminar(abono.id)
      onCerrar()
    } catch (causa) {
      setError(
        causa instanceof Error && causa.message
          ? causa.message
          : 'No se pudo eliminar el abono.',
      )
    } finally {
      setEliminando(false)
    }
  }

  return (
    <form
      onSubmit={(e) => void manejarGuardar(e)}
      className="mt-2 flex flex-col gap-2.5 rounded-xl border border-hogar-borde-fuerte bg-hogar-superficie p-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefijo}-monto`} className={claseEtiquetaCampo}>
            Monto (COP)
          </label>
          <input
            id={`${idPrefijo}-monto`}
            type="text"
            inputMode="numeric"
            className={`${claseCampoTexto} hogar-cop`}
            value={formatearPesos(monto)}
            onChange={(e) => {
              setError('')
              setMonto(parsearDigitosCop(e.target.value))
            }}
            disabled={ocupado}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefijo}-fecha`} className={claseEtiquetaCampo}>
            Fecha
          </label>
          <input
            id={`${idPrefijo}-fecha`}
            type="date"
            className={claseCampoTexto}
            value={fecha}
            onChange={(e) => {
              setError('')
              setFecha(e.target.value)
            }}
            disabled={ocupado}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefijo}-medio`} className={claseEtiquetaCampo}>
            Método de pago
          </label>
          <select
            id={`${idPrefijo}-medio`}
            className={claseCampoTexto}
            value={medioId}
            onChange={(e) => {
              setError('')
              setMedioId(e.target.value)
            }}
            disabled={ocupado || medios.length === 0}
          >
            {medios.length === 0 ? <option value="">Sin medios activos</option> : null}
            {medios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.ownerNombre ? `${m.nombre} (${m.ownerNombre})` : m.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefijo}-nota`} className={claseEtiquetaCampo}>
            Nota (opcional)
          </label>
          <input
            id={`${idPrefijo}-nota`}
            type="text"
            className={claseCampoTexto}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. Abono parcial quincena"
            disabled={ocupado}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-hogar-borde bg-hogar-fondo px-3 py-2">
        <label className="flex min-h-9 cursor-pointer items-center justify-between gap-2 text-xs font-bold text-hogar-tinta">
          <span>Contar como gasto del mes</span>
          <input
            type="checkbox"
            className="size-4 accent-hogar-primario"
            checked={incluirEnGastos}
            onChange={(e) => {
              const activar = e.target.checked
              setIncluirEnGastos(activar)
              if (activar && !categoriaGastoId) {
                setCategoriaGastoId(elegirCategoriaInicial(null, categorias))
              }
            }}
            disabled={ocupado}
          />
        </label>

        {incluirEnGastos && categorias.length > 0 ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefijo}-categoria`} className={claseEtiquetaCampo}>
              Categoría del gasto
            </label>
            <select
              id={`${idPrefijo}-categoria`}
              className={claseCampoTexto}
              value={categoriaGastoId}
              onChange={(e) => setCategoriaGastoId(e.target.value)}
              disabled={ocupado}
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {error ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{error}</p>
        </Aviso>
      ) : null}

      {confirmandoEliminar ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hogar-peligro/25 bg-hogar-peligro-suave px-3 py-2">
          <span className="text-xs font-bold text-hogar-peligro">
            ¿Eliminar este abono?
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={claseBotonPequenoSecundario}
              disabled={ocupado}
              onClick={() => setConfirmandoEliminar(false)}
            >
              No
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border-0 bg-hogar-peligro px-3 text-xs font-bold text-white disabled:opacity-60"
              disabled={ocupado}
              onClick={() => void manejarEliminar()}
            >
              {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {onEliminar ? (
            <button
              type="button"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-hogar-peligro/30 bg-hogar-peligro-suave px-3 text-xs font-bold text-hogar-peligro disabled:opacity-60"
              disabled={ocupado}
              onClick={() => setConfirmandoEliminar(true)}
            >
              Eliminar abono
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={claseBotonPequenoSecundario}
              disabled={ocupado}
              onClick={onCerrar}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={claseBotonPequenoPrimario}
              disabled={ocupado}
            >
              {guardando ? 'Guardando…' : 'Guardar abono'}
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
