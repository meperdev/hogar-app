import type {
  Ambito,
  BorradorCompra,
  CatalogoCompra,
  ControladorCompraRapida,
  DesgloseCuotas,
  ErrorBorrador,
  MedioOpcion,
  ResultadoEscaneo,
  ResultadoGuardar,
} from '../../app/compraRapida'
import type { Hogar } from '../../app/fundacion'
import {
  calcularDesgloseTarjetaVisual,
  fechaHoyBogota,
  formatearCop,
  parsearQrDianVisual,
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

type RegistroVisual = {
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

/**
 * Controlador puramente en memoria usado como respaldo visual cuando
 * `servicios.compras` todavía no fue provisto por la capa `data`/`app`.
 * Nunca toca Supabase ni Dexie.
 */
export function crearControladorVisualCompraRapida(hogar: Hogar): ControladorCompraRapida {
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
    {
      tipo: 'medio',
      id: 'medio-debito',
      nombre: 'Bancolombia débito',
      ambito: null,
    },
    {
      tipo: 'medio',
      id: 'medio-efectivo',
      nombre: 'Efectivo',
      ambito: null,
    },
    {
      tipo: 'medio',
      id: 'medio-fondo-comun',
      nombre: 'Fondo común (Hogar)',
      ambito: null,
    },
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
  const registros: RegistroVisual[] = []
  const aliases = new Map<string, { nombreComercio: string; categoriaId: string | null }>([
    ['890900608', { nombreComercio: 'Almacenes Éxito', categoriaId: 'cat-mercado' }],
  ])

  function mediosPara(_cat: CatalogoCompra, ambito: Ambito): MedioOpcion[] {
    return _cat.medios.filter((m) => m.ambito === null || m.ambito === ambito)
  }

  function validar(borrador: BorradorCompra, cat: CatalogoCompra): ErrorBorrador | null {
    if (!Number.isSafeInteger(borrador.monto) || borrador.monto <= 0) {
      return { campo: 'monto', mensaje: 'Ingresa un monto mayor a $0' }
    }
    if (!borrador.categoriaId || !cat.categorias.some((c) => c.id === borrador.categoriaId)) {
      return { campo: 'categoria', mensaje: 'Elige una categoría para guardar' }
    }
    const mediosCompatibles = mediosPara(cat, borrador.ambito)
    const medio = mediosCompatibles.find((m) => m.id === borrador.medioId)
    if (!medio) {
      return { campo: 'medio', mensaje: 'Elige un medio de pago compatible con el ámbito' }
    }
    if (medio.tipo === 'tarjeta') {
      if (!Number.isInteger(borrador.cuotas) || borrador.cuotas < 1 || borrador.cuotas > 48) {
        return { campo: 'cuotas', mensaje: 'Ingresa un número de cuotas entre 1 y 48' }
      }
    }
    if (medio.tipo === 'prestamo') {
      if (borrador.fecha < medio.fechaGiro) {
        return {
          campo: 'fecha',
          mensaje: `La fecha no puede ser anterior al desembolso (${medio.fechaGiro})`,
        }
      }
      if (borrador.monto > medio.disponible) {
        return {
          campo: 'monto',
          mensaje: `El monto supera el capital disponible del préstamo (${formatearCop(medio.disponible)})`,
        }
      }
    }
    return null
  }

  function desglose(borrador: BorradorCompra, cat: CatalogoCompra): DesgloseCuotas | null {
    const medio = mediosPara(cat, borrador.ambito).find((m) => m.id === borrador.medioId)
    if (!medio || medio.tipo !== 'tarjeta') return null
    return calcularDesgloseTarjetaVisual({
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
      const loteId = `lote-visual-${secuenciaLote}`

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

      // I23: una compra personal nunca crea ni actualiza AliasComercio compartido
      if (
        borrador.ambito === 'hogar' &&
        borrador.factura?.nitComercio &&
        borrador.nombreComercio?.trim()
      ) {
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

    async escanear(textoQr): Promise<ResultadoEscaneo> {
      const resultado = parsearQrDianVisual(textoQr, (nit) => aliases.get(nit) ?? null)
      if (resultado.estado !== 'precargado') return resultado

      const existente = registros.find(
        (r) =>
          r.cufe === resultado.factura.cufe &&
          (r.ambito === 'hogar' || r.miembroId === miembroId),
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
