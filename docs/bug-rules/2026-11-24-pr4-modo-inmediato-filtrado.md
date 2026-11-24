# `sync_push` dejaba la transacción del invocador en modo inmediato

- Síntoma: después de llamar a `sync_push`, las reglas entre filas (triggers diferidos) se evaluaban al final de
  cada sentencia y no al commit en el resto de la transacción del invocador; los tests tenían que volver a diferirlas
  a mano.
- Causa: `set constraints all immediate` se usa para evaluar el lote dentro del bloque y nunca se revertía.
- Prevención: `sync_push` vuelve a `set constraints all deferred` tras aplicar el lote; `07_sync_push.sql` (C20)
  inserta una compra incompleta después de un push y exige que no falle hasta el commit. Hallazgo de la revisión RDD
  (lente resilience).
- PR: #4.
