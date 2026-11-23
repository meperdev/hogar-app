# Un PR puede modificar el workflow que lo verifica

- Síntoma: la revisión cruzada de la ronda 6 mostró que, con `pull_request`, el YAML del propio PR define qué corren los
  checks obligatorios. Fijar el verificador por SHA no impide que un PR cambie ese YAML y dé verde.
- Causa: GitHub evalúa el workflow del merge del PR. No hay ninguna definición obligatoria fuera del control del PR
  (CODEOWNERS o ruleset), y Santiago decidió no agregarla.
- Prevención: regla de proceso en [ci.md](../ci.md). Todo PR que toque `.github/` lleva `semaforo:rojo` y revisión
  humana del diff del workflow antes del merge. Es un límite aceptado, no un bloqueante.
- PR: sin PR propio (aparece en #1 y #2, con el mismo contenido en ambos).
