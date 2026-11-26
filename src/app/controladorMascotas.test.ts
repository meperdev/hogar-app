import { describe, expect, it, vi } from 'vitest'
import {
  crearControladorMascotas,
  ErrorMascotas,
  type DatosDespensa,
  type MascotasPort,
} from './controladorMascotas'

let seq = 0
const nuevoId = () => `01950000-0000-7000-8000-${String(++seq).padStart(12, '0')}`
const alcance = { hogarId: 'h-1', miembroId: 'm-santiago' }
const ahora = () => new Date('2026-11-22T15:00:00Z')

function datosBase(): DatosDespensa {
  return {
    mascotas: [
      { id: 'mas-luna', nombre: 'Luna', especie: 'perro', fechaNacimiento: null, activa: true },
      { id: 'mas-milo', nombre: 'Milo', especie: 'gato', fechaNacimiento: null, activa: true },
      { id: 'mas-toby', nombre: 'Toby', especie: 'perro', fechaNacimiento: null, activa: false },
    ],
    items: [
      {
        id: 'it-conc',
        mascotaId: 'mas-luna',
        nombre: 'Concentrado adulto 12 kg',
        tipo: 'comida',
        categoriaId: 'cat-mascotas',
        frecuenciaDias: 35,
        umbralAlertaPct: 20,
        montoHabitual: 165_000,
        activo: true,
      },
      {
        id: 'it-arena',
        mascotaId: 'mas-milo',
        nombre: 'Arena sanitaria 10 kg',
        tipo: 'higiene',
        categoriaId: 'cat-mascotas',
        frecuenciaDias: 25,
        umbralAlertaPct: 20,
        montoHabitual: 42_000,
        activo: true,
      },
      {
        id: 'it-viejo',
        mascotaId: 'mas-toby',
        nombre: 'Vitaminas',
        tipo: 'salud',
        categoriaId: 'cat-mascotas',
        frecuenciaDias: 30,
        umbralAlertaPct: 20,
        montoHabitual: 50_000,
        activo: false,
      },
    ],
    observaciones: [
      {
        id: 'obs-1',
        itemDespensaId: 'it-conc',
        compraId: null,
        fecha: '2026-11-22',
        nivelPct: 15,
        origen: 'ajuste',
        ambito: 'hogar',
      },
      {
        id: 'obs-2',
        itemDespensaId: 'it-arena',
        compraId: 'comp-arena',
        fecha: '2026-11-11',
        nivelPct: 100,
        origen: 'compra',
        ambito: 'hogar',
      },
    ],
    compras: [
      {
        id: 'comp-1',
        fecha: '2026-11-15',
        descripcion: 'Concentrado Milo',
        montoTotal: 68_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: 'mas-milo',
        itemDespensaId: null,
      },
      {
        id: 'comp-arena',
        fecha: '2026-11-11',
        descripcion: 'Arena sanitaria 10 kg',
        montoTotal: 42_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: 'mas-milo',
        itemDespensaId: 'it-arena',
      },
      {
        id: 'comp-vet',
        fecha: '2026-11-08',
        descripcion: 'Vacuna Luna',
        montoTotal: 115_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: 'mas-luna',
        itemDespensaId: null,
      },
      {
        id: 'comp-comp',
        fecha: '2026-11-14',
        descripcion: 'Shampoo y bolsas',
        montoTotal: 20_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: null,
        itemDespensaId: null,
      },
      // Excluidas
      {
        id: 'comp-taxi',
        fecha: '2026-11-08',
        descripcion: 'Taxi veterinaria',
        montoTotal: 18_000,
        categoriaId: 'cat-transporte',
        ambito: 'hogar',
        mascotaId: 'mas-luna',
        itemDespensaId: null,
      },
      {
        id: 'comp-pers',
        fecha: '2026-11-16',
        descripcion: 'Correa personal',
        montoTotal: 35_000,
        categoriaId: 'cat-mascotas',
        ambito: 'personal',
        mascotaId: 'mas-luna',
        itemDespensaId: null,
      },
      // Diciembre para probar mascota archivada
      {
        id: 'comp-toby',
        fecha: '2026-12-01',
        descripcion: 'Control Toby',
        montoTotal: 90_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: 'mas-toby',
        itemDespensaId: null,
      },
    ],
    categorias: [
      { id: 'cat-mascotas', nombre: 'Mascotas' },
      { id: 'cat-transporte', nombre: 'Transporte' },
    ],
    medios: [
      { id: 'med-comun', nombre: 'Cuenta común', tipo: 'medio', ambito: null },
      {
        id: 'tar-visa',
        nombre: 'Visa hogar',
        tipo: 'tarjeta',
        ambito: 'hogar',
        ultimos4: '4521',
        diaCorte: 25,
        diaPago: 10,
        tasa: null,
      },
    ],
  }
}

function crearPuertoMock(datos = datosBase()): {
  port: MascotasPort
  enviarLote: ReturnType<typeof vi.fn>
} {
  let snapshot: DatosDespensa | null = null
  const enviarLote = vi.fn(async () => ({ estado: 'aplicado' as const }))
  const port: MascotasPort = {
    leer: vi.fn(async () => datos),
    leerInstantanea: vi.fn(async () => snapshot),
    guardarInstantanea: vi.fn(async (d) => {
      snapshot = d
    }),
    enviarLote,
  }
  return { port, enviarLote }
}

describe('controladorMascotas', () => {
  it('carga vista online con alerta primero, gasto reconciliado $245.000 y conserva mascotas inactivas para histórico', async () => {
    const { port } = crearPuertoMock()
    const ctrl = crearControladorMascotas({ port, alcance, ahora, nuevoId })

    const vista = await ctrl.cargar('2026-11')
    expect(vista.sinConexion).toBe(false)
    expect(vista.gastoMes.total).toBe(245_000)
    expect(vista.gastoMes.sinEtiqueta).toBe(20_000)
    expect(vista.mascotasActivas.map((m) => m.nombre)).toEqual(['Luna', 'Milo'])
    expect(vista.items.map((e) => e.item.id)).toEqual(['it-conc', 'it-arena'])
    expect(vista.items[0]).toMatchObject({ alerta: true, nivelActual: 15, diasRestantes: 5 })

    const dic = await ctrl.cargar('2026-12')
    expect(dic.gastoMes.porMascota).toEqual([{ mascotaId: 'mas-toby', nombre: 'Toby', monto: 90_000 }])
  })

  it('usa instantánea offline cuando falla la lectura remota', async () => {
    const datos = datosBase()
    const { port } = crearPuertoMock(datos)
    const ctrl = crearControladorMascotas({ port, alcance, ahora, nuevoId })

    await ctrl.cargar('2026-11')
    vi.mocked(port.leer).mockRejectedValueOnce(new Error('Sin red'))

    const offline = await ctrl.cargar('2026-11')
    expect(offline.sinConexion).toBe(true)
    expect(offline.gastoMes.total).toBe(245_000)
  })

  it('crea mascota, insumo y ajuste de nivel y mapea rechazos del servidor', async () => {
    const { port, enviarLote } = crearPuertoMock()
    const ctrl = crearControladorMascotas({ port, alcance, ahora, nuevoId })

    await ctrl.crearMascota({ nombre: 'Nala', especie: 'gato', fechaNacimiento: null })
    expect(enviarLote).toHaveBeenLastCalledWith(
      expect.objectContaining({ tipo: 'mascota' }),
    )

    await ctrl.crearInsumo({
      nombre: 'Antipulgas',
      mascotaId: null,
      tipo: 'salud',
      categoriaId: 'cat-mascotas',
      frecuenciaDias: 30,
      umbralAlertaPct: 20,
      montoHabitual: 95_000,
    })
    expect(enviarLote).toHaveBeenLastCalledWith(
      expect.objectContaining({ tipo: 'item_despensa' }),
    )

    await ctrl.ajustarNivel({ itemDespensaId: 'it-conc', nivelPct: 0 })
    expect(enviarLote).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tipo: 'ajuste_nivel',
        filas: {
          nivel_despensa: [expect.objectContaining({ compra_id: null, nivel_pct: 0, origen: 'ajuste' })],
        },
      }),
    )

    enviarLote.mockResolvedValueOnce({
      estado: 'rechazado',
      motivo: 'invalido',
      detalle: 'una compra personal no actualiza el monto habitual compartido',
    })
    await expect(
      ctrl.recomprar({
        itemId: 'it-conc',
        mascotaId: 'mas-luna',
        fecha: '2026-11-22',
        descripcion: 'Concentrado adulto 12 kg · Luna',
        monto: 165_000,
        ambito: 'hogar',
        medioId: 'med-comun',
        cuotas: 1,
        actualizarMontoHabitual: false,
      }),
    ).rejects.toThrow(ErrorMascotas)
  })

  it('envía recompra a cuotas sin doble conteo y bloquea actualizar monto_habitual en personal (I23)', async () => {
    const { port, enviarLote } = crearPuertoMock()
    const ctrl = crearControladorMascotas({ port, alcance, ahora, nuevoId })

    await ctrl.recomprar({
      itemId: 'it-conc',
      mascotaId: 'mas-luna',
      fecha: '2026-11-22',
      descripcion: 'Concentrado adulto 12 kg',
      monto: 180_000,
      ambito: 'hogar',
      medioId: 'tar-visa',
      cuotas: 3,
      actualizarMontoHabitual: true,
    })

    expect(enviarLote).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tipo: 'recompra',
        actualizar_monto_habitual: true,
        filas: expect.objectContaining({
          compra: [expect.objectContaining({ pago_tipo: 'financiado', monto_total: 180_000 })],
          cuota: expect.arrayContaining([
            expect.objectContaining({ numero: 1, capital: 60_000 }),
          ]),
          nivel_despensa: [expect.objectContaining({ nivel_pct: 100, origen: 'compra' })],
        }),
      }),
    )

    await expect(
      ctrl.recomprar({
        itemId: 'it-conc',
        mascotaId: 'mas-luna',
        fecha: '2026-11-22',
        descripcion: 'Concentrado personal',
        monto: 180_000,
        ambito: 'personal',
        medioId: 'med-comun',
        cuotas: 1,
        actualizarMontoHabitual: true,
      }),
    ).rejects.toThrow(ErrorMascotas)
  })
})
