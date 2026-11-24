import 'fake-indexeddb/auto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatosObligaciones, ResultadoEnvio } from '../app/controladorObligaciones'
import type { LoteObligaciones } from '../domain/loteObligaciones'
import { crearBaseActor, type AlcanceActor, type BaseActorDexie } from './db'
import {
  crearPuertoObligaciones,
  crearRemotoObligaciones,
  type RemotoObligaciones,
} from './obligaciones'

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

function datosBase(): DatosObligaciones {
  return {
    miembros: [{ id: 'miembro-1', nombre: 'Camila' }],
    categorias: [],
    medios: [],
    pasivos: [],
    planes: [],
    cuotas: [],
    costos: [],
    pagos: [],
    obligaciones: [],
    compras: [],
  }
}

function loteBase(): LoteObligaciones {
  return {
    lote_id: crypto.randomUUID(),
    hogar_id: crypto.randomUUID(),
    schema_version: 1,
    tipo: 'pago',
    filas: { pago_de_deuda: [{ id: crypto.randomUUID(), pasivo_id: crypto.randomUUID(), monto: 100_000 }] },
  }
}

function remotoFalso(cambios: Partial<RemotoObligaciones> = {}): RemotoObligaciones {
  return {
    leer: vi.fn(async () => datosBase()),
    enviar: vi.fn(async (): Promise<ResultadoEnvio> => ({ estado: 'aplicado' })),
    ...cambios,
  }
}

function puertoPara(
  base: BaseActorDexie,
  remoto: RemotoObligaciones,
  alcance: AlcanceActor,
) {
  return crearPuertoObligaciones({
    base: async () => base,
    remoto,
    hogarId: alcance.hogarId,
    ahora: () => new Date('2026-11-24T12:00:00.000Z'),
  })
}

describe('crearPuertoObligaciones · cargar', () => {
  it('guarda la copia local y la usa cuando el remoto falla', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const datos = datosBase()
    const enLinea = remotoFalso({ leer: vi.fn(async () => datos) })

    await expect(puertoPara(base, enLinea, alcance).cargar()).resolves.toEqual(datos)
    await expect(base.instantaneas.get('obligaciones')).resolves.toEqual({
      clave: 'obligaciones',
      valor: datos,
      actualizadoEn: '2026-11-24T12:00:00.000Z',
    })

    const sinRed = remotoFalso({
      leer: vi.fn(async () => {
        throw new Error('sin red')
      }),
    })
    await expect(puertoPara(base, sinRed, alcance).cargar()).resolves.toEqual(datos)
  })

  it('sin red y sin copia local explica en español que no hay datos', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const sinRed = remotoFalso({
      leer: vi.fn(async () => {
        throw new Error('sin red')
      }),
    })

    await expect(puertoPara(base, sinRed, alcance).cargar()).rejects.toThrow(
      'Sin conexión y sin copia local de obligaciones',
    )
  })
})

describe('crearPuertoObligaciones · enviar', () => {
  it('pasa el lote al remoto y devuelve su resultado', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const remoto = remotoFalso()
    const lote = loteBase()

    await expect(puertoPara(base, remoto, alcance).enviar(lote)).resolves.toEqual({ estado: 'aplicado' })
    expect(remoto.enviar).toHaveBeenCalledWith(lote)
  })

  it('propaga el error del remoto: el pago no tiene outbox', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const remoto = remotoFalso({
      enviar: vi.fn(async () => {
        throw new Error('sin red')
      }),
    })

    await expect(puertoPara(base, remoto, alcance).enviar(loteBase())).rejects.toThrow('sin red')
  })
})

describe('crearPuertoObligaciones · preferencias', () => {
  it('guarda y lee la preferencia local con la marca de actualización', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const puerto = puertoPara(base, remotoFalso(), alcance)

    await expect(puerto.leerPreferencia('incluir_personales:camila')).resolves.toBeNull()
    await puerto.guardarPreferencia('incluir_personales:camila', 'true')

    await expect(puerto.leerPreferencia('incluir_personales:camila')).resolves.toBe('true')
    await expect(base.preferencias.get('incluir_personales:camila')).resolves.toEqual({
      clave: 'incluir_personales:camila',
      valor: 'true',
      actualizadoEn: '2026-11-24T12:00:00.000Z',
    })
  })
})

// ---------------------------------------------------------------------------
// Remoto Supabase con un cliente falso encadenable
// ---------------------------------------------------------------------------

type RespuestaFalsa = { data: unknown; error: unknown }

function clienteFalso(
  respuestas: Record<string, RespuestaFalsa>,
  rpc: RespuestaFalsa,
) {
  const rpcFalso = vi.fn(async () => rpc)
  const cliente = {
    from(tabla: string) {
      const respuesta = respuestas[tabla] ?? { data: [], error: null }
      const cadena = {
        select: () => cadena,
        eq: () => cadena,
        is: () => cadena,
        then: (resolver: (valor: RespuestaFalsa) => unknown) => Promise.resolve(resolver(respuesta)),
      }
      return cadena
    },
    rpc: rpcFalso,
  }
  return { cliente: cliente as unknown as SupabaseClient, rpc: rpcFalso }
}

const IDS = {
  miembro: crypto.randomUUID(),
  categoria: crypto.randomUUID(),
  medio: crypto.randomUUID(),
  pasivoConTarjeta: crypto.randomUUID(),
  pasivoSinTarjeta: crypto.randomUUID(),
  plan: crypto.randomUUID(),
  cuota: crypto.randomUUID(),
  costo: crypto.randomUUID(),
  pago: crypto.randomUUID(),
  obligacion: crypto.randomUUID(),
  compra: crypto.randomUUID(),
}

function filasRemotas(): Record<string, RespuestaFalsa> {
  return {
    miembro: {
      data: [{ id: IDS.miembro, nombre: 'Camila' }],
      error: null,
    },
    categoria: {
      data: [{ id: IDS.categoria, nombre: 'Mercado' }],
      error: null,
    },
    medio_de_pago: {
      data: [{ id: IDS.medio, nombre: 'Nequi · Camila', owner_miembro_id: IDS.miembro }],
      error: null,
    },
    pasivo: {
      data: [
        { id: IDS.pasivoConTarjeta, tipo: 'tarjeta', nombre: 'Visa', ambito: 'hogar', owner_miembro_id: null },
        { id: IDS.pasivoSinTarjeta, tipo: 'deuda', nombre: 'Deuda mamá', ambito: 'personal', owner_miembro_id: IDS.miembro },
      ],
      error: null,
    },
    tarjeta: {
      data: [{ pasivo_id: IDS.pasivoConTarjeta, ultimos_4: '4521' }],
      error: null,
    },
    plan_de_cuotas: {
      data: [{
        id: IDS.plan,
        pasivo_id: IDS.pasivoConTarjeta,
        compra_id: IDS.compra,
        fecha_inicio: '2026-11-10',
        capital: 300_000,
        sistema: 'capital_fijo',
        n_cuotas: 3,
      }],
      error: null,
    },
    cuota: {
      data: [{
        id: IDS.cuota,
        plan_id: IDS.plan,
        numero: 1,
        fecha_vencimiento: '2026-11-25',
        capital: 100_000,
      }],
      error: null,
    },
    costo_financiero: {
      data: [{
        id: IDS.costo,
        pasivo_id: IDS.pasivoConTarjeta,
        cuota_id: IDS.cuota,
        monto: 6_299,
        fecha_causacion: '2026-11-25',
        origen: 'calculado',
        seq: 41,
      }],
      error: null,
    },
    pago_de_deuda: {
      data: [{
        id: IDS.pago,
        pasivo_id: IDS.pasivoConTarjeta,
        tipo: 'abono',
        cuota_id: IDS.cuota,
        monto: 106_299,
        fecha: '2026-11-25',
        registrado_por: IDS.miembro,
      }],
      error: null,
    },
    obligacion: {
      data: [{
        id: IDS.obligacion,
        nombre: 'Arriendo apartamento',
        categoria_id: IDS.categoria,
        monto_estimado: 1_800_000,
        dia_vencimiento: 5,
        periodicidad: 'mensual',
        mes_inicio: '2026-01',
        activa: true,
      }],
      error: null,
    },
    compra: {
      data: [{
        id: IDS.compra,
        fecha: '2026-11-10',
        monto_total: 300_000,
        ambito: 'hogar',
        miembro_id: null,
        descripcion: 'Mercado Éxito',
        obligacion_id: null,
        periodo: null,
      }],
      error: null,
    },
  }
}

describe('crearRemotoObligaciones · leer', () => {
  it('mapea las filas visibles y une la tarjeta con su pasivo', async () => {
    const { cliente } = clienteFalso(filasRemotas(), { data: null, error: null })
    const remoto = crearRemotoObligaciones(cliente)

    const datos = await remoto.leer(crypto.randomUUID())

    expect(datos).toEqual({
      miembros: [{ id: IDS.miembro, nombre: 'Camila' }],
      categorias: [{ id: IDS.categoria, nombre: 'Mercado' }],
      medios: [{ id: IDS.medio, nombre: 'Nequi · Camila', owner_miembro_id: IDS.miembro }],
      pasivos: [
        {
          id: IDS.pasivoConTarjeta,
          tipo: 'tarjeta',
          nombre: 'Visa',
          ambito: 'hogar',
          owner_miembro_id: null,
          ultimos_4: '4521',
        },
        {
          id: IDS.pasivoSinTarjeta,
          tipo: 'deuda',
          nombre: 'Deuda mamá',
          ambito: 'personal',
          owner_miembro_id: IDS.miembro,
          ultimos_4: null,
        },
      ],
      planes: [{
        id: IDS.plan,
        pasivo_id: IDS.pasivoConTarjeta,
        compra_id: IDS.compra,
        fecha_inicio: '2026-11-10',
        capital: 300_000,
        sistema: 'capital_fijo',
        n_cuotas: 3,
      }],
      cuotas: [{
        id: IDS.cuota,
        plan_id: IDS.plan,
        numero: 1,
        fecha_vencimiento: '2026-11-25',
        capital: 100_000,
      }],
      costos: [{
        id: IDS.costo,
        pasivo_id: IDS.pasivoConTarjeta,
        cuota_id: IDS.cuota,
        monto: 6_299,
        fecha_causacion: '2026-11-25',
        origen: 'calculado',
        seq: 41,
      }],
      pagos: [{
        id: IDS.pago,
        pasivo_id: IDS.pasivoConTarjeta,
        tipo: 'abono',
        cuota_id: IDS.cuota,
        monto: 106_299,
        fecha: '2026-11-25',
        registrado_por: IDS.miembro,
      }],
      obligaciones: [{
        id: IDS.obligacion,
        nombre: 'Arriendo apartamento',
        categoria_id: IDS.categoria,
        monto_estimado: 1_800_000,
        dia_vencimiento: 5,
        periodicidad: 'mensual',
        mes_inicio: '2026-01',
        activa: true,
      }],
      compras: [{
        id: IDS.compra,
        fecha: '2026-11-10',
        monto_total: 300_000,
        ambito: 'hogar',
        miembro_id: null,
        descripcion: 'Mercado Éxito',
        obligacion_id: null,
        periodo: null,
      }],
    })
  })

  it('un error de la base rechaza la lectura', async () => {
    const filas = filasRemotas()
    filas.pasivo = { data: null, error: new Error('sin permiso') }
    const { cliente } = clienteFalso(filas, { data: null, error: null })

    await expect(crearRemotoObligaciones(cliente).leer(crypto.randomUUID())).rejects.toThrow('sin permiso')
  })
})

describe('crearRemotoObligaciones · enviar', () => {
  it('manda el lote a sync_push_obligaciones y traduce el resultado aplicado', async () => {
    const lote = loteBase()
    const { cliente, rpc } = clienteFalso(filasRemotas(), {
      data: {
        estado: 'aplicado',
        filas: [{ tabla: 'pago_de_deuda', id: crypto.randomUUID(), seq: 7 }],
      },
      error: null,
    })

    await expect(crearRemotoObligaciones(cliente).enviar(lote)).resolves.toEqual({ estado: 'aplicado' })
    expect(rpc).toHaveBeenCalledWith('sync_push_obligaciones', { p_lote: lote })
  })

  it('conserva el detalle de un rechazo y lo omite cuando no viene', async () => {
    const conDetalle = clienteFalso(filasRemotas(), {
      data: { estado: 'rechazado', motivo: 'duplicado', detalle: 'pago_de_deuda_cuota_key' },
      error: null,
    })
    await expect(crearRemotoObligaciones(conDetalle.cliente).enviar(loteBase())).resolves.toEqual({
      estado: 'rechazado',
      motivo: 'duplicado',
      detalle: 'pago_de_deuda_cuota_key',
    })

    const sinDetalle = clienteFalso(filasRemotas(), {
      data: { estado: 'rechazado', motivo: 'invalido' },
      error: null,
    })
    const resultado = await crearRemotoObligaciones(sinDetalle.cliente).enviar(loteBase())
    expect(resultado).toEqual({ estado: 'rechazado', motivo: 'invalido' })
    expect(resultado).not.toHaveProperty('detalle')
  })

  it('un error del RPC rechaza el envío', async () => {
    const { cliente } = clienteFalso(filasRemotas(), { data: null, error: new Error('sin red') })

    await expect(crearRemotoObligaciones(cliente).enviar(loteBase())).rejects.toThrow('sin red')
  })
})
