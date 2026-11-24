-- Núcleo 2, obligaciones del mes (S6, S8, S9): obligación recurrente, pago de
-- deuda, alta de pasivo y pago de obligación por `sync_push_obligaciones`.
-- Cada caso verifica el veredicto y las filas que quedaron. Rollback.
-- Actores: Ana (admin hogar A), Beto (miembro A), Caro (admin hogar B).
-- Fixtures (prefijo 88): hogar A …000000000001 · hogar B …000000000002 ·
-- Ana …101 · Beto …102 · Caro …103 · Mercado …201 · Arriendo …202 ·
-- Nequi Beto …301 · Cuenta común …302 · Efectivo Ana …303 · Visa hogar …401 ·
-- Master hogar …402 · Visa personal Ana …403 · planes …501-503 · compras …601-602 ·
-- cuotas …c101-c203 · costos …d101/d201 · obligaciones …701/702 ·
-- auth: …00000000a101/b102/c103
begin;
set search_path = public, extensions;
select plan(117);

-- Helpers de id. Fixture: pg_temp.fx('101') → 88…-000000000101. Por caso:
-- pg_temp.fid('0101') → 88…-010100000000, con caso en 2 dígitos hex y rol en 2.
create function pg_temp.fx(p_sufijo text) returns uuid language sql immutable as $$
  select ('88888888-8888-4888-8888-' || lpad(p_sufijo, 12, '0'))::uuid;
$$;
create function pg_temp.fid(p_sufijo text) returns uuid language sql immutable as $$
  select ('88888888-8888-4888-8888-' || p_sufijo || '00000000')::uuid;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at) values
  ('88888888-8888-4888-8888-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@oblig.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('88888888-8888-4888-8888-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@oblig.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('88888888-8888-4888-8888-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'caro@oblig.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.hogar (id, nombre, actualizado_por, creado_en, actualizado_en) values
  (pg_temp.fx('1'), 'Hogar A', pg_temp.fx('101'), now(), now()),
  (pg_temp.fx('2'), 'Hogar B', pg_temp.fx('103'), now(), now());
insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('101'), pg_temp.fx('1'), 'Ana', '88888888-8888-4888-8888-00000000a101', 'admin', true, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('102'), pg_temp.fx('1'), 'Beto', '88888888-8888-4888-8888-00000000b102', 'miembro', true, now(), now(), pg_temp.fx('102')),
  (pg_temp.fx('103'), pg_temp.fx('2'), 'Caro', '88888888-8888-4888-8888-00000000c103', 'admin', true, now(), now(), pg_temp.fx('103'));
insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq) values
  (pg_temp.fx('1'), pg_temp.fx('101'), 0),
  (pg_temp.fx('1'), pg_temp.fx('102'), 0),
  (pg_temp.fx('2'), pg_temp.fx('103'), 0);
insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('201'), pg_temp.fx('1'), 'Mercado', 1, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('202'), pg_temp.fx('1'), 'Arriendo', 3, now(), now(), pg_temp.fx('101'));
insert into public.medio_de_pago (id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('301'), pg_temp.fx('1'), 'Nequi Beto', 'cuenta', 'miembro', pg_temp.fx('102'), now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('302'), pg_temp.fx('1'), 'Cuenta común', 'cuenta', 'hogar', null, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('303'), pg_temp.fx('1'), 'Efectivo Ana', 'efectivo', 'miembro', pg_temp.fx('101'), now(), now(), pg_temp.fx('101'));
insert into public.pasivo (id, hogar_id, tipo, nombre, ambito, owner_tipo, owner_miembro_id, tasa_tipo, tasa_ppm, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('401'), pg_temp.fx('1'), 'tarjeta', 'Visa hogar', 'hogar', 'miembro', pg_temp.fx('101'), 'EA', 283200, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('402'), pg_temp.fx('1'), 'tarjeta', 'Master hogar', 'hogar', 'miembro', pg_temp.fx('102'), 'EA', 283200, now(), now(), pg_temp.fx('102')),
  (pg_temp.fx('403'), pg_temp.fx('1'), 'tarjeta', 'Visa personal Ana', 'personal', 'miembro', pg_temp.fx('101'), null, null, now(), now(), pg_temp.fx('101'));
insert into public.tarjeta (pasivo_id, hogar_id, ultimos_4, dia_corte, dia_pago, actualizado_por) values
  (pg_temp.fx('401'), pg_temp.fx('1'), '4521', 15, 25, pg_temp.fx('101')),
  (pg_temp.fx('402'), pg_temp.fx('1'), '5309', 15, 25, pg_temp.fx('102')),
  (pg_temp.fx('403'), pg_temp.fx('1'), '8899', 15, 25, pg_temp.fx('101'));
insert into public.compra (id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito, pago_tipo, registrado_por, actualizado_por) values
  (pg_temp.fx('601'), pg_temp.fx('1'), '2026-11-10', 'Mercado Éxito a 3 cuotas', 300000, pg_temp.fx('201'), 'hogar', 'financiado', pg_temp.fx('101'), pg_temp.fx('101')),
  (pg_temp.fx('602'), pg_temp.fx('1'), '2026-11-10', 'Mercado Master a 3 cuotas', 300000, pg_temp.fx('201'), 'hogar', 'financiado', pg_temp.fx('101'), pg_temp.fx('101'));
insert into public.plan_de_cuotas (id, hogar_id, pasivo_id, origen, compra_id, fecha_inicio, capital, sistema, n_cuotas, fecha_primera_cuota, tasa_tipo, tasa_ppm, actualizado_por) values
  (pg_temp.fx('501'), pg_temp.fx('1'), pg_temp.fx('401'), 'compra', pg_temp.fx('601'), '2026-11-10', 300000, 'capital_fijo', 3, '2026-11-25', 'EA', 283200, pg_temp.fx('101')),
  (pg_temp.fx('502'), pg_temp.fx('1'), pg_temp.fx('402'), 'compra', pg_temp.fx('602'), '2026-11-10', 300000, 'capital_fijo', 3, '2026-11-25', 'EA', 283200, pg_temp.fx('102')),
  (pg_temp.fx('503'), pg_temp.fx('1'), pg_temp.fx('403'), 'saldo_inicial', null, '2026-11-01', 50000, 'sin_calendario', null, null, null, null, pg_temp.fx('101'));
insert into public.cuota (id, hogar_id, plan_id, numero, fecha_vencimiento, capital, actualizado_por) values
  (pg_temp.fx('c101'), pg_temp.fx('1'), pg_temp.fx('501'), 1, '2026-11-25', 100000, pg_temp.fx('101')),
  (pg_temp.fx('c102'), pg_temp.fx('1'), pg_temp.fx('501'), 2, '2026-12-25', 100000, pg_temp.fx('101')),
  (pg_temp.fx('c103'), pg_temp.fx('1'), pg_temp.fx('501'), 3, '2027-01-25', 100000, pg_temp.fx('101')),
  (pg_temp.fx('c201'), pg_temp.fx('1'), pg_temp.fx('502'), 1, '2026-11-25', 100000, pg_temp.fx('102')),
  (pg_temp.fx('c202'), pg_temp.fx('1'), pg_temp.fx('502'), 2, '2026-12-25', 100000, pg_temp.fx('102')),
  (pg_temp.fx('c203'), pg_temp.fx('1'), pg_temp.fx('502'), 3, '2027-01-25', 100000, pg_temp.fx('102'));
insert into public.costo_financiero (id, hogar_id, tipo, monto, fecha_causacion, pasivo_id, cuota_id, origen, registrado_por, actualizado_por) values
  (pg_temp.fx('d101'), pg_temp.fx('1'), 'interes', 6299, '2026-11-25', pg_temp.fx('401'), pg_temp.fx('c101'), 'calculado', pg_temp.fx('101'), pg_temp.fx('101')),
  (pg_temp.fx('d201'), pg_temp.fx('1'), 'interes', 6299, '2026-11-25', pg_temp.fx('402'), pg_temp.fx('c201'), 'calculado', pg_temp.fx('102'), pg_temp.fx('102'));
insert into public.obligacion (id, hogar_id, nombre, categoria_id, monto_estimado, dia_vencimiento, periodicidad, mes_inicio, actualizado_por) values
  (pg_temp.fx('701'), pg_temp.fx('1'), 'Arriendo apartamento', pg_temp.fx('202'), 1800000, 5, 'mensual', '2026-01', pg_temp.fx('101')),
  (pg_temp.fx('702'), pg_temp.fx('1'), 'Agua', pg_temp.fx('202'), 120000, 10, 'bimestral', '2026-01', pg_temp.fx('101'));

set constraints all immediate;
set constraints all deferred;

create table public.prueba_lote (caso text primary key, lote jsonb not null);
create table public.prueba_sync (caso text primary key, resultado jsonb not null);
create table public.prueba_contador (nombre text primary key, valor bigint not null);
grant select on public.prueba_lote to authenticated;
grant select, insert on public.prueba_sync to authenticated;

create function pg_temp.pago(p_id uuid, p_pasivo uuid, p_monto bigint, p_fecha date,
  p_cuota uuid default null, p_tipo text default 'abono',
  p_medio uuid default '88888888-8888-4888-8888-000000000303')
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'pasivo_id', p_pasivo, 'tipo', p_tipo, 'cuota_id', p_cuota,
    'medio_de_pago_id', p_medio, 'monto', p_monto, 'fecha', p_fecha);
$$;

-- Corrección de un costo existente: `base_seq` solo viaja cuando se corrige.
create function pg_temp.costo(p_id uuid, p_monto bigint, p_pasivo uuid, p_base_seq bigint default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'pasivo_id', p_pasivo, 'origen', 'manual', 'monto', p_monto)
    || case when p_base_seq is null then '{}'::jsonb else jsonb_build_object('base_seq', p_base_seq) end;
$$;

create function pg_temp.pasivo(p_id uuid, p_tipo text, p_ambito text, p_owner text, p_dueno uuid,
  p_tasa_tipo text default null, p_tasa_ppm int default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'tipo', p_tipo, 'nombre', 'Pasivo de prueba', 'ambito', p_ambito,
    'owner_tipo', p_owner, 'owner_miembro_id', p_dueno, 'tasa_tipo', p_tasa_tipo, 'tasa_ppm', p_tasa_ppm);
$$;

create function pg_temp.plan(p_id uuid, p_pasivo uuid, p_origen text, p_capital bigint, p_fecha date,
  p_sistema text default 'sin_calendario', p_n int default null, p_primera date default null,
  p_tasa_tipo text default null, p_tasa_ppm int default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'pasivo_id', p_pasivo, 'origen', p_origen,
    'fecha_inicio', p_fecha, 'capital', p_capital, 'sistema', p_sistema, 'n_cuotas', p_n,
    'fecha_primera_cuota', p_primera, 'tasa_tipo', p_tasa_tipo, 'tasa_ppm', p_tasa_ppm);
$$;

create function pg_temp.cuota(p_id uuid, p_plan uuid, p_numero int, p_fecha date, p_capital bigint)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'plan_id', p_plan, 'numero', p_numero,
    'fecha_vencimiento', p_fecha, 'capital', p_capital);
$$;

create function pg_temp.compra_obligacion(p_id uuid, p_obligacion uuid, p_periodo text,
  p_monto bigint, p_fecha date, p_categoria uuid, p_medio uuid, p_ambito text default 'hogar')
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'fecha', p_fecha, 'descripcion', 'Pago de obligación',
    'monto_total', p_monto, 'categoria_id', p_categoria, 'ambito', p_ambito,
    'medio_de_pago_id', p_medio, 'obligacion_id', p_obligacion, 'periodo', p_periodo);
$$;

create function pg_temp.lote(p_lote uuid, p_tipo text, p_filas jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object('lote_id', p_lote, 'hogar_id', '88888888-8888-4888-8888-000000000001'::uuid,
    'schema_version', 1, 'tipo', p_tipo, 'filas', p_filas);
$$;

-- Ejecuta el lote guardado como el actor y guarda el resultado. La RPC deja la
-- transacción en modo inmediato: el archivo vuelve a diferir.
create function pg_temp.push(p_caso text, p_actor text default 'ana', p_lote text default null)
returns void language plpgsql as $$
declare v_usuario uuid;
begin
  v_usuario := case p_actor when 'beto' then '88888888-8888-4888-8888-00000000b102'::uuid
                             when 'caro' then '88888888-8888-4888-8888-00000000c103'::uuid
                             else '88888888-8888-4888-8888-00000000a101'::uuid end;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.prueba_sync (caso, resultado)
  select p_caso, public.sync_push_obligaciones(lote) from public.prueba_lote where caso = coalesce(p_lote, p_caso);
  execute 'reset role';
  execute 'set constraints all deferred';
end $$;

create function pg_temp.res(p_caso text) returns jsonb language sql as $$
  select resultado from public.prueba_sync where caso = p_caso;
$$;
create function pg_temp.estado(p_caso text) returns text language sql as $$ select pg_temp.res(p_caso) ->> 'estado'; $$;
create function pg_temp.motivo(p_caso text) returns text language sql as $$ select pg_temp.res(p_caso) ->> 'motivo'; $$;
create function pg_temp.detalle(p_caso text) returns text language sql as $$ select pg_temp.res(p_caso) ->> 'detalle'; $$;
create function pg_temp.filas(p_tabla text, p_col text, p_id uuid) returns int language plpgsql as $$
declare v int;
begin
  execute format('select count(*)::int from public.%I where %I = $1', p_tabla, p_col) into v using p_id;
  return v;
end $$;

-- Lotes de pago de deuda sobre Visa hogar (401), Master hogar (402) y Visa
-- personal Ana (403). P1 es el abono canónico de $106.299.
insert into public.prueba_lote values
  ('p1', pg_temp.lote(pg_temp.fid('0109'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0101'), pg_temp.fx('401'), 106299, '2026-11-25', pg_temp.fx('c101'), p_medio => pg_temp.fx('301')))))),
  ('p2', pg_temp.lote(pg_temp.fid('0209'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0201'), pg_temp.fx('401'), 106299, '2026-11-25', pg_temp.fx('c101')))))),
  ('p3', pg_temp.lote(pg_temp.fid('0309'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0301'), pg_temp.fx('401'), 250000, '2026-11-26'))))),
  ('p4', pg_temp.lote(pg_temp.fid('0409'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0401'), pg_temp.fx('401'), 200000, '2026-11-26'), pg_temp.pago(pg_temp.fid('0402'), pg_temp.fx('401'), 50000, '2026-11-26', null, 'saldo_a_favor'))))),
  ('p4b', pg_temp.lote(pg_temp.fid('0509'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0501'), pg_temp.fx('401'), 1, '2026-11-27'))))),
  ('p5', pg_temp.lote(pg_temp.fid('0609'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0601'), pg_temp.fx('403'), 1000, '2026-11-02', null, 'saldo_a_favor'))))),
  ('p6', pg_temp.lote(pg_temp.fid('0709'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0701'), pg_temp.fx('401'), 60000, '2026-12-25', pg_temp.fx('c102')))))),
  ('p7', pg_temp.lote(pg_temp.fid('0809'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0801'), pg_temp.fx('402'), 107000, '2026-11-25', pg_temp.fx('c201'), p_medio => pg_temp.fx('301'))), 'costo_financiero', jsonb_build_array(pg_temp.costo(pg_temp.fx('d201'), 7000, pg_temp.fx('402'), (select seq from public.costo_financiero where id = pg_temp.fx('d201'))))))),
  ('p7b', pg_temp.lote(pg_temp.fid('0909'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0901'), pg_temp.fx('402'), 1, '2026-11-26')), 'costo_financiero', jsonb_build_array(pg_temp.costo(pg_temp.fx('d201'), 7000, pg_temp.fx('402'), (select seq from public.costo_financiero where id = pg_temp.fx('d201')) - 1))))),
  ('p7c', pg_temp.lote(pg_temp.fid('0a09'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0a01'), pg_temp.fx('402'), 200000, '2026-11-25'))))),
  ('p7d', pg_temp.lote(pg_temp.fid('0b09'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0b01'), pg_temp.fx('402'), 1, '2026-11-26'))))),
  ('p8', pg_temp.lote(pg_temp.fid('0c09'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0c01'), pg_temp.fx('401'), 1, '2026-11-28', null, 'saldo_a_favor')), 'costo_financiero', jsonb_build_array(pg_temp.costo(pg_temp.fx('d101'), 5000, pg_temp.fx('401'), (select seq from public.costo_financiero where id = pg_temp.fx('d101'))))))),
  ('p9a', pg_temp.lote(pg_temp.fid('0d09'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0d01'), pg_temp.fx('403'), 10000, '2026-11-05'))))),
  ('p9b', pg_temp.lote(pg_temp.fid('0e09'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0e01'), pg_temp.fid('dead'), 10000, '2026-11-05'))))),
  ('p10', pg_temp.lote(pg_temp.fid('0f09'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('0f01'), pg_temp.fx('403'), 10000, '2026-11-05'))))),
  ('p11a', pg_temp.lote(pg_temp.fid('1009'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('1001'), pg_temp.fx('401'), 1, '2026-11-27')), 'compra', '[]'::jsonb))),
  ('p11b', pg_temp.lote(pg_temp.fid('1109'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('1101'), pg_temp.fx('401'), 1, '2026-11-27') || '{"base_seq":3}'::jsonb)))),
  ('p11c', pg_temp.lote(pg_temp.fid('1209'), 'otro', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('1201'), pg_temp.fx('401'), 1, '2026-11-27'))))),
  ('p11d', pg_temp.lote(pg_temp.fid('1309'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('1301'), pg_temp.fx('401'), 1, '2026-11-27')))));

-- Lotes de alta de pasivo (actor Ana).
insert into public.prueba_lote values
  ('a1', pg_temp.lote(pg_temp.fid('2009'), 'pasivo', jsonb_build_object('pasivo', jsonb_build_array(pg_temp.pasivo(pg_temp.fid('2001'), 'tarjeta', 'hogar', 'miembro', pg_temp.fx('101'))), 'tarjeta', jsonb_build_array(jsonb_build_object('pasivo_id', pg_temp.fid('2001'), 'franquicia', 'Visa', 'ultimos_4', '1234', 'dia_corte', 10, 'dia_pago', 20, 'cupo', 1000000))))),
  ('a2', pg_temp.lote(pg_temp.fid('2109'), 'pasivo', jsonb_build_object('pasivo', jsonb_build_array(pg_temp.pasivo(pg_temp.fid('2101'), 'credito', 'hogar', 'hogar', null)), 'credito', jsonb_build_array(jsonb_build_object('pasivo_id', pg_temp.fid('2101'), 'entidad', 'Banco'))))),
  ('a3', pg_temp.lote(pg_temp.fid('2209'), 'pasivo', jsonb_build_object('pasivo', jsonb_build_array(pg_temp.pasivo(pg_temp.fid('2201'), 'deuda', 'hogar', 'hogar', null)), 'deuda', jsonb_build_array(jsonb_build_object('pasivo_id', pg_temp.fid('2201'), 'acreedor', 'Almacén El Hogar')), 'plan_de_cuotas', jsonb_build_array(pg_temp.plan(pg_temp.fid('2202'), pg_temp.fid('2201'), 'desembolso', 100000, '2026-11-10'))))),
  ('a4', pg_temp.lote(pg_temp.fid('2309'), 'pasivo', jsonb_build_object('pasivo', jsonb_build_array(pg_temp.pasivo(pg_temp.fid('2301'), 'tarjeta', 'hogar', 'miembro', pg_temp.fx('101'))), 'tarjeta', jsonb_build_array(jsonb_build_object('pasivo_id', pg_temp.fid('2301'), 'dia_corte', 10, 'dia_pago', 20)), 'plan_de_cuotas', jsonb_build_array(pg_temp.plan(pg_temp.fid('2302'), pg_temp.fid('2301'), 'desembolso', 100000, '2026-11-10'))))),
  ('a5', pg_temp.lote(pg_temp.fid('2409'), 'pasivo', jsonb_build_object('pasivo', jsonb_build_array(pg_temp.pasivo(pg_temp.fid('2401'), 'credito', 'personal', 'miembro', pg_temp.fx('101'))), 'credito', jsonb_build_array(jsonb_build_object('pasivo_id', pg_temp.fid('2401'), 'entidad', 'Banco')), 'plan_de_cuotas', jsonb_build_array(pg_temp.plan(pg_temp.fid('2402'), pg_temp.fid('2401'), 'saldo_inicial', 200000, '2026-11-01', 'capital_fijo', 2, '2026-12-01')), 'cuota', jsonb_build_array(pg_temp.cuota(pg_temp.fid('2403'), pg_temp.fid('2402'), 1, '2026-12-01', 100000), pg_temp.cuota(pg_temp.fid('2404'), pg_temp.fid('2402'), 2, '2027-01-01', 100000))))),
  ('a5b', pg_temp.lote(pg_temp.fid('2509'), 'pasivo', jsonb_build_object('pasivo', jsonb_build_array(pg_temp.pasivo(pg_temp.fid('2501'), 'credito', 'personal', 'miembro', pg_temp.fx('101'))), 'credito', jsonb_build_array(jsonb_build_object('pasivo_id', pg_temp.fid('2501'), 'entidad', 'Banco')), 'plan_de_cuotas', jsonb_build_array(pg_temp.plan(pg_temp.fid('2502'), pg_temp.fid('2501'), 'saldo_inicial', 200000, '2026-11-01', 'capital_fijo', 2, '2026-12-01')), 'cuota', jsonb_build_array(pg_temp.cuota(pg_temp.fid('2503'), pg_temp.fid('2502'), 1, '2026-12-01', 100000), pg_temp.cuota(pg_temp.fid('2504'), pg_temp.fid('2502'), 2, '2027-01-01', 99999))))),
  ('a6', pg_temp.lote(pg_temp.fid('2609'), 'pasivo', jsonb_build_object('pasivo', jsonb_build_array(pg_temp.pasivo(pg_temp.fid('2601'), 'tarjeta', 'personal', 'miembro', pg_temp.fx('102')))))),
  ('a7', pg_temp.lote(pg_temp.fid('2709'), 'pasivo', jsonb_build_object('pasivo', jsonb_build_array(pg_temp.pasivo(pg_temp.fid('2701'), 'credito', 'hogar', 'miembro', pg_temp.fx('101'), 'EA', 283200)), 'credito', jsonb_build_array(jsonb_build_object('pasivo_id', pg_temp.fid('2701'), 'entidad', 'Banco')), 'plan_de_cuotas', jsonb_build_array(pg_temp.plan(pg_temp.fid('2702'), pg_temp.fid('2701'), 'saldo_inicial', 100000, '2026-11-01', 'sin_calendario', null, null, 'EA', 200000)))));

-- Lotes de obligación y de pago de obligación.
insert into public.prueba_lote values
  ('o1', pg_temp.lote(pg_temp.fid('3009'), 'obligacion', jsonb_build_object('obligacion', jsonb_build_array(jsonb_build_object('id', pg_temp.fid('3001'), 'nombre', 'Internet hogar', 'categoria_id', pg_temp.fx('201'), 'monto_estimado', 120000, 'dia_vencimiento', 20, 'periodicidad', 'mensual', 'mes_inicio', '2026-11', 'activa', true))))),
  ('o2', pg_temp.lote(pg_temp.fid('3109'), 'pago_obligacion', jsonb_build_object('compra', jsonb_build_array(pg_temp.compra_obligacion(pg_temp.fid('3101'), pg_temp.fx('701'), '2026-11', 1800000, '2026-12-02', pg_temp.fx('202'), pg_temp.fx('301')))))),
  ('o3', pg_temp.lote(pg_temp.fid('3209'), 'pago_obligacion', jsonb_build_object('compra', jsonb_build_array(pg_temp.compra_obligacion(pg_temp.fid('3201'), pg_temp.fx('701'), '2026-11', 1800000, '2026-12-03', pg_temp.fx('202'), pg_temp.fx('301')))))),
  ('o4a', pg_temp.lote(pg_temp.fid('3309'), 'pago_obligacion', jsonb_build_object('compra', jsonb_build_array(pg_temp.compra_obligacion(pg_temp.fid('3301'), pg_temp.fx('701'), '2025-12', 1800000, '2026-12-02', pg_temp.fx('202'), pg_temp.fx('301')))))),
  ('o4b', pg_temp.lote(pg_temp.fid('3409'), 'pago_obligacion', jsonb_build_object('compra', jsonb_build_array(pg_temp.compra_obligacion(pg_temp.fid('3401'), pg_temp.fx('701'), '2026-12', 1800000, '2026-12-02', pg_temp.fx('201'), pg_temp.fx('301')))))),
  ('o4c', pg_temp.lote(pg_temp.fid('3509'), 'pago_obligacion', jsonb_build_object('compra', jsonb_build_array(pg_temp.compra_obligacion(pg_temp.fid('3501'), pg_temp.fx('702'), '2026-02', 120000, '2026-12-02', pg_temp.fx('202'), pg_temp.fx('301')))))),
  ('o4d', pg_temp.lote(pg_temp.fid('3609'), 'pago_obligacion', jsonb_build_object('compra', jsonb_build_array(pg_temp.compra_obligacion(pg_temp.fid('3601'), pg_temp.fx('702'), '2026-03', 120000, '2026-12-02', pg_temp.fx('202'), pg_temp.fx('301')))))),
  ('o5', pg_temp.lote(pg_temp.fid('3709'), 'pago_obligacion', jsonb_build_object('compra', jsonb_build_array(pg_temp.compra_obligacion(pg_temp.fid('3701'), pg_temp.fx('701'), '2027-01', 1800000, '2026-12-02', pg_temp.fx('202'), pg_temp.fx('301'), 'personal')))));

-- Esquema: tablas nuevas, RLS y superficie de la RPC.
select has_table('public', 'obligacion', 'Obligacion existe');
select has_table('public', 'pago_de_deuda', 'PagoDeDeuda existe');
select ok((select relrowsecurity from pg_class where oid = 'public.obligacion'::regclass), 'obligacion tiene RLS activo');
select ok((select relrowsecurity from pg_class where oid = 'public.pago_de_deuda'::regclass), 'pago_de_deuda tiene RLS activo');
select is(has_table_privilege('authenticated', 'public.obligacion', 'select'), true, 'authenticated lee obligacion');
select is(has_table_privilege('authenticated', 'public.obligacion', 'insert'), false, 'authenticated no inserta obligacion');
select is(has_table_privilege('authenticated', 'public.pago_de_deuda', 'select'), true, 'authenticated lee pago_de_deuda');
select is(has_table_privilege('authenticated', 'public.pago_de_deuda', 'insert'), false, 'authenticated no inserta pago_de_deuda');
select is(has_function_privilege('anon', 'public.sync_push_obligaciones(jsonb)', 'execute'), false, 'anon no ejecuta sync_push_obligaciones');
select is(has_function_privilege('authenticated', 'public.sync_push_obligaciones(jsonb)', 'execute'), true, 'authenticated ejecuta sync_push_obligaciones');

-- P1: abono canónico de $106.299 = $100.000 capital + $6.299 interés causado.
select pg_temp.push('p1', 'beto');
select is(pg_temp.estado('p1'), 'aplicado', 'P1: el abono que cubre la cuota 1 se aplica');
select is((select registrado_por from public.pago_de_deuda where id = pg_temp.fid('0101')), pg_temp.fx('102'), 'P1: registrado_por sale del actor');
select is((select tipo from public.pago_de_deuda where id = pg_temp.fid('0101')), 'abono', 'P1: el pago es un abono');
select is((select monto from public.pago_de_deuda where id = pg_temp.fid('0101')), 106299::bigint, 'P1: el abono cubre capital más interés causado');
select is((select monto_total from public.compra where id = pg_temp.fx('601')), 300000::bigint, 'P1: la compra original no se cuenta dos veces');

-- P2: Ana intenta pagar la misma cuota otra vez.
select pg_temp.push('p2');
select is(pg_temp.motivo('p2'), 'duplicado', 'P2: un segundo abono a la misma cuota es duplicado');
select is(pg_temp.detalle('p2'), 'pago_de_deuda_cuota_key', 'P2: el detalle nombra el índice de la cuota');
select is(pg_temp.filas('pago_de_deuda', 'cuota_id', pg_temp.fx('c101')), 1, 'P2: la cuota sigue con un solo abono');

-- P3: abono mayor que el saldo causado a su fecha (tope único, I20).
select pg_temp.push('p3', 'beto');
select is(pg_temp.estado('p3'), 'rechazado', 'P3: el sobrepago real se rechaza');
select is(pg_temp.motivo('p3'), 'invalido', 'P3: el motivo es invalido');
select ok(pg_temp.detalle('p3') like '%supera el saldo causado%', 'P3: el detalle explica el tope del saldo causado');
select is(pg_temp.filas('pago_de_deuda', 'id', pg_temp.fid('0301')), 0, 'P3: el rechazo no deja pago');

-- P4: el mismo lote divide el sobrepago en abono hasta el tope + saldo a favor.
select pg_temp.push('p4', 'beto');
select is(pg_temp.estado('p4'), 'aplicado', 'P4: el abono y su saldo a favor se aplican juntos');
select is((select jsonb_array_length(pg_temp.res('p4') -> 'filas')), 2, 'P4: el lote deja las dos filas');
select pg_temp.push('p4b', 'beto');
select is(pg_temp.motivo('p4b'), 'invalido', 'P4: con el libro en cero un abono mínimo se rechaza');
select is(pg_temp.filas('pago_de_deuda', 'id', pg_temp.fid('0501')), 0, 'P4: el rechazo no deja pago');

-- P5: saldo a favor mientras el saldo de esa fecha no está en cero.
select pg_temp.push('p5');
select is(pg_temp.motivo('p5'), 'invalido', 'P5: un saldo a favor con saldo pendiente se rechaza');
select ok(pg_temp.detalle('p5') like '%excedente%', 'P5: el detalle habla del excedente');

-- P6: un abono enlazado a una cuota debe cubrir su cargo completo.
select pg_temp.push('p6', 'beto');
select is(pg_temp.motivo('p6'), 'invalido', 'P6: un abono enlazado que no cubre su cuota se rechaza');
select ok(pg_temp.detalle('p6') like '%no cubre su cuota%', 'P6: el detalle nombra la cuota incompleta');

-- P7: el interés estimado se corrige contra el extracto y queda manual.
select pg_temp.push('p7', 'beto');
select is(pg_temp.estado('p7'), 'aplicado', 'P7: la corrección del interés con su base_seq se aplica');
select is((select monto from public.costo_financiero where id = pg_temp.fx('d201')), 7000::bigint, 'P7: el interés queda en el monto del extracto');
select is((select origen from public.costo_financiero where id = pg_temp.fx('d201')), 'manual', 'P7: el interés corregido pasa a manual');
select pg_temp.push('p7c', 'beto');
select is(pg_temp.estado('p7c'), 'aplicado', 'P7: el segundo abono sin cuota se aplica');
select pg_temp.push('p7d', 'beto');
select is(pg_temp.motivo('p7d'), 'invalido', 'P7: el libro corregido queda en saldo cero');

-- P7b: corregir con un seq que el cliente ya no vio es conflicto.
select pg_temp.push('p7b', 'beto');
select is(pg_temp.motivo('p7b'), 'conflicto', 'P7b: un base_seq viejo es conflicto');
select is(pg_temp.detalle('p7b'), 'el costo cambió en el servidor', 'P7b: el detalle nombra el conflicto');
select is((select monto from public.costo_financiero where id = pg_temp.fx('d201')), 7000::bigint, 'P7b: el rechazo no toca el costo');

-- P8: bajar el interés de un libro ya pagado dejaría un abono sobre el tope.
select pg_temp.push('p8', 'beto');
select is(pg_temp.motivo('p8'), 'invalido', 'P8: bajar el interés de un libro pagado se rechaza');
select is((select monto from public.costo_financiero where id = pg_temp.fx('d101')), 6299::bigint, 'P8: el interés del libro pagado no cambia');
select is(pg_temp.filas('pago_de_deuda', 'id', pg_temp.fid('0c01')), 0, 'P8: el rechazo no deja el saldo a favor');

-- P9: un libro personal ajeno se trata igual que uno inexistente.
select pg_temp.push('p9a', 'beto');
select pg_temp.push('p9b', 'beto');
select is(pg_temp.motivo('p9a'), 'invalido', 'P9: pagar el libro personal ajeno se rechaza');
select is(pg_temp.detalle('p9a'), 'pasivo inexistente', 'P9: un libro personal ajeno se trata como inexistente');
select is(pg_temp.res('p9a'), pg_temp.res('p9b'), 'P9: libro ajeno y pasivo inventado dan el mismo resultado');

-- P10: Ana paga su propio libro personal: numera su carril, no el del hogar.
insert into public.prueba_contador values
  ('hogar_p10', (select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1'))),
  ('personal_p10', (select ultimo_seq from public.personal_seq where hogar_id = pg_temp.fx('1') and miembro_id = pg_temp.fx('101')));
select pg_temp.push('p10');
select is(pg_temp.estado('p10'), 'aplicado', 'P10: Ana paga su libro personal');
select is((select registrado_por from public.pago_de_deuda where id = pg_temp.fid('0f01')), pg_temp.fx('101'), 'P10: el pago personal queda con su dueño');
select is((select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1')), (select valor from public.prueba_contador where nombre = 'hogar_p10'), 'P10: un pago personal no mueve hogar_seq');
select ok((select ultimo_seq from public.personal_seq where hogar_id = pg_temp.fx('1') and miembro_id = pg_temp.fx('101')) > (select valor from public.prueba_contador where nombre = 'personal_p10'), 'P10: el pago personal numera el carril de su dueño');

-- P11: forma del lote, autorización y reintento por autor.
select pg_temp.push('p11a', 'beto');
select is(pg_temp.detalle('p11a'), 'tabla no admitida: compra', 'P11: un lote de pago no admite compras');
select pg_temp.push('p11b', 'beto');
select is(pg_temp.detalle('p11b'), 'solo altas: base_seq debe ser nulo', 'P11: un pago con base_seq no es un alta');
select pg_temp.push('p11c', 'beto');
select is(pg_temp.detalle('p11c'), 'tipo de lote desconocido', 'P11: un tipo de lote desconocido se rechaza');
select pg_temp.push('p11d', 'caro');
select is(pg_temp.motivo('p11d'), 'no_autorizado', 'P11: un miembro de otro hogar no escribe en el hogar A');
select pg_temp.push('p11e', 'beto', p_lote => 'p1');
select is(pg_temp.res('p11e'), pg_temp.res('p1'), 'P11: el reintento devuelve el resultado guardado');
select is(pg_temp.filas('pago_de_deuda', 'id', pg_temp.fid('0101')), 1, 'P11: el reintento no duplica el pago');

-- A1: tarjeta del hogar sin tasa (Sin tasa es el default).
select pg_temp.push('a1');
select is(pg_temp.estado('a1'), 'aplicado', 'A1: una tarjeta del hogar sin tasa se crea');
select is(pg_temp.filas('tarjeta', 'pasivo_id', pg_temp.fid('2001')), 1, 'A1: queda su fila de tarjeta');
select is((select dia_corte from public.tarjeta where pasivo_id = pg_temp.fid('2001')), 10::smallint, 'A1: la tarjeta guarda su corte');

-- A2: en fase 1 una tarjeta y un crédito son de un miembro.
select pg_temp.push('a2');
select is(pg_temp.estado('a2'), 'rechazado', 'A2: un crédito del hogar se rechaza');
select is(pg_temp.detalle('a2'), 'tarjeta y crédito son de un miembro', 'A2: el detalle explica la política de titular');

-- A3: deuda del hogar con desembolso.
select pg_temp.push('a3');
select is(pg_temp.estado('a3'), 'aplicado', 'A3: una deuda del hogar con desembolso se crea');
select is(pg_temp.filas('deuda', 'pasivo_id', pg_temp.fid('2201')), 1, 'A3: queda su fila de deuda');
select is((select capital from public.plan_de_cuotas where id = pg_temp.fid('2202')), 100000::bigint, 'A3: el desembolso guarda su capital');

-- A4: una tarjeta no admite desembolso.
select pg_temp.push('a4');
select is(pg_temp.motivo('a4'), 'invalido', 'A4: una tarjeta con desembolso se rechaza');
select is(pg_temp.detalle('a4'), 'un desembolso solo existe en crédito o deuda', 'A4: el detalle explica el desembolso');
select is(pg_temp.filas('pasivo', 'id', pg_temp.fid('2301')), 0, 'A4: el rechazo no deja pasivo');

-- A5: crédito personal con saldo inicial y calendario.
select pg_temp.push('a5');
select is(pg_temp.estado('a5'), 'aplicado', 'A5: un crédito personal con su calendario se crea');
select is(pg_temp.filas('cuota', 'plan_id', pg_temp.fid('2402')), 2, 'A5: quedan las dos cuotas del plan');
select pg_temp.push('a5b');
select is(pg_temp.motivo('a5b'), 'invalido', 'A5: cuotas que no suman el capital se rechazan');
select is(pg_temp.filas('plan_de_cuotas', 'id', pg_temp.fid('2502')), 0, 'A5: el rechazo no deja plan');

-- A6: un libro personal solo lo crea su dueño.
select pg_temp.push('a6');
select is(pg_temp.motivo('a6'), 'no_autorizado', 'A6: un libro personal ajeno no lo crea otro miembro');
select is(pg_temp.filas('pasivo', 'id', pg_temp.fid('2601')), 0, 'A6: el rechazo no deja pasivo');

-- A7: la tasa del plan es la de su pasivo.
select pg_temp.push('a7');
select is(pg_temp.motivo('a7'), 'invalido', 'A7: un plan con tasa distinta a la del pasivo se rechaza');
select is(pg_temp.detalle('a7'), 'el plan, las cuotas y el subtipo son de ese pasivo', 'A7: el detalle nombra el plan ajeno');

-- O1: alta de una obligación recurrente.
select pg_temp.push('o1');
select is(pg_temp.estado('o1'), 'aplicado', 'O1: una obligación del hogar se crea');
select is((select dia_vencimiento from public.obligacion where id = pg_temp.fid('3001')), 20::smallint, 'O1: la obligación guarda su vencimiento');

-- O2: pagar el arriendo es una compra del hogar con su periodo.
select pg_temp.push('o2', 'beto');
select is(pg_temp.estado('o2'), 'aplicado', 'O2: el pago del arriendo se aplica');
select is((select periodo from public.compra where id = pg_temp.fid('3101')), '2026-11', 'O2: la compra guarda el periodo pagado');
select is((select fecha from public.compra where id = pg_temp.fid('3101')), '2026-12-02'::date, 'O2: la fecha de pago es la del hecho');
select is((select registrado_por from public.compra where id = pg_temp.fid('3101')), pg_temp.fx('102'), 'O2: el pago de la obligación queda con su autor');

-- O3: un periodo se paga una sola vez.
select pg_temp.push('o3', 'beto');
select is(pg_temp.estado('o3'), 'rechazado', 'O3: el mismo periodo se rechaza');
select is(pg_temp.detalle('o3'), 'compra_obligacion_periodo_key', 'O3: el detalle nombra el índice del periodo');

-- O4: el periodo es una instancia real de la plantilla y va en su categoría.
select pg_temp.push('o4a', 'beto');
select is(pg_temp.motivo('o4a'), 'invalido', 'O4: un periodo anterior al inicio se rechaza');
select pg_temp.push('o4b', 'beto');
select is(pg_temp.motivo('o4b'), 'invalido', 'O4: una compra de obligación en otra categoría se rechaza');
select pg_temp.push('o4c', 'beto');
select is(pg_temp.motivo('o4c'), 'invalido', 'O4: un mes que no es instancia bimestral se rechaza');
select pg_temp.push('o4d', 'beto');
select is(pg_temp.estado('o4d'), 'aplicado', 'O4: el mes que sí es instancia bimestral se aplica');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('3501')), 0, 'O4: el rechazo no deja la compra fuera de instancia');

-- O5: el pago de una obligación es una compra de contado del hogar.
select pg_temp.push('o5', 'beto');
select is(pg_temp.motivo('o5'), 'invalido', 'O5: un pago de obligación personal se rechaza');
select is(pg_temp.detalle('o5'), 'el pago de una obligación es una compra de contado del hogar', 'O5: el detalle exige el ámbito hogar');

-- R1: un costo no puede aparecer dos veces en el mismo lote (la segunda
-- corrección se perdería en silencio).
insert into public.prueba_lote values ('r1', pg_temp.lote(pg_temp.fid('4109'), 'pago', jsonb_build_object(
  'costo_financiero', jsonb_build_array(
    pg_temp.costo(pg_temp.fx('d201'), 7000, pg_temp.fx('402'), (select seq from public.costo_financiero where id = pg_temp.fx('d201'))),
    pg_temp.costo(pg_temp.fx('d201'), 7000, pg_temp.fx('402'), (select seq from public.costo_financiero where id = pg_temp.fx('d201')))),
  'pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('4101'), pg_temp.fx('402'), 1, '2026-11-29', p_tipo => 'saldo_a_favor')))));
select pg_temp.push('r1', 'beto');
select is(pg_temp.detalle('r1'), 'un costo aparece dos veces en el lote', 'R1: dos correcciones del mismo costo se rechazan');

-- R2: subir el interés de una cuota ya pagada no puede dejar su enlace sin cubrir.
insert into public.prueba_lote values ('r2', pg_temp.lote(pg_temp.fid('4209'), 'pago', jsonb_build_object(
  'costo_financiero', jsonb_build_array(
    pg_temp.costo(pg_temp.fx('d201'), 8000, pg_temp.fx('402'), (select seq from public.costo_financiero where id = pg_temp.fx('d201')))),
  'pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('4201'), pg_temp.fx('402'), 1000, '2026-11-27')))));
select pg_temp.push('r2', 'beto');
select ok(pg_temp.detalle('r2') like '%no cubre su cuota%', 'R2: el enlace de la cuota pagada se revalida al corregir su interés');
select is((select monto from public.costo_financiero where id = pg_temp.fx('d201')), 7000::bigint, 'R2: el interés no cambia');

-- R3: una obligación de otro hogar responde igual sea cual sea el periodo.
insert into public.prueba_lote values
  ('r3a', jsonb_build_object('lote_id', pg_temp.fid('4309'), 'hogar_id', pg_temp.fx('2'), 'schema_version', 1,
    'tipo', 'pago_obligacion', 'filas', jsonb_build_object('compra', jsonb_build_array(
      pg_temp.compra_obligacion(pg_temp.fid('4301'), pg_temp.fx('701'), '2025-12', 1000, '2026-11-20', pg_temp.fx('202'), pg_temp.fx('303')))))),
  ('r3b', jsonb_build_object('lote_id', pg_temp.fid('4409'), 'hogar_id', pg_temp.fx('2'), 'schema_version', 1,
    'tipo', 'pago_obligacion', 'filas', jsonb_build_object('compra', jsonb_build_array(
      pg_temp.compra_obligacion(pg_temp.fid('4301'), pg_temp.fx('701'), '2026-11', 1000, '2026-11-20', pg_temp.fx('202'), pg_temp.fx('303'))))));
select pg_temp.push('r3a', 'caro');
select pg_temp.push('r3b', 'caro');
select is(pg_temp.motivo('r3a'), 'invalido', 'R3: una obligación ajena se rechaza');
select is(pg_temp.res('r3a'), pg_temp.res('r3b'), 'R3: el periodo de una obligación ajena no cambia la respuesta');

-- R4: un rechazo dentro de la RPC no deja la transacción en modo inmediato
-- (el abort de la subtransacción restaura SET CONSTRAINTS).
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-00000000b102","role":"authenticated"}', true);
set local role authenticated;
select is(public.sync_push_obligaciones(pg_temp.lote(pg_temp.fid('4509'), 'pago', jsonb_build_object('pago_de_deuda',
  jsonb_build_array(pg_temp.pago(pg_temp.fid('4501'), pg_temp.fx('401'), 999999999, '2026-11-30'))))) ->> 'motivo',
  'invalido', 'R4: el sobrepago se rechaza dentro de la RPC');
reset role;
savepoint r4;
select lives_ok($$insert into public.compra (id, hogar_id, fecha, descripcion, monto_total, categoria_id, pago_tipo, registrado_por, actualizado_por)
  values ('88888888-8888-4888-8888-460100000000', '88888888-8888-4888-8888-000000000001', '2026-11-30', 'x', 1000,
          '88888888-8888-4888-8888-000000000201', 'financiado', '88888888-8888-4888-8888-000000000101', '88888888-8888-4888-8888-000000000101')$$,
  'R4: tras un rechazo las reglas entre filas siguen diferidas');
rollback to savepoint r4;

-- R5: contrato de la respuesta: cada fila escrita con su tabla y el seq guardado.
select ok(pg_temp.res('p7') -> 'filas' @> jsonb_build_array(jsonb_build_object('tabla', 'costo_financiero',
  'id', pg_temp.fx('d201'), 'seq', (select seq from public.costo_financiero where id = pg_temp.fx('d201')))) is not null
  and exists (select 1 from jsonb_array_elements(pg_temp.res('p7') -> 'filas') f
               join public.costo_financiero k on k.id = (f ->> 'id')::uuid where f ->> 'tabla' = 'costo_financiero'),
  'R5: la corrección del costo aparece en la respuesta');
select is((select count(*)::int from jsonb_array_elements(pg_temp.res('p7') -> 'filas') f
            join public.pago_de_deuda g on g.id = (f ->> 'id')::uuid and g.seq = (f ->> 'seq')::bigint
           where f ->> 'tabla' = 'pago_de_deuda'), 1, 'R5: el pago aparece con el seq que quedó guardado');

-- R6: una fila de pago sin pasivo no hereda el pasivo de la otra fila.
insert into public.prueba_lote values ('r6', pg_temp.lote(pg_temp.fid('4609'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(
  pg_temp.pago(pg_temp.fid('4601'), pg_temp.fx('401'), 1, '2026-11-30'),
  pg_temp.pago(pg_temp.fid('4602'), null, 1, '2026-11-30', p_tipo => 'saldo_a_favor')))));
select pg_temp.push('r6', 'beto');
select is(pg_temp.detalle('r6'), 'un pago lleva un abono y/o un saldo a favor de un pasivo', 'R6: un pago sin pasivo se rechaza');

-- R7: un saldo a favor cubre un cargo posterior (misma regla que recorrerLibro).
insert into public.prueba_lote values
  ('r7a', pg_temp.lote(pg_temp.fid('4709'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(
    pg_temp.pago(pg_temp.fid('4701'), pg_temp.fx('403'), 40000, '2026-11-06'),
    pg_temp.pago(pg_temp.fid('4702'), pg_temp.fx('403'), 5000, '2026-11-06', p_tipo => 'saldo_a_favor'))))),
  ('r7b', pg_temp.lote(pg_temp.fid('4809'), 'pago', jsonb_build_object(
    'costo_financiero', jsonb_build_array(jsonb_build_object('id', pg_temp.fid('4803'), 'tipo', 'cuota_manejo', 'monto', 3000,
      'fecha_causacion', '2026-11-10', 'pasivo_id', pg_temp.fx('403'), 'origen', 'manual')),
    'pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('4801'), pg_temp.fx('403'), 1, '2026-11-10', p_tipo => 'saldo_a_favor'))))),
  ('r7c', pg_temp.lote(pg_temp.fid('4909'), 'pago', jsonb_build_object('pago_de_deuda', jsonb_build_array(
    pg_temp.pago(pg_temp.fid('4901'), pg_temp.fx('403'), 1, '2026-11-11')))));
select pg_temp.push('r7a');
select pg_temp.push('r7b');
select pg_temp.push('r7c');
select is(pg_temp.estado('r7a'), 'aplicado', 'R7: el saldo a favor nace con el libro en cero');
select is(pg_temp.estado('r7b'), 'aplicado', 'R7: un cargo posterior lo consume el saldo a favor y el libro sigue en cero');
select is(pg_temp.motivo('r7c'), 'invalido', 'R7: con el cargo cubierto por el saldo a favor no queda saldo que abonar');

-- R10: la corrección viaja con la forma exacta del cliente ({id, base_seq, monto}).
insert into public.prueba_lote values ('r10', pg_temp.lote(pg_temp.fid('4c09'), 'pago', jsonb_build_object(
  'costo_financiero', jsonb_build_array(jsonb_build_object('id', pg_temp.fid('4803'), 'monto', 3500,
    'base_seq', (select seq from public.costo_financiero where id = pg_temp.fid('4803')))),
  'pago_de_deuda', jsonb_build_array(pg_temp.pago(pg_temp.fid('4c01'), pg_temp.fx('403'), 1, '2026-11-12', p_tipo => 'saldo_a_favor')))));
select pg_temp.push('r10');
select is(pg_temp.estado('r10'), 'aplicado', 'R10: la corrección con la forma del cliente se aplica');
select is((select monto || ' ' || origen from public.costo_financiero where id = pg_temp.fid('4803')), '3500 manual',
  'R10: el costo corregido queda con el monto nuevo y origen manual');

-- R8: guardas tempranas de la RPC.
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-00000000b102","role":"authenticated"}', true);
set local role authenticated;
select is(public.sync_push_obligaciones('[]'::jsonb) ->> 'detalle', 'forma del lote', 'R8: un lote que no es objeto se rechaza');
select is(public.sync_push_obligaciones(pg_temp.lote(pg_temp.fid('4a09'), 'pago', '{}'::jsonb) || '{"schema_version": 2}') ->> 'motivo',
  'actualizar_app', 'R8: otra versión del esquema pide actualizar la app');
select is(public.sync_push_obligaciones(pg_temp.lote(pg_temp.fid('4b09'), 'pago', '{}'::jsonb) || '{"lote_id": "x"}') ->> 'detalle',
  'identificadores del lote', 'R8: un lote_id que no es UUID se rechaza');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.sync_push_obligaciones('{}'::jsonb)$$, '28000', null, 'R8: sin sesión no hay escritura');
reset role;

-- R9: bordes de los CHECK nuevos.
select throws_ok($$insert into public.obligacion (id, hogar_id, nombre, categoria_id, dia_vencimiento, periodicidad, mes_inicio, actualizado_por)
  values (gen_random_uuid(), '88888888-8888-4888-8888-000000000001', 'X', '88888888-8888-4888-8888-000000000202', 32, 'mensual', '2026-01',
          '88888888-8888-4888-8888-000000000101')$$, '23514', null, 'R9: día de vencimiento 32 se rechaza');
select throws_ok($$insert into public.obligacion (id, hogar_id, nombre, categoria_id, dia_vencimiento, periodicidad, mes_inicio, actualizado_por, monto_estimado)
  values (gen_random_uuid(), '88888888-8888-4888-8888-000000000001', 'X', '88888888-8888-4888-8888-000000000202', 5, 'mensual', '2026-01',
          '88888888-8888-4888-8888-000000000101', 0)$$, '23514', null, 'R9: monto estimado 0 se rechaza');
select throws_ok($$insert into public.obligacion (id, hogar_id, nombre, categoria_id, dia_vencimiento, periodicidad, mes_inicio, actualizado_por)
  values (gen_random_uuid(), '88888888-8888-4888-8888-000000000001', 'X', '88888888-8888-4888-8888-000000000202', 5, 'semanal', '2026-01',
          '88888888-8888-4888-8888-000000000101')$$, '23514', null, 'R9: una periodicidad desconocida se rechaza');
select throws_ok($$insert into public.pago_de_deuda (id, hogar_id, pasivo_id, tipo, medio_de_pago_id, monto, fecha, registrado_por, actualizado_por)
  values (gen_random_uuid(), '88888888-8888-4888-8888-000000000001', '88888888-8888-4888-8888-000000000401', 'abono',
          '88888888-8888-4888-8888-000000000301', 0, '2026-11-30', '88888888-8888-4888-8888-000000000102', '88888888-8888-4888-8888-000000000102')$$,
  '23514', null, 'R9: un pago de $0 se rechaza');
select throws_ok($$insert into public.pago_de_deuda (id, hogar_id, pasivo_id, tipo, cuota_id, medio_de_pago_id, monto, fecha, registrado_por, actualizado_por)
  values (gen_random_uuid(), '88888888-8888-4888-8888-000000000001', '88888888-8888-4888-8888-000000000401', 'saldo_a_favor',
          '88888888-8888-4888-8888-00000000c101', '88888888-8888-4888-8888-000000000301', 10, '2026-11-30',
          '88888888-8888-4888-8888-000000000102', '88888888-8888-4888-8888-000000000102')$$,
  '23514', null, 'R9: un saldo a favor no enlaza una cuota');

-- RLS: Beto ve lo del hogar y no lo personal ajeno; Caro no ve el hogar A.
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-00000000b102","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.filas('obligacion', 'id', pg_temp.fx('701')), 1, 'RLS: Beto ve la obligación del hogar');
select is(pg_temp.filas('pago_de_deuda', 'id', pg_temp.fid('0101')), 1, 'RLS: Beto ve el abono del hogar');
select is(pg_temp.filas('pago_de_deuda', 'id', pg_temp.fid('0f01')), 0, 'RLS: Beto no ve el pago personal de Ana');
reset role;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-00000000c103","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.obligacion), 0, 'RLS: Caro no ve obligaciones del hogar A');
select is((select count(*)::int from public.pago_de_deuda), 0, 'RLS: Caro no ve pagos del hogar A');
reset role;

select * from finish();
rollback;
