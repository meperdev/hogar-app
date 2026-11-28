-- Comentarios rápidos por categoría: creación, unicidad, aislamiento entre hogares y eliminación. Rollback al final.
begin;
set search_path = public, extensions;
select plan(12);

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
   'authenticated', 'ana@comentarios.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('77777777-7777-4777-8777-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@comentarios.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('77777777-7777-4777-8777-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'sin@comentarios.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- 1-2. Puertas de entrada
set local role anon;
select throws_ok(
  $$ select public.crear_comentario_rapido('99999999-9999-4999-8999-000000009999', 'Tanqueada moto') $$,
  '42501', null,
  'anon no puede crear comentario rápido'
);
reset role;

select pg_temp.como('77777777-7777-4777-8777-00000000c103');
select throws_ok(
  $$ select public.crear_comentario_rapido('99999999-9999-4999-8999-000000009999', 'Tanqueada moto') $$,
  '42501', null,
  'usuario sin hogar no puede crear comentario rápido'
);

-- Crear hogar de Beto (hogar ajeno)
select pg_temp.como('77777777-7777-4777-8777-00000000b102');
do $$
declare
  v_alta jsonb;
  v_cat_beto uuid;
begin
  v_alta := public.crear_hogar('Casa Beto', 'Beto');
  select id into v_cat_beto from public.categoria
   where hogar_id = (v_alta ->> 'hogar_id')::uuid and nombre = 'Transporte' limit 1;
  perform set_config('prueba.beto_cat_id', v_cat_beto::text, true);
end;
$$;

-- Crear hogar de Ana y sembrar comentarios rápidos
select pg_temp.como('77777777-7777-4777-8777-00000000a101');
do $$
declare
  v_alta jsonb;
  v_cat_transp uuid;
  v_cat_hogar uuid;
  v_res jsonb;
begin
  v_alta := public.crear_hogar('Casa Ana', 'Ana');
  perform set_config('prueba.hogar_id', v_alta ->> 'hogar_id', true);

  select id into v_cat_transp from public.categoria
   where hogar_id = (v_alta ->> 'hogar_id')::uuid and nombre = 'Transporte' limit 1;
  select id into v_cat_hogar from public.categoria
   where hogar_id = (v_alta ->> 'hogar_id')::uuid and nombre = 'Hogar' limit 1;

  v_res := public.crear_comentario_rapido(v_cat_transp, '  Tanqueada moto  ');
  perform set_config('prueba.cat_transp', v_cat_transp::text, true);
  perform set_config('prueba.cat_hogar', v_cat_hogar::text, true);
  perform set_config('prueba.cr_id', v_res ->> 'id', true);
  perform set_config('prueba.cr_texto', v_res ->> 'texto', true);
end;
$$;

-- 3-4. Creación y lectura por RLS
select is(
  current_setting('prueba.cr_texto'),
  'Tanqueada moto',
  'crear_comentario_rapido recorta espacios y devuelve el texto limpio'
);
select is(
  (select count(*)::int from public.comentario_rapido where hogar_id = current_setting('prueba.hogar_id')::uuid and eliminado_en is null),
  1,
  'la política RLS select permite leer los comentarios del propio hogar'
);

-- 5-6. Duplicado en misma categoría rechazado, pero misma frase en otra categoría permitida
select throws_ok(
  $$ select public.crear_comentario_rapido(current_setting('prueba.cat_transp')::uuid, 'tanqueada moto') $$,
  '23505', null,
  'rechaza duplicado activo en la misma categoría sin distinguir mayúsculas'
);
select is(
  (public.crear_comentario_rapido(current_setting('prueba.cat_hogar')::uuid, 'Tanqueada moto') ->> 'texto'),
  'Tanqueada moto',
  'permite usar el mismo texto en una categoría distinta'
);

-- 7. Categoría de otro hogar rechazada
select throws_ok(
  $$ select public.crear_comentario_rapido(current_setting('prueba.beto_cat_id')::uuid, 'Otro') $$,
  '22023', null,
  'rechaza categoría perteneciente a otro hogar'
);

-- 8-9. Aislamiento entre hogares: Beto no puede ver ni eliminar el comentario de Ana
select pg_temp.como('77777777-7777-4777-8777-00000000b102');
select is(
  (select count(*)::int from public.comentario_rapido where id = current_setting('prueba.cr_id')::uuid),
  0,
  'otro hogar no puede ver el comentario rápido por RLS'
);
select throws_ok(
  $$ select public.eliminar_comentario_rapido(current_setting('prueba.cr_id')::uuid) $$,
  '22023', null,
  'otro hogar no puede eliminar el comentario rápido'
);

-- 10-12. Ana elimina su comentario y puede volver a crearlo, con restricciones diferidas en verde
select pg_temp.como('77777777-7777-4777-8777-00000000a101');
select is(
  (public.eliminar_comentario_rapido(current_setting('prueba.cr_id')::uuid) ->> 'eliminado')::boolean,
  true,
  'eliminar_comentario_rapido marca eliminado_en correctamente'
);
select is(
  (public.crear_comentario_rapido(current_setting('prueba.cat_transp')::uuid, 'Tanqueada moto') ->> 'texto'),
  'Tanqueada moto',
  'permite recrear el mismo comentario después de eliminarlo'
);
select lives_ok(
  $$ set constraints all immediate $$,
  'restricciones diferidas validan sin error bajo rol authenticated'
);

select * from finish();
rollback;
