# Bug rule: retraso al reflejar compras recién registradas en Gastos generales

- **Síntoma**: Al registrar una compra en Compra rápida y abrir **Gastos generales**, el gasto tardaba varios segundos en aparecer.
- **Causa**:
  1. `ContextoCompraRapida` espera `VENTANA_DESHACER_MS + 100` (~5,1 s) antes de enviar el lote por `sync_push`, y durante ese tiempo la compra solo vivía en el `outbox` local de IndexedDB.
  2. `crearPuertoGastos.cargar()` solo consultaba el remoto (`Supabase`) sin combinar las compras pendientes del `outbox` local.
  3. `ContextoGastos` / `PantallaGastos` no escuchaban el guardado inmediato ni recargaban silenciosamente al volver a la pestaña.
- **Regla/tipo/test que lo previene**:
  1. `crearPuertoGastos.cargar()` fusiona siempre `base.outbox` (`estado === 'pendiente'`) mediante la función pura `combinarPendientesGastos` (`src/data/gastos.ts`), cubierta por `src/data/gastos.test.ts`.
  2. `ContextoCompraRapida` emite `hogar:compras-actualizadas` al guardar, deshacer y completar sincronización, y `ContextoGastos` / `PantallaGastos` recargan silenciosamente al recibirlo o al reabrir la vista.
- **PR**: pendiente de asignar (rama `feat/ux-polish-tooltip-sync`).
