# Bug rule: salto y bloqueo al arrastrar medios de pago

- **Síntoma**: Al intentar reordenar los medios de pago desde `⋮⋮`, la tarjeta saltaba de inmediato al extremo opuesto de la lista y podía quedar visualmente pegada tras soltar el toque en móvil.
- **Causa**: `TarjetaMediosDePago.tsx` mutaba el estado de la lista mientras comparaba `getBoundingClientRect()` transformados por `translateY` en cada evento `pointermove` y ajustaba `baseY`, generando un lazo de realimentación positiva, además de omitir `onLostPointerCapture` para soltar el estado táctil en iOS Safari.
- **Regla/tipo/test que lo previene**:
  1. Calcular el destino de arrastre con geometría de slots fijos medidos una sola vez en `pointerdown`, sin mutar el arreglo React durante `pointermove` (`src/ui/hogar/reordenarLista.ts`), cubierto por `src/ui/hogar/reordenarLista.test.ts`.
  2. Liberar siempre el estado de arrastre en `onPointerUp`, `onPointerCancel` y `onLostPointerCapture`.
- **PR**: pendiente de asignar (rama `feat/ux-comercios-orden-limpieza`).
