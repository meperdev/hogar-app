-- Medios de pago por defecto en crear_hogar/canjear_invitacion y RPCs
-- `crear_medio_de_pago` / `archivar_medio_de_pago`. Rollback al final.
begin;
set search_path = public, extensions;
select plan(17);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario)::text, true);
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at) values
  ('88888888-8888-4888-8888-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@medios.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('88888888-8888-4888-8888-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@medios.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('88888888-8888-4888-8888-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ext@medios.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- 1-2. Puertas de entrada
set local role anon;
select throws_ok($$ select public.crear_medio_de_pago('Nequi', 'cuenta', 'miembro') $$, '42501', null,
  'anon no puede crear medio de pago');
reset role;

select pg_temp.como('88888888-8888-4888-8888-00000000c103');
select throws_ok($$ select public.crear_medio_de_pago('Nequi', 'cuenta', 'miembro') $$, '42501', null,
  'usuario sin hogar no puede crear medio de pago');

-- 3-5. crear_hogar siembra Efectivo (Ana) y Fondo común
select pg_temp.como('88888888-8888-4888-8888-00000000a101');
do $$
declare
  v_alta jsonb;
begin
  v_alta := public.crear_hogar('Casa Medios', 'Ana');
  perform set_config('prueba.hogar_id', v_alta ->> 'hogar_id', true);
  perform set_config('prueba.ana_id', v_alta ->> 'miembro_id', true);
end;
$$;

select results_eq(
  $$ select nombre from public.medio_de_pago where hogar_id = current_setting('prueba.hogar_id')::uuid order by nombre $$,
  $$ values ('Efectivo (Ana)'::text), ('Fondo común'::text) $$,
  'crear_hogar siembra Efectivo del creador y Fondo común'
);

-- Invita a Beto y al canjear se le siembra Efectivo (Beto)
do $$
declare
  v_inv jsonb;
begin
  v_inv := public.crear_invitacion(null, null);
  perform set_config('prueba.inv_tok', v_inv ->> 'token', true);
end;
$$;

select pg_temp.como('88888888-8888-4888-8888-00000000b102');
do $$
declare
  v_canje jsonb;
begin
  v_canje := public.canjear_invitacion(current_setting('prueba.inv_tok'), 'Beto');
  perform set_config('prueba.beto_id', v_canje ->> 'miembro_id', true);
end;
$$;

select is(
  (select count(*)::int from public.medio_de_pago
    where hogar_id = current_setting('prueba.hogar_id')::uuid
      and owner_miembro_id = current_setting('prueba.beto_id')::uuid
      and nombre = 'Efectivo (Beto)'
      and tipo = 'efectivo'),
  1,
  'canjear_invitacion siembra Efectivo (Beto) para el nuevo miembro'
);

-- 6-11. crear_medio_de_pago: propio, hogar, validaciones y duplicado
do $$
declare
  v_res jsonb;
begin
  v_res := public.crear_medio_de_pago('  Nequi Beto  ', 'cuenta', 'miembro');
  perform set_config('prueba.nequi_beto_id', v_res ->> 'id', true);
end;
$$;

select is(
  (select nombre from public.medio_de_pago where id = current_setting('prueba.nequi_beto_id')::uuid),
  'Nequi Beto',
  'crear_medio_de_pago recorta espacios y guarda el medio propio'
);
select is(
  (select owner_miembro_id from public.medio_de_pago where id = current_setting('prueba.nequi_beto_id')::uuid),
  current_setting('prueba.beto_id')::uuid,
  'medio de miembro queda asociado al miembro autenticado'
);

do $$
declare
  v_res jsonb;
begin
  v_res := public.crear_medio_de_pago('Caja menor', 'efectivo', 'hogar');
  perform set_config('prueba.caja_id', v_res ->> 'id', true);
end;
$$;

select is(
  (select owner_miembro_id is null and owner_tipo = 'hogar' from public.medio_de_pago where id = current_setting('prueba.caja_id')::uuid),
  true,
  'medio de hogar queda con owner_tipo = hogar y owner_miembro_id null'
);

select throws_ok($$ select public.crear_medio_de_pago('nequi beto', 'cuenta', 'miembro') $$, '23505', null,
  'no permite duplicar nombre activo sin distinguir mayúsculas');
select throws_ok($$ select public.crear_medio_de_pago('   ', 'cuenta', 'miembro') $$, '22023', null,
  'rechaza nombre vacío o solo espacios');
select throws_ok($$ select public.crear_medio_de_pago('Visa', 'tarjeta', 'miembro') $$, '22023', null,
  'rechaza tipo fuera de efectivo/cuenta');
select throws_ok($$ select public.crear_medio_de_pago('Otro', 'cuenta', 'tercero') $$, '22023', null,
  'rechaza owner_tipo fuera de miembro/hogar');

-- 12-17. archivar_medio_de_pago: permisos dueño vs miembro no-admin vs admin, y reactivación
select pg_temp.como('88888888-8888-4888-8888-00000000b102');
select throws_ok(
  $$ select public.archivar_medio_de_pago((select id from public.medio_de_pago where hogar_id = current_setting('prueba.hogar_id')::uuid and nombre = 'Efectivo (Ana)' limit 1), false) $$,
  '42501', null,
  'miembro no-admin no puede archivar el medio de otro miembro'
);
select throws_ok(
  $$ select public.archivar_medio_de_pago(current_setting('prueba.caja_id')::uuid, false) $$,
  '42501', null,
  'miembro no-admin no puede archivar un medio del hogar'
);

select is(
  (public.archivar_medio_de_pago(current_setting('prueba.nequi_beto_id')::uuid, false) ->> 'activo')::boolean,
  false,
  'el dueño puede archivar su propio medio'
);

-- Un medio archivado permite reutilizar el nombre en uno nuevo, y luego bloquea reactivar el viejo
select lives_ok(
  $$ select public.crear_medio_de_pago('Nequi Beto', 'cuenta', 'miembro') $$,
  'al archivar Nequi Beto se puede crear otro activo con el mismo nombre'
);
select throws_ok(
  $$ select public.archivar_medio_de_pago(current_setting('prueba.nequi_beto_id')::uuid, true) $$,
  '23505', null,
  'no permite reactivar si ya existe otro activo con el mismo nombre'
);

-- Admin (Ana) sí puede archivar medio del hogar
select pg_temp.como('88888888-8888-4888-8888-00000000a101');
select is(
  (public.archivar_medio_de_pago(current_setting('prueba.caja_id')::uuid, false) ->> 'activo')::boolean,
  false,
  'admin puede archivar medio del hogar'
);

select * from finish();
rollback;
