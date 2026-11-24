# `sync_push` distinguía un libro personal ajeno de uno inexistente

- Síntoma: un plan que apuntaba a la tarjeta personal de otro miembro con la misma tasa respondía
  `detalle: 'pasivo inexistente'`, y uno con un id inexistente respondía `'dependientes ajenos a la compra del lote'`.
  Probando tasas, un miembro podía confirmar que existe un libro personal ajeno y cuál es su tasa.
- Causa: el chequeo de dependientes leía `pasivo` (existencia y tasa) antes del chequeo de visibilidad con
  `puede_ver`.
- Prevención: la visibilidad de todo pasivo referido se evalúa primero; `07_sync_push.sql` (C10) compara el
  resultado completo de un libro ajeno contra uno inexistente, no solo el motivo. Hallazgo de la revisión RDD (lente
  risk).
- PR: #4.
