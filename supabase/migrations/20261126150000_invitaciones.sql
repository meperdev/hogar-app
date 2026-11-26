-- Invitación de miembros: tabla solo-servidor `public.invitacion` y RPCs
-- `crear_invitacion`, `listar_invitaciones`, `revocar_invitacion` y
-- `canjear_invitacion`.
-- Referencias: docs/data-model.md §1.3, §3.2 y docs/architecture.md §6.
--
-- Reglas de seguridad:
-- - `public.invitacion` es solo-servidor: RLS activo sin políticas `SELECT` y
--   `REVOKE ALL` a `anon` y `authenticated`.
-- - El token aleatorio nunca se guarda en claro: solo su hash SHA-256 hex.
-- - Solo un administrador activo puede crear, listar o revocar invitaciones.
-- - `canjear_invitacion` es atómica, usa el mismo lock de usuario que
--   `crear_hogar`, no revela si un token nunca existió o ya expiró/se usó, y
--   abre el carril `personal_seq` en 0 para el miembro vinculado o creado.

create table public.invitacion (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  creada_por uuid not null,
  miembro_objetivo_id uuid,
  token_hash text not null unique
    constraint invitacion_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  nota text
    constraint invitacion_nota_check
      check (nota is null or (nota ~ '[^[:space:]]' and pg_catalog.char_length(nota) <= 120)),
  creada_en timestamptz not null default now(),
  expira_en timestamptz not null,
  usada_en timestamptz,
  usada_por_miembro_id uuid,
  revocada_en timestamptz,
  constraint invitacion_expira_check check (expira_en > creada_en),
  constraint invitacion_estado_check check (not (usada_en is not null and revocada_en is not null)),
  constraint invitacion_usada_por_check check ((usada_en is null) = (usada_por_miembro_id is null)),
  constraint invitacion_creada_por_fkey
    foreign key (hogar_id, creada_por) references public.miembro (hogar_id, id),
  constraint invitacion_miembro_objetivo_fkey
    foreign key (hogar_id, miembro_objetivo_id) references public.miembro (hogar_id, id),
  constraint invitacion_usada_por_fkey
    foreign key (hogar_id, usada_por_miembro_id) references public.miembro (hogar_id, id)
);

alter table public.invitacion enable row level security;

-- ---------------------------------------------------------------------------
-- Helper interno de generación de hash SHA-256 hex
-- ---------------------------------------------------------------------------

create function private.hash_token_invitacion(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_token, 'utf8'), 'sha256'),
    'hex'
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC: crear_invitacion (solo admin)
-- ---------------------------------------------------------------------------

create function public.crear_invitacion(
  p_miembro_objetivo_id uuid default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_hogar_nombre text;
  v_nota text := null;
  v_token text;
  v_hash text;
  v_id uuid;
  v_expira_en timestamptz := now() + interval '7 days';
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

  if v_actor.rol <> 'admin' then
    raise exception 'solo un administrador puede invitar miembros' using errcode = '42501';
  end if;

  if p_nota is not null then
    v_nota := pg_catalog.regexp_replace(p_nota, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if v_nota = '' then
      v_nota := null;
    elsif pg_catalog.char_length(v_nota) > 120 then
      raise exception 'la nota de invitación admite hasta 120 caracteres' using errcode = '22023';
    end if;
  end if;

  if p_miembro_objetivo_id is not null and not exists (
    select 1
      from public.miembro mo
     where mo.id = p_miembro_objetivo_id
       and mo.hogar_id = v_actor.hogar_id
       and mo.activo
       and mo.eliminado_en is null
       and mo.usuario_id is null
  ) then
    raise exception 'el miembro objetivo no está disponible para vincularse' using errcode = '22023';
  end if;

  select h.nombre into v_hogar_nombre
    from public.hogar h
   where h.id = v_actor.hogar_id and h.eliminado_en is null;

  -- 192 bits de entropía URL-safe (32 caracteres sin '=').
  v_token := pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.rtrim(pg_catalog.encode(extensions.gen_random_bytes(24), 'base64'), '='),
      '+', '-'
    ),
    '/', '_'
  );
  v_hash := private.hash_token_invitacion(v_token);
  v_id := private.uuid_v7();

  insert into public.invitacion (
    id, hogar_id, creada_por, miembro_objetivo_id, token_hash, nota, expira_en
  ) values (
    v_id, v_actor.hogar_id, v_actor.id, p_miembro_objetivo_id, v_hash, v_nota, v_expira_en
  );

  return pg_catalog.jsonb_build_object(
    'invitacion_id', v_id,
    'token', v_token,
    'expira_en', v_expira_en,
    'hogar_nombre', v_hogar_nombre,
    'miembro_objetivo_id', p_miembro_objetivo_id,
    'nota', v_nota
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: listar_invitaciones (solo admin; jamás expone token_hash)
-- ---------------------------------------------------------------------------

create function public.listar_invitaciones()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_lista jsonb;
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

  if not found or v_actor.rol <> 'admin' then
    raise exception 'solo un administrador puede consultar las invitaciones' using errcode = '42501';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', i.id,
        'nota', i.nota,
        'miembro_objetivo_id', i.miembro_objetivo_id,
        'miembro_objetivo_nombre', mo.nombre,
        'creada_en', i.creada_en,
        'expira_en', i.expira_en
      )
      order by i.creada_en desc
    ),
    '[]'::jsonb
  ) into v_lista
    from public.invitacion i
    left join public.miembro mo on mo.id = i.miembro_objetivo_id and mo.hogar_id = i.hogar_id
   where i.hogar_id = v_actor.hogar_id
     and i.usada_en is null
     and i.revocada_en is null
     and i.expira_en > now();

  return v_lista;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: revocar_invitacion (solo admin)
-- ---------------------------------------------------------------------------

create function public.revocar_invitacion(p_invitacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor record;
  v_actualizada uuid;
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

  if not found or v_actor.rol <> 'admin' then
    raise exception 'solo un administrador puede revocar invitaciones' using errcode = '42501';
  end if;

  update public.invitacion
     set revocada_en = now()
   where id = p_invitacion_id
     and hogar_id = v_actor.hogar_id
     and usada_en is null
     and revocada_en is null
  returning id into v_actualizada;

  return pg_catalog.jsonb_build_object('revocada', v_actualizada is not null);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: canjear_invitacion (invitado autenticado)
-- ---------------------------------------------------------------------------

create function public.canjear_invitacion(
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
  v_hash text;
  v_inv public.invitacion;
  v_miembro public.miembro;
  v_miembro_id uuid;
  v_hogar_nombre text;
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;

  -- Serializa contra crear_hogar para garantizar 1 hogar activo por usuario en fase 1.
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

    update public.miembro
       set usuario_id = v_usuario_id,
           nombre = case when private.nombre_visible(v_nombre) then v_nombre else nombre end,
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

    insert into public.miembro (
      id, hogar_id, nombre, usuario_id, rol, activo, actualizado_por
    ) values (
      v_miembro_id, v_inv.hogar_id, v_nombre, v_usuario_id, 'miembro', true, v_inv.creada_por
    );

    insert into public.personal_seq (hogar_id, miembro_id, ultimo_seq)
    values (v_inv.hogar_id, v_miembro_id, 0);
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
-- Privilegios
-- ---------------------------------------------------------------------------

revoke all on table public.invitacion from public, anon, authenticated;

revoke all on function private.hash_token_invitacion(text) from public, anon, authenticated;

revoke all on function
  public.crear_invitacion(uuid, text),
  public.listar_invitaciones(),
  public.revocar_invitacion(uuid),
  public.canjear_invitacion(text, text)
  from public, anon;

grant execute on function
  public.crear_invitacion(uuid, text),
  public.listar_invitaciones(),
  public.revocar_invitacion(uuid),
  public.canjear_invitacion(text, text)
  to authenticated;
