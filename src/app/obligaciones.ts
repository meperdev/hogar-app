/**
 * Contrato de la capa `app` para el núcleo 2 (Obligaciones del mes).
 *
 * La UI (`src/ui/**`) solo habla con `ControladorObligaciones`. Montos en pesos
 * enteros COP; fechas civiles `YYYY-MM-DD` (America/Bogota); periodos `YYYY-MM`.
 * Todo lo que devuelve `cargarMes` es DERIVADO de los hechos: nada se guarda.
 *
 * Referencias: docs/flows/obligaciones-del-mes.md, docs/data-model.md §3.6,
 * §3.8–§3.11, §3.15, §8 y §9.
 */

import type { Ambito } from './compraRapida'

export type { Ambito }

export type EstadoCuota = 'pagada' | 'parcial' | 'pendiente' | 'vencida'
export type EstadoObligacion = 'pagada' | 'pendiente' | 'vencida'

/** Titular visible de un pasivo: un miembro o el hogar. */
export type Titular = { tipo: 'miembro'; miembroId: string; nombre: string } | { tipo: 'hogar' }

export type ItemCuota = {
  tipo: 'cuota'
  cuotaId: string
  pasivoId: string
  pasivoNombre: string
  pasivoTipo: 'tarjeta' | 'credito' | 'deuda'
  ambito: Ambito
  titular: Titular
  /** Ej. "Mercado Éxito" (descripción de la compra) o el nombre del pasivo. */
  descripcion: string
  numero: number
  nCuotas: number
  fechaVencimiento: string
  capital: number
  /** Interés con `cuota_id` (balde Costo financiero); `null` = sin interés. */
  interes: number | null
  interesOrigen: 'calculado' | 'manual' | null
  /** Estado FIFO derivado. `restante` = lo que falta cubrir de capital + interés. */
  estado: EstadoCuota
  restante: number
  /** Pago completo enlazado a esta cuota, si existe. */
  pagoEnlazado: { fecha: string; monto: number; registradoPor: string } | null
}

export type ItemObligacion = {
  tipo: 'obligacion'
  obligacionId: string
  nombre: string
  categoriaNombre: string
  periodo: string
  fechaVencimiento: string
  montoEstimado: number | null
  estado: EstadoObligacion
  /** Compra que la cerró (por `periodo`, aunque su `fecha` sea de otro mes). */
  pago: { fecha: string; monto: number } | null
}

export type ItemAgenda = ItemCuota | ItemObligacion

export type AbonoPasivoItem = {
  id: string
  fecha: string
  monto: number
  medioDePagoId?: string | null | undefined
  medioNombre: string
  registradoPor: string
  nota: string | null
  tipo: 'abono' | 'saldo_a_favor'
  incluirEnGastos?: boolean | undefined
  categoriaGastoId?: string | null | undefined
  categoriaGastoNombre?: string | null | undefined
}

export type ItemPasivoSaldo = {
  pasivoId: string
  nombre: string
  tipo: 'tarjeta' | 'credito' | 'deuda'
  ambito: Ambito
  titular: Titular
  saldoPendiente: number
  tieneSinCalendario: boolean
  tieneComprasRegistradas?: boolean | undefined
  cuotasAbiertasMes?: number | undefined
  abonos?: AbonoPasivoItem[] | undefined
}

/** Las tres tarjetas: derivadas, nunca guardadas ni sumadas entre sí. */
export type ResumenMes = {
  periodo: string
  /** Σ Compra.monto_total del hogar con `fecha` en el mes (+ personales propias si la vista lo pide). */
  consumoReal: number
  /** Capital de cuotas del mes ya cubierto por PagoDeDeuda (FIFO). */
  capitalPagado: number
  /** Capital de cuotas del mes que aún no salió de caja. */
  capitalPendiente: number
  /** Σ CostoFinanciero del hogar causado en el mes (balde aparte). */
  costoFinanciero: number
}

export type AgendaMes = {
  resumen: ResumenMes
  vencidas: ItemAgenda[]
  pendientes: ItemAgenda[]
  pagadas: ItemAgenda[]
  pasivos?: ItemPasivoSaldo[] | undefined
  categorias?: { id: string; nombre: string }[] | undefined
}

export type MedioPagoOpcion = {
  id: string
  nombre: string
  /** `null` = medio del hogar (Cuenta común): no hay aporte individual. */
  duenoMiembroId: string | null
}

/** Borrador de "Registrar pago" de una cuota o de un pago libre a un pasivo. */
export type BorradorPago = {
  pasivoId: string
  /** Enlace declarativo a la cuota que el pago cubre completa; `null` = adelanto o parcial. */
  cuotaId: string | null
  medioId: string | null
  fecha: string
  /** Capital que se aplica (editable: parcial o extraordinario). */
  capital: number
  /**
   * Interés ligado a la cuota. Editable contra el extracto: si cambia frente a
   * la estimación `calculado`, se guarda con `origen='manual'`. `null` = sin tasa.
   */
  interes: number | null
  nota: string
  incluirEnGastos?: boolean | undefined
  categoriaGastoId?: string | null | undefined
}

export type EditarPagoEntrada = {
  pagoId: string
  monto: number
  fecha: string
  medioId: string
  nota: string
  incluirEnGastos: boolean
  categoriaGastoId: string | null
}

export type Aporte = { miembroId: string; monto: number } | null

/** Resultado de evaluar un pago antes de guardarlo (I20). */
export type EvaluacionPago =
  | {
      estado: 'valido'
      monto: number
      saldoAntes: number
      saldoDespues: number
      capitalAplicado: number
      aporte: Aporte
    }
  /** "▲ Posible pago duplicado": no se puede confirmar ni dividir. */
  | { estado: 'duplicado'; existente: { fecha: string; monto: number; registradoPor: string } }
  /**
   * "▲ Posible pago duplicado o sobrepago": solo con confirmación explícita se
   * divide en `abono` hasta `tope` + `saldo_a_favor` por `excedente`.
   */
  | { estado: 'sobrepago'; monto: number; tope: number; excedente: number; aporte: Aporte }
  | { estado: 'invalido'; campo: 'medio' | 'monto' | 'fecha' | 'interes'; mensaje: string }

export type ResultadoRegistro = { loteId: string; resumen: string }

export type PlanCapitalBorrador =
  | null
  | {
      origen: 'saldo_inicial' | 'desembolso'
      capital: number
      fechaInicio: string
      /** `sin_calendario` por defecto: sin inventar cuotas. */
      calendario: null | { nCuotas: number; fechaPrimeraCuota: string }
    }

export type BorradorPasivo = {
  tipo: 'tarjeta' | 'credito' | 'deuda'
  nombre: string
  ambito: Ambito
  /** Tarjeta y crédito: siempre un miembro. Deuda: miembro u hogar (`null`). */
  titularMiembroId: string | null
  /** `null` = "Sin tasa" (preseleccionado). Porcentaje con decimales, ej. 28.32. */
  tasa: null | { tipo: 'EA' | 'MV'; porcentaje: number }
  tarjeta: null | { diaCorte: number; diaPago: number; ultimos4: string | null; cupo: number | null }
  credito: null | { entidad: string; referencia: string | null }
  deuda: null | { acreedor: string }
  plan: PlanCapitalBorrador
}

export type ErrorFormulario = { campo: string; mensaje: string }

export type BorradorPagoObligacion = {
  obligacionId: string
  periodo: string
  medioId: string | null
  fecha: string
  monto: number
}

export interface ControladorObligaciones {
  /** Agenda y tarjetas del mes; `incluirPersonales` es la preferencia local. */
  cargarMes(periodo: string): Promise<AgendaMes>
  leerIncluirPersonales(): Promise<boolean>
  /** Preferencia LOCAL del dispositivo: no se sincroniza y no altera aportes. */
  guardarIncluirPersonales(valor: boolean): Promise<void>
  medios(): Promise<MedioPagoOpcion[]>

  /** Borrador precargado para pagar una cuota completa en su vencimiento. */
  prepararPagoCuota(cuotaId: string): Promise<BorradorPago>
  prepararPagoPasivo(pasivoId: string): Promise<BorradorPago>
  evaluarPago(borrador: BorradorPago): Promise<EvaluacionPago>
  /** `dividirSobrepago` solo tras la confirmación explícita del aviso de sobrepago. */
  registrarPago(borrador: BorradorPago, opciones: { dividirSobrepago: boolean }): Promise<ResultadoRegistro>
  editarPago?(entrada: EditarPagoEntrada): Promise<void>
  eliminarPago?(pagoId: string): Promise<void>

  registrarPagoObligacion(borrador: BorradorPagoObligacion): Promise<ResultadoRegistro>

  /** Equivalencia exacta E.A. ⇄ M.V. para mostrar en el formulario. */
  equivalenciaTasa(tasa: { tipo: 'EA' | 'MV'; porcentaje: number }): { ea: number; mv: number }
  validarPasivo(borrador: BorradorPasivo): ErrorFormulario | null
  crearPasivo(borrador: BorradorPasivo): Promise<ResultadoRegistro>
  eliminarPasivo(pasivoId: string): Promise<{ accion: 'eliminado' | 'archivado'; resumen: string }>
}
