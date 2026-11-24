# CI de hogar-app

## Qué se ejecuta

- El workflow `.github/workflows/ci.yml` conserva los dos checks obligatorios de `main`:
  `docs (markdownlint + enlaces)` y `mockups (axe + toques 44px)`.
- Cada job obligatorio hace dos checkouts: el PR en `pr/`, tratado solo como datos, y el verificador en `verificador/`, desde la rama
  `ci/verificador` fijada por SHA en `VERIFICADOR_SHA`.
- Esos dos jobs solo ejecutan el código del verificador, instalado con `npm ci --ignore-scripts` desde su propio lockfile. Las
  acciones están fijadas por SHA, los checkouts no guardan credenciales y no se usa `pull_request_target`.
- Chromium abre los mockups sin JavaScript, sin red y solo con `file:`.
- El job adicional `tests (app + base local)` sí ejecuta código del PR: tests y build en Node 24, más migraciones y
  pgTAP en Postgres local con Supabase CLI 3.2. Corre aislado de los checks obligatorios, sin credenciales guardadas,
  caché ni secretos del proyecto. No toca Supabase cloud.
- Para cambiar el verificador: commit nuevo en `ci/verificador` y subir el SHA en el workflow de cada PR.

## Límite conocido y aceptado

Con `pull_request`, GitHub usa el workflow que trae el propio PR. Un PR que edita `.github/workflows/` puede cambiar
lo que corre un job, o hacer que dé verde sin verificar. Fijar el verificador por SHA no lo evita.

Santiago lo aceptó como límite conocido el 2026-11-22 (opción C). No se agregan CODEOWNERS ni rulesets, y la protección
de rama no cambia. La mitigación es de proceso:

- Todo PR que toque `.github/` (workflows, acciones, `VERIFICADOR_SHA`) lleva `semaforo:rojo` y necesita revisión
  humana antes del merge.
- Esa revisión compara el diff de `.github/workflows/ci.yml` contra el de `main`: mismos nombres de job, mismos pasos
  y el SHA del verificador.
- Un check en verde no prueba nada en un PR que cambia el workflow.

Registro: [2026-11-22-sin-pr-workflow-modificable-por-pr.md](bug-rules/2026-11-22-sin-pr-workflow-modificable-por-pr.md).
