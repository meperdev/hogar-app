import { calendarioTarjeta } from '../domain/cuotas'
import { esFechaCivil, hoyCivil } from '../domain/fechas'
import {
  construirLoteCompra,
  ErrorLote,
  MAX_CUOTAS,
  type EntradaLoteCompra,
  type LoteCompra,
  type PagoCompra,
} from '../domain/loteCompra'
import { formatearPesos } from '../domain/pesos'
import { parsearQrDian } from '../domain/qrDian'
import {
  VENTANA_DESHACER_MS,
  type AlcanceCompra,
  type Ambito,
  type BorradorCompra,
  type CatalogoCompra,
  type CompraExistente,
  type ControladorCompraRapida,
  type ErrorBorrador,
  type EstadoSincronizacion,
  type MedioOpcion,
} from './compraRapida'

/** Resumen local de una compra guardada en este dispositivo (dedupe y aviso de 60 s). */
export type RegistroLocal = {
  loteId: string
  compraId: string
  cufe: string | null
  fecha: string
  montoTotal: number
  descripcion: string
  categoriaId: string
  medioId: string | null
  /** ISO del reloj del dispositivo. */
  creadoEn: string
}

/**
 * Puerto de datos del núcleo. Lo implementa `src/data` con Dexie (copia local
 * por actor, outbox) y Supabase (lecturas por RLS y `sync_push`).
 */
export interface CompraRapidaPort {
  /** Catálogo visible para el actor; sin red, la última copia local. */
  cargarCatalogo(): Promise<CatalogoCompra>
  buscarAlias(nitComercio: string): Promise<{ nombreComercio: string; categoriaId: string | null } | null>
  /** Compra no eliminada con ese CUFE en el alcance del actor (local y, si hay red, servidor por RLS). */
  buscarPorCufe(cufe: string): Promise<CompraExistente | null>
  /** Guarda el lote en el outbox y su registro local en una sola transacción. */
  guardarLote(lote: LoteCompra, registro: RegistroLocal): Promise<void>
  /** Quita un lote aún no enviado y su registro. `false` si ya salió. */
  descartarLote(loteId: string): Promise<boolean>
  registrosDesde(desdeIso: string): Promise<RegistroLocal[]>
  /** Envía por `sync_push`, en orden, los lotes pendientes creados antes de esa marca. */
  enviarPendientes(creadosAntesDeIso: string): Promise<void>
  estadoSincronizacion(): Promise<EstadoSincronizacion>
  leerPreferencia(clave: string): Promise<string | null>
  guardarPreferencia(clave: string, valor: string): Promise<void>
}

export type DependenciasCompraRapida = {
  port: CompraRapidaPort
  alcance: AlcanceCompra
  ahora: () => Date
  /** UUIDv7 del cliente. */
  nuevoId: () => string
  programar: (tarea: () => void, ms: number) => void
}

export class ErrorCompraRapida extends Error {
  readonly error: ErrorBorrador

  constructor(error: ErrorBorrador) {
    super(error.mensaje)
    this.name = 'ErrorCompraRapida'
    this.error = error
  }
}

const VENTANA_DUPLICADO_MS = 60_000
const MENSAJES = {
  monto: 'Ingresa un monto mayor a $0',
  categoria: 'Elige una categoría para guardar',
  medio: 'Elige con qué pagaste',
  cuotas: 'Elige un número entero de cuotas (Otro: 2 o más)',
  fecha: 'La fecha no es válida',
} as const

export function clavePreferenciaUltimoMedio(miembroId: string): string {
  return `ultimo_medio_de_pago_id:${miembroId}`
}

export function mediosPara(catalogo: CatalogoCompra, ambito: Ambito): MedioOpcion[] {
  return catalogo.medios.filter((medio) => medio.tipo === 'medio' || medio.ambito === ambito)
}

function medioElegido(b: BorradorCompra, catalogo: CatalogoCompra): MedioOpcion | null {
  return mediosPara(catalogo, b.ambito).find((medio) => medio.id === b.medioId) ?? null
}

function pagoDe(medio: MedioOpcion, cuotas: number): PagoCompra {
  switch (medio.tipo) {
    case 'medio':
      return { tipo: 'medio', medioDePagoId: medio.id }
    case 'prestamo':
      return {
        tipo: 'prestamo',
        pasivoId: medio.id,
        ambito: medio.ambito,
        disponible: medio.disponible,
        fechaGiro: medio.fechaGiro,
      }
    case 'tarjeta':
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
}

function entradaDe(
  b: BorradorCompra,
  catalogo: CatalogoCompra,
  alcance: AlcanceCompra,
): { entrada: EntradaLoteCompra; medio: MedioOpcion; categoria: string } | ErrorBorrador {
  if (!Number.isSafeInteger(b.monto) || b.monto <= 0) return { campo: 'monto', mensaje: MENSAJES.monto }
  const categoria = catalogo.categorias.find((c) => c.id === b.categoriaId)
  if (!categoria) return { campo: 'categoria', mensaje: MENSAJES.categoria }
  const medio = medioElegido(b, catalogo)
  if (!medio) return { campo: 'medio', mensaje: MENSAJES.medio }
  if (!esFechaCivil(b.fecha)) return { campo: 'fecha', mensaje: MENSAJES.fecha }
  if (medio.tipo === 'tarjeta' && (!Number.isSafeInteger(b.cuotas) || b.cuotas < 1 || b.cuotas > MAX_CUOTAS)) {
    return { campo: 'cuotas', mensaje: MENSAJES.cuotas }
  }
  const factura = b.factura
  return {
    medio,
    categoria: categoria.nombre,
    entrada: {
      hogarId: alcance.hogarId,
      actorId: alcance.miembroId,
      fecha: b.fecha,
      descripcion: b.descripcion.trim() || categoria.nombre,
      monto: b.monto,
      categoriaId: categoria.id,
      ambito: b.ambito,
      pago: pagoDe(medio, medio.tipo === 'tarjeta' ? b.cuotas : 1),
      factura: factura
        ? { origen: factura.origen, cufe: factura.cufe, nitComercio: factura.nitComercio, iva: factura.iva }
        : null,
      alias: null,
    },
  }
}

function construir(entrada: EntradaLoteCompra, nuevoId: () => string): LoteCompra | ErrorBorrador {
  try {
    return construirLoteCompra(entrada, nuevoId)
  } catch (error) {
    if (error instanceof ErrorLote) return { campo: error.campo, mensaje: error.message }
    throw error
  }
}

function esError(x: object): x is ErrorBorrador {
  return 'campo' in x && 'mensaje' in x
}

/** Stub de "Recomprar" desde la despensa (núcleo 4): solo prellena el borrador. */
export function prellenarRecompra(
  borrador: BorradorCompra,
  item: { nombre: string; montoHabitual: number | null; categoriaId: string; mascotaNombre: string | null },
): BorradorCompra {
  return {
    ...borrador,
    ambito: 'hogar',
    monto: item.montoHabitual ?? 0,
    categoriaId: item.categoriaId,
    descripcion: item.mascotaNombre ? `${item.nombre} · ${item.mascotaNombre}` : item.nombre,
  }
}

export function crearControladorCompraRapida(d: DependenciasCompraRapida): ControladorCompraRapida {
  const { port, alcance } = d
  const clave = clavePreferenciaUltimoMedio(alcance.miembroId)
  const marcaEnvio = () => new Date(d.ahora().getTime() - VENTANA_DESHACER_MS).toISOString()
  const enviar = () => {
    port.enviarPendientes(marcaEnvio()).catch(() => {
      // Sin red o servidor caído: el lote sigue en el outbox y sale en el próximo disparador.
    })
  }

  const validar = (b: BorradorCompra, catalogo: CatalogoCompra): ErrorBorrador | null => {
    const armada = entradaDe(b, catalogo, alcance)
    if (esError(armada)) return armada
    const lote = construir(armada.entrada, () => 'validacion')
    return esError(lote) ? lote : null
  }

  return {
    async cargar() {
      const [catalogo, ultimoMedioId] = await Promise.all([port.cargarCatalogo(), port.leerPreferencia(clave)])
      enviar()
      const existe = catalogo.medios.some((medio) => medio.id === ultimoMedioId)
      return { catalogo, ultimoMedioId: existe ? ultimoMedioId : null }
    },

    borradorInicial(ultimoMedioId) {
      return {
        ambito: 'hogar',
        monto: 0,
        categoriaId: null,
        fecha: hoyCivil(d.ahora()),
        descripcion: '',
        medioId: ultimoMedioId,
        cuotas: 1,
        factura: null,
        nombreComercio: null,
      }
    },

    mediosPara,

    validar,

    desglose(b, catalogo) {
      const medio = medioElegido(b, catalogo)
      if (medio?.tipo !== 'tarjeta') return null
      if (!Number.isSafeInteger(b.monto) || b.monto <= 0) return null
      if (!Number.isSafeInteger(b.cuotas) || b.cuotas < 1 || b.cuotas > MAX_CUOTAS || b.monto < b.cuotas) return null
      if (!esFechaCivil(b.fecha)) return null
      const calendario = calendarioTarjeta({
        fechaCompra: b.fecha,
        monto: b.monto,
        nCuotas: b.cuotas,
        diaCorte: medio.diaCorte,
        diaPago: medio.diaPago,
        tasa: medio.tasa,
      })
      return {
        consumoHoy: b.monto,
        cuotas: calendario.cuotas,
        interesTotal: calendario.interesTotal,
        tasaMensualPct: calendario.tasaMensual === null ? null : calendario.tasaMensual * 100,
      }
    },

    async posibleDuplicado(b) {
      const desde = new Date(d.ahora().getTime() - VENTANA_DUPLICADO_MS).toISOString()
      const recientes = await port.registrosDesde(desde)
      return recientes.some(
        (r) => r.montoTotal === b.monto && r.categoriaId === b.categoriaId && r.medioId === b.medioId,
      )
    },

    async guardar(b, catalogo) {
      const armada = entradaDe(b, catalogo, alcance)
      if (esError(armada)) throw new ErrorCompraRapida(armada)
      const { entrada, medio, categoria } = armada

      // El alias se crea una sola vez: si el NIT ya tiene uno, el lote no lo
      // repite (el servidor rechazaría la compra entera por duplicado).
      const nit = entrada.factura?.nitComercio ?? null
      const nombre = b.nombreComercio?.trim() ?? ''
      if (entrada.ambito === 'hogar' && nit !== null && nombre !== '' && !(await port.buscarAlias(nit))) {
        entrada.alias = { nombre, categoriaSugeridaId: entrada.categoriaId }
      }

      const lote = construir(entrada, d.nuevoId)
      if (esError(lote)) throw new ErrorCompraRapida(lote)
      const [compra] = lote.filas.compra
      await port.guardarLote(lote, {
        loteId: lote.lote_id,
        compraId: compra.id,
        cufe: compra.cufe,
        fecha: compra.fecha,
        montoTotal: compra.monto_total,
        descripcion: compra.descripcion,
        categoriaId: compra.categoria_id,
        medioId: medio.id,
        creadoEn: d.ahora().toISOString(),
      })
      await port.guardarPreferencia(clave, medio.id)
      d.programar(enviar, VENTANA_DESHACER_MS + 100)

      const cuotas = lote.filas.cuota.length
      const detalleCuotas = cuotas > 1 ? ` en ${cuotas} cuotas` : ''
      return {
        loteId: lote.lote_id,
        resumen: `Guardado: ${categoria} ${formatearPesos(compra.monto_total)}${detalleCuotas} · ${medio.nombre}`,
      }
    },

    async deshacer(loteId) {
      if (!(await port.descartarLote(loteId))) {
        throw new Error('La compra ya se sincronizó y no se puede deshacer aquí')
      }
    },

    async escanear(texto) {
      const qr = parsearQrDian(texto)
      if (qr.formato === 'invalido') return { estado: 'invalido', mensaje: qr.motivo }

      const existente = await port.buscarPorCufe(qr.cufe)
      if (existente) return { estado: 'duplicado', existente, urlVerificacion: qr.urlVerificacion }

      const campos = qr.formato === 'campos' ? qr : null
      const nit = campos?.nitComercio ?? null
      return {
        estado: 'precargado',
        formato: qr.formato,
        factura: {
          origen: 'qr',
          cufe: qr.cufe,
          nitComercio: nit,
          fecha: campos?.fecha ?? null,
          montoTotal: campos?.montoTotal ?? null,
          iva: campos?.iva ?? null,
          urlVerificacion: qr.urlVerificacion,
        },
        sugerencia: nit === null ? null : await port.buscarAlias(nit),
      }
    },

    sincronizacion() {
      return port.estadoSincronizacion()
    },
  }
}
