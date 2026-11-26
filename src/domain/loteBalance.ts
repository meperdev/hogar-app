import { esPeriodo } from './agenda'
import { esFechaCivil } from './fechas'

export type TipoLoteBalance =
  | 'aporte'
  | 'ingreso'
  | 'recepcion_ingreso'
  | 'hogar_preferencia'

export type LoteBalance = {
  lote_id: string
  hogar_id: string
  schema_version: 1
  tipo: TipoLoteBalance
  filas: Record<string, Record<string, unknown>[]>
}

export class ErrorLoteBalance extends Error {
  readonly campo: string

  constructor(campo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorLoteBalance'
    this.campo = campo
  }
}

const enteroPositivo = (n: number) => Number.isSafeInteger(n) && n > 0

function crearLote(
  hogarId: string,
  tipo: TipoLoteBalance,
  filas: LoteBalance['filas'],
  nuevoId: () => string,
): LoteBalance {
  return { lote_id: nuevoId(), hogar_id: hogarId, schema_version: 1, tipo, filas }
}

export type EntradaAporte = {
  hogarId: string
  medioOrigenId: string
  origenEsMiembro: boolean
  medioDestinoId: string
  destinoEsHogar: boolean
  monto: number
  fecha: string
  nota: string
}

export function validarEntradaAporte(
  e: EntradaAporte,
): { campo: string; mensaje: string } | null {
  if (!e.medioOrigenId || !e.origenEsMiembro) {
    return { campo: 'medioOrigen', mensaje: 'Elige el medio de un miembro como origen' }
  }
  if (!e.medioDestinoId || !e.destinoEsHogar) {
    return {
      campo: 'medioDestino',
      mensaje: 'El destino debe ser un medio del hogar',
    }
  }
  if (!enteroPositivo(e.monto)) {
    return { campo: 'monto', mensaje: 'Ingresa un monto entero mayor a $0' }
  }
  if (!esFechaCivil(e.fecha)) {
    return { campo: 'fecha', mensaje: 'La fecha no es válida' }
  }
  return null
}

export function construirLoteAporte(
  e: EntradaAporte,
  nuevoId: () => string,
): LoteBalance {
  const error = validarEntradaAporte(e)
  if (error) throw new ErrorLoteBalance(error.campo, error.mensaje)
  return crearLote(
    e.hogarId,
    'aporte',
    {
      aporte: [
        {
          id: nuevoId(),
          medio_origen_id: e.medioOrigenId,
          medio_destino_id: e.medioDestinoId,
          monto: e.monto,
          fecha: e.fecha,
          nota: e.nota.trim() || null,
        },
      ],
    },
    nuevoId,
  )
}

export type EntradaIngreso =
  | {
      hogarId: string
      miembroId: string
      tipo: 'fijo'
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
      hogarId: string
      miembroId: string
      tipo: 'variable'
      descripcion: string
      monto: number
      fecha: string
    }

export function validarEntradaIngreso(
  e: EntradaIngreso,
): { campo: string; mensaje: string } | null {
  if (!e.miembroId) {
    return { campo: 'miembro', mensaje: 'Elige el miembro del hogar' }
  }
  if (e.descripcion.trim() === '') {
    return { campo: 'descripcion', mensaje: 'Escribe una descripción del ingreso' }
  }
  if (!enteroPositivo(e.monto)) {
    return { campo: 'monto', mensaje: 'Ingresa un monto entero mayor a $0' }
  }
  if (e.tipo === 'fijo') {
    if (
      !Number.isInteger(e.diaEsperado) ||
      e.diaEsperado < 1 ||
      e.diaEsperado > 31
    ) {
      return {
        campo: 'diaEsperado',
        mensaje: 'El día esperado debe estar entre 1 y 31',
      }
    }
    if (!esFechaCivil(e.vigenteDesde)) {
      return { campo: 'vigenteDesde', mensaje: 'La fecha de vigencia no es válida' }
    }
    if (e.marcarRecibido) {
      if (!esPeriodo(e.marcarRecibido.periodo)) {
        return { campo: 'periodo', mensaje: 'El periodo no es válido' }
      }
      if (!esFechaCivil(e.marcarRecibido.fechaRecepcion)) {
        return {
          campo: 'fechaRecepcion',
          mensaje: 'La fecha de recepción no es válida',
        }
      }
      if (
        e.marcarRecibido.montoRecibido !== null &&
        !enteroPositivo(e.marcarRecibido.montoRecibido)
      ) {
        return {
          campo: 'montoRecibido',
          mensaje: 'El monto recibido debe ser mayor a $0',
        }
      }
    }
  } else if (!esFechaCivil(e.fecha)) {
    return { campo: 'fecha', mensaje: 'La fecha no es válida' }
  }
  return null
}

export function construirLoteIngreso(
  e: EntradaIngreso,
  nuevoId: () => string,
): LoteBalance {
  const error = validarEntradaIngreso(e)
  if (error) throw new ErrorLoteBalance(error.campo, error.mensaje)

  const id = nuevoId()
  if (e.tipo === 'variable') {
    return crearLote(
      e.hogarId,
      'ingreso',
      {
        ingreso: [
          {
            id,
            miembro_id: e.miembroId,
            tipo: 'variable',
            serie_id: null,
            descripcion: e.descripcion.trim(),
            monto: e.monto,
            dia_esperado: null,
            vigente_desde: null,
            vigente_hasta: null,
            fecha: e.fecha,
          },
        ],
      },
      nuevoId,
    )
  }

  const filas: LoteBalance['filas'] = {
    ingreso: [
      {
        id,
        miembro_id: e.miembroId,
        tipo: 'fijo',
        serie_id: id,
        descripcion: e.descripcion.trim(),
        monto: e.monto,
        dia_esperado: e.diaEsperado,
        vigente_desde: e.vigenteDesde,
        vigente_hasta: null,
        fecha: null,
      },
    ],
  }

  if (e.marcarRecibido) {
    const { periodo, fechaRecepcion, montoRecibido } = e.marcarRecibido
    filas.recepcion_ingreso = [
      {
        id: nuevoId(),
        ingreso_id: id,
        periodo,
        recibido: true,
        monto_recibido:
          montoRecibido !== null && montoRecibido !== e.monto
            ? montoRecibido
            : null,
        fecha_recepcion: fechaRecepcion,
      },
    ]
  }

  return crearLote(e.hogarId, 'ingreso', filas, nuevoId)
}

export type EntradaRecepcionIngreso = {
  hogarId: string
  ingresoId: string
  periodo: string
  montoEsperado: number
  montoRecibido: number | null
  fechaRecepcion: string
  recepcionExistente: { id: string; baseSeq: number } | null
}

export function construirLoteRecepcionIngreso(
  e: EntradaRecepcionIngreso,
  nuevoId: () => string,
): LoteBalance {
  if (!esPeriodo(e.periodo)) {
    throw new ErrorLoteBalance('periodo', 'El periodo no es válido')
  }
  if (!esFechaCivil(e.fechaRecepcion)) {
    throw new ErrorLoteBalance('fechaRecepcion', 'La fecha de recepción no es válida')
  }
  if (e.montoRecibido !== null && !enteroPositivo(e.montoRecibido)) {
    throw new ErrorLoteBalance(
      'montoRecibido',
      'El monto recibido debe ser mayor a $0',
    )
  }

  const montoGuardado =
    e.montoRecibido !== null && e.montoRecibido !== e.montoEsperado
      ? e.montoRecibido
      : null

  return crearLote(
    e.hogarId,
    'recepcion_ingreso',
    {
      recepcion_ingreso: [
        {
          id: e.recepcionExistente?.id ?? nuevoId(),
          base_seq: e.recepcionExistente?.baseSeq ?? null,
          ingreso_id: e.ingresoId,
          periodo: e.periodo,
          recibido: true,
          monto_recibido: montoGuardado,
          fecha_recepcion: e.fechaRecepcion,
        },
      ],
    },
    nuevoId,
  )
}

export function construirLoteMostrarPctIngreso(
  e: { hogarId: string; mostrarPctIngreso: boolean; baseSeq: number },
  nuevoId: () => string,
): LoteBalance {
  return crearLote(
    e.hogarId,
    'hogar_preferencia',
    {
      hogar: [
        {
          id: e.hogarId,
          base_seq: e.baseSeq,
          mostrar_pct_ingreso: e.mostrarPctIngreso,
        },
      ],
    },
    nuevoId,
  )
}
