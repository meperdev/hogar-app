import { esFechaCivil } from './fechas'
import {
  construirLoteCompra,
  ErrorLote,
  VERSION_ESQUEMA,
  type AmbitoCompra,
  type FilaCompra,
  type FilaCosto,
  type FilaCuota,
  type FilaPlan,
  type PagoCompra,
} from './loteCompra'
import type { EspecieMascota, OrigenNivel, TipoInsumo } from './mascotas'

export type CampoLoteMascotas =
  | 'nombre'
  | 'especie'
  | 'fechaNacimiento'
  | 'frecuenciaDias'
  | 'umbralAlertaPct'
  | 'montoHabitual'
  | 'nivelPct'
  | 'fecha'
  | 'mascota'
  | 'monto'
  | 'medio'
  | 'cuotas'
  | 'descripcion'
  | 'ambito'

export class ErrorLoteMascotas extends Error {
  readonly campo: CampoLoteMascotas

  constructor(campo: CampoLoteMascotas, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorLoteMascotas'
    this.campo = campo
  }
}

export type FilaMascota = {
  id: string
  nombre: string
  especie: EspecieMascota
  fecha_nacimiento: string | null
  activa: true
}

export type FilaItemDespensa = {
  id: string
  mascota_id: string | null
  nombre: string
  tipo: TipoInsumo
  categoria_id: string
  frecuencia_dias: number | null
  umbral_alerta_pct: number
  monto_habitual: number | null
  activo: true
}

export type FilaNivelDespensa = {
  id: string
  item_despensa_id: string
  compra_id: string | null
  fecha: string
  nivel_pct: number
  origen: OrigenNivel
}

export type FilaCompraDespensa = FilaCompra & {
  item_despensa_id: string
  mascota_id: string | null
}

export type LoteMascota = {
  lote_id: string
  hogar_id: string
  schema_version: typeof VERSION_ESQUEMA
  tipo: 'mascota'
  filas: { mascota: [FilaMascota] }
}

export type LoteItemDespensa = {
  lote_id: string
  hogar_id: string
  schema_version: typeof VERSION_ESQUEMA
  tipo: 'item_despensa'
  filas: { item_despensa: [FilaItemDespensa] }
}

export type LoteAjusteNivel = {
  lote_id: string
  hogar_id: string
  schema_version: typeof VERSION_ESQUEMA
  tipo: 'ajuste_nivel'
  filas: { nivel_despensa: [FilaNivelDespensa] }
}

export type LoteRecompra = {
  lote_id: string
  hogar_id: string
  schema_version: typeof VERSION_ESQUEMA
  tipo: 'recompra'
  actualizar_monto_habitual: boolean
  filas: {
    compra: [FilaCompraDespensa]
    plan_de_cuotas: FilaPlan[]
    cuota: FilaCuota[]
    costo_financiero: FilaCosto[]
    nivel_despensa: [FilaNivelDespensa]
  }
}

export type LoteMascotas = LoteMascota | LoteItemDespensa | LoteAjusteNivel | LoteRecompra

function validarNombreVisible(nombre: string, etiqueta: string): string {
  const limpio = nombre.trim()
  if (limpio.length < 1 || limpio.length > 120) {
    throw new ErrorLoteMascotas('nombre', `Ingresa ${etiqueta} entre 1 y 120 caracteres`)
  }
  return limpio
}

export function construirLoteMascota(
  e: {
    hogarId: string
    nombre: string
    especie: EspecieMascota
    fechaNacimiento: string | null
  },
  nuevoId: () => string,
): LoteMascota {
  const nombre = validarNombreVisible(e.nombre, 'el nombre de la mascota')
  if (e.fechaNacimiento !== null && !esFechaCivil(e.fechaNacimiento)) {
    throw new ErrorLoteMascotas('fechaNacimiento', 'La fecha de nacimiento no es válida')
  }
  return {
    lote_id: nuevoId(),
    hogar_id: e.hogarId,
    schema_version: VERSION_ESQUEMA,
    tipo: 'mascota',
    filas: {
      mascota: [
        {
          id: nuevoId(),
          nombre,
          especie: e.especie,
          fecha_nacimiento: e.fechaNacimiento,
          activa: true,
        },
      ],
    },
  }
}

export function construirLoteItemDespensa(
  e: {
    hogarId: string
    mascotaId: string | null
    nombre: string
    tipo: TipoInsumo
    categoriaId: string
    frecuenciaDias: number | null
    umbralAlertaPct: number
    montoHabitual: number | null
  },
  nuevoId: () => string,
): LoteItemDespensa {
  const nombre = validarNombreVisible(e.nombre, 'el nombre del insumo')
  if (
    e.frecuenciaDias !== null
    && (!Number.isSafeInteger(e.frecuenciaDias) || e.frecuenciaDias <= 0 || e.frecuenciaDias > 32767)
  ) {
    throw new ErrorLoteMascotas('frecuenciaDias', 'La frecuencia en días debe ser mayor a 0')
  }
  if (!Number.isSafeInteger(e.umbralAlertaPct) || e.umbralAlertaPct < 0 || e.umbralAlertaPct > 100) {
    throw new ErrorLoteMascotas('umbralAlertaPct', 'El umbral de alerta debe estar entre 0 y 100 %')
  }
  if (e.montoHabitual !== null && (!Number.isSafeInteger(e.montoHabitual) || e.montoHabitual <= 0)) {
    throw new ErrorLoteMascotas('montoHabitual', 'El monto habitual debe ser un entero mayor a $0')
  }

  return {
    lote_id: nuevoId(),
    hogar_id: e.hogarId,
    schema_version: VERSION_ESQUEMA,
    tipo: 'item_despensa',
    filas: {
      item_despensa: [
        {
          id: nuevoId(),
          mascota_id: e.mascotaId,
          nombre,
          tipo: e.tipo,
          categoria_id: e.categoriaId,
          frecuencia_dias: e.frecuenciaDias,
          umbral_alerta_pct: e.umbralAlertaPct,
          monto_habitual: e.montoHabitual,
          activo: true,
        },
      ],
    },
  }
}

export function construirLoteAjusteNivel(
  e: {
    hogarId: string
    itemDespensaId: string
    fecha: string
    nivelPct: number
  },
  nuevoId: () => string,
): LoteAjusteNivel {
  if (!esFechaCivil(e.fecha)) {
    throw new ErrorLoteMascotas('fecha', 'La fecha del ajuste no es válida')
  }
  if (!Number.isSafeInteger(e.nivelPct) || e.nivelPct < 0 || e.nivelPct > 100) {
    throw new ErrorLoteMascotas('nivelPct', 'El nivel observado debe estar entre 0 y 100 %')
  }

  return {
    lote_id: nuevoId(),
    hogar_id: e.hogarId,
    schema_version: VERSION_ESQUEMA,
    tipo: 'ajuste_nivel',
    filas: {
      nivel_despensa: [
        {
          id: nuevoId(),
          item_despensa_id: e.itemDespensaId,
          compra_id: null,
          fecha: e.fecha,
          nivel_pct: e.nivelPct,
          origen: 'ajuste',
        },
      ],
    },
  }
}

export function construirLoteRecompra(
  e: {
    hogarId: string
    actorId: string
    itemId: string
    itemMascotaId: string | null
    mascotaId: string | null
    categoriaId: string
    fecha: string
    descripcion: string
    monto: number
    ambito: AmbitoCompra
    pago: PagoCompra
    actualizarMontoHabitual: boolean
  },
  nuevoId: () => string,
): LoteRecompra {
  if (e.itemMascotaId !== null && e.mascotaId !== e.itemMascotaId) {
    throw new ErrorLoteMascotas('mascota', 'La mascota debe coincidir con la del insumo')
  }
  // I23: una compra personal nunca actualiza el monto habitual compartido.
  if (e.ambito === 'personal' && e.actualizarMontoHabitual) {
    throw new ErrorLoteMascotas(
      'ambito',
      'Una compra personal no puede modificar el monto habitual compartido del insumo',
    )
  }

  let base
  try {
    base = construirLoteCompra(
      {
        hogarId: e.hogarId,
        actorId: e.actorId,
        fecha: e.fecha,
        descripcion: e.descripcion,
        monto: e.monto,
        categoriaId: e.categoriaId,
        ambito: e.ambito,
        pago: e.pago,
        factura: null,
        alias: null,
      },
      nuevoId,
    )
  } catch (error) {
    if (error instanceof ErrorLote) {
      throw new ErrorLoteMascotas(error.campo, error.message)
    }
    throw error
  }

  const compraBase = base.filas.compra[0]
  return {
    lote_id: base.lote_id,
    hogar_id: e.hogarId,
    schema_version: VERSION_ESQUEMA,
    tipo: 'recompra',
    actualizar_monto_habitual: e.ambito === 'hogar' ? e.actualizarMontoHabitual : false,
    filas: {
      compra: [
        {
          ...compraBase,
          item_despensa_id: e.itemId,
          mascota_id: e.mascotaId,
        },
      ],
      plan_de_cuotas: base.filas.plan_de_cuotas,
      cuota: base.filas.cuota,
      costo_financiero: base.filas.costo_financiero,
      nivel_despensa: [
        {
          id: nuevoId(),
          item_despensa_id: e.itemId,
          compra_id: compraBase.id,
          fecha: compraBase.fecha,
          nivel_pct: 100,
          origen: 'compra',
        },
      ],
    },
  }
}
