import { esFechaCivil } from '../domain/fechas'
import { calcularResumenGastos, type FiltroAmbitoGastos } from '../domain/gastos'
import { esPesos } from '../domain/pesos'
import type { AlcanceCompra } from './compraRapida'
import {
  ErrorGastos,
  type ControladorGastos,
  type EditarCompraEntrada,
  type VistaGastosMes,
} from './gastos'

export type DatosGastos = {
  compras: Array<{
    id: string
    fecha: string
    descripcion: string
    monto_total: number
    categoria_id: string
    ambito: 'hogar' | 'personal'
    miembro_id: string | null
    pago_tipo: 'contado' | 'financiado'
    medio_de_pago_id: string | null
    financiada_por_pasivo_id: string | null
    obligacion_id: string | null
    registrado_por: string
    origen: 'manual' | 'qr' | 'ocr' | 'correo'
  }>
  categorias: Array<{
    id: string
    nombre: string
    icono: string | null
    orden: number
    activa: boolean
  }>
  medios: Array<{
    id: string
    nombre: string
    tipo: 'efectivo' | 'cuenta'
    activo: boolean
    orden?: number | undefined
  }>
  pasivos: Array<{
    id: string
    nombre: string
    tipo: 'tarjeta' | 'credito' | 'deuda'
  }>
  planes: Array<{
    compra_id: string | null
    pasivo_id: string
    n_cuotas: number | null
  }>
  miembros: Array<{
    id: string
    nombre: string
  }>
}

export interface GastosPort {
  cargar(): Promise<{ datos: DatosGastos; sinConexion: boolean }>
  editarCompra(entrada: EditarCompraEntrada): Promise<void>
  anularCompra(compraId: string): Promise<void>
}

export function crearControladorGastos(d: {
  port: GastosPort
  alcance: AlcanceCompra
}): ControladorGastos {
  return {
    async cargarMes(periodo: string, ambito: FiltroAmbitoGastos): Promise<VistaGastosMes> {
      const { datos, sinConexion } = await d.port.cargar()
      const resumen = calcularResumenGastos({
        periodo,
        actorId: d.alcance.miembroId,
        ambito,
        compras: datos.compras.map((c) => ({
          id: c.id,
          fecha: c.fecha,
          descripcion: c.descripcion,
          montoTotal: c.monto_total,
          categoriaId: c.categoria_id,
          ambito: c.ambito,
          miembroId: c.miembro_id,
          pagoTipo: c.pago_tipo,
          medioDePagoId: c.medio_de_pago_id,
          financiadaPorPasivoId: c.financiada_por_pasivo_id,
          obligacionId: c.obligacion_id,
          registradoPor: c.registrado_por,
          origen: c.origen,
        })),
        categorias: datos.categorias,
        medios: datos.medios,
        pasivos: datos.pasivos,
        planes: datos.planes.flatMap((pl) =>
          pl.compra_id
            ? [{ compraId: pl.compra_id, pasivoId: pl.pasivo_id, nCuotas: pl.n_cuotas }]
            : [],
        ),
        miembros: datos.miembros,
      })
      return { ...resumen, sinConexion }
    },

    async editarCompra(entrada: EditarCompraEntrada): Promise<void> {
      const descripcion = entrada.descripcion.trim()
      if (descripcion.length > 200) {
        throw new ErrorGastos('La descripción no puede superar 200 caracteres.')
      }
      if (entrada.montoTotal !== undefined && (!esPesos(entrada.montoTotal) || entrada.montoTotal <= 0)) {
        throw new ErrorGastos('Ingresa un monto entero mayor a $0.')
      }
      if (entrada.fecha !== undefined && !esFechaCivil(entrada.fecha)) {
        throw new ErrorGastos('Selecciona una fecha válida.')
      }
      await d.port.editarCompra({
        ...entrada,
        descripcion,
      })
    },

    async anularCompra(compraId: string): Promise<void> {
      await d.port.anularCompra(compraId)
    },
  }
}
