import { describe, expect, it } from 'vitest'
import type { LoteObligaciones } from '../domain/loteObligaciones'
import {
  clavePreferenciaIncluirPersonales,
  crearControladorObligaciones,
  mensajeRechazo,
  type DatosObligaciones,
  type ObligacionesPort,
  type ResultadoEnvio,
} from './controladorObligaciones'
import type { BorradorPasivo } from './obligaciones'

const ALCANCE = { hogarId: 'hogar', miembroId: 'camila' }

function datosBase(): DatosObligaciones {
  return {
    miembros: [{ id: 'santiago', nombre: 'Santiago' }, { id: 'camila', nombre: 'Camila' }],
    categorias: [{ id: 'cat-mercado', nombre: 'Mercado' }, { id: 'cat-arriendo', nombre: 'Arriendo' }],
    medios: [
      { id: 'nequi-camila', nombre: 'Nequi · Camila', owner_miembro_id: 'camila' },
      { id: 'cuenta-comun', nombre: 'Cuenta común · Hogar', owner_miembro_id: null },
    ],
    pasivos: [
      { id: 'visa', tipo: 'tarjeta', nombre: 'Visa', ambito: 'hogar', owner_miembro_id: 'santiago', ultimos_4: '4521' },
      { id: 'visa-camila', tipo: 'tarjeta', nombre: 'Visa personal', ambito: 'personal', owner_miembro_id: 'camila', ultimos_4: '9900' },
    ],
    planes: [
      { id: 'plan', pasivo_id: 'visa', compra_id: 'compra-exito', fecha_inicio: '2026-11-10', capital: 300000, sistema: 'capital_fijo', n_cuotas: 3 },
      { id: 'plan-p', pasivo_id: 'visa-camila', compra_id: null, fecha_inicio: '2026-11-01', capital: 50000, sistema: 'sin_calendario', n_cuotas: null },
    ],
    cuotas: [
      { id: 'c1', plan_id: 'plan', numero: 1, fecha_vencimiento: '2026-11-25', capital: 100000 },
      { id: 'c2', plan_id: 'plan', numero: 2, fecha_vencimiento: '2026-12-25', capital: 100000 },
      { id: 'c3', plan_id: 'plan', numero: 3, fecha_vencimiento: '2027-01-25', capital: 100000 },
    ],
    costos: [
      { id: 'k1', pasivo_id: 'visa', cuota_id: 'c1', monto: 6299, fecha_causacion: '2026-11-25', origen: 'calculado', seq: 41 },
    ],
    pagos: [],
    obligaciones: [
      { id: 'arriendo', nombre: 'Arriendo apartamento', categoria_id: 'cat-arriendo', monto_estimado: 1800000, dia_vencimiento: 5, periodicidad: 'mensual', mes_inicio: '2026-01', activa: true },
    ],
    compras: [
      { id: 'compra-exito', fecha: '2026-11-10', monto_total: 300000, ambito: 'hogar', miembro_id: null, descripcion: 'Mercado Éxito', obligacion_id: null, periodo: null },
      { id: 'compra-personal', fecha: '2026-11-12', monto_total: 140000, ambito: 'personal', miembro_id: 'camila', descripcion: 'Ropa', obligacion_id: null, periodo: null },
      // Recibo de noviembre pagado el 2 de diciembre: agenda de noviembre, gasto de diciembre.
      { id: 'compra-arriendo', fecha: '2026-12-02', monto_total: 1800000, ambito: 'hogar', miembro_id: null, descripcion: 'Arriendo apartamento', obligacion_id: 'arriendo', periodo: '2026-11' },
    ],
  }
}

class PuertoMemoria implements ObligacionesPort {
  enviados: LoteObligaciones[] = []
  respuesta: ResultadoEnvio = { estado: 'aplicado' }
  preferencias = new Map<string, string>()

  constructor(public datos: DatosObligaciones) {}

  async cargar() {
    return structuredClone(this.datos)
  }
  async enviar(lote: LoteObligaciones) {
    this.enviados.push(lote)
    return this.respuesta
  }
  async leerPreferencia(clave: string) {
    return this.preferencias.get(clave) ?? null
  }
  async guardarPreferencia(clave: string, valor: string) {
    this.preferencias.set(clave, valor)
  }
}

function montar(datos = datosBase(), ahora = '2026-11-20T15:00:00Z') {
  const port = new PuertoMemoria(datos)
  let n = 0
  const controlador = crearControladorObligaciones({
    port,
    alcance: ALCANCE,
    ahora: () => new Date(ahora),
    nuevoId: () => `id-${++n}`,
  })
  return { port, controlador }
}

const pagoCanonico = { pasivoId: 'visa', cuotaId: 'c1', medioId: 'nequi-camila', fecha: '2026-11-25', capital: 100000, interes: 6299, nota: '' }

describe('agenda del mes', () => {
  it('tres tarjetas derivadas sin doble conteo y agenda por periodo', async () => {
    const { controlador } = montar()
    const agenda = await controlador.cargarMes('2026-11')
    expect(agenda.resumen).toEqual({
      periodo: '2026-11',
      consumoReal: 300000, // la compra a cuotas una sola vez; el arriendo cuenta en diciembre por su fecha
      capitalPagado: 0,
      capitalPendiente: 100000,
      costoFinanciero: 6299,
    })
    const arriendo = agenda.pagadas.find((i) => i.tipo === 'obligacion')
    expect(arriendo).toMatchObject({ nombre: 'Arriendo apartamento', periodo: '2026-11', pago: { fecha: '2026-12-02', monto: 1800000 } })
    const cuota = agenda.pendientes.find((i) => i.tipo === 'cuota')
    expect(cuota).toMatchObject({ cuotaId: 'c1', numero: 1, nCuotas: 3, interes: 6299, interesOrigen: 'calculado', estado: 'pendiente', pasivoNombre: 'Visa ••4521', titular: { tipo: 'miembro', nombre: 'Santiago' } })
    expect((await controlador.cargarMes('2026-12')).resumen.consumoReal).toBe(1800000)
  })

  it('el pago de la cuota mueve capital pagado y nunca el consumo', async () => {
    const d = datosBase()
    d.pagos.push({ id: 'a1', pasivo_id: 'visa', tipo: 'abono', cuota_id: 'c1', monto: 106299, fecha: '2026-11-25', registrado_por: 'camila' })
    const { controlador } = montar(d, '2026-11-26T15:00:00Z')
    const agenda = await controlador.cargarMes('2026-11')
    expect(agenda.resumen).toMatchObject({ consumoReal: 300000, capitalPagado: 100000, capitalPendiente: 0, costoFinanciero: 6299 })
    expect(agenda.pagadas.find((i) => i.tipo === 'cuota')).toMatchObject({ cuotaId: 'c1', pagoEnlazado: { monto: 106299, registradoPor: 'Camila' } })
  })

  it('incluir_personales es una preferencia local que solo suma lo propio', async () => {
    const { controlador, port } = montar()
    expect(await controlador.leerIncluirPersonales()).toBe(false)
    await controlador.guardarIncluirPersonales(true)
    expect(port.preferencias.get(clavePreferenciaIncluirPersonales('camila'))).toBe('true')
    expect((await controlador.cargarMes('2026-11')).resumen.consumoReal).toBe(440000)
  })

  it('una cuota sin pagar después de su vencimiento pasa a vencidas', async () => {
    const { controlador } = montar(datosBase(), '2026-11-28T15:00:00Z')
    const agenda = await controlador.cargarMes('2026-11')
    expect(agenda.vencidas.map((i) => (i.tipo === 'cuota' ? i.cuotaId : i.obligacionId))).toEqual(['c1'])
  })
})

describe('registrar pago', () => {
  it('pago canónico: $106.299 baja el saldo de $306.299 a $200.000 y aporta completo a Camila', async () => {
    const { controlador, port } = montar()
    expect(await controlador.prepararPagoCuota('c1')).toEqual({ ...pagoCanonico, medioId: null })
    expect(await controlador.evaluarPago(pagoCanonico)).toEqual({
      estado: 'valido',
      monto: 106299,
      saldoAntes: 306299,
      saldoDespues: 200000,
      capitalAplicado: 100000,
      aporte: { miembroId: 'camila', monto: 106299 },
    })
    const r = await controlador.registrarPago(pagoCanonico, { dividirSobrepago: false })
    expect(r.resumen).toBe('Pago registrado: $106.299')
    const [lote] = port.enviados
    expect(lote?.tipo).toBe('pago')
    expect(lote?.filas.pago_de_deuda).toEqual([
      expect.objectContaining({ tipo: 'abono', pasivo_id: 'visa', cuota_id: 'c1', medio_de_pago_id: 'nequi-camila', monto: 106299, fecha: '2026-11-25' }),
    ])
    expect(lote?.filas.costo_financiero).toBeUndefined()
  })

  it('el aporte depende del libro y del medio, no del FIFO', async () => {
    const { controlador } = montar()
    const comun = await controlador.evaluarPago({ ...pagoCanonico, medioId: 'cuenta-comun' })
    expect(comun).toMatchObject({ estado: 'valido', monto: 106299, aporte: null })
    const personal = await controlador.evaluarPago({ pasivoId: 'visa-camila', cuotaId: null, medioId: 'nequi-camila', fecha: '2026-11-20', capital: 20000, interes: null, nota: '' })
    expect(personal).toMatchObject({ estado: 'valido', aporte: null })
  })

  it('interés corregido contra el extracto: el saldo causado usa el nuevo monto y el lote lo deja manual', async () => {
    const { controlador, port } = montar()
    const corregido = { ...pagoCanonico, interes: 7000 }
    expect(await controlador.evaluarPago(corregido)).toMatchObject({ estado: 'valido', monto: 107000, saldoAntes: 307000, saldoDespues: 200000 })
    await controlador.registrarPago(corregido, { dividirSobrepago: false })
    // El servidor aplica la corrección con el seq visto y la guarda con origen='manual'.
    expect(port.enviados[0]?.filas.costo_financiero).toEqual([{ id: 'k1', base_seq: 41, monto: 7000 }])
  })

  it('pasivo sin tasa: un interés del extracto entra como costo manual nuevo', async () => {
    const { controlador, port } = montar()
    await controlador.registrarPago({ pasivoId: 'visa-camila', cuotaId: null, medioId: 'nequi-camila', fecha: '2026-11-20', capital: 20000, interes: 1500, nota: '' }, { dividirSobrepago: false })
    expect(port.enviados[0]?.filas.costo_financiero).toEqual([
      expect.objectContaining({ tipo: 'interes', monto: 1500, origen: 'manual', pasivo_id: 'visa-camila', fecha_causacion: '2026-11-20' }),
    ])
    expect(port.enviados[0]?.filas.pago_de_deuda?.[0]).toMatchObject({ monto: 21500 })
  })

  it('posible pago duplicado: no se confirma ni se divide', async () => {
    const d = datosBase()
    d.pagos.push({ id: 'a1', pasivo_id: 'visa', tipo: 'abono', cuota_id: 'c1', monto: 106299, fecha: '2026-11-25', registrado_por: 'santiago' })
    const { controlador, port } = montar(d)
    expect(await controlador.evaluarPago(pagoCanonico)).toEqual({
      estado: 'duplicado',
      existente: { fecha: '2026-11-25', monto: 106299, registradoPor: 'Santiago' },
    })
    await expect(controlador.registrarPago(pagoCanonico, { dividirSobrepago: true })).rejects.toThrow('▲ Posible pago duplicado')
    expect(port.enviados).toHaveLength(0)
    // Como adelanto sin cuota sí se evalúa contra el tope.
    expect(await controlador.evaluarPago({ ...pagoCanonico, cuotaId: null, interes: null, fecha: '2026-11-26' })).toMatchObject({ estado: 'valido', monto: 100000, saldoAntes: 200000, saldoDespues: 100000 })
  })

  it('sobrepago: solo con confirmación se divide en abono hasta el tope y saldo a favor', async () => {
    const d = datosBase()
    d.pagos.push({ id: 'a1', pasivo_id: 'visa', tipo: 'abono', cuota_id: 'c1', monto: 106299, fecha: '2026-11-25', registrado_por: 'santiago' })
    const { controlador, port } = montar(d)
    const b = { ...pagoCanonico, cuotaId: null, fecha: '2026-11-26', capital: 250000, interes: null }
    expect(await controlador.evaluarPago(b)).toEqual({
      estado: 'sobrepago', monto: 250000, tope: 200000, excedente: 50000, aporte: { miembroId: 'camila', monto: 200000 },
    })
    await expect(controlador.registrarPago(b, { dividirSobrepago: false })).rejects.toThrow('▲ Posible pago duplicado o sobrepago')
    await controlador.registrarPago(b, { dividirSobrepago: true })
    expect(port.enviados[0]?.filas.pago_de_deuda).toEqual([
      expect.objectContaining({ tipo: 'abono', monto: 200000, cuota_id: null }),
      expect.objectContaining({ tipo: 'saldo_a_favor', monto: 50000, cuota_id: null }),
    ])
  })

  it('un pago parcial no puede enlazar la cuota', async () => {
    const { controlador } = montar()
    expect(await controlador.evaluarPago({ ...pagoCanonico, capital: 60000, interes: null })).toMatchObject({ estado: 'invalido', campo: 'monto' })
  })

  it('traduce los rechazos del servidor', async () => {
    const { controlador, port } = montar()
    port.respuesta = { estado: 'rechazado', motivo: 'duplicado', detalle: 'pago_de_deuda_cuota_key' }
    await expect(controlador.registrarPago(pagoCanonico, { dividirSobrepago: false })).rejects.toThrow('▲ Posible pago duplicado')
    expect(mensajeRechazo({ motivo: 'invalido', detalle: 'el abono supera el saldo causado a su fecha' })).toBe('▲ Posible pago duplicado o sobrepago')
    expect(mensajeRechazo({ motivo: 'conflicto' })).toContain('otro dispositivo')
  })
})

describe('obligación recurrente', () => {
  it('pagarla crea una compra del hogar con su periodo y su categoría', async () => {
    const { controlador, port } = montar()
    await controlador.registrarPagoObligacion({ obligacionId: 'arriendo', periodo: '2026-12', medioId: 'nequi-camila', fecha: '2026-12-05', monto: 1800000 })
    expect(port.enviados[0]).toMatchObject({ tipo: 'pago_obligacion' })
    expect(port.enviados[0]?.filas.compra).toEqual([
      expect.objectContaining({ obligacion_id: 'arriendo', periodo: '2026-12', categoria_id: 'cat-arriendo', ambito: 'hogar', monto_total: 1800000, fecha: '2026-12-05' }),
    ])
  })
})

describe('alta de pasivo', () => {
  const base: BorradorPasivo = {
    tipo: 'deuda', nombre: 'Préstamo remodelación cocina', ambito: 'hogar', titularMiembroId: null, tasa: null,
    tarjeta: null, credito: null, deuda: { acreedor: 'Almacén El Hogar' },
    plan: { origen: 'desembolso', capital: 2000000, fechaInicio: '2026-11-10', calendario: null },
  }

  it('deuda del hogar sin tasa con desembolso sin calendario', async () => {
    const { controlador, port } = montar()
    expect(controlador.validarPasivo(base)).toBeNull()
    await controlador.crearPasivo(base)
    const f = port.enviados[0]?.filas
    expect(f?.pasivo?.[0]).toMatchObject({ tipo: 'deuda', owner_tipo: 'hogar', owner_miembro_id: null, tasa_tipo: null, tasa_ppm: null })
    expect(f?.deuda?.[0]).toMatchObject({ acreedor: 'Almacén El Hogar' })
    expect(f?.plan_de_cuotas?.[0]).toMatchObject({ origen: 'desembolso', sistema: 'sin_calendario', n_cuotas: null, fecha_primera_cuota: null })
    expect(f?.cuota).toBeUndefined()
  })

  it('crédito con saldo inicial, tasa E.A. exacta y calendario conocido', async () => {
    const { controlador, port } = montar()
    expect(controlador.equivalenciaTasa({ tipo: 'EA', porcentaje: 28.32 }).mv).toBeCloseTo(2.0997, 4)
    await controlador.crearPasivo({
      ...base, tipo: 'credito', nombre: 'Crédito libre inversión', titularMiembroId: 'santiago', deuda: null,
      credito: { entidad: 'Banco', referencia: null }, tasa: { tipo: 'EA', porcentaje: 28.32 },
      plan: { origen: 'saldo_inicial', capital: 100000, fechaInicio: '2026-11-01', calendario: { nCuotas: 3, fechaPrimeraCuota: '2026-12-31' } },
    })
    const f = port.enviados[0]?.filas
    expect(f?.pasivo?.[0]).toMatchObject({ owner_tipo: 'miembro', tasa_tipo: 'EA', tasa_ppm: 283200 })
    expect(f?.plan_de_cuotas?.[0]).toMatchObject({ origen: 'saldo_inicial', sistema: 'capital_fijo', n_cuotas: 3, tasa_ppm: 283200 })
    expect(f?.cuota?.map((c) => [c.fecha_vencimiento, c.capital])).toEqual([
      ['2026-12-31', 33334], ['2027-01-31', 33333], ['2027-02-28', 33333],
    ])
  })

  it('política de fase 1: tarjeta de un miembro y sin desembolso', () => {
    const { controlador } = montar()
    const tarjeta: BorradorPasivo = {
      ...base, tipo: 'tarjeta', nombre: 'Visa', deuda: null, plan: null,
      tarjeta: { diaCorte: 15, diaPago: 25, ultimos4: '4521', cupo: null },
    }
    expect(controlador.validarPasivo(tarjeta)?.campo).toBe('titular')
    expect(controlador.validarPasivo({ ...tarjeta, titularMiembroId: 'santiago' })).toBeNull()
    expect(controlador.validarPasivo({ ...tarjeta, titularMiembroId: 'santiago', plan: base.plan })?.mensaje).toContain('no recibe desembolsos')
  })
})
