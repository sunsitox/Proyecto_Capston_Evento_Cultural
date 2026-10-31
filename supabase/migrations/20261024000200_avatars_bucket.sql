-- =============================================================
-- Bucket avatars — imágenes de perfil subidas desde la app.
--
-- Cada usuario autenticado escribe SOLO dentro de su propia
-- carpeta avatars/{uid}/ (lo garantiza la comparación de la
-- primera carpeta de la ruta con auth.uid()).
-- El bucket es público: la URL que guarda el perfil es del tipo
-- .../storage/v1/object/public/avatars/{uid}/avatar-....jpg
--
-- Ejecutar en Supabase Dashboard → SQL Editor (una vez).
-- =============================================================

-- Bucket público (idempotente).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Lectura pública (la imagen se muestra en el perfil).
create policy "avatars_lectura_publica"
on storage.objects for select
using (bucket_id = 'avatars');

-- Escritura: autenticados, sólo dentro de su carpeta {uid}.
create policy "avatars_subida_propia"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_actualizacion_propia"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_borrado_propio"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
