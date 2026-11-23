# Un lote solo personal movía el `seq` del hogar y atascaba el cursor de los demás

- Síntoma: un lote exclusivamente personal podía avanzar `hogar_seq`, dejar saltos observables en la numeración
  compartida y emitir aviso en el canal del hogar; y un miembro con solo filas personales ajenas por encima de su
  `desde_seq` podía quedarse sin `ultimo_seq` visible y no avanzar nunca.
- Causa: un único contador e un único pull por hogar, con el `limite` aplicado antes de filtrar el alcance.
- Prevención: dos carriles con contador propio (`hogar_seq` y `personal_seq` por dueño, este último creado en la
  misma transacción que su `Miembro`), un pull por carril (`sync_pull` / `sync_pull_personal`), alcance filtrado
  **antes** del `limite`, snapshot único para el agua `H` y las filas, cursor `siguiente_seq` (última fila devuelta
  si truncó; agua solo si el carril se agotó o está vacío) y pre-lock determinista de los contadores tocados. Invariante
  **I25**, pruebas en [architecture.md](../architecture.md) §5.2–§5.4 y caso numerado T-j-1/T-j-2 en
  [examples.md](../examples.md) (ejemplo j).
- PR: #2.
