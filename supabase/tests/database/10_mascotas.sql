-- Núcleo 4 (despensa de mascotas): esquema, CHECKs, triggers diferidos I21,
-- RLS de `nivel_despensa` heredada de `compra`, `sync_push_mascotas`,
-- privacidad I23/I25 (`hogar_seq` intacto en compras personales) y regresión de
-- `SET CONSTRAINTS ALL DEFERRED`. Rollback al final.
begin;
set search_path = public, extensions;
select plan(42);

create function pg_temp.fx(p_sufijo text) returns uuid language sql immutable as $$
  select ('99999999-9999-4999-8999-' || lpad(p_sufijo, 12, '0'))::uuid;
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
  ('99999999-9999-4999-8999-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@mascotas.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('99999999-9999-4999-8999-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@mascotas.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('99999999-9999-4999-8999-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'caro@mascotas.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.hogar (id, nombre, actualizado_por, creado_en, actualizado_en) values
  (pg_temp.fx('1'), 'Hogar A', pg_temp.fx('101'), now(), now()),
  (pg_temp.fx('2'), 'Hogar B', pg_temp.fx('103'), now(), now());

insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('101'), pg_temp.fx('1'), 'Ana', '99999999-9999-4999-8999-00000000a101', 'admin', true, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('102'), pg_temp.fx('1'), 'Beto', '99999999-9999-4999-8999-00000000b102', 'miembro', true, now(), now(), pg_temp.fx('102')),
  (pg_temp.fx('103'), pg_temp.fx('2'), 'Caro', '99999999-9999-4999-8999-00000000c103', 'admin', true, now(), now(), pg_temp.fx('103'));

insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq) values
  (pg_temp.fx('1'), pg_temp.fx('101'), 0),
  (pg_temp.fx('1'), pg_temp.fx('102'), 0),
  (pg_temp.fx('2'), pg_temp.fx('103'), 0);

insert into public.categoria (id, hogar_id, nombre, orden, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('201'), pg_temp.fx('1'), 'Mascotas', 4, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('202'), pg_temp.fx('2'), 'Mascotas', 4, now(), now(), pg_temp.fx('103'));

insert into public.medio_de_pago (id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('301'), pg_temp.fx('1'), 'Cuenta común', 'cuenta', 'hogar', null, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('302'), pg_temp.fx('1'), 'Nequi Beto', 'cuenta', 'miembro', pg_temp.fx('102'), now(), now(), pg_temp.fx('102'));

insert into public.pasivo (id, hogar_id, tipo, nombre, ambito, owner_tipo, owner_miembro_id, tasa_tipo, tasa_ppm, creado_en, actualizado_en, actualizado_por) values
  (pg_temp.fx('401'), pg_temp.fx('1'), 'tarjeta', 'Visa Ana hogar', 'hogar', 'miembro', pg_temp.fx('101'), null, null, now(), now(), pg_temp.fx('101')),
  (pg_temp.fx('402'), pg_temp.fx('1'), 'tarjeta', 'Visa Beto personal', 'personal', 'miembro', pg_temp.fx('102'), null, null, now(), now(), pg_temp.fx('102'));

insert into public.tarjeta (pasivo_id, hogar_id, ultimos_4, dia_corte, dia_pago, actualizado_por) values
  (pg_temp.fx('401'), pg_temp.fx('1'), '1234', 25, 10, pg_temp.fx('101')),
  (pg_temp.fx('402'), pg_temp.fx('1'), '5678', 15, 25, pg_temp.fx('102'));

set constraints all immediate;
set constraints all deferred;

-- 1-6. Tablas y RLS/privilegios
select has_table('public', 'mascota', 'existe public.mascota');
select has_table('public', 'item_despensa', 'existe public.item_despensa');
select has_table('public', 'nivel_despensa', 'existe public.nivel_despensa');
select has_column('public', 'compra', 'mascota_id', 'compra tiene mascota_id');
select has_column('public', 'compra', 'item_despensa_id', 'compra tiene item_despensa_id');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('mascota', 'item_despensa', 'nivel_despensa') and c.relrowsecurity),
  3::bigint,
  'RLS habilitado en las 3 tablas nuevas'
);

select is(has_table_privilege('anon', 'public.mascota', 'SELECT'), false, 'anon no lee mascota');
select is(has_table_privilege('anon', 'public.item_despensa', 'SELECT'), false, 'anon no lee item_despensa');
select is(has_table_privilege('anon', 'public.nivel_despensa', 'SELECT'), false, 'anon no lee nivel_despensa');
select is(has_table_privilege('authenticated', 'public.mascota', 'INSERT'), false, 'authenticated no inserta directo en mascota');
select is(has_table_privilege('authenticated', 'public.item_despensa', 'UPDATE'), false, 'authenticated no actualiza directo item_despensa');
select is(has_table_privilege('authenticated', 'public.nivel_despensa', 'DELETE'), false, 'authenticated no borra directo nivel_despensa');
select is(has_function_privilege('authenticated', 'private.puede_ver_compra(uuid, uuid)', 'EXECUTE'), true, 'authenticated ejecuta puede_ver_compra para RLS');

-- 7-10. Altas por sync_push_mascotas: mascota + item_despensa + ajuste_nivel
select pg_temp.como('99999999-9999-4999-8999-00000000a101');
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9001'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'mascota',
    'filas', jsonb_build_object('mascota', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fx('501'), 'nombre', 'Luna', 'especie', 'perro', 'activa', true
    )))
  ))) ->> 'estado',
  'aplicado',
  'alta de mascota aplicada'
);

select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9002'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'item_despensa',
    'filas', jsonb_build_object('item_despensa', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fx('601'), 'mascota_id', pg_temp.fx('501'), 'nombre', 'Concentrado 15 kg',
      'tipo', 'comida', 'categoria_id', pg_temp.fx('201'), 'frecuencia_dias', 30,
      'umbral_alerta_pct', 20, 'monto_habitual', 180000
    )))
  ))) ->> 'estado',
  'aplicado',
  'alta de item_despensa aplicada'
);

select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9003'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'ajuste_nivel',
    'filas', jsonb_build_object('nivel_despensa', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fx('701'), 'item_despensa_id', pg_temp.fx('601'),
      'fecha', '2026-11-20', 'nivel_pct', 15, 'origen', 'ajuste', 'compra_id', null
    )))
  ))) ->> 'estado',
  'aplicado',
  'ajuste manual de nivel aplicado'
);

-- Idempotencia de reintento por mismo autor
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9003'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'ajuste_nivel',
    'filas', jsonb_build_object('nivel_despensa', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fx('701'), 'item_despensa_id', pg_temp.fx('601'),
      'fecha', '2026-11-20', 'nivel_pct', 15, 'origen', 'ajuste', 'compra_id', null
    )))
  ))) ->> 'estado',
  'aplicado',
  'reintento idempotente del mismo lote devuelve aplicado'
);

-- 11-14. Recompra contado hogar actualiza monto_habitual y deja NivelDespensa(100)
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9004'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'recompra',
    'actualizar_monto_habitual', true,
    'filas', jsonb_build_object(
      'compra', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('801'), 'fecha', '2026-11-22', 'descripcion', 'Concentrado 15 kg',
        'monto_total', 185000, 'categoria_id', pg_temp.fx('201'), 'ambito', 'hogar',
        'miembro_id', null, 'pago_tipo', 'contado', 'medio_de_pago_id', pg_temp.fx('301'),
        'financiada_por_pasivo_id', null, 'mascota_id', pg_temp.fx('501'),
        'item_despensa_id', pg_temp.fx('601'), 'origen', 'manual'
      )),
      'nivel_despensa', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('702'), 'item_despensa_id', pg_temp.fx('601'),
        'compra_id', pg_temp.fx('801'), 'fecha', '2026-11-22', 'nivel_pct', 100, 'origen', 'compra'
      ))
    )
  ))) ->> 'estado',
  'aplicado',
  'recompra hogar contado aplicada'
);
select is((select monto_habitual from public.item_despensa where id = pg_temp.fx('601')), 185000::bigint, 'recompra hogar actualiza monto_habitual');
select is((select nivel_pct from public.nivel_despensa where compra_id = pg_temp.fx('801')), 100, 'recompra crea nivel_despensa en 100');

-- Recompra financiada con tarjeta a 1 cuota
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9005'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'recompra',
    'actualizar_monto_habitual', false,
    'filas', jsonb_build_object(
      'compra', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('802'), 'fecha', '2026-12-03', 'descripcion', 'Concentrado 15 kg',
        'monto_total', 182000, 'categoria_id', pg_temp.fx('201'), 'ambito', 'hogar',
        'miembro_id', null, 'pago_tipo', 'financiado', 'medio_de_pago_id', null,
        'financiada_por_pasivo_id', null, 'mascota_id', pg_temp.fx('501'),
        'item_despensa_id', pg_temp.fx('601'), 'origen', 'manual'
      )),
      'plan_de_cuotas', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('811'), 'pasivo_id', pg_temp.fx('401'), 'origen', 'compra',
        'compra_id', pg_temp.fx('802'), 'fecha_inicio', '2026-12-03', 'capital', 182000,
        'sistema', 'capital_fijo', 'n_cuotas', 1, 'fecha_primera_cuota', '2027-01-10',
        'tasa_tipo', null, 'tasa_ppm', null
      )),
      'cuota', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('821'), 'plan_id', pg_temp.fx('811'), 'numero', 1,
        'fecha_vencimiento', '2027-01-10', 'capital', 182000
      )),
      'nivel_despensa', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('703'), 'item_despensa_id', pg_temp.fx('601'),
        'compra_id', pg_temp.fx('802'), 'fecha', '2026-12-03', 'nivel_pct', 100, 'origen', 'compra'
      ))
    )
  ))) ->> 'estado',
  'aplicado',
  'recompra financiada a cuotas aplicada'
);

-- 15-19. Privacidad I23 e I25: recompra personal de Beto
select pg_temp.como('99999999-9999-4999-8999-00000000b102');

-- Rechaza intentar actualizar monto_habitual desde compra personal (I23)
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9006'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'recompra',
    'actualizar_monto_habitual', true,
    'filas', jsonb_build_object(
      'compra', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('803'), 'fecha', '2026-11-25', 'descripcion', 'Personal',
        'monto_total', 50000, 'categoria_id', pg_temp.fx('201'), 'ambito', 'personal',
        'miembro_id', pg_temp.fx('102'), 'pago_tipo', 'contado', 'medio_de_pago_id', pg_temp.fx('302'),
        'financiada_por_pasivo_id', null, 'mascota_id', pg_temp.fx('501'),
        'item_despensa_id', pg_temp.fx('601'), 'origen', 'manual'
      )),
      'nivel_despensa', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('704'), 'item_despensa_id', pg_temp.fx('601'),
        'compra_id', pg_temp.fx('803'), 'fecha', '2026-11-25', 'nivel_pct', 100, 'origen', 'compra'
      ))
    )
  ))) ->> 'estado',
  'rechazado',
  'I23: compra personal no puede actualizar monto_habitual'
);

-- Regresión SET CONSTRAINTS ALL DEFERRED tras el rechazo anterior
select pg_temp.como('99999999-9999-4999-8999-00000000b102');
reset role;
select is(
  (select current_setting('transaction_isolation') is not null),
  true,
  'transacción sigue sana tras rechazo'
);

create temp table pg_temp.hogar_seq_antes as
  select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1');

select pg_temp.como('99999999-9999-4999-8999-00000000b102');
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9007'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'recompra',
    'actualizar_monto_habitual', false,
    'filas', jsonb_build_object(
      'compra', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('804'), 'fecha', '2026-11-25', 'descripcion', 'Compra personal Beto',
        'monto_total', 50000, 'categoria_id', pg_temp.fx('201'), 'ambito', 'personal',
        'miembro_id', pg_temp.fx('102'), 'pago_tipo', 'contado', 'medio_de_pago_id', pg_temp.fx('302'),
        'financiada_por_pasivo_id', null, 'mascota_id', pg_temp.fx('501'),
        'item_despensa_id', pg_temp.fx('601'), 'origen', 'manual'
      )),
      'nivel_despensa', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('705'), 'item_despensa_id', pg_temp.fx('601'),
        'compra_id', pg_temp.fx('804'), 'fecha', '2026-11-25', 'nivel_pct', 100, 'origen', 'compra'
      ))
    )
  ))) ->> 'estado',
  'aplicado',
  'recompra personal sin modificar monto_habitual aplicada'
);

reset role;
select is(
  (select ultimo_seq from public.hogar_seq where hogar_id = pg_temp.fx('1')),
  (select ultimo_seq from pg_temp.hogar_seq_antes),
  'I25: recompra personal nunca mueve hogar_seq'
);

-- Beto ve su nivel personal; Ana (admin del hogar) NO ve el nivel de compra personal de Beto; Caro (otro hogar) tampoco
select pg_temp.como('99999999-9999-4999-8999-00000000b102');
select is((select count(*) from public.nivel_despensa where id = pg_temp.fx('705')), 1::bigint, 'dueño ve su nivel personal');
select pg_temp.como('99999999-9999-4999-8999-00000000a101');
select is((select count(*) from public.nivel_despensa where id = pg_temp.fx('705')), 0::bigint, 'admin no ve nivel personal de otro miembro');
select pg_temp.como('99999999-9999-4999-8999-00000000c103');
select is((select count(*) from public.mascota where hogar_id = pg_temp.fx('1')), 0::bigint, 'otro hogar no ve mascotas ajenas');
select is((select count(*) from public.item_despensa where hogar_id = pg_temp.fx('1')), 0::bigint, 'otro hogar no ve items ajenos');

-- 20-26. Rechazos I21 y CHECKs
select pg_temp.como('99999999-9999-4999-8999-00000000a101');

-- Rechaza recompra sin nivel_despensa
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9008'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'recompra',
    'filas', jsonb_build_object(
      'compra', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('805'), 'fecha', '2026-11-26', 'descripcion', 'Sin nivel',
        'monto_total', 50000, 'categoria_id', pg_temp.fx('201'), 'ambito', 'hogar',
        'miembro_id', null, 'pago_tipo', 'contado', 'medio_de_pago_id', pg_temp.fx('301'),
        'mascota_id', pg_temp.fx('501'), 'item_despensa_id', pg_temp.fx('601')
      )),
      'nivel_despensa', '[]'::jsonb
    )
  ))) ->> 'estado',
  'rechazado',
  'recompra sin nivel_despensa rechazada'
);

-- Rechaza nivel_despensa de compra con nivel != 100
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9009'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'recompra',
    'filas', jsonb_build_object(
      'compra', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('806'), 'fecha', '2026-11-26', 'descripcion', 'Nivel 80',
        'monto_total', 50000, 'categoria_id', pg_temp.fx('201'), 'ambito', 'hogar',
        'miembro_id', null, 'pago_tipo', 'contado', 'medio_de_pago_id', pg_temp.fx('301'),
        'mascota_id', pg_temp.fx('501'), 'item_despensa_id', pg_temp.fx('601')
      )),
      'nivel_despensa', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('706'), 'item_despensa_id', pg_temp.fx('601'),
        'compra_id', pg_temp.fx('806'), 'fecha', '2026-11-26', 'nivel_pct', 80, 'origen', 'compra'
      ))
    )
  ))) ->> 'estado',
  'rechazado',
  'nivel_despensa origen=compra con nivel != 100 rechazado'
);

-- Rechaza mascota incoherente con item_despensa.mascota_id
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9010'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'recompra',
    'filas', jsonb_build_object(
      'compra', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('807'), 'fecha', '2026-11-26', 'descripcion', 'Sin mascota',
        'monto_total', 50000, 'categoria_id', pg_temp.fx('201'), 'ambito', 'hogar',
        'miembro_id', null, 'pago_tipo', 'contado', 'medio_de_pago_id', pg_temp.fx('301'),
        'mascota_id', null, 'item_despensa_id', pg_temp.fx('601')
      )),
      'nivel_despensa', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('707'), 'item_despensa_id', pg_temp.fx('601'),
        'compra_id', pg_temp.fx('807'), 'fecha', '2026-11-26', 'nivel_pct', 100, 'origen', 'compra'
      ))
    )
  ))) ->> 'estado',
  'rechazado',
  'compra de insumo de Luna sin mascota_id rechazada'
);

-- Rechaza fecha distinta entre compra y nivel_despensa
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9011'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'recompra',
    'filas', jsonb_build_object(
      'compra', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('808'), 'fecha', '2026-11-26', 'descripcion', 'Fecha distinta',
        'monto_total', 50000, 'categoria_id', pg_temp.fx('201'), 'ambito', 'hogar',
        'miembro_id', null, 'pago_tipo', 'contado', 'medio_de_pago_id', pg_temp.fx('301'),
        'mascota_id', pg_temp.fx('501'), 'item_despensa_id', pg_temp.fx('601')
      )),
      'nivel_despensa', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('708'), 'item_despensa_id', pg_temp.fx('601'),
        'compra_id', pg_temp.fx('808'), 'fecha', '2026-11-27', 'nivel_pct', 100, 'origen', 'compra'
      ))
    )
  ))) ->> 'estado',
  'rechazado',
  'nivel_despensa con fecha distinta a compra rechazado'
);

-- Rechaza ajuste manual con nivel > 100 o < 0
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9012'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'ajuste_nivel',
    'filas', jsonb_build_object('nivel_despensa', jsonb_build_array(jsonb_build_object(
      'id', pg_temp.fx('709'), 'item_despensa_id', pg_temp.fx('601'),
      'fecha', '2026-11-26', 'nivel_pct', 120, 'origen', 'ajuste', 'compra_id', null
    )))
  ))) ->> 'estado',
  'rechazado',
  'ajuste manual con nivel > 100 rechazado'
);

-- No filtra libro personal ajeno (Ana sondea pasivo personal de Beto 402 -> 'pasivo inexistente')
select is(
  (public.sync_push_mascotas(jsonb_build_object(
    'lote_id', pg_temp.fx('9013'),
    'hogar_id', pg_temp.fx('1'),
    'schema_version', 1,
    'tipo', 'recompra',
    'filas', jsonb_build_object(
      'compra', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('809'), 'fecha', '2026-11-26', 'descripcion', 'Sondeo pasivo ajeno',
        'monto_total', 50000, 'categoria_id', pg_temp.fx('201'), 'ambito', 'hogar',
        'miembro_id', null, 'pago_tipo', 'financiado', 'medio_de_pago_id', null,
        'financiada_por_pasivo_id', null, 'mascota_id', pg_temp.fx('501'), 'item_despensa_id', pg_temp.fx('601')
      )),
      'plan_de_cuotas', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('812'), 'pasivo_id', pg_temp.fx('402'), 'origen', 'compra',
        'compra_id', pg_temp.fx('809'), 'fecha_inicio', '2026-11-26', 'capital', 50000,
        'sistema', 'capital_fijo', 'n_cuotas', 1, 'fecha_primera_cuota', '2026-12-25'
      )),
      'cuota', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('822'), 'plan_id', pg_temp.fx('812'), 'numero', 1,
        'fecha_vencimiento', '2026-12-25', 'capital', 50000
      )),
      'nivel_despensa', jsonb_build_array(jsonb_build_object(
        'id', pg_temp.fx('710'), 'item_despensa_id', pg_temp.fx('601'),
        'compra_id', pg_temp.fx('809'), 'fecha', '2026-11-26', 'nivel_pct', 100, 'origen', 'compra'
      ))
    )
  ))) ->> 'detalle',
  'pasivo inexistente',
  'sondear pasivo personal ajeno responde pasivo inexistente sin filtrar existencia'
);

-- Regresión explícita de modo diferido: insertar compra(item_despensa_id) antes de nivel_despensa en la misma transacción debe funcionar tras un rechazo previo
reset role;
select lives_ok(
  $$
  insert into public.compra (
    id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito,
    pago_tipo, medio_de_pago_id, registrado_por, mascota_id, item_despensa_id, actualizado_por
  ) values (
    '99999999-9999-4999-8999-000000000899', '99999999-9999-4999-8999-000000000001',
    '2026-11-27', 'Prueba diferida', 45000, '99999999-9999-4999-8999-000000000201',
    'hogar', 'contado', '99999999-9999-4999-8999-000000000301',
    '99999999-9999-4999-8999-000000000101',
    '99999999-9999-4999-8999-000000000501',
    '99999999-9999-4999-8999-000000000601',
    '99999999-9999-4999-8999-000000000101'
  );
  insert into public.nivel_despensa (
    id, hogar_id, item_despensa_id, compra_id, fecha, nivel_pct, origen, actualizado_por
  ) values (
    '99999999-9999-4999-8999-000000000799', '99999999-9999-4999-8999-000000000001',
    '99999999-9999-4999-8999-000000000601', '99999999-9999-4999-8999-000000000899',
    '2026-11-27', 100, 'compra', '99999999-9999-4999-8999-000000000101'
  );
  $$,
  'SET CONSTRAINTS ALL DEFERRED sigue activo tras rechazos en sync_push_mascotas'
);

-- CHECK bicondicional directo en Postgres
select throws_ok(
  $$
  insert into public.nivel_despensa (
    id, hogar_id, item_despensa_id, compra_id, fecha, nivel_pct, origen, actualizado_por
  ) values (
    '99999999-9999-4999-8999-000000000798', '99999999-9999-4999-8999-000000000001',
    '99999999-9999-4999-8999-000000000601', null, '2026-11-27', 100, 'compra',
    '99999999-9999-4999-8999-000000000101'
  )
  $$,
  '23514',
  null,
  'CHECK bicondicional rechaza origen=compra sin compra_id'
);

select throws_ok(
  $$
  insert into public.nivel_despensa (
    id, hogar_id, item_despensa_id, compra_id, fecha, nivel_pct, origen, actualizado_por
  ) values (
    '99999999-9999-4999-8999-000000000797', '99999999-9999-4999-8999-000000000001',
    '99999999-9999-4999-8999-000000000601', '99999999-9999-4999-8999-000000000801',
    '2026-11-27', 50, 'ajuste', '99999999-9999-4999-8999-000000000101'
  )
  $$,
  '23514',
  null,
  'CHECK bicondicional rechaza origen=ajuste con compra_id'
);

-- Constraint trigger impide borrar nivel_despensa dejando compra activa
select throws_ok(
  $$
  update public.nivel_despensa
     set eliminado_en = now(), actualizado_por = '99999999-9999-4999-8999-000000000101'
   where id = '99999999-9999-4999-8999-000000000702';
  set constraints all immediate;
  $$,
  '23514',
  null,
  'trigger diferido impide borrar nivel_despensa mientras compra sigue activa'
);

-- Frecuencia <= 0 y monto_habitual <= 0 rechazados
select throws_ok(
  $$
  insert into public.item_despensa (
    id, hogar_id, nombre, tipo, categoria_id, frecuencia_dias, actualizado_por
  ) values (
    '99999999-9999-4999-8999-000000000699', '99999999-9999-4999-8999-000000000001',
    'Inválido', 'otro', '99999999-9999-4999-8999-000000000201', 0,
    '99999999-9999-4999-8999-000000000101'
  )
  $$,
  '23514',
  null,
  'frecuencia_dias <= 0 rechazada por CHECK'
);

select throws_ok(
  $$
  insert into public.item_despensa (
    id, hogar_id, nombre, tipo, categoria_id, monto_habitual, actualizado_por
  ) values (
    '99999999-9999-4999-8999-000000000698', '99999999-9999-4999-8999-000000000001',
    'Monto cero', 'otro', '99999999-9999-4999-8999-000000000201', 0,
    '99999999-9999-4999-8999-000000000101'
  )
  $$,
  '23514',
  null,
  'monto_habitual <= 0 rechazada por CHECK'
);

select throws_ok(
  $$
  insert into public.compra (
    id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito,
    pago_tipo, medio_de_pago_id, registrado_por, mascota_id, item_despensa_id, actualizado_por
  ) values (
    '99999999-9999-4999-8999-000000000898', '99999999-9999-4999-8999-000000000001',
    '2026-11-27', 'Compra huérfana', 45000, '99999999-9999-4999-8999-000000000201',
    'hogar', 'contado', '99999999-9999-4999-8999-000000000301',
    '99999999-9999-4999-8999-000000000101',
    '99999999-9999-4999-8999-000000000501',
    '99999999-9999-4999-8999-000000000601',
    '99999999-9999-4999-8999-000000000101'
  );
  set constraints all immediate;
  $$,
  '23514',
  null,
  'trigger diferido impide compra de ítem sin NivelDespensa(100)'
);

select * from finish();
rollback;
