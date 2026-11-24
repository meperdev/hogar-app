-- Núcleo 1, compra rápida (S2, S3, S4, S5, S7): esquema, CHECKs, reglas entre
-- filas diferidas y visibilidad de las once tablas. Termina en rollback.
-- Actores: Ana (admin hogar A), Beto (miembro A), Caro (admin hogar B).
-- Fixtures (prefijo 66): hogar A ...6601 · hogar B ...6602 · Ana ...6201 ·
-- Beto ...6202 · Caro ...6203 · Mercado ...6301 · Efectivo Ana ...6401 ·
-- Visa hogar ...6501 · Visa personal Ana ...6502 · Préstamo cocina ...6503 ·
-- Crédito Beto ...6504 · desembolso préstamo ...6603 · desembolso crédito ...6604
begin;
set search_path = public, extensions;
select plan(74);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at) values
  ('66666666-6666-4666-8666-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@compra.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('66666666-6666-4666-8666-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@compra.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('66666666-6666-4666-8666-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'caro@compra.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- El alta del hogar abre su carril; `actualizado_por` apunta al admin que sigue.
insert into public.hogar (id, nombre, actualizado_por, creado_en, actualizado_en) values
  ('66666666-6666-4666-8666-666666666601', 'Hogar A', '66666666-6666-4666-8666-666666666201', now(), now()),
  ('66666666-6666-4666-8666-666666666602', 'Hogar B', '66666666-6666-4666-8666-666666666203', now(), now());

insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo, creado_en, actualizado_en, actualizado_por) values
  ('66666666-6666-4666-8666-666666666201', '66666666-6666-4666-8666-666666666601', 'Ana', '66666666-6666-4666-8666-00000000a101', 'admin', true, now(), now(), '66666666-6666-4666-8666-666666666201'),
  ('66666666-6666-4666-8666-666666666202', '66666666-6666-4666-8666-666666666601', 'Beto', '66666666-6666-4666-8666-00000000b102', 'miembro', true, now(), now(), '66666666-6666-4666-8666-666666666202'),
  ('66666666-6666-4666-8666-666666666203', '66666666-6666-4666-8666-666666666602', 'Caro', '66666666-6666-4666-8666-00000000c103', 'admin', true, now(), now(), '66666666-6666-4666-8666-666666666203');

insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq) values
  ('66666666-6666-4666-8666-666666666601', '66666666-6666-4666-8666-666666666201', 0),
  ('66666666-6666-4666-8666-666666666601', '66666666-6666-4666-8666-666666666202', 0),
  ('66666666-6666-4666-8666-666666666602', '66666666-6666-4666-8666-666666666203', 0);

insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por)
values ('66666666-6666-4666-8666-666666666301', '66666666-6666-4666-8666-666666666601', 'Mercado', 1, now(), now(), '66666666-6666-4666-8666-666666666201');

insert into public.medio_de_pago (id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, creado_en, actualizado_en, actualizado_por)
values ('66666666-6666-4666-8666-666666666401', '66666666-6666-4666-8666-666666666601', 'Efectivo Ana', 'efectivo', 'miembro', '66666666-6666-4666-8666-666666666201', now(), now(), '66666666-6666-4666-8666-666666666201');

insert into public.pasivo (id, hogar_id, tipo, nombre, ambito, owner_tipo, owner_miembro_id, tasa_tipo, tasa_ppm, creado_en, actualizado_en, actualizado_por) values
  ('66666666-6666-4666-8666-666666666501', '66666666-6666-4666-8666-666666666601', 'tarjeta', 'Visa hogar', 'hogar', 'miembro', '66666666-6666-4666-8666-666666666201', 'EA', 283200, now(), now(), '66666666-6666-4666-8666-666666666201'),
  ('66666666-6666-4666-8666-666666666502', '66666666-6666-4666-8666-666666666601', 'tarjeta', 'Visa personal Ana', 'personal', 'miembro', '66666666-6666-4666-8666-666666666201', null, null, now(), now(), '66666666-6666-4666-8666-666666666201'),
  ('66666666-6666-4666-8666-666666666503', '66666666-6666-4666-8666-666666666601', 'deuda', 'Préstamo cocina', 'hogar', 'hogar', null, null, null, now(), now(), '66666666-6666-4666-8666-666666666201'),
  ('66666666-6666-4666-8666-666666666504', '66666666-6666-4666-8666-666666666601', 'credito', 'Crédito Beto', 'personal', 'miembro', '66666666-6666-4666-8666-666666666202', null, null, now(), now(), '66666666-6666-4666-8666-666666666202');

insert into public.tarjeta (pasivo_id, hogar_id, dia_corte, dia_pago, ultimos_4, actualizado_por) values
  ('66666666-6666-4666-8666-666666666501', '66666666-6666-4666-8666-666666666601', 15, 25, '4521', '66666666-6666-4666-8666-666666666201'),
  ('66666666-6666-4666-8666-666666666502', '66666666-6666-4666-8666-666666666601', 15, 25, '8899', '66666666-6666-4666-8666-666666666201');

insert into public.deuda (pasivo_id, hogar_id, acreedor, actualizado_por)
values ('66666666-6666-4666-8666-666666666503', '66666666-6666-4666-8666-666666666601', 'Almacén El Hogar', '66666666-6666-4666-8666-666666666201');

insert into public.credito (pasivo_id, hogar_id, entidad, actualizado_por)
values ('66666666-6666-4666-8666-666666666504', '66666666-6666-4666-8666-666666666601', 'Banco', '66666666-6666-4666-8666-666666666202');

insert into public.plan_de_cuotas (id, hogar_id, pasivo_id, origen, compra_id, fecha_inicio, capital, sistema, actualizado_por) values
  ('66666666-6666-4666-8666-666666666603', '66666666-6666-4666-8666-666666666601', '66666666-6666-4666-8666-666666666503', 'desembolso', null, '2026-11-10', 100000, 'sin_calendario', '66666666-6666-4666-8666-666666666201'),
  ('66666666-6666-4666-8666-666666666604', '66666666-6666-4666-8666-666666666601', '66666666-6666-4666-8666-666666666504', 'desembolso', null, '2026-11-10', 50000, 'sin_calendario', '66666666-6666-4666-8666-666666666202');

set constraints all immediate;
set constraints all deferred;

-- Helpers: inserts directos como postgres (nunca por sync_push).
create function pg_temp.compra_ins(
  p_id uuid, p_monto bigint, p_pago text default 'contado', p_ambito text default 'hogar',
  p_miembro uuid default null, p_medio uuid default '66666666-6666-4666-8666-666666666401',
  p_financiada uuid default null, p_cufe text default null, p_iva bigint default null,
  p_fecha date default '2026-11-22')
returns void language sql as $$
  insert into public.compra (id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito,
    miembro_id, pago_tipo, medio_de_pago_id, financiada_por_pasivo_id, registrado_por, cufe, iva,
    actualizado_por)
  values (p_id, '66666666-6666-4666-8666-666666666601', p_fecha, 'Compra de prueba', p_monto,
    '66666666-6666-4666-8666-666666666301', p_ambito, p_miembro, p_pago, p_medio, p_financiada,
    '66666666-6666-4666-8666-666666666201', p_cufe, p_iva, '66666666-6666-4666-8666-666666666201');
$$;

create function pg_temp.pasivo_ins(
  p_id uuid, p_tipo text default 'deuda', p_nombre text default 'Pasivo de prueba',
  p_ambito text default 'hogar', p_owner_tipo text default 'hogar', p_owner uuid default null,
  p_tasa_tipo text default null, p_tasa_ppm int default null)
returns void language sql as $$
  insert into public.pasivo (id, hogar_id, tipo, nombre, ambito, owner_tipo, owner_miembro_id,
    tasa_tipo, tasa_ppm, actualizado_por)
  values (p_id, '66666666-6666-4666-8666-666666666601', p_tipo, p_nombre, p_ambito, p_owner_tipo,
    p_owner, p_tasa_tipo, p_tasa_ppm, '66666666-6666-4666-8666-666666666201');
$$;

create function pg_temp.plan_ins(
  p_id uuid, p_pasivo uuid default '66666666-6666-4666-8666-666666666501',
  p_origen text default 'compra', p_compra uuid default null, p_capital bigint default 100000,
  p_sistema text default 'sin_calendario', p_n int default null, p_primera date default null,
  p_fecha date default '2026-11-22')
returns void language sql as $$
  insert into public.plan_de_cuotas (id, hogar_id, pasivo_id, origen, compra_id, fecha_inicio,
    capital, sistema, n_cuotas, fecha_primera_cuota, actualizado_por)
  values (p_id, '66666666-6666-4666-8666-666666666601', p_pasivo, p_origen, p_compra, p_fecha,
    p_capital, p_sistema, p_n, p_primera, '66666666-6666-4666-8666-666666666201');
$$;

create function pg_temp.cuota_ins(p_id uuid, p_plan uuid, p_numero int, p_fecha date, p_capital bigint)
returns void language sql as $$
  insert into public.cuota (id, hogar_id, plan_id, numero, fecha_vencimiento, capital, actualizado_por)
  values (p_id, '66666666-6666-4666-8666-666666666601', p_plan, p_numero, p_fecha, p_capital,
    '66666666-6666-4666-8666-666666666201');
$$;

create function pg_temp.costo_ins(
  p_id uuid, p_pasivo uuid default null, p_medio uuid default null, p_cuota uuid default null,
  p_monto bigint default 1000, p_tipo text default 'interes', p_origen text default 'manual')
returns void language sql as $$
  insert into public.costo_financiero (id, hogar_id, tipo, monto, fecha_causacion, pasivo_id,
    medio_de_pago_id, cuota_id, origen, registrado_por, actualizado_por)
  values (p_id, '66666666-6666-4666-8666-666666666601', p_tipo, p_monto, '2026-11-22', p_pasivo,
    p_medio, p_cuota, p_origen, '66666666-6666-4666-8666-666666666201',
    '66666666-6666-4666-8666-666666666201');
$$;

create function pg_temp.tiene_rls(p_tabla text) returns boolean language sql as $$
  select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = p_tabla;
$$;

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
end $$;

-- Estructura: once tablas con RLS.
select has_table('public', 'medio_de_pago', 'existe medio_de_pago');
select has_table('public', 'pasivo', 'existe pasivo');
select has_table('public', 'tarjeta', 'existe tarjeta');
select has_table('public', 'credito', 'existe credito');
select has_table('public', 'deuda', 'existe deuda');
select has_table('public', 'compra', 'existe compra');
select has_table('public', 'plan_de_cuotas', 'existe plan_de_cuotas');
select has_table('public', 'cuota', 'existe cuota');
select has_table('public', 'costo_financiero', 'existe costo_financiero');
select has_table('public', 'alias_comercio', 'existe alias_comercio');
select has_table('public', 'lote_aplicado', 'existe lote_aplicado');
select is(pg_temp.tiene_rls(t), true, 'RLS activo en ' || t) from unnest(array['medio_de_pago',
  'pasivo', 'tarjeta', 'credito', 'deuda', 'compra', 'plan_de_cuotas', 'cuota', 'costo_financiero',
  'alias_comercio', 'lote_aplicado']) t;

-- Permisos: lectura por RLS y escritura solo por sync_push.
select ok(not has_table_privilege('anon', 'public.compra', 'select'), 'anon no lee compra');
select ok(not has_table_privilege('anon', 'public.pasivo', 'select'), 'anon no lee pasivo');
select ok(not has_table_privilege('anon', 'public.medio_de_pago', 'select'), 'anon no lee medio_de_pago');
select ok((select bool_and(has_table_privilege('authenticated', 'public.' || t, 'select'))
  from unnest(array['medio_de_pago', 'pasivo', 'tarjeta', 'credito', 'deuda', 'compra',
    'plan_de_cuotas', 'cuota', 'costo_financiero', 'alias_comercio']) t), 'authenticated lee las diez tablas replicadas');
select ok(not has_table_privilege('authenticated', 'public.compra', 'insert'), 'authenticated no inserta compras');
select ok(not has_table_privilege('authenticated', 'public.compra', 'update'), 'authenticated no actualiza compras');
select ok(not has_table_privilege('authenticated', 'public.compra', 'delete'), 'authenticated no borra compras');
select ok(not has_table_privilege('authenticated', 'public.lote_aplicado', 'select'), 'lote_aplicado es solo del servidor');
select ok(not has_function_privilege('anon', 'public.sync_push(jsonb)', 'execute'), 'anon no ejecuta sync_push');
select ok(has_function_privilege('authenticated', 'public.sync_push(jsonb)', 'execute'), 'authenticated ejecuta sync_push');

-- CHECKs de fila: fallan en el acto.
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 0) $$, '23514', null, 'una compra de monto cero se rechaza');
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 85000, p_ambito => 'personal') $$, '23514', null, 'una compra personal sin dueño se rechaza');
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 85000, p_miembro => '66666666-6666-4666-8666-666666666201') $$, '23514', null, 'una compra del hogar con dueño se rechaza');
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 85000, p_financiada => '66666666-6666-4666-8666-666666666503') $$, '23514', null, 'una compra de contado con dos orígenes de fondos se rechaza');
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 85000, p_medio => null) $$, '23514', null, 'una compra de contado sin origen de fondos se rechaza');
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 85000, 'financiado') $$, '23514', null, 'una compra financiada con medio de pago se rechaza');
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 85000, p_cufe => repeat('a', 96), p_iva => 90000) $$, '23514', null, 'un IVA mayor que el total se rechaza');
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 85000, p_iva => 13571) $$, '23514', null, 'un IVA sin CUFE se rechaza');
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 85000, p_cufe => 'ABC') $$, '23514', null, 'un CUFE que no son 96 hex se rechaza');
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 85000, p_fecha => null) $$, '23502', null, 'una compra sin fecha se rechaza');
select throws_ok($$ select pg_temp.pasivo_ins(gen_random_uuid(), p_tasa_tipo => 'EA') $$, '23514', null, 'un pasivo con tasa_tipo y sin tasa_ppm se rechaza');
select throws_ok($$ select pg_temp.pasivo_ins(gen_random_uuid(), p_ambito => 'personal', p_owner_tipo => 'hogar') $$, '23514', null, 'un pasivo personal de dueño hogar se rechaza');
select throws_ok($$ select pg_temp.plan_ins(gen_random_uuid()) $$, '23514', null, 'un plan de compra sin compra_id se rechaza');
select throws_ok($$ select pg_temp.plan_ins(gen_random_uuid(), p_origen => 'saldo_inicial', p_sistema => 'sin_calendario', p_n => 3, p_primera => '2026-12-25') $$, '23514', null, 'un plan sin calendario con cuotas se rechaza');
select throws_ok($$ select pg_temp.costo_ins(gen_random_uuid(), p_pasivo => '66666666-6666-4666-8666-666666666501', p_medio => '66666666-6666-4666-8666-666666666401') $$, '23514', null, 'un costo con pasivo y medio a la vez se rechaza');
select throws_ok($$ select pg_temp.costo_ins(gen_random_uuid(), p_medio => '66666666-6666-4666-8666-666666666401', p_cuota => gen_random_uuid()) $$, '23514', null, 'un costo con cuota y sin pasivo se rechaza');

-- Índices únicos parciales de CUFE: manda el alcance de visibilidad.
select pg_temp.compra_ins('66666666-6666-4666-8666-666666666701', 85000, p_cufe => repeat('a', 96));
select throws_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 45000, p_cufe => repeat('a', 96)) $$, '23505', null, 'un CUFE repetido en compras del hogar se rechaza');
select lives_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 10000, p_ambito => 'personal', p_miembro => '66666666-6666-4666-8666-666666666201', p_cufe => repeat('b', 96));
  select pg_temp.compra_ins(gen_random_uuid(), 20000, p_ambito => 'personal', p_miembro => '66666666-6666-4666-8666-666666666202', p_cufe => repeat('b', 96)) $$, 'el mismo CUFE en personales de dueños distintos no choca');
select lives_ok($$ select pg_temp.compra_ins(gen_random_uuid(), 30000, p_cufe => repeat('c', 96));
  select pg_temp.compra_ins(gen_random_uuid(), 30000, p_ambito => 'personal', p_miembro => '66666666-6666-4666-8666-666666666201', p_cufe => repeat('c', 96)) $$, 'el mismo CUFE en una compra del hogar y una personal no choca');

set constraints all immediate;
set constraints all deferred;

-- Reglas entre filas: se juzgan al cerrar el lote, dentro de un savepoint.
savepoint s1;
select pg_temp.pasivo_ins('66666666-6666-4666-8666-666666666801', 'tarjeta', 'Tarjeta sin subtipo');
select throws_ok('set constraints all immediate', '23514', null, 'un pasivo tarjeta sin su fila de tarjeta se rechaza al cerrar el lote');
rollback to savepoint s1;
set constraints all deferred;

savepoint s1;
select pg_temp.plan_ins('66666666-6666-4666-8666-666666666802', p_origen => 'desembolso', p_fecha => '2026-11-01');
select throws_ok('set constraints all immediate', '23514', null, 'un desembolso sobre una tarjeta se rechaza al cerrar el lote');
rollback to savepoint s1;
set constraints all deferred;

savepoint s1;
select pg_temp.plan_ins('66666666-6666-4666-8666-666666666803', p_origen => 'saldo_inicial', p_sistema => 'capital_fijo', p_n => 2, p_primera => '2026-12-25', p_fecha => '2026-11-01');
select pg_temp.cuota_ins('66666666-6666-4666-8666-666666666901', '66666666-6666-4666-8666-666666666803', 1, '2026-12-25', 66666);
select pg_temp.cuota_ins('66666666-6666-4666-8666-666666666902', '66666666-6666-4666-8666-666666666803', 2, '2027-01-25', 33333);
select throws_ok('set constraints all immediate', '23514', null, 'unas cuotas que no suman el capital del plan se rechazan al cerrar el lote');
rollback to savepoint s1;
set constraints all deferred;

savepoint s1;
select pg_temp.compra_ins('66666666-6666-4666-8666-666666666702', 85000, 'financiado', p_medio => null);
select throws_ok('set constraints all immediate', '23514', null, 'una compra financiada sin su plan se rechaza al cerrar el lote');
rollback to savepoint s1;
set constraints all deferred;

-- Visibilidad por RLS.
select pg_temp.compra_ins('66666666-6666-4666-8666-666666666703', 45000, p_fecha => '2026-11-23');
select pg_temp.compra_ins('66666666-6666-4666-8666-666666666704', 120000, 'financiado', p_ambito => 'personal', p_miembro => '66666666-6666-4666-8666-666666666201', p_medio => null, p_fecha => '2026-11-24');
select pg_temp.plan_ins('66666666-6666-4666-8666-666666666804', p_pasivo => '66666666-6666-4666-8666-666666666502', p_compra => '66666666-6666-4666-8666-666666666704', p_capital => 120000, p_sistema => 'capital_fijo', p_n => 1, p_primera => '2026-12-25', p_fecha => '2026-11-24');
select pg_temp.cuota_ins('66666666-6666-4666-8666-666666666903', '66666666-6666-4666-8666-666666666804', 1, '2026-12-25', 120000);
select pg_temp.costo_ins('66666666-6666-4666-8666-666666667001', p_pasivo => '66666666-6666-4666-8666-666666666502', p_cuota => '66666666-6666-4666-8666-666666666903', p_origen => 'calculado');

set constraints all immediate;
set constraints all deferred;

select pg_temp.como('66666666-6666-4666-8666-00000000b102');
set local role authenticated;
select is((select count(*)::int from public.compra where id = '66666666-6666-4666-8666-666666666703'), 1, 'Beto ve la compra del hogar');
select is((select count(*)::int from public.compra where id = '66666666-6666-4666-8666-666666666704'), 0, 'Beto no ve la compra personal de Ana');
select is((select count(*)::int from public.pasivo where id = '66666666-6666-4666-8666-666666666502'), 0, 'Beto no ve el pasivo personal de Ana');
select is((select count(*)::int from public.tarjeta where pasivo_id = '66666666-6666-4666-8666-666666666502'), 0, 'Beto no ve la tarjeta personal de Ana');
select is((select count(*)::int from public.plan_de_cuotas where id = '66666666-6666-4666-8666-666666666804'), 0, 'Beto no ve el plan personal de Ana');
select is((select count(*)::int from public.cuota where id = '66666666-6666-4666-8666-666666666903'), 0, 'Beto no ve la cuota personal de Ana');
select is((select count(*)::int from public.costo_financiero where id = '66666666-6666-4666-8666-666666667001'), 0, 'Beto no ve el costo personal de Ana');
select is((select count(*)::int from public.medio_de_pago where id = '66666666-6666-4666-8666-666666666401'), 1, 'Beto ve el medio del hogar aunque sea de Ana');
select is((select count(*)::int from public.pasivo where id = '66666666-6666-4666-8666-666666666501'), 1, 'Beto ve la tarjeta del libro del hogar');
select is((select count(*)::int from public.pasivo where id = '66666666-6666-4666-8666-666666666504'), 1, 'Beto ve su propio crédito personal');
reset role;

select pg_temp.como('66666666-6666-4666-8666-00000000a101');
set local role authenticated;
select is((select count(*)::int from public.compra where id = '66666666-6666-4666-8666-666666666704'), 1, 'Ana ve su compra personal');
select is((select count(*)::int from public.plan_de_cuotas where compra_id = '66666666-6666-4666-8666-666666666704'), 1, 'Ana ve el plan de su compra personal');
select is((select count(*)::int from public.cuota where plan_id = '66666666-6666-4666-8666-666666666804'), 1, 'Ana ve la cuota de su plan personal');
select is((select count(*)::int from public.costo_financiero where cuota_id = '66666666-6666-4666-8666-666666666903'), 1, 'Ana ve el costo de su libro personal');
select is((select count(*)::int from public.pasivo where id = '66666666-6666-4666-8666-666666666504'), 0, 'Ana no ve el crédito personal de Beto');
reset role;

select pg_temp.como('66666666-6666-4666-8666-00000000c103');
set local role authenticated;
select is((select count(*)::int from public.compra), 0, 'Caro no ve compras del hogar A');
select is((select count(*)::int from public.pasivo), 0, 'Caro no ve pasivos del hogar A');
select is((select count(*)::int from public.medio_de_pago), 0, 'Caro no ve medios del hogar A');
reset role;

select pg_temp.como('66666666-6666-4666-8666-00000000b102');
set local role authenticated;
select throws_ok($$ insert into public.compra (id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito, pago_tipo, medio_de_pago_id, registrado_por, actualizado_por) values (gen_random_uuid(), '66666666-6666-4666-8666-666666666601', '2026-11-24', 'Inyectada', 1000, '66666666-6666-4666-8666-666666666301', 'hogar', 'contado', '66666666-6666-4666-8666-666666666401', '66666666-6666-4666-8666-666666666201', '66666666-6666-4666-8666-666666666201') $$, '42501', null, 'authenticated no puede insertar compras directamente');
reset role;

select * from finish();
rollback;
