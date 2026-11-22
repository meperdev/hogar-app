# IVA del ejemplo mal calculado

- Síntoma: `escanear-factura.html` mostraba IVA $9.450 sobre un total de $85.000 (11,1 %).
- Causa: número de ejemplo inventado, sin derivarlo del total con IVA 19 % incluido.
- Prevención: regla de dominio en `docs/data-model.md`: `Compra.iva` está incluido en `monto_total` y en fase 2 un test calcula `round(total × 19/119)` ($85.000 → $13.571). Mientras tanto, la revisión cruzada verifica la aritmética de los mockups.
- PR: #1
