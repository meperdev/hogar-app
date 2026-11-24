# `sync_push` aceptaba lotes con cualquier cantidad de cuotas

- Síntoma: un lote con 361 cuotas de $1 era válido y se aplicaba. La validación del plan recorre todas sus cuotas por
  cada cuota insertada mientras retiene los carriles de `seq` y el lock del pasivo, así que un lote grande bloqueaba
  el carril del hogar con trabajo cuadrático.
- Causa: el tope de 360 cuotas existía solo en el dominio (`MAX_CUOTAS`); el servidor no limitaba el tamaño del lote.
- Prevención: `sync_push` rechaza con `invalido` más de un plan o más de 360 cuotas o costos por lote, antes de tomar
  locks; `07_sync_push.sql` (C17). Hallazgo de la revisión RDD (lente resilience).
- PR: #4.
