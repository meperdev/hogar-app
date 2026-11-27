-- RPCs atómicas para editar y anular compras desde la vista de Gastos generales.
-- Referencias: docs/data-model.md §3.7, §3.8, §4 (I2, I3, I11, I18).

-- ---------------------------------------------------------------------------
-- RPC: editar_compra
-- ---------------------------------------------------------------------------
-- Permite corregir descripción y categoría (si no es compra de obligación), y en
-- compras de contado sin préstamo también monto_total, fecha y medio_de_pago_id.
-- Nunca cambia ámbito, hogar ni dueño (I18).

create function public.editar_compra(
  p_compra_id uuid,
  p_descripcion text,
  p_categoria_id uuid,
  p_monto_total bigint default null,
  p_fecha date default null,
  p_medio_de_pago_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_compra public.compra;
  v_desc text := pg_catalog.regexp_replace(coalesce(p_descripcion, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_monto bigint;
  v_fecha date;
  v_medio_id uuid;
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

  if p_compra_id is null or p_categoria_id is null then
    raise exception 'datos incompletos para editar la compra' using errcode = '22023';
  end if;

  if pg_catalog.char_length(v_desc) > 200 then
    raise exception 'la descripción no puede superar 200 caracteres' using errcode = '22023';
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

  if not exists (
    select 1
      from public.categoria cat
     where cat.id = p_categoria_id
       and cat.hogar_id = v_actor.hogar_id
       and cat.eliminado_en is null
  ) then
    raise exception 'categoría no encontrada' using errcode = '22023';
  end if;

  if v_compra.obligacion_id is not null and p_categoria_id is distinct from v_compra.categoria_id then
    raise exception 'la categoría de una obligación no se puede cambiar' using errcode = '22023';
  end if;

  v_monto := coalesce(p_monto_total, v_compra.monto_total);
  v_fecha := coalesce(p_fecha, v_compra.fecha);
  v_medio_id := coalesce(p_medio_de_pago_id, v_compra.medio_de_pago_id);

  if v_compra.pago_tipo = 'financiado' then
    if v_monto is distinct from v_compra.monto_total
       or v_fecha is distinct from v_compra.fecha
       or (p_medio_de_pago_id is not null and p_medio_de_pago_id is distinct from v_compra.medio_de_pago_id) then
      raise exception 'en una compra a cuotas solo se puede editar descripción y categoría'
        using errcode = '22023';
    end if;
  else
    if v_monto <= 0 then
      raise exception 'el monto debe ser mayor a $0' using errcode = '22023';
    end if;

    if v_compra.financiada_por_pasivo_id is not null then
      if p_medio_de_pago_id is not null then
        raise exception 'en una compra con préstamo no se puede cambiar el medio de pago'
          using errcode = '22023';
      end if;
    else
      if v_medio_id is null or not exists (
        select 1
          from public.medio_de_pago mp
         where mp.id = v_medio_id
           and mp.hogar_id = v_actor.hogar_id
           and mp.eliminado_en is null
      ) then
        raise exception 'medio de pago no encontrado' using errcode = '22023';
      end if;
    end if;
  end if;

  update public.compra
     set descripcion = v_desc,
         categoria_id = p_categoria_id,
         monto_total = v_monto,
         fecha = v_fecha,
         medio_de_pago_id = case when v_compra.pago_tipo = 'contado' and v_compra.financiada_por_pasivo_id is null
                                 then v_medio_id
                                 else medio_de_pago_id end,
         iva = case when iva is not null and v_monto < iva then null else iva end,
         actualizado_en = now(),
         actualizado_por = v_actor.id
   where id = v_compra.id
     and hogar_id = v_actor.hogar_id;

  if v_compra.item_despensa_id is not null and v_fecha is distinct from v_compra.fecha then
    update public.nivel_despensa
       set fecha = v_fecha,
           actualizado_en = now(),
           actualizado_por = v_actor.id
     where compra_id = v_compra.id
       and hogar_id = v_actor.hogar_id
       and eliminado_en is null;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_compra.id,
    'monto_total', v_monto,
    'fecha', v_fecha,
    'categoria_id', p_categoria_id,
    'descripcion', v_desc
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: anular_compra
-- ---------------------------------------------------------------------------
-- Marca eliminado_en en la compra (y en su plan/cuotas/costos o nivel_despensa
-- asociados si aplica). Bloquea anulación de compras a cuotas que ya tienen
-- abonos registrados en pago_de_deuda.

create function public.anular_compra(p_compra_id uuid)
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

  return pg_catalog.jsonb_build_object('id', v_compra.id, 'anulada', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

revoke all on function
  public.editar_compra(uuid, text, uuid, bigint, date, uuid),
  public.anular_compra(uuid)
  from public, anon;

grant execute on function
  public.editar_compra(uuid, text, uuid, bigint, date, uuid),
  public.anular_compra(uuid)
  to authenticated;
