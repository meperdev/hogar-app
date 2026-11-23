# El FIFO decía "cargos exigibles" y no definía el orden entre varios créditos

- Síntoma: el texto del FIFO cubría solo cargos "exigibles" (ya vencidos), pero el ejemplo h aceptaba un pago que
  adelantaba cuotas futuras; y con varios `saldo_a_favor` de distintos miembros o varios cargos, el orden no estaba
  definido, así que dos implementaciones podían atribuir el mismo crédito a personas distintas.
- Causa: una palabra ("exigible") filtraba la cola sin querer, y la aplicación de créditos no tenía criterio de
  desempate.
- Prevención: el FIFO cubre **todos** los cargos programados, vencidos y futuros, en orden cronológico estricto; solo
  el exceso sobre esa suma va como `saldo_a_favor`. Los créditos se aplican FIFO por `(fecha, id)` y, dentro de cada
  uno, en el mismo orden de cargos; el monto aplicado es aporte del dueño del medio del crédito en el mes del cargo
  ([data-model.md](../data-model.md) §3.10 y §8, **I10**, [examples.md](../examples.md) ejemplo h).
- PR: #2.
