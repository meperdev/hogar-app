-- Orden personalizado de medios de pago (`orden`) y RPC `reordenar_medios_de_pago`. Rollback al final.
begin;
set search_path = public, extensions;
select plan(8);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario)::text, true);
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at) values
  ('77777777-7777-4777-8777-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@orden.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('77777777-7777-4777-8777-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'sin-hogar@orden.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- 1-2. Puertas de entrada
set local role anon;
select throws_ok(
  $$ select public.reordenar_medios_de_pago(array['11111111-1111-4111-8111-000000000001'::uuid]) $$,
  '42501', null,
  'anon no puede reordenar medios de pago'
);
reset role;

select pg_temp.como('77777777-7777-4777-8777-00000000b102');
select throws_ok(
  $$ select public.reordenar_medios_de_pago(array['11111111-1111-4111-8111-000000000001'::uuid]) $$,
  '42501', null,
  'usuario sin hogar no puede reordenar medios de pago'
);

-- Crear hogar con Ana y dos medios adicionales
select pg_temp.como('77777777-7777-4777-8777-00000000a101');
do $$
declare
  v_alta jsonb;
  v_m1 jsonb;
  v_m2 jsonb;
  v_ef uuid;
  v_fc uuid;
begin
  v_alta := public.crear_hogar('Casa Orden', 'Ana');
  perform set_config('prueba.hogar_id', v_alta ->> 'hogar_id', true);

  select id into v_ef from public.medio_de_pago
   where hogar_id = current_setting('prueba.hogar_id')::uuid and nombre = 'Efectivo (Ana)' limit 1;
  select id into v_fc from public.medio_de_pago
   where hogar_id = current_setting('prueba.hogar_id')::uuid and nombre = 'Fondo común' limit 1;

  v_m1 := public.crear_medio_de_pago('Nequi', 'cuenta', 'miembro');
  v_m2 := public.crear_medio_de_pago('Bancolombia', 'cuenta', 'hogar');

  perform set_config('prueba.ef_id', v_ef::text, true);
  perform set_config('prueba.fc_id', v_fc::text, true);
  perform set_config('prueba.nequi_id', v_m1 ->> 'id', true);
  perform set_config('prueba.banco_id', v_m2 ->> 'id', true);
  perform set_config('prueba.nequi_orden', v_m1 ->> 'orden', true);
  perform set_config('prueba.banco_orden', v_m2 ->> 'orden', true);
end;
$$;

-- 3. crear_medio_de_pago incrementa `orden`
select is(
  (current_setting('prueba.banco_orden')::int > current_setting('prueba.nequi_orden')::int),
  true,
  'crear_medio_de_pago asigna orden incremental al nuevo medio'
);

-- 4. reordenar_medios_de_pago guarda el orden exacto
select lives_ok(
  $$ select public.reordenar_medios_de_pago(array[
    current_setting('prueba.nequi_id')::uuid,
    current_setting('prueba.banco_id')::uuid,
    current_setting('prueba.ef_id')::uuid,
    current_setting('prueba.fc_id')::uuid
  ]) $$,
  'reordenar_medios_de_pago acepta la lista válida del hogar'
);

select results_eq(
  $$ select nombre from public.medio_de_pago
      where hogar_id = current_setting('prueba.hogar_id')::uuid
      order by orden asc, nombre asc $$,
  $$ values ('Nequi'::text), ('Bancolombia'::text), ('Efectivo (Ana)'::text), ('Fondo común'::text) $$,
  'los medios quedan ordenados según orden ascendente'
);

-- 5-8. Validaciones de entrada
select throws_ok(
  $$ select public.reordenar_medios_de_pago(array[]::uuid[]) $$,
  '22023', null,
  'rechaza lista vacía al reordenar'
);
select throws_ok(
  $$ select public.reordenar_medios_de_pago(array[
    current_setting('prueba.nequi_id')::uuid,
    current_setting('prueba.nequi_id')::uuid
  ]) $$,
  '22023', null,
  'rechaza identificadores repetidos al reordenar'
);
select throws_ok(
  $$ select public.reordenar_medios_de_pago(array[
    current_setting('prueba.nequi_id')::uuid,
    '99999999-9999-4999-8999-000000009999'::uuid
  ]) $$,
  '22023', null,
  'rechaza medio inexistente o de otro hogar'
);

select * from finish();
rollback;
