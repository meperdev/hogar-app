# Verificador del CI

Chequeos que corre el CI de hogar-app. El workflow vive en `.github/workflows/ci.yml`
(plantilla en [`../workflow-prs.yml`](../workflow-prs.yml)) y ejecuta **solo** este
verificador, desde un commit fijo de la rama `ci/verificador`.

## Modelo de confianza

- **El contenido del PR es dato.** Se checkoutea en `pr/` con
  `persist-credentials: false` y no se ejecuta nunca: no hay `npm install` en `pr/`,
  ni scripts, ni hooks del PR.
- **Nada del mockup se ejecuta.** Antes de abrir el navegador, `a11y-mockups.mjs`
  falla cualquier HTML con `<script>`, atributos `on*` (`onclick`, `onload`, ...),
  `href`/`src` con `javascript:` o `<iframe>`/`<object>`/`<embed>`.
- **Las medidas corren con JavaScript deshabilitado.** El contexto de Playwright usa
  `javaScriptEnabled: false` y los service workers están bloqueados. `page.evaluate`
  sigue funcionando (va por CDP) y el script solo usa APIs síncronas del DOM:
  `getBoundingClientRect`, `getComputedStyle`, `elementFromPoint`, `scrollIntoView`.
- **axe corre en un contexto aparte.** axe-core necesita `setTimeout` y
  `requestAnimationFrame`, y Chromium suspende ambos cuando la ejecución de scripts
  está deshabilitada. Por eso axe usa un segundo contexto con JS habilitado, que recibe
  únicamente documentos ya aprobados por el preflight estático (sin código ejecutable) y
  además exige en el DOM cero `script`/`iframe`/`object`/`embed`. axe-core se inyecta
  desde el verificador con `page.evaluate(axe.source)`: es código nuestro, fijado por
  lockfile, no un `<script>` del mockup.
- **Sin red, solo `file:`.** Ambos contextos abren los mockups desde `file://` y
  `context.route` aborta cualquier solicitud que no sea `file:`. No hay credenciales ni
  secretos en el job.
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
  (ignora `node_modules`, `.git`, `odd` y `.atl`).
- `check-links.mjs <raiz>`: enlaces relativos, anclas estilo GitHub en `.md` (ATX y
  Setext), `id`/`name` en `.html`, enlaces de referencia y rutas que escapan de la raíz.
  La contención se valida sobre el destino real (`fs.realpathSync`): un enlace simbólico
  —o un archivo enlazado— que sale de la raíz es una falla.
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

## Límite conocido: el workflow lo define el PR (`pull_request`); se mitiga con semáforo rojo para cambios en `.github/` y queda pendiente decisión de Santiago sobre CODEOWNERS/ruleset

El SHA fijo separa el verificador del checkout del PR, pero con `pull_request` GitHub
evalúa la definición del workflow que viene en el merge del PR: un cambio al YAML puede
alterar qué corre o qué reporta cada job. Mientras la definición no viva fuera del PR,
todo cambio en `.github/` va con semáforo rojo y revisión humana, y queda pendiente la
decisión de Santiago sobre exigirlo con CODEOWNERS y la protección de rama o ruleset.
