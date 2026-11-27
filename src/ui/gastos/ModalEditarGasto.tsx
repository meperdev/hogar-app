import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { EditarCompraEntrada } from '../../app/gastos'
import type { CategoriaGasto, MedioGasto, MovimientoGasto } from '../../domain/gastos'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  Insignia,
  claseAyudaCampo,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { parsearDigitosCop } from '../compraRapida/formatoCop'

export function ModalEditarGasto({
  movimiento,
  categorias,
  medios,
  onCerrar,
  onGuardar,
  onAnular,
}: {
  movimiento: MovimientoGasto | null
  categorias: CategoriaGasto[]
  medios: MedioGasto[]
  onCerrar: () => void
  onGuardar: (entrada: EditarCompraEntrada) => Promise<void>
  onAnular: (compraId: string) => Promise<void>
}) {
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState(0)
  const [fecha, setFecha] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [medioDePagoId, setMedioDePagoId] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmandoAnular, setConfirmandoAnular] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!movimiento) return
    setDescripcion(movimiento.descripcion)
    setMonto(movimiento.montoTotal)
    setFecha(movimiento.fecha)
    setCategoriaId(movimiento.categoriaId)
    setMedioDePagoId(movimiento.medioDePagoId ?? '')
    setError('')
    setGuardando(false)
    setConfirmandoAnular(false)
    panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [movimiento])

  if (!movimiento) return null

  const esFinanciado = movimiento.pagoTipo === 'financiado'
  const esObligacion = Boolean(movimiento.obligacionId)
  const esContadoConPasivo =
    movimiento.pagoTipo === 'contado' && Boolean(movimiento.financiadaPorPasivoId)

  const categoriasOpciones = categorias.some((c) => c.id === movimiento.categoriaId)
    ? categorias
    : [
        ...categorias,
        { id: movimiento.categoriaId, nombre: movimiento.categoriaNombre, icono: null, orden: 999 },
      ]

  const mediosOpciones =
    movimiento.medioDePagoId && !medios.some((m) => m.id === movimiento.medioDePagoId)
      ? [
          ...medios,
          { id: movimiento.medioDePagoId, nombre: movimiento.medioNombre, tipo: 'cuenta' as const },
        ]
      : medios

  async function manejarSubmit(evento: FormEvent) {
    evento.preventDefault()
    if (!movimiento || guardando) return
    setError('')

    const descripcionLimpia = descripcion.trim()
    if (!descripcionLimpia) {
      setError('Escribe una descripción para la compra.')
      return
    }
    if (!esFinanciado) {
      if (monto <= 0) {
        setError('Ingresa un monto mayor a cero.')
        return
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        setError('Ingresa una fecha válida.')
        return
      }
    }

    setGuardando(true)
    try {
      await onGuardar({
        compraId: movimiento.id,
        descripcion: descripcionLimpia,
        categoriaId,
        ...(!esFinanciado
          ? {
              montoTotal: monto,
              fecha,
              ...(!esContadoConPasivo ? { medioDePagoId: medioDePagoId || null } : {}),
            }
          : {}),
      })
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar los cambios.')
    } finally {
      setGuardando(false)
    }
  }

  async function manejarAnular() {
    if (!movimiento || guardando) return
    setError('')
    setGuardando(true)
    try {
      await onAnular(movimiento.id)
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos anular la compra.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="Editar compra"
      className="space-y-3 border-t border-hogar-borde bg-hogar-fondo/60 p-3.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Insignia variante={esFinanciado ? 'indigo' : 'primario'}>
          {esFinanciado ? 'A cuotas' : 'De contado'}
        </Insignia>
        {movimiento.ambito === 'personal' ? <Insignia variante="neutral">Solo tú</Insignia> : null}
      </div>

      {esFinanciado ? (
        <Aviso variante="indigo" icono="ℹ">
          <p className="m-0">
            Compra a cuotas: solo puedes editar descripción y categoría. Para cambiar monto, fecha
            o tarjeta, anúlala y vuelve a registrarla.
          </p>
        </Aviso>
      ) : null}

      {error ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p className="m-0">{error}</p>
        </Aviso>
      ) : null}

      <form onSubmit={manejarSubmit} className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="editar-gasto-descripcion" className={claseEtiquetaCampo}>
            Descripción
          </label>
          <input
            id="editar-gasto-descripcion"
            type="text"
            maxLength={200}
            value={descripcion}
            onChange={(evento) => setDescripcion(evento.target.value)}
            disabled={guardando}
            className={claseCampoTexto}
          />
        </div>

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="editar-gasto-monto" className={claseEtiquetaCampo}>
              Monto total (COP)
            </label>
            <input
              id="editar-gasto-monto"
              type="text"
              inputMode="numeric"
              placeholder="$0"
              value={monto > 0 ? formatearPesos(monto) : ''}
              onChange={(evento) => setMonto(parsearDigitosCop(evento.target.value))}
              disabled={guardando || esFinanciado}
              className={`${claseCampoTexto} hogar-cop font-bold`}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="editar-gasto-fecha" className={claseEtiquetaCampo}>
              Fecha
            </label>
            <input
              id="editar-gasto-fecha"
              type="date"
              value={fecha}
              onChange={(evento) => setFecha(evento.target.value)}
              disabled={guardando || esFinanciado}
              className={claseCampoTexto}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="editar-gasto-categoria" className={claseEtiquetaCampo}>
            Categoría
          </label>
          <select
            id="editar-gasto-categoria"
            value={categoriaId}
            onChange={(evento) => setCategoriaId(evento.target.value)}
            disabled={guardando || esObligacion}
            className={claseCampoTexto}
          >
            {categoriasOpciones.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nombre}
              </option>
            ))}
          </select>
          {esObligacion ? (
            <p className={claseAyudaCampo}>
              Las compras asociadas a una obligación mantienen su categoría.
            </p>
          ) : null}
        </div>

        {!esFinanciado ? (
          <div className="space-y-1">
            <label htmlFor="editar-gasto-medio" className={claseEtiquetaCampo}>
              Medio de pago
            </label>
            {esContadoConPasivo ? (
              <>
                <input
                  id="editar-gasto-medio"
                  type="text"
                  value={movimiento.medioNombre}
                  disabled
                  className={claseCampoTexto}
                />
                <p className={claseAyudaCampo}>
                  Compra pagada con pasivo; no se puede cambiar el medio aquí.
                </p>
              </>
            ) : (
              <select
                id="editar-gasto-medio"
                value={medioDePagoId}
                onChange={(evento) => setMedioDePagoId(evento.target.value)}
                disabled={guardando}
                className={claseCampoTexto}
              >
                <option value="">Sin medio asignado</option>
                {mediosOpciones.map((medio) => (
                  <option key={medio.id} value={medio.id}>
                    {medio.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" disabled={guardando} className={`${claseBotonPrimario} flex-1`}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className={claseBotonSecundario}
          >
            Cancelar
          </button>
        </div>
      </form>

      <div className="border-t border-hogar-borde pt-3">
        {!confirmandoAnular ? (
          <button
            type="button"
            disabled={guardando}
            onClick={() => setConfirmandoAnular(true)}
            className={`${claseBotonPequenoSecundario} w-full border-hogar-peligro/35 text-hogar-peligro hover:bg-hogar-peligro-suave`}
          >
            Anular compra
          </button>
        ) : (
          <div className="space-y-2 rounded-2xl border border-hogar-peligro/30 bg-hogar-peligro-suave p-3">
            <p className="m-0 text-sm font-bold text-hogar-peligro">
              ¿Seguro que quieres anular esta compra? Dejará de contar en los gastos del mes.
            </p>
            {esFinanciado ? (
              <p className="m-0 text-xs text-hogar-tinta-suave">
                También se anularán su plan y cuotas pendientes si no tienen pagos registrados.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={guardando}
                onClick={manejarAnular}
                className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-hogar-peligro px-3.5 py-2 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {guardando ? 'Anulando…' : 'Confirmar anulación'}
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => setConfirmandoAnular(false)}
                className={claseBotonPequenoSecundario}
              >
                Volver
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
