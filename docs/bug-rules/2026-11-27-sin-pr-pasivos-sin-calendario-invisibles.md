# Bug rule: pasivos creados con «sin calendario» invisibles en Obligaciones

- **Síntoma**: Al crear un nuevo pasivo (deuda, crédito o tarjeta) con saldo inicial o desembolso y sistema `Sin calendario (por defecto · abonos libres)`, el servidor lo guardaba correctamente y mostraba el aviso `Pasivo creado`, pero la pantalla `/obligaciones` no mostraba ningún registro ni opción para abonarle.
- **Causa**: `crearControladorObligaciones.cargarMes` solo recorría `cuota` (cuotas calendarizadas) y `obligacion` (pagos recurrentes del hogar), omitiendo los `pasivo`s visibles cuyos `plan_de_cuotas` están en `sin_calendario` o sin cuotas generadas; tampoco existía la ruta `/obligaciones/pagar/pasivo/:id` ni `prepararPagoPasivo`.
- **Regla / tipo / test que lo previene**:
  - `AgendaMes.pasivos` (`ItemPasivoSaldo[]`) expone cada pasivo visible con su `saldoPendiente` derivado mediante `recorrerLibro(libro, null)` y `tieneSinCalendario`.
  - `PantallaObligaciones` renderiza la sección `Tarjetas, créditos y deudas` cuando `pasivos.length > 0` con acceso `Registrar abono` -> `/obligaciones/pagar/pasivo/:id` cuando `saldoPendiente > 0`.
  - Pruebas de regresión en [src/app/controladorObligaciones.test.ts](../../src/app/controladorObligaciones.test.ts) y [src/ui/obligaciones/Obligaciones.test.tsx](../../src/ui/obligaciones/Obligaciones.test.tsx).
- **PR**: pendiente (asignar número al abrir PR).
