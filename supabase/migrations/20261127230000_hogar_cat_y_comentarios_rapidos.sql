-- Acortar categoría 'Hogar y electrodomésticos' -> 'Hogar' y agregar comentarios rápidos por categoría.

update public.categoria c
   set nombre = 'Hogar',
       actualizado_en = now()
 where c.nombre = 'Hogar y electrodomésticos'
   and c.eliminado_en is null
   and not exists (
     select 1
       from public.categoria dup
      where dup.hogar_id = c.hogar_id
        and dup.eliminado_en is null
        and pg_catalog.lower(dup.nombre) = 'hogar'
   );

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
        ('Hogar', 'hogar', 7),
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
-- Comentarios rápidos frecuentes por categoría
-- ---------------------------------------------------------------------------

create table public.comentario_rapido (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  categoria_id uuid not null,
  texto text not null
    constraint comentario_rapido_texto_check check (private.nombre_visible(texto)),
  activo boolean not null default true,
  orden smallint not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  constraint comentario_rapido_hogar_id_id_key unique (hogar_id, id),
  constraint comentario_rapido_categoria_fkey
    foreign key (hogar_id, categoria_id)
    references public.categoria (hogar_id, id),
  constraint comentario_rapido_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por)
    references public.miembro (hogar_id, id)
);

create unique index comentario_rapido_hogar_cat_texto_activo_key
  on public.comentario_rapido (hogar_id, categoria_id, lower(texto))
  where activo and eliminado_en is null;

create trigger comentario_rapido_tenencia
  before update on public.comentario_rapido
  for each row execute function private.tenencia_inmutable();

alter table public.comentario_rapido enable row level security;

create policy comentario_rapido_select on public.comentario_rapido
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

revoke all on table public.comentario_rapido from public, anon, authenticated;
grant select on table public.comentario_rapido to authenticated;

create function public.crear_comentario_rapido(
  p_categoria_id uuid,
  p_texto text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_texto text := pg_catalog.regexp_replace(coalesce(p_texto, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
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

  if not private.nombre_visible(v_texto) then
    raise exception 'el comentario debe tener entre 1 y 80 caracteres' using errcode = '22023';
  end if;

  if p_categoria_id is null or not exists (
    select 1
      from public.categoria cat
     where cat.id = p_categoria_id
       and cat.hogar_id = v_actor.hogar_id
       and cat.eliminado_en is null
  ) then
    raise exception 'categoría no válida para este hogar' using errcode = '22023';
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;

  if exists (
    select 1
      from public.comentario_rapido cr
     where cr.hogar_id = v_actor.hogar_id
       and cr.categoria_id = p_categoria_id
       and cr.eliminado_en is null
       and cr.activo
       and pg_catalog.lower(cr.texto) = pg_catalog.lower(v_texto)
  ) then
    raise exception 'ya existe ese comentario rápido en esta categoría' using errcode = '23505';
  end if;

  select coalesce(max(cr.orden) + 1, 0)::smallint
    into v_orden
    from public.comentario_rapido cr
   where cr.hogar_id = v_actor.hogar_id
     and cr.categoria_id = p_categoria_id
     and cr.eliminado_en is null;

  v_id := private.uuid_v7();

  insert into public.comentario_rapido (
    id, hogar_id, categoria_id, texto, activo, orden, actualizado_por
  ) values (
    v_id, v_actor.hogar_id, p_categoria_id, v_texto, true, v_orden, v_actor.id
  );

  return pg_catalog.jsonb_build_object(
    'id', v_id,
    'categoria_id', p_categoria_id,
    'texto', v_texto,
    'activo', true,
    'orden', v_orden
  );
end;
$$;

create function public.eliminar_comentario_rapido(
  p_comentario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_comentario public.comentario_rapido;
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

  if p_comentario_id is null then
    raise exception 'comentario inválido' using errcode = '22023';
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_actor.hogar_id for update;

  select * into v_comentario
    from public.comentario_rapido cr
   where cr.id = p_comentario_id
     and cr.hogar_id = v_actor.hogar_id
     and cr.eliminado_en is null
   for update;

  if not found then
    raise exception 'comentario no encontrado' using errcode = '22023';
  end if;

  update public.comentario_rapido
     set activo = false,
         eliminado_en = now(),
         actualizado_en = now(),
         actualizado_por = v_actor.id
   where id = v_comentario.id
     and hogar_id = v_actor.hogar_id;

  return pg_catalog.jsonb_build_object(
    'id', v_comentario.id,
    'eliminado', true
  );
end;
$$;

revoke all on function
  public.crear_comentario_rapido(uuid, text),
  public.eliminar_comentario_rapido(uuid)
  from public, anon;

grant execute on function
  public.crear_comentario_rapido(uuid, text),
  public.eliminar_comentario_rapido(uuid)
  to authenticated;
