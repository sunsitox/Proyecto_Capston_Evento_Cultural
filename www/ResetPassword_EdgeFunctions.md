# Recuperación de contraseña desacoplada — Edge Functions + token temporal

> Cambio de arquitectura (24-10-2026): el correo de recuperación ya NO lo envía
> Supabase Auth. Supabase sigue siendo el almacén de identidad (auth.users) y
> allí se escribe la contraseña nueva; el **motor de correo es externo**
> (Resend HTTP API) y vive en una Edge Function propia. Descartado Brevo
> previamente (errores 535/500) y descartado Gmail SMTP (config tediosa).

## Arquitectura

```
[Login: "¿Olvidaste tu contraseña?"]
        |  POST /functions/v1/reset-password-request  { email }
        v
reset-password-request  (Edge Function, pública, sin sesión)
  - busca el usuario (Admin API)
  - genera JWT temporal HS256  { sub, email, jti, iat, exp(+30 min) }
    ("cookie" temporal: payload base64 cuya exp se compara con el reloj)
  - guarda jti en public.password_reset_tokens (UN solo uso)
  - envía el correo por HTTP API (Resend) con el enlace:
      <APP_ORIGIN>/restablecer-contrasena?token=<JWT>
        |  el usuario abre el enlace
        v
[Pantalla /restablecer-contrasena?token=...]
  - decodifica exp LOCALMENTE para avisar al instante si venció
  - POST /functions/v1/reset-password-confirm  { token, password }
        v
reset-password-confirm  (Edge Function, pública, sin sesión)
  - revalida firma + exp + jti no usado + email coincide
  - CAMBIA LA CONTRASEÑA EN LA BASE DE DATOS (Admin API: auth.users)
  - marca el token usado y limpia pendientes del correo
        v
  - devuelve { email } → la app inicia sesión con la contraseña nueva → /home
```

Seguridad: respuesta genérica en el request (anti-enumeración), límite de
3 solicitudes/correo/hora, token de un solo uso vencible a 30 min, la tabla
tiene RLS sin políticas (solo service role la toca), y el secreto de firma
nunca sale de las Edge Functions.

## Pasos de configuración (una vez)

1. **Migración SQL** (Supabase Dashboard → SQL Editor): pegar y ejecutar
   `supabase/migrations/20261024000100_password_reset_tokens.sql`.

2. **Cuenta de Resend** (motor de correo, gratis 3.000/mes / 100/día):
   - Crear cuenta en https://resend.com con TU correo (sin dominio ni 2FA).
   - Dashboard → API Keys → **Create API Key** → copiar `re_...`.
   - Modo demo: el remitente por defecto `onboarding@resend.dev` solo envía
     al correo de la cuenta de Resend. Para usuarios reales luego: dominio
     verificado + `RESEND_FROM`.

3. **Desplegar las funciones** (desde la raíz del proyecto, sin verificar JWT
   porque son endpoints públicos anónimos):
   ```bash
   supabase functions deploy reset-password-request  --project-ref ngwkehuewmjykiiujqic --no-verify-jwt
   supabase functions deploy reset-password-confirm  --project-ref ngwkehuewmjykiiujqic --no-verify-jwt
   ```
   (El JWT de sesión del usuario ya no participa: `--no-verify-jwt` es correcto
   aquí, la seguridad vive en el token temporal + tabla de un solo uso.)

4. **Secretos** (Dashboard → Edge Functions → cada función → Secrets, o
   `supabase secrets set --project-ref ...`):
   - `SUPABASE_SERVICE_ROLE_KEY` = la clave service role del proyecto
     (la misma que usa admin-account).
   - `RECOVERY_JWT_SECRET` = una cadena aleatoria larga (generar una nueva,
     p. ej. 64 hex); **el MISMO valor en ambas funciones**.
   - `reset-password-request` además:
     - `RESEND_API_KEY` = la API key de Resend
     - `RESEND_FROM` (opcional; default `Evento Cultural <onboarding@resend.dev>`)
     - `APP_ORIGIN` (opcional; default `http://localhost:53679` — en
       producción poner el URL público de la app)

## Archivos

- `supabase/migrations/20261024000100_password_reset_tokens.sql` — tabla de tokens
- `supabase/functions/reset-password-request/index.ts` — genera JWT temporal y envía el correo (Resend HTTP API)
- `supabase/functions/reset-password-confirm/index.ts` — valida el token y escribe la contraseña nueva (Admin API)
- `src/environments/environment.ts` / `environment.prod.ts` — URLs de las funciones
- `src/app/core/services/supabase.service.ts` — `recuperarContrasena` (ahora llama reset-password-request) y `confirmarResetContrasena`
- `src/app/core/services/api.service.ts` — fachada `confirmarResetContrasena`
- `src/app/pages/login/login.page.ts` — aviso con vigencia de 30 minutos
- `src/app/pages/restablecer-contrasena/restablecer-contrasena.page.ts` — token en URL, aviso de expiración local, envío a confirm, auto-login a /home

## Compatibilidad

El flujo legacy (enlace de Supabase Auth → /auth/callback?type=recovery →
updateUser) sigue funcionando en la misma pantalla si la URL no trae `?token=`.
El SMTP builtin de Supabase queda configurado pero sin uso en este flujo.
