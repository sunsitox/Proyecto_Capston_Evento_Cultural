# Checklist: activar Google OAuth en Supabase (proyecto ngwkehuewmjykiiujqic)

La app ya está integrada end-to-end; solo falta configurar el Dashboard de Supabase.

## 1. Credenciales en Google Cloud Console

1. Ve a https://console.cloud.google.com/apis/credentials
2. Crea un **OAuth client ID** → tipo *Web application*
3. En **Authorized redirect URIs** agrega **una sola** URL:

   ```
   https://ngwkehuewmjykiiujqic.supabase.co/auth/v1/callback
   ```

4. Copia el **Client ID** y el **Client Secret** de Google.

## 2. Activar el proveedor en Supabase

1. Dashboard → proyecto → **Authentication → Providers**
2. Activa **Google** y pega el Client ID / Client Secret de Google
3. Guardar.

## 3. URLs de redirección permitidas

**Authentication → URL Configuration → Redirect URLs**, agrega (una por
puerto/origen que uses):

```
http://localhost:4200/auth/callback
http://localhost:4300/auth/callback
```

Y en **Site URL**: `http://localhost:4200` (ajustar al dominio real en producción).

## 4. Probar

- Abrir `/login` → **Continuar con Google**
- Debe redirigir: app → Supabase authorize → pantalla Google (flujo PKCE de supabase-js)
- Al volver: `/auth/callback?code=...` → sesión guardada con nombre.

## Nota sobre la private key

La `SUPABASE_SECRET_KEY` queda documentada en `.env` (raíz del proyecto) solo
como referencia para el secreto de la Edge Function `admin-account`; la clave de
servicio nunca va en el frontend ni en repos compartidos. Si alguien la expone,
hay que rotarla en Supabase Dashboard (Settings → API) y regenerarla.
