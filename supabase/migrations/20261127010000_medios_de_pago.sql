-- Medios de pago por defecto en crear_hogar / canjear_invitacion, backfill
-- para hogares existentes y RPCs para crear y archivar/reactivar medios.
-- Referencias: docs/data-model.md §3.5, §4 (I8, I9).

-- ---------------------------------------------------------------------------
-- RPC: crear_hogar (ahora siembra Efectivo del creador + Fondo común)
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

  return pg_catalog.jsonb_build_object('hogar_id', v_hogar_id, 'miembro_id', v_miembro_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: canjear_invitacion (siembra Efectivo para el miembro si no tiene uno)
-- ---------------------------------------------------------------------------

create or replace function public.canjear_invitacion(
  p_token text,
  p_nombre_miembro text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_token text := coalesce(pg_catalog.regexp_replace(p_token, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_nombre text := pg_catalog.regexp_replace(coalesce(p_nombre_miembro, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_nombre_final text;
  v_hash text;
  v_inv public.invitacion;
  v_miembro public.miembro;
  v_miembro_id uuid;
  v_hogar_nombre text;
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
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

  if v_token = '' then
    raise exception 'invitación inválida, usada o vencida' using errcode = '22023';
  end if;

  v_hash := private.hash_token_invitacion(v_token);

  select * into v_inv
    from public.invitacion i
   where i.token_hash = v_hash
     for update;

  if not found
     or v_inv.usada_en is not null
     or v_inv.revocada_en is not null
     or v_inv.expira_en <= now() then
    raise exception 'invitación inválida, usada o vencida' using errcode = '22023';
  end if;

  select h.nombre into v_hogar_nombre
    from public.hogar h
   where h.id = v_inv.hogar_id and h.eliminado_en is null;

  if not found then
    raise exception 'invitación inválida, usada o vencida' using errcode = '22023';
  end if;

  perform 1 from public.hogar_seq where hogar_id = v_inv.hogar_id for update;

  if v_inv.miembro_objetivo_id is not null then
    select * into v_miembro
      from public.miembro m
     where m.id = v_inv.miembro_objetivo_id
       and m.hogar_id = v_inv.hogar_id
       for update;

    if not found or not v_miembro.activo or v_miembro.eliminado_en is not null or v_miembro.usuario_id is not null then
      raise exception 'el miembro objetivo no está disponible para vincularse' using errcode = '22023';
    end if;

    v_miembro_id := v_miembro.id;
    v_nombre_final := case when private.nombre_visible(v_nombre) then v_nombre else v_miembro.nombre end;

    update public.miembro
       set usuario_id = v_usuario_id,
           nombre = v_nombre_final,
           actualizado_en = now(),
           actualizado_por = v_miembro_id
     where id = v_miembro_id and hogar_id = v_inv.hogar_id;

    insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq)
    values (v_inv.hogar_id, v_miembro_id, 0)
    on conflict (hogar_id, miembro_id) do nothing;
  else
    if not private.nombre_visible(v_nombre) then
      raise exception 'el nombre del miembro debe tener entre 1 y 80 caracteres' using errcode = '22023';
    end if;

    v_miembro_id := private.uuid_v7();
    v_nombre_final := v_nombre;

    insert into public.miembro (
      id, hogar_id, nombre, usuario_id, rol, activo, actualizado_por
    ) values (
      v_miembro_id, v_inv.hogar_id, v_nombre_final, v_usuario_id, 'miembro', true, v_inv.creada_por
    );

    insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq)
    values (v_inv.hogar_id, v_miembro_id, 0);
  end if;

  if not exists (
    select 1
      from public.medio_de_pago mp
     where mp.hogar_id = v_inv.hogar_id
       and mp.owner_tipo = 'miembro'
       and mp.owner_miembro_id = v_miembro_id
       and mp.activo
       and mp.eliminado_en is null
  ) then
    insert into public.medio_de_pago (
      id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, activo, actualizado_por
    ) values (
      private.uuid_v7(), v_inv.hogar_id,
      'Efectivo (' || pg_catalog.left(v_nombre_final, 68) || ')',
      'efectivo', 'miembro', v_miembro_id, true, v_miembro_id
    );
  end if;

  update public.invitacion
     set usada_en = now(),
         usada_por_miembro_id = v_miembro_id
   where id = v_inv.id;

  return pg_catalog.jsonb_build_object(
    'hogar_id', v_inv.hogar_id,
    'miembro_id', v_miembro_id,
    'hogar_nombre', v_hogar_nombre
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill idempotente para hogares y miembros activos ya creados
-- ---------------------------------------------------------------------------

do $$
declare
  v_hogar record;
  v_miembro record;
  v_actor_id uuid;
begin
  for v_hogar in
    select h.id
      from public.hogar h
     where h.eliminado_en is null
  loop
    perform 1 from public.hogar_seq where hogar_id = v_hogar.id for update;

    if not exists (
      select 1
        from public.medio_de_pago mp
       where mp.hogar_id = v_hogar.id
         and mp.owner_tipo = 'hogar'
         and mp.activo
         and mp.eliminado_en is null
    ) then
      select m.id into v_actor_id
        from public.miembro m
       where m.hogar_id = v_hogar.id
         and m.activo
         and m.eliminado_en is null
       order by (m.rol = 'admin') desc, m.creado_en asc
       limit 1;

      if v_actor_id is not null then
        insert into public.medio_de_pago (
          id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, activo, actualizado_por
        ) values (
          private.uuid_v7(), v_hogar.id,
          'Fondo común', 'cuenta', 'hogar', null, true, v_actor_id
        );
      end if;
    end if;

    for v_miembro in
      select m.id, m.nombre
        from public.miembro m
       where m.hogar_id = v_hogar.id
         and m.activo
         and m.eliminado_en is null
    loop
      if not exists (
        select 1
          from public.medio_de_pago mp
         where mp.hogar_id = v_hogar.id
           and mp.owner_tipo = 'miembro'
           and mp.owner_miembro_id = v_miembro.id
           and mp.activo
           and mp.eliminado_en is null
      ) then
        insert into public.medio_de_pago (
          id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, activo, actualizado_por
        ) values (
          private.uuid_v7(), v_hogar.id,
          'Efectivo (' || pg_catalog.left(v_miembro.nombre, 68) || ')',
          'efectivo', 'miembro', v_miembro.id, true, v_miembro.id
        );
      end if;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: crear_medio_de_pago
-- ---------------------------------------------------------------------------

create function public.crear_medio_de_pago(
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

  v_id := private.uuid_v7();
  v_owner_miembro_id := case when p_owner_tipo = 'miembro' then v_actor.id else null end;

  insert into public.medio_de_pago (
    id, hogar_id, nombre, tipo, owner_tipo, owner_miembro_id, activo, actualizado_por
  ) values (
    v_id, v_actor.hogar_id, v_nombre, p_tipo, p_owner_tipo, v_owner_miembro_id, true, v_actor.id
  );

  return pg_catalog.jsonb_build_object(
    'id', v_id,
    'nombre', v_nombre,
    'tipo', p_tipo,
    'owner_tipo', p_owner_tipo,
    'owner_miembro_id', v_owner_miembro_id,
    'activo', true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: archivar_medio_de_pago (archivar o reactivar medio sin borrar historial)
-- ---------------------------------------------------------------------------

create function public.archivar_medio_de_pago(
  p_medio_id uuid,
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
  v_medio public.medio_de_pago;
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

  if p_medio_id is null or p_activo is null then
    raise exception 'medio o estado inválido' using errcode = '22023';
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

  if p_activo and not v_medio.activo and exists (
    select 1
      from public.medio_de_pago mp
     where mp.hogar_id = v_actor.hogar_id
       and mp.id <> v_medio.id
       and mp.eliminado_en is null
       and mp.activo
       and pg_catalog.lower(mp.nombre) = pg_catalog.lower(v_medio.nombre)
  ) then
    raise exception 'ya existe un medio de pago activo con ese nombre' using errcode = '23505';
  end if;

  update public.medio_de_pago
     set activo = p_activo,
         actualizado_en = now(),
         actualizado_por = v_actor.id
   where id = v_medio.id
     and hogar_id = v_actor.hogar_id;

  return pg_catalog.jsonb_build_object('id', v_medio.id, 'activo', p_activo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

revoke all on function
  public.crear_medio_de_pago(text, text, text),
  public.archivar_medio_de_pago(uuid, boolean)
  from public, anon;

grant execute on function
  public.crear_medio_de_pago(text, text, text),
  public.archivar_medio_de_pago(uuid, boolean)
  to authenticated;
