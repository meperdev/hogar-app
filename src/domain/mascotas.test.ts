import { describe, expect, it } from 'vitest'
import {
  calcularGastoMascotasMes,
  derivarEstadoItem,
  diasEntreFechas,
  ordenarInsumosPorUrgencia,
  sumarDiasCiviles,
  type CompraResumenMascotas,
  type ItemDespensa,
  type Mascota,
  type ObservacionNivel,
} from './mascotas'

const luna: Mascota = {
  id: 'mascota-luna',
  nombre: 'Luna',
  especie: 'perro',
  fechaNacimiento: null,
  activa: true,
}

const milo: Mascota = {
  id: 'mascota-milo',
  nombre: 'Milo',
  especie: 'gato',
  fechaNacimiento: null,
  activa: true,
}

const itemConcentrado: ItemDespensa = {
  id: 'item-concentrado',
  mascotaId: luna.id,
  nombre: 'Concentrado 15 kg',
  tipo: 'comida',
  categoriaId: 'cat-mascotas',
  frecuenciaDias: 30,
  umbralAlertaPct: 20,
  montoHabitual: 180_000,
  activo: true,
}

describe('aritmética de fechas civiles', () => {
  it('suma días cruzando meses y años bisiestos sin deriva de zona horaria', () => {
    expect(sumarDiasCiviles('2026-10-05', 30)).toBe('2026-11-04')
    expect(sumarDiasCiviles('2026-11-04', 30)).toBe('2026-12-04')
    expect(sumarDiasCiviles('2026-11-22', 5)).toBe('2026-11-27')
    expect(sumarDiasCiviles('2026-12-03', 30)).toBe('2027-01-02')
    expect(sumarDiasCiviles('2024-02-28', 2)).toBe('2024-03-01')
  })

  it('calcula días entre fechas civiles incluyendo negativos', () => {
    expect(diasEntreFechas('2026-11-20', '2026-12-06')).toBe(16)
    expect(diasEntreFechas('2026-11-26', '2026-12-06')).toBe(10)
    expect(diasEntreFechas('2026-12-08', '2026-12-06')).toBe(-2)
  })
})

describe('derivarEstadoItem (T-e-1, T-e-3, T-e-4, T-e-6)', () => {
  it('T-e-3: sin observación compartida el nivel es desconocido, sin alerta ni fecha', () => {
    const estado = derivarEstadoItem(itemConcentrado, [], '2026-11-22')
    expect(estado).toMatchObject({
      nivelActual: null,
      ultimaObservacion: null,
      vidaUtilDias: null,
      proximaCompraEstimada: null,
      diasRestantes: null,
      alerta: false,
      estado: 'desconocido',
    })
  })

  it('T-e-4 y T-e-6: deriva nivel, vida útil, fecha fija de reposición y baja días restantes con hoy', () => {
    const obs: ObservacionNivel[] = [
      {
        id: 'nivel-oct',
        itemDespensaId: itemConcentrado.id,
        compraId: 'c-oct',
        fecha: '2026-10-05',
        nivelPct: 100,
        origen: 'compra',
        ambito: 'hogar',
      },
      {
        id: 'nivel-nov',
        itemDespensaId: itemConcentrado.id,
        compraId: 'c-nov',
        fecha: '2026-11-04',
        nivelPct: 100,
        origen: 'compra',
        ambito: 'hogar',
      },
      {
        id: 'nivel-ajuste-1',
        itemDespensaId: itemConcentrado.id,
        compraId: null,
        fecha: '2026-11-20',
        nivelPct: 54,
        origen: 'ajuste',
        ambito: 'hogar',
      },
    ]

    // El 2026-11-20: vida útil = floor(54 * 30 / 100) = 16 -> próxima = 2026-12-06
    const el20 = derivarEstadoItem(itemConcentrado, obs, '2026-11-20')
    expect(el20).toMatchObject({
      nivelActual: 54,
      vidaUtilDias: 16,
      proximaCompraEstimada: '2026-12-06',
      diasRestantes: 16,
      alerta: false,
      estado: 'medio',
    })

    // T-e-6: el 2026-11-26 dias_restantes = 10 y fecha fija 2026-12-06
    const el26 = derivarEstadoItem(itemConcentrado, obs, '2026-11-26')
    expect(el26).toMatchObject({
      vidaUtilDias: 16,
      proximaCompraEstimada: '2026-12-06',
      diasRestantes: 10,
      alerta: false,
    })

    // Ajuste del 28 nov a 15%: dispara alerta (15 <= 20)
    const obsConAlerta: ObservacionNivel[] = [
      ...obs,
      {
        id: 'nivel-ajuste-2',
        itemDespensaId: itemConcentrado.id,
        compraId: null,
        fecha: '2026-11-28',
        nivelPct: 15,
        origen: 'ajuste',
        ambito: 'hogar',
      },
    ]
    const el28 = derivarEstadoItem(itemConcentrado, obsConAlerta, '2026-11-28')
    expect(el28).toMatchObject({
      nivelActual: 15,
      vidaUtilDias: 4,
      proximaCompraEstimada: '2026-12-02',
      diasRestantes: 4,
      alerta: true,
      estado: 'alerta',
    })

    // Vencido el 2026-12-08: diasRestantes = -6
    const vencido = derivarEstadoItem(itemConcentrado, obsConAlerta, '2026-12-08')
    expect(vencido.diasRestantes).toBe(-6)
    expect(vencido.proximaCompraEstimada).toBe('2026-12-02')
  })

  it('fixture de flujo: igualdad exacta con umbral (20 <= 20) siempre alerta y revisa estado sin alerta vencida', () => {
    const antipulgas: ItemDespensa = {
      id: 'item-antipulgas',
      mascotaId: null,
      nombre: 'Antipulgas mensual',
      tipo: 'salud',
      categoriaId: 'cat-mascotas',
      frecuenciaDias: 30,
      umbralAlertaPct: 20,
      montoHabitual: 95_000,
      activo: true,
    }
    const obs: ObservacionNivel[] = [
      {
        id: 'n-1',
        itemDespensaId: antipulgas.id,
        compraId: null,
        fecha: '2026-11-22',
        nivelPct: 20,
        origen: 'ajuste',
        ambito: 'hogar',
      },
    ]
    const igualUmbral = derivarEstadoItem(antipulgas, obs, '2026-11-22')
    expect(igualUmbral.alerta).toBe(true)
    expect(igualUmbral.estado).toBe('alerta')
    expect(igualUmbral.proximaCompraEstimada).toBe('2026-11-28')
    expect(igualUmbral.diasRestantes).toBe(6)

    const sinAlertaVencida = derivarEstadoItem(
      antipulgas,
      [{ ...obs[0]!, nivelPct: 50 }],
      '2026-12-10',
    )
    expect(sinAlertaVencida.alerta).toBe(false)
    expect(sinAlertaVencida.diasRestantes).toBe(-3)
    expect(sinAlertaVencida.estado).toBe('revisar')
  })

  it('ignora observaciones originadas en compras personales para el cálculo compartido (I25)', () => {
    const obs: ObservacionNivel[] = [
      {
        id: 'n-hogar',
        itemDespensaId: itemConcentrado.id,
        compraId: null,
        fecha: '2026-11-10',
        nivelPct: 18,
        origen: 'ajuste',
        ambito: 'hogar',
      },
      {
        id: 'n-personal',
        itemDespensaId: itemConcentrado.id,
        compraId: 'c-personal',
        fecha: '2026-11-25',
        nivelPct: 100,
        origen: 'compra',
        ambito: 'personal',
      },
    ]
    const estado = derivarEstadoItem(itemConcentrado, obs, '2026-11-25')
    expect(estado.nivelActual).toBe(18)
    expect(estado.alerta).toBe(true)
  })

  it('con frecuenciaDias nula mantiene nivel y alerta pero fecha/días en null', () => {
    const sinFrecuencia: ItemDespensa = { ...itemConcentrado, frecuenciaDias: null }
    const estado = derivarEstadoItem(
      sinFrecuencia,
      [
        {
          id: 'n1',
          itemDespensaId: sinFrecuencia.id,
          compraId: null,
          fecha: '2026-11-20',
          nivelPct: 20,
          origen: 'ajuste',
          ambito: 'hogar',
        },
      ],
      '2026-11-22',
    )
    expect(estado.nivelActual).toBe(20)
    expect(estado.alerta).toBe(true)
    expect(estado.vidaUtilDias).toBeNull()
    expect(estado.proximaCompraEstimada).toBeNull()
    expect(estado.diasRestantes).toBeNull()
  })

  it('desempata observaciones de la misma fecha por id descendente', () => {
    const obs: ObservacionNivel[] = [
      {
        id: '01950000-0000-7000-8000-000000000001',
        itemDespensaId: itemConcentrado.id,
        compraId: null,
        fecha: '2026-11-22',
        nivelPct: 15,
        origen: 'ajuste',
        ambito: 'hogar',
      },
      {
        id: '01950000-0000-7000-8000-000000000002',
        itemDespensaId: itemConcentrado.id,
        compraId: 'compra-2',
        fecha: '2026-11-22',
        nivelPct: 100,
        origen: 'compra',
        ambito: 'hogar',
      },
    ]
    expect(derivarEstadoItem(itemConcentrado, obs, '2026-11-22').nivelActual).toBe(100)
  })

  it('ordena insumos por urgencia: alerta primero, luego revisar, luego medio/bien y desconocidos al final', () => {
    const base = (overrides: Partial<ItemDespensa>): ItemDespensa => ({
      ...itemConcentrado,
      ...overrides,
    })
    const aOk = derivarEstadoItem(
      base({ id: 'i1', nombre: 'Zzz bien' }),
      [{ id: '1', itemDespensaId: 'i1', compraId: null, fecha: '2026-11-20', nivelPct: 80, origen: 'ajuste', ambito: 'hogar' }],
      '2026-11-22',
    )
    const bAlerta = derivarEstadoItem(
      base({ id: 'i2', nombre: 'Concentrado' }),
      [{ id: '2', itemDespensaId: 'i2', compraId: null, fecha: '2026-11-22', nivelPct: 15, origen: 'ajuste', ambito: 'hogar' }],
      '2026-11-22',
    )
    const cDesconocido = derivarEstadoItem(base({ id: 'i3', nombre: 'Nuevo' }), [], '2026-11-22')
    const dMedio = derivarEstadoItem(
      base({ id: 'i4', nombre: 'Arena' }),
      [{ id: '4', itemDespensaId: 'i4', compraId: null, fecha: '2026-11-20', nivelPct: 50, origen: 'ajuste', ambito: 'hogar' }],
      '2026-11-22',
    )

    expect(ordenarInsumosPorUrgencia([cDesconocido, aOk, dMedio, bAlerta]).map((e) => e.item.id)).toEqual([
      'i2',
      'i4',
      'i1',
      'i3',
    ])
  })
})

describe('calcularGastoMascotasMes (T-e-5, I26)', () => {
  it('suma solo compras hogar categoría Mascotas del mes y desglosa por mascota sin doble conteo', () => {
    const archivada: Mascota = {
      id: 'mascota-vieja',
      nombre: 'Toby',
      especie: 'perro',
      fechaNacimiento: null,
      activa: false,
    }
    const compras: CompraResumenMascotas[] = [
      {
        id: 'c1',
        fecha: '2026-11-04',
        descripcion: 'Concentrado 15 kg',
        montoTotal: 185_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: luna.id,
        itemDespensaId: itemConcentrado.id,
      },
      {
        id: 'c2',
        fecha: '2026-11-09',
        descripcion: 'Juguete',
        montoTotal: 20_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: luna.id,
        itemDespensaId: null,
      },
      {
        id: 'c3',
        fecha: '2026-11-14',
        descripcion: 'Veterinaria compartida',
        montoTotal: 40_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: null,
        itemDespensaId: null,
      },
      // Negativa 1: otra categoría con etiqueta mascota_id
      {
        id: 'c4',
        fecha: '2026-11-08',
        descripcion: 'Taxi veterinaria',
        montoTotal: 10_000,
        categoriaId: 'cat-mercado',
        ambito: 'hogar',
        mascotaId: luna.id,
        itemDespensaId: null,
      },
      // Negativa 2: compra personal en categoría Mascotas
      {
        id: 'c5',
        fecha: '2026-11-16',
        descripcion: 'Correa personal',
        montoTotal: 50_000,
        categoriaId: 'cat-mascotas',
        ambito: 'personal',
        mascotaId: luna.id,
        itemDespensaId: null,
      },
      // Negativa 3: compra de otro mes
      {
        id: 'c6',
        fecha: '2026-10-05',
        descripcion: 'Concentrado oct',
        montoTotal: 180_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: luna.id,
        itemDespensaId: itemConcentrado.id,
      },
      // Histórica con mascota inactiva en diciembre
      {
        id: 'c7',
        fecha: '2026-12-01',
        descripcion: 'Control Toby',
        montoTotal: 90_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: archivada.id,
        itemDespensaId: null,
      },
    ]

    const nov = calcularGastoMascotasMes(compras, [luna, milo, archivada], 'cat-mascotas', '2026-11')
    expect(nov.total).toBe(245_000)
    expect(nov.sinEtiqueta).toBe(40_000)
    expect(nov.compras).toHaveLength(3)
    expect(nov.porMascota).toEqual([{ mascotaId: luna.id, nombre: 'Luna', monto: 205_000 }])
    const sumaDesglose =
      nov.porMascota.reduce((acc, row) => acc + row.monto, 0) + nov.sinEtiqueta
    expect(sumaDesglose).toBe(nov.total)

    // Mascota archivada se conserva en diciembre
    const dic = calcularGastoMascotasMes(compras, [luna, milo, archivada], 'cat-mascotas', '2026-12')
    expect(dic.total).toBe(90_000)
    expect(dic.porMascota).toEqual([{ mascotaId: archivada.id, nombre: 'Toby', monto: 90_000 }])
  })
})
