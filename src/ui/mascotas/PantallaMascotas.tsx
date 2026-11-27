import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorMascotas } from '../../app/controladorMascotas'
import type { EspecieMascota } from '../../domain/mascotas'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  AyudaInfo,
  Tarjeta,
  claseAyudaCampo,
  claseBotonIcono,
  claseBotonPequenoPrimario,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseCampoTexto,
  claseEtiquetaCampo,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { formatearFechaCortaEs } from '../compraRapida/formatoCop'
import { desplazarPeriodo, formatearPeriodoEs } from '../obligaciones/PiezasObligaciones'
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

  const items = vista?.items ?? []
  const mascotasActivas = vista?.mascotasActivas ?? []
  const alertasCount = items.filter((e) => e.alerta).length

  const itemsFiltrados = items.filter((e) => {
    if (filtroMascota === 'todas') return true
    if (filtroMascota === 'compartido') return e.item.mascotaId === null
    return e.item.mascotaId === filtroMascota || e.item.mascotaId === null
  })

  const primerInsumo = itemsFiltrados[0]?.item ?? items[0]?.item ?? null
  const ctaPrincipal = primerInsumo
    ? {
        to: `/mascotas/recomprar/${encodeURIComponent(primerInsumo.id)}`,
        etiqueta:
          primerInsumo.montoHabitual !== null
            ? `Recomprar ${primerInsumo.nombre} (${formatearPesos(primerInsumo.montoHabitual)})`
            : `Recomprar ${primerInsumo.nombre}`,
      }
    : {
        to: '/mascotas/nuevo-insumo',
        etiqueta: '+ Agregar insumo o gasto recurrente',
      }

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
      etiquetaBarraAccion="Acción principal de despensa de mascotas"
      barraAccion={
        primerInsumo ? (
          <div className="flex items-center gap-2">
            <Link to={ctaPrincipal.to} className={`${claseBotonPrimario} flex-1 no-underline`} data-sin-scroll>
              {ctaPrincipal.etiqueta}
            </Link>
            <Link to="/mascotas/nuevo-insumo" className={`${claseBotonPequenoSecundario} shrink-0 no-underline`}>
              + Insumo
            </Link>
          </div>
        ) : (
          <Link to="/mascotas/nuevo-insumo" className={`${claseBotonPrimario} w-full no-underline`} data-sin-scroll>
            + Agregar insumo o gasto recurrente
          </Link>
        )
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

      <div
        className="flex items-center justify-between gap-2 rounded-2xl border border-hogar-borde bg-hogar-superficie p-1.5 shadow-[var(--hogar-shadow-card)]"
        role="region"
        aria-label="Cambiar mes calendario"
      >
        <button
          type="button"
          className={claseBotonIcono}
          aria-label="Mes anterior"
          onClick={() => cambiarPeriodo(desplazarPeriodo(periodo, -1))}
        >
          ‹
        </button>
        <span className="text-[0.9375rem] font-extrabold text-hogar-tinta">
          {formatearPeriodoEs(periodo)}
        </span>
        <button
          type="button"
          className={claseBotonIcono}
          aria-label="Mes siguiente"
          onClick={() => cambiarPeriodo(desplazarPeriodo(periodo, 1))}
        >
          ›
        </button>
      </div>

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
            <span>Ver desglose reconciliable ({gastoMes?.compras.length ?? 0} compras)</span>
            <span className="hogar-chevron inline-block" aria-hidden="true">▾</span>
          </summary>
          <div className="mt-2.5 flex flex-col gap-2">
            {gastoMes && gastoMes.compras.length > 0 ? (
              <dl className="m-0 flex flex-col gap-1.5 text-xs">
                {gastoMes.compras.map((c) => {
                  const mascotaNombre =
                    c.mascotaId === null
                      ? 'sin mascota · compartida'
                      : (vista?.mascotas.find((m) => m.id === c.mascotaId)?.nombre ?? 'Mascota')
                  return (
                    <div key={c.id} className="flex items-baseline justify-between gap-2">
                      <dt className="min-w-0 flex-1 text-hogar-tinta-suave break-words">
                        {formatearFechaCortaEs(c.fecha)} · {c.descripcion || 'Compra Mascotas'} ({mascotaNombre})
                      </dt>
                      <dd className="hogar-cop m-0 shrink-0 font-bold text-hogar-tinta">
                        {formatearPesos(c.montoTotal)}
                      </dd>
                    </div>
                  )
                })}
                <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-hogar-borde pt-1.5 font-bold">
                  <dt>Total hogar · categoría Mascotas</dt>
                  <dd className="hogar-cop m-0">{formatearPesos(gastoMes.total)}</dd>
                </div>
              </dl>
            ) : (
              <p className={claseAyudaCampo}>Sin compras del hogar en categoría Mascotas este mes.</p>
            )}

            {gastoMes && (gastoMes.porMascota.length > 0 || gastoMes.sinEtiqueta > 0) ? (
              <p className={claseAyudaCampo}>
                <strong className="text-hogar-tinta">Desglose por mascota:</strong>{' '}
                {[
                  ...gastoMes.porMascota.map((d) => `${d.nombre} ${formatearPesos(d.monto)}`),
                  ...(gastoMes.sinEtiqueta > 0
                    ? [`Sin etiqueta ${formatearPesos(gastoMes.sinEtiqueta)}`]
                    : []),
                ].join(' · ')}
              </p>
            ) : null}
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
              Hoy: {formatearFechaCortaEs(vista.hoy)} · Derivado
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
