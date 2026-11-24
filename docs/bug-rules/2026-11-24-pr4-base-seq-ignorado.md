# `sync_push` v1 aceptaba como alta una fila con `base_seq`

- Síntoma: una compra con `base_seq` no nulo y un id nuevo se insertaba y se respondía `aplicado`. Una
  actualización que esta versión no soporta terminaba como otro hecho de dinero.
- Causa: la proyección `jsonb_to_recordset` descartaba `base_seq` sin validarlo.
- Prevención: `sync_push` rechaza con `invalido` cualquier fila con `base_seq` no nulo hasta que exista el camino de
  actualización; `07_sync_push.sql` (C16). Hallazgo de la revisión RDD (lente risk).
- PR: #4.
