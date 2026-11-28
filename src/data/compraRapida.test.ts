import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RegistroLocal } from '../app/controladorCompraRapida'
import { construirLoteCompra, type LoteCompra } from '../domain/loteCompra'
import {
  armarCatalogo,
  crearPuertoCompraRapida,
  type FilasCatalogo,
  type RemotoCompraRapida,
  type ResultadoPush,
} from './compraRapida'
import { crearBaseActor, type AlcanceActor, type BaseActorDexie } from './db'

const bases: BaseActorDexie[] = []

afterEach(async () => {
  for (const base of bases.splice(0)) {
    base.close()
    await base.delete()
  }
})

function nuevoAlcance(): AlcanceActor {
  return { hogarId: crypto.randomUUID(), miembroId: crypto.randomUUID() }
}

async function abrirBase(alcance: AlcanceActor): Promise<BaseActorDexie> {
  const base = crearBaseActor(alcance)
  await base.open()
  bases.push(base)
  return base
}

function filasVacias(): FilasCatalogo {
  return {
    categorias: [],
    medios: [],
    pasivos: [],
    tarjetas: [],
    desembolsos: [],
    comprasVinculadas: [],
  }
}

function crearLote(monto = 85_000): LoteCompra {
  return construirLoteCompra(
    {
      hogarId: crypto.randomUUID(),
      actorId: crypto.randomUUID(),
      fecha: '2026-11-20',
      descripcion: 'Mercado',
      monto,
      categoriaId: 'cat-mercado',
      ambito: 'hogar',
      pago: { tipo: 'medio', medioDePagoId: 'efectivo' },
      factura: null,
      alias: null,
    },
    () => crypto.randomUUID(),
  )
}

function registroDe(lote: LoteCompra, creadoEn: string): RegistroLocal {
  const compra = lote.filas.compra[0]
  if (!compra) throw new Error('el lote de prueba necesita una compra')
  return {
    loteId: lote.lote_id,
    compraId: compra.id,
    cufe: compra.cufe,
    fecha: compra.fecha,
    montoTotal: compra.monto_total,
    descripcion: compra.descripcion,
    categoriaId: compra.categoria_id,
    medioId: 'efectivo',
    creadoEn,
  }
}

function remotoFalso(cambios: Partial<RemotoCompraRapida> = {}): RemotoCompraRapida {
  return {
    leerCatalogo: vi.fn(async () => filasVacias()),
    buscarAlias: vi.fn(async () => null),
    buscarPorCufe: vi.fn(async () => null),
    syncPush: vi.fn(async (): Promise<ResultadoPush> => ({ estado: 'aplicado', filas: [] })),
    ...cambios,
  }
}

function rechazo(
  motivo: 'duplicado' | 'invalido' | 'no_autorizado' | 'actualizar_app',
  detalle?: string,
): ResultadoPush {
  return detalle === undefined
    ? { estado: 'rechazado', motivo }
    : { estado: 'rechazado', motivo, detalle }
}

function puertoPara(
  base: BaseActorDexie,
  remoto: RemotoCompraRapida,
  alcance: AlcanceActor,
) {
  return crearPuertoCompraRapida({
    base: async () => base,
    remoto,
    alcance,
    ahora: () => new Date('2026-11-24T12:00:00.000Z'),
  })
}

describe('armarCatalogo', () => {
  it('solo ofrece categorías activas, ordenadas por orden', () => {
    const catalogo = armarCatalogo({
      ...filasVacias(),
      categorias: [
        { id: 'otros', nombre: 'Otros', icono: null, orden: 9, activa: true },
        { id: 'mercado', nombre: 'Mercado', icono: 'carrito', orden: 1, activa: true },
        { id: 'archivada', nombre: 'Archivada', icono: null, orden: 2, activa: false },
      ],
    })

    expect(catalogo.categorias).toEqual([
      { id: 'mercado', nombre: 'Mercado', icono: 'carrito', orden: 1 },
      { id: 'otros', nombre: 'Otros', icono: null, orden: 9 },
    ])
  })

  it('nombra la tarjeta con los últimos 4 y deja la tasa en null sin tasa', () => {
    const catalogo = armarCatalogo({
      ...filasVacias(),
      medios: [
        { id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo', activo: true },
        { id: 'cerrada', nombre: 'Cuenta vieja', tipo: 'cuenta', activo: false },
      ],
      pasivos: [
        { id: 'visa', tipo: 'tarjeta', nombre: 'Visa', ambito: 'hogar', tasa_tipo: 'EA', tasa_ppm: 283_200, activo: true },
        { id: 'mc', tipo: 'tarjeta', nombre: 'Mastercard', ambito: 'personal', tasa_tipo: null, tasa_ppm: null, activo: true },
        { id: 'fantasma', tipo: 'tarjeta', nombre: 'Sin tarjeta', ambito: 'hogar', tasa_tipo: null, tasa_ppm: null, activo: true },
        { id: 'vieja', tipo: 'tarjeta', nombre: 'Vieja', ambito: 'hogar', tasa_tipo: null, tasa_ppm: null, activo: false },
      ],
      tarjetas: [
        { pasivo_id: 'visa', ultimos_4: '4521', dia_corte: 15, dia_pago: 25 },
        { pasivo_id: 'mc', ultimos_4: null, dia_corte: 5, dia_pago: 10 },
        { pasivo_id: 'vieja', ultimos_4: '0001', dia_corte: 1, dia_pago: 2 },
      ],
    })

    expect(catalogo.medios).toEqual([
      { tipo: 'medio', id: 'efectivo', nombre: 'Efectivo', ambito: null, ownerMiembroId: null },
      {
        tipo: 'tarjeta',
        id: 'mc',
        nombre: 'Mastercard',
        ambito: 'personal',
        ownerMiembroId: null,
        ultimos4: null,
        diaCorte: 5,
        diaPago: 10,
        tasa: null,
      },
      {
        tipo: 'tarjeta',
        id: 'visa',
        nombre: 'Visa ••4521',
        ambito: 'hogar',
        ownerMiembroId: null,
        ultimos4: '4521',
        diaCorte: 15,
        diaPago: 25,
        tasa: { tipo: 'EA', ppm: 283_200 },
      },
    ])
  })

  it('calcula el disponible del préstamo y omite créditos sin desembolso', () => {
    const catalogo = armarCatalogo({
      ...filasVacias(),
      pasivos: [
        { id: 'deuda', tipo: 'deuda', nombre: 'Deuda mamá', ambito: 'personal', tasa_tipo: null, tasa_ppm: null, activo: true },
        { id: 'credito', tipo: 'credito', nombre: 'Crédito cocina', ambito: 'hogar', tasa_tipo: 'EA', tasa_ppm: 240_000, activo: true },
        { id: 'sin-giro', tipo: 'credito', nombre: 'Sin desembolso', ambito: 'hogar', tasa_tipo: null, tasa_ppm: null, activo: true },
      ],
      desembolsos: [
        { pasivo_id: 'deuda', capital: 50_000, fecha_inicio: '2026-11-10' },
        { pasivo_id: 'deuda', capital: 50_000, fecha_inicio: '2026-11-05' },
        { pasivo_id: 'credito', capital: 300_000, fecha_inicio: '2026-10-01' },
      ],
      comprasVinculadas: [
        { financiada_por_pasivo_id: 'deuda', monto_total: 60_000 },
        { financiada_por_pasivo_id: 'credito', monto_total: 100_000 },
      ],
    })

    expect(catalogo.medios).toEqual([
      {
        tipo: 'prestamo',
        id: 'credito',
        nombre: 'Crédito cocina',
        ambito: 'hogar',
        ownerMiembroId: null,
        disponible: 200_000,
        fechaGiro: '2026-10-01',
      },
      {
        tipo: 'prestamo',
        id: 'deuda',
        nombre: 'Deuda mamá',
        ambito: 'personal',
        ownerMiembroId: null,
        disponible: 40_000,
        fechaGiro: '2026-11-05',
      },
    ])
  })

  it('agrupa medios, tarjetas y préstamos en ese orden, cada grupo por nombre', () => {
    const catalogo = armarCatalogo({
      ...filasVacias(),
      medios: [
        { id: 'zeta', nombre: 'Zeta', tipo: 'cuenta', activo: true },
        { id: 'alfa', nombre: 'Alfa', tipo: 'efectivo', activo: true },
      ],
      pasivos: [
        { id: 't-visa', tipo: 'tarjeta', nombre: 'Visa', ambito: 'hogar', tasa_tipo: null, tasa_ppm: null, activo: true },
        { id: 't-amex', tipo: 'tarjeta', nombre: 'Amex', ambito: 'hogar', tasa_tipo: null, tasa_ppm: null, activo: true },
        { id: 'p-mango', tipo: 'deuda', nombre: 'Mango', ambito: 'hogar', tasa_tipo: null, tasa_ppm: null, activo: true },
      ],
      tarjetas: [
        { pasivo_id: 't-visa', ultimos_4: '4521', dia_corte: 15, dia_pago: 25 },
        { pasivo_id: 't-amex', ultimos_4: null, dia_corte: 8, dia_pago: 18 },
      ],
      desembolsos: [{ pasivo_id: 'p-mango', capital: 10_000, fecha_inicio: '2026-11-01' }],
    })

    expect(catalogo.medios.map((medio) => `${medio.tipo}:${medio.nombre}`)).toEqual([
      'medio:Alfa',
      'medio:Zeta',
      'tarjeta:Amex',
      'tarjeta:Visa ••4521',
      'prestamo:Mango',
    ])
  })
})

describe('crearPuertoCompraRapida · catálogo', () => {
  it('guarda la copia local y la usa cuando el remoto falla', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const filas: FilasCatalogo = {
      ...filasVacias(),
      categorias: [{ id: 'cat-mercado', nombre: 'Mercado', icono: null, orden: 1, activa: true }],
    }
    const enLinea = remotoFalso({ leerCatalogo: vi.fn(async () => filas) })

    const catalogo = await puertoPara(base, enLinea, alcance).cargarCatalogo()

    expect(catalogo.categorias.map((categoria) => categoria.nombre)).toEqual(['Mercado'])
    expect(await base.catalogo.count()).toBe(1)

    const sinRed = remotoFalso({
      leerCatalogo: vi.fn(async () => {
        throw new Error('sin red')
      }),
    })
    await expect(puertoPara(base, sinRed, alcance).cargarCatalogo()).resolves.toEqual(catalogo)
  })

  it('sin red y sin copia local explica en español que no hay catálogo', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const sinRed = remotoFalso({
      leerCatalogo: vi.fn(async () => {
        throw new Error('sin red')
      }),
    })

    await expect(puertoPara(base, sinRed, alcance).cargarCatalogo()).rejects.toThrow(
      'Sin conexión y sin copia local del catálogo',
    )
  })
})

describe('crearPuertoCompraRapida · outbox y registros', () => {
  it('guarda el lote pendiente y su registro, y busca por CUFE sin tocar el remoto', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const remoto = remotoFalso({
      buscarPorCufe: vi.fn(async () => {
        throw new Error('no debía consultar el remoto')
      }),
    })
    const puerto = puertoPara(base, remoto, alcance)
    const lote = crearLote()
    const registro: RegistroLocal = {
      ...registroDe(lote, '2026-11-24T10:00:00.000Z'),
      cufe: 'a'.repeat(96),
    }

    await puerto.guardarLote(lote, registro)

    expect(await base.outbox.get(lote.lote_id)).toEqual({
      loteId: lote.lote_id,
      creadoEn: '2026-11-24T10:00:00.000Z',
      lote,
      estado: 'pendiente',
      motivo: null,
    })
    await expect(puerto.buscarPorCufe('a'.repeat(96))).resolves.toEqual({
      fecha: registro.fecha,
      montoTotal: registro.montoTotal,
      descripcion: registro.descripcion,
    })
    expect(remoto.buscarPorCufe).not.toHaveBeenCalled()
  })

  it('registrosDesde devuelve solo los registros creados desde la marca', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const puerto = puertoPara(base, remotoFalso(), alcance)
    const viejo = crearLote(10_000)
    const nuevo = crearLote(20_000)

    await puerto.guardarLote(viejo, registroDe(viejo, '2026-11-24T09:00:00.000Z'))
    await puerto.guardarLote(nuevo, registroDe(nuevo, '2026-11-24T11:00:00.000Z'))

    const desde = await puerto.registrosDesde('2026-11-24T10:00:00.000Z')

    expect(desde.map((registro) => registro.loteId)).toEqual([nuevo.lote_id])
  })

  it('descartarLote borra el pendiente y su registro una sola vez', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const puerto = puertoPara(base, remotoFalso(), alcance)
    const lote = crearLote()

    await puerto.guardarLote(lote, registroDe(lote, '2026-11-24T10:00:00.000Z'))

    await expect(puerto.descartarLote(lote.lote_id)).resolves.toBe(true)
    expect(await base.outbox.count()).toBe(0)
    expect(await base.registros.count()).toBe(0)
    await expect(puerto.descartarLote(lote.lote_id)).resolves.toBe(false)
  })
})

describe('crearPuertoCompraRapida · enviarPendientes', () => {
  it('envía solo los lotes anteriores a la marca, en orden de creadoEn', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const enviados: string[] = []
    const remoto = remotoFalso({
      syncPush: vi.fn(async (lote: LoteCompra): Promise<ResultadoPush> => {
        enviados.push(lote.lote_id)
        return { estado: 'aplicado', filas: [] }
      }),
    })
    const puerto = puertoPara(base, remoto, alcance)
    const primero = crearLote(10_000)
    const segundo = crearLote(20_000)
    const reciente = crearLote(30_000)

    await puerto.guardarLote(segundo, registroDe(segundo, '2026-11-24T10:05:00.000Z'))
    await puerto.guardarLote(primero, registroDe(primero, '2026-11-24T10:00:00.000Z'))
    await puerto.guardarLote(reciente, registroDe(reciente, '2026-11-24T11:00:00.000Z'))

    await puerto.enviarPendientes('2026-11-24T11:00:00.000Z')

    expect(enviados).toEqual([primero.lote_id, segundo.lote_id])
    expect((await base.outbox.get(reciente.lote_id))?.estado).toBe('pendiente')
    await expect(puerto.estadoSincronizacion()).resolves.toEqual({
      pendientes: 1,
      rechazados: [],
    })
  })

  it('un lote aplicado sale del outbox y conserva su registro', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const puerto = puertoPara(base, remotoFalso(), alcance)
    const lote = crearLote()

    await puerto.guardarLote(lote, registroDe(lote, '2026-11-24T10:00:00.000Z'))
    await puerto.enviarPendientes('2026-11-24T12:00:00.000Z')

    expect(await base.outbox.get(lote.lote_id)).toBeUndefined()
    expect(await base.registros.count()).toBe(1)
    await expect(puerto.descartarLote(lote.lote_id)).resolves.toBe(false)
  })

  it('un rechazo por CUFE duplicado muestra el motivo y borra el registro', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const remoto = remotoFalso({
      syncPush: vi.fn(async () => rechazo('duplicado', 'compra_cufe_hogar_key')),
    })
    const puerto = puertoPara(base, remoto, alcance)
    const lote = crearLote()

    await puerto.guardarLote(lote, registroDe(lote, '2026-11-24T10:00:00.000Z'))
    await puerto.enviarPendientes('2026-11-24T12:00:00.000Z')

    await expect(puerto.estadoSincronizacion()).resolves.toEqual({
      pendientes: 0,
      rechazados: [{ loteId: lote.lote_id, motivo: 'Esta factura ya está registrada' }],
    })
    expect((await base.outbox.get(lote.lote_id))?.estado).toBe('rechazado')
    expect(await base.registros.count()).toBe(0)
  })

  it.each([
    ['duplicado', 'otra_restriccion', 'Ya estaba registrada'],
    ['no_autorizado', undefined, 'No tienes permiso para registrar esta compra'],
    ['actualizar_app', undefined, 'Actualiza la app para sincronizar'],
    ['invalido', undefined, 'El servidor rechazó la compra'],
  ] as const)('traduce el rechazo %s en un mensaje en español', async (motivo, detalle, esperado) => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const remoto = remotoFalso({
      syncPush: vi.fn(async () => rechazo(motivo, detalle)),
    })
    const puerto = puertoPara(base, remoto, alcance)
    const lote = crearLote()

    await puerto.guardarLote(lote, registroDe(lote, '2026-11-24T10:00:00.000Z'))
    await puerto.enviarPendientes('2026-11-24T12:00:00.000Z')

    await expect(puerto.estadoSincronizacion()).resolves.toEqual({
      pendientes: 0,
      rechazados: [{ loteId: lote.lote_id, motivo: esperado }],
    })
    expect(await base.registros.count()).toBe(0)
  })

  it('si el envío falla, deja pendientes los lotes restantes y rechaza', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const llamadas: string[] = []
    const remoto = remotoFalso({
      syncPush: vi.fn(async (lote: LoteCompra): Promise<ResultadoPush> => {
        llamadas.push(lote.lote_id)
        if (llamadas.length === 2) throw new Error('sin red')
        return { estado: 'aplicado', filas: [] }
      }),
    })
    const puerto = puertoPara(base, remoto, alcance)
    const primero = crearLote(10_000)
    const segundo = crearLote(20_000)
    const tercero = crearLote(30_000)

    await puerto.guardarLote(primero, registroDe(primero, '2026-11-24T10:00:00.000Z'))
    await puerto.guardarLote(segundo, registroDe(segundo, '2026-11-24T10:01:00.000Z'))
    await puerto.guardarLote(tercero, registroDe(tercero, '2026-11-24T10:02:00.000Z'))

    await expect(puerto.enviarPendientes('2026-11-24T12:00:00.000Z')).rejects.toThrow('sin red')

    expect(llamadas).toEqual([primero.lote_id, segundo.lote_id])
    await expect(puerto.estadoSincronizacion()).resolves.toEqual({
      pendientes: 2,
      rechazados: [],
    })
    expect(await base.outbox.get(primero.lote_id)).toBeUndefined()
  })

  it('dos envíos concurrentes empujan cada lote una sola vez', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    let liberar: () => void = () => undefined
    const bloqueo = new Promise<void>((resolver) => {
      liberar = resolver
    })
    const enviados: string[] = []
    const remoto = remotoFalso({
      syncPush: vi.fn(async (lote: LoteCompra): Promise<ResultadoPush> => {
        await bloqueo
        enviados.push(lote.lote_id)
        return { estado: 'aplicado', filas: [] }
      }),
    })
    const puerto = puertoPara(base, remoto, alcance)
    const lote = crearLote()

    await puerto.guardarLote(lote, registroDe(lote, '2026-11-24T10:00:00.000Z'))

    const primera = puerto.enviarPendientes('2026-11-24T12:00:00.000Z')
    const segunda = puerto.enviarPendientes('2026-11-24T12:00:00.000Z')
    liberar()
    await Promise.all([primera, segunda])

    expect(enviados).toEqual([lote.lote_id])
    expect(remoto.syncPush).toHaveBeenCalledTimes(1)
  })
})

describe('crearPuertoCompraRapida · alias, CUFE remoto y preferencias', () => {
  it('mapea el alias del comercio y devuelve null sin red', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const remoto = remotoFalso({
      buscarAlias: vi.fn(async () => ({
        nombre: 'Tienda del barrio',
        categoria_sugerida_id: 'cat-mercado',
      })),
    })

    await expect(puertoPara(base, remoto, alcance).buscarAlias('890900608')).resolves.toEqual({
      nombreComercio: 'Tienda del barrio',
      categoriaId: 'cat-mercado',
    })

    const sinRed = remotoFalso({
      buscarAlias: vi.fn(async () => {
        throw new Error('sin red')
      }),
    })
    await expect(puertoPara(base, sinRed, alcance).buscarAlias('890900608')).resolves.toBeNull()
  })

  it('busca el CUFE en el remoto cuando no está en el dispositivo y devuelve null sin red', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const remoto = remotoFalso({
      buscarPorCufe: vi.fn(async () => ({
        fecha: '2026-11-10',
        monto_total: 120_000,
        descripcion: 'Supermercado',
      })),
    })

    await expect(puertoPara(base, remoto, alcance).buscarPorCufe('b'.repeat(96))).resolves.toEqual({
      fecha: '2026-11-10',
      montoTotal: 120_000,
      descripcion: 'Supermercado',
    })

    const sinRed = remotoFalso({
      buscarPorCufe: vi.fn(async () => {
        throw new Error('sin red')
      }),
    })
    await expect(puertoPara(base, sinRed, alcance).buscarPorCufe('b'.repeat(96))).resolves.toBeNull()
  })

  it('guarda y lee la preferencia local con la marca de actualización', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const puerto = puertoPara(base, remotoFalso(), alcance)

    await expect(puerto.leerPreferencia('ultimo_medio_de_pago_id:x')).resolves.toBeNull()
    await puerto.guardarPreferencia('ultimo_medio_de_pago_id:x', 'visa')

    await expect(puerto.leerPreferencia('ultimo_medio_de_pago_id:x')).resolves.toBe('visa')
    await expect(base.preferencias.get('ultimo_medio_de_pago_id:x')).resolves.toEqual({
      clave: 'ultimo_medio_de_pago_id:x',
      valor: 'visa',
      actualizadoEn: '2026-11-24T12:00:00.000Z',
    })
  })
})
