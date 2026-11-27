import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  ErrorComercio,
  type CategoriaComercioOpcion,
  type ComercioFrecuenteItem,
  type ComerciosPort,
} from '../../app/comercios'
import type { Hogar } from '../../app/fundacion'
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
import { ATAJOS_COMERCIOS_SUGERIDOS, identidadComercio } from '../marcas'
import {
  calcularDesplazamientoHermano,
  calcularIndiceDestino,
  limitarNumero,
  moverElemento,
} from './reordenarLista'

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function TarjetaComercios({
  hogar,
  comercios,
  onCambio,
}: {
  hogar: Hogar
  comercios: ComerciosPort
  onCambio?: () => void
}) {
  const [lista, setLista] = useState<ComercioFrecuenteItem[]>([])
  const [categorias, setCategorias] = useState<CategoriaComercioOpcion[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cambiandoId, setCambiandoId] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editCategoriaId, setEditCategoriaId] = useState('')
  const [reordenando, setReordenando] = useState(false)
  const [arrastre, setArrastre] = useState<{
    id: string
    offsetY: number
    indiceOrigen: number
    indiceDestino: number
    pasoPx: number
  } | null>(null)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  const listaActivosRef = useRef<HTMLUListElement>(null)
  const listaRef = useRef<ComercioFrecuenteItem[]>([])
  const arrastreRef = useRef<{
    id: string
    pointerId: number
    inicioY: number
    indiceOrigen: number
    indiceDestino: number
    centrosSlots: number[]
    pasoPx: number
    minOffset: number
    maxOffset: number
  } | null>(null)
  listaRef.current = lista

  useEffect(() => {
    let vigente = true
    setCargando(true)
    void comercios
      .listar(hogar.id)
      .then((datos) => {
        if (!vigente) return
        setLista(datos.comercios)
        setCategorias(datos.categorias)
        setCargando(false)
      })
      .catch((causa) => {
        if (!vigente) return
        setError(
          causa instanceof ErrorComercio
            ? causa.message
            : 'No se pudieron cargar los comercios frecuentes.',
        )
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [hogar.id, comercios])

  const categoriasPorId = new Map(categorias.map((c) => [c.id, c.nombre]))
  const activos = lista.filter((c) => c.activo)
  const archivados = lista.filter((c) => !c.activo)

  function aplicarNuevoOrdenActivos(
    origen: ComercioFrecuenteItem[],
    idsOrdenados: string[],
  ): ComercioFrecuenteItem[] {
    const porId = new Map(origen.filter((c) => c.activo).map((c) => [c.id, c]))
    const ordenados = idsOrdenados
      .map((id, indice) => {
        const item = porId.get(id)
        return item ? { ...item, orden: indice } : null
      })
      .filter((item): item is ComercioFrecuenteItem => item !== null)
    const inactivos = origen.filter((c) => !c.activo)
    return [...ordenados, ...inactivos]
  }

  async function guardarOrden(idsOrdenados: string[], snapshotPrevio: ComercioFrecuenteItem[]) {
    setReordenando(true)
    setError('')
    setExito('')
    try {
      await comercios.reordenar(idsOrdenados)
      setExito('Orden de comercios actualizado.')
      onCambio?.()
    } catch (causa) {
      setLista(snapshotPrevio)
      setError(
        causa instanceof ErrorComercio ? causa.message : 'No pudimos guardar el nuevo orden.',
      )
    } finally {
      setReordenando(false)
    }
  }

  async function crearComercio(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (guardando) return
    setError('')
    setExito('')
    setGuardando(true)
    try {
      const creado = await comercios.crear({
        nombre,
        categoriaSugeridaId: categoriaId || null,
      })
      setLista((prev) =>
        [...prev, creado].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')),
      )
      setNombre('')
      setCategoriaId('')
      setAbierto(false)
      setExito(`Agregamos "${creado.nombre}" a comercios frecuentes.`)
      onCambio?.()
    } catch (causa) {
      setError(
        causa instanceof ErrorComercio ? causa.message : 'No pudimos guardar el comercio.',
      )
    } finally {
      setGuardando(false)
    }
  }

  async function guardarEdicion(e: FormEvent<HTMLFormElement>, comercioId: string) {
    e.preventDefault()
    if (guardando) return
    setError('')
    setExito('')
    setGuardando(true)
    try {
      const actualizado = await comercios.editar({
        comercioId,
        nombre: editNombre,
        categoriaSugeridaId: editCategoriaId || null,
      })
      setLista((prev) => prev.map((c) => (c.id === comercioId ? actualizado : c)))
      setEditandoId(null)
      setExito(`Actualizamos "${actualizado.nombre}".`)
      onCambio?.()
    } catch (causa) {
      setError(
        causa instanceof ErrorComercio ? causa.message : 'No pudimos actualizar el comercio.',
      )
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(comercio: ComercioFrecuenteItem) {
    if (cambiandoId) return
    setError('')
    setExito('')
    setCambiandoId(comercio.id)
    try {
      const res = await comercios.cambiarActivo(comercio.id, !comercio.activo)
      setLista((prev) =>
        prev.map((c) => (c.id === comercio.id ? { ...c, activo: res.activo } : c)),
      )
      if (editandoId === comercio.id) setEditandoId(null)
      onCambio?.()
    } catch (causa) {
      setError(
        causa instanceof ErrorComercio ? causa.message : 'No pudimos actualizar este comercio.',
      )
    } finally {
      setCambiandoId(null)
    }
  }

  function iniciarArrastre(e: PointerEvent<HTMLButtonElement>, comercioId: string) {
    if (reordenando || activos.length < 2) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const ul = listaActivosRef.current
    if (!ul) return
    const nodos = [...ul.querySelectorAll<HTMLLIElement>('li[data-comercio-id]')]
    const rects = nodos.map((n) => n.getBoundingClientRect())
    const indiceOrigen = activos.findIndex((c) => c.id === comercioId)
    if (indiceOrigen === -1 || rects.length !== activos.length) return

    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Ignorar en entornos de prueba.
    }

    const centrosSlots = rects.map((r) => r.top + r.height / 2)
    const pasoPx =
      rects.length > 1
        ? (rects[rects.length - 1]!.top - rects[0]!.top) / (rects.length - 1)
        : (rects[0]?.height ?? 64) + 8
    const minOffset = (centrosSlots[0] ?? 0) - (centrosSlots[indiceOrigen] ?? 0)
    const maxOffset =
      (centrosSlots[centrosSlots.length - 1] ?? 0) - (centrosSlots[indiceOrigen] ?? 0)

    arrastreRef.current = {
      id: comercioId,
      pointerId: e.pointerId,
      inicioY: e.clientY,
      indiceOrigen,
      indiceDestino: indiceOrigen,
      centrosSlots,
      pasoPx,
      minOffset,
      maxOffset,
    }
    setArrastre({
      id: comercioId,
      offsetY: 0,
      indiceOrigen,
      indiceDestino: indiceOrigen,
      pasoPx,
    })
  }

  function moverArrastre(e: PointerEvent<HTMLButtonElement>) {
    const estado = arrastreRef.current
    if (!estado || estado.pointerId !== e.pointerId) return
    const offsetY = limitarNumero(e.clientY - estado.inicioY, estado.minOffset, estado.maxOffset)
    const centroArrastrado = (estado.centrosSlots[estado.indiceOrigen] ?? 0) + offsetY
    const indiceDestino = calcularIndiceDestino(
      estado.indiceOrigen,
      centroArrastrado,
      estado.centrosSlots,
    )
    estado.indiceDestino = indiceDestino
    setArrastre({
      id: estado.id,
      offsetY,
      indiceOrigen: estado.indiceOrigen,
      indiceDestino,
      pasoPx: estado.pasoPx,
    })
  }

  function finalizarArrastre(e: PointerEvent<HTMLButtonElement>) {
    const estado = arrastreRef.current
    if (!estado || estado.pointerId !== e.pointerId) return
    arrastreRef.current = null
    setArrastre(null)
    if (estado.indiceDestino === estado.indiceOrigen) return
    const actual = listaRef.current
    const activosActuales = actual.filter((c) => c.activo)
    const reordenados = moverElemento(activosActuales, estado.indiceOrigen, estado.indiceDestino)
    const nuevosIds = reordenados.map((c) => c.id)
    setLista(aplicarNuevoOrdenActivos(actual, nuevosIds))
    void guardarOrden(nuevosIds, actual)
  }

  function manejarTeclaOrden(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (reordenando) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const destino = e.key === 'ArrowUp' ? idx - 1 : idx + 1
    if (destino < 0 || destino >= activos.length) return
    e.preventDefault()
    const snapshot = lista
    const nuevosIds = activos.map((c) => c.id)
    ;[nuevosIds[idx], nuevosIds[destino]] = [nuevosIds[destino]!, nuevosIds[idx]!]
    setLista((prev) => aplicarNuevoOrdenActivos(prev, nuevosIds))
    void guardarOrden(nuevosIds, snapshot)
  }

  function sugerirCategoriaPorClave(clave: string): string {
    const match = categorias.find((c) => normalizarTexto(c.nombre).includes(clave))
    return match?.id ?? ''
  }

  return (
    <section
      id="comercios"
      aria-labelledby="comercios-titulo"
      className="flex flex-col gap-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="comercios-titulo" className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
          Comercios frecuentes
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
          {abierto ? 'Cerrar' : '+ Agregar comercio'}
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
          <form className="flex flex-col gap-3" onSubmit={(e) => void crearComercio(e)} noValidate>
            <div className="hogar-carrusel" role="group" aria-label="Atajos rápidos de comercios">
              {ATAJOS_COMERCIOS_SUGERIDOS.map((atajo) => {
                const idVisual = identidadComercio(atajo.nombre)
                const { Logo } = idVisual
                return (
                  <button
                    key={atajo.nombre}
                    type="button"
                    className="inline-flex min-h-11 shrink-0 snap-start cursor-pointer items-center gap-2 rounded-full border-0 px-3.5 py-2 text-xs font-bold shadow-[0_2px_8px_-2px_rgba(16,24,20,0.22)] transition-transform duration-150 active:scale-[0.95]"
                    style={{ backgroundColor: idVisual.fondo, color: idVisual.texto }}
                    onClick={() => {
                      setNombre(atajo.nombre)
                      setCategoriaId(sugerirCategoriaPorClave(atajo.categoriaSugerida))
                    }}
                  >
                    <Logo className="size-4 shrink-0" />
                    <span>{atajo.nombre}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="comercio-nuevo-nombre" className={claseEtiquetaCampo}>
                Nombre del comercio
              </label>
              <input
                id="comercio-nuevo-nombre"
                className={claseCampoTexto}
                type="text"
                maxLength={80}
                placeholder="Ej. Dollarcity, Crepes & Waffles, Jumbo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={guardando}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="comercio-nueva-categoria" className={claseEtiquetaCampo}>
                Categoría sugerida (opcional)
              </label>
              <select
                id="comercio-nueva-categoria"
                className={claseCampoTexto}
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                disabled={guardando}
              >
                <option value="">Sin categoría fija</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar comercio'}
            </button>
          </form>
        </Tarjeta>
      ) : null}

      {cargando ? (
        <p className={claseAyudaCampo}>Cargando comercios frecuentes…</p>
      ) : activos.length === 0 ? (
        <Tarjeta suave>
          <p className="m-0 text-sm text-hogar-tinta-suave">
            Todavía no hay comercios activos. Toca «+ Agregar comercio» para crear el primero.
          </p>
        </Tarjeta>
      ) : (
        <>
          {activos.length > 1 ? (
            <p className={claseAyudaCampo}>
              Arrastra desde ⋮⋮ para ordenar los atajos de Comercio en Compra rápida.
            </p>
          ) : null}
          <ul ref={listaActivosRef} className="m-0 flex list-none flex-col gap-2 p-0">
            {activos.map((comercio, indice) => {
              const idVisual = identidadComercio(comercio.nombre)
              const { Logo } = idVisual
              const siendoArrastrado = arrastre?.id === comercio.id
              const desplazamientoHermano =
                arrastre && !siendoArrastrado
                  ? calcularDesplazamientoHermano(
                      indice,
                      arrastre.indiceOrigen,
                      arrastre.indiceDestino,
                      arrastre.pasoPx,
                    )
                  : 0
              const categoriaNombre = comercio.categoriaSugeridaId
                ? categoriasPorId.get(comercio.categoriaSugeridaId)
                : null
              const editando = editandoId === comercio.id

              return (
                <li
                  key={comercio.id}
                  data-comercio-id={comercio.id}
                  className={siendoArrastrado ? 'relative z-20' : undefined}
                  style={
                    siendoArrastrado
                      ? { transform: `translateY(${arrastre.offsetY}px) scale(1.02)` }
                      : {
                          transform: `translateY(${desplazamientoHermano}px)`,
                          transition: arrastre ? 'transform 160ms ease' : undefined,
                        }
                  }
                >
                  <Tarjeta
                    acento={siendoArrastrado || editando ? 'primario' : 'ninguno'}
                    className={`flex flex-col gap-2.5 transition-shadow ${
                      siendoArrastrado ? 'shadow-[var(--hogar-shadow-elevated)]' : ''
                    }`.trim()}
                  >
                    <div className="flex items-center gap-2.5">
                      {activos.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Reordenar ${comercio.nombre}`}
                          disabled={reordenando}
                          onPointerDown={(e) => iniciarArrastre(e, comercio.id)}
                          onPointerMove={moverArrastre}
                          onPointerUp={finalizarArrastre}
                          onPointerCancel={finalizarArrastre}
                          onLostPointerCapture={finalizarArrastre}
                          onKeyDown={(e) => manejarTeclaOrden(e, indice)}
                          className="inline-flex min-h-11 min-w-8 shrink-0 touch-none cursor-grab select-none items-center justify-center rounded-xl border-0 bg-transparent px-1 text-base font-extrabold tracking-[-0.15em] text-hogar-tinta-suave hover:bg-hogar-superficie-suave active:cursor-grabbing disabled:opacity-50"
                        >
                          <span aria-hidden="true">⋮⋮</span>
                        </button>
                      ) : null}
                      <div
                        className={`flex min-w-0 flex-1 items-center gap-2.5 ${
                          arrastre ? 'pointer-events-none select-none' : ''
                        }`.trim()}
                      >
                        <span
                          className="grid size-10 shrink-0 place-items-center rounded-2xl shadow-[0_3px_8px_-2px_rgba(16,24,20,0.2)]"
                          style={{ backgroundColor: idVisual.fondo, color: idVisual.texto }}
                          aria-hidden="true"
                        >
                          <Logo className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="m-0 text-sm font-extrabold text-hogar-tinta break-words">
                            {comercio.nombre}
                          </p>
                          {categoriaNombre ? (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <Insignia variante="neutral">{categoriaNombre}</Insignia>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`flex flex-wrap items-center justify-end gap-1.5 border-t border-hogar-borde/70 pt-2 ${
                        arrastre ? 'pointer-events-none' : ''
                      }`.trim()}
                    >
                      <button
                        type="button"
                        className={claseBotonPequenoSecundario}
                        disabled={guardando || reordenando || cambiandoId === comercio.id}
                        onClick={() => {
                          if (editando) {
                            setEditandoId(null)
                            return
                          }
                          setError('')
                          setEditandoId(comercio.id)
                          setEditNombre(comercio.nombre)
                          setEditCategoriaId(comercio.categoriaSugeridaId ?? '')
                        }}
                      >
                        {editando ? 'Cerrar' : 'Editar'}
                      </button>
                      <button
                        type="button"
                        className={claseBotonPequenoSecundario}
                        disabled={guardando || reordenando || cambiandoId === comercio.id}
                        onClick={() => void alternarActivo(comercio)}
                      >
                        {cambiandoId === comercio.id ? '…' : 'Archivar'}
                      </button>
                    </div>

                    {editando ? (
                      <form
                        className="flex flex-col gap-2.5 border-t border-hogar-borde pt-2.5"
                        onSubmit={(e) => void guardarEdicion(e, comercio.id)}
                        noValidate
                      >
                        <div className="flex flex-col gap-1">
                          <label htmlFor="comercio-editar-nombre" className={claseEtiquetaCampo}>
                            Nombre
                          </label>
                          <input
                            id="comercio-editar-nombre"
                            className={claseCampoTexto}
                            type="text"
                            maxLength={80}
                            value={editNombre}
                            onChange={(e) => setEditNombre(e.target.value)}
                            disabled={guardando}
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="comercio-editar-categoria"
                            className={claseEtiquetaCampo}
                          >
                            Categoría sugerida
                          </label>
                          <select
                            id="comercio-editar-categoria"
                            className={claseCampoTexto}
                            value={editCategoriaId}
                            onChange={(e) => setEditCategoriaId(e.target.value)}
                            disabled={guardando}
                          >
                            <option value="">Sin categoría fija</option>
                            {categorias.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            className={`${claseBotonPequenoPrimario} flex-1`}
                            disabled={guardando}
                          >
                            {guardando ? 'Guardando…' : 'Guardar cambios'}
                          </button>
                          <button
                            type="button"
                            className={claseBotonPequenoSecundario}
                            disabled={guardando}
                            onClick={() => setEditandoId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </Tarjeta>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {archivados.length > 0 ? (
        <details className="hogar-details overflow-hidden rounded-2xl border border-hogar-borde bg-hogar-superficie shadow-[var(--hogar-shadow-card)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3.5 py-2 text-xs font-bold text-hogar-tinta-suave">
            <span>Comercios archivados ({archivados.length})</span>
            <span className="hogar-chevron inline-block" aria-hidden="true">
              ▾
            </span>
          </summary>
          <ul className="m-0 flex list-none flex-col gap-2 border-t border-hogar-borde bg-hogar-fondo p-2.5">
            {archivados.map((comercio) => (
              <li key={comercio.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 text-hogar-tinta-suave break-words">
                  {comercio.nombre}
                </span>
                <button
                  type="button"
                  className={claseBotonPequenoSecundario}
                  disabled={cambiandoId === comercio.id}
                  onClick={() => void alternarActivo(comercio)}
                >
                  Reactivar
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
