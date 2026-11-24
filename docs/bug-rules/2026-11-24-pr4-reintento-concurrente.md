# Un reintento concurrente del mismo lote podía responder `duplicado`

- Síntoma: si el cliente reenviaba un lote mientras el envío original seguía abierto, los dos leían
  `lote_aplicado` vacío; el segundo chocaba con las filas del primero y respondía `duplicado` aunque la compra quedó
  guardada.
- Causa: la búsqueda del resultado guardado ocurría antes de cualquier lock por lote.
- Prevención: `sync_push` toma un lock consultivo de transacción por `(hogar, autor, lote_id)` antes de buscar el
  resultado guardado; el segundo espera el commit y devuelve el mismo resultado. No hay pgTAP de dos sesiones: queda
  como riesgo para la revisión humana. Hallazgo de la revisión RDD (lente risk).
- PR: #4.
