import { describe, expect, it } from 'vitest'
import {
  construirLoteAjusteNivel,
  construirLoteItemDespensa,
  construirLoteMascota,
  construirLoteRecompra,
  ErrorLoteMascotas,
} from './loteMascotas'

let seq = 0
const nuevoId = () => `01950000-0000-7000-8000-${String(++seq).padStart(12, '0')}`

describe('lotes de despensa de mascotas', () => {
  it('construye lote de alta de mascota y valida nombre visible', () => {
    const lote = construirLoteMascota(
      {
        hogarId: 'hogar-1',
        nombre: '  Luna  ',
        especie: 'perro',
        fechaNacimiento: '2022-05-10',
      },
      nuevoId,
    )
    expect(lote.tipo).toBe('mascota')
    expect(lote.filas.mascota[0]).toMatchObject({
      nombre: 'Luna',
      especie: 'perro',
      fecha_nacimiento: '2022-05-10',
      activa: true,
    })

    expect(() =>
      construirLoteMascota(
        { hogarId: 'hogar-1', nombre: '   ', especie: 'gato', fechaNacimiento: null },
        nuevoId,
      ),
    ).toThrow(ErrorLoteMascotas)
  })

  it('construye lote de nuevo insumo con defaults y valida rangos de umbral/frecuencia', () => {
    const lote = construirLoteItemDespensa(
      {
        hogarId: 'hogar-1',
        mascotaId: 'mascota-luna',
        nombre: 'Concentrado adulto 12 kg',
        tipo: 'comida',
        categoriaId: 'cat-mascotas',
        frecuenciaDias: 35,
        umbralAlertaPct: 20,
        montoHabitual: 165_000,
      },
      nuevoId,
    )
    expect(lote.tipo).toBe('item_despensa')
    expect(lote.filas.item_despensa[0]).toMatchObject({
      nombre: 'Concentrado adulto 12 kg',
      tipo: 'comida',
      frecuencia_dias: 35,
      umbral_alerta_pct: 20,
      monto_habitual: 165_000,
      activo: true,
    })

    expect(() =>
      construirLoteItemDespensa(
        {
          hogarId: 'hogar-1',
          mascotaId: null,
          nombre: 'Arena',
          tipo: 'higiene',
          categoriaId: 'cat-mascotas',
          frecuenciaDias: 0,
          umbralAlertaPct: 20,
          montoHabitual: null,
        },
        nuevoId,
      ),
    ).toThrow(ErrorLoteMascotas)

    expect(() =>
      construirLoteItemDespensa(
        {
          hogarId: 'hogar-1',
          mascotaId: null,
          nombre: 'Arena',
          tipo: 'higiene',
          categoriaId: 'cat-mascotas',
          frecuenciaDias: 30,
          umbralAlertaPct: 101,
          montoHabitual: null,
        },
        nuevoId,
      ),
    ).toThrow(ErrorLoteMascotas)
  })

  it('construye lote de ajuste manual sin compra_id (I21)', () => {
    const lote = construirLoteAjusteNivel(
      {
        hogarId: 'hogar-1',
        itemDespensaId: 'item-1',
        fecha: '2026-11-22',
        nivelPct: 15,
      },
      nuevoId,
    )
    expect(lote.tipo).toBe('ajuste_nivel')
    expect(lote.filas.nivel_despensa[0]).toMatchObject({
      item_despensa_id: 'item-1',
      compra_id: null,
      fecha: '2026-11-22',
      nivel_pct: 15,
      origen: 'ajuste',
    })
  })

  it('T-e-2: recompra financiada con tarjeta genera Compra + Plan + Cuotas + NivelDespensa(100) sin doble conteo', () => {
    const lote = construirLoteRecompra(
      {
        hogarId: 'hogar-1',
        actorId: 'miembro-ana',
        itemId: 'item-concentrado',
        itemMascotaId: 'mascota-luna',
        mascotaId: 'mascota-luna',
        categoriaId: 'cat-mascotas',
        fecha: '2026-12-03',
        descripcion: 'Concentrado 15 kg',
        monto: 182_000,
        ambito: 'hogar',
        pago: {
          tipo: 'tarjeta',
          pasivoId: 'visa-ana',
          ambito: 'hogar',
          nCuotas: 1,
          diaCorte: 25,
          diaPago: 10,
          tasa: null,
        },
        actualizarMontoHabitual: true,
      },
      nuevoId,
    )

    expect(lote.tipo).toBe('recompra')
    expect(lote.actualizar_monto_habitual).toBe(true)
    const compra = lote.filas.compra[0]
    expect(compra).toMatchObject({
      monto_total: 182_000,
      pago_tipo: 'financiado',
      item_despensa_id: 'item-concentrado',
      mascota_id: 'mascota-luna',
    })
    expect(lote.filas.plan_de_cuotas).toHaveLength(1)
    expect(lote.filas.cuota[0]).toMatchObject({
      numero: 1,
      fecha_vencimiento: '2027-01-10',
      capital: 182_000,
    })
    expect(lote.filas.nivel_despensa[0]).toMatchObject({
      item_despensa_id: 'item-concentrado',
      compra_id: compra.id,
      fecha: '2026-12-03',
      nivel_pct: 100,
      origen: 'compra',
    })
  })

  it('I23: rechaza actualizar monto_habitual en recompra personal y exige mascota coherente', () => {
    expect(() =>
      construirLoteRecompra(
        {
          hogarId: 'hogar-1',
          actorId: 'miembro-ana',
          itemId: 'item-concentrado',
          itemMascotaId: 'mascota-luna',
          mascotaId: 'mascota-luna',
          categoriaId: 'cat-mascotas',
          fecha: '2026-11-25',
          descripcion: 'Concentrado',
          monto: 185_000,
          ambito: 'personal',
          pago: { tipo: 'medio', medioDePagoId: 'efectivo-ana' },
          actualizarMontoHabitual: true,
        },
        nuevoId,
      ),
    ).toThrow(ErrorLoteMascotas)

    expect(() =>
      construirLoteRecompra(
        {
          hogarId: 'hogar-1',
          actorId: 'miembro-ana',
          itemId: 'item-concentrado',
          itemMascotaId: 'mascota-luna',
          mascotaId: 'mascota-milo',
          categoriaId: 'cat-mascotas',
          fecha: '2026-11-25',
          descripcion: 'Concentrado',
          monto: 185_000,
          ambito: 'hogar',
          pago: { tipo: 'medio', medioDePagoId: 'cuenta-comun' },
          actualizarMontoHabitual: false,
        },
        nuevoId,
      ),
    ).toThrow(ErrorLoteMascotas)
  })
})
