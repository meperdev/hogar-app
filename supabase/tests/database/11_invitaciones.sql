-- Invitación de miembros: tabla solo-servidor `public.invitacion`, hash SHA-256,
-- permisos solo para `admin`, canje atómico (nuevo miembro o sin cuenta),
-- carril `personal_seq` en 0 y privacidad intacta. Rollback al final.
begin;
set search_path = public, extensions;
select plan(26);

create function pg_temp.fx(p_sufijo text) returns uuid language sql immutable as $$
  select ('77777777-7777-4777-8777-' || lpad(p_sufijo, 12, '0'))::uuid;
$$;

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
   'authenticated', 'ana@inv.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('77777777-7777-4777-8777-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@inv.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('77777777-7777-4777-8777-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'camila@inv.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('77777777-7777-4777-8777-00000000d104', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'diego@inv.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- Ana crea el hogar usando crear_hogar
select pg_temp.como('77777777-7777-4777-8777-00000000a101');
select ok((public.crear_hogar('Casa de Ana', 'Ana') ->> 'hogar_id') is not null, 'Ana crea hogar');

reset role;

-- 1-5. Tabla solo-servidor y privilegios
select has_table('public', 'invitacion', 'existe tabla public.invitacion');
select is(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'invitacion'),
  true,
  'RLS activo en public.invitacion'
);
select is(has_table_privilege('anon', 'public.invitacion', 'SELECT'), false, 'anon no lee invitacion');
select is(has_table_privilege('authenticated', 'public.invitacion', 'SELECT'), false, 'authenticated no lee invitacion');
select is(has_function_privilege('anon', 'public.crear_invitacion(uuid, text)', 'EXECUTE'), false, 'anon no ejecuta crear_invitacion');

-- Insertamos una compra personal de Ana para verificar privacidad después del canje
insert into public.medio_de_pago (id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, actualizado_por)
select pg_temp.fx('301'), h.id, 'Efectivo Ana', 'efectivo', 'miembro', m.id, m.id
  from public.hogar h
  join public.miembro m on m.hogar_id = h.id and m.usuario_id = '77777777-7777-4777-8777-00000000a101';

insert into public.compra (id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito, miembro_id, pago_tipo, medio_de_pago_id, registrado_por, actualizado_por)
select pg_temp.fx('401'), h.id, '2026-11-25', 'Gasto privado Ana', 50000, c.id, 'personal', m.id, 'contado', pg_temp.fx('301'), m.id, m.id
  from public.hogar h
  join public.miembro m on m.hogar_id = h.id and m.usuario_id = '77777777-7777-4777-8777-00000000a101'
  join public.categoria c on c.hogar_id = h.id
 limit 1;

-- Miembro preexistente sin cuenta para probar vinculación
insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo, actualizado_por)
select pg_temp.fx('199'), h.id, 'Camila', null, 'miembro', true, m.id
  from public.hogar h
  join public.miembro m on m.hogar_id = h.id and m.usuario_id = '77777777-7777-4777-8777-00000000a101';

set constraints all immediate;
set constraints all deferred;

-- 6-10. Admin crea invitación; token_hash no coincide con token en claro; listar no expone hash
select pg_temp.como('77777777-7777-4777-8777-00000000a101');

do $$
declare
  v_res jsonb;
begin
  v_res := public.crear_invitacion(null, 'Para Beto');
  perform set_config('prueba.inv1_id', v_res ->> 'invitacion_id', true);
  perform set_config('prueba.inv1_tok', v_res ->> 'token', true);
end;
$$;

select is(pg_catalog.char_length(current_setting('prueba.inv1_tok')), 32, 'token URL-safe de 32 caracteres');

reset role;
select is(
  (select count(*) from public.invitacion i where i.id = current_setting('prueba.inv1_id')::uuid
    and i.token_hash <> current_setting('prueba.inv1_tok')
    and i.token_hash ~ '^[0-9a-f]{64}$'),
  1::bigint,
  'en BD se guarda hash SHA-256 hex y nunca el token en claro'
);
select ok(
  (select i.expira_en between i.creada_en + interval '6 days 23 hours' and i.creada_en + interval '7 days 1 minute'
     from public.invitacion i where i.id = current_setting('prueba.inv1_id')::uuid),
  'expira en 7 días'
);

select pg_temp.como('77777777-7777-4777-8777-00000000a101');
select is(
  (select jsonb_array_length(public.listar_invitaciones())),
  1,
  'listar_invitaciones devuelve 1 activa'
);
select is(
  (select (public.listar_invitaciones() -> 0) ? 'token_hash'),
  false,
  'listar_invitaciones nunca expone token_hash'
);

-- 11-16. Canje de Beto (nuevo miembro): crea miembro + personal_seq=0, falla reuso, no ve compras personales de Ana
select pg_temp.como('77777777-7777-4777-8777-00000000b102');
select ok(
  (public.canjear_invitacion(current_setting('prueba.inv1_tok'), 'Beto') ->> 'miembro_id') is not null,
  'Beto canjea la invitación'
);

-- Segundo uso del mismo token por otro usuario sin hogar (Diego) falla con 22023
select pg_temp.como('77777777-7777-4777-8777-00000000d104');
select throws_ok(
  $$
  select public.canjear_invitacion(current_setting('prueba.inv1_tok'), 'Diego')
  $$,
  '22023',
  null,
  'un token ya usado no puede reutilizarse'
);

-- Diego intenta canjear con un token que nunca existió -> mismo código 22023 (sin oráculo)
select pg_temp.como('77777777-7777-4777-8777-00000000d104');
select throws_ok(
  $$
  select public.canjear_invitacion('token_que_no_existe_123456', 'Diego')
  $$,
  '22023',
  null,
  'token inexistente falla con código uniforme 22023'
);

-- Beto no puede crear, listar ni revocar por no ser admin (42501)
select pg_temp.como('77777777-7777-4777-8777-00000000b102');
select throws_ok(
  $$ select public.crear_invitacion(null, null) $$,
  '42501', null, 'miembro no-admin no puede crear invitaciones'
);
select throws_ok(
  $$ select public.listar_invitaciones() $$,
  '42501', null, 'miembro no-admin no puede listar invitaciones'
);
select throws_ok(
  $$ select public.revocar_invitacion('77777777-7777-4777-8777-000000000001') $$,
  '42501', null, 'miembro no-admin no puede revocar invitaciones'
);

-- Beto ve el hogar pero NO ve compras personales de Ana
select is((select count(*) from public.hogar), 1::bigint, 'Beto ve su hogar compartido');
select is((select count(*) from public.compra where id = pg_temp.fx('401')), 0::bigint, 'Beto no ve compra personal de Ana');

reset role;
select is(
  (select ps.ultimo_seq from public.personal_seq ps
     join public.miembro m on m.id = ps.miembro_id and m.hogar_id = ps.hogar_id
    where m.usuario_id = '77777777-7777-4777-8777-00000000b102'),
  0::bigint,
  'personal_seq de Beto arranca en 0'
);

-- 17-20. Vinculación a miembro preexistente sin cuenta (Camila) y revocación
select pg_temp.como('77777777-7777-4777-8777-00000000a101');
select set_config('prueba.inv2_tok', public.crear_invitacion(pg_temp.fx('199'), 'Para Camila') ->> 'token', true);

select pg_temp.como('77777777-7777-4777-8777-00000000c103');
select is(
  (public.canjear_invitacion(current_setting('prueba.inv2_tok'), null) ->> 'miembro_id')::uuid,
  pg_temp.fx('199'),
  'canjear invitación dirigida vincula al miembro preexistente conservando su id'
);

-- Ana no puede canjear invitación porque ya tiene hogar activo (23505)
select pg_temp.como('77777777-7777-4777-8777-00000000a101');
select throws_ok(
  $$ select public.canjear_invitacion('cualquier_token_valido_xyz', 'Ana') $$,
  '23505',
  null,
  'usuario con hogar activo recibe 23505 al intentar canjear'
);

-- Admin revoca una invitación y Diego no puede canjearla
do $$
declare
  v_res jsonb;
begin
  v_res := public.crear_invitacion(null, 'Revocar luego');
  perform set_config('prueba.inv3_id', v_res ->> 'invitacion_id', true);
  perform set_config('prueba.inv3_tok', v_res ->> 'token', true);
end;
$$;

select is(
  (public.revocar_invitacion(current_setting('prueba.inv3_id')::uuid) ->> 'revocada')::boolean,
  true,
  'admin revoca invitación activa'
);
select is((select jsonb_array_length(public.listar_invitaciones())), 0, 'invitación revocada deja de listarse');

select pg_temp.como('77777777-7777-4777-8777-00000000d104');
select throws_ok(
  $$ select public.canjear_invitacion(current_setting('prueba.inv3_tok'), 'Diego') $$,
  '22023',
  null,
  'invitación revocada no puede canjearse'
);

-- Invitación vencida tampoco puede canjearse
select pg_temp.como('77777777-7777-4777-8777-00000000a101');
do $$
declare
  v_res jsonb;
begin
  v_res := public.crear_invitacion(null, 'Vencida');
  perform set_config('prueba.inv4_id', v_res ->> 'invitacion_id', true);
  perform set_config('prueba.inv4_tok', v_res ->> 'token', true);
end;
$$;

reset role;
update public.invitacion
   set creada_en = now() - interval '8 days',
       expira_en = now() - interval '1 day'
 where id = current_setting('prueba.inv4_id')::uuid;

select pg_temp.como('77777777-7777-4777-8777-00000000d104');
select throws_ok(
  $$ select public.canjear_invitacion(current_setting('prueba.inv4_tok'), 'Diego') $$,
  '22023',
  null,
  'invitación vencida falla con 22023'
);

select * from finish();
rollback;
