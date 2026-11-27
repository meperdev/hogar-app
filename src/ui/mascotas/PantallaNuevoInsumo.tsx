import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorMascotas } from '../../app/controladorMascotas'
import type { TipoInsumo } from '../../domain/mascotas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  AyudaInfo,
  Tarjeta,
  TarjetaSeleccion,
  claseAyudaCampo,
  claseBotonPrimario,
  claseBotonSecundario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { parsearDigitosCop } from '../compraRapida/formatoCop'
import { useMascotas } from './ContextoMascotas'

const TIPOS: { valor: TipoInsumo; label: string }[] = [
  { valor: 'comida', label: 'Comida' },
  { valor: 'higiene', label: 'Higiene' },
  { valor: 'salud', label: 'Salud' },
  { valor: 'otro', label: 'Otro' },
]

export function PantallaNuevoInsumo() {
  const navigate = useNavigate()
  const { controlador, vista, recargar, mostrarToast } = useMascotas()

  const mascotas = vista?.mascotasActivas ?? []
  const categoriaPorDefecto = vista?.categoriaMascotasId ?? vista?.categorias[0]?.id ?? ''

  const [nombre, setNombre] = useState('')
  const [mascotaIds, setMascotaIds] = useState<string[]>([])
  const [tipo, setTipo] = useState<TipoInsumo>('comida')
  const [categoriaId, setCategoriaId] = useState('')
  const [frecuenciaTexto, setFrecuenciaTexto] = useState('30')
  const [umbralTexto, setUmbralTexto] = useState('20')
  const [montoTexto, setMontoTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const categoriaEfectiva = categoriaId || categoriaPorDefecto

  async function manejarSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!categoriaEfectiva) {
      setError('Falta una categoría disponible para registrar el insumo.')
      return
    }
    const freqLimpia = frecuenciaTexto.trim()
    const frecuenciaDias = freqLimpia === '' ? null : Number(freqLimpia)
    if (frecuenciaDias !== null && (!Number.isSafeInteger(frecuenciaDias) || frecuenciaDias <= 0)) {
      setError('La frecuencia en días debe ser un número entero mayor a 0.')
      return
    }
    const umbralAlertaPct = Number(umbralTexto.trim() || '20')
    const montoLimpio = montoTexto.trim()
    const montoHabitual = montoLimpio === '' ? null : parsearDigitosCop(montoLimpio)
    if (montoLimpio !== '' && (montoHabitual === null || montoHabitual <= 0)) {
      setError('El monto habitual debe ser mayor a $0.')
      return
    }

    setGuardando(true)
    setError('')
    try {
      await controlador.crearInsumo({
        nombre,
        mascotaId: mascotaIds.length === 1 ? mascotaIds[0]! : null,
        mascotaIds,
        tipo,
        categoriaId: categoriaEfectiva,
        frecuenciaDias,
        umbralAlertaPct,
        montoHabitual,
      })
      mostrarToast('Insumo agregado a la despensa')
      recargar()
      navigate('/mascotas')
    } catch (err) {
      setError(err instanceof ErrorMascotas ? err.message : 'No se pudo guardar el insumo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ShellApp
      titulo="Nuevo insumo"
      subtitulo="Comida, higiene, salud u otro"
      volverA="/mascotas"
      etiquetaVolver="Volver a Despensa de mascotas"
      etiquetaBarraAccion="Guardar insumo"
      barraAccion={
        <button
          type="submit"
          form="form-nuevo-insumo"
          className={`${claseBotonPrimario} w-full`}
          disabled={guardando}
          data-sin-scroll
        >
          {guardando ? 'Guardando…' : 'Guardar insumo'}
        </button>
      }
    >
      <form id="form-nuevo-insumo" className="flex flex-col gap-3" onSubmit={manejarSubmit} noValidate>
        <Tarjeta acento="primario" className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nombre-insumo" className={claseEtiquetaCampo}>
              Nombre del producto o gasto
            </label>
            <input
              id="nombre-insumo"
              className={claseCampoTexto}
              type="text"
              placeholder="Ej. Concentrado adulto 12 kg"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={guardando}
              required
            />
          </div>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <div className="flex items-center gap-1.5">
              <legend className={claseEtiquetaCampo}>¿Para qué mascotas es?</legend>
              <AyudaInfo
                etiqueta="Información sobre selección de mascotas"
                texto="Marca una, varias o elige Todas para compartirlo entre todas las mascotas del hogar."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {mascotas.map((m) => {
                const marcada = mascotaIds.includes(m.id)
                return (
                  <TarjetaSeleccion
                    key={m.id}
                    id={`insumo-mascota-${m.id}`}
                    checked={marcada}
                    disabled={guardando}
                    onChange={(checked) =>
                      setMascotaIds((prev) =>
                        checked
                          ? prev.includes(m.id)
                            ? prev
                            : [...prev, m.id]
                          : prev.filter((id) => id !== m.id),
                      )
                    }
                  >
                    {m.nombre}
                  </TarjetaSeleccion>
                )
              })}
              <TarjetaSeleccion
                id="insumo-mascota-todas"
                checked={mascotaIds.length === 0}
                disabled={guardando}
                onChange={(checked) => {
                  if (checked) setMascotaIds([])
                }}
              >
                Todas
              </TarjetaSeleccion>
            </div>
          </fieldset>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className={claseEtiquetaCampo}>Tipo de insumo</legend>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map((opcion) => (
                <label
                  key={opcion.valor}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-hogar-borde-fuerte bg-hogar-superficie px-3 py-2 text-sm font-bold text-hogar-tinta"
                >
                  <input
                    type="radio"
                    name="tipo-insumo"
                    value={opcion.valor}
                    checked={tipo === opcion.valor}
                    onChange={() => setTipo(opcion.valor)}
                    disabled={guardando}
                  />
                  <span>{opcion.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {vista && vista.categorias.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="categoria-insumo" className={claseEtiquetaCampo}>
                Categoría sugerida
              </label>
              <select
                id="categoria-insumo"
                className={claseCampoTexto}
                value={categoriaEfectiva}
                onChange={(e) => setCategoriaId(e.target.value)}
                disabled={guardando}
              >
                {vista.categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid grid-cols-2 items-end gap-2.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="duracion-dias" className={claseEtiquetaCampo}>
                Frecuencia estimada (días)
              </label>
              <input
                id="duracion-dias"
                className={claseCampoTexto}
                type="number"
                min={1}
                max={32767}
                value={frecuenciaTexto}
                onChange={(e) => setFrecuenciaTexto(e.target.value)}
                disabled={guardando}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="umbral-alerta" className={claseEtiquetaCampo}>
                Umbral de alerta (%)
              </label>
              <input
                id="umbral-alerta"
                className={claseCampoTexto}
                type="number"
                min={0}
                max={100}
                value={umbralTexto}
                aria-describedby="ayuda-umbral"
                onChange={(e) => setUmbralTexto(e.target.value)}
                disabled={guardando}
              />
            </div>
          </div>
          <p id="ayuda-umbral" className={claseAyudaCampo}>
            Por defecto 20 %. La alerta se activa cuando el último nivel observado es menor o igual al umbral.
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="precio-insumo" className={claseEtiquetaCampo}>
              Monto habitual en COP (opcional)
            </label>
            <input
              id="precio-insumo"
              className={`${claseCampoTexto} hogar-cop font-bold`}
              type="text"
              inputMode="numeric"
              placeholder="Ej. $165.000"
              value={montoTexto}
              aria-describedby="ayuda-precio-insumo"
              onChange={(e) => {
                const n = parsearDigitosCop(e.target.value)
                setMontoTexto(n > 0 ? formatearPesos(n) : '')
              }}
              disabled={guardando}
            />
            <p id="ayuda-precio-insumo" className={claseAyudaCampo}>
              Referencia para prellenar al tocar Recomprar. No suma al gasto hasta que registres una compra.
            </p>
          </div>

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
