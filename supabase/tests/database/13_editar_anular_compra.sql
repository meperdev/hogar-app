-- RPCs `editar_compra` y `anular_compra`: permisos, privacidad personal,
-- reglas de compra a cuotas y anulación atómica. Rollback al final.
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
  ('99999999-9999-4999-8999-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ana@editar.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('99999999-9999-4999-8999-00000000b102', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'beto@editar.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- Puerta anon
set local role anon;
select throws_ok($$ select public.anular_compra('11111111-1111-4111-8111-000000000001') $$, '42501', null,
  'anon no puede anular compra');
reset role;

-- Crear hogar con Ana y unir a Beto
select pg_temp.como('99999999-9999-4999-8999-00000000a101');
do $$
declare
  v_alta jsonb;
  v_inv jsonb;
  v_m1 jsonb;
  v_m2 jsonb;
begin
  v_alta := public.crear_hogar('Casa Editar', 'Ana');
  perform set_config('prueba.hogar_id', v_alta ->> 'hogar_id', true);
  perform set_config('prueba.ana_id', v_alta ->> 'miembro_id', true);

  v_m1 := public.crear_medio_de_pago('Nequi Ana', 'cuenta', 'miembro');
  v_m2 := public.crear_medio_de_pago('Bancolombia', 'cuenta', 'hogar');
  perform set_config('prueba.nequi_id', v_m1 ->> 'id', true);
  perform set_config('prueba.banco_id', v_m2 ->> 'id', true);

  v_inv := public.crear_invitacion(null, null);
  perform set_config('prueba.inv_tok', v_inv ->> 'token', true);
end;
$$;

select pg_temp.como('99999999-9999-4999-8999-00000000b102');
do $$
declare
  v_canje jsonb;
begin
  v_canje := public.canjear_invitacion(current_setting('prueba.inv_tok'), 'Beto');
  perform set_config('prueba.beto_id', v_canje ->> 'miembro_id', true);
end;
$$;

-- Ana crea compra de contado hogar, compra personal suya, tarjeta + compra a 2 cuotas
reset role;
do $$
declare
  v_hogar uuid := current_setting('prueba.hogar_id')::uuid;
  v_ana uuid := current_setting('prueba.ana_id')::uuid;
  v_cat1 uuid;
  v_cat2 uuid;
  v_nequi uuid := current_setting('prueba.nequi_id')::uuid;
  v_compra_contado uuid := '99999999-9999-4999-8999-00000000c001';
  v_compra_personal uuid := '99999999-9999-4999-8999-00000000c002';
  v_compra_cuotas uuid := '99999999-9999-4999-8999-00000000c003';
  v_pasivo_id uuid := '99999999-9999-4999-8999-00000000d001';
  v_plan_id uuid := '99999999-9999-4999-8999-00000000e001';
  v_cuota1 uuid := '99999999-9999-4999-8999-00000000f001';
  v_cuota2 uuid := '99999999-9999-4999-8999-00000000f002';
begin
  select id into v_cat1 from public.categoria where hogar_id = v_hogar and nombre = 'Mercado' limit 1;
  select id into v_cat2 from public.categoria where hogar_id = v_hogar and nombre = 'Transporte' limit 1;
  perform set_config('prueba.cat1_id', v_cat1::text, true);
  perform set_config('prueba.cat2_id', v_cat2::text, true);

  perform set_config('prueba.compra_contado', v_compra_contado::text, true);
  perform set_config('prueba.compra_personal', v_compra_personal::text, true);
  perform set_config('prueba.compra_cuotas', v_compra_cuotas::text, true);
  perform set_config('prueba.plan_id', v_plan_id::text, true);
  perform set_config('prueba.pasivo_id', v_pasivo_id::text, true);
  perform set_config('prueba.cuota1_id', v_cuota1::text, true);

  insert into public.pasivo (
    id, hogar_id, tipo, nombre, ambito, owner_tipo, owner_miembro_id, tasa_tipo, tasa_ppm, activo, actualizado_por
  ) values (
    v_pasivo_id, v_hogar, 'tarjeta', 'Visa Ana', 'hogar', 'miembro', v_ana, null, null, true, v_ana
  );

  insert into public.tarjeta (
    pasivo_id, hogar_id, dia_corte, dia_pago, actualizado_por
  ) values (
    v_pasivo_id, v_hogar, 15, 5, v_ana
  );

  insert into public.compra (
    id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito, miembro_id,
    pago_tipo, medio_de_pago_id, financiada_por_pasivo_id, registrado_por, origen, actualizado_por
  ) values
    (v_compra_contado, v_hogar, '2026-11-10', 'D1 inicial', 50000, v_cat1, 'hogar', null,
     'contado', v_nequi, null, v_ana, 'manual', v_ana),
    (v_compra_personal, v_hogar, '2026-11-11', 'Secreto Ana', 20000, v_cat2, 'personal', v_ana,
     'contado', v_nequi, null, v_ana, 'manual', v_ana),
    (v_compra_cuotas, v_hogar, '2026-11-12', 'Televisor', 200000, v_cat1, 'hogar', null,
     'financiado', null, null, v_ana, 'manual', v_ana);

  insert into public.plan_de_cuotas (
    id, hogar_id, pasivo_id, origen, compra_id, fecha_inicio, capital, sistema,
    n_cuotas, fecha_primera_cuota, tasa_tipo, tasa_ppm, actualizado_por
  ) values (
    v_plan_id, v_hogar, v_pasivo_id, 'compra', v_compra_cuotas, '2026-11-12', 200000, 'capital_fijo',
    2, '2026-12-05', null, null, v_ana
  );

  insert into public.cuota (
    id, hogar_id, plan_id, numero, fecha_vencimiento, capital, actualizado_por
  ) values
    (v_cuota1, v_hogar, v_plan_id, 1, '2026-12-05', 100000, v_ana),
    (v_cuota2, v_hogar, v_plan_id, 2, '2027-01-05', 100000, v_ana);

  set constraints all immediate;
  set constraints all deferred;
end;
$$;
select pg_temp.como('99999999-9999-4999-8999-00000000a101');

-- 2-4. Editar compra de contado (monto, fecha, categoría, descripción, medio)
select is(
  (public.editar_compra(
    current_setting('prueba.compra_contado')::uuid,
    'D1 corregido',
    current_setting('prueba.cat2_id')::uuid,
    75000,
    '2026-11-19'::date,
    current_setting('prueba.banco_id')::uuid
  ) ->> 'monto_total')::bigint,
  75000::bigint,
  'editar_compra actualiza monto_total en compra de contado'
);

select is(
  (select descripcion || '|' || fecha::text || '|' || medio_de_pago_id::text
     from public.compra where id = current_setting('prueba.compra_contado')::uuid),
  'D1 corregido|2026-11-19|' || current_setting('prueba.banco_id'),
  'editar_compra actualiza descripción, fecha y medio en compra de contado'
);

-- 5-6. Compra a cuotas permite editar descripción/categoría pero rechaza cambio de monto
select is(
  (public.editar_compra(
    current_setting('prueba.compra_cuotas')::uuid,
    'TV corregido',
    current_setting('prueba.cat2_id')::uuid,
    null,
    null,
    null
  ) ->> 'descripcion'),
  'TV corregido',
  'editar_compra actualiza descripción y categoría en compra a cuotas'
);

select throws_ok(
  $$ select public.editar_compra(current_setting('prueba.compra_cuotas')::uuid, 'TV', current_setting('prueba.cat1_id')::uuid, 99999, null, null) $$,
  '22023', null,
  'rechaza cambiar monto en compra a cuotas'
);

-- 7-8. Privacidad: Beto no puede editar ni anular compra personal de Ana
select pg_temp.como('99999999-9999-4999-8999-00000000b102');
select throws_ok(
  $$ select public.editar_compra(current_setting('prueba.compra_personal')::uuid, 'Hack', current_setting('prueba.cat1_id')::uuid, 1000, null, null) $$,
  '22023', null,
  'otro miembro no puede editar compra personal ajena'
);
select throws_ok(
  $$ select public.anular_compra(current_setting('prueba.compra_personal')::uuid) $$,
  '22023', null,
  'otro miembro no puede anular compra personal ajena'
);

-- 9-10. Anular compra de contado y luego verificar rechazo de doble anulación
select pg_temp.como('99999999-9999-4999-8999-00000000a101');
select is(
  (public.anular_compra(current_setting('prueba.compra_contado')::uuid) ->> 'anulada')::boolean,
  true,
  'anular_compra marca anulada la compra de contado'
);
select is(
  (select eliminado_en is not null from public.compra where id = current_setting('prueba.compra_contado')::uuid),
  true,
  'eliminado_en queda registrado en compra'
);
select throws_ok(
  $$ select public.anular_compra(current_setting('prueba.compra_contado')::uuid) $$,
  '22023', null,
  'no permite anular dos veces la misma compra'
);

-- 11-12. Compra a cuotas sin pagos se anula atómicamente (compra + plan + cuotas)
select is(
  (public.anular_compra(current_setting('prueba.compra_cuotas')::uuid) ->> 'anulada')::boolean,
  true,
  'anular_compra anula compra a cuotas sin pagos registrados'
);
select is(
  (select count(*)::int from public.cuota where plan_id = current_setting('prueba.plan_id')::uuid and eliminado_en is null),
  0,
  'las cuotas del plan quedan soft-deleted al anular compra a cuotas'
);

select * from finish();
rollback;
