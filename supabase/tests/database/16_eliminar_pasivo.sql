-- RPC `eliminar_pasivo` y evaluación de constraints diferidos dentro de
-- SECURITY DEFINER (evita `permission denied` para `authenticated` en COMMIT).
begin;
set search_path = public, extensions;
select plan(11);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario)::text, true);
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@pasivo.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@pasivo.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- 1. Puerta anon
set local role anon;
select throws_ok($$ select public.eliminar_pasivo('11111111-1111-4111-8111-000000000001') $$, '42501', null,
  'anon no puede eliminar pasivo');
reset role;

-- Preparar hogar con Ana y Beto
select pg_temp.como('aaaaaaaa-aaaa-4aaa-8aaa-00000000a101');
do $$
declare
  v_alta jsonb;
  v_inv jsonb;
  v_medio jsonb;
  v_deuda_sin_pago uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-00000000d001';
  v_deuda_con_pago uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-00000000d002';
  v_tarjeta_compra uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-00000000d003';
  v_deuda_personal uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-00000000d004';
  v_tarjeta_anular uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-00000000d005';
  v_compra_anular uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-00000000c002';
  v_cat uuid;
  v_hogar uuid;
begin
  v_alta := public.crear_hogar('Casa Eliminar', 'Ana');
  v_hogar := (v_alta ->> 'hogar_id')::uuid;
  v_medio := public.crear_medio_de_pago('Nequi Ana', 'cuenta', 'miembro');
  v_inv := public.crear_invitacion(null, null);

  perform set_config('prueba.hogar_id', v_hogar::text, true);
  perform set_config('prueba.medio_id', (v_medio ->> 'id'), true);
  perform set_config('prueba.inv_tok', v_inv ->> 'token', true);
  perform set_config('prueba.deuda_sin_pago', v_deuda_sin_pago::text, true);
  perform set_config('prueba.deuda_con_pago', v_deuda_con_pago::text, true);
  perform set_config('prueba.tarjeta_compra', v_tarjeta_compra::text, true);
  perform set_config('prueba.deuda_personal', v_deuda_personal::text, true);
  perform set_config('prueba.tarjeta_anular', v_tarjeta_anular::text, true);
  perform set_config('prueba.compra_anular', v_compra_anular::text, true);

  -- Deuda sin abonos
  perform public.sync_push_obligaciones(jsonb_build_object(
    'lote_id', gen_random_uuid(), 'hogar_id', v_hogar, 'schema_version', 1, 'tipo', 'pasivo',
    'filas', jsonb_build_object(
      'pasivo', jsonb_build_array(jsonb_build_object(
        'id', v_deuda_sin_pago, 'tipo', 'deuda', 'nombre', 'Kiroi dup',
        'ambito', 'hogar', 'owner_tipo', 'hogar', 'owner_miembro_id', null, 'tasa_tipo', null, 'tasa_ppm', null
      )),
      'deuda', jsonb_build_array(jsonb_build_object('pasivo_id', v_deuda_sin_pago, 'acreedor', 'Vet')),
      'plan_de_cuotas', jsonb_build_array(jsonb_build_object(
        'id', 'aaaaaaaa-aaaa-4aaa-8aaa-00000000e001', 'pasivo_id', v_deuda_sin_pago, 'origen', 'saldo_inicial',
        'fecha_inicio', '2026-11-27', 'capital', 1426000, 'sistema', 'sin_calendario',
        'n_cuotas', null, 'fecha_primera_cuota', null, 'tasa_tipo', null, 'tasa_ppm', null
      ))
    )
  ));

  -- Deuda con abono
  perform public.sync_push_obligaciones(jsonb_build_object(
    'lote_id', gen_random_uuid(), 'hogar_id', v_hogar, 'schema_version', 1, 'tipo', 'pasivo',
    'filas', jsonb_build_object(
      'pasivo', jsonb_build_array(jsonb_build_object(
        'id', v_deuda_con_pago, 'tipo', 'deuda', 'nombre', 'Kiroi abono',
        'ambito', 'hogar', 'owner_tipo', 'hogar', 'owner_miembro_id', null, 'tasa_tipo', null, 'tasa_ppm', null
      )),
      'deuda', jsonb_build_array(jsonb_build_object('pasivo_id', v_deuda_con_pago, 'acreedor', 'Vet')),
      'plan_de_cuotas', jsonb_build_array(jsonb_build_object(
        'id', 'aaaaaaaa-aaaa-4aaa-8aaa-00000000e002', 'pasivo_id', v_deuda_con_pago, 'origen', 'saldo_inicial',
        'fecha_inicio', '2026-11-27', 'capital', 1426000, 'sistema', 'sin_calendario',
        'n_cuotas', null, 'fecha_primera_cuota', null, 'tasa_tipo', null, 'tasa_ppm', null
      ))
    )
  ));
  perform public.sync_push_obligaciones(jsonb_build_object(
    'lote_id', gen_random_uuid(), 'hogar_id', v_hogar, 'schema_version', 1, 'tipo', 'pago',
    'filas', jsonb_build_object(
      'pago_de_deuda', jsonb_build_array(jsonb_build_object(
        'id', 'aaaaaaaa-aaaa-4aaa-8aaa-00000000f001', 'pasivo_id', v_deuda_con_pago,
        'tipo', 'abono', 'cuota_id', null, 'medio_de_pago_id', v_medio ->> 'id',
        'monto', 460000, 'fecha', '2026-11-27', 'nota', null
      ))
    )
  ));

  -- Deuda personal de Ana
  perform public.sync_push_obligaciones(jsonb_build_object(
    'lote_id', gen_random_uuid(), 'hogar_id', v_hogar, 'schema_version', 1, 'tipo', 'pasivo',
    'filas', jsonb_build_object(
      'pasivo', jsonb_build_array(jsonb_build_object(
        'id', v_deuda_personal, 'tipo', 'deuda', 'nombre', 'Personal Ana',
        'ambito', 'personal', 'owner_tipo', 'miembro', 'owner_miembro_id', v_alta ->> 'miembro_id', 'tasa_tipo', null, 'tasa_ppm', null
      )),
      'deuda', jsonb_build_array(jsonb_build_object('pasivo_id', v_deuda_personal, 'acreedor', 'Amigo'))
    )
  ));

  -- Tarjeta con compra a cuotas (para archivado) y tarjeta + compra a cuotas para anular_compra
  perform public.sync_push_obligaciones(jsonb_build_object(
    'lote_id', gen_random_uuid(), 'hogar_id', v_hogar, 'schema_version', 1, 'tipo', 'pasivo',
    'filas', jsonb_build_object(
      'pasivo', jsonb_build_array(jsonb_build_object(
        'id', v_tarjeta_compra, 'tipo', 'tarjeta', 'nombre', 'Visa Archivar',
        'ambito', 'hogar', 'owner_tipo', 'miembro', 'owner_miembro_id', v_alta ->> 'miembro_id', 'tasa_tipo', null, 'tasa_ppm', null
      )),
      'tarjeta', jsonb_build_array(jsonb_build_object(
        'pasivo_id', v_tarjeta_compra, 'dia_corte', 15, 'dia_pago', 25, 'ultimos_4', '1111', 'cupo', null
      ))
    )
  ));
  perform public.sync_push_obligaciones(jsonb_build_object(
    'lote_id', gen_random_uuid(), 'hogar_id', v_hogar, 'schema_version', 1, 'tipo', 'pasivo',
    'filas', jsonb_build_object(
      'pasivo', jsonb_build_array(jsonb_build_object(
        'id', v_tarjeta_anular, 'tipo', 'tarjeta', 'nombre', 'Visa Anular',
        'ambito', 'hogar', 'owner_tipo', 'miembro', 'owner_miembro_id', v_alta ->> 'miembro_id', 'tasa_tipo', null, 'tasa_ppm', null
      )),
      'tarjeta', jsonb_build_array(jsonb_build_object(
        'pasivo_id', v_tarjeta_anular, 'dia_corte', 10, 'dia_pago', 20, 'ultimos_4', '2222', 'cupo', null
      ))
    )
  ));

  select id into v_cat from public.categoria where hogar_id = v_hogar and nombre = 'Mercado' limit 1;
  perform set_config('prueba.cat_id', v_cat::text, true);
  perform set_config('prueba.ana_id', (v_alta ->> 'miembro_id'), true);
end;
$$;

reset role;
do $$
declare
  v_hogar uuid := current_setting('prueba.hogar_id')::uuid;
  v_ana uuid := current_setting('prueba.ana_id')::uuid;
  v_cat uuid := current_setting('prueba.cat_id')::uuid;
  v_tarjeta_compra uuid := current_setting('prueba.tarjeta_compra')::uuid;
  v_tarjeta_anular uuid := current_setting('prueba.tarjeta_anular')::uuid;
  v_compra_anular uuid := current_setting('prueba.compra_anular')::uuid;
begin
  insert into public.compra (
    id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito, miembro_id,
    pago_tipo, medio_de_pago_id, financiada_por_pasivo_id, registrado_por, origen, actualizado_por
  ) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-00000000c001', v_hogar, '2026-11-27', 'Mercado cuotas', 100000, v_cat, 'hogar', null,
     'financiado', null, null, v_ana, 'manual', v_ana),
    (v_compra_anular, v_hogar, '2026-11-27', 'TV cuotas', 200000, v_cat, 'hogar', null,
     'financiado', null, null, v_ana, 'manual', v_ana);

  insert into public.plan_de_cuotas (
    id, hogar_id, pasivo_id, origen, compra_id, fecha_inicio, capital, sistema,
    n_cuotas, fecha_primera_cuota, tasa_tipo, tasa_ppm, actualizado_por
  ) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-00000000e003', v_hogar, v_tarjeta_compra, 'compra', 'aaaaaaaa-aaaa-4aaa-8aaa-00000000c001', '2026-11-27', 100000, 'capital_fijo', 2, '2026-12-25', null, null, v_ana),
    ('aaaaaaaa-aaaa-4aaa-8aaa-00000000e004', v_hogar, v_tarjeta_anular, 'compra', v_compra_anular, '2026-11-27', 200000, 'capital_fijo', 2, '2026-12-20', null, null, v_ana);

  insert into public.cuota (
    id, hogar_id, plan_id, numero, fecha_vencimiento, capital, actualizado_por
  ) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-00000000f002', v_hogar, 'aaaaaaaa-aaaa-4aaa-8aaa-00000000e003', 1, '2026-12-25', 50000, v_ana),
    ('aaaaaaaa-aaaa-4aaa-8aaa-00000000f003', v_hogar, 'aaaaaaaa-aaaa-4aaa-8aaa-00000000e003', 2, '2027-01-25', 50000, v_ana),
    ('aaaaaaaa-aaaa-4aaa-8aaa-00000000f004', v_hogar, 'aaaaaaaa-aaaa-4aaa-8aaa-00000000e004', 1, '2026-12-20', 100000, v_ana),
    ('aaaaaaaa-aaaa-4aaa-8aaa-00000000f005', v_hogar, 'aaaaaaaa-aaaa-4aaa-8aaa-00000000e004', 2, '2027-01-20', 100000, v_ana);

  set constraints all immediate;
  set constraints all deferred;
end;
$$;

-- Unir Beto
select pg_temp.como('aaaaaaaa-aaaa-4aaa-8aaa-00000000b102');
select public.canjear_invitacion(current_setting('prueba.inv_tok'), 'Beto') is not null as ok_beto \gset

-- 2. Beto no puede eliminar pasivo personal de Ana
select throws_ok(
  $$ select public.eliminar_pasivo(current_setting('prueba.deuda_personal')::uuid) $$,
  '22023', null,
  'otro miembro no puede eliminar pasivo personal ajeno'
);

-- 3-4. Ana elimina deuda sin abonos como authenticated y luego `set constraints all immediate` no falla por permisos
select pg_temp.como('aaaaaaaa-aaaa-4aaa-8aaa-00000000a101');
select is(
  public.eliminar_pasivo(current_setting('prueba.deuda_sin_pago')::uuid) ->> 'accion',
  'eliminado',
  'eliminar_pasivo elimina deuda sin compras ni abonos'
);
select lives_ok(
  $$ set constraints all immediate $$,
  'set constraints all immediate tras eliminar_pasivo sin pagos no exige permisos private al rol authenticated'
);

-- 5-7. Ana elimina deuda con abono y verifica soft-delete de pago + sin error al evaluar constraints como authenticated
select is(
  public.eliminar_pasivo(current_setting('prueba.deuda_con_pago')::uuid) ->> 'accion',
  'eliminado',
  'eliminar_pasivo elimina deuda con abono cuando no tiene compras'
);
select lives_ok(
  $$ set constraints all immediate $$,
  'set constraints all immediate tras eliminar_pasivo con abono no exige permisos private al rol authenticated'
);
select is(
  (select count(*)::int from public.pago_de_deuda where pasivo_id = current_setting('prueba.deuda_con_pago')::uuid and eliminado_en is null),
  0,
  'pago_de_deuda queda soft-deleted al eliminar pasivo'
);

-- 8-9. Pasivo con compra activa se archiva (activo = false) conservando su historia
select is(
  public.eliminar_pasivo(current_setting('prueba.tarjeta_compra')::uuid) ->> 'accion',
  'archivado',
  'eliminar_pasivo archiva tarjeta cuando tiene compras activas'
);
select is(
  (select activo::text || '|' || (eliminado_en is null)::text from public.pasivo where id = current_setting('prueba.tarjeta_compra')::uuid),
  'false|true',
  'pasivo archivado queda activo=false y sin eliminado_en'
);

-- 10. anular_compra en compra a cuotas tampoco deja constraints diferidos pendientes para authenticated
select is(
  (public.anular_compra(current_setting('prueba.compra_anular')::uuid) ->> 'anulada')::boolean,
  true,
  'anular_compra anula compra a cuotas'
);
select lives_ok(
  $$ set constraints all immediate $$,
  'set constraints all immediate tras anular_compra no exige permisos private al rol authenticated'
);

select * from finish();
rollback;
