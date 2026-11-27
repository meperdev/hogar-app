// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { crearControladorMascotas, type DatosDespensa, type MascotasPort } from '../../app/controladorMascotas'
import type { Hogar, Servicios, Sesion } from '../../app/fundacion'
import type { LoteMascotas } from '../../domain/loteMascotas'
import { RutasFundacion } from '../RutasFundacion'

const raices: Root[] = []

function hogarDePrueba(): Hogar {
  const santiago = { id: 'm-santiago', nombre: 'Santiago', rol: 'admin' as const, activo: true }
  const camila = { id: 'm-camila', nombre: 'Camila', rol: 'miembro' as const, activo: true }
  return { id: 'h-1', nombre: 'Casa Santiago y Camila', miembroActual: santiago, miembros: [santiago, camila] }
}

function datosIniciales(): DatosDespensa {
  return {
    mascotas: [
      { id: 'mas-luna', nombre: 'Luna', especie: 'perro', fechaNacimiento: null, activa: true },
      { id: 'mas-milo', nombre: 'Milo', especie: 'gato', fechaNacimiento: null, activa: true },
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
    ],
    observaciones: [
      {
        id: 'obs-conc',
        itemDespensaId: 'it-conc',
        compraId: null,
        fecha: '2026-11-20',
        nivelPct: 50,
        origen: 'ajuste',
        ambito: 'hogar',
      },
      {
        id: 'obs-arena',
        itemDespensaId: 'it-arena',
        compraId: 'c-arena',
        fecha: '2026-11-11',
        nivelPct: 100,
        origen: 'compra',
        ambito: 'hogar',
      },
    ],
    compras: [
      {
        id: 'c-milo-conc',
        fecha: '2026-11-15',
        descripcion: 'Concentrado gato 3 kg',
        montoTotal: 68_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: 'mas-milo',
        itemDespensaId: null,
      },
      {
        id: 'c-arena',
        fecha: '2026-11-11',
        descripcion: 'Arena sanitaria 10 kg',
        montoTotal: 42_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: 'mas-milo',
        itemDespensaId: 'it-arena',
      },
      {
        id: 'c-luna-vet',
        fecha: '2026-11-08',
        descripcion: 'Consulta veterinaria',
        montoTotal: 115_000,
        categoriaId: 'cat-mascotas',
        ambito: 'hogar',
        mascotaId: 'mas-luna',
        itemDespensaId: null,
      },
      {
        id: 'c-shampoo',
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
        id: 'c-taxi',
        fecha: '2026-11-08',
        descripcion: 'Taxi veterinaria',
        montoTotal: 18_000,
        categoriaId: 'cat-transporte',
        ambito: 'hogar',
        mascotaId: 'mas-luna',
        itemDespensaId: null,
      },
      {
        id: 'c-personal',
        fecha: '2026-11-16',
        descripcion: 'Correa personal',
        montoTotal: 35_000,
        categoriaId: 'cat-mascotas',
        ambito: 'personal',
        mascotaId: 'mas-luna',
        itemDespensaId: null,
      },
    ],
    categorias: [
      { id: 'cat-mascotas', nombre: 'Mascotas' },
      { id: 'cat-transporte', nombre: 'Transporte' },
    ],
    medios: [
      { id: 'med-comun', nombre: 'Cuenta común · Hogar', tipo: 'medio', ambito: null },
      {
        id: 'tar-visa',
        nombre: 'Visa Hogar ••4521',
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

function crearPuertoEnMemoria(estadoInicial = datosIniciales()) {
  const estado = structuredClone(estadoInicial)
  const lotesEnviados: LoteMascotas[] = []
  let snap: DatosDespensa | null = null

  const port: MascotasPort = {
    async leer() {
      return structuredClone(estado)
    },
    async leerInstantanea() {
      return snap ? structuredClone(snap) : null
    },
    async guardarInstantanea(datos) {
      snap = structuredClone(datos)
    },
    async enviarLote(lote) {
      lotesEnviados.push(lote)
      if (lote.tipo === 'mascota') {
        const m = lote.filas.mascota[0]
        estado.mascotas.push({
          id: m.id,
          nombre: m.nombre,
          especie: m.especie,
          fechaNacimiento: m.fecha_nacimiento,
          activa: true,
        })
      } else if (lote.tipo === 'item_despensa') {
        const i = lote.filas.item_despensa[0]
        estado.items.push({
          id: i.id,
          mascotaId: i.mascota_id,
          mascotaIds: i.mascota_ids ?? (i.mascota_id ? [i.mascota_id] : []),
          nombre: i.nombre,
          tipo: i.tipo,
          categoriaId: i.categoria_id,
          frecuenciaDias: i.frecuencia_dias,
          umbralAlertaPct: i.umbral_alerta_pct,
          montoHabitual: i.monto_habitual,
          activo: true,
        })
      } else if (lote.tipo === 'ajuste_nivel') {
        const n = lote.filas.nivel_despensa[0]
        estado.observaciones.push({
          id: n.id,
          itemDespensaId: n.item_despensa_id,
          compraId: null,
          fecha: n.fecha,
          nivelPct: n.nivel_pct,
          origen: 'ajuste',
          ambito: 'hogar',
        })
      } else {
        const c = lote.filas.compra[0]
        const n = lote.filas.nivel_despensa[0]
        estado.compras.push({
          id: c.id,
          fecha: c.fecha,
          descripcion: c.descripcion,
          montoTotal: c.monto_total,
          categoriaId: c.categoria_id,
          ambito: c.ambito,
          mascotaId: c.mascota_id,
          itemDespensaId: c.item_despensa_id,
        })
        estado.observaciones.push({
          id: n.id,
          itemDespensaId: n.item_despensa_id,
          compraId: c.id,
          fecha: n.fecha,
          nivelPct: 100,
          origen: 'compra',
          ambito: c.ambito,
        })
        if (c.ambito === 'hogar' && lote.actualizar_monto_habitual) {
          const it = estado.items.find((x) => x.id === c.item_despensa_id)
          if (it) it.montoHabitual = c.monto_total
        }
      }
      return { estado: 'aplicado' }
    },
  }

  return { port, estado, lotesEnviados }
}

function montarApp(ruta: string, port: MascotasPort) {
  const contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
  const raiz = createRoot(contenedor)
  raices.push(raiz)

  let seq = 0
  const hogar = hogarDePrueba()
  const servicios: Servicios = {
    auth: {
      observarSesion(observar) {
        observar({ usuarioId: 'u-1' } satisfies Sesion)
        return () => {}
      },
      async pedirCodigo() {},
      async verificarCodigo() {},
      async salir() {},
    },
    hogares: {
      async cargar() {
        return hogar
      },
      async crear() {
        return { hogarId: hogar.id, miembroId: hogar.miembroActual.id }
      },
    },
    mascotas: (alcance) =>
      crearControladorMascotas({
        port,
        alcance,
        ahora: () => new Date('2026-11-22T12:00:00Z'),
        nuevoId: () => `01950000-0000-7000-8000-${String(++seq).padStart(12, '0')}`,
      }),
  }

  act(() => {
    raiz.render(
      <MemoryRouter initialEntries={[ruta]}>
        <RutasFundacion servicios={servicios} />
      </MemoryRouter>,
    )
  })
  return { contenedor }
}

const esperar = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25))
  })
}

function escribir(el: HTMLInputElement | HTMLSelectElement, valor: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  act(() => {
    setter?.call(el, valor)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

afterEach(() => {
  for (const r of raices.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})

describe('UI Despensa de mascotas (Núcleo 4)', () => {
  it('muestra gasto reconciliable $245.000, filtra por mascota y ajusta nivel inline disparando alerta', async () => {
    const { port } = crearPuertoEnMemoria()
    const { contenedor } = montarApp('/mascotas', port)
    await esperar()

    expect(contenedor.textContent).toContain('Despensa de mascotas')
    expect(contenedor.textContent).toContain('$245.000')
    expect(contenedor.textContent).toContain('Concentrado adulto 12 kg')
    expect(contenedor.textContent).toContain('Arena sanitaria 10 kg')

    // Filtra por Milo
    const chipMilo = Array.from(contenedor.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Milo'),
    )
    expect(chipMilo).toBeTruthy()
    act(() => {
      chipMilo!.click()
    })
    expect(contenedor.textContent).not.toContain('Concentrado adulto 12 kg')
    expect(contenedor.textContent).toContain('Arena sanitaria 10 kg')

    // Vuelve a Todas
    const chipTodas = Array.from(contenedor.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Todas'),
    )
    act(() => {
      chipTodas!.click()
    })

    // Ajustar nivel de Concentrado de 50 % a 20 % -> dispara ▲ Por acabarse
    const inputNivel = contenedor.querySelector('#nivel-it-conc') as HTMLInputElement
    expect(inputNivel).toBeTruthy()
    escribir(inputNivel, '20')
    const btnGuardarNivel = Array.from(contenedor.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Guardar ajuste de nivel'),
    )
    await act(async () => {
      btnGuardarNivel!.click()
    })
    await esperar()

    expect(contenedor.textContent).toContain('▲ Por acabarse')
    expect(contenedor.textContent).toContain('20 %')
  })

  it('crea nuevo insumo en /mascotas/nuevo-insumo y vuelve a la despensa', async () => {
    const { port } = crearPuertoEnMemoria()
    const { contenedor } = montarApp('/mascotas/nuevo-insumo', port)
    await esperar()

    escribir(contenedor.querySelector('#nombre-insumo') as HTMLInputElement, 'Antipulgas mensual')
    escribir(contenedor.querySelector('#duracion-dias') as HTMLInputElement, '30')
    escribir(contenedor.querySelector('#umbral-alerta') as HTMLInputElement, '20')
    const inputPrecio = contenedor.querySelector('#precio-insumo') as HTMLInputElement
    escribir(inputPrecio, '95000')
    expect(inputPrecio.value).toBe('$95.000')

    const form = contenedor.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await esperar()

    expect(contenedor.textContent).toContain('Antipulgas mensual')
    expect(contenedor.textContent).toContain('Sin registros aún')
  })

  it('permite escoger varias mascotas al agregar un insumo y filtra por cualquiera de ellas', async () => {
    const { port, estado, lotesEnviados } = crearPuertoEnMemoria()
    estado.mascotas.push({ id: 'mas-kiroi', nombre: 'Kiroi', especie: 'gato', fechaNacimiento: null, activa: true })

    const { contenedor } = montarApp('/mascotas/nuevo-insumo', port)
    await esperar()

    escribir(contenedor.querySelector('#nombre-insumo') as HTMLInputElement, 'Gel dental gatos')
    await act(async () => {
      contenedor.querySelector<HTMLInputElement>('#insumo-mascota-mas-kiroi')?.click()
      contenedor.querySelector<HTMLInputElement>('#insumo-mascota-mas-luna')?.click()
    })

    const form = contenedor.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await esperar()

    expect(lotesEnviados[0]).toMatchObject({
      tipo: 'item_despensa',
      filas: {
        item_despensa: [expect.objectContaining({ nombre: 'Gel dental gatos', mascota_id: null, mascota_ids: ['mas-kiroi', 'mas-luna'] })],
      },
    })
    expect(contenedor.textContent).toContain('Kiroi, Luna')

    await act(async () => {
      Array.from(contenedor.querySelectorAll('button')).find((b) => b.textContent?.includes('Luna'))?.click()
    })
    expect(contenedor.textContent).toContain('Gel dental gatos')

    await act(async () => {
      Array.from(contenedor.querySelectorAll('button')).find((b) => b.textContent?.includes('Milo'))?.click()
    })
    expect(contenedor.textContent).not.toContain('Gel dental gatos')
  })

  it('recompra 1-tap en /mascotas/recomprar/:itemId sube nivel a 100 % y suma gasto solo si hogar (I23)', async () => {
    const { port, estado, lotesEnviados } = crearPuertoEnMemoria()
    const { contenedor } = montarApp('/mascotas/recomprar/it-conc', port)
    await esperar()

    expect(contenedor.textContent).toContain('Recomprar insumo')
    const inputMonto = contenedor.querySelector('#recompra-monto') as HTMLInputElement
    expect(inputMonto.value).toBe('$165.000')

    // Cambia precio a 170.000 y guarda como hogar actualizando monto habitual
    escribir(inputMonto, '170000')
    expect(inputMonto.value).toBe('$170.000')
    const form = contenedor.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await esperar()

    expect(contenedor.textContent).toContain('$415.000') // 245.000 + 170.000
    expect(estado.items.find((i) => i.id === 'it-conc')?.montoHabitual).toBe(170_000)
    expect(lotesEnviados[0]).toMatchObject({ tipo: 'recompra', actualizar_monto_habitual: true })

    // Ahora probar ámbito personal: oculta/desactiva actualizar monto habitual
    const { contenedor: c2 } = montarApp('/mascotas/recomprar/it-conc', port)
    await esperar()
    const btnPersonal = Array.from(c2.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Personal',
    )
    act(() => {
      btnPersonal!.click()
    })
    expect(c2.querySelector('#recompra-actualizar-habitual')).toBeNull()
    await act(async () => {
      c2.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await esperar()
    expect(lotesEnviados.at(-1)).toMatchObject({ tipo: 'recompra', actualizar_monto_habitual: false })
  })
})
