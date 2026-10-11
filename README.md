# Evento Cultural

Plataforma para descubrir y publicar eventos culturales, comerciales y municipales en Chile. Construida con **Ionic Framework + Angular (componentes standalone)**, 100% responsive (web y móvil) e **integrada end-to-end**: el catálogo real vive en **Supabase/PostgreSQL** (alimentado por el scraper automatizado en GitHub Actions) y la web lo consume a través de una **API intermedia** en Python, con **autenticación real vía Supabase Auth**.

## Stack

- Angular 22 (standalone components, sin NgModules, signals)
- Ionic Framework 9 (`@ionic/angular`, modo `md` forzado)
- SCSS propio con design tokens (sin Tailwind ni librerías de UI adicionales)
- **Mapa real:** Leaflet + tiles de OpenStreetMap (pines georreferenciados, popups, geolocalización opt-in)
- **Backend en TypeScript (misma arquitectura que el frontend):** `@supabase/supabase-js` desde el navegador con la clave pública; Row Level Security gobierna todo el acceso
  - Catálogo: tabla `events` paginada + `communes` + `event_categories` (`SupabaseService.catalogo()`)
  - Auth: `signInWithPassword` / `signUp` / `signInWithOAuth` (regreso PKCE en `/auth/callback`)
  - Operación con clave secreta: **Edge Function `admin-account`** (eliminar cuenta, registro pre-confirmado en desarrollo) — `supabase/edgeFunctions/`
  - Publicación: INSERT directo con el JWT del usuario (pendiente la política RLS INSERT: los errores 403 se explican en la UI)
- **Datos de respaldo:** `src/app/data/mock-eventos.ts` — solo se usan si la API no responde (la app no se rompe sin backend)
- Pruebas con Vitest (`npm test`)

## Configuración previa

1. **Credenciales públicas de Supabase** en `src/environments/environment.ts` (`supabaseUrl`, `supabaseAnonKey`; en producción, en `environment.prod.ts`). La clave anon es segura en el navegador (RLS). Los valores ya están configurados; el `.env` en la raíz queda como referencia (no se comparte).
2. **Edge Function `admin-account`** (opcional, para borrar cuenta y registro pre-confirmado en desarrollo): desplegar con `supabase functions deploy` y configurar `SUPABASE_SERVICE_ROLE_KEY` en sus secretos; guía completa en `AdminAccount_EdgeFunction.md`.
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
├── supabase/edgeFunctions/     # Edge Function admin-account (Deno/TS)
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
        │   ├── api.service.ts              # Sesión real (token + usuario) y llamadas HTTP
        │   ├── eventos.service.ts          # Catálogo desde la API + filtros y orden (signals)
        │   ├── recomendacion.service.ts    # Señales de interés en memoria (signals)
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
        │   ├── publicar-evento/    # Formulario conectado a la API (bloqueado por RLS: 501)
        │   ├── perfil/             # Perfil + cierre/eliminación de cuenta real
        │   ├── login/              # Login / registro (Supabase Auth vía API intermedia)
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

- **Integración activa:** catálogo real desde Supabase a través de la API intermedia; sesión y perfil gestionados con Supabase Auth. Los mocks son solo respaldo de emergencia.
- **Publicación bloqueada por diseño:** `POST /api/eventos` responde 501 mientras no exista la política RLS INSERT para organizadores (la clave pública no puede escribir). El formulario ya está conectado; se habilitará con la política y el modelo de propiedad cuentas↔organizadores.
- **Senales de interés en memoria:** "Me interesa", "No me interesa" y "Ver similares" alimentan «Para ti» durante la sesión (se pierden al recargar). Su persistencia en `user_event_interactions` queda como siguiente paso. Única preferencia persistente hoy: vista y orden en `localStorage` (`ViewPreferencesService`).
- **OAuth preparado:** el flujo completo está implementado (`/login` → `signInWithOAuth` → consentimiento de Supabase → regreso PKCE en `/auth/callback`); solo falta activar el proveedor y las URLs de redirección en Supabase Dashboard (`OAUTH_SETUP.md`).
- **App móvil:** la compilación con **Capacitor 8 + Android Studio** está definida como estrategia, pero se ejecutará cuando la web esté completamente estabilizada (decisión del equipo, Fase 2).
- La documentación técnica completa (arquitectura, servicios, pantallas y control de cambios) está en `docs/documentacion-frontend.tex` / `.pdf`, y la documentación formal de Fase 2 en `../CAPSTONE_/Fase 2/Evidencias Proyecto/Documentacion Tecnica/`.
