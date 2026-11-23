# El FIFO no aumenta el tope del abono anticipado

- Síntoma: el 25/01 la cola programada permitía $102.078 como abono, aunque solo se debían $100.000 a esa fecha.
- Causa: se confundía el orden de asignación a cargos programados con el tope de aceptación.
- Prevención: I20 usa el saldo causado al día del pago como único tope; sin confirmación no se registra el exceso
  como saldo a favor. T-h-2 fija el límite y rechaza el interés futuro por encima del tope
  ([modelo](../data-model.md), [oráculo](../examples.md)).
- PR: #2.
