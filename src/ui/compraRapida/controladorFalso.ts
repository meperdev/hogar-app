import type {
  Ambito,
  BorradorCompra,
  CatalogoCompra,
  ControladorCompraRapida,
  DatosFactura,
  DesgloseCuotas,
  ErrorBorrador,
  MedioOpcion,
  ResultadoEscaneo,
  ResultadoGuardar,
  TasaPasivo,
} from '../../app/compraRapida'
import type { Hogar } from '../../app/fundacion'
import {
  esUrlDianValida,
  fechaHoyBogota,
  formatearCop,
} from './formatoCop'

const CATEGORIAS_SEMBRADAS = [
  { id: 'cat-mercado', nombre: 'Mercado', icono: 'cart', orden: 1 },
  { id: 'cat-mascotas', nombre: 'Mascotas', icono: 'paw', orden: 2 },
  { id: 'cat-transporte', nombre: 'Transporte', icono: 'bus', orden: 3 },
  { id: 'cat-arriendo', nombre: 'Arriendo', icono: 'home', orden: 4 },
  { id: 'cat-servicios', nombre: 'Servicios', icono: 'bolt', orden: 5 },
  { id: 'cat-hogar', nombre: 'Hogar', icono: 'sofa', orden: 6 },
  { id: 'cat-salud', nombre: 'Salud', icono: 'heart', orden: 7 },
  { id: 'cat-entretenimiento', nombre: 'Entretenimiento', icono: 'ticket', orden: 8 },
  { id: 'cat-otros', nombre: 'Otros', icono: 'tag', orden: 9 },
]

type RegistroFalso = {
  loteId: string
  ambito: Ambito
  miembroId: string | null
  fecha: string
  montoTotal: number
  categoriaId: string
  medioId: string
  descripcion: string
  cufe: string | null
  creadoMs: number
}

function diasEnMes(anio: number, mes1a12: number): number {
  return new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate()
}

function construirFechaMes(anio: number, mes1a12: number, diaDeseado: number): string {
  const anioReal = anio + Math.floor((mes1a12 - 1) / 12)
  const mesReal = ((((mes1a12 - 1) % 12) + 12) % 12) + 1
  const diaReal = Math.min(diaDeseado, diasEnMes(anioReal, mesReal))
  return `${String(anioReal).padStart(4, '0')}-${String(mesReal).padStart(2, '0')}-${String(diaReal).padStart(2, '0')}`
}

function partirFecha(fechaIso: string): { anio: number; mes: number; dia: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso)
  if (!match) return { anio: 2026, mes: 11, dia: 22 }
  return { anio: Number(match[1]), mes: Number(match[2]), dia: Number(match[3]) }
}

function calcularDesgloseFalso(params: {
  monto: number
  cuotas: number
  fechaCompra: string
  diaCorte: number
  diaPago: number
  tasa: TasaPasivo | null
}): DesgloseCuotas {
  const { monto, cuotas, fechaCompra, diaCorte, diaPago, tasa } = params
  const n = Math.max(1, Math.trunc(cuotas))
  const partes = partirFecha(fechaCompra)

  const corteEnMismoMes = construirFechaMes(partes.anio, partes.mes, diaCorte)
  const corte1 =
    corteEnMismoMes >= fechaCompra
      ? partirFecha(corteEnMismoMes)
      : partirFecha(construirFechaMes(partes.anio, partes.mes + 1, diaCorte))

  const corte1Iso = construirFechaMes(corte1.anio, corte1.mes, corte1.dia)
  const pagoEnMesCorte = construirFechaMes(corte1.anio, corte1.mes, diaPago)
  const pago1 =
    pagoEnMesCorte > corte1Iso
      ? partirFecha(pagoEnMesCorte)
      : partirFecha(construirFechaMes(corte1.anio, corte1.mes + 1, diaPago))

  const capitalBase = Math.floor(monto / n)
  const residuo = monto % n
  const tasaMensual = tasa
    ? tasa.tipo === 'EA'
      ? Math.pow(1 + tasa.ppm / 1_000_000, 1 / 12) - 1
      : tasa.ppm / 1_000_000
    : null

  let saldoRestante = monto
  let interesTotal = 0
  const lista: DesgloseCuotas['cuotas'] = []

  for (let k = 1; k <= n; k++) {
    const capital = capitalBase + (k <= residuo ? 1 : 0)
    const fechaVencimiento = construirFechaMes(pago1.anio, pago1.mes + (k - 1), diaPago)
    let interes: number | null = null
    if (tasaMensual !== null) {
      interes = Math.floor(saldoRestante * tasaMensual + 0.5)
      interesTotal += interes
    }
    saldoRestante -= capital
    lista.push({ numero: k, fechaVencimiento, capital, interes })
  }

  return {
    consumoHoy: monto,
    cuotas: lista,
    interesTotal: tasaMensual !== null ? interesTotal : null,
    tasaMensualPct: tasaMensual !== null ? Number((tasaMensual * 100).toFixed(4)) : null,
  }
}

function extraerCampoQr(texto: string, claves: string[]): string | undefined {
  for (const clave of claves) {
    const regex = new RegExp(`(?:^|[\\n\\r;|&\\s])${clave}\\s*[:=]\\s*([^\\n\\r;&]+)`, 'i')
    const match = regex.exec(texto)
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

function parsearQrFalso(
  textoCrudo: string,
  buscarAlias: (nit: string) => { nombreComercio: string; categoriaId: string | null } | null,
): ResultadoEscaneo {
  const texto = textoCrudo.trim()
  if (!texto) {
    return { estado: 'invalido', mensaje: 'El código QR está vacío.' }
  }

  const matchUrl = /(https?:\/\/[^\s"'<>]+dian\.gov\.co[^\s"'<>]*)/i.exec(texto)
  const urlCruda = matchUrl?.[1] ?? null
  const urlVerificacion = esUrlDianValida(urlCruda) ? urlCruda : null

  let cufe = extraerCampoQr(texto, ['CUFE', 'CUDE', 'documentkey'])
  if (!cufe && urlCruda) {
    try {
      cufe = new URL(urlCruda).searchParams.get('documentkey') ?? undefined
    } catch {
      // ignorar
    }
  }

  const nitComercio = extraerCampoQr(texto, ['NitFac', 'NIT']) ?? null
  const fecha = extraerCampoQr(texto, ['FecFac', 'Fecha']) ?? null
  const montoRaw = extraerCampoQr(texto, ['ValTolFac', 'ValTotal', 'Total'])
  const ivaRaw = extraerCampoQr(texto, ['ValIva', 'IVA'])
  const montoTotal = montoRaw ? Math.round(Number(montoRaw)) : null
  const iva = ivaRaw ? Math.round(Number(ivaRaw)) : null

  if (cufe && (montoTotal !== null || nitComercio || fecha)) {
    const factura: DatosFactura = {
      origen: 'qr',
      cufe,
      nitComercio,
      fecha,
      montoTotal,
      iva,
      urlVerificacion,
    }
    return {
      estado: 'precargado',
      formato: 'campos',
      factura,
      sugerencia: nitComercio ? buscarAlias(nitComercio) : null,
    }
  }

  if (cufe && (urlVerificacion || /catalogo-vpfe/i.test(texto))) {
    return {
      estado: 'precargado',
      formato: 'url',
      factura: {
        origen: 'qr',
        cufe,
        nitComercio: null,
        fecha: null,
        montoTotal: null,
        iva: null,
        urlVerificacion,
      },
      sugerencia: null,
    }
  }

  return {
    estado: 'invalido',
    mensaje: 'No reconocimos un QR de factura DIAN válido.',
  }
}

/**
 * Implementación falsa en memoria de `ControladorCompraRapida`, usada
 * exclusivamente en los tests de UI (`CompraRapida.test.tsx`).
 */
export function crearControladorFalsoCompraRapida(hogar: Hogar): ControladorCompraRapida {
  const miembroNombre = hogar.miembroActual.nombre
  const miembroId = hogar.miembroActual.id

  const mediosIniciales: MedioOpcion[] = [
    {
      tipo: 'tarjeta',
      id: 'pasivo-visa-hogar',
      nombre: `Visa ••4521 (${miembroNombre})`,
      ambito: 'hogar',
      ultimos4: '4521',
      diaCorte: 15,
      diaPago: 25,
      tasa: { tipo: 'EA', ppm: 283200 },
    },
    { tipo: 'medio', id: 'medio-debito', nombre: 'Bancolombia débito', ambito: null },
    { tipo: 'medio', id: 'medio-efectivo', nombre: 'Efectivo', ambito: null },
    { tipo: 'medio', id: 'medio-fondo-comun', nombre: 'Fondo común (Hogar)', ambito: null },
    {
      tipo: 'prestamo',
      id: 'pasivo-prestamo-cocina',
      nombre: 'Remodelación cocina (Hogar)',
      ambito: 'hogar',
      disponible: 2_500_000,
      fechaGiro: '2026-10-01',
    },
    {
      tipo: 'tarjeta',
      id: 'pasivo-visa-personal',
      nombre: `Visa personal ••4521 (${miembroNombre})`,
      ambito: 'personal',
      ultimos4: '4521',
      diaCorte: 15,
      diaPago: 25,
      tasa: null,
    },
  ]

  const catalogo: CatalogoCompra = {
    categorias: CATEGORIAS_SEMBRADAS,
    medios: mediosIniciales,
  }

  let ultimoMedioId: string | null = 'pasivo-visa-hogar'
  let secuenciaLote = 0
  const registros: RegistroFalso[] = []
  const aliases = new Map<string, { nombreComercio: string; categoriaId: string | null }>([
    ['890900608', { nombreComercio: 'Almacenes Éxito', categoriaId: 'cat-mercado' }],
  ])

  function mediosPara(cat: CatalogoCompra, ambito: Ambito): MedioOpcion[] {
    return cat.medios.filter((m) => m.ambito === null || m.ambito === ambito)
  }

  function validar(borrador: BorradorCompra, cat: CatalogoCompra): ErrorBorrador | null {
    if (!Number.isSafeInteger(borrador.monto) || borrador.monto <= 0) {
      return { campo: 'monto', mensaje: 'Ingresa un monto mayor a $0' }
    }
    if (!borrador.categoriaId || !cat.categorias.some((c) => c.id === borrador.categoriaId)) {
      return { campo: 'categoria', mensaje: 'Elige una categoría para guardar' }
    }
    const medio = mediosPara(cat, borrador.ambito).find((m) => m.id === borrador.medioId)
    if (!medio) {
      return { campo: 'medio', mensaje: 'Elige un medio de pago compatible con el ámbito' }
    }
    if (medio.tipo === 'tarjeta' && (borrador.cuotas < 1 || borrador.cuotas > 48)) {
      return { campo: 'cuotas', mensaje: 'Ingresa un número de cuotas entre 1 y 48' }
    }
    if (medio.tipo === 'prestamo') {
      if (borrador.fecha < medio.fechaGiro) {
        return { campo: 'fecha', mensaje: `La fecha no puede ser anterior al desembolso (${medio.fechaGiro})` }
      }
      if (borrador.monto > medio.disponible) {
        return { campo: 'monto', mensaje: `El monto supera el capital disponible (${formatearCop(medio.disponible)})` }
      }
    }
    return null
  }

  function desglose(borrador: BorradorCompra, cat: CatalogoCompra): DesgloseCuotas | null {
    const medio = mediosPara(cat, borrador.ambito).find((m) => m.id === borrador.medioId)
    if (!medio || medio.tipo !== 'tarjeta') return null
    return calcularDesgloseFalso({
      monto: borrador.monto,
      cuotas: borrador.cuotas,
      fechaCompra: borrador.fecha,
      diaCorte: medio.diaCorte,
      diaPago: medio.diaPago,
      tasa: medio.tasa,
    })
  }

  return {
    async cargar() {
      return { catalogo, ultimoMedioId }
    },
    borradorInicial(medioRecordadoId) {
      return {
        ambito: 'hogar',
        monto: 0,
        categoriaId: null,
        fecha: fechaHoyBogota(),
        descripcion: '',
        medioId: medioRecordadoId ?? ultimoMedioId,
        cuotas: 1,
        factura: null,
        nombreComercio: null,
      }
    },
    mediosPara,
    validar,
    desglose,
    async posibleDuplicado(borrador) {
      if (!borrador.categoriaId || !borrador.medioId || borrador.monto <= 0) return false
      const ahora = Date.now()
      return registros.some(
        (r) =>
          ahora - r.creadoMs < 60_000 &&
          r.montoTotal === borrador.monto &&
          r.categoriaId === borrador.categoriaId &&
          r.medioId === borrador.medioId,
      )
    },
    async guardar(borrador, cat): Promise<ResultadoGuardar> {
      const error = validar(borrador, cat)
      if (error) throw new Error(error.mensaje)
      const categoria = cat.categorias.find((c) => c.id === borrador.categoriaId)!
      const medio = mediosPara(cat, borrador.ambito).find((m) => m.id === borrador.medioId)!
      secuenciaLote += 1
      const loteId = `lote-falso-${secuenciaLote}`
      registros.push({
        loteId,
        ambito: borrador.ambito,
        miembroId: borrador.ambito === 'personal' ? miembroId : null,
        fecha: borrador.fecha,
        montoTotal: borrador.monto,
        categoriaId: categoria.id,
        medioId: medio.id,
        descripcion: borrador.descripcion.trim() || borrador.nombreComercio?.trim() || categoria.nombre,
        cufe: borrador.factura?.cufe ?? null,
        creadoMs: Date.now(),
      })
      ultimoMedioId = medio.id
      if (borrador.ambito === 'hogar' && borrador.factura?.nitComercio && borrador.nombreComercio?.trim()) {
        aliases.set(borrador.factura.nitComercio, {
          nombreComercio: borrador.nombreComercio.trim(),
          categoriaId: categoria.id,
        })
      }
      const sufijoCuotas =
        medio.tipo === 'tarjeta' && borrador.cuotas > 1 ? ` · ${borrador.cuotas} cuotas` : ''
      return {
        loteId,
        resumen: `Guardado: ${categoria.nombre} ${formatearCop(borrador.monto)} · ${medio.nombre}${sufijoCuotas}`,
      }
    },
    async deshacer(loteId) {
      const idx = registros.findIndex((r) => r.loteId === loteId)
      if (idx >= 0) registros.splice(idx, 1)
    },
    async escanear(textoQr) {
      const resultado = parsearQrFalso(textoQr, (nit) => aliases.get(nit) ?? null)
      if (resultado.estado !== 'precargado') return resultado
      const existente = registros.find(
        (r) => r.cufe === resultado.factura.cufe && (r.ambito === 'hogar' || r.miembroId === miembroId),
      )
      if (existente) {
        return {
          estado: 'duplicado',
          existente: {
            fecha: existente.fecha,
            montoTotal: existente.montoTotal,
            descripcion: existente.descripcion,
          },
          urlVerificacion: resultado.factura.urlVerificacion,
        }
      }
      return resultado
    },
    async sincronizacion() {
      return { pendientes: 0, rechazados: [] }
    },
  }
}
