import { useEffect, useState, type FormEvent } from 'react'
import type { Hogar } from '../../app/fundacion'
import {
  ErrorMedioDePago,
  type DuenoMedioPago,
  type MedioDePagoItem,
  type MediosDePagoPort,
  type TipoMedioPago,
} from '../../app/mediosDePago'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoPrimario,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ATAJOS_MEDIOS_SUGERIDOS, identidadMedio } from '../marcas'

export function TarjetaMediosDePago({
  hogar,
  mediosDePago,
  onCambio,
}: {
  hogar: Hogar
  mediosDePago: MediosDePagoPort
  onCambio?: () => void
}) {
  const [medios, setMedios] = useState<MedioDePagoItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoMedioPago>('cuenta')
  const [ownerTipo, setOwnerTipo] = useState<DuenoMedioPago>('miembro')
  const [guardando, setGuardando] = useState(false)
  const [cambiandoId, setCambiandoId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  useEffect(() => {
    let vigente = true
    setCargando(true)
    void mediosDePago
      .listar(hogar.id)
      .then((lista) => {
        if (vigente) {
          setMedios(lista)
          setCargando(false)
        }
      })
      .catch((causa) => {
        if (vigente) {
          setError(
            causa instanceof ErrorMedioDePago
              ? causa.message
              : 'No se pudieron cargar los medios de pago.',
          )
          setCargando(false)
        }
      })
    return () => {
      vigente = false
    }
  }, [hogar.id, mediosDePago])

  const nombresMiembro = new Map(hogar.miembros.map((m) => [m.id, m.nombre]))

  function etiquetaDueno(medio: MedioDePagoItem): string {
    if (medio.ownerTipo === 'hogar') return 'Hogar'
    if (medio.ownerMiembroId === hogar.miembroActual.id) return 'Tuyo'
    const dueno = medio.ownerMiembroId ? nombresMiembro.get(medio.ownerMiembroId) : null
    return dueno ? `De ${dueno}` : 'De un miembro'
  }

  function puedeModificar(medio: MedioDePagoItem): boolean {
    return (
      medio.ownerMiembroId === hogar.miembroActual.id || hogar.miembroActual.rol === 'admin'
    )
  }

  async function crearMedio(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (guardando) return
    setError('')
    setExito('')
    setGuardando(true)
    try {
      const creado = await mediosDePago.crear({ nombre, tipo, ownerTipo })
      setMedios((prev) =>
        [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      )
      setNombre('')
      setAbierto(false)
      setExito(`Agregamos "${creado.nombre}" a tus medios de pago.`)
      onCambio?.()
    } catch (causa) {
      setError(
        causa instanceof ErrorMedioDePago
          ? causa.message
          : 'No pudimos guardar el medio de pago.',
      )
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(medio: MedioDePagoItem) {
    if (cambiandoId) return
    setError('')
    setExito('')
    setCambiandoId(medio.id)
    try {
      const res = await mediosDePago.cambiarActivo(medio.id, !medio.activo)
      setMedios((prev) =>
        prev.map((m) => (m.id === medio.id ? { ...m, activo: res.activo } : m)),
      )
      onCambio?.()
    } catch (causa) {
      setError(
        causa instanceof ErrorMedioDePago
          ? causa.message
          : 'No pudimos actualizar este medio de pago.',
      )
    } finally {
      setCambiandoId(null)
    }
  }

  const activos = medios.filter((m) => m.activo)
  const archivados = medios.filter((m) => !m.activo)

  return (
    <section
      id="medios-de-pago"
      aria-labelledby="medios-titulo"
      className="flex flex-col gap-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="medios-titulo" className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
          Medios de pago (contado)
        </h2>
        <button
          type="button"
          className={claseBotonPequenoPrimario}
          aria-expanded={abierto}
          onClick={() => {
            setAbierto((v) => !v)
            setError('')
          }}
        >
          {abierto ? 'Cerrar' : '+ Agregar medio'}
        </button>
      </div>

      {error ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{error}</p>
        </Aviso>
      ) : null}

      {exito ? (
        <Aviso variante="primario" icono="✓" role="status">
          <p>{exito}</p>
        </Aviso>
      ) : null}

      {abierto ? (
        <Tarjeta acento="primario">
          <form className="flex flex-col gap-3" onSubmit={(e) => void crearMedio(e)} noValidate>
            <div className="hogar-carrusel" role="group" aria-label="Atajos rápidos de medios">
              {ATAJOS_MEDIOS_SUGERIDOS.map((atajo) => {
                const idVisual = identidadMedio(atajo.nombre, atajo.tipo)
                const { Logo } = idVisual
                return (
                  <button
                    key={atajo.nombre}
                    type="button"
                    className="inline-flex min-h-11 shrink-0 snap-start cursor-pointer items-center gap-2 rounded-full border-0 px-3.5 py-2 text-xs font-bold shadow-[0_2px_8px_-2px_rgba(16,24,20,0.22)] transition-transform duration-150 active:scale-[0.95]"
                    style={{ background: idVisual.gradiente, color: idVisual.texto }}
                    onClick={() => {
                      setNombre(atajo.nombre)
                      setTipo(atajo.tipo)
                    }}
                  >
                    <Logo className="size-4 shrink-0" />
                    <span>{atajo.nombre}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="medio-nuevo-nombre" className={claseEtiquetaCampo}>
                Nombre del medio
              </label>
              <input
                id="medio-nuevo-nombre"
                className={claseCampoTexto}
                type="text"
                maxLength={80}
                placeholder="Ej. Nequi, Bancolombia, Bre-B"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={guardando}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-1.5 overflow-hidden">
                <label htmlFor="medio-nuevo-tipo" className={claseEtiquetaCampo}>
                  Tipo
                </label>
                <select
                  id="medio-nuevo-tipo"
                  className={claseCampoTexto}
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoMedioPago)}
                  disabled={guardando}
                >
                  <option value="cuenta">Cuenta / billetera</option>
                  <option value="efectivo">Efectivo</option>
                </select>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5 overflow-hidden">
                <label htmlFor="medio-nuevo-dueno" className={claseEtiquetaCampo}>
                  ¿De quién es?
                </label>
                <select
                  id="medio-nuevo-dueno"
                  className={claseCampoTexto}
                  value={ownerTipo}
                  onChange={(e) => setOwnerTipo(e.target.value as DuenoMedioPago)}
                  disabled={guardando}
                >
                  <option value="miembro">Mío ({hogar.miembroActual.nombre})</option>
                  <option value="hogar">Del hogar (fondo común)</option>
                </select>
              </div>
            </div>

            <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar medio de pago'}
            </button>
          </form>
        </Tarjeta>
      ) : null}

      {cargando ? (
        <p className={claseAyudaCampo}>Cargando medios de pago…</p>
      ) : activos.length === 0 ? (
        <Tarjeta suave>
          <p className="m-0 text-sm text-hogar-tinta-suave">
            Todavía no hay medios activos. Toca «+ Agregar medio» para crear el primero.
          </p>
        </Tarjeta>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {activos.map((medio) => {
            const idVisual = identidadMedio(medio.nombre, medio.tipo)
            const { Logo } = idVisual
            return (
              <li key={medio.id}>
                <Tarjeta className="flex items-center justify-between gap-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-2xl shadow-[0_3px_8px_-2px_rgba(16,24,20,0.24)]"
                      style={{ background: idVisual.gradiente, color: idVisual.texto }}
                      aria-hidden="true"
                    >
                      <Logo className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-sm font-extrabold text-hogar-tinta break-words">
                        {medio.nombre}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Insignia variante={medio.ownerTipo === 'hogar' ? 'primario' : 'indigo'}>
                          {etiquetaDueno(medio)}
                        </Insignia>
                        <Insignia variante="neutral">
                          {medio.tipo === 'efectivo' ? 'Efectivo' : 'Cuenta'}
                        </Insignia>
                      </div>
                    </div>
                  </div>
                  {puedeModificar(medio) ? (
                    <button
                      type="button"
                      className={claseBotonPequenoSecundario}
                      disabled={cambiandoId === medio.id}
                      onClick={() => void alternarActivo(medio)}
                    >
                      {cambiandoId === medio.id ? '…' : 'Archivar'}
                    </button>
                  ) : null}
                </Tarjeta>
              </li>
            )
          })}
        </ul>
      )}

      {archivados.length > 0 ? (
        <details className="hogar-details overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie shadow-[var(--hogar-shadow-card)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3.5 py-2 text-xs font-bold text-hogar-tinta-suave">
            <span>Medios archivados ({archivados.length})</span>
            <span className="hogar-chevron inline-block" aria-hidden="true">▾</span>
          </summary>
          <ul className="m-0 flex list-none flex-col gap-2 border-t border-hogar-borde bg-hogar-fondo p-2.5">
            {archivados.map((medio) => (
              <li key={medio.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 text-hogar-tinta-suave break-words">
                  {medio.nombre} · {etiquetaDueno(medio)}
                </span>
                {puedeModificar(medio) ? (
                  <button
                    type="button"
                    className={claseBotonPequenoSecundario}
                    disabled={cambiandoId === medio.id}
                    onClick={() => void alternarActivo(medio)}
                  >
                    Reactivar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
