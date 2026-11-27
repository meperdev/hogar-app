import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProveedorNotificaciones, useNotificaciones } from './Notificaciones'

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

function Disparador({ onDeshacer }: { onDeshacer: () => void }) {
  const { publicar } = useNotificaciones()
  return (
    <div>
      <button type="button" onClick={() => publicar({ mensaje: 'Primera compra' })}>
        Lanzar 1
      </button>
      <button
        type="button"
        onClick={() =>
          publicar({
            mensaje: 'Segunda compra $50.000',
            acciones: [{ tipo: 'boton', etiqueta: 'Deshacer', onClick: onDeshacer }],
          })
        }
      >
        Lanzar 2
      </button>
    </div>
  )
}

describe('ProveedorNotificaciones', () => {
  it('apila avisos previos detrás de la píldora frontal, permite expandirlos y ejecutar acciones', async () => {
    const onDeshacer = vi.fn()
    contenedor = document.createElement('div')
    document.body.appendChild(contenedor)
    raiz = createRoot(contenedor)

    await act(async () => {
      raiz!.render(
        <MemoryRouter>
          <ProveedorNotificaciones>
            <Disparador onDeshacer={onDeshacer} />
          </ProveedorNotificaciones>
        </MemoryRouter>,
      )
    })

    const btn1 = Array.from(contenedor.querySelectorAll('button')).find(
      (b) => b.textContent === 'Lanzar 1',
    )!
    const btn2 = Array.from(contenedor.querySelectorAll('button')).find(
      (b) => b.textContent === 'Lanzar 2',
    )!

    await act(async () => btn1.click())
    await act(async () => btn2.click())

    const bandeja = contenedor.querySelector('[data-notificaciones-bandeja]')!
    expect(bandeja.className).toContain('fixed')
    expect(bandeja.querySelector('[role="status"]')?.textContent).toContain('Segunda compra $50.000')
    expect(bandeja.querySelector('[data-notificacion-apilada="1"]')?.getAttribute('style')).toContain(
      'scale(0.94)',
    )

    const btnMas = bandeja.querySelector<HTMLButtonElement>(
      'button[aria-label="Ver 1 notificaciones más"]',
    )!
    await act(async () => btnMas.click())
    expect(bandeja.textContent).toContain('Primera compra')
    expect(bandeja.textContent).toContain('Segunda compra $50.000')

    const btnDeshacer = Array.from(bandeja.querySelectorAll('button')).find(
      (b) => b.textContent === 'Deshacer',
    )!
    await act(async () => btnDeshacer.click())
    expect(onDeshacer).toHaveBeenCalledTimes(1)
    expect(bandeja.textContent).not.toContain('Segunda compra $50.000')
  })
})
