-- Núcleo 3, balance de pareja y exportación (S3, S4, S5, S6):
-- ingreso por series (I24), recepcion_ingreso único (I22), aporte (I17),
-- sync_push_balance, exportar_hogar, exportar_personal y Storage RLS.
-- Actores: Ana (admin hogar A), Beto (miembro A), Caro (admin hogar B).
-- Fixtures (prefijo 99): hogar A …1, hogar B …2, Ana …101, Beto …102, Caro …103,
-- Mercado …201, Nequi Beto …301, Cuenta común …302, Efectivo Ana …303,
-- Nequi Caro …304, Cuenta común B …305, Visa hogar A …401, Visa personal Ana …402,
-- Visa personal Beto …403, compra hogar …601, compra personal Ana …602,
-- compra personal Beto …603.
begin;
set search_path = public, extensions;
select plan(51);

create function pg_temp.fx(p_sufijo text) returns uuid language sql immutable as $$
  select ('99999999-9999-4999-9999-' || lpad(p_sufijo, 12, '0'))::uuid;
$$;
create function pg_temp.fid(p_sufijo text) returns uuid language sql immutable as $$
  select ('99999999-9999-4999-9999-' || p_sufijo || '00000000')::uuid;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at) values
  ('99999999-9999-4999-9999-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@balance.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('99999999-9999-4999-9999-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@balance.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('99999999-9999-4999-9999-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'caro@balance.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.hogar (id, nombre, actualizado_por, creado_en, actualizado_en) values
  (pg_temp.fx('1'), 'Hogar A', pg_temp.fx('101'), now(), now()),
  (pg_temp.fx('2'), 'Hogar B', pg_temp.fx('103'), now(), now());
insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('101'), pg_temp.fx('1'), 'Ana', '99999999-9999-4999-9999-00000000a101', 'admin', true, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('102'), pg_temp.fx('1'), 'Beto', '99999999-9999-4999-9999-00000000b102', 'miembro', true, now(), now(), pg_temp.fx('102')),
  (pg_temp.fx('103'), pg_temp.fx('2'), 'Caro', '99999999-9999-4999-9999-00000000c103', 'admin', true, now(), now(), pg_temp.fx('103'));
insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq) values
  (pg_temp.fx('1'), pg_temp.fx('101'), 0),
  (pg_temp.fx('1'), pg_temp.fx('102'), 0),
  (pg_temp.fx('2'), pg_temp.fx('103'), 0);
insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('201'), pg_temp.fx('1'), 'Mercado', 1, now(), now(), pg_temp.fx('101'));
insert into public.medio_de_pago (id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('301'), pg_temp.fx('1'), 'Nequi Beto', 'cuenta', 'miembro', pg_temp.fx('102'), now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('302'), pg_temp.fx('1'), 'Cuenta común', 'cuenta', 'hogar', null, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('303'), pg_temp.fx('1'), 'Efectivo Ana', 'efectivo', 'miembro', pg_temp.fx('101'), now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('304'), pg_temp.fx('2'), 'Nequi Caro', 'cuenta', 'miembro', pg_temp.fx('103'), now(), now(), pg_temp.fx('103')),
  (pg_temp.fx('305'), pg_temp.fx('2'), 'Cuenta común B', 'cuenta', 'hogar', null, now(), now(), pg_temp.fx('103'));
insert into public.pasivo (id, hogar_id, tipo, nombre, ambito, owner_tipo, owner_miembro_id, tasa_tipo, tasa_ppm, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('401'), pg_temp.fx('1'), 'tarjeta', 'Visa hogar', 'hogar', 'miembro', pg_temp.fx('101'), null, null, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('402'), pg_temp.fx('1'), 'tarjeta', 'Visa personal Ana', 'personal', 'miembro', pg_temp.fx('101'), null, null, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('403'), pg_temp.fx('1'), 'tarjeta', 'Visa personal Beto', 'personal', 'miembro', pg_temp.fx('102'), null, null, now(), now(), pg_temp.fx('102'));
insert into public.tarjeta (pasivo_id, hogar_id, ultimos_4, dia_corte, dia_pago, actualizado_por) values
  (pg_temp.fx('401'), pg_temp.fx('1'), '4521', 15, 25, pg_temp.fx('101')),
  (pg_temp.fx('402'), pg_temp.fx('1'), '8899', 15, 25, pg_temp.fx('101')),
  (pg_temp.fx('403'), pg_temp.fx('1'), '7788', 15, 25, pg_temp.fx('102'));
insert into public.compra (id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito, miembro_id, pago_tipo, medio_de_pago_id, registrado_por, actualizado_por) values
  (pg_temp.fx('601'), pg_temp.fx('1'), '2026-11-10', 'Mercado compartido', 200000, pg_temp.fx('201'), 'hogar', null, 'contado', pg_temp.fx('303'), pg_temp.fx('101'), pg_temp.fx('101')),
  (pg_temp.fx('602'), pg_temp.fx('1'), '2026-11-11', 'Secreto Ana', 90000, pg_temp.fx('201'), 'personal', pg_temp.fx('101'), 'contado', pg_temp.fx('303'), pg_temp.fx('101'), pg_temp.fx('101')),
  (pg_temp.fx('603'), pg_temp.fx('1'), '2026-11-12', 'Secreto Beto', 70000, pg_temp.fx('201'), 'personal', pg_temp.fx('102'), 'contado', pg_temp.fx('301'), pg_temp.fx('102'), pg_temp.fx('102'));

-- Objetos de prueba en Storage para validar RLS por prefijo (§9.2).
insert into storage.objects (id, bucket_id, name) values
  (pg_temp.fx('e01'), 'exportaciones', 'hogar/' || pg_temp.fx('1')::text || '/2026-11-22/hogar.zip'),
  (pg_temp.fx('e02'), 'exportaciones', 'personal/' || pg_temp.fx('1')::text || '/' || pg_temp.fx('101')::text || '/2026-11-22/personal.zip'),
  (pg_temp.fx('e03'), 'exportaciones', 'personal/' || pg_temp.fx('1')::text || '/' || pg_temp.fx('102')::text || '/2026-11-22/personal.zip'),
  (pg_temp.fx('e04'), 'exportaciones', 'hogar/' || pg_temp.fx('2')::text || '/2026-11-22/hogar.zip'),
  (pg_temp.fx('e05'), 'exportaciones', 'personal/no-uuid/raro/personal.zip');

set constraints all immediate;
set constraints all deferred;

create table public.prueba_balance_lote (caso text primary key, lote jsonb not null);
create table public.prueba_balance_sync (caso text primary key, resultado jsonb not null);
grant select on public.prueba_balance_lote to authenticated;
grant select, insert on public.prueba_balance_sync to authenticated;

create function pg_temp.lote(p_lote uuid, p_tipo text, p_filas jsonb, p_hogar uuid default pg_temp.fx('1'))
returns jsonb language sql immutable as $$
  select jsonb_build_object('lote_id', p_lote, 'hogar_id', p_hogar,
    'schema_version', 1, 'tipo', p_tipo, 'filas', p_filas);
$$;

create function pg_temp.push(p_caso text, p_actor text default 'ana', p_lote text default null)
returns void language plpgsql as $$
declare v_usuario uuid;
begin
  v_usuario := case p_actor when 'beto' then '99999999-9999-4999-9999-00000000b102'::uuid
                             when 'caro' then '99999999-9999-4999-9999-00000000c103'::uuid
                             else '99999999-9999-4999-9999-00000000a101'::uuid end;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.prueba_balance_sync (caso, resultado)
  select p_caso, public.sync_push_balance(lote) from public.prueba_balance_lote where caso = coalesce(p_lote, p_caso);
  execute 'reset role';
end $$;

create function pg_temp.res(p_caso text) returns jsonb language sql as $$
  select resultado from public.prueba_balance_sync where caso = p_caso;
$$;

create function pg_temp.como_actor(p_actor text) returns void language plpgsql as $$
declare v_usuario uuid;
begin
  v_usuario := case p_actor when 'beto' then '99999999-9999-4999-9999-00000000b102'::uuid
                             when 'caro' then '99999999-9999-4999-9999-00000000c103'::uuid
                             else '99999999-9999-4999-9999-00000000a101'::uuid end;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- 1. Superficie y privilegios
select has_table('public', 'ingreso', 'existe tabla ingreso');
select has_table('public', 'recepcion_ingreso', 'existe tabla recepcion_ingreso');
select has_table('public', 'aporte', 'existe tabla aporte');
select ok(
  not has_table_privilege('anon', 'public.ingreso', 'SELECT')
  and not has_table_privilege('anon', 'public.recepcion_ingreso', 'SELECT')
  and not has_table_privilege('anon', 'public.aporte', 'SELECT'),
  'anon no puede leer ingreso, recepcion_ingreso ni aporte'
);
select ok(
  not has_table_privilege('authenticated', 'public.ingreso', 'INSERT')
  and not has_table_privilege('authenticated', 'public.recepcion_ingreso', 'INSERT')
  and not has_table_privilege('authenticated', 'public.aporte', 'INSERT'),
  'authenticated no escribe directamente en ingreso, recepcion_ingreso ni aporte'
);

-- 2. Aporte (I17) + idempotencia por autor
insert into public.prueba_balance_lote values
  ('ap_ok', pg_temp.lote(pg_temp.fid('0109'), 'aporte', jsonb_build_object(
    'aporte', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('0101'),
      'medio_origen_id', pg_temp.fx('301'),
      'medio_destino_id', pg_temp.fx('302'),
      'monto', 500000,
      'fecha', '2026-11-22',
      'nota', 'Quincena'
    ))
  ))),
  ('ap_entre_miembros', pg_temp.lote(pg_temp.fid('0209'), 'aporte', jsonb_build_object(
    'aporte', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('0201'),
      'medio_origen_id', pg_temp.fx('301'),
      'medio_destino_id', pg_temp.fx('303'),
      'monto', 100000,
      'fecha', '2026-11-22'
    ))
  ))),
  ('ap_hogar_origen', pg_temp.lote(pg_temp.fid('0309'), 'aporte', jsonb_build_object(
    'aporte', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('0301'),
      'medio_origen_id', pg_temp.fx('302'),
      'medio_destino_id', pg_temp.fx('301'),
      'monto', 100000,
      'fecha', '2026-11-22'
    ))
  ))),
  ('ap_otro_hogar', pg_temp.lote(pg_temp.fid('0409'), 'aporte', jsonb_build_object(
    'aporte', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('0401'),
      'medio_origen_id', pg_temp.fx('304'),
      'medio_destino_id', pg_temp.fx('302'),
      'monto', 100000,
      'fecha', '2026-11-22'
    ))
  )));

select pg_temp.push('ap_ok', 'beto');
select is(pg_temp.res('ap_ok') ->> 'estado', 'aplicado', 'aporte miembro -> hogar se aplica');
select is((select count(*)::int from public.aporte where id = pg_temp.fid('0101')), 1, 'fila aporte persistida');

-- Reintento del mismo autor activo (beto) devuelve resultado guardado sin duplicar
select pg_temp.push('ap_ok_reintento', 'beto', 'ap_ok');
select is(pg_temp.res('ap_ok_reintento'), pg_temp.res('ap_ok'), 'reintento de Beto es idempotente');

-- Mismo lote_id por otro autor (ana) no devuelve resultado de Beto y falla por PK duplicada sin revelar lote
select pg_temp.push('ap_ok_ana', 'ana', 'ap_ok');
select is(pg_temp.res('ap_ok_ana') ->> 'estado', 'rechazado', 'mismo lote_id de otro autor no reusa resultado');

-- I17: miembro -> miembro, hogar -> miembro y medio de otro hogar rechazados
select pg_temp.push('ap_entre_miembros', 'ana');
select is(pg_temp.res('ap_entre_miembros') ->> 'estado', 'rechazado', 'rechaza aporte entre miembros (I17)');
select pg_temp.push('ap_hogar_origen', 'ana');
select is(pg_temp.res('ap_hogar_origen') ->> 'estado', 'rechazado', 'rechaza aporte con origen hogar');
select pg_temp.push('ap_otro_hogar', 'ana');
select is(pg_temp.res('ap_otro_hogar') ->> 'estado', 'rechazado', 'rechaza aporte con medio de otro hogar');

-- Regresión 0098e11: tras rechazo en sync_push_balance NO queda SET CONSTRAINTS ALL IMMEDIATE activo
-- (hogar_actualizado_por_fkey es deferrable initially deferred; si quedara inmediato fallaría al insertar hogar antes que miembro).
select lives_ok(
  $$do $b$
    declare v_h uuid := gen_random_uuid(); v_m uuid := gen_random_uuid();
    begin
      insert into public.hogar (id, nombre, actualizado_por) values (v_h, 'Temporal', v_m);
      insert into public.miembro (id, hogar_id, nombre, rol, activo, actualizado_por) values (v_m, v_h, 'Temp', 'admin', true, v_m);
    end $b$ $$,
  'sesión sigue en modo deferred tras rechazo en sync_push_balance'
);

-- 3. Ingreso: fijo en serie (I24) + variable + cierre terminal
insert into public.prueba_balance_lote values
  ('ing_fijo_1', pg_temp.lote(pg_temp.fid('0509'), 'ingreso', jsonb_build_object(
    'ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('0501'),
      'miembro_id', pg_temp.fx('101'),
      'tipo', 'fijo',
      'serie_id', pg_temp.fid('0501'),
      'descripcion', 'Salario Ana',
      'monto', 4500000,
      'dia_esperado', 10,
      'vigente_desde', '2026-01-01',
      'vigente_hasta', null,
      'fecha', null
    ))
  ))),
  ('ing_var', pg_temp.lote(pg_temp.fid('0609'), 'ingreso', jsonb_build_object(
    'ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('0601'),
      'miembro_id', pg_temp.fx('102'),
      'tipo', 'variable',
      'serie_id', null,
      'descripcion', 'Freelance',
      'monto', 1500000,
      'dia_esperado', null,
      'vigente_desde', null,
      'vigente_hasta', null,
      'fecha', '2026-11-20'
    ))
  ))),
  ('ing_hueco', pg_temp.lote(pg_temp.fid('0709'), 'ingreso', jsonb_build_object(
    'ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('0701'),
      'miembro_id', pg_temp.fx('101'),
      'tipo', 'fijo',
      'serie_id', pg_temp.fid('0501'),
      'descripcion', 'Salario Ana',
      'monto', 4700000,
      'dia_esperado', 20,
      'vigente_desde', '2026-11-16',
      'vigente_hasta', null,
      'fecha', null
    ))
  ))),
  ('ing_terminal', pg_temp.lote(pg_temp.fid('0809'), 'ingreso', jsonb_build_object(
    'ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('0801'),
      'miembro_id', pg_temp.fx('102'),
      'tipo', 'fijo',
      'serie_id', pg_temp.fid('0801'),
      'descripcion', 'Contrato nov',
      'monto', 3000000,
      'dia_esperado', 5,
      'vigente_desde', '2026-11-20',
      'vigente_hasta', '2026-11-25',
      'fecha', null
    ))
  )));

select pg_temp.push('ing_fijo_1', 'ana');
select is(pg_temp.res('ing_fijo_1') ->> 'estado', 'aplicado', 'alta de ingreso fijo se aplica');
select pg_temp.push('ing_var', 'beto');
select is(pg_temp.res('ing_var') ->> 'estado', 'aplicado', 'alta de ingreso variable se aplica');
select pg_temp.push('ing_hueco', 'ana');
select is(pg_temp.res('ing_hueco') ->> 'estado', 'rechazado', 'rechaza segunda versión abierta/solapada en misma serie');
select pg_temp.push('ing_terminal', 'beto');
select is(pg_temp.res('ing_terminal') ->> 'estado', 'aplicado', 'alta de serie terminal en mismo mes se aplica');

-- Cambio de versión contiguo (cierra v1 al 2026-11-15 y abre v2 al 2026-11-16)
insert into public.prueba_balance_lote values
  ('ing_cambio_v2', pg_temp.lote(pg_temp.fid('0909'), 'ingreso', jsonb_build_object(
    'ingreso', jsonb_build_array(
      jsonb_build_object(
        'id', pg_temp.fid('0501'),
        'base_seq', (select seq from public.ingreso where id = pg_temp.fid('0501')),
        'vigente_hasta', '2026-11-15'
      ),
      jsonb_build_object(
        'id', pg_temp.fid('0901'),
        'miembro_id', pg_temp.fx('101'),
        'tipo', 'fijo',
        'serie_id', pg_temp.fid('0501'),
        'descripcion', 'Salario Ana',
        'monto', 4700000,
        'dia_esperado', 20,
        'vigente_desde', '2026-11-16',
        'vigente_hasta', null,
        'fecha', null
      )
    )
  )));
select pg_temp.push('ing_cambio_v2', 'ana');
select is(pg_temp.res('ing_cambio_v2') ->> 'estado', 'aplicado', 'cambio de monto/día contiguo en misma serie se aplica');
select is(private.version_ingreso_serie(pg_temp.fx('1'), pg_temp.fid('0501'), '2026-11'), pg_temp.fid('0501'), 'día 1 decide versión vieja en nov (I24)');
select is(private.version_ingreso_serie(pg_temp.fx('1'), pg_temp.fid('0501'), '2026-12'), pg_temp.fid('0901'), 'día 1 decide versión nueva en dic (I24)');
select is(private.version_ingreso_serie(pg_temp.fx('1'), pg_temp.fid('0801'), '2026-11'), pg_temp.fid('0801'), 'cierre terminal 20-25/11 cubre noviembre');
select is(private.version_ingreso_serie(pg_temp.fx('1'), pg_temp.fid('0801'), '2026-12'), null, 'cierre terminal 20-25/11 da null en diciembre');

-- 4. RecepcionIngreso (I22 + I24): único por (serie_id, periodo) y mes activo
insert into public.prueba_balance_lote values
  ('rec_nov_ok', pg_temp.lote(pg_temp.fid('1009'), 'recepcion_ingreso', jsonb_build_object(
    'recepcion_ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('1001'),
      'ingreso_id', pg_temp.fid('0501'),
      'serie_id', pg_temp.fid('0801'), -- el cliente manda otro serie_id: el servidor debe ignorarlo y usar 0501
      'periodo', '2026-11',
      'recibido', true,
      'monto_recibido', 4700000,
      'fecha_recepcion', '2026-11-16'
    ))
  ))),
  ('rec_nov_dup_v2', pg_temp.lote(pg_temp.fid('1109'), 'recepcion_ingreso', jsonb_build_object(
    'recepcion_ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('1101'),
      'ingreso_id', pg_temp.fid('0901'),
      'periodo', '2026-11',
      'recibido', true,
      'monto_recibido', 4700000,
      'fecha_recepcion', '2026-11-20'
    ))
  ))),
  ('rec_variable', pg_temp.lote(pg_temp.fid('1209'), 'recepcion_ingreso', jsonb_build_object(
    'recepcion_ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('1201'),
      'ingreso_id', pg_temp.fid('0601'),
      'periodo', '2026-11',
      'recibido', true,
      'monto_recibido', null,
      'fecha_recepcion', '2026-11-20'
    ))
  ))),
  ('rec_terminal_nov', pg_temp.lote(pg_temp.fid('1309'), 'recepcion_ingreso', jsonb_build_object(
    'recepcion_ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('1301'),
      'ingreso_id', pg_temp.fid('0801'),
      'periodo', '2026-11',
      'recibido', true,
      'monto_recibido', 3200000,
      'fecha_recepcion', '2026-11-25'
    ))
  ))),
  ('rec_terminal_dic', pg_temp.lote(pg_temp.fid('1409'), 'recepcion_ingreso', jsonb_build_object(
    'recepcion_ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('1401'),
      'ingreso_id', pg_temp.fid('0801'),
      'periodo', '2026-12',
      'recibido', true,
      'monto_recibido', 3200000,
      'fecha_recepcion', '2026-12-01'
    ))
  ))),
  ('rec_inconsistente', pg_temp.lote(pg_temp.fid('1509'), 'recepcion_ingreso', jsonb_build_object(
    'recepcion_ingreso', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fid('1501'),
      'ingreso_id', pg_temp.fid('0501'),
      'periodo', '2026-12',
      'recibido', false,
      'monto_recibido', 4700000,
      'fecha_recepcion', null
    ))
  )));

select pg_temp.push('rec_nov_ok', 'ana');
select is(pg_temp.res('rec_nov_ok') ->> 'estado', 'aplicado', 'recibo de noviembre se aplica');
select is((select serie_id from public.recepcion_ingreso where id = pg_temp.fid('1001')), pg_temp.fid('0501'), 'servidor asigna serie_id real desde ingreso');

select pg_temp.push('rec_nov_dup_v2', 'ana');
select is(pg_temp.res('rec_nov_dup_v2') ->> 'motivo', 'duplicado', 'rechaza segundo recibo de 2026-11 aunque apunte a otra versión');

select pg_temp.push('rec_variable', 'beto');
select is(pg_temp.res('rec_variable') ->> 'estado', 'rechazado', 'rechaza recibo sobre ingreso variable');

select pg_temp.push('rec_terminal_nov', 'beto');
select is(pg_temp.res('rec_terminal_nov') ->> 'estado', 'aplicado', 'acepta recibo en mes activo de cierre terminal (20-25/11)');

select pg_temp.push('rec_terminal_dic', 'beto');
select is(pg_temp.res('rec_terminal_dic') ->> 'estado', 'rechazado', 'rechaza recibo en diciembre tras cierre terminal en noviembre');

select pg_temp.push('rec_inconsistente', 'ana');
select is(pg_temp.res('rec_inconsistente') ->> 'estado', 'rechazado', 'rechaza recibido=false con monto_recibido');

-- 5. Preferencia Hogar.mostrar_pct_ingreso con base_seq y conflicto
insert into public.prueba_balance_lote values
  ('pref_ok', pg_temp.lote(pg_temp.fid('1609'), 'hogar_preferencia', jsonb_build_object(
    'hogar', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fx('1'),
      'base_seq', (select seq from public.hogar where id = pg_temp.fx('1')),
      'mostrar_pct_ingreso', true
    ))
  ))),
  ('pref_conflicto', pg_temp.lote(pg_temp.fid('1709'), 'hogar_preferencia', jsonb_build_object(
    'hogar', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fx('1'),
      'base_seq', 0,
      'mostrar_pct_ingreso', false
    ))
  )));

select pg_temp.push('pref_ok', 'ana');
select is(pg_temp.res('pref_ok') ->> 'estado', 'aplicado', 'actualiza mostrar_pct_ingreso con base_seq correcto');
select is((select mostrar_pct_ingreso from public.hogar where id = pg_temp.fx('1')), true, 'mostrar_pct_ingreso quedó en true');
select pg_temp.push('pref_conflicto', 'beto');
select is(pg_temp.res('pref_conflicto') ->> 'motivo', 'conflicto', 'base_seq desactualizado devuelve conflicto');

-- 6. Visibilidad RLS en tablas nuevas (los miembros ven ingresos ajenos; Caro de hogar B ve 0)
select pg_temp.como_actor('beto');
select is((select count(*)::int from public.ingreso where hogar_id = pg_temp.fx('1')), 4, 'Beto ve todos los ingresos de Hogar A (incluidos los de Ana)');
select is((select count(*)::int from public.recepcion_ingreso where hogar_id = pg_temp.fx('1')), 2, 'Beto ve los recibos de Ana y propios');
select is((select count(*)::int from public.aporte where hogar_id = pg_temp.fx('1')), 1, 'Beto ve el aporte');
reset role;

select pg_temp.como_actor('caro');
select is((select count(*)::int from public.ingreso where hogar_id = pg_temp.fx('1')), 0, 'Caro de Hogar B ve 0 ingresos de Hogar A');
select is((select count(*)::int from public.aporte where hogar_id = pg_temp.fx('1')), 0, 'Caro de Hogar B ve 0 aportes de Hogar A');
reset role;

-- 7. Exportación separada: exportar_hogar y exportar_personal (§9.1-§9.2)
select pg_temp.como_actor('ana');
select is((public.exportar_hogar(pg_temp.fx('1'), '2026-11-25') ->> 'alcance'), 'hogar', 'exportar_hogar devuelve alcance hogar');
select is(
  (select count(*)::int from jsonb_array_elements(public.exportar_hogar(pg_temp.fx('1'), '2026-11-25') -> 'tablas' -> 'compra') e),
  1,
  'exportar_hogar incluye solo compras compartidas (1 de 3)'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.exportar_hogar(pg_temp.fx('1'), '2026-11-25') -> 'tablas' -> 'pasivo') e),
  1,
  'exportar_hogar incluye solo pasivos del hogar (0 personales)'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.exportar_personal(pg_temp.fx('1'), '2026-11-25') -> 'tablas' -> 'compra') e
    where (e ->> 'id')::uuid = pg_temp.fx('602')),
  1,
  'exportar_personal de Ana incluye su compra personal'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.exportar_personal(pg_temp.fx('1'), '2026-11-25') -> 'tablas' -> 'compra') e
    where (e ->> 'id')::uuid in (pg_temp.fx('601'), pg_temp.fx('603'))),
  0,
  'exportar_personal de Ana (aunque sea admin) excluye compras hogar y de Beto'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.exportar_personal(pg_temp.fx('1'), '2026-11-25') -> 'tablas' -> 'pasivo') e),
  1,
  'exportar_personal de Ana incluye solo su pasivo personal (no el de Beto ni el hogar)'
);
reset role;

select pg_temp.como_actor('beto');
select is(
  (select count(*)::int from jsonb_array_elements(public.exportar_personal(pg_temp.fx('1'), '2026-11-25') -> 'tablas' -> 'compra') e
    where (e ->> 'id')::uuid = pg_temp.fx('603')),
  1,
  'exportar_personal de Beto incluye solo la compra personal de Beto'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.exportar_personal(pg_temp.fx('1'), '2026-11-25') -> 'tablas' -> 'compra') e
    where (e ->> 'id')::uuid = pg_temp.fx('602')),
  0,
  'exportar_personal de Beto nunca incluye la compra personal de Ana'
);
reset role;

select pg_temp.como_actor('caro');
select throws_ok(
  $$select public.exportar_hogar('99999999-9999-4999-9999-000000000001'::uuid, '2026-11-25'::date)$$,
  '42501',
  null,
  'Caro no puede exportar otro hogar'
);
select throws_ok(
  $$select public.exportar_personal('99999999-9999-4999-9999-000000000001'::uuid, '2026-11-25'::date)$$,
  '42501',
  null,
  'Caro no puede pedir export personal de otro hogar'
);
reset role;

-- 8. Storage RLS por prefijo en storage.objects (§9.2)
select pg_temp.como_actor('ana');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'exportaciones' and id in (pg_temp.fx('e01'), pg_temp.fx('e02'))),
  2,
  'Ana ve el export del hogar y su propio export personal en Storage'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'exportaciones' and id in (pg_temp.fx('e03'), pg_temp.fx('e04'), pg_temp.fx('e05'))),
  0,
  'Ana (aunque sea admin) ve 0 objetos personales de Beto, de otro hogar o rutas inválidas'
);
reset role;

select pg_temp.como_actor('beto');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'exportaciones' and id in (pg_temp.fx('e01'), pg_temp.fx('e03'))),
  2,
  'Beto ve el export del hogar y su propio export personal'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'exportaciones' and id in (pg_temp.fx('e02'), pg_temp.fx('e04'))),
  0,
  'Beto ve 0 objetos personales de Ana o de otro hogar'
);
reset role;

-- Conteo total de pruebas
select * from finish();
rollback;
