# `Hogar` nacía sin `seq` y con autor opcional

- Síntoma: la tabla `hogar` no tenía `seq` y `actualizado_por` admitía nulos. Un cambio del hogar (por ejemplo el
  interruptor `mostrar_pct_ingreso`) no habría tenido número de carril para llegar a los demás miembros por el pull.
- Causa: los tests de la fundación fijaron las columnas de `hogar` sin las de sincronización, aunque
  [data-model.md](../data-model.md) §1.2 las exige en toda tabla replicada salvo `hogar_id`, y
  [flows/balance-de-pareja.md](../flows/balance-de-pareja.md) declara `Hogar` como tabla replicada.
- Prevención: `hogar.seq` vive en su propio carril (el alta lo abre con `seq = 1` y crea `hogar_seq`) y
  `actualizado_por` es `NOT NULL` con FK compuesta diferida al miembro del mismo hogar. `01_esquema.sql` afirma las
  columnas, el `NOT NULL` y el rechazo de un autor ajeno; `02_secuenciacion.sql` afirma que actualizar el hogar lo
  renumera y que su `id` es inmutable; `05_crear_hogar.sql` afirma la numeración contigua `1..11`.
- PR: #3. Lo encontró la verificación independiente.
