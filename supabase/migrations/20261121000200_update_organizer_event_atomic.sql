-- Guardado indivisible de Mis eventos. Solo invocable desde la Edge con service_role.
create or replace function public.update_organizer_event_atomic(
  p_event_id uuid, p_owner_id uuid, p_changes jsonb,
  p_commune text, p_categories text[]
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
  v_commune public.communes%rowtype;
  v_changes public.events%rowtype;
  v_name text;
  v_category_id uuid;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'El evento no existe.' using errcode = 'P0002';
  end if;
  if p_owner_id is null or v_event.external_key is null
     or not starts_with(v_event.external_key, 'org:' || p_owner_id::text || ':') then
    raise exception 'Solo puedes editar tus propios eventos.' using errcode = '42501';
  end if;
  if p_categories is null or cardinality(p_categories) = 0
     or exists (select 1 from unnest(p_categories) n where n is null or btrim(n) = '' or length(n) > 80) then
    raise exception 'Selecciona categorías válidas.' using errcode = '22023';
  end if;

  -- Cualquier error de catálogo aborta la misma transacción; un nombre
  -- desconocido no debe borrar silenciosamente comuna/región.
  if nullif(btrim(p_commune), '') is not null then
    select * into v_commune from public.communes
    where translate(lower(btrim(name)), 'áéíóúüñ', 'aeiouun') =
          translate(lower(btrim(p_commune)), 'áéíóúüñ', 'aeiouun')
      and lower(country) = 'chile';
    if (select count(*) from public.communes
        where translate(lower(btrim(name)), 'áéíóúüñ', 'aeiouun') =
              translate(lower(btrim(p_commune)), 'áéíóúüñ', 'aeiouun')
          and lower(country) = 'chile') > 1 then
      raise exception 'La comuna es ambigua en el catálogo.' using errcode = '22023';
    end if;
    if v_commune.id is null then
      raise exception 'La comuna no existe en el catálogo.' using errcode = '22023';
    end if;
  end if;

  v_changes := jsonb_populate_record(null::public.events, p_changes);
  update public.events set
    title = v_changes.title, description = v_changes.description,
    start_at = v_changes.start_at, end_at = v_changes.end_at,
    venue = v_changes.venue, address = v_changes.address,
    commune_id = v_commune.id, region = v_commune.region,
    location = v_changes.location, location_precision = v_changes.location_precision,
    location_source = v_changes.location_source, audience = v_changes.audience,
    is_free = v_changes.is_free, price_text = v_changes.price_text,
    image_url = v_changes.image_url, official_url = v_changes.official_url
  where id = p_event_id;

  delete from public.event_categories where event_id = p_event_id;
  -- El catálogo real tiene UNIQUE lower(name), no UNIQUE name.
  -- Orden estable para reducir interbloqueos entre ediciones concurrentes.
  for v_name in select min(btrim(n)) from unnest(p_categories) n group by lower(btrim(n)) order by lower(btrim(n)) loop
    select id into v_category_id from public.categories where lower(name) = lower(v_name);
    if v_category_id is null then
      insert into public.categories(id, name) values (gen_random_uuid(), v_name)
        on conflict do nothing;
      select id into strict v_category_id from public.categories where lower(name) = lower(v_name);
    end if;
    insert into public.event_categories(event_id, category_id) values (p_event_id, v_category_id);
  end loop;
end;
$$;
revoke all on function public.update_organizer_event_atomic(uuid, uuid, jsonb, text, text[]) from public, anon, authenticated;
grant execute on function public.update_organizer_event_atomic(uuid, uuid, jsonb, text, text[]) to service_role;
