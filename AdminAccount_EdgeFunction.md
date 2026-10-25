# Edge Function Admin Account — Evento Cultural

> **Cambio de arquitectura (10-10-2026):** el backend ya no corre en Python.
> Toda la capa de servicio está en **TypeScript**: el navegador consume Supabase
> directamente con `@supabase/supabase-js` (POSTGREST + GoTrue) usando la clave
> pública anon, y Row Level Security gobierna todo el acceso.

## Arquitectura actual (antes → ahora)

| Responsabilidad | Antes (Python, eliminado) | Ahora (TypeScript) |
|---|---|---|
| Catálogo `events` + comunas + categorías | `supabase_backend.py` → PostgREST | `src/app/core/services/supabase.service.ts` → `@supabase/supabase-js` (tabla directa, paginación `.range`) |
| Login/registro por contraseña | proxy GoTrue | `supabase-js`: `signInWithPassword` / `signUp` |
| OAuth Google | `/api/auth/oauth` + callback | `signInWithOAuth({ redirectTo: '/auth/callback' })` (PKCE) |
| Eliminar cuenta (clave secreta) | `DELETE /api/auth/cuenta` (Admin API) | **Edge Function `admin-account`** (esta carpeta) |
| Registro ya confirmado (desarrollo) | Admin API | **Edge Function `admin-account`** (secreto `ALLOW_ADMIN_SIGNUP=true` solo en desarrollo) |
| Publicar evento | 501 con clave pública | INSERT directo con el JWT del usuario (RLS gobierna); sin política, PostgREST responde 403 y la UI lo explica |

## Configuración del frontend

`src/environments/environment.ts`:

```ts
supabaseUrl: 'https://ngwkehuewmjykiiujqic.supabase.co',
supabaseAnonKey: '<clave pública anon>',      // segura en el navegador (RLS)
adminEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/admin-account'
```

El archivo `.env` en la raíz del proyecto conserva las credenciales como
referencia (misma intención que el antiguo `backend/.env`); **no se comparte ni
se sube a repos públicos**. La clave de servicio de ese `.env` se usa solo para
el secreto de la Edge Function (paso siguiente), nunca en el bundle del navegador.

## Desplegar la Edge Function (una vez)

```bash
npm i -g supabase
supabase functions deploy admin-account --project-ref ngwkehuewmjykiiujqic
# y en Dashboard → Edge Functions → admin-account → Secrets:
#   SUPABASE_SERVICE_ROLE_KEY = (el valor SUPABASE_SECRET_KEY de .env)
#   ALLOW_ADMIN_SIGNUP = true          (solo en desarrollo)
```

## Qué contiene esta carpeta

- `supabase/functions/admin-account/index.ts` — la función (Deno):
  - `eliminar_cuenta`: exige JWT de sesión válido y borra el usuario con
    `auth.admin.deleteUser` (la identidad viene del token, no del cuerpo).
  - `registrar_confirmado`: crea cuentas ya confirmadas; **apagado por defecto**
    (403 salvo `ALLOW_ADMIN_SIGNUP=true`).
- `supabase/config.toml` — instrucciones de despliegue y secretos.

## Seguridad del nuevo diseño

- La clave pública `anon` es la única que llega al navegador; toda lectura y
  escritura pasa por Row Level Security.
- La clave de servicio vive solo dentro de la Edge Function en Supabase, nunca
  en el bundle del frontend ni en repos compartidos.
- Sin `SUPABASE_SERVICE_ROLE_KEY` configurada, la función responde 503.
