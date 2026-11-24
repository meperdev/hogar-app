-- Fundación (S2): RPC atómica `crear_hogar` y alta del primer admin.
-- Contrato: crear_hogar(p_nombre text, p_nombre_miembro text) -> jsonb
--           {hogar_id, miembro_id}; solo authenticated con sub en el JWT.
begin;

set search_path = public, extensions;

select plan(48);

-- Los conteos de este archivo son globales: se parte de una base de fundación
-- vacía dentro de la transacción, sin depender de datos de desarrollo locales.
-- El ROLLBACK final restaura lo que hubiera. CASCADE vacía también las tablas
-- de los núcleos que referencian a la fundación (compra, pasivo, ...).
truncate public.personal_seq, public.hogar_seq, public.categoria, public.miembro, public.hogar
  cascade;

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
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sin@hogar.test', 'x', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Puertas de entrada
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok($$ select public.crear_hogar('Casa', 'Ana') $$, '42501', null,
  'anon no puede ejecutar crear_hogar');
reset role;

set local role authenticated;
select throws_ok($$ select public.crear_hogar('Casa', 'Ana') $$, '28000', null,
  'authenticated sin sub en el JWT no crea hogar');
reset role;

-- ---------------------------------------------------------------------------
-- Alta del primer hogar: admin, carriles y categorías por defecto
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

-- `perform ok()` dentro de DO no emite TAP: el resultado se guarda en un
-- setting de la transacción y se afirma afuera.
do $$
begin
  perform set_config('fundacion.alta', public.crear_hogar('Casa de Ana', 'Ana')::text, true);
end;
$$;

select ok(
  (current_setting('fundacion.alta')::jsonb ? 'hogar_id')
    and (current_setting('fundacion.alta')::jsonb ? 'miembro_id'),
  'crear_hogar devuelve hogar_id y miembro_id');

select is(
  (select array_agg(k::text order by k::text)
     from jsonb_object_keys(current_setting('fundacion.alta')::jsonb) as k),
  array['hogar_id', 'miembro_id'],
  'el resultado no trae claves de más');

select is((current_setting('fundacion.alta')::jsonb ->> 'miembro_id')::uuid,
  (select id from public.miembro),
  'el miembro_id devuelto es el del miembro creado');

select is((select count(*)::int from public.hogar), 1, 'Ana queda con un único hogar');
select is((select nombre from public.hogar), 'Casa de Ana', 'el nombre del hogar se guarda');
select is((select moneda from public.hogar), 'COP', 'el hogar nace en COP');
select is((select zona_horaria from public.hogar), 'America/Bogota', 'el hogar nace en America/Bogota');
select is((select mostrar_pct_ingreso from public.hogar), false, 'la vista de % de ingreso nace apagada');

select is((select count(*)::int from public.miembro), 1, 'el alta crea un solo miembro');
select is((select nombre from public.miembro), 'Ana', 'el miembro lleva el nombre recibido');
select is((select rol::text from public.miembro), 'admin', 'el primer miembro es admin');
select is((select activo from public.miembro), true, 'el primer miembro nace activo');
select is((select usuario_id from public.miembro), '00000000-0000-4000-8000-0000000000a1'::uuid,
  'el miembro queda vinculado a la sesión que creó el hogar');

select is((select count(*)::int from public.categoria), 9, 'el alta siembra nueve categorías');
select is((select count(*)::int from public.categoria where activa), 9, 'todas las categorías nacen activas');
select results_eq(
  $$ select nombre from public.categoria order by orden $$,
  $$ values ('Mercado'::text), ('Servicios'), ('Arriendo'), ('Transporte'), ('Salud'),
            ('Mascotas'), ('Hogar y electrodomésticos'), ('Entretenimiento'), ('Otros') $$,
  'las categorías por defecto son las canónicas y van en orden');

reset role;

select is((select ultimo_seq from public.hogar_seq), 11::bigint,
  'el carril del hogar numera el hogar, el miembro y las nueve categorías');
select is((select actualizado_por from public.hogar), (select id from public.miembro),
  'el autor del hogar es su primer admin');
select is((select count(*)::int from public.personal_seq), 1, 'el alta crea un carril personal');
select is((select ultimo_seq from public.personal_seq), 0::bigint,
  'el carril personal del primer admin arranca en 0');
select is(
  (select array_agg(seq order by seq) from
     (select seq from public.hogar union all select seq from public.miembro
      union all select seq from public.categoria) s),
  array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]::bigint[],
  'la numeración del carril del hogar es contigua, sin saltos');
select is((select count(*)::int from public.miembro
           where hogar_id = (select hogar_id from public.personal_seq)),
  1, 'el carril personal apunta al miembro del hogar recién creado');

select is(substr((select id::text from public.hogar), 15, 1), '7', 'el hogar nace con UUIDv7');
select is(substr((select id::text from public.miembro), 15, 1), '7', 'el miembro nace con UUIDv7');

-- ---------------------------------------------------------------------------
-- Un hogar por usuario en la fase 1, sin bloquear el multi-hogar futuro
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

select throws_ok($$ select public.crear_hogar('Otro hogar', 'Ana') $$, '23505', null,
  'quien ya tiene hogar no puede crear otro en la fase 1');

reset role;

select is((select count(*)::int from public.hogar), 1, 'el intento rechazado no crea hogar');
select is((select count(*)::int from public.categoria), 9, 'el intento rechazado no crea categorías');
select is((select ultimo_seq from public.hogar_seq), 11::bigint,
  'el intento rechazado no mueve el contador del hogar');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$ select public.crear_hogar('Casa de Beto', 'Beto') $$,
  'otro usuario sin hogar sí puede crear el suyo');

select is((select count(*)::int from public.hogar), 1, 'Beto solo ve su propio hogar');
select is((select nombre from public.hogar), 'Casa de Beto', 'Beto ve el nombre de su hogar');

reset role;

select is((select count(*)::int from public.hogar), 2, 'ahora existen dos hogares aislados');
select is((select count(*)::int from public.miembro), 2, 'cada hogar tiene su admin');

-- ---------------------------------------------------------------------------
-- Validación de nombres y alta atómica
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
set local role authenticated;

select throws_ok($$ select public.crear_hogar('', 'Ana') $$, '22023', null,
  'un nombre de hogar vacío se rechaza');
select throws_ok($$ select public.crear_hogar('   ', 'Ana') $$, '22023', null,
  'un nombre de hogar en blanco se rechaza');
select throws_ok($$ select public.crear_hogar('Casa', '') $$, '22023', null,
  'un nombre de miembro vacío se rechaza');
select throws_ok($$ select public.crear_hogar(repeat('x', 81), 'Ana') $$, '22023', null,
  'un nombre de hogar de más de 80 caracteres se rechaza');
select throws_ok($$ select public.crear_hogar(E'\t\n', 'Ana') $$, '22023', null,
  'un nombre de hogar de solo tabuladores y saltos se rechaza');
select throws_ok($$ select public.crear_hogar('Casa', E'\t') $$, '22023', null,
  'un nombre de miembro de solo tabuladores se rechaza');

reset role;

-- Falla inyectada a mitad de la RPC: el alta completa se revierte.
create function public.fundacion_test_fallar_categoria()
returns trigger
language plpgsql
as $$
begin
  raise exception 'falla inyectada en la prueba' using errcode = 'P0001';
end;
$$;

create trigger fundacion_test_fallar_categoria
  before insert on public.categoria
  for each row execute function public.fundacion_test_fallar_categoria();

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
set local role authenticated;

select throws_ok($$ select public.crear_hogar('Casa que falla', 'Sin') $$, 'P0001', null,
  'un fallo a mitad del alta propaga la excepción');

reset role;

select is((select count(*)::int from public.hogar), 2, 'el alta fallida no deja hogar');
select is((select count(*)::int from public.miembro
           where usuario_id = '00000000-0000-4000-8000-0000000000e5'), 0,
  'el alta fallida no deja miembro');
select is((select count(*)::int from public.categoria), 18, 'el alta fallida no deja categorías');
select is((select count(*)::int from public.hogar_seq), 2, 'el alta fallida no deja contador de hogar');
select is((select count(*)::int from public.personal_seq), 2, 'el alta fallida no deja carril personal');
select is((select ultimo_seq from public.hogar_seq order by ultimo_seq desc limit 1), 11::bigint,
  'el alta fallida no mueve los contadores existentes');

drop trigger fundacion_test_fallar_categoria on public.categoria;
drop function public.fundacion_test_fallar_categoria();

select * from finish();
rollback;
