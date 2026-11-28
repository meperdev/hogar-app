import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearPesos } from '../../domain/pesos'
import {
  Aviso,
  AyudaInfo,
  FilaSwitchPersonal,
  Insignia,
  SelectorMes,
  Tarjeta,
  claseAyudaCampo,
  claseBotonPequenoSecundario,
  claseBotonPrimario,
  claseBotonSecundario,
} from '../ComponentesBase'
import { ShellApp } from '../ShellApp'
import { formatearFechaCortaEs } from '../compraRapida/formatoCop'
import {
  ListaDesglose,
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
    cambiarPeriodo,
    alternarIncluirPersonales,
    recargar,
    notificar,
  } = useBalance()
  const [guardandoRecibo, setGuardandoRecibo] = useState(false)
  const teniaVistaAlMontarRef = useRef(vista !== null)

  useEffect(() => {
    if (teniaVistaAlMontarRef.current) {
      recargar()
    }
  }, [recargar])

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

      <SelectorMes
        periodo={periodo}
        onCambiar={cambiarPeriodo}
        ariaLabel="Cambiar mes calendario del balance"
        subtitulo={
          <span className="inline-flex items-center justify-center gap-1">
            <Insignia variante="primario">Aporte libre</Insignia>
            <AyudaInfo
              etiqueta="Información sobre aporte libre"
              texto="Cada miembro aporta libremente al hogar. Nunca se calculan saldos ni deudas entre ustedes."
            />
          </span>
        }
        pie={
          <FilaSwitchPersonal
            id="toggle-personales"
            checked={vista?.incluirPersonales ?? false}
            disabled={cargando}
            onChange={(v) => void alternarIncluirPersonales(v)}
            ayuda="Tus personales no cuentan como aporte al hogar."
            etiquetaAyuda="Información sobre gastos personales en balance"
          />
        }
      />

      {vista?.incluirPersonales ? (
        <Aviso variante="ambar" icono="ℹ">
          <p>
            Personales de {mes}:{' '}
            <span className="hogar-cop font-bold text-hogar-tinta">
              {formatearPesos(vista.gastosPersonalesPropios)}
            </span>{' '}
            (fuera del balance).
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
              Aportes del mes
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
                  Fondo común usado en {mes}:{' '}
                  <span className="hogar-cop font-bold text-hogar-tinta">
                    {formatearPesos(vista.salidasFondoComun)}
                  </span>
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
              Ingresos del mes
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
                    etiqueta: 'Fijos',
                    valor: `${formatearPesos(vista.ingresos.totalFijos)} (${vista.ingresos.pctFijos})`,
                  },
                  {
                    etiqueta: 'Variables',
                    valor: `${formatearPesos(vista.ingresos.totalVariables)} (${vista.ingresos.pctVariables})`,
                  },
                ]}
              />

              {vista.ingresos.fijos.length === 0 && vista.ingresos.variables.length === 0 ? (
                <p className={claseAyudaCampo}>
                  Sin ingresos registrados este mes.
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
                            Variable · {formatearFechaCortaEs(v.fecha)}
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
