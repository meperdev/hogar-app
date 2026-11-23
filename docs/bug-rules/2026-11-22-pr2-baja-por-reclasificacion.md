# Reclasificar una compra podía dejar una copia fantasma en la réplica ajena

- Síntoma: si una compra del hogar se volvía personal en la misma fila, el pull de otro miembro filtraba la nueva
  versión y no le enviaba ninguna baja; su IndexedDB conservaba el gasto del hogar aunque sincronizara.
- Causa: el protocolo no prohibía cambiar el ámbito sobre una fila ya sincronizada y no garantizaba un tombstone en
  el alcance donde la fila era visible.
- Prevención: `ambito` y `miembro_id` inmutables tras sincronizar (I18). Reclasificar es anular con tombstone en el
  alcance original —la baja viaja por el carril del hogar y todos la reciben— y crear otra fila con un UUID nuevo en
  el alcance de destino. `sync_push` rechaza el cambio de ámbito o de dueño sobre la misma fila
  ([architecture.md](../architecture.md) §5.9, [data-model.md](../data-model.md) §3.7 e I18).
- PR: #2.
