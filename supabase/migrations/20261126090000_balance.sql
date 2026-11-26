-- Núcleo 3 (balance de pareja y exportación): ingreso (serie de versiones I24),
-- recepción de ingreso (único por serie y periodo I22), aporte al fondo común
-- (I17), `sync_push_balance`, funciones de exportación separadas por alcance
-- (`exportar_hogar` y `exportar_personal`) y bucket privado en Storage.
-- Referencias: docs/data-model.md §3.3, §3.3.1, §3.12, §8; docs/architecture.md
-- §5.3, §5.9, §9.1–§9.2.

-- ---------------------------------------------------------------------------
-- Helper: fecha civil en America/Bogota y validación de UUID para Storage
-- ---------------------------------------------------------------------------

create function private.es_uuid(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
     and p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
$$;

-- ---------------------------------------------------------------------------
-- Ingreso (§3.3): fijo en serie de versiones o variable puntual.
-- ---------------------------------------------------------------------------

create table public.ingreso (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  miembro_id uuid not null,
  tipo text not null
    constraint ingreso_tipo_check check (tipo in ('fijo', 'variable')),
  serie_id uuid,
  descripcion text not null
    constraint ingreso_descripcion_check check (
      descripcion ~ '[^[:space:]]' and pg_catalog.char_length(descripcion) <= 200
    ),
  monto bigint not null
    constraint ingreso_monto_check check (monto > 0),
  dia_esperado smallint
    constraint ingreso_dia_esperado_check check (dia_esperado between 1 and 31),
  vigente_desde date,
  vigente_hasta date,
  fecha date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint ingreso_hogar_id_id_key unique (hogar_id, id),
  constraint ingreso_id_serie_id_key unique (id, serie_id),
  constraint ingreso_hogar_id_id_serie_id_key unique (hogar_id, id, serie_id),
  constraint ingreso_forma_check check (
    (
      tipo = 'fijo'
      and serie_id is not null
      and dia_esperado is not null
      and vigente_desde is not null
      and (vigente_hasta is null or vigente_hasta >= vigente_desde)
      and fecha is null
    )
    or (
      tipo = 'variable'
      and serie_id is null
      and dia_esperado is null
      and vigente_desde is null
      and vigente_hasta is null
      and fecha is not null
    )
  ),
  constraint ingreso_miembro_fkey
    foreign key (hogar_id, miembro_id) references public.miembro (hogar_id, id),
  constraint ingreso_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create index ingreso_serie_idx
  on public.ingreso (hogar_id, serie_id)
  where serie_id is not null and eliminado_en is null;

-- ---------------------------------------------------------------------------
-- RecepcionIngreso (§3.3.1): recibo único por (serie_id, periodo).
-- ---------------------------------------------------------------------------

create table public.recepcion_ingreso (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  ingreso_id uuid not null,
  serie_id uuid not null,
  periodo text not null
    constraint recepcion_ingreso_periodo_check check (private.es_periodo(periodo)),
  recibido boolean not null default false,
  monto_recibido bigint
    constraint recepcion_ingreso_monto_recibido_check check (monto_recibido > 0),
  fecha_recepcion date,
  registrado_por uuid not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint recepcion_ingreso_hogar_id_id_key unique (hogar_id, id),
  constraint recepcion_ingreso_estado_check check (
    (recibido = false and monto_recibido is null and fecha_recepcion is null)
    or (recibido = true and fecha_recepcion is not null)
  ),
  constraint recepcion_ingreso_ingreso_fkey
    foreign key (hogar_id, ingreso_id, serie_id)
    references public.ingreso (hogar_id, id, serie_id),
  constraint recepcion_ingreso_registrado_por_fkey
    foreign key (hogar_id, registrado_por) references public.miembro (hogar_id, id),
  constraint recepcion_ingreso_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

-- I22: único parcial por serie y periodo (acotado al hogar para evitar oráculos).
create unique index recepcion_ingreso_serie_periodo_key
  on public.recepcion_ingreso (hogar_id, serie_id, periodo)
  where eliminado_en is null;

-- ---------------------------------------------------------------------------
-- Aporte (§3.12): transferencia de un miembro al fondo común del hogar (I17).
-- ---------------------------------------------------------------------------

create table public.aporte (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  medio_origen_id uuid not null,
  medio_destino_id uuid not null,
  monto bigint not null
    constraint aporte_monto_check check (monto > 0),
  fecha date not null,
  nota text
    constraint aporte_nota_check check (pg_catalog.char_length(nota) <= 200),
  registrado_por uuid not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint aporte_medios_distintos_check check (medio_origen_id <> medio_destino_id),
  constraint aporte_origen_fkey
    foreign key (hogar_id, medio_origen_id) references public.medio_de_pago (hogar_id, id),
  constraint aporte_destino_fkey
    foreign key (hogar_id, medio_destino_id) references public.medio_de_pago (hogar_id, id),
  constraint aporte_registrado_por_fkey
    foreign key (hogar_id, registrado_por) references public.miembro (hogar_id, id),
  constraint aporte_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

-- ---------------------------------------------------------------------------
-- Reglas I24, I22 e I17 en SQL (idénticas a src/domain/ingresos.ts)
-- ---------------------------------------------------------------------------

create function private.version_ingreso_serie(
  p_hogar_id uuid,
  p_serie_id uuid,
  p_periodo text
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_p date;
  v_u date;
  v_inicio date;
  v_ultima_id uuid;
  v_fin date;
  v_fin_efectivo date;
  v_ref date;
  v_elegida uuid;
begin
  if not private.es_periodo(p_periodo) or p_serie_id is null then
    return null;
  end if;

  v_p := (p_periodo || '-01')::date;
  v_u := (pg_catalog.date_trunc('month', v_p) + interval '1 month - 1 day')::date;

  select min(i.vigente_desde)
    into v_inicio
    from public.ingreso i
   where i.hogar_id = p_hogar_id
     and i.serie_id = p_serie_id
     and i.tipo = 'fijo'
     and i.eliminado_en is null;

  if v_inicio is null then
    return null;
  end if;

  select i.id, i.vigente_hasta
    into v_ultima_id, v_fin
    from public.ingreso i
   where i.hogar_id = p_hogar_id
     and i.serie_id = p_serie_id
     and i.tipo = 'fijo'
     and i.eliminado_en is null
   order by i.vigente_desde desc
   limit 1;

  v_fin_efectivo := v_fin;
  if v_fin is not null
     and pg_catalog.to_char(v_inicio, 'YYYY-MM') = pg_catalog.to_char(v_fin, 'YYYY-MM') then
    v_fin_efectivo :=
      (pg_catalog.date_trunc('month', v_inicio) + interval '1 month - 1 day')::date;
  end if;

  if v_inicio > v_u or (v_fin_efectivo is not null and v_fin_efectivo < v_p) then
    return null;
  end if;

  v_ref := case when v_inicio <= v_p then v_p else v_u end;

  select i.id
    into v_elegida
    from public.ingreso i
   where i.hogar_id = p_hogar_id
     and i.serie_id = p_serie_id
     and i.tipo = 'fijo'
     and i.eliminado_en is null
     and i.vigente_desde <= v_ref
     and (
       case
         when i.id = v_ultima_id then v_fin_efectivo is null or v_ref <= v_fin_efectivo
         else i.vigente_hasta is null or v_ref <= i.vigente_hasta
       end
     )
   order by i.vigente_desde
   limit 1;

  return v_elegida;
end;
$$;

create function private.validar_serie_ingreso(p_hogar_id uuid, p_serie_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_miembro uuid := null;
  v_prev_hasta date := null;
  v_primero boolean := true;
begin
  if p_serie_id is null then
    return;
  end if;

  for v_row in
    select i.id, i.miembro_id, i.tipo, i.vigente_desde, i.vigente_hasta
      from public.ingreso i
     where i.hogar_id = p_hogar_id
       and i.serie_id = p_serie_id
       and i.eliminado_en is null
     order by i.vigente_desde asc, i.id asc
  loop
    if v_row.tipo <> 'fijo' then
      raise exception 'una serie solo contiene ingresos fijos' using errcode = '23514';
    end if;
    if v_miembro is null then
      v_miembro := v_row.miembro_id;
    elsif v_row.miembro_id is distinct from v_miembro then
      raise exception 'todas las versiones de una serie pertenecen al mismo miembro'
        using errcode = '23514';
    end if;

    if not v_primero then
      if v_prev_hasta is null or v_prev_hasta + 1 <> v_row.vigente_desde then
        raise exception 'las vigencias de la serie deben ser inclusivas y contiguas'
          using errcode = '23514';
      end if;
    end if;
    v_primero := false;
    v_prev_hasta := v_row.vigente_hasta;
  end loop;

  if exists (
    select 1
      from public.recepcion_ingreso r
     where r.hogar_id = p_hogar_id
       and r.serie_id = p_serie_id
       and r.eliminado_en is null
       and private.version_ingreso_serie(p_hogar_id, p_serie_id, r.periodo) is null
  ) then
    raise exception 'existe un recibo fuera de la vigencia de la serie'
      using errcode = '23514';
  end if;
end;
$$;

create function private.ingreso_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo is distinct from old.tipo
     or new.miembro_id is distinct from old.miembro_id
     or new.serie_id is distinct from old.serie_id then
    raise exception 'no se puede cambiar tipo, miembro o serie de un ingreso'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.trigger_validar_serie_ingreso()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.validar_serie_ingreso(new.hogar_id, new.serie_id);
  return null;
end;
$$;

create function private.recepcion_serie_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.serie_id is distinct from old.serie_id then
    raise exception 'serie_id de un recibo es inmutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.trigger_validar_recepcion_ingreso()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo text;
  v_elim timestamptz;
begin
  if new.eliminado_en is not null then
    return null;
  end if;

  select i.tipo, i.eliminado_en
    into v_tipo, v_elim
    from public.ingreso i
   where i.hogar_id = new.hogar_id
     and i.id = new.ingreso_id
     and i.serie_id = new.serie_id;

  if v_tipo is distinct from 'fijo' or v_elim is not null then
    raise exception 'el recibo requiere una versión fija vigente' using errcode = '23514';
  end if;

  if private.version_ingreso_serie(new.hogar_id, new.serie_id, new.periodo) is null then
    raise exception 'el periodo no está activo en la serie' using errcode = '23514';
  end if;

  return null;
end;
$$;

create function private.trigger_validar_aporte()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_origen record;
  v_destino record;
begin
  if new.eliminado_en is not null then
    return null;
  end if;

  select m.owner_tipo, m.eliminado_en into v_origen
    from public.medio_de_pago m
   where m.hogar_id = new.hogar_id and m.id = new.medio_origen_id;

  select m.owner_tipo, m.eliminado_en into v_destino
    from public.medio_de_pago m
   where m.hogar_id = new.hogar_id and m.id = new.medio_destino_id;

  if v_origen.owner_tipo is distinct from 'miembro'
     or v_origen.eliminado_en is not null
     or v_destino.owner_tipo is distinct from 'hogar'
     or v_destino.eliminado_en is not null then
    raise exception 'un aporte va de un medio de miembro a un medio del hogar'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create trigger ingreso_tenencia before update on public.ingreso
  for each row execute function private.tenencia_inmutable();
create trigger ingreso_inmutable_campos before update on public.ingreso
  for each row execute function private.ingreso_inmutable();
create trigger ingreso_seq before insert or update on public.ingreso
  for each row execute function private.fundacion_seq_hogar();
create constraint trigger ingreso_serie_valida
  after insert or update on public.ingreso
  deferrable initially deferred
  for each row execute function private.trigger_validar_serie_ingreso();

create trigger recepcion_ingreso_tenencia before update on public.recepcion_ingreso
  for each row execute function private.tenencia_inmutable();
create trigger recepcion_ingreso_serie_inmutable before update on public.recepcion_ingreso
  for each row execute function private.recepcion_serie_inmutable();
create trigger recepcion_ingreso_seq before insert or update on public.recepcion_ingreso
  for each row execute function private.fundacion_seq_hogar();
create constraint trigger recepcion_ingreso_valida
  after insert or update on public.recepcion_ingreso
  deferrable initially deferred
  for each row execute function private.trigger_validar_recepcion_ingreso();

create trigger aporte_tenencia before update on public.aporte
  for each row execute function private.tenencia_inmutable();
create trigger aporte_seq before insert or update on public.aporte
  for each row execute function private.fundacion_seq_hogar();
create constraint trigger aporte_medios_validos
  after insert or update on public.aporte
  deferrable initially deferred
  for each row execute function private.trigger_validar_aporte();

-- ---------------------------------------------------------------------------
-- RLS: lectura por membresía del hogar (cada miembro ve ingresos ajenos)
-- ---------------------------------------------------------------------------

alter table public.ingreso enable row level security;
alter table public.recepcion_ingreso enable row level security;
alter table public.aporte enable row level security;

create policy ingreso_select on public.ingreso
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

create policy recepcion_ingreso_select on public.recepcion_ingreso
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

create policy aporte_select on public.aporte
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

-- ---------------------------------------------------------------------------
-- RPC: sync_push_balance (versión 1)
-- ---------------------------------------------------------------------------

create function public.sync_push_balance(p_lote jsonb)
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
  v_salida jsonb := '[]'::jsonb;
  v_parcial jsonb;
  v_resultado jsonb;
  v_restriccion text;
  v_mensaje text;
  v_fila jsonb;
  v_id uuid;
  v_ingreso_id uuid;
  v_serie_id uuid;
  v_base_seq bigint;
  v_seq_actual bigint;
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
   where m.hogar_id = v_hogar_id
     and m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null;
  if v_actor is null then
    return private.rechazo('no_autorizado');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'sync_push:' || v_hogar_id::text || ':' || v_actor::text || ':' || v_lote_id::text, 0));

  select la.resultado into v_previo
    from public.lote_aplicado la
   where la.hogar_id = v_hogar_id
     and la.autor_miembro_id = v_actor
     and la.lote_id = v_lote_id;
  if found then
    return v_previo;
  end if;

  v_tipo := p_lote ->> 'tipo';
  v_permitidas := case v_tipo
    when 'aporte' then array['aporte']
    when 'ingreso' then array['ingreso', 'recepcion_ingreso']
    when 'recepcion_ingreso' then array['recepcion_ingreso']
    when 'hogar_preferencia' then array['hogar']
  end;
  if v_permitidas is null then
    return private.rechazo('invalido', 'tipo de lote desconocido');
  end if;

  v_filas := p_lote -> 'filas';
  for v_tabla in select pg_catalog.jsonb_object_keys(v_filas) loop
    if not (v_tabla = any (v_permitidas))
       or pg_catalog.jsonb_typeof(v_filas -> v_tabla) <> 'array'
       or pg_catalog.jsonb_array_length(v_filas -> v_tabla) > 10 then
      return private.rechazo('invalido', 'tabla no admitida: ' || v_tabla);
    end if;
  end loop;

  if exists (
    select 1
      from pg_catalog.jsonb_each(v_filas) t, pg_catalog.jsonb_array_elements(t.value) e
     where pg_catalog.jsonb_typeof(e) <> 'object'
  ) then
    return private.rechazo('invalido', 'forma de fila inválida');
  end if;

  begin
    perform 1 from public.hogar_seq where hogar_id = v_hogar_id for update;

    if v_tipo = 'aporte' then
      if pg_catalog.jsonb_array_length(coalesce(v_filas -> 'aporte', '[]')) <> 1 then
        return private.rechazo('invalido', 'un lote de aporte lleva una fila');
      end if;
      v_fila := v_filas -> 'aporte' -> 0;
      if pg_catalog.jsonb_typeof(v_fila -> 'base_seq') is distinct from null
         and pg_catalog.jsonb_typeof(v_fila -> 'base_seq') <> 'null' then
        return private.rechazo('invalido', 'aporte solo admite altas');
      end if;

      with ins as (
        insert into public.aporte (
          id, hogar_id, medio_origen_id, medio_destino_id, monto, fecha, nota,
          registrado_por, actualizado_por)
        select a.id, v_hogar_id, a.medio_origen_id, a.medio_destino_id, a.monto, a.fecha, a.nota,
               v_actor, v_actor
          from pg_catalog.jsonb_to_record(v_fila) as a (
            id uuid, medio_origen_id uuid, medio_destino_id uuid, monto bigint, fecha date, nota text)
        returning id, seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'aporte', 'id', id, 'seq', seq))
        into v_parcial from ins;
      v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

    elsif v_tipo = 'ingreso' then
      if pg_catalog.jsonb_array_length(coalesce(v_filas -> 'ingreso', '[]')) not between 1 and 2
         or pg_catalog.jsonb_array_length(coalesce(v_filas -> 'recepcion_ingreso', '[]')) > 1 then
        return private.rechazo('invalido', 'cantidad de filas de ingreso inválida');
      end if;

      -- Procesa actualizaciones (cierre de versión anterior) y luego altas de ingreso.
      for v_fila in
        select e from pg_catalog.jsonb_array_elements(v_filas -> 'ingreso') e
      loop
        if pg_catalog.jsonb_typeof(v_fila -> 'base_seq') = 'number' then
          v_id := (v_fila ->> 'id')::uuid;
          v_base_seq := (v_fila ->> 'base_seq')::bigint;
          select i.seq into v_seq_actual
            from public.ingreso i
           where i.id = v_id and i.hogar_id = v_hogar_id and i.eliminado_en is null;
          if not found then
            return private.rechazo('invalido', 'ingreso inexistente');
          end if;
          if v_seq_actual <> v_base_seq then
            return private.rechazo('conflicto', 'el ingreso cambió en el servidor');
          end if;

          with upd as (
            update public.ingreso i
               set vigente_hasta = case
                     when v_fila ? 'vigente_hasta' then (v_fila ->> 'vigente_hasta')::date
                     else i.vigente_hasta
                   end,
                   eliminado_en = case
                     when v_fila ? 'eliminado_en' then (v_fila ->> 'eliminado_en')::timestamptz
                     else i.eliminado_en
                   end,
                   actualizado_en = now(),
                   actualizado_por = v_actor
             where i.id = v_id and i.hogar_id = v_hogar_id
            returning i.id, i.seq
          )
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'ingreso', 'id', id, 'seq', seq))
            into v_parcial from upd;
          v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);
        elsif pg_catalog.jsonb_typeof(v_fila -> 'base_seq') is distinct from null
              and pg_catalog.jsonb_typeof(v_fila -> 'base_seq') <> 'null' then
          return private.rechazo('invalido', 'base_seq inválido');
        else
          with ins as (
            insert into public.ingreso (
              id, hogar_id, miembro_id, tipo, serie_id, descripcion, monto,
              dia_esperado, vigente_desde, vigente_hasta, fecha, actualizado_por)
            select i.id, v_hogar_id, i.miembro_id, i.tipo, i.serie_id, i.descripcion, i.monto,
                   i.dia_esperado, i.vigente_desde, i.vigente_hasta, i.fecha, v_actor
              from pg_catalog.jsonb_to_record(v_fila) as i (
                id uuid, miembro_id uuid, tipo text, serie_id uuid, descripcion text, monto bigint,
                dia_esperado smallint, vigente_desde date, vigente_hasta date, fecha date)
            returning id, seq
          )
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'ingreso', 'id', id, 'seq', seq))
            into v_parcial from ins;
          v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);
        end if;
      end loop;

      if pg_catalog.jsonb_array_length(coalesce(v_filas -> 'recepcion_ingreso', '[]')) = 1 then
        v_fila := v_filas -> 'recepcion_ingreso' -> 0;
        if pg_catalog.jsonb_typeof(v_fila -> 'base_seq') is distinct from null
           and pg_catalog.jsonb_typeof(v_fila -> 'base_seq') <> 'null' then
          return private.rechazo('invalido', 'el recibo inicial no lleva base_seq');
        end if;
        v_ingreso_id := (v_fila ->> 'ingreso_id')::uuid;
        -- El servidor resuelve siempre serie_id desde la versión fija del mismo hogar.
        select i.serie_id into v_serie_id
          from public.ingreso i
         where i.id = v_ingreso_id and i.hogar_id = v_hogar_id
           and i.tipo = 'fijo' and i.eliminado_en is null;
        if v_serie_id is null then
          return private.rechazo('invalido', 'ingreso fijo inexistente');
        end if;

        with ins as (
          insert into public.recepcion_ingreso (
            id, hogar_id, ingreso_id, serie_id, periodo, recibido, monto_recibido,
            fecha_recepcion, registrado_por, actualizado_por)
          select r.id, v_hogar_id, r.ingreso_id, v_serie_id, r.periodo, r.recibido,
                 r.monto_recibido, r.fecha_recepcion, v_actor, v_actor
            from pg_catalog.jsonb_to_record(v_fila) as r (
              id uuid, ingreso_id uuid, periodo text, recibido boolean,
              monto_recibido bigint, fecha_recepcion date)
          returning id, seq
        )
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'recepcion_ingreso', 'id', id, 'seq', seq))
          into v_parcial from ins;
        v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);
      end if;

    elsif v_tipo = 'recepcion_ingreso' then
      if pg_catalog.jsonb_array_length(coalesce(v_filas -> 'recepcion_ingreso', '[]')) <> 1 then
        return private.rechazo('invalido', 'un lote de recepción lleva una fila');
      end if;
      v_fila := v_filas -> 'recepcion_ingreso' -> 0;
      v_ingreso_id := (v_fila ->> 'ingreso_id')::uuid;
      select i.serie_id into v_serie_id
        from public.ingreso i
       where i.id = v_ingreso_id and i.hogar_id = v_hogar_id
         and i.tipo = 'fijo' and i.eliminado_en is null;
      if v_serie_id is null then
        return private.rechazo('invalido', 'ingreso fijo inexistente');
      end if;

      if pg_catalog.jsonb_typeof(v_fila -> 'base_seq') = 'number' then
        v_id := (v_fila ->> 'id')::uuid;
        v_base_seq := (v_fila ->> 'base_seq')::bigint;
        select r.seq into v_seq_actual
          from public.recepcion_ingreso r
         where r.id = v_id
           and r.hogar_id = v_hogar_id
           and r.serie_id = v_serie_id
           and r.eliminado_en is null;
        if not found then
          return private.rechazo('invalido', 'recibo inexistente');
        end if;
        if v_seq_actual <> v_base_seq then
          return private.rechazo('conflicto', 'el recibo cambió en el servidor');
        end if;

        with upd as (
          update public.recepcion_ingreso r
             set recibido = (v_fila ->> 'recibido')::boolean,
                 monto_recibido = (v_fila ->> 'monto_recibido')::bigint,
                 fecha_recepcion = (v_fila ->> 'fecha_recepcion')::date,
                 registrado_por = v_actor,
                 actualizado_en = now(),
                 actualizado_por = v_actor
           where r.id = v_id and r.hogar_id = v_hogar_id
          returning r.id, r.seq
        )
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'recepcion_ingreso', 'id', id, 'seq', seq))
          into v_parcial from upd;
        v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);
      elsif pg_catalog.jsonb_typeof(v_fila -> 'base_seq') is distinct from null
            and pg_catalog.jsonb_typeof(v_fila -> 'base_seq') <> 'null' then
        return private.rechazo('invalido', 'base_seq inválido');
      else
        with ins as (
          insert into public.recepcion_ingreso (
            id, hogar_id, ingreso_id, serie_id, periodo, recibido, monto_recibido,
            fecha_recepcion, registrado_por, actualizado_por)
          select r.id, v_hogar_id, r.ingreso_id, v_serie_id, r.periodo, r.recibido,
                 r.monto_recibido, r.fecha_recepcion, v_actor, v_actor
            from pg_catalog.jsonb_to_record(v_fila) as r (
              id uuid, ingreso_id uuid, periodo text, recibido boolean,
              monto_recibido bigint, fecha_recepcion date)
          returning id, seq
        )
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'recepcion_ingreso', 'id', id, 'seq', seq))
          into v_parcial from ins;
        v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);
      end if;

    else
      -- hogar_preferencia: actualiza mostrar_pct_ingreso con base_seq obligatorio.
      if pg_catalog.jsonb_array_length(coalesce(v_filas -> 'hogar', '[]')) <> 1 then
        return private.rechazo('invalido', 'un lote de preferencia lleva una fila de hogar');
      end if;
      v_fila := v_filas -> 'hogar' -> 0;
      if (v_fila ->> 'id')::uuid is distinct from v_hogar_id
         or pg_catalog.jsonb_typeof(v_fila -> 'base_seq') <> 'number'
         or pg_catalog.jsonb_typeof(v_fila -> 'mostrar_pct_ingreso') <> 'boolean' then
        return private.rechazo('invalido', 'preferencia de hogar inválida');
      end if;
      v_base_seq := (v_fila ->> 'base_seq')::bigint;
      select h.seq into v_seq_actual
        from public.hogar h
       where h.id = v_hogar_id and h.eliminado_en is null;
      if v_seq_actual <> v_base_seq then
        return private.rechazo('conflicto', 'la preferencia cambió en el servidor');
      end if;

      with upd as (
        update public.hogar h
           set mostrar_pct_ingreso = (v_fila ->> 'mostrar_pct_ingreso')::boolean,
               actualizado_en = now(),
               actualizado_por = v_actor
         where h.id = v_hogar_id
        returning h.id, h.seq
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'hogar', 'id', id, 'seq', seq))
        into v_parcial from upd;
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
-- Exportación por alcance separado (§9.1–§9.2): hogar vs personal
-- ---------------------------------------------------------------------------

create function private.exportar_hogar_datos(p_hogar_id uuid, p_fecha date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'alcance', 'hogar',
    'fecha', p_fecha::text,
    'tablas', pg_catalog.jsonb_build_object(
      'hogar', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.hogar t where t.id = p_hogar_id), '[]'::jsonb),
      'miembro', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.miembro t where t.hogar_id = p_hogar_id), '[]'::jsonb),
      'categoria', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.categoria t where t.hogar_id = p_hogar_id), '[]'::jsonb),
      'medio_de_pago', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.medio_de_pago t where t.hogar_id = p_hogar_id), '[]'::jsonb),
      'pasivo', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.pasivo t where t.hogar_id = p_hogar_id and t.ambito = 'hogar'), '[]'::jsonb),
      'tarjeta', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.tarjeta t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'hogar'
      ), '[]'::jsonb),
      'credito', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.credito t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'hogar'
      ), '[]'::jsonb),
      'deuda', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.deuda t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'hogar'
      ), '[]'::jsonb),
      'plan_de_cuotas', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.plan_de_cuotas t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'hogar'
      ), '[]'::jsonb),
      'cuota', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.cuota t
          join public.plan_de_cuotas pl on pl.id = t.plan_id
          join public.pasivo pa on pa.id = pl.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'hogar'
      ), '[]'::jsonb),
      'pago_de_deuda', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.pago_de_deuda t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'hogar'
      ), '[]'::jsonb),
      'costo_financiero', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.costo_financiero t
          left join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id
           and (t.pasivo_id is null or pa.ambito = 'hogar')
      ), '[]'::jsonb),
      'compra', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.compra t where t.hogar_id = p_hogar_id and t.ambito = 'hogar'), '[]'::jsonb),
      'obligacion', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.obligacion t where t.hogar_id = p_hogar_id), '[]'::jsonb),
      'ingreso', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.ingreso t where t.hogar_id = p_hogar_id), '[]'::jsonb),
      'recepcion_ingreso', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.recepcion_ingreso t where t.hogar_id = p_hogar_id), '[]'::jsonb),
      'aporte', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.aporte t where t.hogar_id = p_hogar_id), '[]'::jsonb),
      'alias_comercio', coalesce((select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq) from public.alias_comercio t where t.hogar_id = p_hogar_id), '[]'::jsonb)
    )
  );
$$;

create function private.exportar_personal_datos(p_hogar_id uuid, p_miembro_id uuid, p_fecha date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'alcance', 'personal',
    'fecha', p_fecha::text,
    'tablas', pg_catalog.jsonb_build_object(
      'pasivo', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.pasivo t
         where t.hogar_id = p_hogar_id and t.ambito = 'personal' and t.owner_miembro_id = p_miembro_id
      ), '[]'::jsonb),
      'tarjeta', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.tarjeta t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'personal' and pa.owner_miembro_id = p_miembro_id
      ), '[]'::jsonb),
      'credito', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.credito t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'personal' and pa.owner_miembro_id = p_miembro_id
      ), '[]'::jsonb),
      'deuda', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.deuda t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'personal' and pa.owner_miembro_id = p_miembro_id
      ), '[]'::jsonb),
      'plan_de_cuotas', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.plan_de_cuotas t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'personal' and pa.owner_miembro_id = p_miembro_id
      ), '[]'::jsonb),
      'cuota', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.cuota t
          join public.plan_de_cuotas pl on pl.id = t.plan_id
          join public.pasivo pa on pa.id = pl.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'personal' and pa.owner_miembro_id = p_miembro_id
      ), '[]'::jsonb),
      'pago_de_deuda', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.pago_de_deuda t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'personal' and pa.owner_miembro_id = p_miembro_id
      ), '[]'::jsonb),
      'costo_financiero', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.costo_financiero t
          join public.pasivo pa on pa.id = t.pasivo_id
         where t.hogar_id = p_hogar_id and pa.ambito = 'personal' and pa.owner_miembro_id = p_miembro_id
      ), '[]'::jsonb),
      'compra', coalesce((
        select pg_catalog.jsonb_agg(to_jsonb(t) order by t.seq)
          from public.compra t
         where t.hogar_id = p_hogar_id and t.ambito = 'personal' and t.miembro_id = p_miembro_id
      ), '[]'::jsonb)
    )
  );
$$;

create function public.exportar_hogar(p_hogar_id uuid, p_fecha date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_fecha date := coalesce(p_fecha, (pg_catalog.now() at time zone 'America/Bogota')::date);
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;
  if not private.puede_ver(p_hogar_id, 'hogar', null) then
    raise exception 'no autorizado para exportar este hogar' using errcode = '42501';
  end if;
  return private.exportar_hogar_datos(p_hogar_id, v_fecha);
end;
$$;

create function public.exportar_personal(p_hogar_id uuid, p_fecha date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_actor uuid;
  v_fecha date := coalesce(p_fecha, (pg_catalog.now() at time zone 'America/Bogota')::date);
begin
  if v_usuario_id is null then
    raise exception 'se necesita una sesión autenticada' using errcode = '28000';
  end if;
  -- El miembro sale siempre de auth.uid(), nunca de un parámetro del cliente.
  select m.id into v_actor
    from public.miembro m
   where m.hogar_id = p_hogar_id
     and m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null;
  if v_actor is null then
    raise exception 'no autorizado para exportar datos personales' using errcode = '42501';
  end if;
  return private.exportar_personal_datos(p_hogar_id, v_actor, v_fecha);
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage privado por prefijo (§9.2)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('exportaciones', 'exportaciones', false)
on conflict (id) do nothing;

create policy exportaciones_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exportaciones'
    and (
      case
        when path_tokens[1] = 'hogar' and private.es_uuid(path_tokens[2]) then
          private.puede_ver(path_tokens[2]::uuid, 'hogar', null)
        when path_tokens[1] = 'personal'
             and private.es_uuid(path_tokens[2])
             and private.es_uuid(path_tokens[3]) then
          private.puede_ver(path_tokens[2]::uuid, 'personal', path_tokens[3]::uuid)
        else false
      end
    )
  );

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

revoke all on table public.ingreso, public.recepcion_ingreso, public.aporte
  from anon, authenticated;
grant select on table public.ingreso, public.recepcion_ingreso, public.aporte
  to authenticated;

revoke all on function
  private.es_uuid(text),
  private.version_ingreso_serie(uuid, uuid, text),
  private.validar_serie_ingreso(uuid, uuid),
  private.ingreso_inmutable(),
  private.trigger_validar_serie_ingreso(),
  private.recepcion_serie_inmutable(),
  private.trigger_validar_recepcion_ingreso(),
  private.trigger_validar_aporte(),
  private.exportar_hogar_datos(uuid, date),
  private.exportar_personal_datos(uuid, uuid, date)
  from public, anon, authenticated;

grant execute on function private.es_uuid(text) to authenticated;

revoke all on function
  public.sync_push_balance(jsonb),
  public.exportar_hogar(uuid, date),
  public.exportar_personal(uuid, date)
  from public, anon;

grant execute on function
  public.sync_push_balance(jsonb),
  public.exportar_hogar(uuid, date),
  public.exportar_personal(uuid, date)
  to authenticated;
