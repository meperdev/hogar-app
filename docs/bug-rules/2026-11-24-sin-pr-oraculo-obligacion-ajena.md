# Un hogar podía sondear las obligaciones de otro hogar

- Síntoma: con el id de una obligación ajena, un miembro de otro hogar recibía respuestas distintas según el periodo
  (fuera de calendario, ya pagado o categoría distinta), aunque la compra se rechazara.
- Causa: el trigger de instancia buscaba la plantilla solo por id antes del FK compuesto, y los únicos
  `(obligacion_id, periodo)` y `(cuota_id)` de pagos saltaban antes que el FK porque no incluían `hogar_id`.
- Prevención: el trigger busca la plantilla en el mismo hogar y, si no la encuentra, deja fallar el FK; los dos
  únicos llevan `hogar_id`. `08_obligaciones.sql` (R3) compara la respuesta completa con dos periodos distintos.
  Hallazgo de la revisión RDD (lente risk) y del propio test.
- PR: pendiente (obligaciones del mes).
