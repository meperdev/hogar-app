# Una tabla nueva en `public` nacía legible por `anon`

- Síntoma: en la base local, una tabla creada en `public` sin `revoke` explícito quedaba con `SELECT`, `INSERT`,
  `UPDATE` y `DELETE` para `anon` y `authenticated`. La prueba de privacidad con una tabla de prueba esperaba
  `42501` para `anon` y recibió cero filas sin error: solo RLS separaba al cliente anónimo de los datos.
- Causa: Supabase define privilegios por defecto (`alter default privileges ... in schema public grant all`) para
  `anon` y `authenticated`. Una migración futura (por ejemplo `Compra`) que olvide el `revoke` quedaba expuesta si
  además se equivocaba en la política.
- Prevención: la migración de fundación revoca esos privilegios por defecto para tablas y secuencias de `public`;
  cada tabla concede su `SELECT` a `authenticated` de forma explícita. `supabase/tests/database/01_esquema.sql`
  crea una tabla nueva y afirma que ni `anon` ni `authenticated` pueden leerla sin grant, y
  `04_privacidad_personal.sql` afirma `42501` para `anon`.
- PR: fundación (`feat/fundacion`).
