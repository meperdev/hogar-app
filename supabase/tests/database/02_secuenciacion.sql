-- Fundación (S2): contadores solo servidor y numeración por carril (§5.2, I25).
-- El carril del hogar numera las filas compartidas; el carril personal numera las
-- filas de su dueño y nunca mueve el contador del hogar. Todo el archivo se revierte.
begin;

set search_path = public, extensions;

select plan(25);

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
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.hogar (id, nombre, creado_en, actualizado_en)
values ('11111111-1111-4111-8111-111111111101', 'Hogar A', now(), now());

insert into public.hogar_seq (hogar_id, ultimo_seq)
values ('11111111-1111-4111-8111-111111111101', 0);

insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo,
                            creado_en, actualizado_en, actualizado_por)
values
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101',
   'Ana', '00000000-0000-4000-8000-0000000000a1', 'admin', true, now(), now(),
   '22222222-2222-4222-8222-222222222201');

insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo,
                            creado_en, actualizado_en, actualizado_por)
values
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101',
   'Beto', '00000000-0000-4000-8000-0000000000b2', 'miembro', true, now(), now(),
   '22222222-2222-4222-8222-222222222202');

-- Caro existe como miembro pero sin carril personal: sirve para el caso de error.
insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo,
                            creado_en, actualizado_en, actualizado_por)
values
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111101',
   'Caro', '00000000-0000-4000-8000-0000000000c3', 'miembro', true, now(), now(),
   '22222222-2222-4222-8222-222222222203');

-- Carriles personales de Ana y Beto, creados aparte (en producción los crea la RPC).
insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq)
values
  ('11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201', 0),
  ('11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222202', 0);

-- Tabla de prueba (no de producción) con las dos columnas que usan las tablas
-- replicadas reales para elegir carril: `ambito` y `miembro_id`.
create table public.fundacion_fixture_carriles (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  ambito text not null check (ambito in ('hogar', 'personal')),
  miembro_id uuid,
  seq bigint not null check (seq > 0),
  creado_en timestamptz not null default now(),
  foreign key (hogar_id, miembro_id) references public.miembro (hogar_id, id)
);

create trigger fundacion_fixture_carriles_seq
  before insert or update on public.fundacion_fixture_carriles
  for each row execute function private.fundacion_seq_por_ambito();

-- ---------------------------------------------------------------------------
-- Carril del hogar
-- ---------------------------------------------------------------------------

select is((select ultimo_seq from public.hogar_seq
           where hogar_id = '11111111-1111-4111-8111-111111111101'), 3::bigint,
  'tres miembros del hogar llevan el contador del hogar a 3');
select is((select seq from public.miembro where id = '22222222-2222-4222-8222-222222222201'),
  1::bigint, 'el primer miembro recibe seq 1');
select is((select seq from public.miembro where id = '22222222-2222-4222-8222-222222222203'),
  3::bigint, 'el tercer miembro recibe seq 3');

insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por)
values ('33333333-3333-4333-8333-333333333301', '11111111-1111-4111-8111-111111111101',
        'Mercado', 1, now(), now(), '22222222-2222-4222-8222-222222222201');

select is((select seq from public.categoria where id = '33333333-3333-4333-8333-333333333301'),
  4::bigint, 'una categoría sigue la numeración del carril del hogar');
select is((select ultimo_seq from public.hogar_seq
           where hogar_id = '11111111-1111-4111-8111-111111111101'), 4::bigint,
  'el contador del hogar queda en 4');

insert into public.categoria (id, hogar_id, nombre, orden, seq, creado_en, actualizado_en, actualizado_por)
values ('33333333-3333-4333-8333-333333333302', '11111111-1111-4111-8111-111111111101',
        'Servicios', 2, 999, now(), now(), '22222222-2222-4222-8222-222222222201');

select is((select seq from public.categoria where id = '33333333-3333-4333-8333-333333333302'),
  5::bigint, 'el seq que manda el cliente se sobrescribe con el del servidor');
select is((select ultimo_seq from public.hogar_seq
           where hogar_id = '11111111-1111-4111-8111-111111111101'), 5::bigint,
  'el contador del hogar queda en 5');

update public.categoria set nombre = 'Servicios públicos'
where id = '33333333-3333-4333-8333-333333333302';

select is((select seq from public.categoria where id = '33333333-3333-4333-8333-333333333302'),
  6::bigint, 'una actualización vuelve a numerar la fila en su carril');
select is((select ultimo_seq from public.hogar_seq
           where hogar_id = '11111111-1111-4111-8111-111111111101'), 6::bigint,
  'el contador del hogar queda en 6');

-- ---------------------------------------------------------------------------
-- Carril personal y aislamiento entre carriles
-- ---------------------------------------------------------------------------

insert into public.fundacion_fixture_carriles (id, hogar_id, ambito, miembro_id, seq)
values ('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111101',
        'personal', '22222222-2222-4222-8222-222222222201', 1);

select is((select seq from public.fundacion_fixture_carriles
           where id = '44444444-4444-4444-8444-444444444401'), 1::bigint,
  'la fila personal de Ana arranca en 1 en su carril');
select is((select ultimo_seq from public.personal_seq
           where miembro_id = '22222222-2222-4222-8222-222222222201'), 1::bigint,
  'el carril personal de Ana queda en 1');
select is((select ultimo_seq from public.hogar_seq
           where hogar_id = '11111111-1111-4111-8111-111111111101'), 6::bigint,
  'una fila personal no mueve el contador del hogar (I25)');

insert into public.fundacion_fixture_carriles (id, hogar_id, ambito, miembro_id, seq)
values ('44444444-4444-4444-8444-444444444402', '11111111-1111-4111-8111-111111111101',
        'hogar', null, 1);

select is((select seq from public.fundacion_fixture_carriles
           where id = '44444444-4444-4444-8444-444444444402'), 7::bigint,
  'una fila compartida toma el siguiente número del carril del hogar');
select is((select ultimo_seq from public.personal_seq
           where miembro_id = '22222222-2222-4222-8222-222222222201'), 1::bigint,
  'una fila compartida no mueve el carril personal');

insert into public.fundacion_fixture_carriles (id, hogar_id, ambito, miembro_id, seq)
values ('44444444-4444-4444-8444-444444444403', '11111111-1111-4111-8111-111111111101',
        'personal', '22222222-2222-4222-8222-222222222202', 1);

select is((select ultimo_seq from public.personal_seq
           where miembro_id = '22222222-2222-4222-8222-222222222202'), 1::bigint,
  'el carril personal de Beto numera solo sus filas');
select is((select ultimo_seq from public.personal_seq
           where miembro_id = '22222222-2222-4222-8222-222222222201'), 1::bigint,
  'el carril de Ana no se mueve por una fila de Beto');

select throws_ok(
  $$ insert into public.fundacion_fixture_carriles (id, hogar_id, ambito, miembro_id, seq)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'otro', null, 1) $$,
  '23514', null, 'un ámbito desconocido no tiene carril y se rechaza');

select throws_ok(
  $$ insert into public.fundacion_fixture_carriles (id, hogar_id, ambito, miembro_id, seq)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'personal', null, 1) $$,
  '23514', null, 'una fila personal sin dueño se rechaza');

select throws_ok(
  $$ insert into public.fundacion_fixture_carriles (id, hogar_id, ambito, miembro_id, seq)
     values (gen_random_uuid(), '11111111-1111-4111-8111-111111111101', 'personal',
             '22222222-2222-4222-8222-222222222203', 1) $$,
  '23503', null, 'un miembro sin carril personal no puede numerar filas personales');

-- ---------------------------------------------------------------------------
-- Tenencia inmutable y contadores fuera del alcance del cliente
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.miembro set hogar_id = '11111111-1111-4111-8111-111111111102'
     where id = '22222222-2222-4222-8222-222222222202' $$,
  '23514', null, 'un miembro no puede cambiar de hogar');

select throws_ok(
  $$ update public.miembro set id = gen_random_uuid()
     where id = '22222222-2222-4222-8222-222222222202' $$,
  '23514', null, 'un miembro no puede cambiar de id');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

select throws_ok('select * from public.hogar_seq', '42501', null,
  'authenticated no puede leer el contador del hogar');
select throws_ok('select * from public.personal_seq', '42501', null,
  'authenticated no puede leer el contador personal');
select throws_ok(
  $$ update public.hogar_seq set ultimo_seq = ultimo_seq + 1
     where hogar_id = '11111111-1111-4111-8111-111111111101' $$,
  '42501', null, 'authenticated no puede mover el contador del hogar a mano');
select throws_ok('select private.uuid_v7()', '42501', null,
  'authenticated no puede llamar al generador privado de UUIDv7');

reset role;

select * from finish();
rollback;
