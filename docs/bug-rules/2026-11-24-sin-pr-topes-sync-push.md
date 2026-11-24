# `sync_push` juntaba los topes del lote y no limitaba los alias de comercio

- Síntoma: un lote con dos planes y pocas cuotas se rechazaba con `demasiadas cuotas en el lote`; un lote
  con dos alias de comercio de NIT distintos se aplicaba aunque el dominio emite como máximo uno.
- Causa: una sola guarda de tamaño agrupaba planes, cuotas y costos con el mismo detalle, y `alias_comercio` no tenía
  tope por lote en el servidor.
- Prevención: `20261124130000_topes_sync_push.sql` separa el caso de más de un plan
  (`un lote lleva como máximo un plan de cuotas`), deja `demasiadas cuotas en el lote` para cuotas o costos > 360 y
  agrega el tope de un alias (`un lote lleva como máximo un alias de comercio`), los tres antes de tomar locks;
  `07_sync_push.sql` (C24, C25, C26) prueba el máximo de 360 cuotas con 360 costos y los dos rechazos nuevos.
- PR: sin PR todavía.
