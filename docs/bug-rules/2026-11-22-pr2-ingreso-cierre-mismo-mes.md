# Un cierre terminal no borra el ingreso de su mes de arranque

- Síntoma: la serie del 20 al 25 de noviembre daba cero y no admitía recibo de noviembre.
- Causa: el cierre real de la última versión prevalecía al seleccionar por el último día del mes.
- Prevención: el extremo efectivo de la última versión sustituye el cierre real solo para seleccionar en ese mes.
  I24 y T-i-6 ([modelo](../data-model.md), [oráculo](../examples.md)) comprueban un importe en noviembre, recibo
  aceptado y cero en diciembre.
- PR: #2.
