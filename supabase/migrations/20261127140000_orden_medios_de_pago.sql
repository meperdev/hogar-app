-- Orden personalizado para medios de pago (`orden`) y RPC para reordenar.

alter table public.medio_de_pago
  add column if not exists orden smallint not null default 0;

with ordenados as (
  select
    id,
    (row_number() over (partition by hogar_id order by activo desc, lower(nombre), id) - 1)::smallint as nuevo_orden
  from public.medio_de_pago
  where eliminado_en is null
)
update public.medio_de_pago mp
   set orden = o.nuevo_orden
  from ordenados o
 where mp.id = o.id;

create or replace function public.crear_medio_de_pago(
  p_nombre text,
  p_tipo text,
  p_owner_tipo text default 'miembro'
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
  v_owner_miembro_id := case when p_owner_tipo = 'miembro' then v_actor.id else null end;

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

create or replace function public.reordenar_medios_de_pago(
  p_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_total int;
  v_distintos int;
  v_existentes int;
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

  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    raise exception 'debes enviar al menos un medio de pago' using errcode = '22023';
  end if;

  if exists (select 1 from pg_catalog.unnest(p_ids) as t(id) where t.id is null) then
    raise exception 'identificador de medio inválido' using errcode = '22023';
  end if;

  select count(*)::int, count(distinct t.id)::int
    into v_total, v_distintos
    from pg_catalog.unnest(p_ids) as t(id);

  if v_total <> v_distintos then
    raise exception 'no se permiten medios repetidos' using errcode = '22023';
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;

  select count(*)::int
    into v_existentes
    from public.medio_de_pago mp
   where mp.hogar_id = v_actor.hogar_id
     and mp.eliminado_en is null
     and mp.id = any(p_ids);

  if v_existentes <> v_total then
    raise exception 'medio de pago no encontrado' using errcode = '22023';
  end if;

  with posiciones as (
    select t.id, (t.pos - 1)::smallint as nuevo_orden
      from pg_catalog.unnest(p_ids) with ordinality as t(id, pos)
  )
  update public.medio_de_pago mp
     set orden = p.nuevo_orden,
         actualizado_en = now(),
         actualizado_por = v_actor.id
    from posiciones p
   where mp.id = p.id
     and mp.hogar_id = v_actor.hogar_id
     and mp.eliminado_en is null;

  return pg_catalog.jsonb_build_object('orden', pg_catalog.to_jsonb(p_ids));
end;
$$;

revoke all on function public.reordenar_medios_de_pago(uuid[]) from public, anon;
grant execute on function public.reordenar_medios_de_pago(uuid[]) to authenticated;
