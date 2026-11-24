# Un nombre de solo tabuladores o saltos de línea se aceptaba

- Síntoma: `select public.crear_hogar(E'\t\n', E'\t')` creaba un hogar y un miembro con nombres invisibles. La app ya
  rechazaba esa entrada, pero la RPC no.
- Causa: la migración validaba con `btrim(nombre) <> ''`, y `btrim` sin segundo argumento solo quita espacios.
- Prevención: un único predicado `private.nombre_visible` (al menos un carácter que no sea `[[:space:]]`, a lo sumo 80)
  en los CHECK de `hogar`, `miembro` y `categoria` y en `crear_hogar`, que además recorta todo espacio de los
  extremos. `01_esquema.sql` y `05_crear_hogar.sql` afirman `23514` y `22023` para nombres de solo tabuladores y
  saltos.
- PR: #3. Lo encontró la verificación independiente.
