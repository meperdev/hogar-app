# "Días restantes" de despensa no envejecía con la fecha de consulta

- Síntoma: la fórmula definía `dias_restantes = floor(nivel_pct × frecuencia_dias / 100)` desde la observación y
  la usaba como días restantes para siempre. Consultado días después, la UI seguía mostrando el mismo número.
- Causa: un solo nombre para dos cantidades distintas: la vida útil que dura el nivel desde la observación y los
  días que faltan desde hoy hasta la próxima compra estimada.
- Prevención: separar `vida_util_dias` (fijo, desde la observación), `proxima_compra_estimada` (fecha fija) y
  `dias_restantes(hoy) = proxima_compra_estimada − hoy` (puede ser negativo). Oráculos T-e-4/T-e-6 y propiedad
  T-e-3 en [examples.md](../examples.md); [data-model.md](../data-model.md) §8.
- PR: #2.
