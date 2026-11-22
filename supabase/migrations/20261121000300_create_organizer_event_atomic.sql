-- Creación atómica compatible con el formulario múltiple y los índices lower(name).
create or replace function public.create_organizer_event_atomic(
  p_owner_id uuid, p_organizer_name text, p_changes jsonb,
  p_commune text, p_categories text[]
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_source uuid;
  v_organizer uuid;
  v_changes public.events%rowtype;
  v_key text;
begin
  if p_owner_id is null or nullif(btrim(p_organizer_name), '') is null then
    raise exception 'Falta el organizador.' using errcode = '22023';
  end if;
  insert into public.sources(id, name, is_active)
    values (gen_random_uuid(), 'Publicación de organizador', true) on conflict do nothing;
  select id into strict v_source from public.sources where lower(name) = lower('Publicación de organizador');
  insert into public.organizers(id, name)
    values (gen_random_uuid(), btrim(p_organizer_name)) on conflict do nothing;
  select id into strict v_organizer from public.organizers where lower(name) = lower(btrim(p_organizer_name));

  v_changes := jsonb_populate_record(null::public.events, p_changes);
  v_key := 'org:' || p_owner_id::text || ':' || v_id::text;
  insert into public.events (
    id, external_key, source_id, organizer_id, title, start_at, end_at,
    venue, address, country, status, audience, is_free, description, price_text,
    currency, image_url, official_url, extraction_method,
    location, location_precision, location_source, is_suppressed
  ) values (
    v_id, v_key, v_source, v_organizer, v_changes.title, v_changes.start_at, v_changes.end_at,
    v_changes.venue, v_changes.address, 'Chile', 'draft', v_changes.audience,
    v_changes.is_free, v_changes.description, v_changes.price_text, 'CLP',
    v_changes.image_url, v_changes.official_url, 'app_organizador',
    v_changes.location, v_changes.location_precision, v_changes.location_source, false
  );
  -- Reutiliza validación de comuna, categorías y lista blanca; una excepción
  -- revierte también el INSERT y cualquier fuente/organizador recién creado.
  perform public.update_organizer_event_atomic(v_id, p_owner_id, p_changes, p_commune, p_categories);
  return jsonb_build_object('id', v_id, 'external_key', v_key);
end;
$$;
revoke all on function public.create_organizer_event_atomic(uuid, text, jsonb, text, text[]) from public, anon, authenticated;
grant execute on function public.create_organizer_event_atomic(uuid, text, jsonb, text, text[]) to service_role;
