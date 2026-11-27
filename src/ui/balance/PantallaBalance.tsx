import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  AyudaInfo,
  Insignia,
  Tarjeta,
  claseAyudaCampo,
  claseBotonIcono,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseBotonSecundario,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { formatearFechaCortaEs } from '../compraRapida/formatoCop'
import {
  ListaDesglose,
  desplazarPeriodo,
  formatearPeriodoEs,
  nombreMesPeriodoEs,
} from '../obligaciones/PiezasObligaciones'
import { useBalance } from './ContextoBalance'
import {
  BarraProporcional,
  TarjetaIngresoFijo,
  TarjetaMiembroBalance,
} from './PiezasBalance'

export function PantallaBalance() {
  const {
    hogar,
    controlador,
    periodo,
    vista,
    cargando,
    errorCarga,
    toast,
    cambiarPeriodo,
    alternarIncluirPersonales,
    recargar,
    notificar,
    limpiarToast,
  } = useBalance()
  const [guardandoRecibo, setGuardandoRecibo] = useState(false)

  const mes = nombreMesPeriodoEs(periodo)

  async function confirmarRecibido(datos: {
    ingresoId: string
    montoEsperado: number
    montoRecibido: number
    fechaRecepcion: string
    recepcionExistente: { id: string; baseSeq: number } | null
  }) {
    setGuardandoRecibo(true)
    try {
      const r = await controlador.marcarIngresoRecibido({
        ingresoId: datos.ingresoId,
        periodo,
        montoEsperado: datos.montoEsperado,
        montoRecibido: datos.montoRecibido,
        fechaRecepcion: datos.fechaRecepcion,
        recepcionExistente: datos.recepcionExistente,
      })
      notificar(r.resumen)
      recargar()
    } finally {
      setGuardandoRecibo(false)
    }
  }

  return (
    <ShellApp
      titulo="Balance de pareja"
      subtitulo={hogar.nombre}
      mostrarNavegacion
      etiquetaBarraAccion="Acción principal de balance de pareja"
      barraAccion={
        <Link
          to="/balance/transferir"
          className={`${claseBotonPrimario} w-full no-underline`}
          data-sin-scroll
        >
          Transferir al fondo común
        </Link>
      }
    >
      {toast ? (
        <div
          className="hogar-toast flex items-center justify-between gap-2 rounded-2xl bg-hogar-tinta px-3.5 py-2.5 text-sm text-white shadow-[var(--hogar-shadow-elevated)]"
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1 break-words">✓ {toast}</span>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent px-2 font-bold text-[#9be8d0] underline"
            onClick={limpiarToast}
          >
            Cerrar
          </button>
        </div>
      ) : null}

      {errorCarga ? (
        <Aviso variante="peligro" icono="▲" role="alert">
          <p>{errorCarga}</p>
          <button
            type="button"
            className={`${claseBotonPequenoSecundario} mt-1`}
            onClick={recargar}
          >
            Reintentar
          </button>
        </Aviso>
      ) : null}

      <div
        className="flex items-center justify-between gap-2 rounded-2xl border border-hogar-borde bg-hogar-superficie p-1.5 shadow-[var(--hogar-shadow-card)]"
        role="group"
        aria-label="Cambiar mes calendario del balance"
      >
        <button
          type="button"
          className={claseBotonIcono}
          aria-label="Mes anterior"
          onClick={() => cambiarPeriodo(desplazarPeriodo(periodo, -1))}
        >
          ‹
        </button>
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-1.5 text-center">
          <span className="text-[0.9375rem] font-extrabold text-hogar-tinta">
            {formatearPeriodoEs(periodo)}
          </span>
          <Insignia variante="primario">Aporte libre</Insignia>
          <AyudaInfo
            etiqueta="Información sobre aporte libre"
            texto="Cada miembro aporta libremente al hogar. Nunca se calculan saldos ni deudas entre ustedes."
          />
        </div>
        <button
          type="button"
          className={claseBotonIcono}
          aria-label="Mes siguiente"
          onClick={() => cambiarPeriodo(desplazarPeriodo(periodo, 1))}
        >
          ›
        </button>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <label
          htmlFor="toggle-personales"
          className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-hogar-borde bg-hogar-superficie px-3 py-1 text-xs font-bold text-hogar-tinta-suave shadow-[0_1px_2px_rgba(16,24,20,0.04)]"
        >
          <input
            id="toggle-personales"
            type="checkbox"
            role="switch"
            checked={vista?.incluirPersonales ?? false}
            disabled={cargando}
            onChange={(e) => void alternarIncluirPersonales(e.target.checked)}
            className="hogar-switch scale-75"
          />
          <span>Mis personales</span>
        </label>
        <AyudaInfo
          alinear="derecha"
          etiqueta="Información sobre gastos personales en balance"
          texto="Apagado por defecto. Lo personal se excluye del balance y nunca suma como aporte al hogar."
        />
      </div>

      {vista?.incluirPersonales ? (
        <Aviso variante="ambar" icono="ℹ">
          <p>
            <strong className="text-hogar-tinta">Vista con gastos personales propios:</strong>{' '}
            solo ves tus gastos personales de {mes} (
            <span className="hogar-cop font-bold">
              {formatearPesos(vista.gastosPersonalesPropios)}
            </span>
            ). Siguen sin contarse como aporte al hogar.
          </p>
        </Aviso>
      ) : null}

      <section aria-labelledby="aportes-heading">
        <Tarjeta className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="aportes-heading"
              className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta"
            >
              Aportes del mes al hogar
            </h2>
            <span className="hogar-cop text-base font-extrabold text-hogar-tinta">
              {formatearPesos(vista?.totalAportes ?? 0)}
            </span>
          </div>

          {vista ? (
            <>
              <BarraProporcional
                miembros={vista.miembros}
                totalAportes={vista.totalAportes}
              />
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {vista.miembros.map((miembro, idx) => (
                  <TarjetaMiembroBalance
                    key={miembro.miembroId}
                    miembro={miembro}
                    indice={idx}
                    periodo={periodo}
                    mostrarPctIngreso={vista.mostrarPctIngreso}
                  />
                ))}
              </ul>
              {vista.salidasFondoComun > 0 ? (
                <p className={claseAyudaCampo}>
                  Salidas desde medios del fondo común en {mes}:{' '}
                  <span className="hogar-cop font-bold text-hogar-tinta">
                    {formatearPesos(vista.salidasFondoComun)}
                  </span>{' '}
                  (informativo, no suma como aporte de nadie).
                </p>
              ) : null}
            </>
          ) : (
            <p className={claseAyudaCampo}>Cargando aportes del mes…</p>
          )}

          <Link
            to="/balance/nuevo-ingreso"
            className={`${claseBotonSecundario} w-full no-underline`}
          >
            + Registrar ingreso
          </Link>
        </Tarjeta>
      </section>

      <section aria-labelledby="ingresos-heading">
        <Tarjeta className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="ingresos-heading"
              className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta"
            >
              Ingresos: fijos vs variables
            </h2>
            <span className="hogar-cop text-base font-extrabold text-hogar-tinta">
              {formatearPesos(vista?.ingresos.total ?? 0)}
            </span>
          </div>

          {vista ? (
            <>
              <ListaDesglose
                filas={[
                  {
                    etiqueta: 'Total ingresos fijos del hogar',
                    valor: `${formatearPesos(vista.ingresos.totalFijos)} (${vista.ingresos.pctFijos})`,
                  },
                  {
                    etiqueta: 'Total ingresos variables recibidos',
                    valor: `${formatearPesos(vista.ingresos.totalVariables)} (${vista.ingresos.pctVariables})`,
                  },
                ]}
              />

              {vista.ingresos.fijos.length === 0 && vista.ingresos.variables.length === 0 ? (
                <p className={claseAyudaCampo}>
                  Todavía no hay ingresos registrados para este mes.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {vista.ingresos.fijos.map((item) => (
                    <TarjetaIngresoFijo
                      key={`${item.serieId}-${periodo}`}
                      item={item}
                      ocupado={guardandoRecibo}
                      onConfirmarRecibido={confirmarRecibido}
                    />
                  ))}
                  {vista.ingresos.variables.map((v) => (
                    <li key={v.id}>
                      <Tarjeta suave className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="m-0 text-[0.9375rem] font-extrabold text-hogar-tinta break-words">
                            {v.descripcion} · {v.miembroNombre}
                          </h3>
                          <p className="m-0 mt-0.5 text-[0.8125rem] text-hogar-tinta-suave">
                            Variable · Registrado el {formatearFechaCortaEs(v.fecha)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="hogar-cop block text-base font-extrabold text-hogar-tinta">
                            {formatearPesos(v.monto)}
                          </span>
                          <Insignia variante="indigo">Variable</Insignia>
                        </div>
                      </Tarjeta>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </Tarjeta>
      </section>
    </ShellApp>
  )
}
