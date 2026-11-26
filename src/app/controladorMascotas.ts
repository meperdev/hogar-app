import { hoyCivil } from '../domain/fechas'
import type { PagoCompra } from '../domain/loteCompra'
import {
  construirLoteAjusteNivel,
  construirLoteItemDespensa,
  construirLoteMascota,
  construirLoteRecompra,
  ErrorLoteMascotas,
  type LoteMascotas,
} from '../domain/loteMascotas'
import {
  calcularGastoMascotasMes,
  derivarEstadoItem,
  ordenarInsumosPorUrgencia,
  type CompraResumenMascotas,
  type ItemDespensa,
  type Mascota,
  type ObservacionNivel,
} from '../domain/mascotas'
import type { AlcanceCompra, MedioOpcion } from './compraRapida'
import type {
  ControladorMascotas,
  EntradaAjusteNivel,
  EntradaCrearInsumo,
  EntradaCrearMascota,
  EntradaRecompra,
} from './mascotas'

export type DatosDespensa = {
  mascotas: Mascota[]
  items: ItemDespensa[]
  observaciones: ObservacionNivel[]
  compras: CompraResumenMascotas[]
  categorias: { id: string; nombre: string }[]
  medios: MedioOpcion[]
}

export type ResultadoEnvioMascotas =
  | { estado: 'aplicado' }
  | { estado: 'rechazado'; motivo: string; detalle?: string }

export interface MascotasPort {
  leer(): Promise<DatosDespensa>
  leerInstantanea(): Promise<DatosDespensa | null>
  guardarInstantanea(datos: DatosDespensa): Promise<void>
  enviarLote(lote: LoteMascotas): Promise<ResultadoEnvioMascotas>
}

export type DependenciasMascotas = {
  port: MascotasPort
  alcance: AlcanceCompra
  ahora: () => Date
  nuevoId: () => string
}

export class ErrorMascotas extends Error {
  readonly campo: string

  constructor(campo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorMascotas'
    this.campo = campo
  }
}

function mensajeRechazo(r: { motivo: string; detalle?: string }): string {
  const detalle = r.detalle ?? ''
  if (r.motivo === 'no_autorizado') return 'No tienes permiso para registrar esto.'
  if (r.motivo === 'actualizar_app') return 'Actualiza la app para continuar.'
  if (r.motivo === 'duplicado') return 'Este registro ya fue guardado.'
  if (detalle) return `No se pudo guardar: ${detalle}.`
  return 'El servidor rechazó el registro.'
}

function pagoDesdeMedio(medio: MedioOpcion, cuotas: number): PagoCompra {
  if (medio.tipo === 'medio') {
    return { tipo: 'medio', medioDePagoId: medio.id }
  }
  if (medio.tipo === 'prestamo') {
    return {
      tipo: 'prestamo',
      pasivoId: medio.id,
      ambito: medio.ambito,
      disponible: medio.disponible,
      fechaGiro: medio.fechaGiro,
    }
  }
  return {
    tipo: 'tarjeta',
    pasivoId: medio.id,
    ambito: medio.ambito,
    nCuotas: cuotas,
    diaCorte: medio.diaCorte,
    diaPago: medio.diaPago,
    tasa: medio.tasa,
  }
}

export function crearControladorMascotas(dep: DependenciasMascotas): ControladorMascotas {
  const { port, alcance, ahora, nuevoId } = dep
  let cache: DatosDespensa | null = null

  async function asegurarDatos(): Promise<{ datos: DatosDespensa; sinConexion: boolean }> {
    try {
      const remotos = await port.leer()
      cache = remotos
      await port.guardarInstantanea(remotos).catch(() => {})
      return { datos: remotos, sinConexion: false }
    } catch (error) {
      const locales = cache ?? (await port.leerInstantanea())
      if (locales) {
        cache = locales
        return { datos: locales, sinConexion: true }
      }
      throw error instanceof Error
        ? error
        : new ErrorMascotas('carga', 'Sin conexión y sin copia local de mascotas.')
    }
  }

  async function despachar(lote: LoteMascotas): Promise<{ loteId: string }> {
    let resultado: ResultadoEnvioMascotas
    try {
      resultado = await port.enviarLote(lote)
    } catch {
      throw new ErrorMascotas(
        'red',
        'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
      )
    }
    if (resultado.estado === 'rechazado') {
      throw new ErrorMascotas('servidor', mensajeRechazo(resultado))
    }
    return { loteId: lote.lote_id }
  }

  function construirConManejo<T>(fn: () => T): T {
    try {
      return fn()
    } catch (error) {
      if (error instanceof ErrorLoteMascotas) {
        throw new ErrorMascotas(error.campo, error.message)
      }
      throw error
    }
  }

  return {
    async cargar(periodoSolicitado) {
      const hoy = hoyCivil(ahora())
      const periodo = periodoSolicitado ?? hoy.slice(0, 7)
      const { datos, sinConexion } = await asegurarDatos()

      const categoriaMascotas = datos.categorias.find(
        (c) => c.nombre.trim().toLowerCase() === 'mascotas',
      )
      const categoriaMascotasId = categoriaMascotas?.id ?? null

      const itemsActivos = datos.items.filter((i) => i.activo)
      const estados = ordenarInsumosPorUrgencia(
        itemsActivos.map((item) => derivarEstadoItem(item, datos.observaciones, hoy)),
      )

      const gastoMes = calcularGastoMascotasMes(
        datos.compras,
        datos.mascotas,
        categoriaMascotasId ?? '',
        periodo,
      )

      return {
        periodo,
        hoy,
        sinConexion,
        mascotas: datos.mascotas,
        mascotasActivas: datos.mascotas.filter((m) => m.activa),
        items: estados,
        gastoMes,
        categoriaMascotasId,
        categorias: datos.categorias,
        medios: datos.medios,
      }
    },

    async crearMascota(entrada: EntradaCrearMascota) {
      const lote = construirConManejo(() =>
        construirLoteMascota(
          {
            hogarId: alcance.hogarId,
            nombre: entrada.nombre,
            especie: entrada.especie,
            fechaNacimiento: entrada.fechaNacimiento,
          },
          nuevoId,
        ),
      )
      return despachar(lote)
    },

    async crearInsumo(entrada: EntradaCrearInsumo) {
      const lote = construirConManejo(() =>
        construirLoteItemDespensa(
          {
            hogarId: alcance.hogarId,
            mascotaId: entrada.mascotaId,
            nombre: entrada.nombre,
            tipo: entrada.tipo,
            categoriaId: entrada.categoriaId,
            frecuenciaDias: entrada.frecuenciaDias,
            umbralAlertaPct: entrada.umbralAlertaPct,
            montoHabitual: entrada.montoHabitual,
          },
          nuevoId,
        ),
      )
      return despachar(lote)
    },

    async ajustarNivel(entrada: EntradaAjusteNivel) {
      const fecha = entrada.fecha ?? hoyCivil(ahora())
      const lote = construirConManejo(() =>
        construirLoteAjusteNivel(
          {
            hogarId: alcance.hogarId,
            itemDespensaId: entrada.itemDespensaId,
            fecha,
            nivelPct: entrada.nivelPct,
          },
          nuevoId,
        ),
      )
      return despachar(lote)
    },

    async recomprar(entrada: EntradaRecompra) {
      const datos = cache ?? (await port.leer())
      cache = datos

      const item = datos.items.find((i) => i.id === entrada.itemId)
      if (!item) {
        throw new ErrorMascotas('item', 'No encontramos ese insumo en la despensa.')
      }

      const medio = datos.medios.find((m) => m.id === entrada.medioId)
      if (!medio) {
        throw new ErrorMascotas('medio', 'Elige un medio de pago válido.')
      }

      const lote = construirConManejo(() =>
        construirLoteRecompra(
          {
            hogarId: alcance.hogarId,
            actorId: alcance.miembroId,
            itemId: item.id,
            itemMascotaId: item.mascotaId,
            mascotaId: item.mascotaId ?? entrada.mascotaId,
            categoriaId: item.categoriaId,
            fecha: entrada.fecha,
            descripcion: entrada.descripcion || item.nombre,
            monto: entrada.monto,
            ambito: entrada.ambito,
            pago: pagoDesdeMedio(medio, entrada.cuotas),
            actualizarMontoHabitual: entrada.actualizarMontoHabitual,
          },
          nuevoId,
        ),
      )

      return despachar(lote)
    },
  }
}
