# Un lote mal formado podía trabar el outbox para siempre

- Síntoma: un error de datos fuera de la lista de códigos atrapados por `sync_push` salía como error de RPC y no
  como `rechazado`. El adaptador trata un error de RPC como falta de red: deja el lote pendiente y corta el envío,
  así que ese lote y todos los siguientes quedaban reintentándose sin estado terminal.
- Causa: el manejador enumeraba códigos sueltos de las clases 22 y 23 en vez de las clases completas.
- Prevención: `sync_push` convierte toda excepción de las clases `data_exception` e `integrity_constraint_violation`
  en `invalido` (o `duplicado`); bloqueos, cancelaciones y timeouts siguen siendo reintentables. `07_sync_push.sql`
  (C19) fija un monto no escalar como `invalido`. Hallazgo de la revisión RDD (lente resilience).
- PR: #4.
