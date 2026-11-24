-- Fundación (S2): visibilidad de lectura, aislamiento entre hogares y escritura
-- denegada. El actor siempre sale de auth.uid(); nunca de un parámetro del cliente.
-- Los contadores tienen su propia prueba en 02_secuenciacion.sql.
begin;

set search_path = public, extensions;

select plan(41);

-- Usuarios de Auth
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
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sin@hogar.test', 'x', now(),
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
   'Caro inactiva', '00000000-0000-4000-8000-0000000000c3', 'miembro', false, now(), now(),
   '22222222-2222-4222-8222-222222222203'),
  ('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111102',
   'Dora', '00000000-0000-4000-8000-0000000000d4', 'admin', true, now(), now(),
   '22222222-2222-4222-8222-222222222204');

insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por)
values
  ('33333333-3333-4333-8333-333333333301', '11111111-1111-4111-8111-111111111101',
   'Mercado', 1, now(), now(), '22222222-2222-4222-8222-222222222201'),
  ('33333333-3333-4333-8333-333333333302', '11111111-1111-4111-8111-111111111101',
   'Servicios', 2, now(), now(), '22222222-2222-4222-8222-222222222201'),
  ('33333333-3333-4333-8333-333333333303', '11111111-1111-4111-8111-111111111102',
   'Mercado', 1, now(), now(), '22222222-2222-4222-8222-222222222204');

-- ---------------------------------------------------------------------------
-- El predicado único: el actor sale de auth.uid()
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(private.puede_ver('11111111-1111-4111-8111-111111111101', 'hogar', null), true,
  'una miembro activa ve las filas compartidas de su hogar');
select is(private.puede_ver('11111111-1111-4111-8111-111111111101', 'personal',
                            '22222222-2222-4222-8222-222222222201'), true,
  'una miembro ve sus propias filas personales');
select is(private.puede_ver('11111111-1111-4111-8111-111111111101', 'personal',
                            '22222222-2222-4222-8222-222222222202'), false,
  'ni la admin ve las filas personales de otro miembro');
select is(private.puede_ver('11111111-1111-4111-8111-111111111101', 'otro', null), false,
  'un ámbito desconocido se rechaza en vez de conceder visibilidad');
select is(private.puede_ver('11111111-1111-4111-8111-111111111101', 'personal', null), false,
  'una fila personal sin dueño no es visible para nadie');
select is(private.puede_ver('11111111-1111-4111-8111-111111111102', 'hogar', null), false,
  'nadie ve un hogar al que no pertenece');
select is(private.puede_ver(null, 'hogar', null), false,
  'un hogar nulo no concede visibilidad');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
select is(private.puede_ver('11111111-1111-4111-8111-111111111101', 'hogar', null), false,
  'un autenticado sin hogar no ve nada');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is(private.puede_ver('11111111-1111-4111-8111-111111111101', 'hogar', null), false,
  'un miembro inactivo no ve el hogar aunque conserve su fila');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(private.puede_ver('11111111-1111-4111-8111-111111111101', 'hogar', null), false,
  'sin sub en el JWT el predicado devuelve falso, no un error');

-- ---------------------------------------------------------------------------
-- Lectura por RLS: Ana (admin) y Beto (miembro) ven lo mismo del hogar A
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.hogar), 1, 'Ana ve un solo hogar');
select is((select nombre from public.hogar), 'Hogar A', 'Ana ve su propio hogar');
select is((select count(*)::int from public.miembro), 3,
  'Ana ve a los tres miembros, incluido el inactivo');
select is((select count(*)::int from public.categoria), 2,
  'Ana ve las categorías de su hogar y ninguna del otro');

select throws_ok(
  $$ insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'Inyectada', 9,
             now(), now(), '22222222-2222-4222-8222-222222222201') $$,
  '42501', null, 'authenticated no puede insertar categorías directamente');
select throws_ok(
  $$ update public.categoria set nombre = 'Cambiada' $$,
  '42501', null, 'authenticated no puede actualizar categorías directamente');
select throws_ok('delete from public.categoria', '42501', null,
  'authenticated no puede borrar categorías directamente');
select throws_ok(
  $$ update public.miembro set activo = false $$,
  '42501', null, 'authenticated no puede desactivar miembros directamente');

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.hogar), 1, 'Beto ve un solo hogar');
select is((select count(*)::int from public.miembro), 3, 'Beto ve a los tres miembros');
select is((select count(*)::int from public.categoria), 2, 'Beto ve las dos categorías de A');

reset role;

-- ---------------------------------------------------------------------------
-- Aislamiento entre hogares, miembros inactivos y desconocidos
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.hogar), 1, 'Dora ve un solo hogar');
select is((select nombre from public.hogar), 'Hogar B', 'Dora ve el hogar B, no el A');
select is((select count(*)::int from public.miembro), 1, 'Dora ve solo su membresía');
select is((select count(*)::int from public.categoria), 1, 'Dora ve solo la categoría de B');

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.hogar), 0, 'un miembro inactivo no ve el hogar');
select is((select count(*)::int from public.miembro), 0, 'un miembro inactivo no ve miembros');
select is((select count(*)::int from public.categoria), 0, 'un miembro inactivo no ve categorías');

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.hogar), 0, 'un autenticado sin hogar no ve hogares');
select is((select count(*)::int from public.miembro), 0, 'un autenticado sin hogar no ve miembros');
select is((select count(*)::int from public.categoria), 0, 'un autenticado sin hogar no ve categorías');

reset role;

-- ---------------------------------------------------------------------------
-- anon no tiene ninguna puerta
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok('select * from public.hogar', '42501', null, 'anon no puede leer hogar');
select throws_ok('select * from public.miembro', '42501', null, 'anon no puede leer miembro');
select throws_ok('select * from public.categoria', '42501', null, 'anon no puede leer categoria');
select throws_ok($$ select public.crear_hogar('Casa', 'Ana') $$, '42501', null,
  'anon no puede ejecutar crear_hogar');

reset role;

-- ---------------------------------------------------------------------------
-- Forma de las políticas: una sola de SELECT por tabla, solo para authenticated
-- ---------------------------------------------------------------------------

select is((select array_agg(policyname::text order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'hogar'), array['hogar_select'],
  'hogar tiene una única política de lectura');
select is((select array_agg(policyname::text order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'miembro'), array['miembro_select'],
  'miembro tiene una única política de lectura');
select is((select array_agg(policyname::text order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'categoria'), array['categoria_select'],
  'categoria tiene una única política de lectura');
select is((select cmd from pg_policies
           where schemaname = 'public' and tablename = 'hogar' and policyname = 'hogar_select'),
  'SELECT', 'la política de hogar es solo de lectura');
select is((select roles::text[] from pg_policies
           where schemaname = 'public' and tablename = 'hogar' and policyname = 'hogar_select'),
  array['authenticated'], 'la política de hogar aplica solo a authenticated');
select is((select count(*)::int from pg_policies
           where schemaname = 'public' and cmd <> 'SELECT'), 0,
  'no existe ninguna política de escritura en la fundación');

select * from finish();
rollback;
