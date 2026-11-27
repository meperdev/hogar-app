import type {
  CategoriaGasto,
  CategoriaResumenGasto,
  ComparativaMesAnterior,
  FiltroAmbitoGastos,
  MedioGasto,
  MovimientoGasto,
  ResumenGastosMes,
} from '../domain/gastos'

export type {
  CategoriaGasto,
  CategoriaResumenGasto,
  ComparativaMesAnterior,
  FiltroAmbitoGastos,
  MedioGasto,
  MovimientoGasto,
  ResumenGastosMes,
}

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
}
