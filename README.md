# Evento Cultural

Plataforma para descubrir y publicar eventos culturales, comerciales y municipales en Chile. Construida con **Ionic Framework + Angular (componentes standalone)**, 100% responsive (web y móvil) e **integrada end-to-end**: el catálogo real vive en **Supabase/PostgreSQL** (alimentado por el scraper automatizado en GitHub Actions) y la web lo consume **directamente con supabase-js** desde el navegador (clave pública + Row Level Security), con **autenticación real vía Supabase Auth** y **Edge Functions en Deno** para todo lo que exige la clave de servicio.

## Stack

- Angular 22 (standalone components, sin NgModules, signals)
- Ionic Framework 9 (`@ionic/angular`, modo `md` forzado)
- SCSS propio con design tokens (sin Tailwind ni librerías de UI adicionales)
- **Mapa real:** Leaflet + tiles de OpenStreetMap (pines georreferenciados, popups, geolocalización opt-in)
- **Backend en TypeScript (misma arquitectura que el frontend):** `@supabase/supabase-js` desde el navegador con la clave pública; Row Level Security gobierna todo el acceso
  - Catálogo: tabla `events` paginada + `communes` + `event_categories` (`SupabaseService.catalogo()`)
  - Auth: `signInWithPassword` / `signUp` / `signInWithOAuth` (regreso PKCE en `/auth/callback`)
  - Operaciones con clave de servicio: **Edge Functions Deno/TS** en `supabase/functions/` — `admin-account` (eliminar cuenta), `registrar-cuenta` (registro ya confirmado + correo de bienvenida vía Resend), `publicar-evento` (publicación de organizadores), `admin-eventos` (moderación del panel), `reset-password-request` / `reset-password-confirm` (recuperación) y `recomendaciones-semanal` (correos semanales, protegida con `RECS_CRON_KEY`)
  - Publicación: la Edge Function `publicar-evento` revalida el JWT con Admin API, exige rol organizador en servidor y cliente, completa las columnas NOT NULL de `events` y crea la fila con `status: 'draft'`; el panel admin la pasa a `published` tras moderar
- **Datos de respaldo:** `src/app/data/mock-eventos.ts` — solo se usan si la API no responde (la app no se rompe sin backend)
- Pruebas con Vitest (`npm test`)

## Configuración previa

1. **Credenciales públicas de Supabase** en `src/environments/environment.ts` (`supabaseUrl`, `supabaseAnonKey`; en producción, en `environment.prod.ts`). La clave anon es segura en el navegador (RLS). Los valores ya están configurados; el `.env` en la raíz queda como referencia (no se comparte).
2. **Edge Functions** (`supabase/functions/`): desplegar con `supabase functions deploy` y configurar sus secretos (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RECS_CRON_KEY`…); guía de admin-account en `AdminAccount_EdgeFunction.md`.
3. **OAuth (opcional):** activar el proveedor en Supabase Dashboard y registrar `/auth/callback` en Redirect URLs; checklist en `OAUTH_SETUP.md`.

## Sistema de diseño

Paleta cultural cálida "papel y tinta":

| Uso | Token | Valor |
|---|---|---|
| Primario | `--ec-primary` | `#7a4f2e` (terracota café) |
| Énfasis / CTA de apoyo | `--ec-accent` | `#a34a26` (cobre quemado) |
| Superficie / tarjetas | `--ec-surface` | `#fffdf9` |
| Fondo | `--ec-bg` | `#f6f2ec` (papel) |
| Texto | `--ec-text` | `#322c25` (tinta) |

- **Tipografía de títulos:** [Fraunces](https://fonts.google.com/specimen/Fraunces) (serif cálida, con carácter editorial)
- **Tipografía de cuerpo:** [Inter](https://fonts.google.com/specimen/Inter) (alta legibilidad en pantalla), ambas cargadas desde Google Fonts en `index.html`

Los design tokens están centralizados en `src/theme/_tokens.scss` con dos capas:

- **Primitivos `--pr-*`** (`--pr-primary`, `--pr-ink`, `--pr-cat-musica`…): la única fuente de la paleta.
- **Semánticos `--ec-*`** (`--ec-surface`, `--ec-text-muted`, `--ec-primary`, `--ec-space-md`, `--ec-radius-md`, `--ec-shadow-md`, `--ec-z-overlay`, `--ec-touch-target`, `--ec-duration-medium`…): lo que consumen los componentes. Ningún componente hardcodea hex.

Incluyen escalas de **z-index**, **objetivo táctil mínimo (44px, WCAG 2.5.8)**, **duraciones/easings de transición**, anillo de foco (`--ec-focus-ring-width`, `--ec-focus`) y overlays/backdrop.

Verificación del CSS compilado: `node verify-css.js` (requiere `ng serve` en el puerto 8100).

## Estructura del proyecto

```
evento-cultural/
├── install.bat / run.bat       # Scripts de entorno para Windows
├── package.json
├── angular.json
├── ionic.config.json
├── supabase/functions/         # Edge Functions Deno/TS (admin-account, registrar-cuenta, publicar-evento, admin-eventos, reset-password-*, recomendaciones-semanal)
├── .env                        # Referencia de credenciales (no compartido)
└── src/
    ├── main.ts                 # Bootstrap + supresión de rechazos benignos de View Transitions
    ├── index.html              # Carga de tipografías (Inter + Fraunces)
    ├── global.scss             # Estilos globales, primitivas compartidas y transiciones
    ├── theme/_tokens.scss      # Design tokens (primitivos --pr-* y semánticos --ec-*)
    ├── theme/themes.scss       # Mapeo de tokens a variables de Ionic
    └── app/
        ├── app.component.ts    # Arranque: invoca cargarEventos() (catálogo real)
        ├── app.config.ts       # Providers + registro único de íconos
        ├── app.routes.ts
        ├── core/models/        # evento.model.ts, recomendacion.model.ts
        ├── core/services/
        │   ├── supabase.service.ts         # Cliente Supabase: sesión, catálogo por lotes y publicación
        │   ├── api.service.ts              # Fachada de sesión para la UI
        │   ├── eventos.service.ts          # Catálogo + filtros/facetas/orden (signals)
        │   ├── recomendacion.service.ts    # Señales de interés + motor «Para ti» (signals)
        │   ├── supabase-recomendacion-persistencia.service.ts # Persistencia en user_event_interactions
        │   ├── admin-auth.service.ts       # Sesión del panel admin (rol admin verificado en BD)
        │   ├── admin-eventos.service.ts    # Moderación del catálogo (Edge admin-eventos)
        │   ├── geocodificacion.service.ts  # Coordenadas por recinto (Nominatim + caché)
        │   ├── view-preferences.service.ts # Vista y orden (localStorage)
        │   └── toast.service.ts
        ├── data/mock-eventos.ts            # Respaldo si la API no responde + constantes
        ├── features/home/discover/         # Layout Descubrir (escritorio)
        ├── layout/main-layout/             # Shell dual: tab bar (móvil) / nav superior (escritorio)
        ├── pages/
        │   ├── home/               # Descubrimiento, búsqueda y filtros (móvil)
        │   ├── calendario/         # Agenda mensual por fecha
        │   ├── mapa/               # Mapa real (Leaflet/OSM) + lista accesible
        │   ├── para-ti/            # Recomendaciones por señales de interés
        │   ├── detalle-evento/     # Ficha del evento
        │   ├── publicar-evento/    # Formulario → Edge Function publicar-evento (+ moderación)
        │   ├── perfil/             # Perfil + cierre/eliminación de cuenta real
        │   ├── login/              # Login / registro (registro confirmado vía Edge registrar-cuenta)
        │   ├── admin/              # Panel de administración: ingreso /v00/admin + dashboard + moderación
        │   ├── restablecer-contrasena/ # Recuperación de contraseña (Edge reset-password-*)
        │   └── auth-callback/      # Regreso de OAuth (procesa #access_token)
        └── shared/components/
            ├── evento-card/            # Tarjeta de evento reutilizable
            ├── evento-card-skeleton/   # Skeleton de tarjeta (grid/lista)
            ├── evento-detail-skeleton/ # Skeleton de la ficha de evento
            ├── event-list/             # Listado compartido: contador, chips de filtros, estados
            ├── event-filters/          # Sidebar de filtros avanzados (escritorio)
            ├── event-filters-sheet/    # Filtros avanzados en bottom sheet (móvil)
            ├── event-toolbar/          # Orden (select) + toggle grilla/lista
            ├── bottom-sheet/           # Panel inferior accesible (focus trap, Escape)
            ├── event-interest-actions/ # "Me interesa" y señales
            └── recommendation-empty-state/ # Onboarding de Para ti / ajustes
```

## Accesibilidad (objetivo WCAG 2.2 AA)

- HTML semántico (`main`, `nav`, `header`), skip link, encabezados jerárquicos y botones reales.
- Foco visible consistente (anillo de 3px con token) y navegación completa por teclado.
- Contraste AA/AAA en texto, botones y etiquetas de categoría (verificado por cálculo sobre los tokens).
- Los estados y selecciones nunca dependen solo del color: texto, forma y `aria-pressed`/`aria-expanded`.
- `aria-live` en resultados de búsqueda, `aria-busy` en carga y `role="alert"`/`role="status"` en error/vacío.
- El bottom sheet gestiona foco (trap + devolución al cerrar), cierra con Escape y bloquea el scroll de fondo.
- `prefers-reduced-motion` respetado en transiciones, skeletons y animaciones de entrada/salida.
- Objetivos táctiles de al menos 44×44px.

## Navegación adaptativa

Dos navegaciones distintas dentro de `MainLayoutComponent`, alternadas con `matchMedia('(min-width: 992px)')` (un solo `router-outlet` primario activo a la vez):

- **Móvil (< 992px):** tab bar inferior (Descubrir, Calendario, Mapa, Para ti, Perfil).
- **Escritorio (≥ 992px):** barra superior con enlaces + botón "Publicar evento", footer institucional y filtros en sidebar.

La grilla de tarjetas usa CSS Grid fluido (1 → 2 → 3 → 4 columnas según el ancho disponible).

## Cómo ejecutar el proyecto localmente

### Requisitos previos
- [Node.js](https://nodejs.org/) 18 o superior (incluye npm)

### 1. Instalar dependencias

```bat
install.bat
```

(o simplemente `npm install`)

### 2. Levantar la aplicación (frontend + backend integrados)

```bat
run.bat
```

Equivale a `npx ng serve --configuration development` con recarga en caliente. Variantes:

```bat
run.bat --lab      # Abre el navegador junto al servidor
run.bat --build    # Build de producción en la carpeta www/
```

Abre http://localhost:4200: el catálogo se carga directo desde Supabase (supabase-js).

### 3. Probar la vista móvil real

Con el servidor abierto, usa las herramientas de desarrollador del navegador (Toggle device toolbar en Chrome, `Ctrl/Cmd + Shift + M`) para simular un teléfono.

### 4. Verificaciones

```bash
npx ng build --configuration production   # Build
npx ng lint                               # ESLint
npm test                                  # Vitest
node verify-css.js                        # Tokens presentes en el CSS compilado (requiere ng serve en :8100)
```

## Notas importantes

- **Integración activa:** catálogo real directo desde Supabase (supabase-js, lotes en paralelo y Leaflet bajo demanda); los mocks son respaldo de emergencia cargado con import() dinámico. Sesión y perfil con Supabase Auth.
- **Publicación activa (Edge Function):** `publicar-evento` revalida el JWT, exige rol organizador (servidor y cliente) y crea el evento como `draft`; el panel admin lo revisa y lo publica (moderación draft → published). Verificado E2E en producción (27-10): 201 con organizador, 403 sin rol.
- **Señales de interés persistidas:** "Me interesa", "No me interesa" y "Ver similares" se guardan en `user_event_interactions` (RLS por usuario) y las preferencias declaradas en `user_metadata.recomendaciones`: «Para ti» sigue a la cuenta entre dispositivos. Vista y orden siguen en `localStorage` (`ViewPreferencesService`).
- **Panel de administración:** ingreso ofuscado en `/v00/admin` (sin enlaces públicos); exige sesión por correo con rol `admin` consultado en la BD en cada navegación, rechaza cuentas OAuth y cierra sesión por inactividad (10 min).
- **OAuth preparado:** el flujo completo está implementado (`/login` → `signInWithOAuth` → consentimiento de Supabase → regreso PKCE en `/auth/callback`); solo falta activar el proveedor y las URLs de redirección en Supabase Dashboard (`OAUTH_SETUP.md`).
- **App móvil:** la compilación con **Capacitor 8 + Android Studio** está definida como estrategia, pero se ejecutará cuando la web esté completamente estabilizada (decisión del equipo, Fase 2).
- La documentación técnica completa (arquitectura, servicios, pantallas y control de cambios) está en `docs/documentacion-frontend.tex` / `.pdf`, y la documentación formal de Fase 2 en `../CAPSTONE_/Fase 2/Evidencias Proyecto/Documentacion Tecnica/`.
