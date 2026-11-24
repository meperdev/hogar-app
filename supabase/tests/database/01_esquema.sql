-- Fundación (S2): esquema, tipos, constraints y superficie de permisos.
-- Se ejecuta con `supabase test db` contra el stack local. Todo el archivo corre
-- en una transacción y termina en ROLLBACK: los fixtures no quedan en la base.
--
-- Actores fijos (auth.users) y tenencia:
--   Ana   admin de Hogar A      Beto  miembro de Hogar A
--   Caro  miembro inactivo A    Dora  admin de Hogar B
begin;

set search_path = public, extensions;

select plan(63);

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------

select has_type('public', 'miembro_rol', 'existe el enum del rol de miembro');
select enum_has_labels('public', 'miembro_rol', array['admin', 'miembro'], 'el rol solo admite admin o miembro');

select has_table('public', 'hogar', 'existe hogar');
select has_table('public', 'miembro', 'existe miembro');
select has_table('public', 'categoria', 'existe categoria');
select has_table('public', 'hogar_seq', 'existe hogar_seq (contador solo servidor)');
select has_table('public', 'personal_seq', 'existe personal_seq (contador solo servidor)');

select columns_are(
  'public', 'hogar',
  array['id', 'nombre', 'moneda', 'zona_horaria', 'mostrar_pct_ingreso',
        'creado_en', 'actualizado_en', 'eliminado_en', 'actualizado_por'],
  'hogar tiene las columnas canónicas'
);

select columns_are(
  'public', 'miembro',
  array['id', 'hogar_id', 'nombre', 'usuario_id', 'rol', 'activo',
        'creado_en', 'actualizado_en', 'eliminado_en', 'actualizado_por', 'seq'],
  'miembro tiene las columnas canónicas más las de sincronización'
);

select columns_are(
  'public', 'categoria',
  array['id', 'hogar_id', 'nombre', 'icono', 'orden', 'activa',
        'creado_en', 'actualizado_en', 'eliminado_en', 'actualizado_por', 'seq'],
  'categoria tiene las columnas canónicas más las de sincronización'
);

select has_pk('public', 'hogar', 'hogar tiene PK');
select has_pk('public', 'miembro', 'miembro tiene PK');
select has_pk('public', 'categoria', 'categoria tiene PK');

select fk_ok('public', 'miembro', 'hogar_id', 'public', 'hogar', 'id', 'miembro cuelga de hogar');
select fk_ok('public', 'categoria', 'actualizado_por', 'public', 'miembro', 'id',
  'categoria valida actualizado_por contra un miembro del mismo hogar');
select fk_ok('public', 'miembro', 'usuario_id', 'auth', 'users', 'id',
  'miembro.usuario_id apunta a Auth y se puede desvincular');

select has_index('public', 'miembro', 'miembro_hogar_usuario_key',
  'un único miembro no eliminado por usuario y hogar');
select has_index('public', 'categoria', 'categoria_hogar_nombre_key',
  'nombre de categoría único por hogar sin distinguir mayúsculas');

select has_trigger('public', 'miembro', 'miembro_seq', 'miembro asigna seq del carril');
select has_trigger('public', 'miembro', 'miembro_tenencia', 'miembro no cambia de id ni de hogar');
select has_trigger('public', 'categoria', 'categoria_seq', 'categoria asigna seq del carril');

select is((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'hogar'), true, 'RLS activo en hogar');
select is((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'miembro'), true, 'RLS activo en miembro');
select is((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'categoria'), true, 'RLS activo en categoria');
select is((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'hogar_seq'), true, 'RLS activo en hogar_seq');
select is((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'personal_seq'), true, 'RLS activo en personal_seq');

select has_function('public', 'crear_hogar', array['text', 'text'], 'existe la RPC crear_hogar(text, text)');
select has_function('private', 'puede_ver', array['uuid', 'text', 'uuid'],
  'existe el único predicado de visibilidad private.puede_ver(hogar, ámbito, miembro)');

select is((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname = 'puede_ver'), true,
  'puede_ver es SECURITY DEFINER');
select is((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'crear_hogar'), true,
  'crear_hogar es SECURITY DEFINER');

select is((select array_to_string(p.proconfig, ';') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname = 'puede_ver'), 'search_path=""',
  'puede_ver fija search_path vacío');
select is((select array_to_string(p.proconfig, ';') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'crear_hogar'), 'search_path=""',
  'crear_hogar fija search_path vacío');

select ok(has_table_privilege('authenticated', 'public.hogar', 'select'),
  'authenticated puede leer hogar');
select ok(has_table_privilege('authenticated', 'public.categoria', 'select'),
  'authenticated puede leer categoria');
select ok(not has_table_privilege('authenticated', 'public.hogar', 'insert'),
  'authenticated no puede insertar en hogar: solo lee');
select ok(not has_table_privilege('authenticated', 'public.miembro', 'update'),
  'authenticated no puede actualizar miembro: solo lee');
select ok(not has_table_privilege('authenticated', 'public.categoria', 'delete'),
  'authenticated no puede borrar categoria: solo lee');
select ok(not has_table_privilege('authenticated', 'public.hogar_seq', 'select'),
  'hogar_seq no es legible por el cliente');
select ok(not has_table_privilege('authenticated', 'public.personal_seq', 'select'),
  'personal_seq no es legible por el cliente');
select ok(not has_table_privilege('anon', 'public.hogar', 'select'),
  'anon no lee hogar');
select ok(has_function_privilege('authenticated', 'public.crear_hogar(text,text)', 'execute'),
  'authenticated puede ejecutar crear_hogar');
select ok(not has_function_privilege('anon', 'public.crear_hogar(text,text)', 'execute'),
  'anon no puede ejecutar crear_hogar');

-- Una tabla nueva de `public` (como las de los núcleos) nace sin privilegios
-- para el cliente: cada migración concede su SELECT de forma explícita.
create table public.fundacion_fixture_nueva (id uuid primary key);
select ok(not has_table_privilege('anon', 'public.fundacion_fixture_nueva', 'select'),
  'una tabla nueva de public no es legible por anon por defecto');
select ok(not has_table_privilege('authenticated', 'public.fundacion_fixture_nueva', 'select'),
  'una tabla nueva de public no es legible por authenticated sin grant explícito');
drop table public.fundacion_fixture_nueva;

-- ---------------------------------------------------------------------------
-- Fixtures de tenencia (como owner, sin RLS)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@hogar.test', 'x', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'beto@hogar.test', 'x', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caro@hogar.test', 'x', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dora@hogar.test', 'x', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.hogar (id, nombre, creado_en, actualizado_en)
values
  ('11111111-1111-4111-8111-111111111101', 'Hogar A', now(), now()),
  ('11111111-1111-4111-8111-111111111102', 'Hogar B', now(), now());

insert into public.hogar_seq (hogar_id) values
  ('11111111-1111-4111-8111-111111111101'),
  ('11111111-1111-4111-8111-111111111102');

insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo,
                            creado_en, actualizado_en, actualizado_por)
values
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101',
   'Ana', '00000000-0000-4000-8000-0000000000a1', 'admin', true, now(), now(),
   '22222222-2222-4222-8222-222222222201'),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101',
   'Beto', '00000000-0000-4000-8000-0000000000b2', 'miembro', true, now(), now(),
   '22222222-2222-4222-8222-222222222202'),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111101',
   'Caro', '00000000-0000-4000-8000-0000000000c3', 'miembro', false, now(), now(),
   '22222222-2222-4222-8222-222222222203'),
  ('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111102',
   'Dora', '00000000-0000-4000-8000-0000000000d4', 'admin', true, now(), now(),
   '22222222-2222-4222-8222-222222222204');

insert into public.categoria (id, hogar_id, nombre, icono, orden,
                              creado_en, actualizado_en, actualizado_por)
values
  ('33333333-3333-4333-8333-333333333301', '11111111-1111-4111-8111-111111111101',
   'Mercado', 'mercado', 1, now(), now(), '22222222-2222-4222-8222-222222222201');

-- ---------------------------------------------------------------------------
-- Valores por defecto y constraints
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.hogar (id, nombre, creado_en, actualizado_en)
     values ('11111111-1111-4111-8111-111111111103', 'Hogar mínimo', now(), now()) $$,
  'hogar se puede crear solo con nombre y timestamps');

select is((select moneda from public.hogar where id = '11111111-1111-4111-8111-111111111103'),
  'COP', 'moneda por defecto COP');
select is((select zona_horaria from public.hogar where id = '11111111-1111-4111-8111-111111111103'),
  'America/Bogota', 'zona horaria por defecto America/Bogota');
select is((select mostrar_pct_ingreso from public.hogar where id = '11111111-1111-4111-8111-111111111103'),
  false, 'mostrar_pct_ingreso viene apagado');

select throws_ok(
  $$ insert into public.hogar (id, nombre, moneda, creado_en, actualizado_en)
     values (gen_random_uuid(), 'Pesos', 'USD', now(), now()) $$,
  '23514', null, 'moneda distinta de COP se rechaza');

select throws_ok(
  $$ insert into public.hogar (id, nombre, zona_horaria, creado_en, actualizado_en)
     values (gen_random_uuid(), 'Otra zona', 'UTC', now(), now()) $$,
  '23514', null, 'zona horaria distinta de America/Bogota se rechaza');

select throws_ok(
  $$ insert into public.hogar (id, nombre, creado_en, actualizado_en)
     values (gen_random_uuid(), '   ', now(), now()) $$,
  '23514', null, 'nombre de hogar vacío se rechaza');

select throws_ok(
  $$ insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo,
                                 creado_en, actualizado_en, actualizado_por)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'Zoe',
             null, 'dueno', true, now(), now(), '22222222-2222-4222-8222-222222222201') $$,
  '22P02', null, 'rol fuera del enum se rechaza');

select throws_ok(
  $$ insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo,
                                 creado_en, actualizado_en, actualizado_por)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'Ana otra vez',
             '00000000-0000-4000-8000-0000000000a1', 'miembro', true, now(), now(),
             '22222222-2222-4222-8222-222222222201') $$,
  '23505', null, 'el mismo usuario no puede tener dos miembros vivos en el mismo hogar');

select lives_ok(
  $$ insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo,
                                 creado_en, actualizado_en, actualizado_por)
     values ('22222222-2222-4222-8222-2222222222a1', '11111111-1111-4111-8111-111111111102',
             'Ana en B', '00000000-0000-4000-8000-0000000000a1', 'miembro', true, now(), now(),
             '22222222-2222-4222-8222-222222222204') $$,
  'miembro no eliminado con el mismo usuario en otro hogar se permite');

select throws_ok(
  $$ insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'mercado', 2,
             now(), now(), '22222222-2222-4222-8222-222222222201') $$,
  '23505', null, 'categoría duplicada sin distinguir mayúsculas se rechaza');

select lives_ok(
  $$ insert into public.categoria (id, hogar_id, nombre, orden, eliminado_en,
                                   creado_en, actualizado_en, actualizado_por)
     values ('33333333-3333-4333-8333-3333333333a1', '11111111-1111-4111-8111-111111111101',
             'Mercado', 2, now(), now(), now(), '22222222-2222-4222-8222-222222222201') $$,
  'una categoría tombstone no bloquea el nombre');

select throws_ok(
  $$ insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'Cruzada', 9,
             now(), now(), '22222222-2222-4222-8222-222222222204') $$,
  '23503', null, 'un actualizado_por de otro hogar se rechaza (tenencia I14)');

select throws_ok(
  $$ insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'Negativa', -1,
             now(), now(), '22222222-2222-4222-8222-222222222201') $$,
  '23514', null, 'orden negativo se rechaza');

select throws_ok(
  $$ update public.hogar_seq set ultimo_seq = -1
     where hogar_id = '11111111-1111-4111-8111-111111111101' $$,
  '23514', null, 'un contador negativo se rechaza');

select throws_ok(
  $$ insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo,
                                 creado_en, actualizado_en, actualizado_por)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'Fantasma',
             '99999999-9999-4999-8999-999999999999', 'miembro', true, now(), now(),
             '22222222-2222-4222-8222-222222222201') $$,
  '23503', null, 'usuario_id inexistente en Auth se rechaza');

-- ---------------------------------------------------------------------------
-- Generador privado de UUIDv7
-- ---------------------------------------------------------------------------

select is(substr(private.uuid_v7()::text, 15, 1), '7', 'uuid_v7 usa la versión 7');
select ok(substr(private.uuid_v7()::text, 20, 1) in ('8', '9', 'a', 'b'),
  'uuid_v7 usa la variante RFC 4122');
select is((select count(distinct id) from (select private.uuid_v7() as id
                                           from generate_series(1, 50)) s), 50::bigint,
  'uuid_v7 no repite ids en 50 llamadas');

select * from finish();
rollback;
