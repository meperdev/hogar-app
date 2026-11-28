-- Evalúa constraints y triggers diferidos DENTRO de las RPCs SECURITY DEFINER
-- (`eliminar_pasivo` y `anular_compra`) antes de salir al rol `authenticated`,
-- evitando el error `42501 permission denied for function validar_plan_id / verificar_libro`
-- al hacer COMMIT fuera del contexto SECURITY DEFINER.

create or replace function public.eliminar_pasivo(p_pasivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_pasivo public.pasivo;
  v_ahora timestamptz := now();
  v_tiene_compras boolean := false;
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;

  select m.id, m.hogar_id, m.rol into v_actor
    from public.miembro m
   where m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null
   limit 1;

  if not found then
    raise exception 'se necesita pertenecer a un hogar activo' using errcode = '42501';
  end if;

  if p_pasivo_id is null then
    raise exception 'pasivo no encontrado' using errcode = '22023';
  end if;

  select * into v_pasivo
    from public.pasivo p
   where p.id = p_pasivo_id
     and p.hogar_id = v_actor.hogar_id
     and p.eliminado_en is null;

  if not found or (v_pasivo.ambito = 'personal' and v_pasivo.owner_miembro_id is distinct from v_actor.id) then
    raise exception 'pasivo no encontrado' using errcode = '22023';
  end if;

  if v_pasivo.ambito = 'hogar' then
    perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;
  else
    perform 1
      from public.personal_seq ps
     where ps.hogar_id = v_actor.hogar_id
       and ps.miembro_id = v_actor.id
       for update;
  end if;

  select * into v_pasivo
    from public.pasivo p
   where p.id = p_pasivo_id
     and p.hogar_id = v_actor.hogar_id
     and p.eliminado_en is null
     for update;

  if not found then
    raise exception 'pasivo no encontrado' using errcode = '22023';
  end if;

  select (
    exists (
      select 1
        from public.compra c
       where c.hogar_id = v_actor.hogar_id
         and c.eliminado_en is null
         and c.financiada_por_pasivo_id = v_pasivo.id
    )
    or exists (
      select 1
        from public.plan_de_cuotas pl
        join public.compra c on c.id = pl.compra_id
       where pl.hogar_id = v_actor.hogar_id
         and pl.pasivo_id = v_pasivo.id
         and pl.eliminado_en is null
         and c.eliminado_en is null
    )
  ) into v_tiene_compras;

  if v_tiene_compras then
    update public.pasivo
       set activo = false,
           actualizado_en = v_ahora,
           actualizado_por = v_actor.id
     where id = v_pasivo.id
       and hogar_id = v_actor.hogar_id;

    set constraints all immediate;
    set constraints all deferred;

    return pg_catalog.jsonb_build_object('id', v_pasivo.id, 'accion', 'archivado');
  end if;

  -- Orden inverso de dependencias: pagos, costos, cuotas, planes, subtipo y pasivo.
  update public.pago_de_deuda
     set eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where hogar_id = v_actor.hogar_id
     and pasivo_id = v_pasivo.id
     and eliminado_en is null;

  update public.costo_financiero
     set eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where hogar_id = v_actor.hogar_id
     and eliminado_en is null
     and (
       pasivo_id = v_pasivo.id
       or cuota_id in (
         select q.id
           from public.cuota q
           join public.plan_de_cuotas pl on pl.id = q.plan_id
          where pl.pasivo_id = v_pasivo.id
            and pl.hogar_id = v_actor.hogar_id
       )
     );

  update public.cuota
     set eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where hogar_id = v_actor.hogar_id
     and eliminado_en is null
     and plan_id in (
       select pl.id
         from public.plan_de_cuotas pl
        where pl.pasivo_id = v_pasivo.id
          and pl.hogar_id = v_actor.hogar_id
     );

  update public.plan_de_cuotas
     set eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where hogar_id = v_actor.hogar_id
     and pasivo_id = v_pasivo.id
     and eliminado_en is null;

  update public.tarjeta
     set eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where hogar_id = v_actor.hogar_id
     and pasivo_id = v_pasivo.id
     and eliminado_en is null;

  update public.credito
     set eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where hogar_id = v_actor.hogar_id
     and pasivo_id = v_pasivo.id
     and eliminado_en is null;

  update public.deuda
     set eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where hogar_id = v_actor.hogar_id
     and pasivo_id = v_pasivo.id
     and eliminado_en is null;

  update public.pasivo
     set activo = false,
         eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where id = v_pasivo.id
     and hogar_id = v_actor.hogar_id;

  -- Disparar triggers diferidos dentro de SECURITY DEFINER.
  set constraints all immediate;
  set constraints all deferred;

  return pg_catalog.jsonb_build_object('id', v_pasivo.id, 'accion', 'eliminado');
end;
$$;

revoke all on function public.eliminar_pasivo(uuid) from public, anon;
grant execute on function public.eliminar_pasivo(uuid) to authenticated;

create or replace function public.anular_compra(p_compra_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_compra public.compra;
  v_plan public.plan_de_cuotas;
  v_ahora timestamptz := now();
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;

  select m.id, m.hogar_id, m.rol into v_actor
    from public.miembro m
   where m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null
   limit 1;

  if not found then
    raise exception 'se necesita pertenecer a un hogar activo' using errcode = '42501';
  end if;

  if p_compra_id is null then
    raise exception 'compra no encontrada' using errcode = '22023';
  end if;

  select * into v_compra
    from public.compra c
   where c.id = p_compra_id
     and c.hogar_id = v_actor.hogar_id
     and c.eliminado_en is null;

  if not found or (v_compra.ambito = 'personal' and v_compra.miembro_id is distinct from v_actor.id) then
    raise exception 'compra no encontrada' using errcode = '22023';
  end if;

  if v_compra.ambito = 'hogar' or v_compra.item_despensa_id is not null then
    perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;
  end if;
  if v_compra.ambito = 'personal' then
    perform 1
      from public.personal_seq ps
     where ps.hogar_id = v_actor.hogar_id
       and ps.miembro_id = v_actor.id
       for update;
  end if;

  select * into v_compra
    from public.compra c
   where c.id = p_compra_id
     and c.hogar_id = v_actor.hogar_id
     and c.eliminado_en is null
     for update;

  if not found then
    raise exception 'compra no encontrada' using errcode = '22023';
  end if;

  if v_compra.pago_tipo = 'financiado' then
    select * into v_plan
      from public.plan_de_cuotas pl
     where pl.compra_id = v_compra.id
       and pl.hogar_id = v_actor.hogar_id
       and pl.eliminado_en is null
       for update;

    if found then
      if exists (
        select 1
          from public.pago_de_deuda pg
          join public.cuota c on c.id = pg.cuota_id
         where c.plan_id = v_plan.id
           and pg.hogar_id = v_actor.hogar_id
           and pg.eliminado_en is null
      ) then
        raise exception 'la compra a cuotas ya tiene pagos registrados' using errcode = '23514';
      end if;

      update public.costo_financiero kf
         set eliminado_en = v_ahora,
             actualizado_en = v_ahora,
             actualizado_por = v_actor.id
       where kf.hogar_id = v_actor.hogar_id
         and kf.eliminado_en is null
         and kf.cuota_id in (
           select c.id from public.cuota c
            where c.plan_id = v_plan.id and c.hogar_id = v_actor.hogar_id
         );

      update public.cuota
         set eliminado_en = v_ahora,
             actualizado_en = v_ahora,
             actualizado_por = v_actor.id
       where plan_id = v_plan.id
         and hogar_id = v_actor.hogar_id
         and eliminado_en is null;

      update public.plan_de_cuotas
         set eliminado_en = v_ahora,
             actualizado_en = v_ahora,
             actualizado_por = v_actor.id
       where id = v_plan.id
         and hogar_id = v_actor.hogar_id;
    end if;
  end if;

  if v_compra.item_despensa_id is not null then
    update public.nivel_despensa
       set eliminado_en = v_ahora,
           actualizado_en = v_ahora,
           actualizado_por = v_actor.id
     where compra_id = v_compra.id
       and hogar_id = v_actor.hogar_id
       and eliminado_en is null;
  end if;

  update public.compra
     set eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where id = v_compra.id
     and hogar_id = v_actor.hogar_id;

  -- Disparar triggers diferidos dentro de SECURITY DEFINER.
  set constraints all immediate;
  set constraints all deferred;

  return pg_catalog.jsonb_build_object('id', v_compra.id, 'anulada', true);
end;
$$;

revoke all on function public.anular_compra(uuid) from public, anon;
grant execute on function public.anular_compra(uuid) to authenticated;
