import 'fake-indexeddb/auto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatosDespensa, ResultadoEnvioMascotas } from '../app/controladorMascotas'
import type { LoteMascotas } from '../domain/loteMascotas'
import { crearBaseActor, type AlcanceActor, type BaseActorDexie } from './db'
import {
  crearPuertoMascotas,
  crearRemotoMascotas,
  type RemotoMascotas,
} from './mascotas'

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

function datosBase(): DatosDespensa {
  return {
    mascotas: [
      { id: '01950000-0000-7000-8000-000000000501', nombre: 'Luna', especie: 'perro', fechaNacimiento: null, activa: true },
    ],
    items: [],
    observaciones: [],
    compras: [],
    categorias: [{ id: '01950000-0000-7000-8000-000000000201', nombre: 'Mascotas' }],
    medios: [],
  }
}

describe('crearPuertoMascotas', () => {
  it('guarda instantánea en Dexie y devuelve respaldo offline', async () => {
    const alcance = nuevoAlcance()
    const base = await abrirBase(alcance)
    const datos = datosBase()
    const remoto: RemotoMascotas = {
      leer: vi.fn(async () => datos),
      enviarLote: vi.fn(async (): Promise<ResultadoEnvioMascotas> => ({ estado: 'aplicado' })),
    }
    const puerto = crearPuertoMascotas({
      base: async () => base,
      remoto,
      hogarId: alcance.hogarId,
      ahora: () => new Date('2026-11-22T12:00:00.000Z'),
    })

    await expect(puerto.leer()).resolves.toEqual(datos)
    await puerto.guardarInstantanea(datos)
    await expect(puerto.leerInstantanea()).resolves.toEqual(datos)

    const lote: LoteMascotas = {
      lote_id: crypto.randomUUID(),
      hogar_id: alcance.hogarId,
      schema_version: 1,
      tipo: 'mascota',
      filas: {
        mascota: [{ id: crypto.randomUUID(), nombre: 'Milo', especie: 'gato', fecha_nacimiento: null, activa: true }],
      },
    }
    await expect(puerto.enviarLote(lote)).resolves.toEqual({ estado: 'aplicado' })
  })
})

describe('crearRemotoMascotas', () => {
  it('conserva mascotas inactivas para histórico, enlaza ámbito de nivel_despensa con compra y envía RPC', async () => {
    const idHogar = '01950000-0000-7000-8000-000000000001'
    const idMascotaActiva = '01950000-0000-7000-8000-000000000501'
    const idMascotaInactiva = '01950000-0000-7000-8000-000000000502'
    const idItem = '01950000-0000-7000-8000-000000000601'
    const idCat = '01950000-0000-7000-8000-000000000201'
    const idCompraPers = '01950000-0000-7000-8000-000000000801'
    const idNivelAjuste = '01950000-0000-7000-8000-000000000701'
    const idNivelPers = '01950000-0000-7000-8000-000000000702'

    const tablas: Record<string, unknown[]> = {
      mascota: [
        { id: idMascotaActiva, nombre: 'Luna', especie: 'perro', fecha_nacimiento: null, activa: true },
        { id: idMascotaInactiva, nombre: 'Toby', especie: 'perro', fecha_nacimiento: null, activa: false },
      ],
      item_despensa: [
        {
          id: idItem,
          mascota_id: idMascotaActiva,
          nombre: 'Concentrado 15 kg',
          tipo: 'comida',
          categoria_id: idCat,
          frecuencia_dias: 30,
          umbral_alerta_pct: 20,
          monto_habitual: 180_000,
          activo: true,
        },
      ],
      nivel_despensa: [
        { id: idNivelAjuste, item_despensa_id: idItem, compra_id: null, fecha: '2026-11-20', nivel_pct: 25, origen: 'ajuste' },
        { id: idNivelPers, item_despensa_id: idItem, compra_id: idCompraPers, fecha: '2026-11-22', nivel_pct: 100, origen: 'compra' },
      ],
      compra: [
        {
          id: idCompraPers,
          fecha: '2026-11-22',
          descripcion: 'Bulto personal',
          monto_total: 180_000,
          categoria_id: idCat,
          ambito: 'personal',
          mascota_id: idMascotaActiva,
          item_despensa_id: idItem,
          financiada_por_pasivo_id: null,
        },
      ],
      categoria: [
        { id: idCat, nombre: 'Mascotas', icono: null, orden: 4, activa: false },
      ],
      medio_de_pago: [],
      pasivo: [],
      tarjeta: [],
      plan_de_cuotas: [],
    }

    const filtrosLlamados: string[] = []
    const cliente = {
      from: vi.fn((tabla: string) => {
        const consulta = {
          select: () => consulta,
          eq: (col: string, val: unknown) => {
            filtrosLlamados.push(`${tabla}.${col}=${String(val)}`)
            return consulta
          },
          is: () => Promise.resolve({ data: tablas[tabla] ?? [], error: null }),
        }
        return consulta
      }),
      rpc: vi.fn(async () => ({ data: { estado: 'aplicado', filas: [] }, error: null })),
    } as unknown as SupabaseClient

    const remoto = crearRemotoMascotas(cliente)
    const leido = await remoto.leer(idHogar)

    expect(leido.mascotas).toHaveLength(2)
    expect(leido.categorias).toEqual([{ id: idCat, nombre: 'Mascotas' }])
    expect(filtrosLlamados).not.toContain('mascota.activa=true')
    expect(leido.observaciones).toEqual([
      {
        id: idNivelAjuste,
        itemDespensaId: idItem,
        compraId: null,
        fecha: '2026-11-20',
        nivelPct: 25,
        origen: 'ajuste',
        ambito: 'hogar',
      },
      {
        id: idNivelPers,
        itemDespensaId: idItem,
        compraId: idCompraPers,
        fecha: '2026-11-22',
        nivelPct: 100,
        origen: 'compra',
        ambito: 'personal',
      },
    ])

    await remoto.enviarLote({
      lote_id: idNivelAjuste,
      hogar_id: idHogar,
      schema_version: 1,
      tipo: 'mascota',
      filas: {
        mascota: [{ id: idMascotaActiva, nombre: 'Luna', especie: 'perro', fecha_nacimiento: null, activa: true }],
      },
    })
    expect(cliente.rpc).toHaveBeenCalledWith('sync_push_mascotas', expect.anything())
  })
})
