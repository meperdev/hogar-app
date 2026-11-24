# Una fila de pago sin pasivo heredaba el pasivo de la otra fila del lote

- Síntoma: un lote de pago con un abono a la Visa y un saldo a favor sin `pasivo_id` pasaba la guarda "un pasivo por
  lote"; el insert le ponía el pasivo de la otra fila y el lote solo fallaba por otra regla, o se aplicaba.
- Causa: `count(distinct pasivo_id)` ignora los nulos, así que una fila sin pasivo no contaba como distinta.
- Prevención: la guarda cuenta un pasivo ausente como distinto y rechaza el lote; `08_obligaciones.sql` (R6).
  Hallazgo de la revisión RDD (lente reliability).
- PR: pendiente (obligaciones del mes).
