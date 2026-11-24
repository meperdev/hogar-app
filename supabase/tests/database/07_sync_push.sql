-- Núcleo 1, compra rápida (S2, S3, S4, S5, S7): `sync_push` sobre el lote de una
-- compra. Cada caso verifica el veredicto y las filas que quedaron. Rollback.
-- Actores: Ana (admin hogar A), Beto (miembro A), Caro (admin hogar B).
-- Fixtures (prefijo 77): hogar A ...000000000001 · hogar B ...000000000002 ·
-- Ana ...000000000101 · Beto ...000000000102 · Caro ...000000000103 ·
-- Mercado ...000000000201 · Efectivo Ana ...000000000301 · Visa hogar ...000000000401 ·
-- Visa personal Ana ...000000000402 · Préstamo cocina ...000000000403 ·
-- Crédito Beto ...000000000404 · desembolso préstamo ...000000000501 ·
-- desembolso crédito ...000000000502 · auth: ...00000000a101/b102/c103
begin;
set search_path = public, extensions;
select plan(132);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at) values
  ('77777777-7777-4777-8777-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@sync.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('77777777-7777-4777-8777-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@sync.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('77777777-7777-4777-8777-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'caro@sync.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.hogar (id, nombre, actualizado_por, creado_en, actualizado_en) values
  ('77777777-7777-4777-8777-000000000001', 'Hogar A', '77777777-7777-4777-8777-000000000101', now(), now()),
  ('77777777-7777-4777-8777-000000000002', 'Hogar B', '77777777-7777-4777-8777-000000000103', now(), now());

insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo, creado_en, actualizado_en, actualizado_por) values
  ('77777777-7777-4777-8777-000000000101', '77777777-7777-4777-8777-000000000001', 'Ana', '77777777-7777-4777-8777-00000000a101', 'admin', true, now(), now(), '77777777-7777-4777-8777-000000000101'),
  ('77777777-7777-4777-8777-000000000102', '77777777-7777-4777-8777-000000000001', 'Beto', '77777777-7777-4777-8777-00000000b102', 'miembro', true, now(), now(), '77777777-7777-4777-8777-000000000102'),
  ('77777777-7777-4777-8777-000000000103', '77777777-7777-4777-8777-000000000002', 'Caro', '77777777-7777-4777-8777-00000000c103', 'admin', true, now(), now(), '77777777-7777-4777-8777-000000000103');

insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq) values
  ('77777777-7777-4777-8777-000000000001', '77777777-7777-4777-8777-000000000101', 0),
  ('77777777-7777-4777-8777-000000000001', '77777777-7777-4777-8777-000000000102', 0),
  ('77777777-7777-4777-8777-000000000002', '77777777-7777-4777-8777-000000000103', 0);

insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por)
values ('77777777-7777-4777-8777-000000000201', '77777777-7777-4777-8777-000000000001', 'Mercado', 1, now(), now(), '77777777-7777-4777-8777-000000000101');

insert into public.medio_de_pago (id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, creado_en, actualizado_en, actualizado_por)
values ('77777777-7777-4777-8777-000000000301', '77777777-7777-4777-8777-000000000001', 'Efectivo Ana', 'efectivo', 'miembro', '77777777-7777-4777-8777-000000000101', now(), now(), '77777777-7777-4777-8777-000000000101');

insert into public.pasivo (id, hogar_id, tipo, nombre, ambito, owner_tipo, owner_miembro_id, tasa_tipo, tasa_ppm, creado_en, actualizado_en, actualizado_por) values
  ('77777777-7777-4777-8777-000000000401', '77777777-7777-4777-8777-000000000001', 'tarjeta', 'Visa hogar', 'hogar', 'miembro', '77777777-7777-4777-8777-000000000101', 'EA', 283200, now(), now(), '77777777-7777-4777-8777-000000000101'),
  ('77777777-7777-4777-8777-000000000402', '77777777-7777-4777-8777-000000000001', 'tarjeta', 'Visa personal Ana', 'personal', 'miembro', '77777777-7777-4777-8777-000000000101', null, null, now(), now(), '77777777-7777-4777-8777-000000000101'),
  ('77777777-7777-4777-8777-000000000403', '77777777-7777-4777-8777-000000000001', 'deuda', 'Préstamo cocina', 'hogar', 'hogar', null, null, null, now(), now(), '77777777-7777-4777-8777-000000000101'),
  ('77777777-7777-4777-8777-000000000404', '77777777-7777-4777-8777-000000000001', 'credito', 'Crédito Beto', 'personal', 'miembro', '77777777-7777-4777-8777-000000000102', null, null, now(), now(), '77777777-7777-4777-8777-000000000102');

insert into public.tarjeta (pasivo_id, hogar_id, dia_corte, dia_pago, ultimos_4, actualizado_por) values
  ('77777777-7777-4777-8777-000000000401', '77777777-7777-4777-8777-000000000001', 15, 25, '4521', '77777777-7777-4777-8777-000000000101'),
  ('77777777-7777-4777-8777-000000000402', '77777777-7777-4777-8777-000000000001', 15, 25, '8899', '77777777-7777-4777-8777-000000000101');

insert into public.deuda (pasivo_id, hogar_id, acreedor, actualizado_por)
values ('77777777-7777-4777-8777-000000000403', '77777777-7777-4777-8777-000000000001', 'Almacén El Hogar', '77777777-7777-4777-8777-000000000101');

insert into public.credito (pasivo_id, hogar_id, entidad, actualizado_por)
values ('77777777-7777-4777-8777-000000000404', '77777777-7777-4777-8777-000000000001', 'Banco', '77777777-7777-4777-8777-000000000102');

insert into public.plan_de_cuotas (id, hogar_id, pasivo_id, origen, compra_id, fecha_inicio, capital, sistema, actualizado_por) values
  ('77777777-7777-4777-8777-000000000501', '77777777-7777-4777-8777-000000000001', '77777777-7777-4777-8777-000000000403', 'desembolso', null, '2026-11-10', 100000, 'sin_calendario', '77777777-7777-4777-8777-000000000101'),
  ('77777777-7777-4777-8777-000000000502', '77777777-7777-4777-8777-000000000001', '77777777-7777-4777-8777-000000000404', 'desembolso', null, '2026-11-10', 50000, 'sin_calendario', '77777777-7777-4777-8777-000000000102');

set constraints all immediate;
set constraints all deferred;

create table public.prueba_lote (caso text primary key, lote jsonb not null);
create table public.prueba_sync (caso text primary key, resultado jsonb not null);
create table public.prueba_contador (nombre text primary key, valor bigint not null);
grant select on public.prueba_lote to authenticated;
grant select, insert on public.prueba_sync to authenticated;

-- Helpers. Ids por caso: pg_temp.fid('<caso><rol>') → 7777…-<4 hex>00000000,
-- con rol 01 compra, 02 plan, 03-05 cuotas, 06-08 costos, 0b alias, 09 lote.
create function pg_temp.fid(p_sufijo text) returns uuid language sql immutable as $$
  select ('77777777-7777-4777-8777-' || p_sufijo || '00000000')::uuid;
$$;

-- Ids de fixture (hogares, miembros, pasivos): pg_temp.fx('101') → 7777…-000000000101.
create function pg_temp.fx(p_sufijo text) returns uuid language sql immutable as $$
  select ('77777777-7777-4777-8777-' || lpad(p_sufijo, 12, '0'))::uuid;
$$;

create function pg_temp.compra(
  p_id uuid, p_monto bigint, p_pago text default 'contado', p_ambito text default 'hogar',
  p_miembro uuid default null, p_medio uuid default '77777777-7777-4777-8777-000000000301',
  p_financiada uuid default null, p_cufe text default null, p_nit text default null,
  p_iva bigint default null, p_fecha date default '2026-11-22', p_extra jsonb default '{}')
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'fecha', p_fecha, 'descripcion', 'Compra de prueba',
    'monto_total', p_monto, 'categoria_id', '77777777-7777-4777-8777-000000000201'::uuid,
    'ambito', p_ambito, 'miembro_id', p_miembro, 'pago_tipo', p_pago, 'medio_de_pago_id', p_medio,
    'financiada_por_pasivo_id', p_financiada, 'cufe', p_cufe, 'nit_comercio', p_nit, 'iva', p_iva,
    'origen', 'manual') || p_extra;
$$;

create function pg_temp.plan(
  p_id uuid, p_capital bigint, p_pasivo uuid default '77777777-7777-4777-8777-000000000401',
  p_compra uuid default null, p_sistema text default 'capital_fijo', p_n int default 1,
  p_primera date default '2026-12-25', p_tasa_tipo text default null, p_tasa_ppm int default null,
  p_origen text default 'compra', p_fecha date default '2026-11-22')
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'pasivo_id', p_pasivo, 'origen', p_origen,
    'compra_id', p_compra, 'fecha_inicio', p_fecha, 'capital', p_capital, 'sistema', p_sistema,
    'n_cuotas', p_n, 'fecha_primera_cuota', p_primera, 'tasa_tipo', p_tasa_tipo,
    'tasa_ppm', p_tasa_ppm);
$$;

create function pg_temp.cuota(p_id uuid, p_plan uuid, p_numero int, p_fecha date, p_capital bigint)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'plan_id', p_plan, 'numero', p_numero,
                            'fecha_vencimiento', p_fecha, 'capital', p_capital);
$$;

-- Cuotas mensuales desde `p_desde`; un id nulo se genera.
create function pg_temp.cuotas(p_plan uuid, p_capitales bigint[], p_ids uuid[] default null,
                               p_desde date default '2026-12-25')
returns jsonb language plpgsql as $$
declare v jsonb := '[]'; i int;
begin
  for i in 1 .. array_length(p_capitales, 1) loop
    v := v || jsonb_build_array(pg_temp.cuota(coalesce(p_ids[i], gen_random_uuid()), p_plan, i,
      (p_desde + ((i - 1) || ' month')::interval)::date, p_capitales[i]));
  end loop;
  return v;
end $$;

create function pg_temp.costo(p_id uuid, p_monto bigint, p_fecha date,
  p_pasivo uuid default '77777777-7777-4777-8777-000000000401', p_cuota uuid default null,
  p_tipo text default 'interes')
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'tipo', p_tipo, 'monto', p_monto,
    'fecha_causacion', p_fecha, 'pasivo_id', p_pasivo, 'cuota_id', p_cuota, 'origen', 'calculado');
$$;

create function pg_temp.alias(p_id uuid, p_nit text, p_nombre text, p_categoria uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'nit_comercio', p_nit, 'nombre', p_nombre,
                            'categoria_sugerida_id', p_categoria);
$$;

create function pg_temp.lote(
  p_lote uuid, p_compras jsonb, p_planes jsonb default '[]', p_cuotas jsonb default '[]',
  p_costos jsonb default '[]', p_alias jsonb default '[]', p_schema int default 1,
  p_extra jsonb default '{}')
returns jsonb language sql immutable as $$
  select jsonb_build_object('lote_id', p_lote, 'hogar_id', '77777777-7777-4777-8777-000000000001'::uuid,
    'schema_version', p_schema, 'filas', jsonb_build_object('compra', p_compras,
      'plan_de_cuotas', p_planes, 'cuota', p_cuotas, 'costo_financiero', p_costos,
      'alias_comercio', p_alias) || p_extra);
$$;

-- Ejecuta el lote guardado como el actor y guarda el resultado. sync_push deja
-- la transacción en modo inmediato: el archivo vuelve a diferir.
create function pg_temp.push(p_caso text, p_actor text default 'ana', p_lote text default null)
returns void language plpgsql as $$
declare v_usuario uuid;
begin
  v_usuario := case p_actor when 'beto' then '77777777-7777-4777-8777-00000000b102'::uuid
                             when 'caro' then '77777777-7777-4777-8777-00000000c103'::uuid
                             else '77777777-7777-4777-8777-00000000a101'::uuid end;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.prueba_sync (caso, resultado)
  select p_caso, public.sync_push(lote) from public.prueba_lote where caso = coalesce(p_lote, p_caso);
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

-- Lotes. C1/C3/C4 comparten lote_id; C2 intenta forjar autoría y seq.
insert into public.prueba_lote values
  ('c1', pg_temp.lote(pg_temp.fid('0109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0101'), 85000)))),
  ('c4', pg_temp.lote(pg_temp.fid('0109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0401'), 42000)))),
  ('c2', pg_temp.lote(pg_temp.fid('0209'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0201'), 15000,
    p_extra => jsonb_build_object('registrado_por', '77777777-7777-4777-8777-000000000102',
      'actualizado_por', '77777777-7777-4777-8777-000000000102', 'seq', 999)))));

-- C5: compra a cuotas con la tasa del pasivo y el interés en su propio balde.
insert into public.prueba_lote values
  ('c5', pg_temp.lote(pg_temp.fid('0509'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0501'), 300000, 'financiado', p_medio => null)),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('0502'), 300000, p_compra => pg_temp.fid('0501'), p_n => 3, p_tasa_tipo => 'EA', p_tasa_ppm => 283200)),
    pg_temp.cuotas(pg_temp.fid('0502'), array[100000, 100000, 100000]::bigint[], array[pg_temp.fid('0503'), pg_temp.fid('0504'), pg_temp.fid('0505')]::uuid[]),
    jsonb_build_array(pg_temp.costo(pg_temp.fid('0506'), 6299, '2026-12-25', p_cuota => pg_temp.fid('0503')),
      pg_temp.costo(pg_temp.fid('0507'), 4199, '2027-01-25', p_cuota => pg_temp.fid('0504')),
      pg_temp.costo(pg_temp.fid('0508'), 2100, '2027-02-25', p_cuota => pg_temp.fid('0505')))));

-- C6: 6a cuotas suman 299999 · 6b plan capitaliza 250000 · 6c financiada sin plan ·
-- 6d contado con plan · 6e tasa que el pasivo no tiene · 6f costo 'mora' ·
-- 6g plan desembolso · 6h dos compras · 6i tabla no admitida · 6j monto decimal ·
-- 6k monto cero · 6l IVA mayor que el total.
insert into public.prueba_lote values
  ('c6a', pg_temp.lote(pg_temp.fid('0a09'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0a01'), 300000, 'financiado', p_medio => null)),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('0a02'), 300000, p_compra => pg_temp.fid('0a01'), p_n => 3, p_tasa_tipo => 'EA', p_tasa_ppm => 283200)),
    pg_temp.cuotas(pg_temp.fid('0a02'), array[100000, 100000, 99999]::bigint[]))),
  ('c6b', pg_temp.lote(pg_temp.fid('0b09'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0b01'), 300000, 'financiado', p_medio => null)),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('0b02'), 250000, p_compra => pg_temp.fid('0b01'), p_n => 3, p_tasa_tipo => 'EA', p_tasa_ppm => 283200)),
    pg_temp.cuotas(pg_temp.fid('0b02'), array[100000, 100000, 50000]::bigint[]))),
  ('c6c', pg_temp.lote(pg_temp.fid('0c09'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0c01'), 300000, 'financiado', p_medio => null)))),
  ('c6d', pg_temp.lote(pg_temp.fid('0d09'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0d01'), 85000)),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('0d02'), 85000, p_compra => pg_temp.fid('0d01'), p_n => 3, p_tasa_tipo => 'EA', p_tasa_ppm => 283200)),
    pg_temp.cuotas(pg_temp.fid('0d02'), array[28334, 28333, 28333]::bigint[]))),
  ('c6e', pg_temp.lote(pg_temp.fid('0e09'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0e01'), 100000, 'financiado',
      p_ambito => 'personal', p_miembro => pg_temp.fx('101'), p_medio => null, p_fecha => '2026-11-24')),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('0e02'), 100000, p_pasivo => '77777777-7777-4777-8777-000000000402',
      p_compra => pg_temp.fid('0e01'), p_tasa_tipo => 'EA', p_tasa_ppm => 283200, p_fecha => '2026-11-24')),
    pg_temp.cuotas(pg_temp.fid('0e02'), array[100000]::bigint[]))),
  ('c6f', pg_temp.lote(pg_temp.fid('0f09'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0f01'), 300000, 'financiado', p_medio => null)),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('0f02'), 300000, p_compra => pg_temp.fid('0f01'), p_n => 3, p_tasa_tipo => 'EA', p_tasa_ppm => 283200)),
    pg_temp.cuotas(pg_temp.fid('0f02'), array[100000, 100000, 100000]::bigint[], array[pg_temp.fid('0f03'), null, null]::uuid[]),
    jsonb_build_array(pg_temp.costo(pg_temp.fid('0f06'), 6299, '2026-12-25', p_cuota => pg_temp.fid('0f03'), p_tipo => 'mora')))),
  ('c6g', pg_temp.lote(pg_temp.fid('1009'), jsonb_build_array(pg_temp.compra(pg_temp.fid('1001'), 300000, 'financiado', p_medio => null)),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('1002'), 300000, p_origen => 'desembolso', p_sistema => 'sin_calendario', p_n => null, p_primera => null)))),
  ('c6h', pg_temp.lote(pg_temp.fid('1109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('1101'), 10000), pg_temp.compra(pg_temp.fid('1102'), 20000)))),
  ('c6i', pg_temp.lote(pg_temp.fid('1209'), jsonb_build_array(pg_temp.compra(pg_temp.fid('1201'), 10000)), p_extra => '{"pasivo": []}'::jsonb)),
  ('c6j', pg_temp.lote(pg_temp.fid('1309'), jsonb_build_array(jsonb_build_object('id', pg_temp.fid('1301'),
    'fecha', '2026-11-22'::date, 'descripcion', 'Compra con decimales', 'monto_total', 85000.5,
    'categoria_id', '77777777-7777-4777-8777-000000000201'::uuid, 'ambito', 'hogar', 'pago_tipo', 'contado',
    'medio_de_pago_id', '77777777-7777-4777-8777-000000000301'::uuid, 'origen', 'manual')))),
  ('c6k', pg_temp.lote(pg_temp.fid('1409'), jsonb_build_array(pg_temp.compra(pg_temp.fid('1401'), 0)))),
  ('c6l', pg_temp.lote(pg_temp.fid('1509'), jsonb_build_array(pg_temp.compra(pg_temp.fid('1501'), 85000, p_cufe => repeat('e', 96), p_iva => 90000))));

-- C7 y C8: compras personales de Ana.
insert into public.prueba_lote values
  ('c7', pg_temp.lote(pg_temp.fid('2009'), jsonb_build_array(pg_temp.compra(pg_temp.fid('2001'), 100000, 'financiado',
      p_ambito => 'personal', p_miembro => pg_temp.fx('101'), p_medio => null, p_fecha => '2026-11-24')),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('2002'), 100000, p_pasivo => '77777777-7777-4777-8777-000000000402',
      p_compra => pg_temp.fid('2001'), p_fecha => '2026-11-24')),
    pg_temp.cuotas(pg_temp.fid('2002'), array[100000]::bigint[]))),
  ('c8', pg_temp.lote(pg_temp.fid('2109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('2101'), 20000,
      p_ambito => 'personal', p_miembro => '77777777-7777-4777-8777-000000000102', p_fecha => '2026-11-24'))));

-- C9: compra del hogar financiada en el libro personal de Ana.
insert into public.prueba_lote values
  ('c9', pg_temp.lote(pg_temp.fid('2209'), jsonb_build_array(pg_temp.compra(pg_temp.fid('2201'), 100000, 'financiado', p_medio => null, p_fecha => '2026-11-24')),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('2202'), 100000, p_pasivo => '77777777-7777-4777-8777-000000000402',
      p_compra => pg_temp.fid('2201'), p_fecha => '2026-11-24')),
    pg_temp.cuotas(pg_temp.fid('2202'), array[100000]::bigint[])));

-- C16: sync_push v1 solo admite altas: una fila con base_seq se rechaza.
insert into public.prueba_lote values
  ('c16', pg_temp.lote(pg_temp.fid('7109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('7101'), 85000,
      p_extra => jsonb_build_object('base_seq', 5)))));

-- C17: el lote tiene tope de cuotas (360, como el dominio) para no retener carriles.
insert into public.prueba_lote values
  ('c17', pg_temp.lote(pg_temp.fid('7209'), jsonb_build_array(pg_temp.compra(pg_temp.fid('7201'), 361, 'financiado', p_medio => null)),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('7202'), 361, p_compra => pg_temp.fid('7201'), p_n => 361, p_tasa_tipo => 'EA', p_tasa_ppm => 283200)),
    pg_temp.cuotas(pg_temp.fid('7202'), array_fill(1::bigint, array[361]))));

-- C24: el tope del lote admite justo el máximo del dominio: 360 cuotas y
-- 360 costos, con un plan que cuadra (capital 360 en cuotas de 1).
with s as materialized (
  select pg_temp.cuotas(pg_temp.fid('7902'), array_fill(1::bigint, array[360])) as cuotas
)
insert into public.prueba_lote
select 'c24', pg_temp.lote(pg_temp.fid('7909'),
  jsonb_build_array(pg_temp.compra(pg_temp.fid('7901'), 360, 'financiado', p_medio => null)),
  jsonb_build_array(pg_temp.plan(pg_temp.fid('7902'), 360, p_compra => pg_temp.fid('7901'), p_n => 360, p_tasa_tipo => 'EA', p_tasa_ppm => 283200)),
  s.cuotas, (select jsonb_agg(pg_temp.costo(gen_random_uuid(), 100, (q ->> 'fecha_vencimiento')::date,
    p_cuota => (q ->> 'id')::uuid)) from jsonb_array_elements(s.cuotas) q))
from s;

-- C25: dos planes en el mismo lote; la compra lleva como máximo uno.
insert into public.prueba_lote values
  ('c25', pg_temp.lote(pg_temp.fid('8009'),
    jsonb_build_array(pg_temp.compra(pg_temp.fid('8001'), 2, 'financiado', p_medio => null)),
    jsonb_build_array(
      pg_temp.plan(pg_temp.fid('8002'), 1, p_compra => pg_temp.fid('8001'), p_n => 1, p_tasa_tipo => 'EA', p_tasa_ppm => 283200),
      pg_temp.plan(pg_temp.fid('8003'), 1, p_compra => pg_temp.fid('8001'), p_n => 1, p_tasa_tipo => 'EA', p_tasa_ppm => 283200)),
    pg_temp.cuotas(pg_temp.fid('8002'), array[1]::bigint[], array[pg_temp.fid('8004')]::uuid[])
      || pg_temp.cuotas(pg_temp.fid('8003'), array[1]::bigint[], array[pg_temp.fid('8005')]::uuid[])));

-- C26: dos alias de comercio en el mismo lote, con NIT distintos para no
-- chocar con el índice del hogar: el dominio emite como máximo uno.
insert into public.prueba_lote values
  ('c26', pg_temp.lote(pg_temp.fid('8109'),
    jsonb_build_array(pg_temp.compra(pg_temp.fid('8101'), 10000, p_nit => '901123456')),
    p_alias => jsonb_build_array(
      pg_temp.alias(pg_temp.fid('810b'), '901123456', 'Almacén Nuevo', pg_temp.fx('201')),
      pg_temp.alias(pg_temp.fid('810c'), '900123456', 'Tienda Nueva', pg_temp.fx('201')))));

-- C10: Beto planea su compra personal sobre el libro de Ana y, con los mismos
-- ids, sobre un pasivo inexistente.
insert into public.prueba_lote values
  ('c10_ajeno', pg_temp.lote(pg_temp.fid('2309'), jsonb_build_array(pg_temp.compra(pg_temp.fid('2301'), 50000, 'financiado',
      p_ambito => 'personal', p_miembro => '77777777-7777-4777-8777-000000000102', p_medio => null,
      p_financiada => '77777777-7777-4777-8777-000000000402', p_fecha => '2026-11-24')),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('2302'), 50000, p_pasivo => '77777777-7777-4777-8777-000000000402',
      p_compra => pg_temp.fid('2301'), p_fecha => '2026-11-24')),
    pg_temp.cuotas(pg_temp.fid('2302'), array[50000]::bigint[]))),
  ('c10_inexistente', pg_temp.lote(pg_temp.fid('2409'), jsonb_build_array(pg_temp.compra(pg_temp.fid('2301'), 50000, 'financiado',
      p_ambito => 'personal', p_miembro => '77777777-7777-4777-8777-000000000102', p_medio => null,
      p_financiada => pg_temp.fid('dead'), p_fecha => '2026-11-24')),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('2302'), 50000, p_pasivo => pg_temp.fid('dead'),
      p_compra => pg_temp.fid('2301'), p_fecha => '2026-11-24')),
    pg_temp.cuotas(pg_temp.fid('2302'), array[50000]::bigint[])));

-- C11: préstamo en efectivo (I19): solo se gastan los 100000 desembolsados.
insert into public.prueba_lote values
  ('c11a', pg_temp.lote(pg_temp.fid('3009'), jsonb_build_array(pg_temp.compra(pg_temp.fid('3001'), 60000, p_medio => null, p_financiada => '77777777-7777-4777-8777-000000000403', p_fecha => '2026-11-20')))),
  ('c11b', pg_temp.lote(pg_temp.fid('3109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('3101'), 41000, p_medio => null, p_financiada => '77777777-7777-4777-8777-000000000403', p_fecha => '2026-11-21')))),
  ('c11c', pg_temp.lote(pg_temp.fid('3209'), jsonb_build_array(pg_temp.compra(pg_temp.fid('3201'), 40000, p_medio => null, p_financiada => '77777777-7777-4777-8777-000000000403', p_fecha => '2026-11-21')))),
  ('c11d', pg_temp.lote(pg_temp.fid('3309'), jsonb_build_array(pg_temp.compra(pg_temp.fid('3301'), 1000, p_medio => null, p_financiada => '77777777-7777-4777-8777-000000000403', p_fecha => '2026-11-05'))));

-- C12: préstamos y tarjetas como origen de fondos.
insert into public.prueba_lote values
  ('c12a', pg_temp.lote(pg_temp.fid('4009'), jsonb_build_array(pg_temp.compra(pg_temp.fid('4001'), 50000, p_medio => null, p_financiada => '77777777-7777-4777-8777-000000000404')))),
  ('c12b', pg_temp.lote(pg_temp.fid('4109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('4101'), 30000, p_ambito => 'personal', p_miembro => '77777777-7777-4777-8777-000000000102', p_medio => null, p_financiada => '77777777-7777-4777-8777-000000000404')))),
  ('c12c', pg_temp.lote(pg_temp.fid('4209'), jsonb_build_array(pg_temp.compra(pg_temp.fid('4201'), 20000, p_medio => null, p_financiada => '77777777-7777-4777-8777-000000000404')))),
  ('c12d', pg_temp.lote(pg_temp.fid('4309'), jsonb_build_array(pg_temp.compra(pg_temp.fid('4301'), 20000, p_medio => null, p_financiada => '77777777-7777-4777-8777-000000000401'))));

-- C13: el CUFE solo choca dentro de su alcance de visibilidad.
insert into public.prueba_lote values
  ('c13a', pg_temp.lote(pg_temp.fid('5009'), jsonb_build_array(pg_temp.compra(pg_temp.fid('5001'), 10000, p_cufe => repeat('c', 96))))),
  ('c13b', pg_temp.lote(pg_temp.fid('5109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('5101'), 20000, p_cufe => repeat('c', 96))))),
  ('c13c', pg_temp.lote(pg_temp.fid('5209'), jsonb_build_array(pg_temp.compra(pg_temp.fid('5201'), 30000, p_ambito => 'personal', p_miembro => pg_temp.fx('101'), p_cufe => repeat('d', 96))))),
  ('c13d', pg_temp.lote(pg_temp.fid('5309'), jsonb_build_array(pg_temp.compra(pg_temp.fid('5301'), 40000, p_ambito => 'personal', p_miembro => '77777777-7777-4777-8777-000000000102', p_cufe => repeat('d', 96))))),
  ('c13e', pg_temp.lote(pg_temp.fid('5409'), jsonb_build_array(pg_temp.compra(pg_temp.fid('5401'), 50000, p_cufe => repeat('d', 96))))),
  ('c13f', pg_temp.lote(pg_temp.fid('5509'), jsonb_build_array(pg_temp.compra(pg_temp.fid('5501'), 60000, p_ambito => 'personal', p_miembro => pg_temp.fx('101'), p_cufe => repeat('d', 96)))));

-- C14: alias de comercio (I23).
insert into public.prueba_lote values
  ('c14a', pg_temp.lote(pg_temp.fid('6009'), jsonb_build_array(pg_temp.compra(pg_temp.fid('6001'), 10000, p_ambito => 'personal', p_miembro => pg_temp.fx('101'), p_nit => '890900608')),
    p_alias => jsonb_build_array(pg_temp.alias(pg_temp.fid('600b'), '890900608', 'Almacenes Éxito', '77777777-7777-4777-8777-000000000201')))),
  ('c14b', pg_temp.lote(pg_temp.fid('6109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('6101'), 10000, p_nit => '890900608')),
    p_alias => jsonb_build_array(pg_temp.alias(pg_temp.fid('610b'), '890900608', 'Almacenes Éxito', '77777777-7777-4777-8777-000000000201')))),
  ('c14c', pg_temp.lote(pg_temp.fid('6209'), jsonb_build_array(pg_temp.compra(pg_temp.fid('6201'), 10000, p_nit => '890900608')),
    p_alias => jsonb_build_array(pg_temp.alias(pg_temp.fid('620b'), '890900608', 'Almacenes Éxito', '77777777-7777-4777-8777-000000000201'))));

-- C15: autorización y versión del esquema.
insert into public.prueba_lote values
  ('c15a', pg_temp.lote(pg_temp.fid('7009'), jsonb_build_array(pg_temp.compra(pg_temp.fid('7001'), 10000)))),
  ('c15b', pg_temp.lote(pg_temp.fid('7109'), jsonb_build_array(pg_temp.compra(pg_temp.fid('7101'), 10000)), p_schema => 2)),
  ('c15c', pg_temp.lote(pg_temp.fid('7209'), jsonb_build_array(pg_temp.compra(pg_temp.fid('7201'), 10000))));

-- C1: contado del hogar, una vez y con la autoría del actor.
insert into public.prueba_contador values ('hogar_c1', (select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1')));
select pg_temp.push('c1');
select is(pg_temp.estado('c1'), 'aplicado', 'C1: el contado del hogar se aplica');
select is((select registrado_por from public.compra where id = pg_temp.fid('0101')), pg_temp.fx('101'), 'C1: registrado_por sale del actor');
select is((select actualizado_por from public.compra where id = pg_temp.fid('0101')), pg_temp.fx('101'), 'C1: actualizado_por sale del actor');
select is(pg_temp.filas('plan_de_cuotas', 'compra_id', pg_temp.fid('0101')), 0, 'C1: una compra de contado no crea plan');
select ok((select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1')) > (select valor from public.prueba_contador where nombre = 'hogar_c1'), 'C1: la compra del hogar numera el carril del hogar');

-- C2: el servidor ignora autoría y `seq` del cuerpo.
select pg_temp.push('c2');
select is(pg_temp.estado('c2'), 'aplicado', 'C2: el lote con campos forjados se aplica');
select is((select registrado_por from public.compra where id = pg_temp.fid('0201')), pg_temp.fx('101'), 'C2: un registrado_por forjado se ignora');
select is((select actualizado_por from public.compra where id = pg_temp.fid('0201')), pg_temp.fx('101'), 'C2: un actualizado_por forjado se ignora');
select ok((select seq from public.compra where id = pg_temp.fid('0201')) <> 999, 'C2: un seq forjado se ignora');

-- C3: reintento del mismo autor con el mismo lote_id.
select pg_temp.push('c3', p_lote => 'c1');
select is(pg_temp.estado('c3'), 'aplicado', 'C3: el reintento devuelve el resultado guardado');
select is(pg_temp.res('c3'), pg_temp.res('c1'), 'C3: el reintento devuelve el mismo resultado');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('0101')), 1, 'C3: el reintento no duplica la compra');

-- C4: el mismo lote_id de otro autor es otro lote.
select pg_temp.push('c4', 'beto');
select is(pg_temp.estado('c4'), 'aplicado', 'C4: el lote_id de Ana no bloquea el de Beto');
select ok(pg_temp.res('c4') <> pg_temp.res('c1'), 'C4: Beto recibe su propio resultado');
select is((select registrado_por from public.compra where id = pg_temp.fid('0401')), pg_temp.fx('102'), 'C4: la compra de Beto queda con su autoría');

-- C5: cuotas sin doble conteo (I2, I3, I4).
select pg_temp.push('c5');
select is(pg_temp.estado('c5'), 'aplicado', 'C5: la compra a cuotas se aplica');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('0501')), 1, 'C5: queda una sola compra');
select is(pg_temp.filas('plan_de_cuotas', 'compra_id', pg_temp.fid('0501')), 1, 'C5: queda un solo plan para la compra');
select is(pg_temp.filas('cuota', 'plan_id', pg_temp.fid('0502')), 3, 'C5: quedan tres cuotas');
select is(pg_temp.filas('costo_financiero', 'pasivo_id', pg_temp.fx('401')), 3, 'C5: quedan tres intereses, uno por cuota');
select is((select sum(capital)::bigint from public.cuota where plan_id = pg_temp.fid('0502')), 300000::bigint, 'C5: las cuotas suman el capital del plan');
select is((select monto_total from public.compra where id = pg_temp.fid('0501')), 300000::bigint, 'C5: el consumo se registra una sola vez por su total');
select is((select sum(monto)::bigint from public.costo_financiero where pasivo_id = pg_temp.fx('401') and cuota_id is not null), 12598::bigint, 'C5: el interés vive en el balde de costo financiero');

-- C6: un lote inválido se rechaza completo y sin filas.
select pg_temp.push(caso) from unnest(array['c6a', 'c6b', 'c6c', 'c6d', 'c6e', 'c6f', 'c6g', 'c6h', 'c6i', 'c6j', 'c6k', 'c6l']) caso;
select is(pg_temp.estado('c6a'), 'rechazado', 'C6a: las cuotas que no suman el capital se rechazan');
select is(pg_temp.motivo('c6a'), 'invalido', 'C6a: el motivo es invalido');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('0a01')), 0, 'C6a: el rechazo no deja compra');
select is(pg_temp.motivo('c6b'), 'invalido', 'C6b: un plan que no capitaliza el total se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('0b01')), 0, 'C6b: el rechazo no deja compra');
select is(pg_temp.motivo('c6c'), 'invalido', 'C6c: una compra financiada sin plan se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('0c01')), 0, 'C6c: el rechazo no deja compra');
select is(pg_temp.motivo('c6d'), 'invalido', 'C6d: una compra de contado con plan se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('0d01')), 0, 'C6d: el rechazo no deja compra');
select is(pg_temp.motivo('c6e'), 'invalido', 'C6e: un plan con tasa distinta a la del pasivo se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('0e01')), 0, 'C6e: el rechazo no deja compra');
select is(pg_temp.motivo('c6f'), 'invalido', 'C6f: un costo que no es interés calculado se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('0f01')), 0, 'C6f: el rechazo no deja compra');
select is(pg_temp.motivo('c6g'), 'invalido', 'C6g: un plan de desembolso en el lote se rechaza');
select is(pg_temp.filas('plan_de_cuotas', 'id', pg_temp.fid('1002')), 0, 'C6g: el rechazo no deja plan');
select is(pg_temp.motivo('c6h'), 'invalido', 'C6h: un lote con dos compras se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('1101')) + pg_temp.filas('compra', 'id', pg_temp.fid('1102')), 0, 'C6h: el rechazo no deja ninguna de las dos compras');
select is(pg_temp.motivo('c6i'), 'invalido', 'C6i: una tabla no admitida en el lote se rechaza');
select is(pg_temp.detalle('c6i'), 'tabla no admitida: pasivo', 'C6i: el detalle nombra la tabla');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('1201')), 0, 'C6i: el rechazo no deja compra');
select is(pg_temp.motivo('c6j'), 'invalido', 'C6j: un monto con decimales se rechaza (I1)');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('1301')), 0, 'C6j: el rechazo no deja compra');
select is(pg_temp.motivo('c6k'), 'invalido', 'C6k: una compra de monto cero se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('1401')), 0, 'C6k: el rechazo no deja compra');
select is(pg_temp.motivo('c6l'), 'invalido', 'C6l: un IVA mayor que el total se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('1501')), 0, 'C6l: el rechazo no deja compra');

-- C7 y C8: compras personales.
insert into public.prueba_contador values
  ('hogar_c7', (select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1'))),
  ('personal_c7', (select ultimo_seq from public.personal_seq where hogar_id = pg_temp.fx('1') and miembro_id = pg_temp.fx('101')));
select pg_temp.push(caso) from unnest(array['c7', 'c8']) caso;
select is(pg_temp.estado('c7'), 'aplicado', 'C7: la compra personal con su plan se aplica');
select is((select miembro_id from public.compra where id = pg_temp.fid('2001')), pg_temp.fx('101'), 'C7: la compra personal queda con su dueño');
select is((select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1')), (select valor from public.prueba_contador where nombre = 'hogar_c7'), 'C7: un lote personal no mueve hogar_seq (I25)');
select ok((select ultimo_seq from public.personal_seq where hogar_id = pg_temp.fx('1') and miembro_id = pg_temp.fx('101')) > (select valor from public.prueba_contador where nombre = 'personal_c7'), 'C7: un lote personal numera el carril de su dueño');
select is(pg_temp.motivo('c8'), 'no_autorizado', 'C8: una compra personal a nombre de otro miembro no se autoriza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('2101')), 0, 'C8: el rechazo no deja compra');

-- C9 y C10: libros personales ajenos.
select pg_temp.push('c9');
select is(pg_temp.motivo('c9'), 'invalido', 'C9: una compra del hogar no se financia en un libro personal');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('2201')), 0, 'C9: el rechazo no deja compra');

select pg_temp.push('c10_ajeno', 'beto');
select pg_temp.push('c10_inexistente', 'beto');
select is(pg_temp.motivo('c10_ajeno'), 'invalido', 'C10: un plan sobre un libro personal ajeno se rechaza');
select is(pg_temp.detalle('c10_ajeno'), 'pasivo inexistente', 'C10: un libro ajeno se trata como inexistente');
select is(pg_temp.res('c10_ajeno'), pg_temp.res('c10_inexistente'), 'C10: libro ajeno e inexistente dan el mismo resultado completo');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('2301')), 0, 'C10: el rechazo no deja compra');

select pg_temp.push('c16');
select is(pg_temp.motivo('c16'), 'invalido', 'C16: una fila con base_seq no es un alta y se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('7101')), 0, 'C16: el rechazo no deja compra');

-- C18: guardas de forma del lote (todas 'invalido', sin filas).
insert into public.prueba_lote values
  ('c18_array', '[]'::jsonb),
  ('c18_sin_filas', jsonb_build_object('lote_id', pg_temp.fid('7309'), 'hogar_id', pg_temp.fx('1'), 'schema_version', 1)),
  ('c18_uuid', jsonb_build_object('lote_id', 'no-es-uuid', 'hogar_id', pg_temp.fx('1'), 'schema_version', 1, 'filas', '{}'::jsonb)),
  ('c18_vacio', pg_temp.lote(pg_temp.fid('7409'), '[]'::jsonb));
select pg_temp.push('c18_array');
select pg_temp.push('c18_sin_filas');
select pg_temp.push('c18_uuid');
select pg_temp.push('c18_vacio');
select is(pg_temp.detalle('c18_array'), 'forma del lote', 'C18: un lote que no es objeto se rechaza');
select is(pg_temp.detalle('c18_sin_filas'), 'forma del lote', 'C18: un lote sin filas se rechaza');
select is(pg_temp.detalle('c18_uuid'), 'identificadores del lote', 'C18: un lote_id que no es UUID se rechaza');
select is(pg_temp.detalle('c18_vacio'), 'un lote lleva exactamente una compra', 'C18: un lote sin compra se rechaza');

-- C19: un valor no escalar donde va un monto es 'invalido', no un error de RPC
-- que dejaría el lote reintentándose para siempre.
insert into public.prueba_lote values
  ('c19', pg_temp.lote(pg_temp.fid('7509'), jsonb_build_array(pg_temp.compra(pg_temp.fid('7501'), 85000,
      p_extra => jsonb_build_object('monto_total', jsonb_build_object('valor', 85000), 'fecha', jsonb_build_array(1))))));
select pg_temp.push('c19');
select is(pg_temp.motivo('c19'), 'invalido', 'C19: un monto no escalar se rechaza como invalido');

-- C20: sync_push no deja la transacción del invocador en modo inmediato.
select set_config('request.jwt.claims', jsonb_build_object('sub', '77777777-7777-4777-8777-00000000a101', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.sync_push(pg_temp.lote(pg_temp.fid('7609'), jsonb_build_array(pg_temp.compra(pg_temp.fid('7601'), 1000))));
reset role;
savepoint c20;
select lives_ok($$insert into public.compra (id, hogar_id, fecha, descripcion, monto_total, categoria_id, pago_tipo, registrado_por, actualizado_por)
  values ('77777777-7777-4777-8777-760200000000', '77777777-7777-4777-8777-000000000001', '2026-11-22', 'x', 1000,
          '77777777-7777-4777-8777-000000000201', 'financiado', '77777777-7777-4777-8777-000000000101', '77777777-7777-4777-8777-000000000101')$$,
  'C20: tras sync_push las reglas entre filas siguen diferidas en la transacción');
rollback to savepoint c20;

-- C21: contrato de la respuesta: una entrada por fila insertada, con su tabla
-- y el seq que quedó guardado.
select is((select jsonb_array_length(pg_temp.res('c5') -> 'filas')), 8, 'C21: la respuesta lista compra, plan, 3 cuotas y 3 costos');
select is((select array_agg(distinct f ->> 'tabla' order by f ->> 'tabla') from jsonb_array_elements(pg_temp.res('c5') -> 'filas') f),
  array['compra', 'costo_financiero', 'cuota', 'plan_de_cuotas'], 'C21: la respuesta nombra las tablas canónicas');
select is((select count(*)::int from jsonb_array_elements(pg_temp.res('c5') -> 'filas') f
            join public.compra c on c.id = (f ->> 'id')::uuid and c.seq = (f ->> 'seq')::bigint), 1,
  'C21: el seq de la compra en la respuesta es el guardado');

-- C22: un lote rechazado no deja resultado guardado y otra compra con un id ya
-- usado, aunque venga en otro lote, choca y no se cuenta dos veces.
select is((select count(*)::int from public.lote_aplicado where lote_id = pg_temp.fid('7109')), 0, 'C22: un lote rechazado no queda en lote_aplicado');
insert into public.prueba_lote values
  ('c22', pg_temp.lote(pg_temp.fid('7709'), jsonb_build_array(pg_temp.compra(pg_temp.fid('0101'), 85000))));
select pg_temp.push('c22');
select is(pg_temp.motivo('c22'), 'duplicado', 'C22: la misma compra en otro lote_id es duplicado');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('0101')), 1, 'C22: la compra sigue contada una sola vez');

-- C23: el interés calculado es una estimación del cliente (decisión de Santiago,
-- PR #4): se guarda como llega aunque no coincida con E.A.→M.V. y se edita en
-- Obligaciones. En 1 cuota de $100.000 al 28,32 % E.A. la cuenta daría $2.100.
insert into public.prueba_lote values
  ('c23', pg_temp.lote(pg_temp.fid('7809'), jsonb_build_array(pg_temp.compra(pg_temp.fid('7801'), 100000, 'financiado', p_medio => null)),
    jsonb_build_array(pg_temp.plan(pg_temp.fid('7802'), 100000, p_compra => pg_temp.fid('7801'), p_n => 1, p_tasa_tipo => 'EA', p_tasa_ppm => 283200)),
    pg_temp.cuotas(pg_temp.fid('7802'), array[100000]::bigint[], array[pg_temp.fid('7803')]::uuid[]),
    jsonb_build_array(pg_temp.costo(pg_temp.fid('7806'), 1500, '2026-12-25', p_cuota => pg_temp.fid('7803')))));
select pg_temp.push('c23');
select is(pg_temp.estado('c23'), 'aplicado', 'C23: el servidor acepta el interés estimado por el cliente');
select is((select monto from public.costo_financiero where id = pg_temp.fid('7806') and origen = 'calculado'), 1500::bigint,
  'C23: el interés se guarda tal como llegó, con origen calculado');

-- C24: el tope admite exactamente 360 cuotas y 360 costos.
select pg_temp.push('c24');
select is(pg_temp.estado('c24'), 'aplicado', 'C24: un lote con 360 cuotas y 360 costos se aplica');
select is(pg_temp.filas('cuota', 'plan_id', pg_temp.fid('7902')), 360, 'C24: quedan las 360 cuotas del plan');
select is((select count(*)::int from public.costo_financiero k
            join public.cuota c on c.id = k.cuota_id
           where c.plan_id = pg_temp.fid('7902')), 360, 'C24: quedan los 360 costos, uno por cuota');

-- C25: dos planes en el lote tienen su propio mensaje.
insert into public.prueba_contador values ('hogar_c25', (select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1')));
select pg_temp.push('c25');
select is(pg_temp.res('c25'), '{"estado":"rechazado","motivo":"invalido","detalle":"un lote lleva como máximo un plan de cuotas"}'::jsonb,
  'C25: dos planes se rechazan con el detalle del tope de planes');
select is(pg_temp.filas('plan_de_cuotas', 'compra_id', pg_temp.fid('8001')), 0, 'C25: el rechazo no deja planes');
select is((select count(*)::int from public.cuota where plan_id in (pg_temp.fid('8002'), pg_temp.fid('8003'))), 0, 'C25: el rechazo no deja cuotas');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('8001')), 0, 'C25: el rechazo no deja compra');
select is(pg_temp.filas('lote_aplicado', 'lote_id', pg_temp.fid('8009')), 0, 'C25: el rechazo no deja lote aplicado');
select is((select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1')), (select valor from public.prueba_contador where nombre = 'hogar_c25'), 'C25: el rechazo no mueve hogar_seq');

-- C26: dos alias de comercio en el lote tienen su propio mensaje.
insert into public.prueba_contador values ('hogar_c26', (select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1')));
select pg_temp.push('c26');
select is(pg_temp.res('c26'), '{"estado":"rechazado","motivo":"invalido","detalle":"un lote lleva como máximo un alias de comercio"}'::jsonb,
  'C26: dos alias se rechazan con el detalle del tope de alias');
select is(pg_temp.filas('alias_comercio', 'id', pg_temp.fid('810b')), 0, 'C26: el rechazo no deja el primer alias');
select is(pg_temp.filas('alias_comercio', 'id', pg_temp.fid('810c')), 0, 'C26: el rechazo no deja el segundo alias');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('8101')), 0, 'C26: el rechazo no deja compra');
select is(pg_temp.filas('lote_aplicado', 'lote_id', pg_temp.fid('8109')), 0, 'C26: el rechazo no deja lote aplicado');
select is((select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1')), (select valor from public.prueba_contador where nombre = 'hogar_c26'), 'C26: el rechazo no mueve hogar_seq');

select pg_temp.push('c17');
select is(pg_temp.detalle('c17'), 'demasiadas cuotas en el lote', 'C17: más de 360 cuotas se rechaza antes de tomar locks');

-- C11: el préstamo no crea plan y no gasta más de lo desembolsado.
select pg_temp.push(caso) from unnest(array['c11a', 'c11b', 'c11c', 'c11d']) caso;
select is(pg_temp.estado('c11a'), 'aplicado', 'C11: la compra dentro del desembolso se aplica');
select is(pg_temp.filas('plan_de_cuotas', 'compra_id', pg_temp.fid('3001')), 0, 'C11: una compra financiada por desembolso no crea plan');
select is(pg_temp.motivo('c11b'), 'invalido', 'C11: la compra que excede el desembolso se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('3101')), 0, 'C11: el rechazo no deja compra');
select is(pg_temp.estado('c11c'), 'aplicado', 'C11: la compra que completa el desembolso se aplica');
select is((select sum(monto_total)::bigint from public.compra where financiada_por_pasivo_id = pg_temp.fx('403')), 100000::bigint, 'C11: el préstamo gasta exactamente lo desembolsado');
select is(pg_temp.motivo('c11d'), 'invalido', 'C11: una compra anterior al giro se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('3301')), 0, 'C11: el rechazo no deja compra');

-- C12: ámbito y tipo del pasivo que financia la compra.
select pg_temp.push('c12a');
select is(pg_temp.motivo('c12a'), 'invalido', 'C12: un libro personal invisible para Ana se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('4001')), 0, 'C12: el rechazo no deja compra');

select pg_temp.push(caso, 'beto') from unnest(array['c12b', 'c12c']) caso;
select is(pg_temp.estado('c12b'), 'aplicado', 'C12: el dueño financia su compra personal con su crédito');
select is((select miembro_id from public.compra where id = pg_temp.fid('4101')), pg_temp.fx('102'), 'C12: la compra financiada queda en el libro de Beto');
select is(pg_temp.motivo('c12c'), 'invalido', 'C12: una compra del hogar contra un libro personal se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('4201')), 0, 'C12: el rechazo no deja compra');

select pg_temp.push('c12d');
select is(pg_temp.motivo('c12d'), 'invalido', 'C12: una tarjeta no financia compras como préstamo');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('4301')), 0, 'C12: el rechazo no deja compra');

-- C13: el CUFE solo choca dentro de su alcance de visibilidad.
select pg_temp.push(caso) from unnest(array['c13a', 'c13c']) caso;
select pg_temp.push(caso, 'beto') from unnest(array['c13b', 'c13d', 'c13e']) caso;
select pg_temp.push('c13f');
select is(pg_temp.estado('c13a'), 'aplicado', 'C13: una compra del hogar con CUFE se aplica');
select is(pg_temp.motivo('c13b'), 'duplicado', 'C13: el mismo CUFE del hogar se rechaza');
select is(pg_temp.detalle('c13b'), 'compra_cufe_hogar_key', 'C13: el detalle nombra el índice del hogar');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('5101')), 0, 'C13: el rechazo no deja compra');
select is(pg_temp.estado('c13c'), 'aplicado', 'C13: una compra personal con CUFE se aplica');
select is(pg_temp.estado('c13d'), 'aplicado', 'C13: el mismo CUFE en la personal de otro dueño no choca');
select is(pg_temp.estado('c13e'), 'aplicado', 'C13: el mismo CUFE en una compra del hogar no choca');
select is(pg_temp.motivo('c13f'), 'duplicado', 'C13: el mismo CUFE en dos personales de Ana se rechaza');
select is(pg_temp.detalle('c13f'), 'compra_cufe_personal_key', 'C13: el detalle nombra el índice personal');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('5501')), 0, 'C13: el rechazo no deja compra');

-- C14: alias de comercio (I23).
select pg_temp.push(caso) from unnest(array['c14a', 'c14b', 'c14c']) caso;
select is(pg_temp.motivo('c14a'), 'invalido', 'C14: una compra personal no escribe alias compartidos');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('6001')), 0, 'C14: el rechazo no deja compra');
select is(pg_temp.filas('alias_comercio', 'id', pg_temp.fid('600b')), 0, 'C14: el rechazo no deja alias');
select is(pg_temp.estado('c14b'), 'aplicado', 'C14: una compra del hogar con NIT y alias se aplica');
select is(pg_temp.filas('alias_comercio', 'id', pg_temp.fid('610b')), 1, 'C14: el alias queda guardado');
select is(pg_temp.motivo('c14c'), 'duplicado', 'C14: un alias repetido del mismo NIT se rechaza');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('6201')), 0, 'C14: el rechazo no deja compra');

select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-00000000b102","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.filas('alias_comercio', 'id', pg_temp.fid('610b')), 1, 'C14: el alias del hogar es visible para Beto');
reset role;

-- C15: autorización, versión del esquema y sesión.
select pg_temp.push('c15a', 'caro');
select is(pg_temp.motivo('c15a'), 'no_autorizado', 'C15: un miembro de otro hogar no escribe en el hogar A');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('7001')), 0, 'C15: el rechazo no deja compra');

select pg_temp.push('c15b');
select is(pg_temp.motivo('c15b'), 'actualizar_app', 'C15: otra versión del esquema pide actualizar la app');
select is(pg_temp.filas('compra', 'id', pg_temp.fid('7101')), 0, 'C15: el rechazo no deja compra');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.sync_push(lote) from public.prueba_lote where caso = 'c15c' $$, '28000', null, 'C15: sin sub en el JWT sync_push exige una sesión');
reset role;

select * from finish();
rollback;
