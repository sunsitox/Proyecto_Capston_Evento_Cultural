# Evento Cultural — integración frontend ↔ Supabase (backend TypeScript, 10-10-2026)

## Ejecutar (una sola terminal)

```powershell
npm install
npm start
```

Abre http://localhost:4200. **No hay servidor backend que levantar**: la app
habla directo con Supabase mediante `@supabase/supabase-js` (clave pública),
con Row Level Security gobernando el acceso.

## Configuración única

`src/environments/environment.ts`:
- `supabaseUrl` + `supabaseAnonKey` (credenciales públicas, seguras en el navegador).
- `adminEdgeFunctionUrl`: endpoint de la Edge Function `admin-account` para
  eliminar cuenta / registro pre-confirmado (opcional: sin ella, todo lo
  demás funciona; el borrado de cuenta avisa que no está disponible).

## Funcionalidades (al 10-10-2026)

- **Catálogo real:** `EventosService.cargarEventos()` pagina la tabla `events`
  (status=published, is_suppressed=false) de a 1000 rows y traduce al modelo
  Angular. Los mocks quedan como respaldo de emergencia.
- **Sesión real (GoTrue vía supabase-js):** registro e inicio con
  correo/contraseña; `onAuthStateChange` mantiene el estado reactivo en
  `SupabaseService`; token y refresh gestionados automáticamente.
- **OAuth Google:** `signInWithOAuth` con redirectTo `/auth/callback`
  (flujo PKCE); la página de regreso intercambia el `?code=` por sesión.
- **Eliminar cuenta:** Edge Function `admin-account` con JWT de sesión (ver `AdminAccount_EdgeFunction.md` para desplegarla).
- **Publicar:** INSERT directo a `events` con el JWT (pendiente de la
  política RLS INSERT → los errores 403 se explican en la UI).
- **Mapa real:** Leaflet/OSM con coordenadas del catálogo.

## Migración SQL del modelo

En el repositorio oficial del scraper:
`github.com/sunsitox/sunsitox-Scraper_de_eventos_culturales` (carpeta `supabase/`).
