import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EstadoAjustes, ResultadoExportacion } from '../../app/balance'
import type { ZipExportado } from '../../domain/exportacion'
import {
  Aviso,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPrimario,
  claseBotonSecundario,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { formatearFechaCortaEs } from '../compraRapida/formatoCop'
import { ListaDesglose } from '../obligaciones/PiezasObligaciones'
import { useBalance } from './ContextoBalance'
import { InterruptorBalance } from './PiezasBalance'

function descargarZip(zip: ZipExportado) {
  const copia = new Uint8Array(zip.bytes.byteLength)
  copia.set(zip.bytes)
  const blob = new Blob([copia.buffer], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = zip.nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
}

export function PantallaAjustesExportar({
  onSalir,
  saliendo,
  errorSalir,
}: {
  onSalir: () => void
  saliendo: boolean
  errorSalir: string
}) {
  const { hogar, controlador, alternarMostrarPctIngreso } = useBalance()
  const [estado, setEstado] = useState<EstadoAjustes | null>(null)
  const [exportacion, setExportacion] = useState<ResultadoExportacion | null>(null)
  const [exportando, setExportando] = useState(false)
  const [avisoExport, setAvisoExport] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    void controlador.cargarEstadoAjustes().then(
      (res) => {
        if (vigente) setEstado(res)
      },
      (causa: unknown) => {
        if (vigente) {
          setError(causa instanceof Error ? causa.message : 'No pudimos cargar Ajustes.')
        }
      },
    )
    return () => {
      vigente = false
    }
  }, [controlador])

  async function exportar(descargarUno?: 'hogar' | 'personal') {
    setError('')
    setExportando(true)
    try {
      const res =
        descargarUno && exportacion ? exportacion : await controlador.exportarAhora()
      setExportacion(res)
      if (!descargarUno || descargarUno === 'hogar') descargarZip(res.hogarZip)
      if (!descargarUno || descargarUno === 'personal') descargarZip(res.personalZip)
      setAvisoExport(
        descargarUno === 'hogar'
          ? `Descargado ${res.hogarZip.nombreArchivo} (solo hechos compartidos)`
          : descargarUno === 'personal'
            ? `Descargado ${res.personalZip.nombreArchivo} (solo personales propios)`
            : 'Exportación lista: 2 archivos ZIP separados — Hogar (compartido) y Mis personales (JSON + CSV)',
      )
    } catch (causa) {
      setError(
        causa instanceof Error
          ? causa.message
          : 'No se pudo generar la exportación. Verifica tu conexión.',
      )
    } finally {
      setExportando(false)
    }
  }

  async function cambiarPct(valor: boolean) {
    await alternarMostrarPctIngreso(valor)
    setEstado((prev) => (prev ? { ...prev, mostrarPctIngreso: valor } : prev))
  }

  return (
    <ShellApp
      titulo="Ajustes y exportación"
      subtitulo={hogar.nombre}
      volverA="/balance"
      etiquetaVolver="Volver a Balance de pareja"
      accionDerecha={<Insignia variante="primario">Respaldo activo</Insignia>}
      mostrarNavegacion
      etiquetaBarraAccion="Acción principal de exportación"
      barraAccion={
        <button
          type="button"
          className={`${claseBotonPrimario} w-full`}
          disabled={exportando}
          data-sin-scroll
          onClick={() => void exportar()}
        >
          {exportando ? 'Exportando…' : 'Exportar ahora'}
        </button>
      }
    >
      {avisoExport ? (
        <div
          className="flex items-center justify-between gap-2 rounded-xl bg-hogar-tinta px-3.5 py-2.5 text-sm text-white"
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1 break-words">✓ {avisoExport}</span>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent px-2 font-bold text-[#9be8d0] underline"
            onClick={() => setAvisoExport('')}
          >
            Cerrar
          </button>
        </div>
      ) : null}

      {error || errorSalir ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{error || errorSalir}</p>
        </Aviso>
      ) : null}

      <Tarjeta acento="primario" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Exportación automática semanal
          </h2>
          <Insignia variante="primario">✓ Activa</Insignia>
        </div>
        <p className={claseAyudaCampo}>
          Cada ciclo genera <strong className="text-hogar-tinta">1 + N archivos ZIP en Storage</strong>{' '}
          (uno del hogar compartido y uno personal por cada miembro activo,{' '}
          <strong className="text-hogar-tinta">nunca mezclados</strong>). Cada miembro descarga{' '}
          <strong className="text-hogar-tinta">exactamente dos ZIP</strong> con el JSON y los CSV de
          su alcance.
        </p>

        <div className="flex flex-col gap-2.5">
          <Tarjeta suave className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-sm font-extrabold text-hogar-tinta">Hogar (compartido)</h3>
              <Insignia variante="primario">ZIP · Sin personales</Insignia>
            </div>
            <p className={claseAyudaCampo}>
              Un archivo ZIP con JSON + CSV de solo los hechos compartidos del hogar (ninguna fila
              personal).
            </p>
            <button
              type="button"
              className={`${claseBotonSecundario} w-full`}
              disabled={exportando}
              onClick={() => void exportar('hogar')}
            >
              Descargar Hogar (ZIP · JSON + CSV)
            </button>
          </Tarjeta>

          <Tarjeta suave className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-sm font-extrabold text-hogar-tinta">Mis personales</h3>
              <Insignia variante="indigo">ZIP · Solo {hogar.miembroActual.nombre}</Insignia>
            </div>
            <p className={claseAyudaCampo}>
              Un archivo ZIP con JSON + CSV de solo tus compras, pasivos y costos personales (nunca
              los de otro miembro).
            </p>
            <button
              type="button"
              className={`${claseBotonSecundario} w-full`}
              disabled={exportando}
              onClick={() => void exportar('personal')}
            >
              Descargar Mis personales (ZIP · JSON + CSV)
            </button>
          </Tarjeta>
        </div>
      </Tarjeta>

      <Tarjeta acento="indigo" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Copia local en este dispositivo
          </h2>
          <Insignia variante="indigo">IndexedDB</Insignia>
        </div>
        <ListaDesglose
          filas={[
            {
              etiqueta: 'Estado sin conexión',
              valor:
                estado && estado.pendientesOutbox > 0
                  ? `${estado.pendientesOutbox} cambios pendientes`
                  : `✓ Al día (${hogar.miembroActual.nombre})`,
            },
            {
              etiqueta: 'Última copia local',
              valor: estado?.ultimaCopiaLocal
                ? formatearFechaCortaEs(estado.ultimaCopiaLocal.slice(0, 10), true)
                : 'En preparación',
            },
            {
              etiqueta: 'Último medio recordado (local)',
              valor: estado?.ultimoMedioNombre ?? 'Sin preferencia aún',
            },
          ]}
        />
        <p className={claseAyudaCampo}>
          Cada sesión conserva en IndexedDB su réplica aislada por actor (hogar y solo tus
          personales + cambios pendientes).
        </p>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
            Historial semanal reciente
          </h2>
          <span className="text-[0.8125rem] text-hogar-tinta-suave">Storage privado</span>
        </div>
        {estado && estado.historial.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {estado.historial.map((h) => (
              <li key={`${h.alcance}-${h.fecha}-${h.nombre}`}>
                <Tarjeta suave className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="m-0 text-sm font-bold text-hogar-tinta">
                      {h.alcance === 'hogar' ? 'Hogar (compartido)' : 'Mis personales'} ·{' '}
                      {formatearFechaCortaEs(h.fecha, true)}
                    </p>
                    <p className="m-0 text-xs text-hogar-tinta-suave">{h.nombre}</p>
                  </div>
                  <Insignia variante="primario">✓ Listo</Insignia>
                </Tarjeta>
              </li>
            ))}
          </ul>
        ) : (
          <p className={claseAyudaCampo}>
            Todavía no hay respaldos archivados en Storage. Usa «Exportar ahora» para descargar los
            dos ZIP al instante.
          </p>
        )}
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">
          Configuración del hogar
        </h2>
        <InterruptorBalance
          id="cfg-pct-ingreso"
          etiqueta='Mostrar "% de su ingreso" en Balance'
          ayuda="Apagado por defecto para todo el hogar."
          checked={estado?.mostrarPctIngreso ?? false}
          onChange={(v) => void cambiarPct(v)}
        />
        <ListaDesglose
          filas={[
            { etiqueta: 'Moneda y formato', valor: 'COP enteros ($300.000)' },
            { etiqueta: 'Zona horaria civil', valor: 'America/Bogota' },
          ]}
        />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2.5">
        <h2 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta">Sesión actual</h2>
        <p className={claseAyudaCampo}>
          Sesión activa como{' '}
          <strong className="text-hogar-tinta">{hogar.miembroActual.nombre}</strong> (
          {hogar.miembroActual.rol === 'admin' ? 'Administrador' : 'Miembro'}).
        </p>
        <button
          type="button"
          className={`${claseBotonSecundario} w-full`}
          disabled={saliendo}
          onClick={onSalir}
        >
          Cerrar sesión
        </button>
        <Link to="/hogar" className={`${claseBotonSecundario} w-full no-underline`}>
          Volver a {hogar.nombre}
        </Link>
      </Tarjeta>
    </ShellApp>
  )
}
