# Los medios de pago archivados no deben excluirse de la lectura del balance

- Síntoma: al filtrar `medio_de_pago` con `.eq('activo', true)` en `src/data/balance.ts`, los movimientos históricos (`Compra`, `PagoDeDeuda`, `CostoFinanciero`, `Aporte`) ligados a un medio archivado perdían el `owner_miembro_id` y dejaban de atribuirse a su miembro (cayendo a salidas del fondo común o desapareciendo del balance).
- Causa: `docs/data-model.md` §3.5 y §4 (I9) exigen que un medio archivado (`activo = false`) se retire solo de los selectores de nuevos registros, conservando intactos todos sus hechos históricos para derivar aportes.
- Prevención: `DatosBalance.medios` incluye `activo: boolean`, `crearRemotoBalance.leer` trae todos los medios con `eliminado_en IS NULL`, y únicamente `ControladorBalance.mediosParaAporte()` filtra `m.activo`. Test de regresión en `src/app/controladorBalance.test.ts`.
- PR: sin PR aún (hallazgo del verificador independiente en `feat/balance-de-pareja`).
