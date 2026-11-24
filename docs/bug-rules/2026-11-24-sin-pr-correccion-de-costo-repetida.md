# Dos correcciones del mismo costo en un lote se pisaban sin orden

- Síntoma: un lote de pago con dos filas que corregían el mismo `CostoFinanciero` (con el mismo `base_seq`) se
  aplicaba; `UPDATE ... FROM` usa una sola fila de origen sin orden definido y descartaba la otra en silencio.
- Causa: `sync_push_obligaciones` no exigía ids únicos en las filas de costos del lote.
- Prevención: el lote se rechaza con `invalido / un costo aparece dos veces en el lote`; `08_obligaciones.sql` (R1).
  Hallazgo de la revisión RDD (lente risk).
- PR: pendiente (obligaciones del mes).
