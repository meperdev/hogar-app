# Verificador del CI

Chequeos que corre el CI de hogar-app. El workflow vive en `.github/workflows/ci.yml`
(plantilla en [`../workflow-prs.yml`](../workflow-prs.yml)) y ejecuta **solo** este
verificador, desde un commit fijo de la rama `ci/verificador`.

## Modelo de confianza

- **El contenido del PR es dato.** Se checkoutea en `pr/` con
  `persist-credentials: false` y no se ejecuta nunca: no hay `npm install` en `pr/`,
  ni scripts, ni hooks del PR.
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
- `check-links.mjs <raiz>`: enlaces relativos, anclas estilo GitHub en `.md`, `id`/`name`
  en `.html`, enlaces de referencia y rutas que escapan de la raíz.
- `a11y-mockups.mjs <raiz>`: mockups de `design/mockups` a 390x844 con axe (WCAG 2.2 AA),
  objetivos táctiles de 44x44, scroll horizontal, controles tapados y CTA principal
  `[data-sin-scroll]` visible sin scroll (o `<body data-sin-cta>` justificado).
  En radios/checkbox se mide la etiqueta asociada: alcanza con que el control o su
  etiqueta lleguen a 44x44. Acepta `--reporte <archivo>` y escribe, por archivo,
  `axe`, `chicos`, `hscroll`, `tapados`, `sinScroll` y `fijos`.

## Cómo actualizar

1. Commit en `ci/verificador` (esta rama).
2. Copiar el SHA nuevo y reemplazar `VERIFICADOR_SHA` en `.github/workflows/ci.yml`
   de los PRs (plantilla `ci/workflow-prs.yml`).
3. El PR que toca `.github/workflows/` va con **semáforo rojo**: lo revisa una persona.

## Límite conocido

Los HTML de mockups ejecutan su JS en Chromium **sin red** y solo con `file:`
(`ctx.route` aborta todo lo que no sea `file:`). Un mockup con un loop infinito puede
colgar el job hasta el `timeout-minutes`; por eso el job tiene timeout y el
verificador no corre código del PR fuera de ese navegador.
