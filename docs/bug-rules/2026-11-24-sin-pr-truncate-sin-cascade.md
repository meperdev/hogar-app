# El test de `crear_hogar` fallaba al sumar tablas que referencian a la fundación

- Síntoma: con la migración de compra rápida, `supabase/tests/database/05_crear_hogar.sql` abortaba con
  `cannot truncate a table referenced in a foreign key constraint` y todo el archivo quedaba sin ejecutar.
- Causa: el test vacía `hogar`, `miembro`, `categoria` y los contadores con `truncate` sin `cascade`. Cada núcleo
  agrega tablas (`compra`, `pasivo`, `medio_de_pago`, ...) con FK hacia esas tablas, así que el `truncate` explícito
  quedaba incompleto en cuanto entraba el primer núcleo.
- Prevención: el `truncate` usa `cascade` (dentro de la transacción del test, que termina en `rollback`). El job
  `tests (app + base local)` corre todos los pgTAP después de `supabase migration up`, así que un núcleo que vuelva a
  romperlo falla en CI.
- PR: pendiente (compra rápida).
