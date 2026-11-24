# La corrección del interés que manda el cliente se rechazaba en el servidor

- Síntoma: al corregir el interés en *Registrar pago*, el cliente manda `{id, base_seq, monto}` y
  `sync_push_obligaciones` rechazaba el lote ("los costos del pago son manuales y de su pasivo"). Los pgTAP pasaban
  porque su helper agregaba `pasivo_id` y `origen` a la fila de corrección.
- Causa: la guarda de costos nuevos (pasivo del lote y `origen='manual'`) se aplicaba también a las correcciones.
- Prevención: la guarda aplica solo a altas; una corrección se valida contra el costo existente del pasivo.
  `08_obligaciones.sql` (R10) envía la forma exacta que arma `construirLotePago`. Señalado por el worker de pgTAP.
- PR: pendiente (obligaciones del mes).
