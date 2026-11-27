# Bug rule: Obligaciones — borrado de pasivos, duplicación visual, flujo de abono y abonos en Gastos

## Síntoma

1. No existía forma de eliminar o archivar un pasivo desde `/obligaciones`.
2. La barra inferior duplicaba un botón de `Registrar pago` / `Registrar abono` junto a `+ Pasivo`, y cada pasivo con cuotas ya listadas en agenda volvía a mostrar un segundo botón debajo.
3. Abrir `Registrar abono` precargaba el saldo completo de la deuda con un formulario y desglose contable extenso similar al de creación.
4. Los abonos a pasivos (`pago_de_deuda`) no aparecían reflejados en `/gastos`, generando la duda de si la salida se había registrado o ligado a los gastos del mes.

## Causa

1. Faltaba una RPC `eliminar_pasivo` que respetara `private.verificar_libro` (I20) y conservara el historial si había compras enlazadas.
2. `cargarMes` no informaba si el pasivo ya tenía cuotas abiertas en el mes y `prepararPagoPasivo` devolvía `capital = saldoPendiente` en lugar de `0`.
3. `src/domain/gastos.ts` y `src/data/gastos.ts` solo leían `compra` y no incluían `pago_de_deuda` como sección separada.

## Regla / tipo / test que lo previene

- **Migración / RPC:** `supabase/migrations/20261127210000_eliminar_pasivo.sql` (`public.eliminar_pasivo`) archiva si hay compras activas o elimina en orden inverso respetando I20.
- **App / Dominio / Tests:**
  - `src/app/controladorObligaciones.test.ts` verifica `prepararPagoPasivo` con `capital: 0`, `cuotasAbiertasMes` y `eliminarPasivo`.
  - `src/ui/obligaciones/Obligaciones.test.tsx` verifica la barra única `+ Nueva obligación`, confirmación en 2 pasos de borrado, botón de 1 toque `Pagar todo (...)` y no duplicar botón cuando hay cuotas abiertas.
  - `src/domain/gastos.test.ts` y `src/ui/gastos/Gastos.test.tsx` verifican que `Abonos a obligaciones` aparece en `/gastos` sin inflar `Consumo` (`total`).

## PR

Pendiente (rama `feat/obligaciones-ux-eliminar-abonos-gastos`).
