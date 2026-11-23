# Una observación de despensa podía quedar huérfana y afectar la alerta compartida

- Síntoma: `NivelDespensa` admitía `origen='compra'` con `compra_id` nulo y `origen='ajuste'` con `compra_id`
  cargado. La primera no tiene dueño resoluble por `puede_ver` y podía contar como observación compartida,
  alterando la alerta del hogar; el CHECK solo validaba `nivel_pct`.
- Causa: la regla se documentó como "presente solo con" en prosa, sin el biconditional en el CHECK.
- Prevención: CHECK `(origen='compra') = (compra_id IS NOT NULL)`, más `origen='compra'` ⇒ `nivel_pct=100` y la
  compra del mismo ítem, ámbito y dueño que la observación. El lote atómico y la baja en cascada pasan a ser
  exigibles ([data-model.md](../data-model.md) §3.14.1, **I21**).
- PR: #2.
