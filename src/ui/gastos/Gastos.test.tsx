// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hogar } from '../../app/fundacion'
import type { ControladorGastos, FiltroAmbitoGastos, VistaGastosMes } from '../../app/gastos'
import { ProveedorGastos } from './ContextoGastos'
import { PantallaGastos } from './PantallaGastos'

const raices: Root[] = []

const hogarDemo: Hogar = {
  id: 'h1',
  nombre: 'Casa Santiago',
  miembroActual: { id: 'm1', nombre: 'Santiago', rol: 'admin', activo: true },
  miembros: [
    { id: 'm1', nombre: 'Santiago', rol: 'admin', activo: true },
    { id: 'm2', nombre: 'Laura', rol: 'miembro', activo: true },
  ],
}

function vistaDemo(periodo: string, ambito: FiltroAmbitoGastos): VistaGastosMes {
  if (ambito === 'personal') {
    return {
      periodo,
      ambito,
      sinConexion: false,
      total: 18_000,
      cantidadCompras: 1,
      promedioPorCompra: 18_000,
      comparativaAnterior: null,
      categorias: [
        {
          categoriaId: 'cat-cafe',
          nombre: 'Entretenimiento',
          icono: 'entretenimiento',
          total: 18_000,
          cantidad: 1,
          pctTexto: '100,0 %',
          proporcionPct: 100,
        },
      ],
      movimientos: [
        {
          id: 'g-pers',
          fecha: `${periodo}-20`,
          descripcion: 'Juan Valdez',
          montoTotal: 18_000,
          categoriaId: 'cat-cafe',
          categoriaNombre: 'Entretenimiento',
          categoriaIcono: 'entretenimiento',
          ambito: 'personal',
          pagoTipo: 'contado',
          medioNombre: 'Nequi',
          medioTipo: 'cuenta',
          cuotas: null,
          registradoPorNombre: 'Santiago',
          origen: 'manual',
        },
      ],
    }
  }

  return {
    periodo,
    ambito,
    sinConexion: false,
    total: 420_000,
    cantidadCompras: 2,
    promedioPorCompra: 210_000,
    comparativaAnterior: { totalAnterior: 350_000, diferencia: 70_000, pctTexto: '20,0 %' },
    categorias: [
      {
        categoriaId: 'cat-mercado',
        nombre: 'Mercado',
        icono: 'mercado',
        total: 320_000,
        cantidad: 1,
        pctTexto: '76,2 %',
        proporcionPct: 76.2,
      },
      {
        categoriaId: 'cat-transporte',
        nombre: 'Transporte',
        icono: 'transporte',
        total: 100_000,
        cantidad: 1,
        pctTexto: '23,8 %',
        proporcionPct: 23.8,
      },
    ],
    movimientos: [
      {
        id: 'g1',
        fecha: `${periodo}-18`,
        descripcion: 'D1',
        montoTotal: 320_000,
        categoriaId: 'cat-mercado',
        categoriaNombre: 'Mercado',
        categoriaIcono: 'mercado',
        ambito: 'hogar',
        pagoTipo: 'contado',
        medioNombre: 'Bancolombia',
        medioTipo: 'cuenta',
        cuotas: null,
        registradoPorNombre: 'Santiago',
        origen: 'manual',
      },
      {
        id: 'g2',
        fecha: `${periodo}-15`,
        descripcion: 'Uber',
        montoTotal: 100_000,
        categoriaId: 'cat-transporte',
        categoriaNombre: 'Transporte',
        categoriaIcono: 'transporte',
        ambito: 'hogar',
        pagoTipo: 'financiado',
        medioNombre: 'Visa ••4521',
        medioTipo: 'tarjeta',
        cuotas: 3,
        registradoPorNombre: 'Laura',
        origen: 'manual',
      },
    ],
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(async () => {
  await act(async () => {
    for (const r of raices.splice(0)) r.unmount()
  })
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function montar(controlador: ControladorGastos, periodoInicial = '2026-11') {
  const contenedor = document.createElement('div')
  document.body.append(contenedor)
  const raiz = createRoot(contenedor)
  raices.push(raiz)
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={['/gastos']}>
        <ProveedorGastos
          hogar={hogarDemo}
          crearControlador={() => controlador}
          periodoInicial={periodoInicial}
        >
          <PantallaGastos />
        </ProveedorGastos>
      </MemoryRouter>,
    )
  })
  return { contenedor }
}

function botonPorTexto(contenedor: HTMLElement, texto: string): HTMLButtonElement | undefined {
  return [...contenedor.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(texto),
  )
}

describe('UI Gastos generales', () => {
  it('muestra resumen por categoría, movimientos, filtro por categoría, búsqueda y cambio de ámbito/mes', async () => {
    const cargarMes = vi.fn(async (p: string, a: FiltroAmbitoGastos) => vistaDemo(p, a))
    const { contenedor } = await montar({ cargarMes })

    expect(contenedor.querySelector('h1')?.textContent).toBe('Gastos generales')
    expect(contenedor.textContent).toContain('$420.000')
    expect(contenedor.textContent).toContain('76,2 %')
    expect(contenedor.textContent).toContain('D1')
    expect(contenedor.textContent).toContain('Uber')
    expect(contenedor.textContent).toContain('3 cuotas')

    const btnMercado = botonPorTexto(contenedor, 'Mercado')
    expect(btnMercado).toBeDefined()
    await act(async () => {
      btnMercado?.click()
    })
    expect(contenedor.textContent).toContain('D1')
    expect(contenedor.textContent).not.toContain('Uber')

    await act(async () => {
      botonPorTexto(contenedor, 'Quitar filtro')?.click()
    })
    expect(contenedor.textContent).toContain('Uber')

    const inputBuscar = contenedor.querySelector<HTMLInputElement>('#buscar-gasto')
    expect(inputBuscar).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(inputBuscar, 'Uber')
      inputBuscar?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(contenedor.textContent).toContain('Uber')
    expect(contenedor.textContent).not.toContain('D1')

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(inputBuscar, '')
      inputBuscar?.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      botonPorTexto(contenedor, 'Mis personales')?.click()
    })
    expect(cargarMes).toHaveBeenCalledWith('2026-11', 'personal')
    expect(contenedor.textContent).toContain('Juan Valdez')
    expect(contenedor.textContent).toContain('$18.000')

    const btnAnterior = contenedor.querySelector<HTMLButtonElement>('button[aria-label="Mes anterior"]')
    await act(async () => {
      btnAnterior?.click()
    })
    expect(cargarMes).toHaveBeenCalledWith('2026-10', 'personal')
  })

  it('muestra estado vacío con enlace a registrar compra cuando no hay movimientos', async () => {
    const cargarMes = vi.fn(async (periodo: string, ambito: FiltroAmbitoGastos): Promise<VistaGastosMes> => ({
      periodo,
      ambito,
      sinConexion: false,
      total: 0,
      cantidadCompras: 0,
      promedioPorCompra: 0,
      comparativaAnterior: null,
      categorias: [],
      movimientos: [],
    }))
    const { contenedor } = await montar({ cargarMes })

    expect(contenedor.textContent).toContain('Sin compras registradas')
    const linkRegistrar = [...contenedor.querySelectorAll('a')].find(
      (a) => a.textContent?.trim() === 'Registrar compra',
    )
    expect(linkRegistrar?.getAttribute('href')).toBe('/compra')
  })
})
