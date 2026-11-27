-- Comercios frecuentes por hogar: tabla, semilla, backfill y RPCs CRUD + orden.

create table public.comercio_frecuente (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  nombre text not null
    constraint comercio_frecuente_nombre_check check (private.nombre_visible(nombre)),
  categoria_sugerida_id uuid,
  activo boolean not null default true,
  orden smallint not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  constraint comercio_frecuente_hogar_id_id_key unique (hogar_id, id),
  constraint comercio_frecuente_categoria_fkey
    foreign key (hogar_id, categoria_sugerida_id)
    references public.categoria (hogar_id, id),
  constraint comercio_frecuente_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por)
    references public.miembro (hogar_id, id)
);

create unique index comercio_frecuente_hogar_nombre_activo_key
  on public.comercio_frecuente (hogar_id, lower(nombre))
  where activo and eliminado_en is null;

create trigger comercio_frecuente_tenencia
  before update on public.comercio_frecuente
  for each row execute function private.tenencia_inmutable();

alter table public.comercio_frecuente enable row level security;

create policy comercio_frecuente_select on public.comercio_frecuente
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

revoke all on table public.comercio_frecuente from public, anon, authenticated;
grant select on table public.comercio_frecuente to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: sembrar comercios frecuentes por defecto para un hogar nuevo/actual
-- ---------------------------------------------------------------------------

create or replace function private.sembrar_comercios_hogar(
  p_hogar_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_cat_id uuid;
begin
  if exists (
    select 1
      from public.comercio_frecuente cf
     where cf.hogar_id = p_hogar_id
       and cf.eliminado_en is null
  ) then
    return;
  end if;

  for v_item in
    select c.nombre, c.cat_nombre, c.orden
      from (values
        ('D1', 'Mercado', 0),
        ('Éxito', 'Mercado', 1),
        ('Ara', 'Mercado', 2),
        ('Carulla', 'Mercado', 3),
        ('Rappi', 'Mercado', 4),
        ('Uber', 'Transporte', 5),
        ('Farmatodo', 'Salud', 6),
        ('Laika', 'Mascotas', 7),
        ('Juan Valdez', 'Entretenimiento', 8)
      ) as c (nombre, cat_nombre, orden)
     order by c.orden
  loop
    select cat.id into v_cat_id
      from public.categoria cat
     where cat.hogar_id = p_hogar_id
       and cat.eliminado_en is null
       and pg_catalog.lower(cat.nombre) = pg_catalog.lower(v_item.cat_nombre)
     order by cat.orden
     limit 1;

    insert into public.comercio_frecuente (
      id, hogar_id, nombre, categoria_sugerida_id, activo, orden, actualizado_por
    ) values (
      private.uuid_v7(), p_hogar_id, v_item.nombre, v_cat_id, true,
      v_item.orden::smallint, p_actor_id
    );
  end loop;
end;
$$;

revoke all on function private.sembrar_comercios_hogar(uuid, uuid) from public, anon, authenticated;

-- Backfill para hogares existentes sin comercios registrados
do $$
declare
  v_hogar record;
  v_actor_id uuid;
begin
  for v_hogar in
    select h.id
      from public.hogar h
     where h.eliminado_en is null
  loop
    select m.id into v_actor_id
      from public.miembro m
     where m.hogar_id = v_hogar.id
       and m.activo
       and m.eliminado_en is null
     order by case when m.rol = 'admin' then 0 else 1 end, m.id
     limit 1;

    continue when v_actor_id is null;

    perform private.sembrar_comercios_hogar(v_hogar.id, v_actor_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actualizar crear_hogar para sembrar también los comercios frecuentes
-- ---------------------------------------------------------------------------

create or replace function public.crear_hogar(p_nombre text, p_nombre_miembro text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_nombre text := pg_catalog.regexp_replace(p_nombre, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_nombre_miembro text :=
    pg_catalog.regexp_replace(p_nombre_miembro, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_hogar_id uuid;
  v_miembro_id uuid;
  v_categoria record;
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;

  if not private.nombre_visible(v_nombre) then
    raise exception 'el nombre del hogar debe tener entre 1 y 80 caracteres'
      using errcode = '22023';
  end if;

  if not private.nombre_visible(v_nombre_miembro) then
    raise exception 'el nombre del miembro debe tener entre 1 y 80 caracteres'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('crear_hogar:' || v_usuario_id::text, 0));

  if exists (
    select 1
      from public.miembro m
     where m.usuario_id = v_usuario_id
       and m.activo
       and m.eliminado_en is null
  ) then
    raise exception 'el usuario ya pertenece a un hogar' using errcode = '23505';
  end if;

  v_hogar_id := private.uuid_v7();
  v_miembro_id := private.uuid_v7();

  insert into public.hogar (id, nombre, actualizado_por)
  values (v_hogar_id, v_nombre, v_miembro_id);

  insert into public.miembro (id, hogar_id, nombre, usuario_id, rol, activo, actualizado_por)
  values (v_miembro_id, v_hogar_id, v_nombre_miembro, v_usuario_id, 'admin', true, v_miembro_id);

  insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq)
  values (v_hogar_id, v_miembro_id, 0);

  for v_categoria in
    select c.nombre, c.icono, c.orden
      from (values
        ('Mercado', 'mercado', 1),
        ('Servicios', 'servicios', 2),
        ('Arriendo', 'arriendo', 3),
        ('Transporte', 'transporte', 4),
        ('Salud', 'salud', 5),
        ('Mascotas', 'mascotas', 6),
        ('Hogar y electrodomésticos', 'hogar', 7),
        ('Entretenimiento', 'entretenimiento', 8),
        ('Otros', 'otros', 9)
      ) as c (nombre, icono, orden)
     order by c.orden
  loop
    insert into public.categoria (id, hogar_id, nombre, icono, orden, actualizado_por)
    values (private.uuid_v7(), v_hogar_id, v_categoria.nombre, v_categoria.icono,
            v_categoria.orden, v_miembro_id);
  end loop;

  insert into public.medio_de_pago (
    id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, activo, actualizado_por
  ) values
    (
      private.uuid_v7(), v_hogar_id,
      'Efectivo (' || pg_catalog.left(v_nombre_miembro, 68) || ')',
      'efectivo', 'miembro', v_miembro_id, true, v_miembro_id
    ),
    (
      private.uuid_v7(), v_hogar_id,
      'Fondo común',
      'cuenta', 'hogar', null, true, v_miembro_id
    );

  perform private.sembrar_comercios_hogar(v_hogar_id, v_miembro_id);

  return pg_catalog.jsonb_build_object('hogar_id', v_hogar_id, 'miembro_id', v_miembro_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs CRUD + reordenamiento de comercios frecuentes
-- ---------------------------------------------------------------------------

create function public.crear_comercio_frecuente(
  p_nombre text,
  p_categoria_sugerida_id uuid default null
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
  v_orden smallint;
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;

  select m.id, m.hogar_id into v_actor
    from public.miembro m
   where m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null
   limit 1;

  if not found then
    raise exception 'se necesita pertenecer a un hogar activo' using errcode = '42501';
  end if;

  if not private.nombre_visible(v_nombre) then
    raise exception 'el nombre del comercio debe tener entre 1 y 80 caracteres' using errcode = '22023';
  end if;

  if p_categoria_sugerida_id is not null and not exists (
    select 1
      from public.categoria cat
     where cat.id = p_categoria_sugerida_id
       and cat.hogar_id = v_actor.hogar_id
       and cat.eliminado_en is null
  ) then
    raise exception 'categoría no válida para este hogar' using errcode = '22023';
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;

  if exists (
    select 1
      from public.comercio_frecuente cf
     where cf.hogar_id = v_actor.hogar_id
       and cf.eliminado_en is null
       and cf.activo
       and pg_catalog.lower(cf.nombre) = pg_catalog.lower(v_nombre)
  ) then
    raise exception 'ya existe un comercio activo con ese nombre' using errcode = '23505';
  end if;

  select coalesce(max(cf.orden) + 1, 0)::smallint
    into v_orden
    from public.comercio_frecuente cf
   where cf.hogar_id = v_actor.hogar_id
     and cf.eliminado_en is null;

  v_id := private.uuid_v7();

  insert into public.comercio_frecuente (
    id, hogar_id, nombre, categoria_sugerida_id, activo, orden, actualizado_por
  ) values (
    v_id, v_actor.hogar_id, v_nombre, p_categoria_sugerida_id, true, v_orden, v_actor.id
  );

  return pg_catalog.jsonb_build_object(
    'id', v_id,
    'nombre', v_nombre,
    'categoria_sugerida_id', p_categoria_sugerida_id,
    'activo', true,
    'orden', v_orden
  );
end;
$$;

create function public.editar_comercio_frecuente(
  p_comercio_id uuid,
  p_nombre text,
  p_categoria_sugerida_id uuid default null
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
  v_comercio public.comercio_frecuente;
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;

  select m.id, m.hogar_id into v_actor
    from public.miembro m
   where m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null
   limit 1;

  if not found then
    raise exception 'se necesita pertenecer a un hogar activo' using errcode = '42501';
  end if;

  if p_comercio_id is null or not private.nombre_visible(v_nombre) then
    raise exception 'datos de comercio inválidos' using errcode = '22023';
  end if;

  if p_categoria_sugerida_id is not null and not exists (
    select 1
      from public.categoria cat
     where cat.id = p_categoria_sugerida_id
       and cat.hogar_id = v_actor.hogar_id
       and cat.eliminado_en is null
  ) then
    raise exception 'categoría no válida para este hogar' using errcode = '22023';
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;

  select * into v_comercio
    from public.comercio_frecuente cf
   where cf.id = p_comercio_id
     and cf.hogar_id = v_actor.hogar_id
     and cf.eliminado_en is null
   for update;

  if not found then
    raise exception 'comercio no encontrado' using errcode = '22023';
  end if;

  if v_comercio.activo and exists (
    select 1
      from public.comercio_frecuente cf
     where cf.hogar_id = v_actor.hogar_id
       and cf.id <> v_comercio.id
       and cf.eliminado_en is null
       and cf.activo
       and pg_catalog.lower(cf.nombre) = pg_catalog.lower(v_nombre)
  ) then
    raise exception 'ya existe un comercio activo con ese nombre' using errcode = '23505';
  end if;

  update public.comercio_frecuente
     set nombre = v_nombre,
         categoria_sugerida_id = p_categoria_sugerida_id,
         actualizado_en = now(),
         actualizado_por = v_actor.id
   where id = v_comercio.id
     and hogar_id = v_actor.hogar_id;

  return pg_catalog.jsonb_build_object(
    'id', v_comercio.id,
    'nombre', v_nombre,
    'categoria_sugerida_id', p_categoria_sugerida_id,
    'activo', v_comercio.activo,
    'orden', v_comercio.orden
  );
end;
$$;

create function public.archivar_comercio_frecuente(
  p_comercio_id uuid,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_comercio public.comercio_frecuente;
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;

  select m.id, m.hogar_id into v_actor
    from public.miembro m
   where m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null
   limit 1;

  if not found then
    raise exception 'se necesita pertenecer a un hogar activo' using errcode = '42501';
  end if;

  if p_comercio_id is null or p_activo is null then
    raise exception 'comercio o estado inválido' using errcode = '22023';
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;

  select * into v_comercio
    from public.comercio_frecuente cf
   where cf.id = p_comercio_id
     and cf.hogar_id = v_actor.hogar_id
     and cf.eliminado_en is null
   for update;

  if not found then
    raise exception 'comercio no encontrado' using errcode = '22023';
  end if;

  if p_activo and not v_comercio.activo and exists (
    select 1
      from public.comercio_frecuente cf
     where cf.hogar_id = v_actor.hogar_id
       and cf.id <> v_comercio.id
       and cf.eliminado_en is null
       and cf.activo
       and pg_catalog.lower(cf.nombre) = pg_catalog.lower(v_comercio.nombre)
  ) then
    raise exception 'ya existe un comercio activo con ese nombre' using errcode = '23505';
  end if;

  update public.comercio_frecuente
     set activo = p_activo,
         actualizado_en = now(),
         actualizado_por = v_actor.id
   where id = v_comercio.id
     and hogar_id = v_actor.hogar_id;

  return pg_catalog.jsonb_build_object('id', v_comercio.id, 'activo', p_activo);
end;
$$;

create function public.reordenar_comercios_frecuentes(
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

  select m.id, m.hogar_id into v_actor
    from public.miembro m
   where m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null
   limit 1;

  if not found then
    raise exception 'se necesita pertenecer a un hogar activo' using errcode = '42501';
  end if;

  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    raise exception 'debes enviar al menos un comercio' using errcode = '22023';
  end if;

  if exists (select 1 from pg_catalog.unnest(p_ids) as t(id) where t.id is null) then
    raise exception 'identificador de comercio inválido' using errcode = '22023';
  end if;

  select count(*)::int, count(distinct t.id)::int
    into v_total, v_distintos
    from pg_catalog.unnest(p_ids) as t(id);

  if v_total <> v_distintos then
    raise exception 'no se permiten comercios repetidos' using errcode = '22023';
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;

  select count(*)::int
    into v_existentes
    from public.comercio_frecuente cf
   where cf.hogar_id = v_actor.hogar_id
     and cf.eliminado_en is null
     and cf.id = any(p_ids);

  if v_existentes <> v_total then
    raise exception 'comercio no encontrado' using errcode = '22023';
  end if;

  with posiciones as (
    select t.id, (t.pos - 1)::smallint as nuevo_orden
      from pg_catalog.unnest(p_ids) with ordinality as t(id, pos)
  )
  update public.comercio_frecuente cf
     set orden = p.nuevo_orden,
         actualizado_en = now(),
         actualizado_por = v_actor.id
    from posiciones p
   where cf.id = p.id
     and cf.hogar_id = v_actor.hogar_id
     and cf.eliminado_en is null;

  return pg_catalog.jsonb_build_object('orden', pg_catalog.to_jsonb(p_ids));
end;
$$;

revoke all on function
  public.crear_comercio_frecuente(text, uuid),
  public.editar_comercio_frecuente(uuid, text, uuid),
  public.archivar_comercio_frecuente(uuid, boolean),
  public.reordenar_comercios_frecuentes(uuid[])
  from public, anon;

grant execute on function
  public.crear_comercio_frecuente(text, uuid),
  public.editar_comercio_frecuente(uuid, text, uuid),
  public.archivar_comercio_frecuente(uuid, boolean),
  public.reordenar_comercios_frecuentes(uuid[])
  to authenticated;
