-- Medios asignables a otro miembro, edición/eliminación de abonos y opción incluir_en_gastos. Rollback al final.
begin;
set search_path = public, extensions;
select plan(14);

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
   'authenticated', 'santiago@abonos.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('99999999-9999-4999-8999-00000000b102', '00000000-0000-4999-8999-000000000000', 'authenticated',
   'authenticated', 'sofia@abonos.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('99999999-9999-4999-8999-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ajeno@abonos.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- Hogar ajeno
select pg_temp.como('99999999-9999-4999-8999-00000000c103');
do $$
declare
  v_ajeno jsonb;
begin
  v_ajeno := public.crear_hogar('Casa Ajena', 'Ajeno');
  perform set_config('prueba.ajeno_miembro_id', v_ajeno ->> 'miembro_id', true);
end;
$$;

-- Hogar de Santiago y Sofía
select pg_temp.como('99999999-9999-4999-8999-00000000a101');
do $$
declare
  v_alta jsonb;
  v_inv jsonb;
  v_cat_id uuid;
begin
  v_alta := public.crear_hogar('Casa Pareja', 'Santiago');
  perform set_config('prueba.hogar_id', v_alta ->> 'hogar_id', true);
  perform set_config('prueba.santiago_id', v_alta ->> 'miembro_id', true);
  select id into v_cat_id from public.categoria
   where hogar_id = (v_alta ->> 'hogar_id')::uuid and nombre = 'Otros' limit 1;
  perform set_config('prueba.cat_otros_id', v_cat_id::text, true);

  v_inv := public.crear_invitacion(null, null);
  perform set_config('prueba.inv_tok', v_inv ->> 'token', true);
end;
$$;

select pg_temp.como('99999999-9999-4999-8999-00000000b102');
do $$
declare
  v_canje jsonb;
begin
  v_canje := public.canjear_invitacion(current_setting('prueba.inv_tok'), 'Sofía');
  perform set_config('prueba.sofia_id', v_canje ->> 'miembro_id', true);
end;
$$;

-- 1-4. Santiago (admin) crea medio para Sofía, rechaza miembro ajeno, y edita medio
select pg_temp.como('99999999-9999-4999-8999-00000000a101');
do $$
declare
  v_med jsonb;
begin
  v_med := public.crear_medio_de_pago(
    'Nequi Sofía',
    'cuenta',
    'miembro',
    current_setting('prueba.sofia_id')::uuid
  );
  perform set_config('prueba.nequi_sofia_id', v_med ->> 'id', true);
  perform set_config('prueba.nequi_sofia_owner', v_med ->> 'owner_miembro_id', true);
end;
$$;

select is(
  current_setting('prueba.nequi_sofia_owner')::uuid,
  current_setting('prueba.sofia_id')::uuid,
  'crear_medio_de_pago permite asignar el medio a Sofía'
);

select throws_ok(
  $$ select public.crear_medio_de_pago('Ajeno', 'cuenta', 'miembro', current_setting('prueba.ajeno_miembro_id')::uuid) $$,
  '22023', null,
  'crear_medio_de_pago rechaza miembros de otro hogar'
);

select is(
  (public.editar_medio_de_pago(
    current_setting('prueba.nequi_sofia_id')::uuid,
    'Bancolombia Sofía',
    'miembro',
    current_setting('prueba.sofia_id')::uuid
  ) ->> 'nombre'),
  'Bancolombia Sofía',
  'editar_medio_de_pago actualiza nombre manteniendo dueña Sofía'
);

select is(
  (public.editar_medio_de_pago(
    current_setting('prueba.nequi_sofia_id')::uuid,
    'Fondo secundario',
    'hogar',
    null
  ) ->> 'owner_miembro_id'),
  null,
  'editar_medio_de_pago permite reasignar al hogar (owner_miembro_id null)'
);

-- 5-7. Crear deuda de $1.000.000 y registrar abono con incluir_en_gastos = true
do $$
declare
  v_pasivo_id uuid := gen_random_uuid();
  v_plan_id uuid := gen_random_uuid();
  v_pago_id uuid := gen_random_uuid();
  v_pago_saf_id uuid := gen_random_uuid();
  v_res jsonb;
begin
  perform public.sync_push_obligaciones(jsonb_build_object(
    'lote_id', gen_random_uuid(),
    'hogar_id', current_setting('prueba.hogar_id')::uuid,
    'schema_version', 1,
    'tipo', 'pasivo',
    'filas', jsonb_build_object(
      'pasivo', jsonb_build_array(jsonb_build_object(
        'id', v_pasivo_id,
        'tipo', 'deuda',
        'nombre', 'Deuda clínica',
        'ambito', 'hogar',
        'owner_tipo', 'hogar',
        'owner_miembro_id', null
      )),
      'deuda', jsonb_build_array(jsonb_build_object(
        'pasivo_id', v_pasivo_id,
        'acreedor', 'Clínica'
      )),
      'plan_de_cuotas', jsonb_build_array(jsonb_build_object(
        'id', v_plan_id,
        'pasivo_id', v_pasivo_id,
        'origen', 'saldo_inicial',
        'fecha_inicio', '2026-11-01',
        'capital', 1000000,
        'sistema', 'sin_calendario'
      ))
    )
  ));

  v_res := public.sync_push_obligaciones(jsonb_build_object(
    'lote_id', gen_random_uuid(),
    'hogar_id', current_setting('prueba.hogar_id')::uuid,
    'schema_version', 1,
    'tipo', 'pago',
    'filas', jsonb_build_object(
      'pago_de_deuda', jsonb_build_array(jsonb_build_object(
        'id', v_pago_id,
        'pasivo_id', v_pasivo_id,
        'tipo', 'abono',
        'medio_de_pago_id', current_setting('prueba.nequi_sofia_id')::uuid,
        'monto', 400000,
        'fecha', '2026-11-10',
        'nota', 'Primer abono',
        'incluir_en_gastos', true,
        'categoria_gasto_id', current_setting('prueba.cat_otros_id')::uuid
      ))
    )
  ));
  perform set_config('prueba.pasivo_id', v_pasivo_id::text, true);
  perform set_config('prueba.pago_id', v_pago_id::text, true);
  perform set_config('prueba.pago_res', v_res ->> 'estado', true);
end;
$$;

select is(
  current_setting('prueba.pago_res'),
  'aplicado',
  'sync_push_obligaciones registra abono con incluir_en_gastos = true'
);

select is(
  (select incluir_en_gastos and categoria_gasto_id = current_setting('prueba.cat_otros_id')::uuid
     from public.pago_de_deuda where id = current_setting('prueba.pago_id')::uuid),
  true,
  'pago_de_deuda persiste incluir_en_gastos y categoria_gasto_id'
);

select is(
  (public.sync_push_obligaciones(jsonb_build_object(
    'lote_id', gen_random_uuid(),
    'hogar_id', current_setting('prueba.hogar_id')::uuid,
    'schema_version', 1,
    'tipo', 'pago',
    'filas', jsonb_build_object(
      'pago_de_deuda', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(),
        'pasivo_id', current_setting('prueba.pasivo_id')::uuid,
        'tipo', 'abono',
        'medio_de_pago_id', current_setting('prueba.nequi_sofia_id')::uuid,
        'monto', 100000,
        'fecha', '2026-11-11',
        'incluir_en_gastos', true,
        'categoria_gasto_id', null
      ))
    )
  )) ->> 'estado'),
  'rechazado',
  'rechaza abono con incluir_en_gastos = true sin categoria_gasto_id'
);

-- 8-10. editar_pago_de_deuda: cambia monto/fecha/nota/incluir_en_gastos y rechaza sobrepago I20
select is(
  (public.editar_pago_de_deuda(
    current_setting('prueba.pago_id')::uuid,
    600000,
    '2026-11-12'::date,
    current_setting('prueba.nequi_sofia_id')::uuid,
    'Abono ampliado',
    false,
    null
  ) ->> 'monto')::bigint,
  600000::bigint,
  'editar_pago_de_deuda actualiza monto, fecha, nota y limpia categoria_gasto_id'
);

select throws_ok(
  $$ select public.editar_pago_de_deuda(
       current_setting('prueba.pago_id')::uuid,
       1500000,
       '2026-11-12'::date,
       current_setting('prueba.nequi_sofia_id')::uuid,
       null,
       false,
       null
     ) $$,
  '23514', null,
  'editar_pago_de_deuda rechaza monto que supera el saldo causado (I20)'
);

select is(
  (select count(*)::int from public.pago_de_deuda
    where id = current_setting('prueba.pago_id')::uuid
      and monto = 600000
      and incluir_en_gastos = false
      and categoria_gasto_id is null),
  1,
  'tras el rechazo I20 conserva los valores previos válidos'
);

-- 11-14. Aislamiento entre hogares y eliminar_pago_de_deuda con restricciones diferidas
select pg_temp.como('99999999-9999-4999-8999-00000000c103');
select throws_ok(
  $$ select public.eliminar_pago_de_deuda(current_setting('prueba.pago_id')::uuid) $$,
  '22023', null,
  'miembro de otro hogar no puede eliminar el abono'
);

select pg_temp.como('99999999-9999-4999-8999-00000000b102');
select is(
  (public.eliminar_pago_de_deuda(current_setting('prueba.pago_id')::uuid) ->> 'eliminado')::boolean,
  true,
  'Sofía puede eliminar el abono del pasivo del hogar'
);

select is(
  (select eliminado_en is not null from public.pago_de_deuda where id = current_setting('prueba.pago_id')::uuid),
  true,
  'eliminar_pago_de_deuda marca eliminado_en en pago_de_deuda'
);

select lives_ok(
  $$ set constraints all immediate $$,
  'restricciones diferidas validan sin error bajo rol authenticated tras editar/eliminar abono'
);

select * from finish();
rollback;
