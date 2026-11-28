import type {
  AbonoDeudaGasto,
  CategoriaGasto,
  CategoriaResumenGasto,
  ComparativaMesAnterior,
  FiltroAmbitoGastos,
  MedioGasto,
  MovimientoGasto,
  ResumenGastosMes,
} from '../domain/gastos'

export type {
  AbonoDeudaGasto,
  CategoriaGasto,
  CategoriaResumenGasto,
  ComparativaMesAnterior,
  FiltroAmbitoGastos,
  MedioGasto,
  MovimientoGasto,
  ResumenGastosMes,
}

import type { EditarPagoEntrada } from './obligaciones'

export type { EditarPagoEntrada }

export type EditarCompraEntrada = {
  compraId: string
  descripcion: string
  categoriaId: string
  montoTotal?: number | undefined
  fecha?: string | undefined
  medioDePagoId?: string | null | undefined
}

export class ErrorGastos extends Error {}

export type VistaGastosMes = ResumenGastosMes & {
  sinConexion: boolean
}

export interface ControladorGastos {
  cargarMes(periodo: string, ambito: FiltroAmbitoGastos): Promise<VistaGastosMes>
  editarCompra(entrada: EditarCompraEntrada): Promise<void>
  anularCompra(compraId: string): Promise<void>
  editarAbono?(entrada: EditarPagoEntrada): Promise<void>
  eliminarAbono?(pagoId: string): Promise<void>
}
