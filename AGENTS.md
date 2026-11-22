# Reglas de la casa para agentes

## Trust Stack (de mayor a menor autoridad)

1. **01 codebase**: el código y los tipos.
2. **02 lint/tests**: reglas de lint, tests y CI.
3. **03 prose**: documentos (`docs/`, este archivo).
4. **04 human**: lo que alguien dijo y no quedó escrito.

Si dos capas se contradicen, gana la de número menor, y se corrige la otra.

## Cada bug se vuelve regla

- Todo bug termina en una regla de lint, un tipo o un test que lo habría atrapado.
- Cada bug deja **un archivo propio** en `docs/bug-rules/` con nombre `AAAA-MM-DD-pr<numero>-<slug>.md` (o `-sin-pr-` si no hay PR todavía). Nunca hay una tabla compartida que dos PRs editen a la vez.
- Contenido mínimo: síntoma, causa, regla/tipo/test que lo previene, PR.

## Semáforo (etiquetas de PR)

- `semaforo:verde`: listo para que Santiago mergee.
- `semaforo:amarillo`: necesita revisión de IA.
- `semaforo:rojo`: necesita revisión humana (dinero, datos, auth, migraciones, CI).
- `trust:01-codebase` / `trust:02-lint-test` / `trust:03-prose`: capa principal que toca el PR.

## Límites duros

- **Los agentes nunca mergean** ni activan auto-merge. Solo Santiago mergea.
- Sin force push. Sin cambiar la protección de rama.
- Una tarea = una rama = un worktree en `../hogar-app-worktrees/<rama>` = un PR.
- Montos siempre enteros en COP. Nunca contar dos veces una compra a cuotas (ver `docs/domain.md`).
- Sin dependencias pesadas sin justificarlas en el PR.
