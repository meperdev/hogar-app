-- Soporte para asociar múltiples mascotas a un mismo insumo de despensa.
-- Preserva `mascota_id` para insumos de una sola mascota (`null` si aplica a varias o todas)
-- y agrega `mascota_ids uuid[]` para selección múltiple exacta.

alter table public.item_despensa
  add column if not exists mascota_ids uuid[] not null default '{}'::uuid[];

update public.item_despensa
   set mascota_ids = array[mascota_id]
 where mascota_id is not null
   and cardinality(mascota_ids) = 0;

create or replace function public.sync_push_mascotas(p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_hogar_id uuid;
  v_lote_id uuid;
  v_tipo text;
  v_actor uuid;
  v_previo jsonb;
  v_filas jsonb;
  v_tabla text;
  v_mascotas jsonb;
  v_items jsonb;
  v_niveles jsonb;
  v_compras jsonb;
  v_planes jsonb;
  v_cuotas jsonb;
  v_costos jsonb;
  v_compra_ambito text;
  v_compra_miembro uuid;
  v_item_id uuid;
  v_mascota_id uuid;
  v_mascota_ids uuid[];
  v_item_mascota uuid;
  v_actualizar_monto boolean;
  v_compra_id uuid;
  v_compra_monto bigint;
  v_salida jsonb := '[]'::jsonb;
  v_parcial jsonb;
  v_resultado jsonb;
  v_restriccion text;
  v_mensaje text;
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;

  if pg_catalog.jsonb_typeof(p_lote) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_lote -> 'filas') is distinct from 'object' then
    return private.rechazo('invalido', 'forma del lote');
  end if;

  if (p_lote ->> 'schema_version') is distinct from '1' then
    return private.rechazo('actualizar_app');
  end if;

  v_tipo := p_lote ->> 'tipo';
  if v_tipo is null or v_tipo not in ('mascota', 'item_despensa', 'ajuste_nivel', 'recompra') then
    return private.rechazo('invalido', 'tipo de lote no admitido');
  end if;

  begin
    v_hogar_id := (p_lote ->> 'hogar_id')::uuid;
    v_lote_id := (p_lote ->> 'lote_id')::uuid;
  exception when invalid_text_representation then
    return private.rechazo('invalido', 'identificadores del lote');
  end;

  if v_hogar_id is null or v_lote_id is null then
    return private.rechazo('invalido', 'identificadores del lote');
  end if;

  select m.id into v_actor
    from public.miembro m
   where m.hogar_id = v_hogar_id
     and m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null;

  if v_actor is null then
    return private.rechazo('no_autorizado');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'sync_push_mascotas:' || v_hogar_id::text || ':' || v_actor::text || ':' || v_lote_id::text, 0));

  select la.resultado into v_previo
    from public.lote_aplicado la
   where la.hogar_id = v_hogar_id
     and la.autor_miembro_id = v_actor
     and la.lote_id = v_lote_id;
  if found then
    return v_previo;
  end if;

  v_filas := p_lote -> 'filas';
  for v_tabla in select pg_catalog.jsonb_object_keys(v_filas) loop
    if pg_catalog.jsonb_typeof(v_filas -> v_tabla) <> 'array' then
      return private.rechazo('invalido', 'tabla mal formada: ' || v_tabla);
    end if;
    if v_tipo = 'mascota' and v_tabla <> 'mascota'
       or v_tipo = 'item_despensa' and v_tabla <> 'item_despensa'
       or v_tipo = 'ajuste_nivel' and v_tabla <> 'nivel_despensa'
       or v_tipo = 'recompra' and v_tabla not in (
         'compra', 'plan_de_cuotas', 'cuota', 'costo_financiero', 'nivel_despensa') then
      return private.rechazo('invalido', 'tabla no admitida para este lote: ' || v_tabla);
    end if;
  end loop;

  if exists (
    select 1
      from pg_catalog.jsonb_each(v_filas) t,
           pg_catalog.jsonb_array_elements(t.value) e
     where pg_catalog.jsonb_typeof(e) <> 'object'
        or pg_catalog.jsonb_typeof(e -> 'base_seq') is not null
           and pg_catalog.jsonb_typeof(e -> 'base_seq') <> 'null'
  ) then
    return private.rechazo('invalido', 'solo altas: base_seq debe ser nulo');
  end if;

  begin
    if v_tipo = 'mascota' then
      v_mascotas := coalesce(v_filas -> 'mascota', '[]'::jsonb);
      if pg_catalog.jsonb_array_length(v_mascotas) <> 1 then
        return private.rechazo('invalido', 'un lote de mascota lleva exactamente una fila');
      end if;

      perform 1 from public.hogar_seq where hogar_id = v_hogar_id for update;

      with ins as (
        insert into public.mascota (
          id, hogar_id, nombre, especie, fecha_nacimiento, activa, actualizado_por)
        select x.id, v_hogar_id, x.nombre, x.especie, x.fecha_nacimiento,
               coalesce(x.activa, true), v_actor
          from pg_catalog.jsonb_to_recordset(v_mascotas) as x (
            id uuid, nombre text, especie text, fecha_nacimiento date, activa boolean)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'mascota', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

    elsif v_tipo = 'item_despensa' then
      v_items := coalesce(v_filas -> 'item_despensa', '[]'::jsonb);
      if pg_catalog.jsonb_array_length(v_items) <> 1 then
        return private.rechazo('invalido', 'un lote de insumo lleva exactamente una fila');
      end if;

      v_mascota_id := (v_items -> 0 ->> 'mascota_id')::uuid;
      select coalesce(
               array_agg(distinct mid) filter (where mid is not null),
               '{}'::uuid[]
             )
        into v_mascota_ids
        from (
          select (e)::uuid as mid
            from pg_catalog.jsonb_array_elements_text(
              case
                when pg_catalog.jsonb_typeof(v_items -> 0 -> 'mascota_ids') = 'array'
                  then v_items -> 0 -> 'mascota_ids'
                else '[]'::jsonb
              end
            ) as e
          union all
          select v_mascota_id
           where (
             pg_catalog.jsonb_typeof(v_items -> 0 -> 'mascota_ids') is distinct from 'array'
             or pg_catalog.jsonb_array_length(v_items -> 0 -> 'mascota_ids') = 0
           )
             and v_mascota_id is not null
        ) s;

      if exists (
        select 1
          from unnest(v_mascota_ids) as mid
         where not exists (
           select 1 from public.mascota ma
            where ma.hogar_id = v_hogar_id
              and ma.id = mid
              and ma.eliminado_en is null
         )
      ) then
        return private.rechazo('invalido', 'mascota no pertenece al hogar');
      end if;

      v_mascota_id := case when cardinality(v_mascota_ids) = 1 then v_mascota_ids[1] else null end;

      perform 1 from public.hogar_seq where hogar_id = v_hogar_id for update;

      with ins as (
        insert into public.item_despensa (
          id, hogar_id, mascota_id, mascota_ids, nombre, tipo, categoria_id, frecuencia_dias,
          umbral_alerta_pct, monto_habitual, activo, actualizado_por)
        select x.id, v_hogar_id, v_mascota_id, v_mascota_ids, x.nombre, coalesce(x.tipo, 'otro'),
               x.categoria_id, x.frecuencia_dias, coalesce(x.umbral_alerta_pct, 20),
               x.monto_habitual, coalesce(x.activo, true), v_actor
          from pg_catalog.jsonb_to_recordset(v_items) as x (
            id uuid, nombre text, tipo text, categoria_id uuid,
            frecuencia_dias smallint, umbral_alerta_pct integer, monto_habitual bigint,
            activo boolean)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'item_despensa', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

    elsif v_tipo = 'ajuste_nivel' then
      v_niveles := coalesce(v_filas -> 'nivel_despensa', '[]'::jsonb);
      if pg_catalog.jsonb_array_length(v_niveles) <> 1 then
        return private.rechazo('invalido', 'un lote de ajuste lleva exactamente un nivel');
      end if;
      if (v_niveles -> 0 ->> 'origen') is distinct from 'ajuste'
         or (v_niveles -> 0 ->> 'compra_id') is not null then
        return private.rechazo('invalido', 'un ajuste manual exige origen ajuste y compra_id nulo');
      end if;

      perform 1 from public.hogar_seq where hogar_id = v_hogar_id for update;

      with ins as (
        insert into public.nivel_despensa (
          id, hogar_id, item_despensa_id, compra_id, fecha, nivel_pct, origen, actualizado_por)
        select x.id, v_hogar_id, x.item_despensa_id, null, x.fecha, x.nivel_pct, 'ajuste', v_actor
          from pg_catalog.jsonb_to_recordset(v_niveles) as x (
            id uuid, item_despensa_id uuid, fecha date, nivel_pct integer)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'nivel_despensa', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

    else
      v_compras := coalesce(v_filas -> 'compra', '[]'::jsonb);
      v_planes := coalesce(v_filas -> 'plan_de_cuotas', '[]'::jsonb);
      v_cuotas := coalesce(v_filas -> 'cuota', '[]'::jsonb);
      v_costos := coalesce(v_filas -> 'costo_financiero', '[]'::jsonb);
      v_niveles := coalesce(v_filas -> 'nivel_despensa', '[]'::jsonb);

      if pg_catalog.jsonb_array_length(v_compras) <> 1
         or pg_catalog.jsonb_array_length(v_niveles) <> 1 then
        return private.rechazo('invalido', 'una recompra lleva exactamente una compra y un nivel');
      end if;

      if pg_catalog.jsonb_array_length(v_planes) > 1
         or pg_catalog.jsonb_array_length(v_cuotas) > 360
         or pg_catalog.jsonb_array_length(v_costos) > 360 then
        return private.rechazo('invalido', 'demasiadas cuotas en el lote');
      end if;

      v_compra_ambito := v_compras -> 0 ->> 'ambito';
      v_compra_miembro := (v_compras -> 0 ->> 'miembro_id')::uuid;
      v_compra_id := (v_compras -> 0 ->> 'id')::uuid;
      v_item_id := (v_compras -> 0 ->> 'item_despensa_id')::uuid;
      v_mascota_id := (v_compras -> 0 ->> 'mascota_id')::uuid;
      v_actualizar_monto := coalesce((p_lote ->> 'actualizar_monto_habitual')::boolean, false);

      if v_compra_ambito is distinct from 'hogar' and v_compra_ambito is distinct from 'personal' then
        return private.rechazo('invalido', 'ámbito de compra inválido');
      end if;

      if v_compra_ambito = 'personal' and v_compra_miembro is distinct from v_actor then
        return private.rechazo('no_autorizado');
      end if;

      -- I23: una compra personal jamás modifica el monto habitual compartido.
      if v_compra_ambito = 'personal' and v_actualizar_monto then
        return private.rechazo('invalido', 'una compra personal no actualiza el monto habitual compartido');
      end if;

      if v_item_id is null then
        return private.rechazo('invalido', 'la recompra exige item_despensa_id');
      end if;

      select it.mascota_id into v_item_mascota
        from public.item_despensa it
       where it.id = v_item_id
         and it.hogar_id = v_hogar_id
         and it.eliminado_en is null;

      if not found then
        return private.rechazo('invalido', 'insumo inexistente');
      end if;

      if v_item_mascota is not null and v_mascota_id is distinct from v_item_mascota then
        return private.rechazo('invalido', 'la mascota de la compra no coincide con la del insumo');
      end if;

      -- Visibilidad del pasivo antes de inspeccionar atributos (no revela libros ajenos).
      if exists (
        select 1
          from (
            select (v_compras -> 0 ->> 'financiada_por_pasivo_id')::uuid as pasivo_id
            union all
            select (e ->> 'pasivo_id')::uuid from pg_catalog.jsonb_array_elements(v_planes) e
            union all
            select (e ->> 'pasivo_id')::uuid from pg_catalog.jsonb_array_elements(v_costos) e
          ) r
         where r.pasivo_id is not null
           and not exists (
             select 1 from public.pasivo pa
              where pa.id = r.pasivo_id
                and pa.hogar_id = v_hogar_id
                and private.puede_ver(pa.hogar_id, pa.ambito, pa.owner_miembro_id))
      ) then
        return private.rechazo('invalido', 'pasivo inexistente');
      end if;

      if exists (
        select 1
          from pg_catalog.jsonb_to_recordset(v_planes) as p (
            origen text, compra_id uuid, pasivo_id uuid, tasa_tipo text, tasa_ppm integer)
          left join public.pasivo pa on pa.id = p.pasivo_id and pa.hogar_id = v_hogar_id
         where p.origen is distinct from 'compra'
            or p.compra_id is distinct from v_compra_id
            or pa.id is null
            or (p.tasa_tipo, p.tasa_ppm) is distinct from (pa.tasa_tipo, pa.tasa_ppm)
      ) or exists (
        select 1 from pg_catalog.jsonb_to_recordset(v_cuotas) as c (plan_id uuid)
         where c.plan_id is null or c.plan_id not in (
           select (e ->> 'id')::uuid from pg_catalog.jsonb_array_elements(v_planes) e)
      ) or exists (
        select 1 from pg_catalog.jsonb_to_recordset(v_costos) as k (tipo text, origen text, cuota_id uuid)
         where k.tipo is distinct from 'interes'
            or k.origen is distinct from 'calculado'
            or k.cuota_id is null
            or k.cuota_id not in (
              select (e ->> 'id')::uuid from pg_catalog.jsonb_array_elements(v_cuotas) e)
      ) then
        return private.rechazo('invalido', 'dependientes ajenos a la compra del lote');
      end if;

      -- I25: solo bloquea el carril que toca la compra; personal nunca toca hogar_seq.
      if v_compra_ambito = 'hogar' then
        perform 1 from public.hogar_seq where hogar_id = v_hogar_id for update;
        if v_actualizar_monto then
          perform 1 from public.item_despensa
           where id = v_item_id and hogar_id = v_hogar_id
             for update;
        end if;
      else
        perform 1 from public.personal_seq
         where hogar_id = v_hogar_id and miembro_id = v_actor
           for update;
      end if;

      perform 1 from public.pasivo pa
       where pa.hogar_id = v_hogar_id
         and pa.id in (
           select (v_compras -> 0 ->> 'financiada_por_pasivo_id')::uuid
           union all
           select (e ->> 'pasivo_id')::uuid from pg_catalog.jsonb_array_elements(v_planes) e)
       order by pa.id
         for update;

      with ins as (
        insert into public.compra (
          id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito, miembro_id,
          pago_tipo, medio_de_pago_id, financiada_por_pasivo_id, registrado_por, cufe,
          nit_comercio, iva, origen, mascota_id, item_despensa_id, actualizado_por)
        select x.id, v_hogar_id, x.fecha, x.descripcion, x.monto_total, x.categoria_id,
               x.ambito, x.miembro_id, x.pago_tipo, x.medio_de_pago_id,
               x.financiada_por_pasivo_id, v_actor, x.cufe, x.nit_comercio, x.iva,
               coalesce(x.origen, 'manual'), x.mascota_id, x.item_despensa_id, v_actor
          from pg_catalog.jsonb_to_recordset(v_compras) as x (
            id uuid, fecha date, descripcion text, monto_total bigint, categoria_id uuid,
            ambito text, miembro_id uuid, pago_tipo text, medio_de_pago_id uuid,
            financiada_por_pasivo_id uuid, cufe text, nit_comercio text, iva bigint,
            origen text, mascota_id uuid, item_despensa_id uuid)
        returning id, seq, monto_total
      )
      select (select monto_total from ins limit 1),
             pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'compra', 'id', id, 'seq', seq))
        into v_compra_monto, v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.plan_de_cuotas (
          id, hogar_id, pasivo_id, origen, compra_id, fecha_inicio, capital, sistema,
          n_cuotas, fecha_primera_cuota, tasa_tipo, tasa_ppm, actualizado_por)
        select p.id, v_hogar_id, p.pasivo_id, p.origen, p.compra_id, p.fecha_inicio, p.capital,
               p.sistema, p.n_cuotas, p.fecha_primera_cuota, p.tasa_tipo, p.tasa_ppm, v_actor
          from pg_catalog.jsonb_to_recordset(v_planes) as p (
            id uuid, pasivo_id uuid, origen text, compra_id uuid, fecha_inicio date,
            capital bigint, sistema text, n_cuotas smallint, fecha_primera_cuota date,
            tasa_tipo text, tasa_ppm integer)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'plan_de_cuotas', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.cuota (id, hogar_id, plan_id, numero, fecha_vencimiento, capital, actualizado_por)
        select c.id, v_hogar_id, c.plan_id, c.numero, c.fecha_vencimiento, c.capital, v_actor
          from pg_catalog.jsonb_to_recordset(v_cuotas) as c (
            id uuid, plan_id uuid, numero smallint, fecha_vencimiento date, capital bigint)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'cuota', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.costo_financiero (
          id, hogar_id, tipo, monto, fecha_causacion, pasivo_id, medio_de_pago_id, cuota_id,
          origen, descripcion, registrado_por, actualizado_por)
        select k.id, v_hogar_id, k.tipo, k.monto, k.fecha_causacion, k.pasivo_id, null,
               k.cuota_id, k.origen, k.descripcion, v_actor, v_actor
          from pg_catalog.jsonb_to_recordset(v_costos) as k (
            id uuid, tipo text, monto bigint, fecha_causacion date, pasivo_id uuid,
            cuota_id uuid, origen text, descripcion text)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'costo_financiero', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.nivel_despensa (
          id, hogar_id, item_despensa_id, compra_id, fecha, nivel_pct, origen, actualizado_por)
        select n.id, v_hogar_id, n.item_despensa_id, n.compra_id, n.fecha, n.nivel_pct,
               n.origen, v_actor
          from pg_catalog.jsonb_to_recordset(v_niveles) as n (
            id uuid, item_despensa_id uuid, compra_id uuid, fecha date, nivel_pct integer,
            origen text)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'nivel_despensa', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      if v_compra_ambito = 'hogar' and v_actualizar_monto then
        with upd as (
          update public.item_despensa
             set monto_habitual = v_compra_monto,
                 actualizado_por = v_actor,
                 actualizado_en = now()
           where id = v_item_id and hogar_id = v_hogar_id
          returning id, seq
        )
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'item_despensa', 'id', id, 'seq', seq))
          into v_parcial from upd;
        v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);
      end if;
    end if;

    set constraints all immediate;

    v_resultado := pg_catalog.jsonb_build_object('estado', 'aplicado', 'filas', v_salida);

    insert into public.lote_aplicado (hogar_id, autor_miembro_id, lote_id, resultado)
    values (v_hogar_id, v_actor, v_lote_id, v_resultado);

    set constraints all deferred;
  exception
    when unique_violation then
      set constraints all deferred;
      get stacked diagnostics v_restriccion = constraint_name;
      return private.rechazo('duplicado', v_restriccion);
    when integrity_constraint_violation or data_exception then
      set constraints all deferred;
      get stacked diagnostics v_restriccion = constraint_name, v_mensaje = message_text;
      return private.rechazo('invalido', coalesce(nullif(v_restriccion, ''), v_mensaje));
  end;

  return v_resultado;
end;
$$;
