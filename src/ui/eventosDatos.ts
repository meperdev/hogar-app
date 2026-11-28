export const EVENTO_COMPRAS_ACTUALIZADAS = 'hogar:compras-actualizadas'
export const EVENTO_CATALOGO_ACTUALIZADO = 'hogar:catalogo-actualizado'

export function notificarComprasActualizadas() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENTO_COMPRAS_ACTUALIZADAS))
  }
}

export function notificarCatalogoActualizado() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENTO_CATALOGO_ACTUALIZADO))
    window.dispatchEvent(new Event(EVENTO_COMPRAS_ACTUALIZADAS))
  }
}
