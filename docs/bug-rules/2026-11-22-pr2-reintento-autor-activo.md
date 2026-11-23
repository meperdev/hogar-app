# Solo el autor activo puede recuperar el resultado de un lote

- Síntoma: el contrato no exigía autorización antes de devolver un resultado guardado.
- Causa: la búsqueda del resultado no incluía al autor, y las comprobaciones de escritura podían no ejecutarse.
- Prevención: I13 exige membresía activa y búsqueda por hogar, autor autenticado y lote. T-j-3 compara el reintento
  ajeno con uno de lote desconocido: no hay resultado, cambio ni aviso
  ([modelo](../data-model.md), [oráculo](../examples.md)).
- PR: #2.
