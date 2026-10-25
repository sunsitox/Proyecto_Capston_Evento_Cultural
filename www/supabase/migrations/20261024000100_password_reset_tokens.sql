-- =============================================================
-- password_reset_tokens — tokens de un solo uso para el flujo de
-- recuperación de contraseña desacoplado del correo de Supabase.
--
-- La app genera un JWT temporal (HS256, exp ~30 min) cuyo jti vive
-- aquí; el enlace del correo lo trae y reset-password-confirm lo
-- consume y marca used_at. RLS sin políticas: SOLO las Edge
-- Functions con service role pueden leer/escribir esta tabla
-- (la clave pública anon no ve nada).
--
-- Ejecutar en Supabase Dashboard → SQL Editor (una vez).
-- =============================================================

create table if not exists public.password_reset_tokens (
  jti        uuid        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  email      text        not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_email
  on public.password_reset_tokens (email);
create index if not exists idx_password_reset_tokens_expira
  on public.password_reset_tokens (expires_at);

-- RLS sin políticas: bloquea todo acceso con clave pública/anon.
alter table public.password_reset_tokens enable row level security;
