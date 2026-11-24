import { describe, expect, it } from 'vitest'
import type { LoteCompra } from '../domain/loteCompra'
import type { BorradorCompra, CatalogoCompra, CompraExistente } from './compraRapida'
import {
  clavePreferenciaUltimoMedio,
  crearControladorCompraRapida,
  ErrorCompraRapida,
  prellenarRecompra,
  type CompraRapidaPort,
  type RegistroLocal,
} from './controladorCompraRapida'

const ALCANCE = { hogarId: 'hogar-1', miembroId: 'ana' }
const CUFE = 'c'.repeat(96)
const QR = [
  'NumFac: SETP1',
  'FecFac: 2026-11-22',
  'NitFac: 890900608',
  'DocAdq: 1020304050',
  'ValIva: 13571.43',
  'ValTolFac: 85000.00',
  `CUFE: ${CUFE}`,
  `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${CUFE}`,
].join('\n')

const catalogo: CatalogoCompra = {
  categorias: [
    { id: 'cat-mercado', nombre: 'Mercado', icono: 'mercado', orden: 1 },
    { id: 'cat-otros', nombre: 'Otros', icono: 'otros', orden: 9 },
  ],
  medios: [
    { tipo: 'medio', id: 'efectivo', nombre: 'Efectivo', ambito: null },
    {
      tipo: 'tarjeta',
      id: 'visa',
      nombre: 'Visa ••4521',
      ambito: 'hogar',
      ultimos4: '4521',
      diaCorte: 15,
      diaPago: 25,
      tasa: { tipo: 'EA', ppm: 283200 },
    },
    {
      tipo: 'tarjeta',
      id: 'visa-personal',
      nombre: 'Visa ••4521 personal',
      ambito: 'personal',
      ultimos4: '4521',
      diaCorte: 15,
      diaPago: 25,
      tasa: null,
    },
    { tipo: 'prestamo', id: 'cocina', nombre: 'Remodelación cocina', ambito: 'hogar', disponible: 100000, fechaGiro: '2026-11-10' },
  ],
}

class PuertoMemoria implements CompraRapidaPort {
  pendientes = new Map<string, LoteCompra>()
  registros: RegistroLocal[] = []
  enviados: LoteCompra[] = []
  preferencias = new Map<string, string>()
  alias = new Map<string, { nombreComercio: string; categoriaId: string | null }>()
  remotas = new Map<string, CompraExistente>()

  async cargarCatalogo() {
    return catalogo
  }
  async buscarAlias(nit: string) {
    return this.alias.get(nit) ?? null
  }
  async buscarPorCufe(cufe: string) {
    const local = this.registros.find((r) => r.cufe === cufe)
    if (local) return { fecha: local.fecha, montoTotal: local.montoTotal, descripcion: local.descripcion }
    return this.remotas.get(cufe) ?? null
  }
  async guardarLote(lote: LoteCompra, registro: RegistroLocal) {
    this.pendientes.set(lote.lote_id, lote)
    this.registros.push(registro)
  }
  async descartarLote(loteId: string) {
    if (!this.pendientes.delete(loteId)) return false
    this.registros = this.registros.filter((r) => r.loteId !== loteId)
    return true
  }
  async registrosDesde(desde: string) {
    return this.registros.filter((r) => r.creadoEn >= desde)
  }
  async enviarPendientes(antes: string) {
    for (const [id, lote] of this.pendientes) {
      const registro = this.registros.find((r) => r.loteId === id)
      if (registro && registro.creadoEn < antes) {
        this.enviados.push(lote)
        this.pendientes.delete(id)
      }
    }
  }
  async estadoSincronizacion() {
    return { pendientes: this.pendientes.size, rechazados: [] }
  }
  async leerPreferencia(clave: string) {
    return this.preferencias.get(clave) ?? null
  }
  async guardarPreferencia(clave: string, valor: string) {
    this.preferencias.set(clave, valor)
  }
}

function montar(reloj = { t: Date.parse('2026-11-22T15:00:00Z') }) {
  const port = new PuertoMemoria()
  const tareas: Array<() => void> = []
  let n = 0
  const controlador = crearControladorCompraRapida({
    port,
    alcance: ALCANCE,
    ahora: () => new Date(reloj.t),
    nuevoId: () => `id-${++n}`,
    programar: (tarea) => tareas.push(tarea),
  })
  return { port, controlador, tareas, reloj }
}

function borrador(c: ReturnType<typeof montar>['controlador'], cambios: Partial<BorradorCompra> = {}) {
  return { ...c.borradorInicial('efectivo'), monto: 85000, categoriaId: 'cat-mercado', ...cambios }
}

describe('controlador de compra rápida', () => {
  it('el borrador inicial es del hogar, a 1 cuota, con fecha civil de Bogotá', () => {
    const { controlador } = montar({ t: Date.parse('2026-12-01T04:30:00Z') })
    expect(controlador.borradorInicial('visa')).toMatchObject({
      ambito: 'hogar',
      monto: 0,
      cuotas: 1,
      medioId: 'visa',
      fecha: '2026-11-30',
    })
  })

  it('recuerda el último medio solo en el dispositivo y lo descarta si ya no existe', async () => {
    const { controlador, port } = montar()
    port.preferencias.set(clavePreferenciaUltimoMedio('ana'), 'visa')
    expect((await controlador.cargar()).ultimoMedioId).toBe('visa')
    port.preferencias.set(clavePreferenciaUltimoMedio('ana'), 'medio-borrado')
    expect((await controlador.cargar()).ultimoMedioId).toBeNull()
  })

  it('valida monto, categoría y medio con mensajes accesibles', () => {
    const { controlador } = montar()
    expect(controlador.validar(borrador(controlador, { monto: 0 }), catalogo)).toEqual({
      campo: 'monto',
      mensaje: 'Ingresa un monto mayor a $0',
    })
    expect(controlador.validar(borrador(controlador, { categoriaId: null }), catalogo)?.mensaje).toBe(
      'Elige una categoría para guardar',
    )
    expect(controlador.validar(borrador(controlador, { medioId: null }), catalogo)?.campo).toBe('medio')
    expect(controlador.validar(borrador(controlador), catalogo)).toBeNull()
  })

  it('un libro personal no aparece para compras del hogar y viceversa', () => {
    const { controlador } = montar()
    expect(controlador.mediosPara(catalogo, 'hogar').map((m) => m.id)).toEqual(['efectivo', 'visa', 'cocina'])
    expect(controlador.mediosPara(catalogo, 'personal').map((m) => m.id)).toEqual(['efectivo', 'visa-personal'])
    expect(controlador.validar(borrador(controlador, { ambito: 'personal', medioId: 'visa' }), catalogo)?.campo).toBe(
      'medio',
    )
  })

  it('guarda de contado, recuerda el medio y envía solo al vencer la ventana de Deshacer', async () => {
    const { controlador, port, tareas, reloj } = montar()
    const resultado = await controlador.guardar(borrador(controlador), catalogo)
    expect(resultado.resumen).toBe('Guardado: Mercado $85.000 · Efectivo')
    expect(port.preferencias.get(clavePreferenciaUltimoMedio('ana'))).toBe('efectivo')
    expect(port.pendientes.size).toBe(1)

    // Antes de 5 s nada sale del dispositivo.
    reloj.t += 3000
    tareas.shift()?.()
    await Promise.resolve()
    expect(port.enviados).toHaveLength(0)

    reloj.t += 3000
    await controlador.cargar()
    expect(port.enviados).toHaveLength(1)
    expect(port.enviados[0]?.filas.compra[0].descripcion).toBe('Mercado')
  })

  it('Deshacer dentro de la ventana quita el lote y su registro', async () => {
    const { controlador, port } = montar()
    const { loteId } = await controlador.guardar(borrador(controlador), catalogo)
    await controlador.deshacer(loteId)
    expect(port.pendientes.size).toBe(0)
    expect(port.registros).toHaveLength(0)
    await expect(controlador.deshacer(loteId)).rejects.toThrow('ya se sincronizó')
  })

  it('a cuotas: desglose sin doble conteo y lote con plan, cuotas e intereses', async () => {
    const { controlador, port } = montar()
    const b = borrador(controlador, { monto: 300000, medioId: 'visa', cuotas: 3 })
    expect(controlador.desglose(b, catalogo)).toMatchObject({
      consumoHoy: 300000,
      interesTotal: 12598,
      cuotas: [
        { numero: 1, fechaVencimiento: '2026-12-25', capital: 100000, interes: 6299 },
        { numero: 2, fechaVencimiento: '2027-01-25', capital: 100000, interes: 4199 },
        { numero: 3, fechaVencimiento: '2027-02-25', capital: 100000, interes: 2100 },
      ],
    })
    expect(controlador.desglose(borrador(controlador), catalogo)).toBeNull()

    const { resumen, loteId } = await controlador.guardar(b, catalogo)
    expect(resumen).toBe('Guardado: Mercado $300.000 en 3 cuotas · Visa ••4521')
    const lote = port.pendientes.get(loteId)
    expect(lote?.filas.compra[0].monto_total).toBe(300000)
    expect(lote?.filas.cuota).toHaveLength(3)
    expect(lote?.filas.costo_financiero.map((c) => c.monto)).toEqual([6299, 4199, 2100])
  })

  it('las cuotas se ignoran si el medio no es tarjeta', async () => {
    const { controlador, port } = montar()
    const { loteId } = await controlador.guardar(borrador(controlador, { cuotas: 6 }), catalogo)
    expect(port.pendientes.get(loteId)?.filas.plan_de_cuotas).toEqual([])
  })

  it('compra personal en un libro personal', async () => {
    const { controlador, port } = montar()
    const { loteId } = await controlador.guardar(
      borrador(controlador, { ambito: 'personal', medioId: 'visa-personal' }),
      catalogo,
    )
    expect(port.pendientes.get(loteId)?.filas.compra[0]).toMatchObject({ ambito: 'personal', miembro_id: 'ana' })
  })

  it('préstamo: rechaza superar lo disponible con mensaje en el campo medio', async () => {
    const { controlador } = montar()
    const b = borrador(controlador, { monto: 120000, medioId: 'cocina' })
    expect(controlador.validar(b, catalogo)?.campo).toBe('medio')
    await expect(controlador.guardar(b, catalogo)).rejects.toBeInstanceOf(ErrorCompraRapida)
  })

  it('avisa un posible duplicado inmediato solo dentro de 60 s', async () => {
    const { controlador, reloj } = montar()
    await controlador.guardar(borrador(controlador), catalogo)
    expect(await controlador.posibleDuplicado(borrador(controlador))).toBe(true)
    expect(await controlador.posibleDuplicado(borrador(controlador, { monto: 90000 }))).toBe(false)
    reloj.t += 61_000
    expect(await controlador.posibleDuplicado(borrador(controlador))).toBe(false)
  })

  describe('escanear QR DIAN', () => {
    it('precarga la factura, sugiere categoría por alias y no expone DocAdq', async () => {
      const { controlador, port } = montar()
      port.alias.set('890900608', { nombreComercio: 'Almacenes Éxito', categoriaId: 'cat-mercado' })
      const r = await controlador.escanear(QR)
      expect(r).toMatchObject({
        estado: 'precargado',
        formato: 'campos',
        factura: { cufe: CUFE, nitComercio: '890900608', montoTotal: 85000, iva: 13571, fecha: '2026-11-22' },
        sugerencia: { nombreComercio: 'Almacenes Éxito', categoriaId: 'cat-mercado' },
      })
      expect(JSON.stringify(r)).not.toContain('1020304050')
    })

    it('bloquea una factura ya registrada en el dispositivo o visible en el servidor', async () => {
      const { controlador, port } = montar()
      const r = await controlador.escanear(QR)
      if (r.estado !== 'precargado') throw new Error('se esperaba precargado')
      await controlador.guardar(borrador(controlador, { factura: r.factura }), catalogo)
      expect(await controlador.escanear(QR)).toMatchObject({
        estado: 'duplicado',
        existente: { montoTotal: 85000 },
      })

      const otro = montar()
      otro.port.remotas.set(CUFE, { fecha: '2026-11-20', montoTotal: 85000, descripcion: 'Mercado' })
      expect((await otro.controlador.escanear(QR)).estado).toBe('duplicado')
    })

    it('un texto que no es QR DIAN deja seguir a mano', async () => {
      const { controlador } = montar()
      expect(await controlador.escanear('hola')).toEqual({
        estado: 'invalido',
        mensaje: 'No es un QR de factura electrónica DIAN',
      })
    })

    it('crea el alias del comercio solo si es nuevo y la compra es del hogar', async () => {
      const { controlador, port } = montar()
      const r = await controlador.escanear(QR)
      if (r.estado !== 'precargado') throw new Error('se esperaba precargado')
      const b = borrador(controlador, { factura: r.factura, nombreComercio: 'Almacenes Éxito' })

      const personal = await controlador.guardar({ ...b, ambito: 'personal' }, catalogo)
      expect(port.pendientes.get(personal.loteId)?.filas.alias_comercio).toEqual([])
      await controlador.deshacer(personal.loteId)

      const hogar = await controlador.guardar(b, catalogo)
      expect(port.pendientes.get(hogar.loteId)?.filas.alias_comercio).toHaveLength(1)
      await controlador.deshacer(hogar.loteId)

      port.alias.set('890900608', { nombreComercio: 'Éxito', categoriaId: null })
      const repetido = await controlador.guardar(b, catalogo)
      expect(port.pendientes.get(repetido.loteId)?.filas.alias_comercio).toEqual([])
    })
  })

  it('Recomprar (stub de despensa) prellena una compra del hogar', () => {
    const { controlador } = montar()
    const b = prellenarRecompra(controlador.borradorInicial(null), {
      nombre: 'Concentrado adulto 12 kg',
      montoHabitual: 165000,
      categoriaId: 'cat-mascotas',
      mascotaNombre: 'Luna',
    })
    expect(b).toMatchObject({
      ambito: 'hogar',
      monto: 165000,
      categoriaId: 'cat-mascotas',
      descripcion: 'Concentrado adulto 12 kg · Luna',
    })
  })
})
