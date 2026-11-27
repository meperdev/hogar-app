# Bug rule: colapso de tarjeta en Balance y backdrop modal cortado dentro de `<main>`

- **Síntoma**:
  1. En `/balance`, la tarjeta superior con el selector de mes, `Aporte libre` y `Incluir mis gastos personales` desaparecía por completo en pantalla móvil (`0px` de alto).
  2. En `/compra`, al abrir el panel de comentario y fecha, el fondo oscuro solo cubría la mitad superior de la pantalla y se cortaba con una línea horizontal sobre el teclado numérico.
- **Causa**:
  1. `<main>` usa `.hogar-main-scroll` dentro de un contenedor `flex flex-col`; sus hijos directos heredan `flex-shrink: 1` por defecto, de modo que una tarjeta con `overflow-hidden` puede colapsar verticalmente a `0px` cuando el contenido desborda la altura disponible.
  2. El overlay `fixed inset-0` vivía dentro de `<main className="... hogar-pantalla-enter">`, cuya animación CSS (`animation-fill-mode: both` con `transform`) convertía a `<main>` en containing block de `position: fixed`, recortando el backdrop a la caja de `<main>` (encima del teclado y la barra inferior).
- **Regla / tipo / test que lo previene**:
  - CSS: `.hogar-main-scroll > * { flex-shrink: 0; }` en [src/styles.css](../../src/styles.css) y `animation-fill-mode: backwards` en `.hogar-pantalla-enter`.
  - Arquitectura de UI: todo overlay/backdrop de pantalla se monta en `ShellApp` mediante la prop `superposicion` (hermano directo de `.hogar-shell`, nunca dentro de `<main>`).
  - Pruebas de regresión en [src/ui/balance/Balance.test.tsx](../../src/ui/balance/Balance.test.tsx) (`shrink-0` sobre la tarjeta cabecera) y [src/ui/compraRapida/CompraRapida.test.tsx](../../src/ui/compraRapida/CompraRapida.test.tsx) (`main #panel-comentario-compra` es `null` y `.hogar-shell #panel-comentario-compra` cubre `inset-0`).
- **PR**: pendiente (asignar número al abrir PR).
