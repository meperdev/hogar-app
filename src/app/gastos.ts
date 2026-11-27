import type {
  CategoriaResumenGasto,
  ComparativaMesAnterior,
  FiltroAmbitoGastos,
  MovimientoGasto,
  ResumenGastosMes,
} from '../domain/gastos'

export type {
  CategoriaResumenGasto,
  ComparativaMesAnterior,
  FiltroAmbitoGastos,
  MovimientoGasto,
  ResumenGastosMes,
}

export type VistaGastosMes = ResumenGastosMes & {
  sinConexion: boolean
}

export interface ControladorGastos {
  cargarMes(periodo: string, ambito: FiltroAmbitoGastos): Promise<VistaGastosMes>
}
