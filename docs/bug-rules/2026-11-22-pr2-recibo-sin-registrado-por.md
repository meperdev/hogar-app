# El oráculo de `RecepcionIngreso` usaba una columna que la entidad no definía

- Síntoma: las tablas de ejemplo de `RecepcionIngreso` traían `registrado_por`, ausente en §3.3.1. Un test de fase
  2 no podía insertar la fila con el esquema documentado.
- Causa: la entidad se quedó sin el campo de auditoría que otros hechos ya tenían, y los ejemplos se escribieron
  contra una versión mental del esquema.
- Prevención: `RecepcionIngreso.registrado_por` (`uuid`, no nulo, FK → `Miembro`) queda en la entidad y en el
  oráculo; el único se define por `(serie_id, periodo)` para que dos versiones de la serie no admitan dos recibos
  del mismo mes ([data-model.md](../data-model.md) §3.3.1, [examples.md](../examples.md) ejemplos d e i).
- PR: #2.
