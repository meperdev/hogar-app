import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { AyudaInfo } from './ComponentesBase'

let raiz: Root | null = null
let contenedor: HTMLDivElement | null = null

afterEach(async () => {
  if (raiz) {
    await act(async () => raiz?.unmount())
    raiz = null
  }
  contenedor?.remove()
  contenedor = null
})

function montarConRect(rect: Partial<DOMRect>) {
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true })

  contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
  raiz = createRoot(contenedor)

  return async () => {
    await act(async () => {
      raiz!.render(
        <AyudaInfo
          etiqueta="Ayuda prueba"
          texto="Texto explicativo que nunca debe salirse de la pantalla móvil."
        />,
      )
    })
    const btn = contenedor!.querySelector<HTMLButtonElement>('button')!
    btn.getBoundingClientRect = () =>
      ({
        x: rect.left ?? 0,
        y: rect.top ?? 120,
        left: rect.left ?? 0,
        top: rect.top ?? 120,
        right: (rect.left ?? 0) + 24,
        bottom: (rect.top ?? 120) + 24,
        width: 24,
        height: 24,
        toJSON: () => ({}),
      }) as DOMRect

    await act(async () => btn.click())
    return document.body.querySelector<HTMLElement>('[role="note"]')!
  }
}

describe('AyudaInfo', () => {
  it.each([
    ['borde izquierdo', 4],
    ['centro', 190],
    ['borde derecho', 370],
  ])('mantiene el popover dentro del viewport en %s', async (_nombre, leftBtn) => {
    const abrir = await montarConRect({ left: leftBtn, top: 120 })
    const nota = await abrir()
    expect(nota).not.toBeNull()
    const left = Number.parseFloat(nota.style.left)
    const width = Number.parseFloat(nota.style.width)
    expect(left).toBeGreaterThanOrEqual(12)
    expect(left + width).toBeLessThanOrEqual(378)
    expect(nota.textContent).toContain('Texto explicativo')
  })
})
