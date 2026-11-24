# La app rechazaba la URL de Supabase local

- Síntoma: con `VITE_SUPABASE_URL=http://127.0.0.1:54321`, la app mostraba siempre "Configurá Supabase" y no
  permitía ingresar, aunque la base local estuviera arriba.
- Causa: `src/data/supabase.ts` validaba la URL con `z.httpUrl()`, que en Zod 4 exige un dominio con TLD y rechaza
  `127.0.0.1` y `localhost`.
- Prevención: la URL se valida con `z.url({ protocol: /^https?$/ })`. `src/data/supabase.test.ts` afirma que
  `http://127.0.0.1:54321`, `http://localhost:54321` y una URL `https` de Supabase cloud se aceptan, y que una URL
  vacía, otro protocolo o una clave secreta se rechazan.
- PR: #3. Lo detectó agy al probar la UI.
