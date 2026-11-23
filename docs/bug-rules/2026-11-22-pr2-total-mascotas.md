# El total de mascotas sumaba por etiqueta en vez de por categoría y ámbito

- Síntoma: la tarjeta "Mascotas" podía sumar compras de otras categorías por llevar `mascota_id`, y no fijaba qué
  pasaba con una compra personal de la categoría Mascotas en la vista compartida.
- Causa: `Mascota` se describía como "su gasto son las compras etiquetadas con `mascota_id`", es decir, el total
  salía de la etiqueta y no de la categoría con el ámbito.
- Prevención: el total es `Σ Compra.monto_total (ambito='hogar', categoria='Mascotas')`, cada compra una vez;
  `mascota_id` es etiqueta opcional que solo reparte ese total en el desglose; una compra de otra categoría con
  etiqueta no entra al total ni al desglose; las personales nunca entran a la vista compartida y su dueño las ve en
  la personal ([data-model.md](../data-model.md) §3.7, §3.13 y §8, **I26**; fixtures y oráculo T-e-5 en
  [examples.md](../examples.md) §3 ter).
- PR: #2.
