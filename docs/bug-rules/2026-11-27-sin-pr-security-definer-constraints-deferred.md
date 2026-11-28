# Bug rule: Triggers diferidos en RPCs SECURITY DEFINER

## Síntoma

Al llamar `public.eliminar_pasivo` desde la app como rol `authenticated`, PostgreSQL rechazaba el `COMMIT` con `42501: permission denied for function validar_plan_id` o `permission denied for function verificar_libro`.

## Causa

Las tablas `plan_de_cuotas`, `cuota`, `pago_de_deuda` y `costo_financiero` tienen constraint triggers `DEFERRABLE INITIALLY DEFERRED` que invocan funciones del esquema `private` sin permiso `EXECUTE` para `authenticated`. Cuando una RPC `SECURITY DEFINER` actualiza esas tablas y retorna sin ejecutar `set constraints all immediate;`, PostgreSQL dispara los triggers diferidos al finalizar la transacción **fuera** del contexto `SECURITY DEFINER` (con el rol `authenticated`), provocando `permission denied`. Además, `crearRemotoObligaciones.eliminarPasivo` lanzaba el objeto plano `PostgrestError` sin envolverlo en `Error`.

## Regla / tipo / test que lo previene

- Toda RPC `SECURITY DEFINER` que inserte o actualice tablas con constraint triggers diferidos (`eliminar_pasivo`, `anular_compra`, `sync_push_*`) **debe** ejecutar `set constraints all immediate; set constraints all deferred;` antes de retornar.
- `supabase/tests/database/16_eliminar_pasivo.sql` ejecuta `eliminar_pasivo` y `anular_compra` como `authenticated` y verifica explícitamente `lives_ok($$ set constraints all immediate $$, ...)`.
- `src/data/obligaciones.ts` normaliza `PostgrestError` a `Error` con el mensaje del servidor (probado en `src/data/obligaciones.test.ts`).

## PR

Pendiente (rama `fix/eliminar-pasivo-deferred-constraints`).
