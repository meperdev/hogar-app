# CTA "Guardar" tapado por la barra inferior

- Síntoma: en `compra-rapida.html` a 390x844 el botón "Guardar $85.000" quedaba en y=821..867, debajo de la barra de navegación fija (y=776..844). Había que scrollear y la meta de 3 toques no se cumplía.
- Causa: la barra inferior es `position: fixed` y el contenido no reservaba espacio ni tenía una barra de acción propia.
- Prevención: `scripts/a11y-mockups.mjs` (job `mockups (axe + toques 44px)`) falla si un control visible en el viewport queda tapado por otro elemento (`elementFromPoint`). Probado contra el commit 1db78b9, que tenía el bug.
- PR: #1
