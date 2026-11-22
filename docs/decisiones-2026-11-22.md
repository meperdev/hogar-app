# Decisiones de Santiago (22 nov 2026) y nombres canónicos para la ronda 2

Ambos PRs usan EXACTAMENTE estos nombres (español, snake_case en campos, como docs/data-model.md del PR #2).

1. Gastos del hogar Y personales. `Compra.ambito` enum('hogar','personal') default 'hogar'. Una compra personal la ve solo su miembro dueño (`Compra.miembro_id`) por defecto. Reportes y balance del hogar excluyen lo personal salvo el interruptor `incluir_personales` (preferencia de vista, apagado). Una compra personal pagada con medio de un miembro NO cuenta como aporte al hogar.
2. Supabase gratis aceptado. Exportación automática periódica: función programada semanal que genera JSON + CSV por hogar en Storage, descargable desde Ajustes; botón "Exportar ahora"; además copia local completa en IndexedDB en cada dispositivo.
3. Préstamo en efectivo: `Compra.financiada_por_pasivo_id` (nullable). Esas compras no suman aporte de nadie; el aporte aparece cuando se paga el préstamo.
4. Cada miembro ve los ingresos del otro. Vista "% de su ingreso" apagada por defecto: `Hogar.mostrar_pct_ingreso` boolean default false.
5. Balance por mes calendario.
6. Despensa: `ItemDespensa` agrega `tipo` enum('comida','higiene','salud','otro') y `umbral_alerta_pct` int 0..100 (default 20). Nivel observado como hechos: entidad `NivelDespensa` (item_despensa_id, fecha, nivel_pct 0..100, origen enum('compra','ajuste')); una compra del ítem registra nivel 100. Nivel actual, días restantes y próxima compra estimada se DERIVAN (nunca guardados). Alerta cuando nivel derivado <= umbral.
7. Balance de pareja incluye transferencias al fondo común (`Aporte`: miembro -> MedioDePago del hogar). Los flujos tienen la acción "Transferir al fondo común".
8. CI y protección de rama: los hace Kiroi, no los agentes.

Hallazgos a corregir:
- Ingreso fijo: entidad `RecepcionIngreso` (ingreso_id, periodo 'AAAA-MM', recibido boolean, monto_recibido bigint nullable, fecha_recepcion date nullable). Balance usa monto_recibido si existe; si no, muestra "esperado".
- Pago duplicado de cuota: `PagoDeDeuda.cuota_id` nullable; único parcial (cuota_id) cuando no es null y el pago cubre la cuota completa; regla: un pago que haría el saldo del pasivo < 0 se rechaza con aviso "posible pago duplicado o sobrepago" (el usuario puede registrarlo como saldo a favor explícito `CostoFinanciero` no; como `PagoDeDeuda.tipo='saldo_a_favor'`). Saldo nunca negativo (nueva invariante).
- `AliasComercio` (hogar_id, nit_comercio, nombre, categoria_sugerida_id), sincronizado y único (hogar_id, nit_comercio). Último medio de pago usado: preferencia LOCAL del dispositivo por miembro, no se sincroniza.
- Fase 1: tarjetas y créditos solo de un miembro. Las deudas pueden ser de miembro u hogar. Un "préstamo de la cocina" del hogar es `Pasivo` tipo deuda con dueño hogar, no un crédito.
- Saldos, totales, estado de obligaciones, nivel de despensa: siempre DERIVADOS.
- Fechas de cuotas: primera cuota = primer día de pago posterior al corte siguiente a la compra (compra 22 nov, corte 15, pago 25 => 25 dic, 25 ene, 25 feb).
- IVA: $85.000 con IVA 19% incluido => IVA $13.571.
- Tasas: el formulario de tarjeta/crédito trae "Sin tasa" por defecto.
- Interés con conversión exacta E.A. -> M.V., redondear solo el interés al peso.
- Porcentajes con un decimal (58,0 %).
- "Costo financiero" es un balde aparte, no una Categoria (alinear domain.md).
- Categoría sembrada "Arriendo" (no "Vivienda").
- Cuotas: chips 1/3/6/12 y "Otro".
