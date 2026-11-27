/**
 * Contrato de la capa `app` para el núcleo 1 (compra rápida).
 *
 * La UI (`src/ui/**`) solo habla con `ControladorCompraRapida`; nunca con
 * Dexie ni Supabase. Todos los montos son pesos enteros COP (`number` entero
 * seguro, sin centavos). Las fechas son civiles `YYYY-MM-DD` en America/Bogota.
 *
 * Referencias: docs/flows/compra-rapida.md, docs/data-model.md §3.7–§3.11,
 * §3.16 y §9, docs/dian-qr.md.
 */

export type Ambito = 'hogar' | 'personal'

/** Alcance del actor: hogar y miembro autenticado en el dispositivo. */
export type AlcanceCompra = { hogarId: string; miembroId: string }

export type CategoriaOpcion = {
  id: string
  nombre: string
  icono: string | null
  orden: number
}

export type ComercioOpcion = {
  id: string
  nombre: string
  categoriaSugeridaId: string | null
}

export type TasaPasivo = { tipo: 'EA' | 'MV'; ppm: number }

/**
 * Opción del selector de medio. `id` es el id de la opción en su tabla
 * (`medio_de_pago.id` o `pasivo.id`); es lo que se recuerda como último medio.
 * - `medio`: MedioDePago de contado (efectivo o cuenta). Sin cuotas.
 * - `tarjeta`: Pasivo tipo tarjeta. Muestra chips de cuotas 1/3/6/12/Otro.
 * - `prestamo`: Pasivo crédito o deuda con desembolso (opción "Financiada con
 *   préstamo"). Sin cuotas; no crea plan ni suma aporte.
 * `ambito` indica en qué ámbito de compra se puede usar: un libro personal
 * solo sirve para compras personales de su dueño y uno del hogar solo para
 * compras del hogar. Un `MedioDePago` sirve para los dos ámbitos.
 */
export type MedioOpcion =
  | { tipo: 'medio'; id: string; nombre: string; ambito: null }
  | {
      tipo: 'tarjeta'
      id: string
      nombre: string
      ambito: Ambito
      ultimos4: string | null
      diaCorte: number
      diaPago: number
      /** `null` = "Sin tasa": no se calculan intereses. */
      tasa: TasaPasivo | null
    }
  | {
      tipo: 'prestamo'
      id: string
      nombre: string
      ambito: Ambito
      /** Capital desembolsado aún no gastado en compras vinculadas (derivado). */
      disponible: number
      /** Fecha del primer giro: una compra anterior se rechaza. */
      fechaGiro: string
    }

export type CatalogoCompra = {
  categorias: CategoriaOpcion[]
  medios: MedioOpcion[]
  comercios?: ComercioOpcion[] | undefined
}

/** Datos leídos de una factura electrónica (QR DIAN, OCR o manual). */
export type DatosFactura = {
  origen: 'qr' | 'ocr'
  cufe: string
  /** `NitFac` tal como viene; `null` si el QR solo trae la URL. */
  nitComercio: string | null
  fecha: string | null
  montoTotal: number | null
  /** IVA incluido, informativo: nunca se suma aparte. */
  iva: number | null
  /** Enlace opcional "Verificar en la DIAN" (solo dominios de la DIAN). */
  urlVerificacion: string | null
}

/** Estado editable de la pantalla. La UI lo construye; el controlador lo valida. */
export type BorradorCompra = {
  ambito: Ambito
  monto: number
  categoriaId: string | null
  /** Hoy en America/Bogota si no se cambia (`hoyCivil()`). */
  fecha: string
  descripcion: string
  /** Id de la `MedioOpcion` elegida. */
  medioId: string | null
  /** 1 por defecto. Solo cuenta si el medio es `tarjeta`; `Otro` exige >= 2. */
  cuotas: number
  factura: DatosFactura | null
  /**
   * Nombre del comercio para crear `AliasComercio` al guardar (solo si la
   * compra es del hogar y el NIT no tenía alias). Se ignora en personales.
   */
  nombreComercio: string | null
}

export type CampoInvalido = 'monto' | 'categoria' | 'medio' | 'cuotas' | 'fecha' | 'descripcion'

/** Mensajes en español listos para `aria-live`. */
export type ErrorBorrador = { campo: CampoInvalido; mensaje: string }

export type CuotaDesglose = {
  numero: number
  fechaVencimiento: string
  capital: number
  /** Interés estimado (balde Costo financiero); `null` si la tarjeta no tiene tasa. */
  interes: number | null
}

/** Desglose sin doble conteo para la variante a cuotas (solo tarjeta). */
export type DesgloseCuotas = {
  consumoHoy: number
  cuotas: CuotaDesglose[]
  /** `null` = "Sin tasa: registrarás intereses a mano en Obligaciones". */
  interesTotal: number | null
  /** Tasa mensual en porcentaje (ej. 2.0997), solo para mostrar. */
  tasaMensualPct: number | null
}

export type ResultadoGuardar = {
  loteId: string
  /** Ej. "Guardado: Mercado $85.000 · Visa ••4521". */
  resumen: string
}

export type CompraExistente = { fecha: string; montoTotal: number; descripcion: string }

export type ResultadoEscaneo =
  | {
      estado: 'precargado'
      formato: 'campos' | 'url'
      factura: DatosFactura
      /** Sugerencia de `AliasComercio` para el NIT, si existe. */
      sugerencia: { nombreComercio: string; categoriaId: string | null } | null
    }
  /** Ya existe en compras del hogar o personales propias. Nunca revela ajenas. */
  | { estado: 'duplicado'; existente: CompraExistente; urlVerificacion: string | null }
  | { estado: 'invalido'; mensaje: string }

export type EstadoSincronizacion = {
  pendientes: number
  /** Lotes rechazados por el servidor (ej. factura duplicada), con su motivo. */
  rechazados: { loteId: string; motivo: string }[]
}

/**
 * Lo que la UI usa. Se obtiene con `servicios.compras(alcance)`.
 */
export interface ControladorCompraRapida {
  /** Catálogo (online o copia local) y último medio recordado en el dispositivo. */
  cargar(): Promise<{ catalogo: CatalogoCompra; ultimoMedioId: string | null }>
  /** Borrador inicial: ámbito hogar, monto 0, 1 cuota, hoy, último medio. */
  borradorInicial(ultimoMedioId: string | null): BorradorCompra
  /** Medios usables para el ámbito elegido. */
  mediosPara(catalogo: CatalogoCompra, ambito: Ambito): MedioOpcion[]
  /** Primer error a mostrar, o `null` si se puede guardar. Puro y síncrono. */
  validar(borrador: BorradorCompra, catalogo: CatalogoCompra): ErrorBorrador | null
  /** Desglose de cuotas para tarjeta; `null` si el medio no es tarjeta. Puro. */
  desglose(borrador: BorradorCompra, catalogo: CatalogoCompra): DesgloseCuotas | null
  /** Aviso de posible duplicado inmediato (< 60 s, mismo monto, categoría y medio). */
  posibleDuplicado(borrador: BorradorCompra): Promise<boolean>
  /**
   * Guarda el lote atómico en el dispositivo y recuerda el medio. El envío al
   * servidor espera a que venza la ventana de Deshacer (5 s).
   */
  guardar(borrador: BorradorCompra, catalogo: CatalogoCompra): Promise<ResultadoGuardar>
  /** Deshace un guardado dentro de la ventana de 5 s. */
  deshacer(loteId: string): Promise<void>
  /** Lee el texto de un QR DIAN localmente; nunca consulta la DIAN. */
  escanear(textoQr: string): Promise<ResultadoEscaneo>
  sincronizacion(): Promise<EstadoSincronizacion>
}

/** Ventana de Deshacer en milisegundos. */
export const VENTANA_DESHACER_MS = 5000

/** Chips de cuotas de la UI. `Otro` abre un campo entero >= 2. */
export const CHIPS_CUOTAS = [1, 3, 6, 12] as const
