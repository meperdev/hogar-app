-- Núcleo 1 (compra rápida): medios, pasivos con subtipos, compra, plan de
-- cuotas, cuota, costo financiero y alias de comercio, más `sync_push` acotado
-- al lote de una compra (solo altas).
-- Referencias: docs/data-model.md §3.5–§3.11, §3.16, §4, §9 y §10 (I1–I5, I8,
-- I14, I15, I18, I19, I23, I25); docs/architecture.md §4 (lote atómico), §5.2,
-- §5.3, §5.7 y §5.9.
--
-- Reglas de superficie (las mismas de la fundación):
-- - Los clientes solo leen por RLS; toda escritura entra por `sync_push`.
-- - El actor sale de auth.uid(); el servidor fija `actualizado_por`,
--   `registrado_por`, `hogar_id` y `seq`, nunca el cuerpo del lote.
-- - Nada derivado se guarda: ni saldos, ni estados de cuota, ni totales.
-- - Fuera de esta migración (llegan con su núcleo): alta y edición de medios y
--   pasivos (núcleo 2), tombstones y updates por `sync_push`, `sync_pull`,
--   y las columnas de `Compra` que apuntan a mascota, despensa y obligación.

-- ---------------------------------------------------------------------------
-- Destinos de FK compuestas de tenencia (I14)
-- ---------------------------------------------------------------------------

alter table public.categoria
  add constraint categoria_hogar_id_id_key unique (hogar_id, id);

-- ---------------------------------------------------------------------------
-- MedioDePago (§3.5): de dónde sale dinero de contado. Carril del hogar.
-- ---------------------------------------------------------------------------

create table public.medio_de_pago (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  nombre text not null
    constraint medio_de_pago_nombre_check check (private.nombre_visible(nombre)),
  tipo text not null
    constraint medio_de_pago_tipo_check check (tipo in ('efectivo', 'cuenta')),
  owner_tipo text not null
    constraint medio_de_pago_owner_tipo_check check (owner_tipo in ('miembro', 'hogar')),
  owner_miembro_id uuid,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint medio_de_pago_hogar_id_id_key unique (hogar_id, id),
  -- I8: cómo se representa el dueño.
  constraint medio_de_pago_owner_check check (
    (owner_tipo = 'miembro' and owner_miembro_id is not null)
    or (owner_tipo = 'hogar' and owner_miembro_id is null)),
  constraint medio_de_pago_owner_fkey
    foreign key (hogar_id, owner_miembro_id) references public.miembro (hogar_id, id),
  constraint medio_de_pago_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

-- ---------------------------------------------------------------------------
-- Pasivo (§3.6) y subtipos: libro de un solo ámbito. Sin saldo guardado.
-- ---------------------------------------------------------------------------

create table public.pasivo (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  tipo text not null
    constraint pasivo_tipo_check check (tipo in ('tarjeta', 'credito', 'deuda')),
  nombre text not null
    constraint pasivo_nombre_check check (private.nombre_visible(nombre)),
  ambito text not null default 'hogar'
    constraint pasivo_ambito_check check (ambito in ('hogar', 'personal')),
  owner_tipo text not null
    constraint pasivo_owner_tipo_check check (owner_tipo in ('miembro', 'hogar')),
  owner_miembro_id uuid,
  tasa_tipo text
    constraint pasivo_tasa_tipo_check check (tasa_tipo in ('EA', 'MV')),
  tasa_ppm integer
    constraint pasivo_tasa_ppm_check check (tasa_ppm >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint pasivo_hogar_id_id_key unique (hogar_id, id),
  constraint pasivo_owner_check check (
    (owner_tipo = 'miembro' and owner_miembro_id is not null)
    or (owner_tipo = 'hogar' and owner_miembro_id is null)),
  -- Un libro personal es de un miembro (I18).
  constraint pasivo_personal_de_miembro_check check (ambito = 'hogar' or owner_tipo = 'miembro'),
  constraint pasivo_tasa_check check ((tasa_tipo is null) = (tasa_ppm is null)),
  constraint pasivo_owner_fkey
    foreign key (hogar_id, owner_miembro_id) references public.miembro (hogar_id, id),
  constraint pasivo_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create table public.tarjeta (
  pasivo_id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  franquicia text,
  ultimos_4 text
    constraint tarjeta_ultimos_4_check check (ultimos_4 ~ '^[0-9]{4}$'),
  dia_corte smallint not null
    constraint tarjeta_dia_corte_check check (dia_corte between 1 and 31),
  dia_pago smallint not null
    constraint tarjeta_dia_pago_check check (dia_pago between 1 and 31),
  cupo bigint
    constraint tarjeta_cupo_check check (cupo > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint tarjeta_pasivo_fkey
    foreign key (hogar_id, pasivo_id) references public.pasivo (hogar_id, id),
  constraint tarjeta_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create table public.credito (
  pasivo_id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  entidad text not null
    constraint credito_entidad_check check (private.nombre_visible(entidad)),
  referencia text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint credito_pasivo_fkey
    foreign key (hogar_id, pasivo_id) references public.pasivo (hogar_id, id),
  constraint credito_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create table public.deuda (
  pasivo_id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  -- I7: el acreedor es siempre texto externo, nunca un miembro.
  acreedor text not null
    constraint deuda_acreedor_check check (private.nombre_visible(acreedor)),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint deuda_pasivo_fkey
    foreign key (hogar_id, pasivo_id) references public.pasivo (hogar_id, id),
  constraint deuda_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

-- ---------------------------------------------------------------------------
-- Compra (§3.7): el consumo, una sola vez, por `monto_total` en `fecha` (I2).
-- ---------------------------------------------------------------------------

create table public.compra (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  fecha date not null,
  descripcion text not null
    constraint compra_descripcion_check check (pg_catalog.char_length(descripcion) <= 200),
  monto_total bigint not null
    constraint compra_monto_total_check check (monto_total > 0),
  categoria_id uuid not null,
  ambito text not null default 'hogar'
    constraint compra_ambito_check check (ambito in ('hogar', 'personal')),
  miembro_id uuid,
  pago_tipo text not null
    constraint compra_pago_tipo_check check (pago_tipo in ('contado', 'financiado')),
  medio_de_pago_id uuid,
  financiada_por_pasivo_id uuid,
  registrado_por uuid not null,
  cufe text
    constraint compra_cufe_check check (cufe ~ '^[0-9a-f]{96}$'),
  nit_comercio text
    constraint compra_nit_comercio_check check (pg_catalog.char_length(nit_comercio) between 1 and 32),
  iva bigint
    constraint compra_iva_check check (iva >= 0),
  origen text not null default 'manual'
    constraint compra_origen_check check (origen in ('manual', 'qr', 'ocr', 'correo')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint compra_hogar_id_id_key unique (hogar_id, id),
  -- I18: personal ⇔ con dueño.
  constraint compra_ambito_miembro_check check ((ambito = 'personal') = (miembro_id is not null)),
  -- I3: contado con exactamente un origen de fondos; financiado sin ninguno.
  constraint compra_pago_check check (
    (pago_tipo = 'financiado' and medio_de_pago_id is null and financiada_por_pasivo_id is null)
    or (pago_tipo = 'contado'
        and (medio_de_pago_id is null) <> (financiada_por_pasivo_id is null))),
  -- El IVA es informativo e incluido: nunca mayor que el total y solo con CUFE.
  constraint compra_iva_incluido_check check (iva is null or (iva <= monto_total and cufe is not null)),
  constraint compra_categoria_fkey
    foreign key (hogar_id, categoria_id) references public.categoria (hogar_id, id),
  constraint compra_miembro_fkey
    foreign key (hogar_id, miembro_id) references public.miembro (hogar_id, id),
  constraint compra_medio_de_pago_fkey
    foreign key (hogar_id, medio_de_pago_id) references public.medio_de_pago (hogar_id, id),
  constraint compra_financiada_por_pasivo_fkey
    foreign key (hogar_id, financiada_por_pasivo_id) references public.pasivo (hogar_id, id),
  constraint compra_registrado_por_fkey
    foreign key (hogar_id, registrado_por) references public.miembro (hogar_id, id),
  constraint compra_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

-- Dedupe de CUFE por alcance de visibilidad (docs/dian-qr.md): una personal
-- ajena nunca choca con lo del hogar ni con las personales de otro dueño.
create unique index compra_cufe_hogar_key
  on public.compra (hogar_id, cufe)
  where ambito = 'hogar' and cufe is not null and eliminado_en is null;

create unique index compra_cufe_personal_key
  on public.compra (hogar_id, miembro_id, cufe)
  where ambito = 'personal' and cufe is not null and eliminado_en is null;

create index compra_financiada_por_pasivo_idx
  on public.compra (financiada_por_pasivo_id)
  where financiada_por_pasivo_id is not null;

-- ---------------------------------------------------------------------------
-- PlanDeCuotas (§3.8) y Cuota (§3.9). Sin estado ni saldo guardados.
-- ---------------------------------------------------------------------------

create table public.plan_de_cuotas (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  pasivo_id uuid not null,
  origen text not null
    constraint plan_de_cuotas_origen_check check (origen in ('compra', 'saldo_inicial', 'desembolso')),
  compra_id uuid,
  fecha_inicio date not null,
  capital bigint not null
    constraint plan_de_cuotas_capital_check check (capital > 0),
  sistema text not null
    constraint plan_de_cuotas_sistema_check
      check (sistema in ('capital_fijo', 'cuota_fija', 'sin_calendario')),
  n_cuotas smallint
    constraint plan_de_cuotas_n_cuotas_check check (n_cuotas > 0),
  fecha_primera_cuota date,
  tasa_tipo text
    constraint plan_de_cuotas_tasa_tipo_check check (tasa_tipo in ('EA', 'MV')),
  tasa_ppm integer
    constraint plan_de_cuotas_tasa_ppm_check check (tasa_ppm >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint plan_de_cuotas_hogar_id_id_key unique (hogar_id, id),
  constraint plan_de_cuotas_origen_compra_check check ((origen = 'compra') = (compra_id is not null)),
  constraint plan_de_cuotas_calendario_check check (
    (n_cuotas is null) = (fecha_primera_cuota is null)
    and (sistema = 'sin_calendario') = (n_cuotas is null)),
  constraint plan_de_cuotas_tasa_check check ((tasa_tipo is null) = (tasa_ppm is null)),
  constraint plan_de_cuotas_pasivo_fkey
    foreign key (hogar_id, pasivo_id) references public.pasivo (hogar_id, id),
  constraint plan_de_cuotas_compra_fkey
    foreign key (hogar_id, compra_id) references public.compra (hogar_id, id),
  constraint plan_de_cuotas_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create unique index plan_de_cuotas_compra_key
  on public.plan_de_cuotas (compra_id)
  where compra_id is not null and eliminado_en is null;

create index plan_de_cuotas_pasivo_idx on public.plan_de_cuotas (pasivo_id);

create table public.cuota (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  plan_id uuid not null,
  numero smallint not null
    constraint cuota_numero_check check (numero > 0),
  fecha_vencimiento date not null,
  capital bigint not null
    constraint cuota_capital_check check (capital > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint cuota_hogar_id_id_key unique (hogar_id, id),
  constraint cuota_plan_fkey
    foreign key (hogar_id, plan_id) references public.plan_de_cuotas (hogar_id, id),
  constraint cuota_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create unique index cuota_plan_numero_key
  on public.cuota (plan_id, numero)
  where eliminado_en is null;

-- ---------------------------------------------------------------------------
-- CostoFinanciero (§3.11): balde aparte, nunca categoría ni `monto_total` (I4).
-- ---------------------------------------------------------------------------

create table public.costo_financiero (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  tipo text not null
    constraint costo_financiero_tipo_check
      check (tipo in ('interes', 'cuota_manejo', 'seguro', 'mora', 'comision', 'gmf', 'otro')),
  monto bigint not null
    constraint costo_financiero_monto_check check (monto > 0),
  fecha_causacion date not null,
  pasivo_id uuid,
  medio_de_pago_id uuid,
  cuota_id uuid,
  origen text not null
    constraint costo_financiero_origen_check check (origen in ('calculado', 'manual')),
  descripcion text,
  registrado_por uuid not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint costo_financiero_hogar_id_id_key unique (hogar_id, id),
  -- I5: exactamente un destino; una cuota implica cargo al pasivo.
  constraint costo_financiero_destino_check check ((pasivo_id is null) <> (medio_de_pago_id is null)),
  constraint costo_financiero_cuota_check check (cuota_id is null or pasivo_id is not null),
  constraint costo_financiero_pasivo_fkey
    foreign key (hogar_id, pasivo_id) references public.pasivo (hogar_id, id),
  constraint costo_financiero_medio_de_pago_fkey
    foreign key (hogar_id, medio_de_pago_id) references public.medio_de_pago (hogar_id, id),
  constraint costo_financiero_cuota_fkey
    foreign key (hogar_id, cuota_id) references public.cuota (hogar_id, id),
  constraint costo_financiero_registrado_por_fkey
    foreign key (hogar_id, registrado_por) references public.miembro (hogar_id, id),
  constraint costo_financiero_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create unique index costo_financiero_interes_calculado_key
  on public.costo_financiero (cuota_id)
  where tipo = 'interes' and origen = 'calculado' and cuota_id is not null and eliminado_en is null;

-- ---------------------------------------------------------------------------
-- AliasComercio (§3.16): compartido por hogar; una personal nunca lo escribe.
-- ---------------------------------------------------------------------------

create table public.alias_comercio (
  id uuid primary key,
  hogar_id uuid not null references public.hogar (id),
  nit_comercio text not null
    constraint alias_comercio_nit_check check (pg_catalog.char_length(nit_comercio) between 1 and 32),
  nombre text not null
    constraint alias_comercio_nombre_check check (private.nombre_visible(nombre)),
  categoria_sugerida_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  actualizado_por uuid not null,
  seq bigint not null default 0,
  constraint alias_comercio_categoria_fkey
    foreign key (hogar_id, categoria_sugerida_id) references public.categoria (hogar_id, id),
  constraint alias_comercio_actualizado_por_fkey
    foreign key (hogar_id, actualizado_por) references public.miembro (hogar_id, id)
);

create unique index alias_comercio_hogar_nit_key
  on public.alias_comercio (hogar_id, nit_comercio)
  where eliminado_en is null;

-- ---------------------------------------------------------------------------
-- lote_aplicado (§1.3): solo servidor. Reintento idempotente por autor (I13).
-- ---------------------------------------------------------------------------

create table public.lote_aplicado (
  hogar_id uuid not null,
  autor_miembro_id uuid not null,
  lote_id uuid not null,
  resultado jsonb not null,
  aplicado_en timestamptz not null default now(),
  primary key (hogar_id, autor_miembro_id, lote_id),
  constraint lote_aplicado_autor_fkey
    foreign key (hogar_id, autor_miembro_id) references public.miembro (hogar_id, id)
);

-- ---------------------------------------------------------------------------
-- Carriles de `seq` para pasivos y dependientes (§5.2, I25)
-- ---------------------------------------------------------------------------
-- El carril de un dependiente es el de su pasivo: un libro personal numera solo
-- el carril de su dueño y nunca mueve `hogar_seq`.

create function private.asignar_seq(p_hogar_id uuid, p_ambito text, p_miembro_id uuid)
returns bigint
language plpgsql
set search_path = ''
as $$
begin
  if p_ambito = 'hogar' then
    return private.siguiente_seq_hogar(p_hogar_id);
  elsif p_ambito = 'personal' and p_miembro_id is not null then
    return private.siguiente_seq_personal(p_hogar_id, p_miembro_id);
  end if;
  raise exception 'fila sin carril de seq' using errcode = '23514';
end;
$$;

create function private.seq_por_pasivo_id(p_hogar_id uuid, p_pasivo_id uuid)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_ambito text;
  v_dueno uuid;
begin
  select p.ambito, p.owner_miembro_id into v_ambito, v_dueno
    from public.pasivo p
   where p.id = p_pasivo_id and p.hogar_id = p_hogar_id;
  if not found then
    raise exception 'pasivo inexistente' using errcode = '23503';
  end if;
  return private.asignar_seq(p_hogar_id, v_ambito, v_dueno);
end;
$$;

-- Pasivo: su propio ámbito y dueño.
create function private.seq_pasivo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.seq := private.asignar_seq(new.hogar_id, new.ambito, new.owner_miembro_id);
  return new;
end;
$$;

-- Subtipos y planes: el carril de `pasivo_id`.
create function private.seq_dependiente_de_pasivo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.seq := private.seq_por_pasivo_id(new.hogar_id, new.pasivo_id);
  return new;
end;
$$;

create function private.seq_cuota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pasivo_id uuid;
begin
  select pl.pasivo_id into v_pasivo_id
    from public.plan_de_cuotas pl
   where pl.id = new.plan_id and pl.hogar_id = new.hogar_id;
  new.seq := private.seq_por_pasivo_id(new.hogar_id, v_pasivo_id);
  return new;
end;
$$;

-- Costo: el carril de su pasivo; pagado directo con un medio, el del hogar.
create function private.seq_costo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pasivo_id is not null then
    new.seq := private.seq_por_pasivo_id(new.hogar_id, new.pasivo_id);
  else
    new.seq := private.siguiente_seq_hogar(new.hogar_id);
  end if;
  return new;
end;
$$;

-- Subtipos: su PK es `pasivo_id`, que tampoco cambia.
create function private.subtipo_tenencia_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pasivo_id is distinct from old.pasivo_id or new.hogar_id is distinct from old.hogar_id then
    raise exception 'un subtipo no puede cambiar de pasivo ni de hogar' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger medio_de_pago_seq before insert or update on public.medio_de_pago
  for each row execute function private.fundacion_seq_hogar();
create trigger medio_de_pago_tenencia before update on public.medio_de_pago
  for each row execute function private.tenencia_inmutable();

create trigger pasivo_tenencia before update on public.pasivo
  for each row execute function private.tenencia_inmutable();
create trigger pasivo_seq before insert or update on public.pasivo
  for each row execute function private.seq_pasivo();

create trigger tarjeta_tenencia before update on public.tarjeta
  for each row execute function private.subtipo_tenencia_inmutable();
create trigger tarjeta_seq before insert or update on public.tarjeta
  for each row execute function private.seq_dependiente_de_pasivo();
create trigger credito_tenencia before update on public.credito
  for each row execute function private.subtipo_tenencia_inmutable();
create trigger credito_seq before insert or update on public.credito
  for each row execute function private.seq_dependiente_de_pasivo();
create trigger deuda_tenencia before update on public.deuda
  for each row execute function private.subtipo_tenencia_inmutable();
create trigger deuda_seq before insert or update on public.deuda
  for each row execute function private.seq_dependiente_de_pasivo();

create trigger compra_tenencia before update on public.compra
  for each row execute function private.tenencia_inmutable();
create trigger compra_seq before insert or update on public.compra
  for each row execute function private.fundacion_seq_por_ambito();

create trigger plan_de_cuotas_tenencia before update on public.plan_de_cuotas
  for each row execute function private.tenencia_inmutable();
create trigger plan_de_cuotas_seq before insert or update on public.plan_de_cuotas
  for each row execute function private.seq_dependiente_de_pasivo();

create trigger cuota_tenencia before update on public.cuota
  for each row execute function private.tenencia_inmutable();
create trigger cuota_seq before insert or update on public.cuota
  for each row execute function private.seq_cuota();

create trigger costo_financiero_tenencia before update on public.costo_financiero
  for each row execute function private.tenencia_inmutable();
create trigger costo_financiero_seq before insert or update on public.costo_financiero
  for each row execute function private.seq_costo();

create trigger alias_comercio_tenencia before update on public.alias_comercio
  for each row execute function private.tenencia_inmutable();
create trigger alias_comercio_seq before insert or update on public.alias_comercio
  for each row execute function private.fundacion_seq_hogar();

-- ---------------------------------------------------------------------------
-- Reglas entre filas: triggers diferidos al final del lote (§5.7)
-- ---------------------------------------------------------------------------

-- Pasivo: exactamente un subtipo, el de su `tipo`.
create function private.validar_pasivo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tarjeta int;
  v_credito int;
  v_deuda int;
begin
  select count(*) into v_tarjeta from public.tarjeta t where t.pasivo_id = new.id;
  select count(*) into v_credito from public.credito c where c.pasivo_id = new.id;
  select count(*) into v_deuda from public.deuda d where d.pasivo_id = new.id;

  if v_tarjeta + v_credito + v_deuda <> 1
     or (new.tipo = 'tarjeta' and v_tarjeta <> 1)
     or (new.tipo = 'credito' and v_credito <> 1)
     or (new.tipo = 'deuda' and v_deuda <> 1) then
    raise exception 'el pasivo necesita exactamente un subtipo coherente con su tipo'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

-- Subtipo: su pasivo es de ese tipo (el argumento del disparador).
create function private.validar_subtipo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pasivo p where p.id = new.pasivo_id and p.tipo = tg_argv[0]
  ) then
    raise exception 'el subtipo no coincide con el tipo del pasivo' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger pasivo_subtipo_valido
  after insert or update on public.pasivo
  deferrable initially deferred
  for each row execute function private.validar_pasivo();

create constraint trigger tarjeta_valida
  after insert or update on public.tarjeta
  deferrable initially deferred
  for each row execute function private.validar_subtipo('tarjeta');

create constraint trigger credito_valido
  after insert or update on public.credito
  deferrable initially deferred
  for each row execute function private.validar_subtipo('credito');

create constraint trigger deuda_valida
  after insert or update on public.deuda
  deferrable initially deferred
  for each row execute function private.validar_subtipo('deuda');

-- Plan (I3, I18, §3.8): calendario coherente y, si es de una compra, mismo
-- capital, fecha y ámbito que ella. Un desembolso solo en crédito o deuda.
create function private.validar_plan_id(p_plan_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.plan_de_cuotas;
  v_pasivo public.pasivo;
  v_compra public.compra;
  v_n int;
  v_suma bigint;
  v_min smallint;
  v_max smallint;
  v_primera date;
begin
  select * into v_plan from public.plan_de_cuotas where id = p_plan_id;
  if not found or v_plan.eliminado_en is not null then
    return;
  end if;

  select * into v_pasivo from public.pasivo where id = v_plan.pasivo_id;

  select count(*), coalesce(sum(c.capital), 0), min(c.numero), max(c.numero)
    into v_n, v_suma, v_min, v_max
    from public.cuota c
   where c.plan_id = v_plan.id and c.eliminado_en is null;

  if v_plan.sistema = 'sin_calendario' then
    if v_n <> 0 then
      raise exception 'un plan sin calendario no tiene cuotas' using errcode = '23514';
    end if;
  else
    select c.fecha_vencimiento into v_primera
      from public.cuota c
     where c.plan_id = v_plan.id and c.eliminado_en is null and c.numero = 1;
    -- Números únicos (índice) en 1..n sin huecos y suma exacta del capital.
    if v_n <> v_plan.n_cuotas or v_min <> 1 or v_max <> v_plan.n_cuotas
       or v_suma <> v_plan.capital
       or v_primera is distinct from v_plan.fecha_primera_cuota then
      raise exception 'las cuotas del plan no cuadran con su capital y calendario'
        using errcode = '23514';
    end if;
  end if;

  if v_plan.origen = 'desembolso' and v_pasivo.tipo not in ('credito', 'deuda') then
    raise exception 'un desembolso solo existe en crédito o deuda' using errcode = '23514';
  end if;

  if v_plan.origen = 'compra' then
    select * into v_compra from public.compra where id = v_plan.compra_id;
    if v_compra.pago_tipo <> 'financiado'
       or v_compra.monto_total <> v_plan.capital
       or v_compra.fecha <> v_plan.fecha_inicio
       or v_compra.ambito <> v_pasivo.ambito
       or (v_pasivo.ambito = 'personal' and v_pasivo.owner_miembro_id <> v_compra.miembro_id) then
      raise exception 'el plan no coincide con su compra o su libro' using errcode = '23514';
    end if;
  end if;
end;
$$;

create function private.validar_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.validar_plan_id(new.id);
  return null;
end;
$$;

create function private.validar_plan_de_cuota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.validar_plan_id(new.plan_id);
  if tg_op = 'UPDATE' and old.plan_id is distinct from new.plan_id then
    perform private.validar_plan_id(old.plan_id);
  end if;
  return null;
end;
$$;

create constraint trigger plan_de_cuotas_valido
  after insert or update on public.plan_de_cuotas
  deferrable initially deferred
  for each row execute function private.validar_plan();

create constraint trigger cuota_valida
  after insert or update on public.cuota
  deferrable initially deferred
  for each row execute function private.validar_plan_de_cuota();

-- Compra (I3, I18, I19): financiada ⇔ un plan; contado ⇔ sin plan. Con
-- préstamo: crédito o deuda del mismo ámbito y dueño, con desembolso previo y
-- acumulado de compras vinculadas nunca mayor a lo desembolsado a cada fecha.
create function private.validar_compra()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_compra public.compra;
  v_pasivo public.pasivo;
  v_tiene_plan boolean;
begin
  select * into v_compra from public.compra where id = new.id;
  if v_compra.eliminado_en is not null then
    return null;
  end if;

  select exists (
    select 1 from public.plan_de_cuotas pl
     where pl.compra_id = v_compra.id and pl.eliminado_en is null
  ) into v_tiene_plan;

  if (v_compra.pago_tipo = 'financiado') <> v_tiene_plan then
    raise exception 'una compra financiada tiene exactamente un plan y una de contado ninguno'
      using errcode = '23514';
  end if;

  if v_compra.financiada_por_pasivo_id is null then
    return null;
  end if;

  -- Serializa compras concurrentes contra el mismo préstamo (I19).
  select * into v_pasivo
    from public.pasivo
   where id = v_compra.financiada_por_pasivo_id
   for update;

  if v_pasivo.tipo not in ('credito', 'deuda')
     or v_pasivo.ambito <> v_compra.ambito
     or (v_pasivo.ambito = 'personal' and v_pasivo.owner_miembro_id <> v_compra.miembro_id) then
    raise exception 'el préstamo no admite esta compra' using errcode = '23514';
  end if;

  -- Revisar el acumulado en la fecha de cada compra vinculada basta: lo
  -- desembolsado solo crece en las fechas de giro, lo gastado en las de compra.
  -- Una compra anterior al primer giro queda con 0 disponible y se rechaza.
  if exists (
    select 1
      from public.compra c
     where c.financiada_por_pasivo_id = v_pasivo.id
       and c.eliminado_en is null
       and (select coalesce(sum(c2.monto_total), 0)
              from public.compra c2
             where c2.financiada_por_pasivo_id = v_pasivo.id
               and c2.eliminado_en is null
               and c2.fecha <= c.fecha)
         > (select coalesce(sum(pl.capital), 0)
              from public.plan_de_cuotas pl
             where pl.pasivo_id = v_pasivo.id
               and pl.origen = 'desembolso'
               and pl.eliminado_en is null
               and pl.fecha_inicio <= c.fecha)
  ) then
    raise exception 'las compras vinculadas superan lo desembolsado' using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger compra_valida
  after insert or update on public.compra
  deferrable initially deferred
  for each row execute function private.validar_compra();

-- Costo con cuota: el pasivo del costo es el del plan de esa cuota (I5).
create function private.validar_costo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cuota_id is not null and not exists (
    select 1
      from public.cuota c
      join public.plan_de_cuotas pl on pl.id = c.plan_id
     where c.id = new.cuota_id and pl.pasivo_id = new.pasivo_id
  ) then
    raise exception 'el costo no es del pasivo de su cuota' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger costo_financiero_valido
  after insert or update on public.costo_financiero
  deferrable initially deferred
  for each row execute function private.validar_costo();

-- ---------------------------------------------------------------------------
-- Visibilidad (§5.9): todo pasa por `private.puede_ver`
-- ---------------------------------------------------------------------------

create function private.puede_ver_pasivo(p_pasivo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.puede_ver(p.hogar_id, p.ambito, p.owner_miembro_id)
      from public.pasivo p
     where p.id = p_pasivo_id
  ), false);
$$;

create function private.puede_ver_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.puede_ver_pasivo(pl.pasivo_id)
      from public.plan_de_cuotas pl
     where pl.id = p_plan_id
  ), false);
$$;

alter table public.medio_de_pago enable row level security;
alter table public.pasivo enable row level security;
alter table public.tarjeta enable row level security;
alter table public.credito enable row level security;
alter table public.deuda enable row level security;
alter table public.compra enable row level security;
alter table public.plan_de_cuotas enable row level security;
alter table public.cuota enable row level security;
alter table public.costo_financiero enable row level security;
alter table public.alias_comercio enable row level security;
alter table public.lote_aplicado enable row level security;

create policy medio_de_pago_select on public.medio_de_pago
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

create policy pasivo_select on public.pasivo
  for select to authenticated
  using (private.puede_ver(hogar_id, ambito, owner_miembro_id));

create policy tarjeta_select on public.tarjeta
  for select to authenticated using (private.puede_ver_pasivo(pasivo_id));
create policy credito_select on public.credito
  for select to authenticated using (private.puede_ver_pasivo(pasivo_id));
create policy deuda_select on public.deuda
  for select to authenticated using (private.puede_ver_pasivo(pasivo_id));

create policy compra_select on public.compra
  for select to authenticated
  using (private.puede_ver(hogar_id, ambito, miembro_id));

create policy plan_de_cuotas_select on public.plan_de_cuotas
  for select to authenticated using (private.puede_ver_pasivo(pasivo_id));

create policy cuota_select on public.cuota
  for select to authenticated using (private.puede_ver_plan(plan_id));

create policy costo_financiero_select on public.costo_financiero
  for select to authenticated
  using (
    case when pasivo_id is not null then private.puede_ver_pasivo(pasivo_id)
         else private.puede_ver(hogar_id, 'hogar', null)
    end);

create policy alias_comercio_select on public.alias_comercio
  for select to authenticated
  using (private.puede_ver(hogar_id, 'hogar', null));

-- lote_aplicado: RLS activo y ninguna política.

-- ---------------------------------------------------------------------------
-- RPC: sync_push (versión 1, lote de una compra)
-- ---------------------------------------------------------------------------
-- Aplica en una sola transacción el lote atómico de una compra: `compra`,
-- `plan_de_cuotas` (origen 'compra'), `cuota`, `costo_financiero` (interés
-- calculado de esas cuotas) y `alias_comercio`. Solo altas (`base_seq` nulo):
-- updates y tombstones llegan con los núcleos que los usan.
--
-- Resultado: {estado:'aplicado', filas:[{tabla,id,seq}]} o
-- {estado:'rechazado', motivo, detalle}. Motivos: 'actualizar_app',
-- 'no_autorizado', 'duplicado', 'invalido'. Un pasivo que el actor no ve se
-- trata igual que uno inexistente ('invalido'): el rechazo no revela libros
-- personales ajenos. El reintento del mismo autor activo devuelve el
-- resultado guardado sin volver a aplicar (I13).

create function private.rechazo(p_motivo text, p_detalle text default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'estado', 'rechazado', 'motivo', p_motivo, 'detalle', p_detalle));
$$;

create function public.sync_push(p_lote jsonb)
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
  v_filas jsonb;
  v_tabla text;
  v_compras jsonb;
  v_planes jsonb;
  v_cuotas jsonb;
  v_costos jsonb;
  v_alias jsonb;
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
   where m.hogar_id = v_hogar_id
     and m.usuario_id = v_usuario_id
     and m.activo
     and m.eliminado_en is null;

  if v_actor is null then
    return private.rechazo('no_autorizado');
  end if;

  -- Un mismo lote del mismo autor se serializa: un reintento que se cruza con
  -- el envío original espera su commit y devuelve el resultado guardado en vez
  -- de chocar con sus filas y responder 'duplicado'.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'sync_push:' || v_hogar_id::text || ':' || v_actor::text || ':' || v_lote_id::text, 0));

  -- Reintento del mismo autor: el resultado guardado, sin reevaluar.
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
    if v_tabla not in ('compra', 'plan_de_cuotas', 'cuota', 'costo_financiero', 'alias_comercio')
       or pg_catalog.jsonb_typeof(v_filas -> v_tabla) <> 'array' then
      return private.rechazo('invalido', 'tabla no admitida: ' || v_tabla);
    end if;
  end loop;

  -- Versión 1: solo altas. Una fila con `base_seq` pide una actualización que
  -- esta versión no aplica; tratarla como alta crearía otro hecho de dinero.
  if exists (
    select 1
      from pg_catalog.jsonb_each(v_filas) t,
           pg_catalog.jsonb_array_elements(t.value) e
     where pg_catalog.jsonb_typeof(e) <> 'object'
        or pg_catalog.jsonb_typeof(e -> 'base_seq') is distinct from null
           and pg_catalog.jsonb_typeof(e -> 'base_seq') <> 'null'
  ) then
    return private.rechazo('invalido', 'solo altas: base_seq debe ser nulo');
  end if;

  v_compras := coalesce(v_filas -> 'compra', '[]'::jsonb);
  v_planes := coalesce(v_filas -> 'plan_de_cuotas', '[]'::jsonb);
  v_cuotas := coalesce(v_filas -> 'cuota', '[]'::jsonb);
  v_costos := coalesce(v_filas -> 'costo_financiero', '[]'::jsonb);
  v_alias := coalesce(v_filas -> 'alias_comercio', '[]'::jsonb);

  if pg_catalog.jsonb_array_length(v_compras) <> 1 then
    return private.rechazo('invalido', 'un lote lleva exactamente una compra');
  end if;

  -- Mismo tope que el dominio (MAX_CUOTAS): la validación del plan recorre sus
  -- cuotas por cada cuota insertada mientras retiene los carriles de `seq`.
  if pg_catalog.jsonb_array_length(v_planes) > 1
     or pg_catalog.jsonb_array_length(v_cuotas) > 360
     or pg_catalog.jsonb_array_length(v_costos) > 360 then
    return private.rechazo('invalido', 'demasiadas cuotas en el lote');
  end if;

  begin
    -- Una compra personal es solo de quien la registra.
    if exists (
      select 1 from pg_catalog.jsonb_to_recordset(v_compras) as x (ambito text, miembro_id uuid)
       where x.ambito = 'personal' and x.miembro_id is distinct from v_actor
    ) then
      return private.rechazo('no_autorizado');
    end if;

    -- I23: una compra personal no escribe filas compartidas.
    if pg_catalog.jsonb_array_length(v_alias) > 0 and exists (
      select 1 from pg_catalog.jsonb_to_recordset(v_compras) as x (ambito text)
       where x.ambito is distinct from 'hogar'
    ) then
      return private.rechazo('invalido', 'una compra personal no escribe alias compartidos');
    end if;

    -- Un pasivo que el actor no ve es, para el lote, un pasivo inexistente.
    -- Va antes de cualquier chequeo que lea el pasivo (tipo, tasa): así ni el
    -- motivo ni el detalle distinguen un libro personal ajeno de uno que no existe.
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

    -- Los dependientes cuelgan de la compra del lote: plan de esa compra con
    -- la tasa vigente del pasivo, cuotas de ese plan e intereses calculados de
    -- esas cuotas.
    if exists (
      select 1
        from pg_catalog.jsonb_to_recordset(v_planes) as p (
          origen text, compra_id uuid, pasivo_id uuid, tasa_tipo text, tasa_ppm integer)
        left join public.pasivo pa on pa.id = p.pasivo_id and pa.hogar_id = v_hogar_id
       where p.origen is distinct from 'compra'
          or p.compra_id is distinct from (v_compras -> 0 ->> 'id')::uuid
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

    -- Pre-lock determinista (§5.2): primero el carril del hogar, luego el
    -- personal del actor, y solo los que el lote toca (I25). Después los
    -- pasivos referidos, en orden de id.
    if (v_compras -> 0 ->> 'ambito') = 'hogar' then
      perform 1 from public.hogar_seq where hogar_id = v_hogar_id for update;
    end if;
    perform 1 from public.personal_seq
     where hogar_id = v_hogar_id and miembro_id = v_actor
       and (v_compras -> 0 ->> 'ambito') = 'personal'
       for update;
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
        nit_comercio, iva, origen, actualizado_por)
      select x.id, v_hogar_id, x.fecha, x.descripcion, x.monto_total, x.categoria_id,
             x.ambito, x.miembro_id, x.pago_tipo, x.medio_de_pago_id,
             x.financiada_por_pasivo_id, v_actor, x.cufe, x.nit_comercio, x.iva,
             coalesce(x.origen, 'manual'), v_actor
        from pg_catalog.jsonb_to_recordset(v_compras) as x (
          id uuid, fecha date, descripcion text, monto_total bigint, categoria_id uuid,
          ambito text, miembro_id uuid, pago_tipo text, medio_de_pago_id uuid,
          financiada_por_pasivo_id uuid, cufe text, nit_comercio text, iva bigint, origen text)
      returning id, seq
    )
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'compra', 'id', id, 'seq', seq))
      into v_parcial from ins;
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
      insert into public.alias_comercio (id, hogar_id, nit_comercio, nombre, categoria_sugerida_id, actualizado_por)
      select a.id, v_hogar_id, a.nit_comercio, a.nombre, a.categoria_sugerida_id, v_actor
        from pg_catalog.jsonb_to_recordset(v_alias) as a (
          id uuid, nit_comercio text, nombre text, categoria_sugerida_id uuid)
      returning id, seq
    )
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', 'alias_comercio', 'id', id, 'seq', seq))
      into v_parcial from ins;
    v_salida := v_salida || coalesce(v_parcial, '[]'::jsonb);

    -- Las reglas entre filas se evalúan aquí, dentro del bloque, para que un
    -- lote inválido se rechace completo y con un motivo.
    set constraints all immediate;

    v_resultado := pg_catalog.jsonb_build_object('estado', 'aplicado', 'filas', v_salida);

    insert into public.lote_aplicado (hogar_id, autor_miembro_id, lote_id, resultado)
    values (v_hogar_id, v_actor, v_lote_id, v_resultado);

    -- Las reglas ya se evaluaron: se devuelve el modo diferido (el de todas las
    -- restricciones de este esquema) para no alterar la transacción del invocador.
    set constraints all deferred;
  exception
    when unique_violation then
      get stacked diagnostics v_restriccion = constraint_name;
      return private.rechazo('duplicado', v_restriccion);
    -- Clases completas de datos (22) e integridad (23): todo cuerpo mal formado
    -- termina en un rechazo terminal y no en un error que el outbox reintentaría
    -- para siempre. Bloqueos, cancelaciones y timeouts siguen siendo errores
    -- reintentables.
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

revoke all on table
  public.medio_de_pago, public.pasivo, public.tarjeta, public.credito, public.deuda,
  public.compra, public.plan_de_cuotas, public.cuota, public.costo_financiero,
  public.alias_comercio, public.lote_aplicado
  from anon, authenticated;

grant select on table
  public.medio_de_pago, public.pasivo, public.tarjeta, public.credito, public.deuda,
  public.compra, public.plan_de_cuotas, public.cuota, public.costo_financiero,
  public.alias_comercio
  to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.puede_ver(uuid, text, uuid) to authenticated;
grant execute on function private.puede_ver_pasivo(uuid) to authenticated;
grant execute on function private.puede_ver_plan(uuid) to authenticated;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;
