-- Fundación (S2): privacidad de filas personales con el mismo predicado de RLS.
-- La fundación no crea todavía tablas personales de producto (`Compra` y sus
-- dependientes llegan con el núcleo de compra rápida), así que la reutilización
-- del predicado se prueba con una tabla de prueba con la misma forma: `ambito`
-- más `miembro_id` y la política `private.puede_ver(hogar_id, ambito, miembro_id)`.
begin;

set search_path = public, extensions;

select plan(13);

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

-- `actualizado_por` apunta al admin que se inserta después (FK diferida) y el
-- alta del hogar abre su carril `hogar_seq` con seq 1.
insert into public.hogar (id, nombre, actualizado_por, creado_en, actualizado_en)
values
  ('11111111-1111-4111-8111-111111111101', 'Hogar A', '22222222-2222-4222-8222-222222222201', now(), now()),
  ('11111111-1111-4111-8111-111111111102', 'Hogar B', '22222222-2222-4222-8222-222222222204', now(), now());

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

insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq)
values
  ('11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201', 0),
  ('11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222202', 0);

-- Tabla solo de prueba: la misma forma de una fila replicada con ámbito.
create table public.fundacion_fixture_privada (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  ambito text not null check (ambito in ('hogar', 'personal')),
  miembro_id uuid,
  descripcion text not null,
  seq bigint not null check (seq > 0),
  eliminado_en timestamptz,
  foreign key (hogar_id, miembro_id) references public.miembro (hogar_id, id)
);

create trigger fundacion_fixture_privada_seq
  before insert or update on public.fundacion_fixture_privada
  for each row execute function private.fundacion_seq_por_ambito();

alter table public.fundacion_fixture_privada enable row level security;
create policy fundacion_fixture_privada_select on public.fundacion_fixture_privada
  for select to authenticated
  using (private.puede_ver(hogar_id, ambito, miembro_id));
grant select on public.fundacion_fixture_privada to authenticated;

insert into public.fundacion_fixture_privada (id, hogar_id, ambito, miembro_id, descripcion, seq)
values
  ('55555555-5555-4555-8555-555555555501', '11111111-1111-4111-8111-111111111101',
   'hogar', null, 'compra del hogar', 1),
  ('55555555-5555-4555-8555-555555555502', '11111111-1111-4111-8111-111111111101',
   'personal', '22222222-2222-4222-8222-222222222201', 'compra personal de Ana', 1),
  ('55555555-5555-4555-8555-555555555503', '11111111-1111-4111-8111-111111111101',
   'personal', '22222222-2222-4222-8222-222222222202', 'compra personal de Beto', 1),
  ('55555555-5555-4555-8555-555555555504', '11111111-1111-4111-8111-111111111102',
   'hogar', null, 'compra del hogar B', 1);

-- La numeración de las dos filas personales de A va a los carriles de su dueño.
select is((select ultimo_seq from public.personal_seq
           where miembro_id = '22222222-2222-4222-8222-222222222201'), 1::bigint,
  'la fila personal de Ana numera su propio carril');
select is((select ultimo_seq from public.personal_seq
           where miembro_id = '22222222-2222-4222-8222-222222222202'), 1::bigint,
  'la fila personal de Beto numera su propio carril');
select is((select ultimo_seq from public.hogar_seq
           where hogar_id = '11111111-1111-4111-8111-111111111101'), 5::bigint,
  'el hogar, tres miembros y una fila compartida: lo personal no mueve el contador (I25)');

-- ---------------------------------------------------------------------------
-- Cada actor ve lo compartido y solo lo personal propio
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.fundacion_fixture_privada), 2,
  'Ana ve la fila compartida y su propia fila personal');
select is((select count(*)::int from public.fundacion_fixture_privada where ambito = 'personal'), 1,
  'Ana ve exactamente una fila personal: la suya');
select is((select count(*)::int from public.fundacion_fixture_privada
           where miembro_id = '22222222-2222-4222-8222-222222222202'), 0,
  'Ana no ve la fila personal de Beto');
select is((select count(*)::int from public.fundacion_fixture_privada
           where hogar_id = '11111111-1111-4111-8111-111111111102'), 0,
  'Ana no ve las filas del hogar B');

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.fundacion_fixture_privada), 2,
  'Beto ve la fila compartida y su propia fila personal');
select is((select count(*)::int from public.fundacion_fixture_privada
           where miembro_id = '22222222-2222-4222-8222-222222222201'), 0,
  'Beto no ve la fila personal de Ana, que además es la admin');

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.fundacion_fixture_privada), 1,
  'Dora solo ve la fila compartida de su propio hogar');

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.fundacion_fixture_privada), 0,
  'un miembro inactivo no ve ni lo compartido ni lo propio');

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.fundacion_fixture_privada), 0,
  'un autenticado sin hogar no ve ninguna fila');

reset role;

set local role anon;

select throws_ok('select * from public.fundacion_fixture_privada', '42501', null,
  'anon no puede leer la tabla de prueba');

reset role;

select * from finish();
rollback;
