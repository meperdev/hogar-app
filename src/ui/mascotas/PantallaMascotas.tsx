import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorMascotas } from '../../app/controladorMascotas'
import { mascotasDeItem, type EspecieMascota } from '../../domain/mascotas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  AyudaInfo,
  Insignia,
  SelectorMes,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoPrimario,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { formatearFechaCortaEs } from '../compraRapida/formatoCop'
import { formatearPeriodoEs } from '../periodos'
import { useMascotas } from './ContextoMascotas'
import { TarjetaInsumo } from './PiezasMascotas'

export function PantallaMascotas() {
  const {
    hogar,
    controlador,
    periodo,
    vista,
    cargando,
    errorCarga,
    cambiarPeriodo,
    recargar,
    mostrarToast,
  } = useMascotas()

  const [filtroMascota, setFiltroMascota] = useState<'todas' | 'compartido' | string>('todas')
  const [nombreNuevaMascota, setNombreNuevaMascota] = useState('')
  const [especieNueva, setEspecieNueva] = useState<EspecieMascota>('perro')
  const [guardandoMascota, setGuardandoMascota] = useState(false)
  const [errorMascota, setErrorMascota] = useState('')
  const teniaVistaAlMontarRef = useRef(vista !== null)

  useEffect(() => {
    if (teniaVistaAlMontarRef.current) {
      recargar()
    }
  }, [recargar])

  const items = vista?.items ?? []
  const mascotasActivas = vista?.mascotasActivas ?? []
  const alertasCount = items.filter((e) => e.alerta).length

  const itemsFiltrados = items.filter((e) => {
    const ids = mascotasDeItem(e.item)
    if (filtroMascota === 'todas') return true
    if (filtroMascota === 'compartido') return ids.length === 0
    return ids.length === 0 || ids.includes(filtroMascota)
  })

  const nombresMascotas = mascotasActivas.map((m) => m.nombre).join(' y ')
  const subtitulo =
    (nombresMascotas ? `${nombresMascotas} · ` : `${hogar.nombre} · `)
    + (alertasCount === 0 ? 'Al día' : alertasCount === 1 ? '1 alerta' : `${alertasCount} alertas`)

  async function manejarAjustarNivel(itemId: string, nivelPct: number) {
    await controlador.ajustarNivel({ itemDespensaId: itemId, nivelPct })
    mostrarToast('Ajuste guardado (nivel derivado recalculado)')
    recargar()
  }

  async function manejarCrearMascota(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGuardandoMascota(true)
    setErrorMascota('')
    try {
      await controlador.crearMascota({
        nombre: nombreNuevaMascota,
        especie: especieNueva,
        fechaNacimiento: null,
      })
      setNombreNuevaMascota('')
      mostrarToast('Mascota agregada al hogar')
      recargar()
    } catch (err) {
      setErrorMascota(err instanceof ErrorMascotas ? err.message : 'No se pudo guardar la mascota.')
    } finally {
      setGuardandoMascota(false)
    }
  }

  const gastoMes = vista?.gastoMes

  return (
    <ShellApp
      titulo="Despensa de mascotas"
      subtitulo={subtitulo}
      mostrarNavegacion
      etiquetaBarraAccion="Agregar insumo de mascotas"
      barraAccion={
        <Link to="/mascotas/nuevo-insumo" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>
          + Agregar insumo
        </Link>
      }
    >
      {vista?.sinConexion ? (
        <Aviso variante="ambar" icono="◷" role="status">
          <p>Modo sin conexión: mostrando la última copia guardada en este dispositivo.</p>
        </Aviso>
      ) : null}

      {errorCarga ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorCarga}</p>
          <button type="button" className={`${claseBotonPequenoSecundario} mt-1`} onClick={recargar}>
            Reintentar
          </button>
        </Aviso>
      ) : null}

      <SelectorMes periodo={periodo} onCambiar={cambiarPeriodo} />

      <Tarjeta acento="primario" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
              Gasto en Mascotas ({formatearPeriodoEs(periodo)})
            </h2>
            <AyudaInfo
              etiqueta="Información del cálculo de gasto en mascotas"
              texto="Se calcula automáticamente con las compras del hogar en categoría Mascotas, contando cada compra una sola vez."
            />
          </div>
          <span className="hogar-cop text-xl font-extrabold text-hogar-tinta">
            {formatearPesos(gastoMes?.total ?? 0)}
          </span>
        </div>

        <details className="hogar-details rounded-2xl border border-hogar-borde bg-hogar-superficie-suave px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-hogar-tinta">
            <span>Ver detalle ({gastoMes?.compras.length ?? 0})</span>
            <span className="hogar-chevron inline-block" aria-hidden="true">▾</span>
          </summary>
          <div className="mt-2.5 flex flex-col gap-2.5 border-t border-hogar-borde pt-2.5">
            {gastoMes && (gastoMes.porMascota.length > 0 || gastoMes.sinEtiqueta > 0) ? (
              <div className="flex flex-wrap gap-1.5" aria-label="Totales por mascota">
                {gastoMes.porMascota.map((d) => (
                  <span
                    key={d.mascotaId}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hogar-borde bg-hogar-superficie px-2.5 py-1 text-xs"
                  >
                    <span className="font-semibold text-hogar-tinta-suave">{d.nombre}</span>
                    <strong className="hogar-cop font-extrabold text-hogar-tinta">
                      {formatearPesos(d.monto)}
                    </strong>
                  </span>
                ))}
                {gastoMes.sinEtiqueta > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-hogar-borde bg-hogar-superficie px-2.5 py-1 text-xs">
                    <span className="font-semibold text-hogar-tinta-suave">Compartido</span>
                    <strong className="hogar-cop font-extrabold text-hogar-tinta">
                      {formatearPesos(gastoMes.sinEtiqueta)}
                    </strong>
                  </span>
                ) : null}
              </div>
            ) : null}

            {gastoMes && gastoMes.compras.length > 0 ? (
              <>
                <ul className="m-0 flex list-none flex-col divide-y divide-hogar-borde/70 p-0">
                  {gastoMes.compras.map((c) => {
                    const mascotaNombre =
                      c.mascotaId === null
                        ? 'Compartido'
                        : (vista?.mascotas.find((m) => m.id === c.mascotaId)?.nombre ?? 'Mascota')
                    return (
                      <li key={c.id} className="flex items-start justify-between gap-2.5 py-2 first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="m-0 text-xs font-bold text-hogar-tinta break-words">
                            {c.descripcion || 'Compra Mascotas'}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-hogar-tinta-suave">
                            <span>{formatearFechaCortaEs(c.fecha)}</span>
                            <Insignia variante="neutral">{mascotaNombre}</Insignia>
                          </div>
                        </div>
                        <span className="hogar-cop shrink-0 text-xs font-extrabold text-hogar-tinta">
                          {formatearPesos(c.montoTotal)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-baseline justify-between gap-2 border-t border-hogar-borde pt-2 text-xs font-extrabold text-hogar-tinta">
                  <span>Total</span>
                  <span className="hogar-cop">{formatearPesos(gastoMes.total)}</span>
                </div>
              </>
            ) : (
              <p className={claseAyudaCampo}>Sin compras en Mascotas este mes.</p>
            )}
          </div>
        </details>
      </Tarjeta>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar despensa por mascota">
        <button
          type="button"
          className={filtroMascota === 'todas' ? claseBotonPequenoPrimario : claseBotonPequenoSecundario}
          aria-pressed={filtroMascota === 'todas'}
          onClick={() => setFiltroMascota('todas')}
        >
          Todas ({items.length})
        </button>
        {mascotasActivas.map((m) => (
          <button
            key={m.id}
            type="button"
            className={filtroMascota === m.id ? claseBotonPequenoPrimario : claseBotonPequenoSecundario}
            aria-pressed={filtroMascota === m.id}
            onClick={() => setFiltroMascota(m.id)}
          >
            {m.nombre}
          </button>
        ))}
        <button
          type="button"
          className={filtroMascota === 'compartido' ? claseBotonPequenoPrimario : claseBotonPequenoSecundario}
          aria-pressed={filtroMascota === 'compartido'}
          onClick={() => setFiltroMascota('compartido')}
        >
          Compartido
        </button>
      </div>

      <details className="hogar-details rounded-2xl border border-hogar-borde bg-hogar-superficie px-3.5 py-2 shadow-[var(--hogar-shadow-card)]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-hogar-tinta">
          <span>+ Agregar mascota</span>
          <span className="hogar-chevron inline-block" aria-hidden="true">▾</span>
        </summary>
        <form className="mt-2.5 flex flex-col gap-2.5" onSubmit={manejarCrearMascota} noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="nueva-mascota-nombre" className={claseEtiquetaCampo}>
              Nombre de la mascota
            </label>
            <input
              id="nueva-mascota-nombre"
              type="text"
              className={claseCampoTexto}
              placeholder="Ej. Luna"
              value={nombreNuevaMascota}
              onChange={(e) => setNombreNuevaMascota(e.target.value)}
              disabled={guardandoMascota}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="nueva-mascota-especie" className={claseEtiquetaCampo}>
              Especie
            </label>
            <select
              id="nueva-mascota-especie"
              className={claseCampoTexto}
              value={especieNueva}
              onChange={(e) => setEspecieNueva(e.target.value as EspecieMascota)}
              disabled={guardandoMascota}
            >
              <option value="perro">Perro</option>
              <option value="gato">Gato</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          {errorMascota ? (
            <Aviso variante="peligro" icono="▲" role="alert">
              <p>{errorMascota}</p>
            </Aviso>
          ) : null}
          <button
            type="submit"
            className={`${claseBotonPequenoPrimario} w-full`}
            disabled={guardandoMascota}
          >
            {guardandoMascota ? 'Guardando…' : 'Guardar mascota'}
          </button>
        </form>
      </details>

      {cargando && !vista ? (
        <Aviso variante="indigo" icono="◷" role="status">
          <p className="font-bold">Cargando despensa de mascotas…</p>
        </Aviso>
      ) : null}

      <section aria-labelledby="inventario-heading" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="inventario-heading" className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Insumos y recurrentes
          </h2>
          {vista ? (
            <span className="text-xs text-hogar-tinta-suave">
              Hoy: {formatearFechaCortaEs(vista.hoy)}
            </span>
          ) : null}
        </div>

        {itemsFiltrados.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {itemsFiltrados.map((estadoItem) => (
              <TarjetaInsumo
                key={estadoItem.item.id}
                estadoItem={estadoItem}
                mascotas={vista?.mascotas ?? []}
                onAjustarNivel={manejarAjustarNivel}
              />
            ))}
          </ul>
        ) : !cargando ? (
          <Tarjeta suave>
            <p className="m-0 text-sm font-bold text-hogar-tinta">No hay insumos en esta vista todavía.</p>
            <p className={`${claseAyudaCampo} mt-1`}>
              Agrega concentrado, arena o antipulgas para controlar su nivel y reposición.
            </p>
          </Tarjeta>
        ) : null}
      </section>
    </ShellApp>
  )
}
