/**
 * Contrato de la capa `app` para el núcleo 3 (Balance de pareja y exportación).
 *
 * La UI (`src/ui/**`) solo habla con `ControladorBalance`. Montos en pesos
 * enteros COP; fechas civiles `YYYY-MM-DD` (America/Bogota); periodos `YYYY-MM`.
 * Todo total de balance e ingresos es DERIVADO en el dispositivo: nunca se
 * persiste ni calcula saldos/deudas entre miembros (I6, I7, I17, I22, I24).
 */

import type { AlcanceExportacion, ZipExportado } from '../domain/exportacion'

export type AporteMiembroVista = {
  miembroId: string
  nombre: string
  activo: boolean
  aporte: number
  desglose: {
    comprasContado: number
    pagosDeuda: number
    costosDirectos: number
    transferenciasFondoComun: number
  }
  pctTotal: string
  ingresoMes: number
  /** `null` cuando el miembro no tiene ingresos en el mes (la UI muestra "Sin ingresos registrados este mes"). */
  pctIngreso: string | null
}

export type IngresoFijoVista = {
  serieId: string
  ingresoId: string
  miembroId: string
  miembroNombre: string
  descripcion: string
  diaEsperado: number
  fechaEsperada: string
  montoEsperado: number
  montoEfectivo: number
  estado: 'recibido' | 'esperado'
  recepcionId: string | null
  recepcionBaseSeq: number | null
  fechaRecepcion: string | null
  montoRecibido: number | null
}

export type IngresoVariableVista = {
  id: string
  miembroId: string
  miembroNombre: string
  descripcion: string
  monto: number
  fecha: string
}

export type VistaBalanceMes = {
  periodo: string
  mostrarPctIngreso: boolean
  incluirPersonales: boolean
  totalAportes: number
  salidasFondoComun: number
  gastosPersonalesPropios: number
  miembros: AporteMiembroVista[]
  ingresos: {
    totalFijos: number
    totalVariables: number
    total: number
    pctFijos: string
    pctVariables: string
    fijos: IngresoFijoVista[]
    variables: IngresoVariableVista[]
  }
}

export type MedioAporteOpcion = {
  id: string
  nombre: string
  tipo: 'efectivo' | 'cuenta'
  ownerTipo: 'miembro' | 'hogar'
  duenoMiembroId: string | null
  duenoNombre: string | null
}

export type BorradorAporte = {
  medioOrigenId: string | null
  medioDestinoId: string | null
  monto: number
  fecha: string
  nota: string
}

export type BorradorIngreso =
  | {
      tipo: 'fijo'
      miembroId: string
      descripcion: string
      monto: number
      diaEsperado: number
      vigenteDesde: string
      marcarRecibido: null | {
        periodo: string
        fechaRecepcion: string
        montoRecibido: number | null
      }
    }
  | {
      tipo: 'variable'
      miembroId: string
      descripcion: string
      monto: number
      fecha: string
    }

export type BorradorRecepcion = {
  ingresoId: string
  periodo: string
  montoEsperado: number
  montoRecibido: number | null
  fechaRecepcion: string
  recepcionExistente: { id: string; baseSeq: number } | null
}

export type ResultadoRegistroBalance = {
  loteId: string
  resumen: string
}

export type RespaldoHistorial = {
  fecha: string
  alcance: AlcanceExportacion
  nombre: string
  tamanoBytes: number | null
}

export type EstadoAjustes = {
  mostrarPctIngreso: boolean
  miembroActualNombre: string
  pendientesOutbox: number
  ultimaCopiaLocal: string | null
  ultimoMedioNombre: string | null
  historial: RespaldoHistorial[]
}

export type ResultadoExportacion = {
  fecha: string
  hogarZip: ZipExportado
  personalZip: ZipExportado
}

export interface ControladorBalance {
  cargarMes(periodo: string): Promise<VistaBalanceMes>
  cambiarMostrarPctIngreso(valor: boolean, periodo?: string): Promise<VistaBalanceMes>
  leerIncluirPersonales(): Promise<boolean>
  guardarIncluirPersonales(valor: boolean): Promise<void>

  mediosParaAporte(): Promise<{
    origenes: MedioAporteOpcion[]
    destinos: MedioAporteOpcion[]
  }>
  registrarAporte(borrador: BorradorAporte): Promise<ResultadoRegistroBalance>

  miembrosActivos(): Promise<Array<{ id: string; nombre: string }>>
  registrarIngreso(borrador: BorradorIngreso): Promise<ResultadoRegistroBalance>
  marcarIngresoRecibido(borrador: BorradorRecepcion): Promise<ResultadoRegistroBalance>

  cargarEstadoAjustes(): Promise<EstadoAjustes>
  exportarAhora(): Promise<ResultadoExportacion>
}
