import { esFechaCivil } from '../domain/fechas'
import { calcularResumenGastos, type FiltroAmbitoGastos } from '../domain/gastos'
import { esPesos } from '../domain/pesos'
import type { AlcanceCompra } from './compraRapida'
import {
  ErrorGastos,
  type ControladorGastos,
  type EditarCompraEntrada,
  type EditarPagoEntrada,
  type VistaGastosMes,
} from './gastos'

export type DatosGastos = {
  compras: Array<{
    id: string
    fecha: string
    creado_en?: string | undefined
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
    owner_miembro_id?: string | null | undefined
    activo: boolean
    orden?: number | undefined
  }>
  pasivos: Array<{
    id: string
    nombre: string
    tipo: 'tarjeta' | 'credito' | 'deuda'
    ambito?: 'hogar' | 'personal' | undefined
    owner_miembro_id?: string | null | undefined
  }>
  planes: Array<{
    compra_id: string | null
    pasivo_id: string
    n_cuotas: number | null
  }>
  pagosDeuda?: Array<{
    id: string
    pasivo_id: string
    tipo: 'abono' | 'saldo_a_favor'
    monto: number
    fecha: string
    medio_de_pago_id: string | null
    registrado_por: string
    nota: string | null
    incluir_en_gastos?: boolean | undefined
    categoria_gasto_id?: string | null | undefined
    creado_en?: string | undefined
  }> | undefined
  miembros: Array<{
    id: string
    nombre: string
  }>
}

export interface GastosPort {
  cargar(): Promise<{ datos: DatosGastos; sinConexion: boolean }>
  editarCompra(entrada: EditarCompraEntrada): Promise<void>
  anularCompra(compraId: string): Promise<void>
  editarAbono?(entrada: EditarPagoEntrada): Promise<void>
  eliminarAbono?(pagoId: string): Promise<void>
}

export function crearControladorGastos(d: {
  port: GastosPort
  alcance: AlcanceCompra
}): ControladorGastos {
  return {
    async cargarMes(periodo: string, ambito: FiltroAmbitoGastos): Promise<VistaGastosMes> {
      const { datos, sinConexion } = await d.port.cargar()
      const pasivosPorId = new Map(datos.pasivos.map((p) => [p.id, p]))
      const pagosDeuda = (datos.pagosDeuda ?? []).flatMap((pg) => {
        const pasivo = pasivosPorId.get(pg.pasivo_id)
        if (!pasivo) return []
        return [{
          id: pg.id,
          pasivoId: pg.pasivo_id,
          pasivoNombre: pasivo.nombre,
          pasivoTipo: pasivo.tipo,
          pasivoAmbito: pasivo.ambito ?? 'hogar',
          pasivoOwnerMiembroId: pasivo.owner_miembro_id ?? null,
          tipo: pg.tipo,
          monto: pg.monto,
          fecha: pg.fecha,
          medioDePagoId: pg.medio_de_pago_id,
          registradoPor: pg.registrado_por,
          nota: pg.nota,
          incluirEnGastos: Boolean(pg.incluir_en_gastos),
          categoriaGastoId: pg.categoria_gasto_id ?? null,
          creadoEn: pg.creado_en,
        }]
      })
      const resumen = calcularResumenGastos({
        periodo,
        actorId: d.alcance.miembroId,
        ambito,
        compras: datos.compras.map((c) => ({
          id: c.id,
          fecha: c.fecha,
          creadoEn: c.creado_en,
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
        medios: datos.medios.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          tipo: m.tipo,
          ownerMiembroId: m.owner_miembro_id,
          activo: m.activo,
          orden: m.orden,
        })),
        pasivos: datos.pasivos,
        planes: datos.planes.flatMap((pl) =>
          pl.compra_id
            ? [{ compraId: pl.compra_id, pasivoId: pl.pasivo_id, nCuotas: pl.n_cuotas }]
            : [],
        ),
        miembros: datos.miembros,
        pagosDeuda,
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

    async editarAbono(entrada: EditarPagoEntrada): Promise<void> {
      if (!d.port.editarAbono) {
        throw new ErrorGastos('Edición de abonos no disponible.')
      }
      if (!esPesos(entrada.monto) || entrada.monto <= 0) {
        throw new ErrorGastos('Ingresa un monto entero mayor a $0.')
      }
      if (!esFechaCivil(entrada.fecha)) {
        throw new ErrorGastos('Selecciona una fecha válida.')
      }
      if (!entrada.medioId) {
        throw new ErrorGastos('Elige un medio de pago.')
      }
      if (entrada.incluirEnGastos && !entrada.categoriaGastoId) {
        throw new ErrorGastos('Elige una categoría para contarlo como gasto.')
      }
      await d.port.editarAbono({ ...entrada, nota: entrada.nota.trim() })
    },

    async eliminarAbono(pagoId: string): Promise<void> {
      if (!d.port.eliminarAbono) {
        throw new ErrorGastos('Eliminación de abonos no disponible.')
      }
      await d.port.eliminarAbono(pagoId)
    },
  }
}
