-- Topes del lote de `sync_push` (seguimiento de 20261124120000_compra_rapida).
create or replace function public.sync_push(p_lote jsonb)
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

  if pg_catalog.jsonb_array_length(v_planes) > 1 then
    return private.rechazo('invalido', 'un lote lleva como máximo un plan de cuotas');
  end if;

  -- Mismo tope que el dominio (MAX_CUOTAS): la validación del plan recorre sus
  -- cuotas por cada cuota insertada mientras retiene los carriles de `seq`.
  if pg_catalog.jsonb_array_length(v_cuotas) > 360
     or pg_catalog.jsonb_array_length(v_costos) > 360 then
    return private.rechazo('invalido', 'demasiadas cuotas en el lote');
  end if;

  if pg_catalog.jsonb_array_length(v_alias) > 1 then
    return private.rechazo('invalido', 'un lote lleva como máximo un alias de comercio');
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
      -- `monto` es la estimación del cliente: no se recalcula (ver cabecera).
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
