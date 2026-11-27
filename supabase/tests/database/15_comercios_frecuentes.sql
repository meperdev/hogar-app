-- Comercios frecuentes por hogar: semilla inicial, crear, editar, archivar y reordenar. Rollback al final.
begin;
set search_path = public, extensions;
select plan(13);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario)::text, true);
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at) values
  ('66666666-6666-4666-8666-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@comercios.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('66666666-6666-4666-8666-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'sin@comercios.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- 1-2. Puertas de entrada
set local role anon;
select throws_ok(
  $$ select public.crear_comercio_frecuente('Dollarcity', null) $$,
  '42501', null,
  'anon no puede crear comercio frecuente'
);
reset role;

select pg_temp.como('66666666-6666-4666-8666-00000000b102');
select throws_ok(
  $$ select public.crear_comercio_frecuente('Dollarcity', null) $$,
  '42501', null,
  'usuario sin hogar no puede crear comercio frecuente'
);

-- Crear hogar con Ana: debe sembrar 9 comercios iniciales
select pg_temp.como('66666666-6666-4666-8666-00000000a101');
do $$
declare
  v_alta jsonb;
  v_cat_hogar uuid;
  v_cat_transp uuid;
  v_nuevo jsonb;
  v_d1 uuid;
begin
  v_alta := public.crear_hogar('Casa Comercios', 'Ana');
  perform set_config('prueba.hogar_id', v_alta ->> 'hogar_id', true);

  select id into v_cat_hogar from public.categoria
   where hogar_id = current_setting('prueba.hogar_id')::uuid and nombre = 'Hogar y electrodomésticos' limit 1;
  select id into v_cat_transp from public.categoria
   where hogar_id = current_setting('prueba.hogar_id')::uuid and nombre = 'Transporte' limit 1;
  select id into v_d1 from public.comercio_frecuente
   where hogar_id = current_setting('prueba.hogar_id')::uuid and nombre = 'D1' limit 1;

  v_nuevo := public.crear_comercio_frecuente('  Dollarcity  ', v_cat_hogar);

  perform set_config('prueba.cat_hogar', v_cat_hogar::text, true);
  perform set_config('prueba.cat_transp', v_cat_transp::text, true);
  perform set_config('prueba.d1_id', v_d1::text, true);
  perform set_config('prueba.dollar_id', v_nuevo ->> 'id', true);
  perform set_config('prueba.dollar_orden', v_nuevo ->> 'orden', true);
end;
$$;

-- 3. Semilla inicial de 9 comercios + nuevo creado con orden 9
select is(
  (select count(*)::int from public.comercio_frecuente where hogar_id = current_setting('prueba.hogar_id')::uuid),
  10,
  'crear_hogar siembra 9 comercios y crear_comercio_frecuente agrega el décimo'
);
select is(
  current_setting('prueba.dollar_orden')::int,
  9,
  'crear_comercio_frecuente asigna orden incremental'
);

-- 4-5. Validación de duplicados y categoría ajena
select throws_ok(
  $$ select public.crear_comercio_frecuente('dollarcity', null) $$,
  '23505', null,
  'rechaza duplicado activo sin distinguir mayúsculas'
);
select throws_ok(
  $$ select public.crear_comercio_frecuente('Makro', '99999999-9999-4999-8999-000000009999') $$,
  '22023', null,
  'rechaza categoría sugerida inexistente o de otro hogar'
);

-- 6. Editar comercio
select is(
  (public.editar_comercio_frecuente(
    current_setting('prueba.dollar_id')::uuid,
    'Dollarcity Centro',
    current_setting('prueba.cat_transp')::uuid
  ) ->> 'nombre'),
  'Dollarcity Centro',
  'editar_comercio_frecuente actualiza nombre y categoría'
);

-- 7-9. Archivar, duplicar nombre después de archivar y bloquear reactivación conflictiva
select is(
  (public.archivar_comercio_frecuente(current_setting('prueba.dollar_id')::uuid, false) ->> 'activo')::boolean,
  false,
  'archivar_comercio_frecuente desactiva comercio'
);
select lives_ok(
  $$ select public.crear_comercio_frecuente('Dollarcity Centro', null) $$,
  'al archivar permite crear otro activo con el mismo nombre'
);
select throws_ok(
  $$ select public.archivar_comercio_frecuente(current_setting('prueba.dollar_id')::uuid, true) $$,
  '23505', null,
  'impide reactivar si ya existe otro comercio activo con el mismo nombre'
);

-- 10-12. Reordenar comercios
select lives_ok(
  $$ select public.reordenar_comercios_frecuentes(array[
    current_setting('prueba.dollar_id')::uuid,
    current_setting('prueba.d1_id')::uuid
  ]) $$,
  'reordenar_comercios_frecuentes actualiza orden sin error'
);
select is(
  (select orden::int from public.comercio_frecuente where id = current_setting('prueba.d1_id')::uuid),
  1,
  'reordenar_comercios_frecuentes persiste la posición esperada'
);
select throws_ok(
  $$ select public.reordenar_comercios_frecuentes(array[
    current_setting('prueba.d1_id')::uuid,
    current_setting('prueba.d1_id')::uuid
  ]) $$,
  '22023', null,
  'rechaza identificadores repetidos al reordenar comercios'
);

select * from finish();
rollback;
