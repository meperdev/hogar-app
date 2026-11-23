# Verificador del CI

Chequeos que corre el CI de hogar-app. El workflow vive en `.github/workflows/ci.yml`
(plantilla en [`../workflow-prs.yml`](../workflow-prs.yml)) y ejecuta **solo** este
verificador, desde un commit fijo de la rama `ci/verificador`.

## Modelo de confianza

- **El contenido del PR es dato.** Se checkoutea en `pr/` con
  `persist-credentials: false` y no se ejecuta nunca: no hay `npm install` en `pr/`,
  ni scripts, ni hooks del PR.
- **Contención antes de leer (`raiz-segura.mjs`).** Los tres lectores usan la misma
  frontera: se resuelve el destino real (`fs.realpathSync`) de la raíz, de
  `design/mockups` y de cada archivo antes de abrirlo. Un enlace simbólico —o un
  archivo enlazado— cuyo destino real sale de la raíz, y todo enlace roto, es una
  falla que detiene la lectura sin entregar el archivo al lector. No depende de que
  otro chequeo haya pasado: `lint-md`, `check-links` y `a11y-mockups` aplican la
  contención por separado, cada uno antes de su primera lectura.
- **El documento del PR nunca se carga con JavaScript habilitado.** `a11y-mockups.mjs`
  abre un único contexto con `javaScriptEnabled: false`, service workers bloqueados y
  `context.route` que resuelve cada `file:` a su ruta real y aborta —registrándolo como
  falla— todo lo que salga de la raíz real del PR (navegación incluida; el resto de los
  esquemas también se aborta). Las medidas usan solo
  APIs síncronas del DOM por CDP: `getBoundingClientRect`, `getComputedStyle`,
  `elementFromPoint`, `scrollIntoView`.
- **axe se inyecta desde el verificador.** `axe-core` (fijado por lockfile) entra con
  `page.evaluate(axe.source)`: es código nuestro por CDP, no un `<script>` de la
  página, y corre aunque los scripts de la página estén deshabilitados. Como Chromium
  suspende `setTimeout`/`setInterval`/`requestAnimationFrame` con JS deshabilitado,
  `axe.run` se ejecuta con una cola de timers que el mismo `evaluate` vacía de forma
  síncrona y cede a las microtareas entre vueltas (`run` con `performanceTimer: false`
  e `iframes: false`). Se verificó que no se cuelga (cada archivo tiene timeout de
  30 s) y que sigue detectando violaciones reales (`label`, `color-contrast`). Se
  prefirió esto a copiar el HTML y servirlo con CSP porque así el documento del PR no
  se interpreta con JS habilitado en ningún momento.
- **Preflight estático.** Antes de abrir el navegador, `a11y-mockups.mjs` rechaza HTML
  con `<script>`, atributos `on*` (`onclick`, `onload`, ...), `href`/`src` con
  `javascript:` o `<iframe>`/`<object>`/`<embed>`. Es un lint de mockups estáticos: la
  garantía la da el contexto sin JS, no el regex.
- **Lo que se ejecuta sale del SHA fijo** (`env.VERIFICADOR_SHA`) de `ci/verificador`,
  con `contents: read` y sin secretos. Un PR no puede cambiar el código que lo revisa:
  solo puede cambiar los datos que se revisan.
- **No usamos `pull_request_target`.** Ese evento corre en el contexto del repo base
  (token de escritura y, según la config, secretos) sobre código del PR; es un vector
  clásico de escalada y no lo necesitamos: `pull_request` con permisos de lectura basta
  porque acá no se comenta ni se escribe nada.
- Los checks requeridos son `docs (markdownlint + enlaces)` y
  `mockups (axe + toques 44px)`; sus nombres no se cambian.

## Qué valida

- `lint-md.mjs <raiz>`: Markdown con las reglas de `reglas-markdownlint.json`
  (ignora `node_modules`, `.git`, `odd` y `.atl`). La contención valida cada `.md`
  antes de que markdownlint lo lea.
- `check-links.mjs <raiz>`: enlaces relativos, anclas estilo GitHub en `.md` (ATX y
  Setext), `id`/`name` en `.html`, enlaces de referencia y rutas que escapan de la raíz.
  La contención corre antes de leer y, además, cada destino de enlace se valida sobre
  su ruta real: un enlace simbólico que sale de la raíz es una falla.
- `a11y-mockups.mjs <raiz>`: mockups de `design/mockups` a 390x844 con axe (WCAG 2.2 AA)
  sobre un documento sin código, objetivos táctiles de 44x44, scroll horizontal, controles
  tapados y CTA principal `[data-sin-scroll]` visible sin scroll. Una pantalla sin CTA
  debe justificarlo en `<body data-sin-cta="motivo">` con al menos 10 caracteres; la
  justificación aparece en la salida (`OK archivo.html (sin CTA: "motivo")`) y una
  justificación vacía o corta es una falla. En radios/checkbox se mide la etiqueta
  asociada: alcanza con que el control o su etiqueta lleguen a 44x44. Acepta
  `--reporte <archivo>` y escribe, por archivo, `axe`, `chicos`, `hscroll`, `tapados`,
  `sinScroll`, `fijos` y `sinCta`.

## Cómo actualizar

1. Commit en `ci/verificador` (esta rama).
2. Copiar el SHA nuevo y reemplazar `VERIFICADOR_SHA` en `.github/workflows/ci.yml`
   de los PRs (plantilla `ci/workflow-prs.yml`).
3. El PR que toca `.github/workflows/` va con **semáforo rojo**: lo revisa una persona.

## Límite conocido y aceptado: el workflow lo define el PR (`pull_request`)

Santiago aceptó la **opción C** el **2026-11-22**: se mantiene `pull_request` con el
workflow que trae el PR, como límite conocido. No se agregan CODEOWNERS ni rulesets y
la protección de rama no cambia. La mitigación es de proceso: todo PR que toque
`.github/` (workflows, acciones, `VERIFICADOR_SHA`) lleva `semaforo:rojo` y necesita
revisión humana antes del merge; esa revisión compara el diff de
`.github/workflows/ci.yml` contra el de `main` (mismos nombres de job, mismos pasos y
SHA del verificador). Un check en verde no prueba nada en un PR que cambia el workflow.
El registro canónico está en `docs/ci.md` de los PRs (PR1 y PR2).
