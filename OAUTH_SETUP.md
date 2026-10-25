# Google OAuth (proyecto Supabase ngwkehuewmjykiiujqic) — estado activo

El flujo está operativo end-to-end (verificado 2026-10-25): app → Supabase
authorize → Google → `https://site-0becdc527e97410aad90d253e6bc89fa.freebuff.page/auth/callback`
→ `/home` con sesión guardada. Este checklist documenta la configuración que lo
hace funcionar, por si hay migración de proyecto/client.

## 1. Credenciales en Google Cloud Console

1. Ve a https://console.cloud.google.com/apis/credentials
2. Crea un **OAuth client ID** → tipo *Web application*
3. En **Authorized redirect URIs** agrega **una sola** URL (no hace falta
   agregar ningún *origen de JavaScript*: el navegador de la app nunca habla
   directo con Google, todo pasa por el callback de Supabase):

   ```
   https://ngwkehuewmjykiiujqic.supabase.co/auth/v1/callback
   ```

4. Copia el **Client ID** y el **Client Secret** de Google.

## 2. Activar el proveedor en Supabase

1. Dashboard → proyecto → **Authentication → Providers**
2. Activa **Google** y pega el Client ID / Client Secret de Google
3. Guardar.

## 3. URLs de redirección permitidas

**Authentication → URL Configuration**:

- **Site URL**: el origin desplegado real, p. ej.
  `https://site-0becdc527e97410aad90d253e6bc89fa.freebuff.page`.
  ⚠️ Si queda el default `http://localhost:3000`, cuando el origin de arranque no
  esté en Redirect URLs Supabase hace fallback silencioso a Site URL y el login
  termina en `localhost:3000` con el token en el hash (bug visto el 2026-10-25).
- **Redirect URLs** (una por origin/ruta desde la que se inicia sesión):

```
https://site-0becdc527e97410aad90d253e6bc89fa.freebuff.page/auth/callback
http://localhost:4200/auth/callback
http://localhost:4300/auth/callback
```

## 4. Probar

- Abrir `/login` → **Continuar con Google**
- Debe redirigir: app → Supabase authorize → pantalla Google (flujo de supabase-js)
- Al volver: `/auth/callback` del origin configurado → sesión guardada con nombre.
  Si devuelve `http://localhost:3000/#access_token=...`, es el fallback de Site URL:
  revisar el punto 3. Si el token quedó expuesto en un log o URL de otra persona,
  revocar la sesión: `POST /auth/v1/logout` con ese access+refresh token del hash.

## 5. Nombre de la cuenta

El nombre visible en Perfil sale de `aSesion()` en
`src/app/core/services/supabase.service.ts`: prioriza `nombre`/`nombre_display`
(registro con formulario) y hace fallback a `full_name`/`name` (user_metadata de
Google OAuth), y en último caso al prefijo del email.

## Nota sobre la private key

La `SUPABASE_SECRET_KEY` queda documentada en `.env` (raíz del proyecto) solo
como referencia para el secreto de la Edge Function `admin-account`; la clave de
servicio nunca va en el frontend ni en repos compartidos. Si alguien la expone,
hay que rotarla en Supabase Dashboard (Settings → API) y regenerarla.
