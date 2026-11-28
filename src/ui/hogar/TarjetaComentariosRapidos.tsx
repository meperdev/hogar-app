import { useEffect, useState, type FormEvent } from 'react'
import {
  ErrorComentarioRapido,
  type CategoriaComentarioOpcion,
  type ComentarioRapidoItem,
  type ComentariosRapidosPort,
} from '../../app/comentariosRapidos'
import type { Hogar } from '../../app/fundacion'
import {
  Aviso,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoPrimario,
  claseBotonPrimario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { EVENTO_CATALOGO_ACTUALIZADO } from '../eventosDatos'
import { useNotificacionesOpcional } from '../Notificaciones'

export function TarjetaComentariosRapidos({
  hogar,
  comentariosRapidos,
  onCambio,
}: {
  hogar: Hogar
  comentariosRapidos: ComentariosRapidosPort
  onCambio?: () => void
}) {
  const [lista, setLista] = useState<ComentarioRapidoItem[]>([])
  const [categorias, setCategorias] = useState<CategoriaComentarioOpcion[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState(false)
  const [categoriaId, setCategoriaId] = useState('')
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const notificaciones = useNotificacionesOpcional()

  function mostrarExito(mensaje: string) {
    setExito(mensaje)
    notificaciones?.publicar({ mensaje, variante: 'exito' })
  }

  useEffect(() => {
    let vigente = true
    setCargando(true)
    void comentariosRapidos
      .listar(hogar.id)
      .then((datos) => {
        if (!vigente) return
        setLista(datos.comentarios)
        setCategorias(datos.categorias)
        if (!categoriaId && datos.categorias[0]) {
          setCategoriaId(datos.categorias[0].id)
        }
        setCargando(false)
      })
      .catch((causa) => {
        if (!vigente) return
        setError(
          causa instanceof ErrorComentarioRapido
            ? causa.message
            : 'No se pudieron cargar los comentarios frecuentes.',
        )
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [hogar.id, comentariosRapidos])

  async function crearComentario(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (guardando) return
    const catObjetivo = categoriaId || categorias[0]?.id || ''
    if (!catObjetivo) {
      setError('Elige una categoría para el comentario.')
      return
    }
    setError('')
    setExito('')
    setGuardando(true)
    try {
      const creado = await comentariosRapidos.crear({
        categoriaId: catObjetivo,
        texto,
      })
      setLista((prev) =>
        [...prev, creado].sort((a, b) => a.orden - b.orden || a.texto.localeCompare(b.texto, 'es')),
      )
      setTexto('')
      setAbierto(false)
      mostrarExito(`Agregamos «${creado.texto}».`)
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_CATALOGO_ACTUALIZADO))
      onCambio?.()
    } catch (causa) {
      setError(
        causa instanceof ErrorComentarioRapido
          ? causa.message
          : 'No pudimos guardar el comentario frecuente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarComentario(item: ComentarioRapidoItem) {
    if (eliminandoId) return
    setError('')
    setExito('')
    setEliminandoId(item.id)
    try {
      await comentariosRapidos.eliminar(item.id)
      setLista((prev) => prev.filter((c) => c.id !== item.id))
      mostrarExito(`Eliminamos «${item.texto}».`)
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_CATALOGO_ACTUALIZADO))
      onCambio?.()
    } catch (causa) {
      setError(
        causa instanceof ErrorComentarioRapido
          ? causa.message
          : 'No pudimos eliminar el comentario frecuente.',
      )
    } finally {
      setEliminandoId(null)
    }
  }

  const activos = lista.filter((c) => c.activo)
  const grupos = categorias
    .map((cat) => ({
      categoria: cat,
      items: activos.filter((c) => c.categoriaId === cat.id),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <section
      id="comentarios-rapidos"
      aria-labelledby="comentarios-rapidos-titulo"
      className="flex flex-col gap-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="comentarios-rapidos-titulo"
          className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta"
        >
          Comentarios frecuentes
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
          {abierto ? 'Cerrar' : '+ Agregar comentario'}
        </button>
      </div>

      {error ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{error}</p>
        </Aviso>
      ) : null}

      {exito && !notificaciones ? (
        <Aviso variante="primario" icono="✓" role="status">
          <p>{exito}</p>
        </Aviso>
      ) : null}

      {abierto ? (
        <Tarjeta acento="primario">
          <form className="flex flex-col gap-3" onSubmit={(e) => void crearComentario(e)} noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="comentario-rapido-categoria" className={claseEtiquetaCampo}>
                Categoría
              </label>
              <select
                id="comentario-rapido-categoria"
                className={claseCampoTexto}
                value={categoriaId || categorias[0]?.id || ''}
                onChange={(e) => setCategoriaId(e.target.value)}
                disabled={guardando}
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="comentario-rapido-texto" className={claseEtiquetaCampo}>
                Texto del comentario
              </label>
              <input
                id="comentario-rapido-texto"
                className={claseCampoTexto}
                type="text"
                maxLength={80}
                placeholder="Ej. Tanqueada moto, Almuerzo trabajo"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                disabled={guardando}
                required
              />
            </div>

            <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar comentario'}
            </button>
          </form>
        </Tarjeta>
      ) : null}

      {cargando ? (
        <p className={claseAyudaCampo}>Cargando comentarios frecuentes…</p>
      ) : grupos.length === 0 ? (
        <Tarjeta suave>
          <p className="m-0 text-sm text-hogar-tinta-suave">
            Aún no hay comentarios rápidos. Úsalos para prellenar frases habituales en cada categoría.
          </p>
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-2">
          {grupos.map(({ categoria, items }) => (
            <Tarjeta key={categoria.id} className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-extrabold uppercase tracking-wide text-hogar-tinta-suave">
                {categoria.nombre}
              </h3>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full border border-hogar-borde bg-hogar-fondo py-1 pr-1.5 pl-3 text-xs font-bold text-hogar-tinta"
                  >
                    <span>{item.texto}</span>
                    <button
                      type="button"
                      aria-label={`Eliminar comentario ${item.texto}`}
                      disabled={eliminandoId === item.id}
                      onClick={() => void eliminarComentario(item)}
                      className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-sm font-bold text-hogar-tinta-suave hover:bg-hogar-peligro-suave hover:text-hogar-peligro disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ))}
        </div>
      )}
    </section>
  )
}
