-- Medios de pago asignables a cualquier miembro del hogar (crear/editar),
-- edición/eliminación de abonos (`pago_de_deuda`) y opción de incluir un abono
-- en Gastos del mes (`incluir_en_gastos`, `categoria_gasto_id`) sin duplicar en Balance.

-- ---------------------------------------------------------------------------
-- 1. Medios de pago: asignar/editar dueño (`owner_miembro_id`)
-- ---------------------------------------------------------------------------

drop function if exists public.crear_medio_de_pago(text, text, text);

create function public.crear_medio_de_pago(
  p_nombre text,
  p_tipo text,
  p_owner_tipo text default 'miembro',
  p_owner_miembro_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_nombre text := pg_catalog.regexp_replace(coalesce(p_nombre, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_id uuid;
  v_owner_miembro_id uuid;
  v_orden smallint;
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

  if not private.nombre_visible(v_nombre) then
    raise exception 'el nombre del medio debe tener entre 1 y 80 caracteres' using errcode = '22023';
  end if;

  if p_tipo is null or p_tipo not in ('efectivo', 'cuenta') then
    raise exception 'tipo de medio inválido' using errcode = '22023';
  end if;

  if p_owner_tipo is null or p_owner_tipo not in ('miembro', 'hogar') then
    raise exception 'dueño de medio inválido' using errcode = '22023';
  end if;

  if p_owner_tipo = 'hogar' then
    v_owner_miembro_id := null;
  else
    v_owner_miembro_id := coalesce(p_owner_miembro_id, v_actor.id);
    if not exists (
      select 1
        from public.miembro m
       where m.id = v_owner_miembro_id
         and m.hogar_id = v_actor.hogar_id
         and m.activo
         and m.eliminado_en is null
    ) then
      raise exception 'miembro dueño no válido para este hogar' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;

  if exists (
    select 1
      from public.medio_de_pago mp
     where mp.hogar_id = v_actor.hogar_id
       and mp.eliminado_en is null
       and mp.activo
       and pg_catalog.lower(mp.nombre) = pg_catalog.lower(v_nombre)
  ) then
    raise exception 'ya existe un medio de pago activo con ese nombre' using errcode = '23505';
  end if;

  select coalesce(max(mp.orden) + 1, 0)::smallint
    into v_orden
    from public.medio_de_pago mp
   where mp.hogar_id = v_actor.hogar_id
     and mp.eliminado_en is null;

  v_id := private.uuid_v7();

  insert into public.medio_de_pago (
    id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, activo, orden, actualizado_por
  ) values (
    v_id, v_actor.hogar_id, v_nombre, p_tipo, p_owner_tipo, v_owner_miembro_id, true, v_orden, v_actor.id
  );

  return pg_catalog.jsonb_build_object(
    'id', v_id,
    'nombre', v_nombre,
    'tipo', p_tipo,
    'owner_tipo', p_owner_tipo,
    'owner_miembro_id', v_owner_miembro_id,
    'activo', true,
    'orden', v_orden
  );
end;
$$;

create function public.editar_medio_de_pago(
  p_medio_id uuid,
  p_nombre text,
  p_owner_tipo text,
  p_owner_miembro_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_medio public.medio_de_pago;
  v_nombre text := pg_catalog.regexp_replace(coalesce(p_nombre, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_owner_miembro_id uuid;
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

  if p_medio_id is null or not private.nombre_visible(v_nombre) then
    raise exception 'datos de medio de pago inválidos' using errcode = '22023';
  end if;

  if p_owner_tipo is null or p_owner_tipo not in ('miembro', 'hogar') then
    raise exception 'dueño de medio inválido' using errcode = '22023';
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;

  select * into v_medio
    from public.medio_de_pago mp
   where mp.id = p_medio_id
     and mp.hogar_id = v_actor.hogar_id
     and mp.eliminado_en is null
   for update;

  if not found then
    raise exception 'medio de pago no encontrado' using errcode = '22023';
  end if;

  if v_medio.owner_miembro_id is distinct from v_actor.id and v_actor.rol <> 'admin' then
    raise exception 'solo el dueño o un administrador puede modificar este medio' using errcode = '42501';
  end if;

  if p_owner_tipo = 'hogar' then
    v_owner_miembro_id := null;
  else
    v_owner_miembro_id := coalesce(p_owner_miembro_id, v_actor.id);
    if not exists (
      select 1
        from public.miembro m
       where m.id = v_owner_miembro_id
         and m.hogar_id = v_actor.hogar_id
         and m.activo
         and m.eliminado_en is null
    ) then
      raise exception 'miembro dueño no válido para este hogar' using errcode = '22023';
    end if;
  end if;

  if v_medio.activo and exists (
    select 1
      from public.medio_de_pago mp
     where mp.hogar_id = v_actor.hogar_id
       and mp.id <> v_medio.id
       and mp.eliminado_en is null
       and mp.activo
       and pg_catalog.lower(mp.nombre) = pg_catalog.lower(v_nombre)
  ) then
    raise exception 'ya existe un medio de pago activo con ese nombre' using errcode = '23505';
  end if;

  update public.medio_de_pago
     set nombre = v_nombre,
         owner_tipo = p_owner_tipo,
         owner_miembro_id = v_owner_miembro_id,
         actualizado_en = now(),
         actualizado_por = v_actor.id
   where id = v_medio.id
     and hogar_id = v_actor.hogar_id;

  return pg_catalog.jsonb_build_object(
    'id', v_medio.id,
    'nombre', v_nombre,
    'tipo', v_medio.tipo,
    'owner_tipo', p_owner_tipo,
    'owner_miembro_id', v_owner_miembro_id,
    'activo', v_medio.activo,
    'orden', v_medio.orden
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Abonos registrables como gasto del mes (`pago_de_deuda`)
-- ---------------------------------------------------------------------------

alter table public.pago_de_deuda
  add column if not exists incluir_en_gastos boolean not null default false,
  add column if not exists categoria_gasto_id uuid;

alter table public.pago_de_deuda
  add constraint pago_de_deuda_categoria_gasto_fkey
    foreign key (hogar_id, categoria_gasto_id)
    references public.categoria (hogar_id, id),
  add constraint pago_de_deuda_gasto_valido_check
    check (
      (not incluir_en_gastos and categoria_gasto_id is null)
      or (incluir_en_gastos and tipo = 'abono' and categoria_gasto_id is not null)
    );

-- Actualizar sync_push_obligaciones para admitir incluir_en_gastos y categoria_gasto_id
create or replace function public.sync_push_obligaciones(p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_hogar_id uuid;
  v_lote_id uuid;
  v_actor uuid;
  v_previo jsonb;
  v_tipo text;
  v_filas jsonb;
  v_tabla text;
  v_permitidas text[];
  v_pasivo_id uuid;
  v_ambito text;
  v_dueno uuid;
  v_fila jsonb;
  v_n int;
  v_pasivos int;
  v_abonos int;
  v_safs int;
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
   where m.hogar_id = v_hogar_id and m.usuario_id = v_usuario_id
     and m.activo and m.eliminado_en is null;
  if v_actor is null then
    return private.rechazo('no_autorizado');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'sync_push:' || v_hogar_id::text || ':' || v_actor::text || ':' || v_lote_id::text, 0));

  select la.resultado into v_previo
    from public.lote_aplicado la
   where la.hogar_id = v_hogar_id and la.autor_miembro_id = v_actor and la.lote_id = v_lote_id;
  if found then
    return v_previo;
  end if;

  v_tipo := p_lote ->> 'tipo';
  v_permitidas := case v_tipo
    when 'pago' then array['pago_de_deuda', 'costo_financiero']
    when 'pasivo' then array['pasivo', 'tarjeta', 'credito', 'deuda', 'plan_de_cuotas', 'cuota']
    when 'obligacion' then array['obligacion']
    when 'pago_obligacion' then array['compra']
  end;
  if v_permitidas is null then
    return private.rechazo('invalido', 'tipo de lote desconocido');
  end if;

  v_filas := p_lote -> 'filas';
  for v_tabla in select pg_catalog.jsonb_object_keys(v_filas) loop
    if not (v_tabla = any (v_permitidas))
       or pg_catalog.jsonb_typeof(v_filas -> v_tabla) <> 'array'
       or pg_catalog.jsonb_array_length(v_filas -> v_tabla) > 360 then
      return private.rechazo('invalido', 'tabla no admitida: ' || v_tabla);
    end if;
  end loop;

  if exists (
    select 1
      from pg_catalog.jsonb_each(v_filas) t, pg_catalog.jsonb_array_elements(t.value) e
     where pg_catalog.jsonb_typeof(e) <> 'object'
        or (t.key <> 'costo_financiero'
            and pg_catalog.jsonb_typeof(e -> 'base_seq') is distinct from null
            and pg_catalog.jsonb_typeof(e -> 'base_seq') <> 'null')
  ) then
    return private.rechazo('invalido', 'solo altas: base_seq debe ser nulo');
  end if;

  begin
    if v_tipo = 'pago' then
      select count(*), count(distinct coalesce(e ->> 'pasivo_id', '')), min(coalesce(e ->> 'pasivo_id', '')),
             count(*) filter (where coalesce(e ->> 'tipo', 'abono') = 'abono'),
             count(*) filter (where (e ->> 'tipo') = 'saldo_a_favor')
        into v_n, v_pasivos, v_mensaje, v_abonos, v_safs
        from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'pago_de_deuda', '[]')) e;
      if v_n not between 1 and 2 or v_pasivos <> 1 or v_mensaje = '' or v_abonos > 1 or v_safs > 1 then
        return private.rechazo('invalido', 'un pago lleva un abono y/o un saldo a favor de un pasivo');
      end if;
      v_pasivo_id := v_mensaje::uuid;
      if (select count(*) - count(distinct (e ->> 'id'))
            from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'costo_financiero', '[]')) e) > 0 then
        return private.rechazo('invalido', 'un costo aparece dos veces en el lote');
      end if;
      if exists (
        select 1 from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'costo_financiero', '[]')) e
         where pg_catalog.jsonb_typeof(e -> 'base_seq') is distinct from 'number'
           and ((e ->> 'pasivo_id')::uuid is distinct from v_pasivo_id
                or (e ->> 'origen') is distinct from 'manual')
      ) then
        return private.rechazo('invalido', 'los costos del pago son manuales y de su pasivo');
      end if;
    elsif v_tipo = 'pasivo' then
      if pg_catalog.jsonb_array_length(coalesce(v_filas -> 'pasivo', '[]')) <> 1 then
        return private.rechazo('invalido', 'un lote de alta lleva exactamente un pasivo');
      end if;
      v_fila := v_filas -> 'pasivo' -> 0;
      v_pasivo_id := (v_fila ->> 'id')::uuid;
      if (v_fila ->> 'tipo') in ('tarjeta', 'credito') and (v_fila ->> 'owner_tipo') is distinct from 'miembro' then
        return private.rechazo('invalido', 'tarjeta y crédito son de un miembro');
      end if;
      if (v_fila ->> 'ambito') = 'personal' and (v_fila ->> 'owner_miembro_id')::uuid is distinct from v_actor then
        return private.rechazo('no_autorizado');
      end if;
      if exists (
        select 1 from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'plan_de_cuotas', '[]')) e
         where (e ->> 'origen') not in ('saldo_inicial', 'desembolso')
            or (e ->> 'pasivo_id')::uuid is distinct from v_pasivo_id
            or (e ->> 'tasa_tipo') is distinct from (v_fila ->> 'tasa_tipo')
            or (e ->> 'tasa_ppm') is distinct from (v_fila ->> 'tasa_ppm')
      ) or pg_catalog.jsonb_array_length(coalesce(v_filas -> 'plan_de_cuotas', '[]')) > 1
        or exists (
        select 1 from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'cuota', '[]')) e
         where (e ->> 'plan_id') is distinct from (v_filas -> 'plan_de_cuotas' -> 0 ->> 'id')
      ) or exists (
        select 1 from pg_catalog.jsonb_each(v_filas) t, pg_catalog.jsonb_array_elements(t.value) e
         where t.key in ('tarjeta', 'credito', 'deuda')
           and (t.key <> (v_fila ->> 'tipo') or (e ->> 'pasivo_id')::uuid is distinct from v_pasivo_id)
      ) then
        return private.rechazo('invalido', 'el plan, las cuotas y el subtipo son de ese pasivo');
      end if;
    elsif v_tipo = 'obligacion' then
      if pg_catalog.jsonb_array_length(coalesce(v_filas -> 'obligacion', '[]')) <> 1 then
        return private.rechazo('invalido', 'un lote lleva exactamente una obligación');
      end if;
    else
      if pg_catalog.jsonb_array_length(coalesce(v_filas -> 'compra', '[]')) <> 1
         or (v_filas -> 'compra' -> 0 ->> 'obligacion_id') is null
         or (v_filas -> 'compra' -> 0 ->> 'ambito') is distinct from 'hogar'
         or (v_filas -> 'compra' -> 0 ->> 'medio_de_pago_id') is null then
        return private.rechazo('invalido', 'el pago de una obligación es una compra de contado del hogar');
      end if;
    end if;

    if v_tipo = 'pago' then
      select pa.ambito, pa.owner_miembro_id into v_ambito, v_dueno
        from public.pasivo pa
       where pa.id = v_pasivo_id and pa.hogar_id = v_hogar_id
         and private.puede_ver(pa.hogar_id, pa.ambito, pa.owner_miembro_id);
      if not found then
        return private.rechazo('invalido', 'pasivo inexistente');
      end if;
    elsif v_tipo = 'pasivo' then
      v_ambito := v_fila ->> 'ambito';
      v_dueno := (v_fila ->> 'owner_miembro_id')::uuid;
    else
      v_ambito := 'hogar';
    end if;

    if v_ambito = 'personal' then
      perform 1 from public.personal_seq
       where hogar_id = v_hogar_id and miembro_id = v_dueno for update;
    else
      perform 1 from public.hogar_seq where hogar_id = v_hogar_id for update;
    end if;
    if v_tipo = 'pago' then
      perform 1 from public.pasivo where id = v_pasivo_id for update;
    end if;

    if v_tipo = 'pago' then
      if exists (
        select 1 from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'costo_financiero', '[]')) e
         where e ? 'base_seq' and pg_catalog.jsonb_typeof(e -> 'base_seq') <> 'null'
           and not exists (
             select 1 from public.costo_financiero k
              where k.id = (e ->> 'id')::uuid and k.pasivo_id = v_pasivo_id and k.eliminado_en is null)
      ) then
        return private.rechazo('invalido', 'costo inexistente');
      end if;
      if exists (
        select 1 from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'costo_financiero', '[]')) e
          join public.costo_financiero k on k.id = (e ->> 'id')::uuid
         where pg_catalog.jsonb_typeof(e -> 'base_seq') = 'number'
           and k.seq <> (e ->> 'base_seq')::bigint
      ) then
        return private.rechazo('conflicto', 'el costo cambió en el servidor');
      end if;

      with upd as (
        update public.costo_financiero k
           set monto = (e ->> 'monto')::bigint,
               origen = 'manual',
               actualizado_en = now(),
               actualizado_por = v_actor
          from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'costo_financiero', '[]')) e
         where k.id = (e ->> 'id')::uuid
           and pg_catalog.jsonb_typeof(e -> 'base_seq') = 'number'
        returning k.id, k.seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'costo_financiero', 'id', id, 'seq', seq))
        into v_parcial from upd;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.costo_financiero (
          id, hogar_id, tipo, monto, fecha_causacion, pasivo_id, medio_de_pago_id, cuota_id,
          origen, descripcion, registrado_por, actualizado_por)
        select k.id, v_hogar_id, k.tipo, k.monto, k.fecha_causacion, v_pasivo_id, null, k.cuota_id,
               'manual', k.descripcion, v_actor, v_actor
          from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'costo_financiero', '[]')) e,
               pg_catalog.jsonb_to_record(e) as k (
                 id uuid, tipo text, monto bigint, fecha_causacion date, cuota_id uuid, descripcion text)
         where pg_catalog.jsonb_typeof(e -> 'base_seq') is distinct from 'number'
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'costo_financiero', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.pago_de_deuda (
          id, hogar_id, pasivo_id, tipo, cuota_id, medio_de_pago_id, monto, fecha, nota,
          incluir_en_gastos, categoria_gasto_id, registrado_por, actualizado_por)
        select g.id, v_hogar_id, v_pasivo_id, coalesce(g.tipo, 'abono'), g.cuota_id, g.medio_de_pago_id,
               g.monto, g.fecha, g.nota,
               coalesce(g.incluir_en_gastos, false),
               case when coalesce(g.incluir_en_gastos, false) then g.categoria_gasto_id else null end,
               v_actor, v_actor
          from pg_catalog.jsonb_to_recordset(v_filas -> 'pago_de_deuda') as g (
            id uuid, tipo text, cuota_id uuid, medio_de_pago_id uuid, monto bigint, fecha date, nota text,
            incluir_en_gastos boolean, categoria_gasto_id uuid)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'pago_de_deuda', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

    elsif v_tipo = 'pasivo' then
      with ins as (
        insert into public.pasivo (
          id, hogar_id, tipo, nombre, ambito, owner_tipo, owner_miembro_id, tasa_tipo, tasa_ppm, actualizado_por)
        select p.id, v_hogar_id, p.tipo, p.nombre, coalesce(p.ambito, 'hogar'), p.owner_tipo,
               p.owner_miembro_id, p.tasa_tipo, p.tasa_ppm, v_actor
          from pg_catalog.jsonb_to_recordset(v_filas -> 'pasivo') as p (
            id uuid, tipo text, nombre text, ambito text, owner_tipo text, owner_miembro_id uuid,
            tasa_tipo text, tasa_ppm integer)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'pasivo', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.tarjeta (pasivo_id, hogar_id, franquicia, ultimos_4, dia_corte, dia_pago, cupo, actualizado_por)
        select t.pasivo_id, v_hogar_id, t.franquicia, t.ultimos_4, t.dia_corte, t.dia_pago, t.cupo, v_actor
          from pg_catalog.jsonb_to_recordset(coalesce(v_filas -> 'tarjeta', '[]')) as t (
            pasivo_id uuid, franquicia text, ultimos_4 text, dia_corte smallint, dia_pago smallint, cupo bigint)
        returning pasivo_id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'tarjeta', 'id', pasivo_id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.credito (pasivo_id, hogar_id, entidad, referencia, actualizado_por)
        select c.pasivo_id, v_hogar_id, c.entidad, c.referencia, v_actor
          from pg_catalog.jsonb_to_recordset(coalesce(v_filas -> 'credito', '[]')) as c (
            pasivo_id uuid, entidad text, referencia text)
        returning pasivo_id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'credito', 'id', pasivo_id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.deuda (pasivo_id, hogar_id, acreedor, actualizado_por)
        select d.pasivo_id, v_hogar_id, d.acreedor, v_actor
          from pg_catalog.jsonb_to_recordset(coalesce(v_filas -> 'deuda', '[]')) as d (pasivo_id uuid, acreedor text)
        returning pasivo_id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'deuda', 'id', pasivo_id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.plan_de_cuotas (
          id, hogar_id, pasivo_id, origen, compra_id, fecha_inicio, capital, sistema,
          n_cuotas, fecha_primera_cuota, tasa_tipo, tasa_ppm, actualizado_por)
        select p.id, v_hogar_id, p.pasivo_id, p.origen, null, p.fecha_inicio, p.capital,
               coalesce(p.sistema, 'sin_calendario'), p.n_cuotas, p.fecha_primera_cuota,
               p.tasa_tipo, p.tasa_ppm, v_actor
          from pg_catalog.jsonb_to_recordset(coalesce(v_filas -> 'plan_de_cuotas', '[]')) as p (
            id uuid, pasivo_id uuid, origen text, fecha_inicio date, capital bigint, sistema text,
            n_cuotas smallint, fecha_primera_cuota date, tasa_tipo text, tasa_ppm integer)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'plan_de_cuotas', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

      with ins as (
        insert into public.cuota (id, hogar_id, plan_id, numero, fecha_vencimiento, capital, actualizado_por)
        select c.id, v_hogar_id, c.plan_id, c.numero, c.fecha_vencimiento, c.capital, v_actor
          from pg_catalog.jsonb_to_recordset(coalesce(v_filas -> 'cuota', '[]')) as c (
            id uuid, plan_id uuid, numero smallint, fecha_vencimiento date, capital bigint)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'cuota', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

    elsif v_tipo = 'obligacion' then
      with ins as (
        insert into public.obligacion (
          id, hogar_id, nombre, categoria_id, monto_estimado, dia_vencimiento, periodicidad,
          mes_inicio, medio_sugerido_id, activa, actualizado_por)
        select o.id, v_hogar_id, o.nombre, o.categoria_id, o.monto_estimado, o.dia_vencimiento,
               o.periodicidad, o.mes_inicio, o.medio_sugerido_id, coalesce(o.activa, true), v_actor
          from pg_catalog.jsonb_to_recordset(v_filas -> 'obligacion') as o (
            id uuid, nombre text, categoria_id uuid, monto_estimado bigint, dia_vencimiento smallint,
            periodicidad text, mes_inicio text, medio_sugerido_id uuid, activa boolean)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'obligacion', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

    else
      with ins as (
        insert into public.compra (
          id, hogar_id, fecha, descripcion, monto_total, categoria_id, ambito, miembro_id,
          pago_tipo, medio_de_pago_id, registrado_por, origen, obligacion_id, periodo, actualizado_por)
        select x.id, v_hogar_id, x.fecha, x.descripcion, x.monto_total, x.categoria_id, 'hogar', null,
               'contado', x.medio_de_pago_id, v_actor, 'manual', x.obligacion_id, x.periodo, v_actor
          from pg_catalog.jsonb_to_recordset(v_filas -> 'compra') as x (
            id uuid, fecha date, descripcion text, monto_total bigint, categoria_id uuid,
            medio_de_pago_id uuid, obligacion_id uuid, periodo text)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'compra', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);
    end if;

    set constraints all immediate;

    v_resultado := pg_catalog.jsonb_build_object('estado', 'aplicado', 'filas', v_salida);
    insert into public.lote_aplicado (hogar_id, autor_miembro_id, lote_id, resultado)
    values (v_hogar_id, v_actor, v_lote_id, v_resultado);

    set constraints all deferred;
  exception
    when unique_violation then
      get stacked diagnostics v_restriccion = constraint_name;
      return private.rechazo('duplicado', v_restriccion);
    when integrity_constraint_violation or data_exception then
      get stacked diagnostics v_restriccion = constraint_name, v_mensaje = message_text;
      return private.rechazo('invalido', coalesce(nullif(v_restriccion, ''), v_mensaje));
  end;

  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPCs: editar_pago_de_deuda y eliminar_pago_de_deuda
-- ---------------------------------------------------------------------------

create function public.editar_pago_de_deuda(
  p_pago_id uuid,
  p_monto bigint,
  p_fecha date,
  p_medio_de_pago_id uuid,
  p_nota text default null,
  p_incluir_en_gastos boolean default false,
  p_categoria_gasto_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_pago public.pago_de_deuda;
  v_pasivo public.pasivo;
  v_nota text := nullif(pg_catalog.regexp_replace(coalesce(p_nota, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_incluir boolean := coalesce(p_incluir_en_gastos, false);
  v_cat_id uuid := case when coalesce(p_incluir_en_gastos, false) then p_categoria_gasto_id else null end;
  v_cuota_id uuid;
  v_cargo bigint;
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

  if p_pago_id is null or p_monto is null or p_monto <= 0 or p_fecha is null or p_medio_de_pago_id is null then
    raise exception 'datos inválidos para actualizar el abono' using errcode = '22023';
  end if;

  if v_nota is not null and pg_catalog.char_length(v_nota) > 200 then
    raise exception 'la nota no puede superar 200 caracteres' using errcode = '22023';
  end if;

  select * into v_pago
    from public.pago_de_deuda g
   where g.id = p_pago_id
     and g.hogar_id = v_actor.hogar_id
     and g.eliminado_en is null;

  if not found then
    raise exception 'abono no encontrado' using errcode = '22023';
  end if;

  select * into v_pasivo
    from public.pasivo p
   where p.id = v_pago.pasivo_id
     and p.hogar_id = v_actor.hogar_id
     and p.eliminado_en is null;

  if not found or (v_pasivo.ambito = 'personal' and v_pasivo.owner_miembro_id is distinct from v_actor.id) then
    raise exception 'abono no encontrado' using errcode = '22023';
  end if;

  if v_pasivo.ambito = 'personal' then
    perform 1
      from public.personal_seq ps
     where ps.hogar_id = v_actor.hogar_id
       and ps.miembro_id = v_pasivo.owner_miembro_id
       for update;
  else
    perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;
  end if;

  perform 1 from public.pasivo p where p.id = v_pasivo.id and p.hogar_id = v_actor.hogar_id for update;

  select * into v_pago
    from public.pago_de_deuda g
   where g.id = p_pago_id
     and g.hogar_id = v_actor.hogar_id
     and g.eliminado_en is null
   for update;

  if not found then
    raise exception 'abono no encontrado' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.medio_de_pago mp
     where mp.id = p_medio_de_pago_id
       and mp.hogar_id = v_actor.hogar_id
       and mp.eliminado_en is null
  ) then
    raise exception 'medio de pago no encontrado' using errcode = '22023';
  end if;

  if v_incluir then
    if v_pago.tipo <> 'abono' then
      raise exception 'solo los abonos pueden registrarse como gasto' using errcode = '22023';
    end if;
    if v_cat_id is null or not exists (
      select 1
        from public.categoria cat
       where cat.id = v_cat_id
         and cat.hogar_id = v_actor.hogar_id
         and cat.eliminado_en is null
    ) then
      raise exception 'categoría no válida para este hogar' using errcode = '22023';
    end if;
  end if;

  v_cuota_id := v_pago.cuota_id;
  if v_cuota_id is not null then
    select q.capital + coalesce((
             select sum(k.monto) from public.costo_financiero k
              where k.cuota_id = q.id and k.eliminado_en is null), 0)
      into v_cargo
      from public.cuota q
     where q.id = v_cuota_id and q.hogar_id = v_actor.hogar_id;

    if v_cargo is null or p_monto < v_cargo then
      v_cuota_id := null;
    end if;
  end if;

  update public.pago_de_deuda
     set monto = p_monto,
         fecha = p_fecha,
         medio_de_pago_id = p_medio_de_pago_id,
         nota = v_nota,
         cuota_id = v_cuota_id,
         incluir_en_gastos = v_incluir,
         categoria_gasto_id = v_cat_id,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where id = v_pago.id
     and hogar_id = v_actor.hogar_id;

  -- Disparar triggers diferidos (validar_pago / verificar_libro) dentro de SECURITY DEFINER.
  set constraints all immediate;
  set constraints all deferred;

  return pg_catalog.jsonb_build_object(
    'id', v_pago.id,
    'monto', p_monto,
    'fecha', p_fecha,
    'medio_de_pago_id', p_medio_de_pago_id,
    'nota', v_nota,
    'incluir_en_gastos', v_incluir,
    'categoria_gasto_id', v_cat_id
  );
end;
$$;

create function public.eliminar_pago_de_deuda(
  p_pago_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_pago public.pago_de_deuda;
  v_pasivo public.pasivo;
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

  if p_pago_id is null then
    raise exception 'abono no encontrado' using errcode = '22023';
  end if;

  select * into v_pago
    from public.pago_de_deuda g
   where g.id = p_pago_id
     and g.hogar_id = v_actor.hogar_id
     and g.eliminado_en is null;

  if not found then
    raise exception 'abono no encontrado' using errcode = '22023';
  end if;

  select * into v_pasivo
    from public.pasivo p
   where p.id = v_pago.pasivo_id
     and p.hogar_id = v_actor.hogar_id
     and p.eliminado_en is null;

  if not found or (v_pasivo.ambito = 'personal' and v_pasivo.owner_miembro_id is distinct from v_actor.id) then
    raise exception 'abono no encontrado' using errcode = '22023';
  end if;

  if v_pasivo.ambito = 'personal' then
    perform 1
      from public.personal_seq ps
     where ps.hogar_id = v_actor.hogar_id
       and ps.miembro_id = v_pasivo.owner_miembro_id
       for update;
  else
    perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;
  end if;

  perform 1 from public.pasivo p where p.id = v_pasivo.id and p.hogar_id = v_actor.hogar_id for update;

  update public.pago_de_deuda
     set eliminado_en = v_ahora,
         actualizado_en = v_ahora,
         actualizado_por = v_actor.id
   where id = v_pago.id
     and hogar_id = v_actor.hogar_id
     and eliminado_en is null;

  -- Disparar triggers diferidos dentro de SECURITY DEFINER.
  set constraints all immediate;
  set constraints all deferred;

  return pg_catalog.jsonb_build_object(
    'id', v_pago.id,
    'eliminado', true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Privilegios
-- ---------------------------------------------------------------------------

revoke all on function
  public.crear_medio_de_pago(text, text, text, uuid),
  public.editar_medio_de_pago(uuid, text, text, uuid),
  public.editar_pago_de_deuda(uuid, bigint, date, uuid, text, boolean, uuid),
  public.eliminar_pago_de_deuda(uuid)
  from public, anon;

grant execute on function
  public.crear_medio_de_pago(text, text, text, uuid),
  public.editar_medio_de_pago(uuid, text, text, uuid),
  public.editar_pago_de_deuda(uuid, bigint, date, uuid, text, boolean, uuid),
  public.eliminar_pago_de_deuda(uuid)
  to authenticated;
