// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  crearControladorBalance,
  type BalancePort,
  type DatosBalance,
  type ResultadoEnvioBalance,
} from '../../app/controladorBalance'
import type { Hogar, Servicios, Sesion } from '../../app/fundacion'
import type { LoteBalance } from '../../domain/loteBalance'
import { RutasFundacion } from '../RutasFundacion'

const raices: Root[] = []

const HOGAR_ID = '01950000-0000-7000-8000-000000000010'
const SANTIAGO = '01950000-0000-7000-8000-000000000001'
const CAMILA = '01950000-0000-7000-8000-000000000002'
const CUENTA_SANTIAGO = '01950000-0000-7000-8000-000000000011'
const CUENTA_CAMILA = '01950000-0000-7000-8000-000000000012'
const CUENTA_COMUN = '01950000-0000-7000-8000-000000000013'

function hogarDePrueba(): Hogar {
  const santiago = { id: SANTIAGO, nombre: 'Santiago', rol: 'admin' as const, activo: true }
  const camila = { id: CAMILA, nombre: 'Camila', rol: 'miembro' as const, activo: true }
  return {
    id: HOGAR_ID,
    nombre: 'Hogar Santiago y Camila',
    miembroActual: santiago,
    miembros: [santiago, camila],
  }
}

function crearPuertoDePrueba(overrides?: Partial<DatosBalance>): BalancePort {
  const preferencias = new Map<string, string>()
  let seq = 10
  const datos: DatosBalance = {
    hogar: { id: HOGAR_ID, nombre: 'Hogar Santiago y Camila', mostrar_pct_ingreso: false, seq: 1 },
    miembros: [
      { id: SANTIAGO, nombre: 'Santiago', activo: true },
      { id: CAMILA, nombre: 'Camila', activo: true },
    ],
    medios: [
      { id: CUENTA_SANTIAGO, nombre: 'Bancolombia · Santiago', tipo: 'cuenta', owner_tipo: 'miembro', owner_miembro_id: SANTIAGO, activo: true },
      { id: CUENTA_CAMILA, nombre: 'Nequi · Camila', tipo: 'cuenta', owner_tipo: 'miembro', owner_miembro_id: CAMILA, activo: true },
      { id: CUENTA_COMUN, nombre: 'Cuenta común · Hogar', tipo: 'cuenta', owner_tipo: 'hogar', owner_miembro_id: null, activo: true },
    ],
    compras: [
      { id: 'c1', fecha: '2026-11-08', monto_total: 200_000, ambito: 'hogar', miembro_id: null, pago_tipo: 'contado', medio_de_pago_id: CUENTA_SANTIAGO, financiada_por_pasivo_id: null },
      { id: 'c-per', fecha: '2026-11-09', monto_total: 140_000, ambito: 'personal', miembro_id: SANTIAGO, pago_tipo: 'contado', medio_de_pago_id: CUENTA_SANTIAGO, financiada_por_pasivo_id: null },
    ],
    pasivos: [],
    planes: [],
    costos: [],
    pagos: [],
    aportes: [
      { id: 'ap1', medio_origen_id: CUENTA_SANTIAGO, medio_destino_id: CUENTA_COMUN, monto: 1_500_000, fecha: '2026-11-01' },
      { id: 'ap2', medio_origen_id: CUENTA_CAMILA, medio_destino_id: CUENTA_COMUN, monto: 1_300_000, fecha: '2026-11-15' },
    ],
    ingresos: [
      { id: 'ing-s', serie_id: 'ing-s', miembro_id: SANTIAGO, tipo: 'fijo', descripcion: 'Salario Santiago', monto: 4_500_000, dia_esperado: 30, vigente_desde: '2026-01-01', vigente_hasta: null, fecha: null },
    ],
    recepciones: [],
    ...overrides,
  }

  return {
    async cargar() {
      return structuredClone(datos)
    },
    async enviar(lote: LoteBalance): Promise<ResultadoEnvioBalance> {
      if (lote.tipo === 'hogar_preferencia') {
        const fila = lote.filas.hogar![0]!
        datos.hogar.mostrar_pct_ingreso = Boolean(fila.mostrar_pct_ingreso)
        datos.hogar.seq = ++seq
      } else if (lote.tipo === 'aporte') {
        const a = lote.filas.aporte![0]!
        datos.aportes.push({
          id: String(a.id),
          medio_origen_id: String(a.medio_origen_id),
          medio_destino_id: String(a.medio_destino_id),
          monto: Number(a.monto),
          fecha: String(a.fecha),
        })
      } else if (lote.tipo === 'ingreso') {
        for (const i of lote.filas.ingreso ?? []) {
          datos.ingresos.push({
            id: String(i.id),
            serie_id: (i.serie_id as string | null) ?? null,
            miembro_id: String(i.miembro_id),
            tipo: i.tipo as 'fijo' | 'variable',
            descripcion: String(i.descripcion),
            monto: Number(i.monto),
            dia_esperado: (i.dia_esperado as number | null) ?? null,
            vigente_desde: (i.vigente_desde as string | null) ?? null,
            vigente_hasta: (i.vigente_hasta as string | null) ?? null,
            fecha: (i.fecha as string | null) ?? null,
          })
        }
      } else if (lote.tipo === 'recepcion_ingreso') {
        const r = lote.filas.recepcion_ingreso![0]!
        const ing = datos.ingresos.find((i) => i.id === r.ingreso_id)!
        datos.recepciones.push({
          id: String(r.id),
          ingreso_id: String(r.ingreso_id),
          serie_id: ing.serie_id!,
          periodo: String(r.periodo),
          recibido: Boolean(r.recibido),
          monto_recibido: (r.monto_recibido as number | null) ?? null,
          fecha_recepcion: (r.fecha_recepcion as string | null) ?? null,
          seq: ++seq,
        })
      }
      return { estado: 'aplicado' }
    },
    async leerPreferencia(clave) {
      return preferencias.get(clave) ?? null
    },
    async guardarPreferencia(clave, valor) {
      preferencias.set(clave, valor)
    },
    async estadoLocal() {
      return {
        pendientesOutbox: 0,
        ultimaCopiaLocal: '2026-11-25T15:00:00.000Z',
        ultimoMedioNombre: 'Bancolombia · Santiago',
        historial: [
          { fecha: '2026-11-22', alcance: 'hogar', nombre: 'hogar-2026-11-22.zip', tamanoBytes: 4096 },
          { fecha: '2026-11-22', alcance: 'personal', nombre: 'personal-2026-11-22.zip', tamanoBytes: 1024 },
        ],
      }
    },
    async exportarAlcances(fecha) {
      return {
        hogar: { alcance: 'hogar', fecha, tablas: { compra: [{ id: 'c1', ambito: 'hogar' }] } },
        personal: { alcance: 'personal', fecha, tablas: { compra: [{ id: 'c-per', ambito: 'personal' }] } },
      }
    },
  }
}

async function montar(ruta: string, port: BalancePort) {
  let idSeq = 1
  const controlador = crearControladorBalance({
    port,
    alcance: { hogarId: HOGAR_ID, miembroId: SANTIAGO },
    ahora: () => new Date('2026-11-25T15:00:00-05:00'),
    nuevoId: () => `01950000-0000-7000-8000-${String(idSeq++).padStart(12, '0')}`,
  })
  const salir = vi.fn(async () => {})
  const sesion: Sesion = { usuarioId: 'user-santiago' }
  const servicios: Servicios = {
    auth: {
      observarSesion: (obs) => {
        obs(sesion)
        return () => {}
      },
      pedirCodigo: async () => {},
      verificarCodigo: async () => {},
      salir,
    },
    hogares: {
      cargar: async () => hogarDePrueba(),
      crear: async () => ({ hogarId: HOGAR_ID, miembroId: SANTIAGO }),
    },
    balance: () => controlador,
  }

  const contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
  const raiz = createRoot(contenedor)
  raices.push(raiz)

  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={[ruta]}>
        <RutasFundacion servicios={servicios} />
      </MemoryRouter>,
    )
  })
  await act(async () => {
    await Promise.resolve()
  })
  return { contenedor, salir }
}

async function clic(el: Element | null) {
  if (!el) throw new Error('Elemento no encontrado')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {
    await Promise.resolve()
  })
}

async function escribir(input: HTMLInputElement | HTMLSelectElement, valor: string) {
  await act(async () => {
    const proto =
      input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    setter?.call(input, valor)
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('UI del Núcleo 3 (Balance de pareja y exportación)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-25T15:00:00-05:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    while (raices.length > 0) {
      const r = raices.pop()!
      act(() => r.unmount())
    }
    document.body.innerHTML = ''
  })

  it('muestra el balance del mes con ambos interruptores apagados, aporte libre y sin texto de deuda', async () => {
    const { contenedor } = await montar('/balance', crearPuertoDePrueba())
    const texto = contenedor.textContent ?? ''
    expect(texto).toContain('Balance de pareja')
    expect(texto).toContain('Aporte libre')
    expect(texto).toContain('$3.000.000')
    expect(texto).toContain('56,7 %')
    expect(texto).toContain('43,3 %')
    expect(texto).not.toContain('le debe')

    expect(contenedor.querySelector('#toggle-pct-ingreso')).toBeNull()
    const switchPers = contenedor.querySelector('#toggle-personales') as HTMLInputElement
    expect(switchPers.checked).toBe(false)
    const tarjetaCabecera = switchPers.closest('.overflow-hidden')
    expect(tarjetaCabecera?.className).toContain('shrink-0')
    expect(tarjetaCabecera?.querySelector('[aria-label="Cambiar mes calendario del balance"]')).not.toBeNull()
  })

  it('enciende Mis personales en Balance y Mostrar % de su ingreso desde Ajustes', async () => {
    const port = crearPuertoDePrueba()
    const { contenedor } = await montar('/balance', port)

    await clic(contenedor.querySelector('#toggle-personales'))
    expect(contenedor.textContent).toContain('$140.000')
    expect(contenedor.textContent).toContain('fuera del balance')
    expect(contenedor.textContent).toContain('$3.000.000')

    const { contenedor: contAjustes } = await montar('/ajustes', port)
    await clic(contAjustes.querySelector('#cfg-pct-ingreso'))

    const { contenedor: contConPct } = await montar('/balance', port)
    expect(contConPct.textContent).toContain('37,8 %')
    expect(contConPct.textContent).toContain('Sin ingresos este mes')
  })

  it('permite marcar recibido un ingreso fijo con monto distinto al esperado', async () => {
    const { contenedor } = await montar('/balance', crearPuertoDePrueba())
    const inputMonto = contenedor.querySelector('input[aria-label*="Monto recibido"]') as HTMLInputElement
    await escribir(inputMonto, '4300000')

    const btnConfirmar = [...contenedor.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Confirmar recibido'),
    )
    await clic(btnConfirmar ?? null)

    expect(contenedor.textContent).toContain('✓ Recibido')
    expect(contenedor.textContent).toContain('$4.300.000')
  })

  it('registra un Aporte al fondo común desde /balance/transferir', async () => {
    const { contenedor } = await montar('/balance/transferir', crearPuertoDePrueba())
    const inputMonto = contenedor.querySelector('#monto-aporte') as HTMLInputElement
    await escribir(inputMonto, '500000')

    const btn = [...contenedor.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Registrar transferencia'),
    )
    await clic(btn ?? null)

    expect(contenedor.textContent).toContain('Balance de pareja')
    expect(contenedor.textContent).toContain('$3.500.000')
  })

  it('registra un ingreso variable desde /balance/nuevo-ingreso', async () => {
    const { contenedor } = await montar('/balance/nuevo-ingreso', crearPuertoDePrueba())
    const inputDesc = contenedor.querySelector('#concepto-ingreso') as HTMLInputElement
    const inputMonto = contenedor.querySelector('#monto-ingreso') as HTMLInputElement
    await escribir(inputDesc, 'Consultoría')
    await escribir(inputMonto, '600000')

    const btn = [...contenedor.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Guardar ingreso'),
    )
    await clic(btn ?? null)

    expect(contenedor.textContent).toContain('Balance de pareja')
    expect(contenedor.textContent).toContain('Consultoría')
    expect(contenedor.textContent).toContain('$600.000')
  })

  it('en /ajustes genera los dos ZIP separados (Hogar y Mis personales) y mantiene Cerrar sesión', async () => {
    const createObjectUrl = vi.fn(() => 'blob:mock')
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrl, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectUrl, configurable: true })

    const { contenedor, salir } = await montar('/ajustes', crearPuertoDePrueba())
    expect(contenedor.textContent).toContain('Hogar (compartido)')
    expect(contenedor.textContent).toContain('Mis personales')
    expect(contenedor.textContent).toContain('Copia local en este dispositivo')

    const btnExportar = [...contenedor.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Exportar ahora'),
    )
    await clic(btnExportar ?? null)

    expect(contenedor.textContent).toContain('2 archivos ZIP separados')
    expect(createObjectUrl).toHaveBeenCalledTimes(2)

    const btnSalir = [...contenedor.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Cerrar sesión'),
    )
    await clic(btnSalir ?? null)
    expect(salir).toHaveBeenCalledTimes(1)
  })

  it('en /ajustes no invierte el interruptor ni oculta errores si falla mostrar_pct_ingreso', async () => {
    const port = crearPuertoDePrueba()
    port.enviar = async () => ({ estado: 'rechazado', motivo: 'conflicto' })
    const { contenedor } = await montar('/ajustes', port)

    const switchCfg = contenedor.querySelector('#cfg-pct-ingreso') as HTMLInputElement
    expect(switchCfg.checked).toBe(false)

    await clic(switchCfg)
    expect(switchCfg.checked).toBe(false)
    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain('Otro dispositivo')
  })

  it('recarga en segundo plano sin parpadeo al emitirse hogar:compras-actualizadas', async () => {
    const port = crearPuertoDePrueba()
    const cargarEspia = vi.spyOn(port, 'cargar')
    const { contenedor } = await montar('/balance', port)

    expect(cargarEspia).toHaveBeenCalledTimes(1)
    expect(contenedor.textContent).toContain('Balance de pareja')

    await act(async () => {
      window.dispatchEvent(new Event('hogar:compras-actualizadas'))
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(cargarEspia).toHaveBeenCalledTimes(2)
    expect(contenedor.textContent).toContain('Balance de pareja')
    expect(contenedor.textContent).not.toContain('Cargando balance')
  })
})
