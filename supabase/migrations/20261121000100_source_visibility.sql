-- Ocultación GLOBAL de páginas de origen (CP-F3-ADM-005).
--
-- Antes el panel guardaba la nómina en localStorage: solo afectaba al
-- navegador del administrador. Esta tabla es la fuente de verdad que lee
-- TODO visitante (RLS de solo lectura) y que solo escribe la Edge Function
-- `admin-fuentes` con service_role.
--
-- Una fila representa una página oculta. Si la página vuelve a mostrarse,
-- la Edge Function borra su fila.

create table if not exists public.source_visibility (
  source_name text primary key,
  hidden boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint source_visibility_source_name_check
    check (btrim(source_name) <> '' and length(source_name) <= 200)
);

comment on table public.source_visibility is
  'Páginas de origen ocultas para todo el sitio. Lectura pública; escritura solo service_role (Edge admin-fuentes).';

alter table public.source_visibility enable row level security;

-- Lectura pública: el catálogo de cualquier visitante filtra con esta nómina.
grant select on public.source_visibility to anon, authenticated;

-- El cliente no escribe: sin políticas de INSERT/UPDATE/DELETE, RLS lo impide.
revoke insert, update, delete on public.source_visibility from anon, authenticated;

drop policy if exists source_visibility_lectura_publica on public.source_visibility;
create policy source_visibility_lectura_publica
  on public.source_visibility
  for select
  to anon, authenticated
  using (true);
