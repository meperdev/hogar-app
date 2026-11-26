import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import {
  crearPuertoBalance,
  crearRemotoBalance,
  type RemotoBalance,
} from './balance'
import { abrirBaseActor } from './db'
import type { DatosBalance } from '../app/controladorBalance'
import type { LoteBalance } from '../domain/loteBalance'
import { construirLoteCompra } from '../domain/loteCompra'

const HOGAR = '01950000-0000-7000-8000-000000000010'
const ANA = '01950000-0000-7000-8000-000000000001'
const BETO = '01950000-0000-7000-8000-000000000002'

function datosMuestra(): DatosBalance {
  return {
    hogar: { id: HOGAR, nombre: 'Casa', mostrar_pct_ingreso: false, seq: 1 },
    miembros: [
      { id: ANA, nombre: 'Ana', activo: true },
      { id: BETO, nombre: 'Beto', activo: true },
    ],
    medios: [
      { id: '01950000-0000-7000-8000-000000000011', nombre: 'Cuenta Ana', tipo: 'cuenta', owner_tipo: 'miembro', owner_miembro_id: ANA },
    ],
    compras: [],
    pasivos: [],
    planes: [],
    costos: [],
    pagos: [],
    aportes: [],
    ingresos: [],
    recepciones: [],
  }
}

describe('adaptador de datos de balance y exportación', () => {
  it('cachea la instantánea por actor y funciona offline desde Dexie', async () => {
    const baseAna = await abrirBaseActor({ hogarId: HOGAR, miembroId: ANA })
    await baseAna.delete()
    const base = await abrirBaseActor({ hogarId: HOGAR, miembroId: ANA })

    const remoto: RemotoBalance = {
      leer: vi.fn(async () => datosMuestra()),
      enviar: vi.fn(async () => ({ estado: 'aplicado' as const })),
      exportar: vi.fn(async (fecha: string) => ({
        hogar: { alcance: 'hogar' as const, fecha, tablas: { compra: [] } },
        personal: { alcance: 'personal' as const, fecha, tablas: { compra: [] } },
      })),
      listarRespaldos: vi.fn(async () => []),
    }

    const puerto = crearPuertoBalance({
      base: async () => base,
      remoto,
      alcance: { hogarId: HOGAR, miembroId: ANA },
      ahora: () => new Date('2026-11-25T15:00:00Z'),
    })

    const primero = await puerto.cargar()
    expect(primero.hogar.nombre).toBe('Casa')

    vi.mocked(remoto.leer).mockRejectedValueOnce(new Error('Sin red'))
    const desdeCache = await puerto.cargar()
    expect(desdeCache.hogar.nombre).toBe('Casa')

    // Otro actor no ve la instantánea de Ana
    const baseBeto = await abrirBaseActor({ hogarId: HOGAR, miembroId: BETO })
    await baseBeto.delete()
    const baseBetoNueva = await abrirBaseActor({ hogarId: HOGAR, miembroId: BETO })
    const remotoBeto: RemotoBalance = {
      ...remoto,
      leer: vi.fn(async () => {
        throw new Error('Sin red')
      }),
    }
    const puertoBeto = crearPuertoBalance({
      base: async () => baseBetoNueva,
      remoto: remotoBeto,
      alcance: { hogarId: HOGAR, miembroId: BETO },
    })
    await expect(puertoBeto.cargar()).rejects.toThrow('Sin conexión')

    base.close()
    baseBetoNueva.close()
  })

  it('reporta outbox pendiente, último medio recordado y propaga envío y exportación', async () => {
    const base = await abrirBaseActor({ hogarId: HOGAR, miembroId: ANA })
    await base.preferencias.put({
      clave: `ultimo_medio_de_pago_id:${ANA}`,
      valor: '01950000-0000-7000-8000-000000000011',
      actualizadoEn: '2026-11-25T14:00:00Z',
    })
    const loteCompra = construirLoteCompra(
      {
        hogarId: HOGAR,
        actorId: ANA,
        fecha: '2026-11-25',
        descripcion: 'Pan',
        monto: 10_000,
        categoriaId: '01950000-0000-7000-8000-000000000201',
        ambito: 'hogar',
        pago: {
          tipo: 'medio',
          medioDePagoId: '01950000-0000-7000-8000-000000000011',
        },
        factura: null,
        alias: null,
      },
      () => '01950000-0000-7000-8000-000000000999',
    )
    await base.outbox.put({
      loteId: loteCompra.lote_id,
      creadoEn: '2026-11-25T14:05:00Z',
      lote: loteCompra,
      estado: 'pendiente',
      motivo: null,
    })

    const remoto: RemotoBalance = {
      leer: vi.fn(async () => datosMuestra()),
      enviar: vi.fn(async (_lote: LoteBalance) => ({ estado: 'aplicado' as const })),
      exportar: vi.fn(async (fecha: string) => ({
        hogar: { alcance: 'hogar' as const, fecha, tablas: { compra: [{ id: 'h1' }] } },
        personal: { alcance: 'personal' as const, fecha, tablas: { compra: [{ id: 'p1' }] } },
      })),
      listarRespaldos: vi.fn(async () => [
        { fecha: '2026-11-22', alcance: 'hogar' as const, nombre: 'hogar.zip', tamanoBytes: 1024 },
      ]),
    }

    const puerto = crearPuertoBalance({
      base: async () => base,
      remoto,
      alcance: { hogarId: HOGAR, miembroId: ANA },
    })

    await puerto.cargar()
    const estado = await puerto.estadoLocal()
    expect(estado.pendientesOutbox).toBe(1)
    expect(estado.ultimoMedioNombre).toBe('Cuenta Ana')
    expect(estado.historial).toHaveLength(1)

    const alcances = await puerto.exportarAlcances('2026-11-25')
    expect(alcances.hogar.alcance).toBe('hogar')
    expect(alcances.personal.alcance).toBe('personal')

    base.close()
  })

  it('crearRemotoBalance valida la respuesta de sync_push_balance y exportaciones', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'sync_push_balance') {
        return { data: { estado: 'aplicado', filas: [] }, error: null }
      }
      if (fn === 'exportar_hogar') {
        return { data: { alcance: 'hogar', fecha: '2026-11-25', tablas: {} }, error: null }
      }
      return { data: { alcance: 'personal', fecha: '2026-11-25', tablas: {} }, error: null }
    })
    const clienteMock = {
      rpc,
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
        }),
      },
    }
    const remoto = crearRemotoBalance(clienteMock as never)
    const exp = await remoto.exportar('2026-11-25', HOGAR)
    expect(exp.hogar.alcance).toBe('hogar')
    expect(exp.personal.alcance).toBe('personal')
  })
})
