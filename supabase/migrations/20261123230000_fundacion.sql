-- Fundación de hogar-app: tenencia (hogar, miembro, categoría), carriles de
-- `seq` solo servidor, el único predicado de visibilidad y la RPC de alta.
-- Referencias: docs/data-model.md §1.2, §1.3, §3.1, §3.2, §3.4 y
-- docs/architecture.md §5.2, §5.9 y §6.
--
-- Reglas de superficie:
-- - Los clientes solo leen (SELECT por RLS). No hay políticas de escritura:
--   toda escritura entra por RPC SECURITY DEFINER.
-- - El actor sale siempre de auth.uid(), nunca de un parámetro.
-- - Los contadores `hogar_seq` y `personal_seq` no son legibles por el cliente.

-- ---------------------------------------------------------------------------
-- Esquema privado: funciones internas que el cliente no invoca
-- ---------------------------------------------------------------------------

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

-- UUIDv7 (RFC 9562): 48 bits de milisegundos Unix sobre un UUIDv4 aleatorio,
-- con los bits de versión llevados de 0100 a 0111. La variante RFC se conserva.
create function private.uuid_v7()
returns uuid
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.encode(
    pg_catalog.set_bit(
      pg_catalog.set_bit(
        -- overlay/substring usan sintaxis SQL estándar: no admiten prefijo de
        -- esquema; pg_catalog se resuelve igual aunque search_path esté vacío.
        overlay(
          pg_catalog.uuid_send(pg_catalog.gen_random_uuid())
          placing substring(
            pg_catalog.int8send(
              pg_catalog.floor(
                extract(epoch from pg_catalog.clock_timestamp()) * 1000
              )::bigint
            ) from 3)
          from 1 for 6),
        52, 1),
      53, 1),
    'hex')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.miembro_rol as enum ('admin', 'miembro');

-- ---------------------------------------------------------------------------
-- Hogar: raíz de tenencia y tabla replicada (data-model §1.2): sin `hogar_id`,
-- con `seq` en su propio carril. Su alta abre el carril con `seq = 1`.
-- ---------------------------------------------------------------------------

-- Un nombre visible tiene al menos un carácter que no es espacio (incluye
-- tabuladores y saltos de línea) y a lo sumo 80 caracteres.
create function private.nombre_visible(p_nombre text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_nombre is not null
     and p_nombre ~ '[^[:space:]]'
     and pg_catalog.char_length(p_nombre) <= 80;
$$;

create table public.hogar (
  id uuid primary key,
  nombre text not null
    constraint hogar_nombre_check check (private.nombre_visible(nombre)),
  moneda text not null default 'COP'
    constraint hogar_moneda_check check (moneda = 'COP'),
  zona_horaria text not null default 'America/Bogota'
    constraint hogar_zona_horaria_check check (zona_horaria = 'America/Bogota'),
  mostrar_pct_ingreso boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  -- El admin nace después que el hogar en la misma transacción: la FK de
  -- tenencia se difiere hasta el commit (ver hogar_actualizado_por_fkey).
  actualizado_por uuid not null,
  seq bigint not null default 0
);

-- ---------------------------------------------------------------------------
-- Miembro: persona del hogar, con o sin cuenta de Auth.
-- ---------------------------------------------------------------------------

create table public.miembro (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  nombre text not null
    constraint miembro_nombre_check check (private.nombre_visible(nombre)),
  usuario_id uuid references auth.users (id) on delete set null,
  rol public.miembro_rol not null default 'miembro',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null references public.miembro (id),
  seq bigint not null default 0,
  -- Destino de las FK compuestas de tenencia (I14).
  constraint miembro_hogar_id_id_key unique (hogar_id, id),
  constraint miembro_actualizado_por_mismo_hogar_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create unique index miembro_hogar_usuario_key
  on public.miembro (hogar_id, usuario_id)
  where usuario_id is not null and eliminado_en is null;

create index miembro_usuario_idx
  on public.miembro (usuario_id)
  where usuario_id is not null and eliminado_en is null;

alter table public.hogar
  add constraint hogar_actualizado_por_fkey
  foreign key (id, actualizado_por) references public.miembro (hogar_id, id)
  deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Categoria: clasifica consumos. Se archiva, no se borra.
-- ---------------------------------------------------------------------------

create table public.categoria (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  nombre text not null
    constraint categoria_nombre_check check (private.nombre_visible(nombre)),
  icono text,
  orden integer not null constraint categoria_orden_check check (orden >= 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null references public.miembro (id),
  seq bigint not null default 0,
  constraint categoria_actualizado_por_mismo_hogar_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create unique index categoria_hogar_nombre_key
  on public.categoria (hogar_id, pg_catalog.lower(nombre))
  where eliminado_en is null;

-- ---------------------------------------------------------------------------
-- Contadores solo servidor (§1.3): no se replican ni se exponen.
-- ---------------------------------------------------------------------------

create table public.hogar_seq (
  hogar_id uuid primary key references public.hogar (id),
  ultimo_seq bigint not null default 0
    constraint hogar_seq_ultimo_seq_check check (ultimo_seq >= 0)
);

create table public.personal_seq (
  hogar_id uuid not null,
  miembro_id uuid not null,
  ultimo_seq bigint not null default 0
    constraint personal_seq_ultimo_seq_check check (ultimo_seq >= 0),
  primary key (hogar_id, miembro_id),
  constraint personal_seq_miembro_fkey
    foreign key (hogar_id, miembro_id) references public.miembro (hogar_id, id)
);

-- ---------------------------------------------------------------------------
-- Asignación de `seq` por carril (§5.2)
-- ---------------------------------------------------------------------------
-- El UPDATE ... RETURNING toma el lock de fila del contador hasta el commit:
-- el segundo escritor del mismo carril espera y el orden de `seq` coincide con
-- el orden de commit. Carriles distintos no se bloquean entre sí.

create function private.siguiente_seq_hogar(p_hogar_id uuid)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_seq bigint;
begin
  update public.hogar_seq
     set ultimo_seq = ultimo_seq + 1
   where hogar_id = p_hogar_id
  returning ultimo_seq into v_seq;

  if v_seq is null then
    raise exception 'el hogar % no tiene carril de seq', p_hogar_id
      using errcode = '23503';
  end if;

  return v_seq;
end;
$$;

create function private.siguiente_seq_personal(p_hogar_id uuid, p_miembro_id uuid)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_seq bigint;
begin
  update public.personal_seq
     set ultimo_seq = ultimo_seq + 1
   where hogar_id = p_hogar_id
     and miembro_id = p_miembro_id
  returning ultimo_seq into v_seq;

  if v_seq is null then
    raise exception 'el miembro % no tiene carril personal en el hogar %', p_miembro_id, p_hogar_id
      using errcode = '23503';
  end if;

  return v_seq;
end;
$$;

-- Tablas de ámbito hogar (miembro, categoria): siempre el carril compartido.
create function private.fundacion_seq_hogar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.hogar_id is distinct from old.hogar_id then
    raise exception 'una fila no puede cambiar de hogar' using errcode = '23514';
  end if;

  new.seq := private.siguiente_seq_hogar(new.hogar_id);
  return new;
end;
$$;

-- Tablas con `ambito` y `miembro_id` (Compra y sus dependientes, en los núcleos):
-- lo compartido numera el carril del hogar; lo personal, solo el de su dueño, y
-- nunca mueve `hogar_seq` (I25). Un ámbito desconocido no tiene carril.
create function private.fundacion_seq_por_ambito()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.hogar_id is distinct from old.hogar_id then
    raise exception 'una fila no puede cambiar de hogar' using errcode = '23514';
  end if;

  if new.ambito = 'hogar' then
    new.seq := private.siguiente_seq_hogar(new.hogar_id);
  elsif new.ambito = 'personal' then
    if new.miembro_id is null then
      raise exception 'una fila personal necesita dueño' using errcode = '23514';
    end if;
    new.seq := private.siguiente_seq_personal(new.hogar_id, new.miembro_id);
  else
    raise exception 'ámbito desconocido: %', new.ambito using errcode = '23514';
  end if;

  return new;
end;
$$;

-- `id` y `hogar_id` son inmutables: la tenencia no se reasigna.
create function private.tenencia_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.hogar_id is distinct from old.hogar_id then
    raise exception 'una fila no puede cambiar de id ni de hogar' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Hogar: el alta abre su carril con `seq = 1` (BEFORE) y crea el contador ya
-- en 1 (AFTER, cuando la fila existe para la FK). Cada actualización numera en
-- su propio carril. El `id` es inmutable.
create function private.hogar_seq_asignar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.seq := 1;
  else
    if new.id is distinct from old.id then
      raise exception 'un hogar no puede cambiar de id' using errcode = '23514';
    end if;
    new.seq := private.siguiente_seq_hogar(new.id);
  end if;
  return new;
end;
$$;

create function private.hogar_seq_abrir_carril()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.hogar_seq (hogar_id, ultimo_seq) values (new.id, new.seq);
  return null;
end;
$$;

create trigger hogar_seq
  before insert or update on public.hogar
  for each row execute function private.hogar_seq_asignar();

create trigger hogar_seq_carril
  after insert on public.hogar
  for each row execute function private.hogar_seq_abrir_carril();

create trigger miembro_seq
  before insert or update on public.miembro
  for each row execute function private.fundacion_seq_hogar();

create trigger miembro_tenencia
  before update on public.miembro
  for each row execute function private.tenencia_inmutable();

create trigger categoria_seq
  before insert or update on public.categoria
  for each row execute function private.fundacion_seq_hogar();

create trigger categoria_tenencia
  before update on public.categoria
  for each row execute function private.tenencia_inmutable();

-- ---------------------------------------------------------------------------
-- El único predicado de visibilidad (§5.9)
-- ---------------------------------------------------------------------------
-- Visible si el actor (auth.uid()) es miembro activo y vigente del hogar y,
-- para lo personal, además es su dueño. El rol no exime de la propiedad.
-- Cualquier otro caso (sin sesión, hogar nulo, ámbito desconocido, personal sin
-- dueño) devuelve falso, nunca un error ni visibilidad por defecto.

create function private.puede_ver(p_hogar_id uuid, p_ambito text, p_miembro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select true
      from public.miembro m
     where m.hogar_id = p_hogar_id
       and m.usuario_id = auth.uid()
       and m.activo
       and m.eliminado_en is null
       and (
         p_ambito = 'hogar'
         or (p_ambito = 'personal' and p_miembro_id is not null and m.id = p_miembro_id)
       )
     limit 1
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- RLS: una sola política de lectura por tabla, solo para authenticated
-- ---------------------------------------------------------------------------

alter table public.hogar enable row level security;
alter table public.miembro enable row level security;
alter table public.categoria enable row level security;
alter table public.hogar_seq enable row level security;
alter table public.personal_seq enable row level security;

create policy hogar_select on public.hogar
  for select to authenticated
  using (private.puede_ver(id, 'hogar', null));

create policy miembro_select on public.miembro
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

create policy categoria_select on public.categoria
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

-- hogar_seq y personal_seq: RLS activo y ninguna política.

-- ---------------------------------------------------------------------------
-- RPC: crear_hogar
-- ---------------------------------------------------------------------------
-- Alta atómica: hogar (que abre su carril), el miembro admin vinculado a la sesión, su
-- carril personal (arranca en 0) y las nueve categorías canónicas. En la fase 1
-- un usuario tiene a lo sumo un hogar activo; el lock consultivo por usuario
-- serializa dos altas concurrentes de la misma cuenta.

create function public.crear_hogar(p_nombre text, p_nombre_miembro text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  -- Recorta todo espacio en los extremos (también tabuladores y saltos).
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

  -- El trigger del hogar abre su carril (`hogar_seq` en 1). `actualizado_por`
  -- apunta al admin que se inserta a continuación (FK diferida).
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

  return pg_catalog.jsonb_build_object('hogar_id', v_hogar_id, 'miembro_id', v_miembro_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------
-- Supabase concede por defecto todo en `public` a anon y authenticated: se
-- revoca explícitamente y se devuelve solo la lectura.

revoke all on table
  public.hogar, public.miembro, public.categoria, public.hogar_seq, public.personal_seq
  from anon, authenticated;

-- Las tablas y secuencias futuras de `public` (Compra y demás núcleos) nacen sin
-- privilegios para anon ni authenticated: cada migración concede su SELECT de
-- forma explícita. Así olvidar un revoke no deja una tabla legible por anon.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

grant select on table public.hogar, public.miembro, public.categoria to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.puede_ver(uuid, text, uuid) to authenticated;

revoke all on function public.crear_hogar(text, text) from public, anon;
grant execute on function public.crear_hogar(text, text) to authenticated;
