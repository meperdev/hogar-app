# Corregir el interés de una cuota pagada podía dejar su pago enlazado sin cubrirla

- Síntoma: en un lote de pago, subir el interés de una cuota ya pagada (de $7.000 a $8.000) junto con otro abono
  sin cuota se aplicaba; la cuota seguía marcada como cubierta por un pago de $107.000 que ya no alcanzaba $108.000.
- Causa: la regla "el pago enlazado cubre su cuota completa" solo se evaluaba al insertar el pago, no al cambiar
  los costos de esa cuota.
- Prevención: el trigger diferido del costo revalida todo pago enlazado a su cuota; `08_obligaciones.sql` (R2).
  Hallazgo de la revisión RDD (lente risk).
- PR: pendiente (obligaciones del mes).
