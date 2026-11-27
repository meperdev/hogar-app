import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatosGastos } from '../app/controladorGastos'
import { construirLoteCompra } from '../domain/loteCompra'
import { crearBaseActor, type BaseActorDexie, type EntradaOutbox } from './db'
import { combinarPendientesGastos, crearPuertoGastos, type RemotoGastos } from './gastos'

const HOGAR_ID = '018f4a1e-0000-7000-8000-000000000001'
const MIEMBRO_ID = '018f4a1e-0000-7000-8000-0000000000a1'
const CAT_ID = '018f4a1e-0000-7000-8000-0000000000c1'
const MEDIO_ID = '018f4a1e-0000-7000-8000-000000000301'

const bases: BaseActorDexie[] = []

afterEach(async () => {
  for (const base of bases.splice(0)) {
    base.close()
    await base.delete()
  }
})

function datosVacios(): DatosGastos {
  return {
    compras: [],
    categorias: [{ id: CAT_ID, nombre: 'Mercado', icono: 'mercado', orden: 1, activa: true }],
    medios: [{ id: MEDIO_ID, nombre: 'Nequi', tipo: 'cuenta', activo: true, orden: 0 }],
    pasivos: [],
    planes: [],
    miembros: [{ id: MIEMBRO_ID, nombre: 'Santiago' }],
  }
}

describe('combinarPendientesGastos y crearPuertoGastos', () => {
  it('incluye compras pendientes del outbox sin esperar sync_push y evita duplicados', () => {
    const lote = construirLoteCompra(
      {
        hogarId: HOGAR_ID,
        actorId: MIEMBRO_ID,
        fecha: '2026-11-27',
        descripcion: 'D1',
        monto: 85_000,
        categoriaId: CAT_ID,
        ambito: 'hogar',
        pago: { tipo: 'medio', medioDePagoId: MEDIO_ID },
        factura: null,
        alias: null,
      },
      () => crypto.randomUUID(),
    )
    if (!('filas' in lote)) throw new Error('Lote inválido')

    const entradaPendiente: EntradaOutbox = {
      loteId: lote.lote_id,
      creadoEn: '2026-11-27T13:00:00.000Z',
      lote,
      estado: 'pendiente',
      motivo: null,
    }
    const entradaRechazada: EntradaOutbox = {
      ...entradaPendiente,
      loteId: crypto.randomUUID(),
      estado: 'rechazado',
      motivo: 'invalido',
    }

    const fusionado = combinarPendientesGastos(
      datosVacios(),
      [entradaPendiente, entradaRechazada],
      HOGAR_ID,
    )
    expect(fusionado.compras).toHaveLength(1)
    expect(fusionado.compras[0]?.monto_total).toBe(85_000)

    const yaSincronizado: DatosGastos = {
      ...datosVacios(),
      compras: fusionado.compras,
    }
    const sinDuplicar = combinarPendientesGastos(yaSincronizado, [entradaPendiente], HOGAR_ID)
    expect(sinDuplicar.compras).toHaveLength(1)
  })

  it('crearPuertoGastos.cargar combina el outbox local encima de lo recibido del remoto', async () => {
    const alcance = { hogarId: HOGAR_ID, miembroId: MIEMBRO_ID }
    const base = crearBaseActor(alcance)
    await base.open()
    bases.push(base)

    const lote = construirLoteCompra(
      {
        hogarId: HOGAR_ID,
        actorId: MIEMBRO_ID,
        fecha: '2026-11-27',
        descripcion: 'Café',
        monto: 18_000,
        categoriaId: CAT_ID,
        ambito: 'hogar',
        pago: { tipo: 'medio', medioDePagoId: MEDIO_ID },
        factura: null,
        alias: null,
      },
      () => crypto.randomUUID(),
    )
    if (!('filas' in lote)) throw new Error('Lote inválido')

    await base.outbox.put({
      loteId: lote.lote_id,
      creadoEn: '2026-11-27T13:10:00.000Z',
      lote,
      estado: 'pendiente',
      motivo: null,
    })

    const remoto: RemotoGastos = {
      leer: vi.fn(async () => datosVacios()),
      editarCompra: vi.fn(async () => {}),
      anularCompra: vi.fn(async () => {}),
    }

    const puerto = crearPuertoGastos({ base: async () => base, remoto, alcance })
    const resultado = await puerto.cargar()

    expect(resultado.sinConexion).toBe(false)
    expect(resultado.datos.compras).toHaveLength(1)
    expect(resultado.datos.compras[0]?.descripcion).toBe('Café')
  })
})
