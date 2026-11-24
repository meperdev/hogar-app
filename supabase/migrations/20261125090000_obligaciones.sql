-- Núcleo 2 (obligaciones del mes): obligación recurrente, pago de deuda, el
-- vínculo compra ↔ obligación y la RPC `sync_push_obligaciones` para los lotes
-- de este núcleo (pago de deuda, alta de pasivo, alta de obligación y pago de
-- obligación).
-- Referencias: docs/data-model.md §3.7, §3.10, §3.11, §3.15, §4 y §8 (I5, I6,
-- I10, I11, I18, I20); docs/architecture.md §5.3, §5.7 y §5.9.
--
-- Por qué una RPC aparte y no `CREATE OR REPLACE` de `sync_push`: el lote de
-- compra (núcleo 1) sigue entrando por `sync_push`; reemplazarla aquí pisaría
-- en silencio cualquier ajuste de esa función hecho en paralelo. Ambas RPC
-- comparten helpers (`private.rechazo`, `private.puede_ver`) y las mismas
-- garantías: lote completo o nada, actor desde la sesión y reintento por autor.
--
-- Decisión de Santiago (PR #4): el interés `calculado` de una compra a cuotas
-- es una estimación del cliente. Aquí se corrige contra el extracto: el lote de
-- pago puede actualizar ese `CostoFinanciero` y queda con `origen='manual'`.

-- ---------------------------------------------------------------------------
-- Obligacion (§3.15): plantilla de cobro recurrente. No es deuda.
-- ---------------------------------------------------------------------------

create function private.es_periodo(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p ~ '^[0-9]{4}-(0[1-9]|1[0-2])$';
$$;

create table public.obligacion (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  nombre text not null
    constraint obligacion_nombre_check check (private.nombre_visible(nombre)),
  categoria_id uuid not null,
  monto_estimado bigint
    constraint obligacion_monto_estimado_check check (monto_estimado > 0),
  dia_vencimiento smallint not null
    constraint obligacion_dia_vencimiento_check check (dia_vencimiento between 1 and 31),
  periodicidad text not null
    constraint obligacion_periodicidad_check
      check (periodicidad in ('mensual', 'bimestral', 'trimestral', 'anual')),
  mes_inicio text not null
    constraint obligacion_mes_inicio_check check (private.es_periodo(mes_inicio)),
  medio_sugerido_id uuid,
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint obligacion_hogar_id_id_key unique (hogar_id, id),
  constraint obligacion_categoria_fkey
    foreign key (hogar_id, categoria_id) references public.categoria (hogar_id, id),
  constraint obligacion_medio_sugerido_fkey
    foreign key (hogar_id, medio_sugerido_id) references public.medio_de_pago (hogar_id, id),
  constraint obligacion_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create trigger obligacion_tenencia before update on public.obligacion
  for each row execute function private.tenencia_inmutable();
create trigger obligacion_seq before insert or update on public.obligacion
  for each row execute function private.fundacion_seq_hogar();

-- ---------------------------------------------------------------------------
-- Compra ↔ Obligacion (§3.7, I11): pagar una obligación es una compra del
-- hogar con `obligacion_id` y el `periodo` de la instancia; una por periodo.
-- ---------------------------------------------------------------------------

alter table public.compra
  add column obligacion_id uuid,
  add column periodo text,
  add constraint compra_periodo_check check (private.es_periodo(periodo)),
  add constraint compra_obligacion_periodo_check check ((obligacion_id is null) = (periodo is null)),
  add constraint compra_obligacion_hogar_check check (obligacion_id is null or ambito = 'hogar'),
  add constraint compra_obligacion_fkey
    foreign key (hogar_id, obligacion_id) references public.obligacion (hogar_id, id);

-- Con `hogar_id` en la clave: el choque solo ocurre dentro del hogar y una
-- obligación ajena falla por FK, sin revelar si ese periodo ya se pagó.
create unique index compra_obligacion_periodo_key
  on public.compra (hogar_id, obligacion_id, periodo)
  where obligacion_id is not null and eliminado_en is null;

-- El periodo es una instancia real de la plantilla y la compra va en su categoría.
create function private.validar_compra_obligacion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_o public.obligacion;
  v_paso int;
  v_meses int;
begin
  if new.obligacion_id is null then
    return new;
  end if;
  -- Solo una plantilla del mismo hogar: una ajena se deja al FK, así la
  -- respuesta no revela su calendario.
  select * into v_o from public.obligacion
   where id = new.obligacion_id and hogar_id = new.hogar_id;
  if not found then
    return new;
  end if;
  v_paso := case v_o.periodicidad
              when 'mensual' then 1 when 'bimestral' then 2 when 'trimestral' then 3 else 12 end;
  v_meses := (pg_catalog.left(new.periodo, 4)::int * 12 + pg_catalog.right(new.periodo, 2)::int)
           - (pg_catalog.left(v_o.mes_inicio, 4)::int * 12 + pg_catalog.right(v_o.mes_inicio, 2)::int);
  if v_meses < 0 or v_meses % v_paso <> 0 then
    raise exception 'el periodo no es una instancia de la obligación' using errcode = '23514';
  end if;
  if new.categoria_id is distinct from v_o.categoria_id then
    raise exception 'la compra de una obligación va en su categoría' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger compra_obligacion_valida before insert or update on public.compra
  for each row execute function private.validar_compra_obligacion();

-- ---------------------------------------------------------------------------
-- PagoDeDeuda (§3.10): salida que abona a un pasivo. Nunca es consumo.
-- ---------------------------------------------------------------------------

create table public.pago_de_deuda (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  pasivo_id uuid not null,
  tipo text not null default 'abono'
    constraint pago_de_deuda_tipo_check check (tipo in ('abono', 'saldo_a_favor')),
  cuota_id uuid,
  medio_de_pago_id uuid not null,
  monto bigint not null
    constraint pago_de_deuda_monto_check check (monto > 0),
  fecha date not null,
  nota text
    constraint pago_de_deuda_nota_check check (pg_catalog.char_length(nota) <= 200),
  registrado_por uuid not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint pago_de_deuda_hogar_id_id_key unique (hogar_id, id),
  -- Solo un abono enlaza una cuota; un saldo a favor no cubre una cuota.
  constraint pago_de_deuda_cuota_abono_check check (cuota_id is null or tipo = 'abono'),
  constraint pago_de_deuda_pasivo_fkey
    foreign key (hogar_id, pasivo_id) references public.pasivo (hogar_id, id),
  constraint pago_de_deuda_cuota_fkey
    foreign key (hogar_id, cuota_id) references public.cuota (hogar_id, id),
  constraint pago_de_deuda_medio_de_pago_fkey
    foreign key (hogar_id, medio_de_pago_id) references public.medio_de_pago (hogar_id, id),
  constraint pago_de_deuda_registrado_por_fkey
    foreign key (hogar_id, registrado_por) references public.miembro (hogar_id, id),
  constraint pago_de_deuda_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

-- I20: dos pagos completos enlazados a la misma cuota se rechazan (por hogar,
-- como el índice de obligaciones: una cuota ajena falla por FK).
create unique index pago_de_deuda_cuota_key
  on public.pago_de_deuda (hogar_id, cuota_id)
  where cuota_id is not null and tipo = 'abono' and eliminado_en is null;

create index pago_de_deuda_pasivo_idx on public.pago_de_deuda (pasivo_id);

create trigger pago_de_deuda_tenencia before update on public.pago_de_deuda
  for each row execute function private.tenencia_inmutable();
create trigger pago_de_deuda_seq before insert or update on public.pago_de_deuda
  for each row execute function private.seq_dependiente_de_pasivo();

-- ---------------------------------------------------------------------------
-- I20: el libro de un pasivo nunca queda con saldo negativo
-- ---------------------------------------------------------------------------
-- Mismo algoritmo que `recorrerLibro` en src/domain/deuda.ts. Recorre en orden
-- (fecha, cargos → abonos → saldos a favor, id):
-- - un cargo (capital de un plan en su `fecha_inicio`, costo en su
--   `fecha_causacion`) primero consume saldo a favor de fechas anteriores;
-- - un abono no puede superar el saldo causado a su fecha (tope único);
-- - un saldo a favor solo existe cuando el saldo de esa fecha ya está en 0 y
--   solo cubre cargos posteriores (nunca reescribe el pasado).
-- Bloquea el pasivo para serializar pagos concurrentes del mismo libro.

create function private.verificar_libro(p_pasivo_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
  v_saldo bigint := 0;
  v_pool bigint := 0;
  v_cubierto bigint;
begin
  perform 1 from public.pasivo where id = p_pasivo_id for update;

  for r in
    select e.fecha, e.orden, e.monto
      from (
        select pl.fecha_inicio as fecha, 0 as orden, pl.id::text as id, pl.capital as monto
          from public.plan_de_cuotas pl
         where pl.pasivo_id = p_pasivo_id and pl.eliminado_en is null
        union all
        select c.fecha_causacion, 0, c.id::text, c.monto
          from public.costo_financiero c
         where c.pasivo_id = p_pasivo_id and c.eliminado_en is null
        union all
        select g.fecha, case g.tipo when 'abono' then 1 else 2 end, g.id::text, g.monto
          from public.pago_de_deuda g
         where g.pasivo_id = p_pasivo_id and g.eliminado_en is null
      ) e
     order by e.fecha, e.orden, e.id collate "C"
  loop
    if r.orden = 0 then
      v_cubierto := least(v_pool, r.monto);
      v_pool := v_pool - v_cubierto;
      v_saldo := v_saldo + r.monto - v_cubierto;
    elsif r.orden = 1 then
      if r.monto > v_saldo then
        raise exception 'el abono supera el saldo causado a su fecha' using errcode = '23514';
      end if;
      v_saldo := v_saldo - r.monto;
    else
      if v_saldo > 0 then
        raise exception 'un saldo a favor solo cubre el excedente' using errcode = '23514';
      end if;
      v_pool := v_pool + r.monto;
    end if;
  end loop;
end;
$$;

-- Pago: la cuota enlazada es de ese pasivo y el pago la cubre completa; luego
-- el libro entero se revalida.
create function private.validar_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cargo bigint;
begin
  if new.cuota_id is not null then
    select q.capital + coalesce((
             select sum(k.monto) from public.costo_financiero k
              where k.cuota_id = q.id and k.eliminado_en is null), 0)
      into v_cargo
      from public.cuota q
      join public.plan_de_cuotas pl on pl.id = q.plan_id
     where q.id = new.cuota_id and pl.pasivo_id = new.pasivo_id;
    if v_cargo is null or new.monto < v_cargo then
      raise exception 'el pago enlazado no cubre su cuota completa' using errcode = '23514';
    end if;
  end if;
  perform private.verificar_libro(new.pasivo_id);
  return null;
end;
$$;

create constraint trigger pago_de_deuda_valido
  after insert or update on public.pago_de_deuda
  deferrable initially deferred
  for each row execute function private.validar_pago();

-- Corregir un costo (p. ej. bajar un interés ya pagado) también revalida el libro;
-- si es de una cuota ya pagada, su pago enlazado debe seguir cubriéndola completa.
create function private.validar_libro_de_costo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cuota_id is not null and exists (
    select 1
      from public.pago_de_deuda g
      join public.cuota q on q.id = g.cuota_id
     where g.cuota_id = new.cuota_id and g.tipo = 'abono' and g.eliminado_en is null
       and g.monto < q.capital + coalesce((
             select sum(k.monto) from public.costo_financiero k
              where k.cuota_id = q.id and k.eliminado_en is null), 0)
  ) then
    raise exception 'el pago enlazado no cubre su cuota completa' using errcode = '23514';
  end if;
  if new.pasivo_id is not null then
    perform private.verificar_libro(new.pasivo_id);
  end if;
  return null;
end;
$$;

create constraint trigger costo_financiero_libro_valido
  after insert or update on public.costo_financiero
  deferrable initially deferred
  for each row execute function private.validar_libro_de_costo();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.obligacion enable row level security;
alter table public.pago_de_deuda enable row level security;

create policy obligacion_select on public.obligacion
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

create policy pago_de_deuda_select on public.pago_de_deuda
  for select to authenticated
  using (private.puede_ver_pasivo(pasivo_id));

-- ---------------------------------------------------------------------------
-- RPC: sync_push_obligaciones (versión 1)
-- ---------------------------------------------------------------------------
-- `p_lote.tipo` declara la intención y fija qué tablas admite el lote:
-- - 'pago': 1 abono y/o 1 saldo a favor del mismo pasivo, más costos de ese
--   pasivo: altas `origen='manual'` o correcciones de un costo existente con su
--   `base_seq` (solo `monto`; queda `origen='manual'`).
-- - 'pasivo': 1 pasivo, su subtipo y opcionalmente 1 plan `saldo_inicial` o
--   `desembolso` con sus cuotas. Tarjeta y crédito solo de un miembro.
-- - 'obligacion': 1 plantilla.
-- - 'pago_obligacion': 1 compra de contado del hogar con `obligacion_id`.
-- Resultado y motivos como `sync_push`. Un pasivo o costo que el actor no ve
-- se trata igual que uno inexistente ('invalido').

create function public.sync_push_obligaciones(p_lote jsonb)
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

  -- Filas objeto; `base_seq` solo en correcciones de costos de un lote de pago.
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
      select count(*), count(distinct (e ->> 'pasivo_id')), min(e ->> 'pasivo_id'),
             count(*) filter (where coalesce(e ->> 'tipo', 'abono') = 'abono'),
             count(*) filter (where (e ->> 'tipo') = 'saldo_a_favor')
        into v_n, v_pasivos, v_mensaje, v_abonos, v_safs
        from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'pago_de_deuda', '[]')) e;
      if v_n not between 1 and 2 or v_pasivos <> 1 or v_abonos > 1 or v_safs > 1 then
        return private.rechazo('invalido', 'un pago lleva un abono y/o un saldo a favor de un pasivo');
      end if;
      v_pasivo_id := v_mensaje::uuid;
      -- Un costo una sola vez por lote: dos correcciones del mismo costo se
      -- pisarían sin orden definido.
      if (select count(*) - count(distinct (e ->> 'id'))
            from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'costo_financiero', '[]')) e) > 0 then
        return private.rechazo('invalido', 'un costo aparece dos veces en el lote');
      end if;
      if exists (
        select 1 from pg_catalog.jsonb_array_elements(coalesce(v_filas -> 'costo_financiero', '[]')) e
         where (e ->> 'pasivo_id')::uuid is distinct from v_pasivo_id
            or (e ->> 'origen') is distinct from 'manual'
      ) then
        return private.rechazo('invalido', 'los costos del pago son manuales y de su pasivo');
      end if;
    elsif v_tipo = 'pasivo' then
      if pg_catalog.jsonb_array_length(coalesce(v_filas -> 'pasivo', '[]')) <> 1 then
        return private.rechazo('invalido', 'un lote de alta lleva exactamente un pasivo');
      end if;
      v_fila := v_filas -> 'pasivo' -> 0;
      v_pasivo_id := (v_fila ->> 'id')::uuid;
      -- Política de fase 1 (§4): tarjeta y crédito solo de un miembro.
      if (v_fila ->> 'tipo') in ('tarjeta', 'credito') and (v_fila ->> 'owner_tipo') is distinct from 'miembro' then
        return private.rechazo('invalido', 'tarjeta y crédito son de un miembro');
      end if;
      -- Un libro personal solo lo crea su dueño.
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

    -- El pasivo de un pago debe ser visible (si no, es como si no existiera).
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

    -- Pre-lock: el carril que toca el lote y, en un pago, el pasivo.
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
      -- Correcciones: el costo existe, es de este pasivo y el cliente vio su seq.
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
          registrado_por, actualizado_por)
        select g.id, v_hogar_id, v_pasivo_id, coalesce(g.tipo, 'abono'), g.cuota_id, g.medio_de_pago_id,
               g.monto, g.fecha, g.nota, v_actor, v_actor
          from pg_catalog.jsonb_to_recordset(v_filas -> 'pago_de_deuda') as g (
            id uuid, tipo text, cuota_id uuid, medio_de_pago_id uuid, monto bigint, fecha date, nota text)
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
-- Privilegios
-- ---------------------------------------------------------------------------

revoke all on table public.obligacion, public.pago_de_deuda from anon, authenticated;
grant select on table public.obligacion, public.pago_de_deuda to authenticated;

revoke all on function private.es_periodo(text), private.validar_compra_obligacion(),
  private.verificar_libro(uuid), private.validar_pago(), private.validar_libro_de_costo()
  from public, anon, authenticated;

revoke all on function public.sync_push_obligaciones(jsonb) from public, anon;
grant execute on function public.sync_push_obligaciones(jsonb) to authenticated;
