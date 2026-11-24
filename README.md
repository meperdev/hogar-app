# hogar-app

App mobile-first (PWA) para manejar los gastos de un hogar compartido en pesos colombianos (COP).

## Premisa

Una pareja (o un hogar de varios miembros) registra lo que gasta, lo que debe y lo que aporta, sin que la app invente deudas entre ellos. Cuatro núcleos:

1. **Compra rápida**: registrar un gasto en la menor cantidad de toques posible.
2. **Obligaciones del mes**: lo que hay que pagar este mes (cuotas de tarjeta, créditos, servicios, suscripciones).
3. **Balance de pareja**: cuánto aportó cada miembro, con aporte libre (no hay deuda automática entre miembros).
4. **Despensa de mascotas**: comida, insumos y gastos recurrentes de las mascotas.

El modelo de dominio está en [docs/domain.md](docs/domain.md). Las reglas para agentes en [AGENTS.md](AGENTS.md).

## Estado

La fundación incluye la PWA, ingreso por código de correo y creación de un hogar con su primer administrador.
La base local aplica migraciones y políticas de acceso; la sesión se conserva al recargar. La invitación y los
cuatro núcleos de producto todavía no están implementados. Ver el [plan de implementación](docs/plan-implementacion.md).

## Correr en local

Requisitos: Node.js 24, npm, Docker en ejecución y Supabase CLI 3.2.

1. Ejecutá `supabase start` desde la raíz. Levanta Supabase local y aplica las migraciones.
2. Configurá en la terminal de Vite las dos variables que muestra `supabase status`:

   ```sh
   export VITE_SUPABASE_URL=http://127.0.0.1:54321
   export VITE_SUPABASE_ANON_KEY='<clave pública local: publishable o anon>'
   ```

   No uses la clave secreta ni `service_role`.
3. Ejecutá `npm ci` y `npm run dev`. Abrí la URL que imprime Vite.
4. Pedí un código para un correo de prueba. Abrí la bandeja local (Mailpit) que muestra `supabase status`
   y copiá el código de seis dígitos. Creá un hogar y recargá para comprobar que la sesión sigue activa.

Ejecutá `npm test` y `npm run build` para verificar la app, y `supabase test db` con la base local en ejecución
para verificar las migraciones, restricciones y RLS. No hace falta una cuenta ni un proyecto cloud.

## Pendiente para Santiago: Supabase cloud

1. Creá un proyecto **nuevo** para hogar-app en plan gratuito, región **US East (North Virginia), `us-east-1`**.
   No reutilices MeperPOS ni BrokerApp.
2. Guardá la contraseña de Postgres en un gestor de secretos. Pasá a quien configure el despliegue la URL del
   proyecto y su clave pública (publishable o anon) para las dos variables `VITE_SUPABASE_*`.
   Nunca publiques la contraseña, los tokens de administración ni la clave `service_role`.
3. Cuando se apruebe el despliegue, aplicá las migraciones al proyecto nuevo. En Auth, configurá la URL del
   sitio y el correo para OTP: la plantilla de ingreso debe incluir `{{ .Token }}` y el envío real necesita
   SMTP propio. La bandeja Mailpit es solo local.
4. El CI de esta PR no necesita secretos. Si más adelante se automatizan las migraciones cloud, configurá
   `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` como secretos del entorno de despliegue y
   `SUPABASE_PROJECT_REF` como variable. No los expongas a jobs de pull requests.
