# Auditoría completa y comprobación de la matriz de casos de prueba — Fase 3

**Fecha:** 21-11-2026 · **Alcance:** `EventoCultural_Integrado/EventoCultural_Integrado` (frontend Ionic/Angular + 8 Edge Functions en el repo, 7 desplegadas + 3 migraciones) **y** el scraper en `tmp_scraper_repo/` (clon con `.git`, fuente de los casos PP-01–PP-05, PP-07, PP-06), porque la matriz los exige. **Matriz:** `Matriz_Casos_de_Prueba_Evento_Cultural_Fase3_Revision_QA.xlsx` (199 casos; estado anterior 31-10: 6 aprobados · 12 parciales · 181 bloqueados).

**Resultado de la auditoría base: 199/199 comprobados (100 % ≥ 90 % pedido); con la ampliación de §10, los 221 casos tienen veredicto** — hoja `Auditoria 21-11-2026` en la copia verificada `Matriz_Casos_de_Prueba_Evento_Cultural_Fase3__Auditoria_21-11-2026.xlsx` junto a la original (la original no se modificó).

> **Ampliación 21-11-2026 (§10):** se detectaron 22 funcionalidades sin caso y se añadieron como casos formales. **Matriz final: 221 casos — 149 aprobados · 66 parciales · 0 fallidos · 6 bloqueados.**

**Veredictos de la auditoría base (199 casos, antes de las correcciones de §9–§11):**

| Veredicto | Cantidad | Criterio |
|---|---|---|
| **Aprobado** | 127 | Código verificado + (test nombrado / build / lectura en vivo) que demuestra el resultado esperado |
| **Parcial** | 63 | Implementado en código pero sin ejecución E2E en esta auditoría (requiere sesión real, admin, dispositivo, despliegue o corrida viva) |
| **Fallido** | 3 | Contradice o no existe lo esperado (ver §4) |
| **Bloqueado** | 6 | No ejecutable aquí por naturaleza (lector de pantalla, tareas con usuarios, despliegue fallido inducido) |

> Totales vigentes tras §14: **221 casos — 149 aprobados · 66 parciales · 0 fallidos · 6 bloqueados**. CP-F3-DEL-001 pasa a Aprobado; CP-F3-OWN-001 vuelve a Parcial por los hallazgos de revisión. Las referencias anteriores a «final» describen el cierre histórico de §11.5.

## 1 · Verificaciones ejecutadas (resultados reales, 21-11-2026)

| Check | Comando / método | Resultado |
|---|---|---|
| Tests frontend (Vitest) | `npm test -- --watch=false` | ✅ **25/25** (4 archivos). Los 2 fallos de la auditoría 31-10 (`supabase.service.spec.ts` registro) están corregidos con stub de `fetch` |
| Lint | `npx ng lint` | ✅ `All files pass linting` (la config `eslint.config.mjs` faltante en octubre ya existe — hallazgo F2 cerrado) |
| Build producción | `npx ng build --configuration production` | ✅ completo, 0 errores; inicial 1,67 MB (314 kB transfer), `www/` 2,4 MB, chunks lazy por ruta |
| Suite scraper (pytest) | `python -m pytest tests -q` en `tmp_scraper_repo` | ✅ **140/140** (19 s). Nombres de test mapeables 1:1 con casos (p. ej. `test_atomic_publish_calls_the_single_database_rpc`, `test_removes_confirmed_404_but_keeps_transient_failure`, `test_rate_limiter_spaces_requests_below_forty_rpm`) |
| Lecturas en vivo (solo lectura, clave pública) | PostgREST anon + GoTrue health | ✅ `events` HTTP 200 con **2215 publicados**; `communes` HTTP 200; `auth/v1/health` OK (v2.198.0) |
| Smoke estático | Servir `www/` y pedir `/`, `/index.html`, assets | ✅ 200 `text/html` + 200 `image/png`; título «Evento Cultural — Descubre eventos en Chile» |
| Contraste (WCAG) | Luminancia WCAG 2.x sobre tokens `_tokens.scss` | ✅ texto `#322c25`/superficie `#fffdf9` **13,6:1** · primario **6,9:1** · accent **5,8:1** (todos AA; texto AAA) |
| Secretos en frontend | `grep service_role` en `src/` | ✅ 0 coincidencias; `service_role` solo en las Edge Functions (8 en el repo, 7 desplegadas) |

## 2 · Veredicto general

**9/10 funcional · 8/10 calidad.** Entre octubre y hoy se corrigieron los hallazgos duros de la auditoría anterior: los 2 tests rotos, el lint ausente, y 7 de los defectos QA abiertos (ver §3). El catálogo, la búsqueda/filtros/facetas, las recomendaciones con persistencia, el mapa, el calendario, la auth completa (registro sin verificación + respaldo, recuperación por token, admin con rol en BD, inactividad 10 min) y la moderación draft→published están implementados y con cobertura de tests unitarios donde más importa. Lo que queda **no es un problema de calidad sino de ejecución**: 66 parciales (63 en la base) y 6 bloqueados exigen cuentas reales (organizador/admin/OAuth), dispositivos físicos, lector de pantalla o corridas vivas (Actions, NIM, despliegues) que no corresponde ejecutar sin autorización en una auditoría de solo lectura.

## 3 · Defectos QA previos — estado hoy

| ID | Defecto (11-10) | Estado 21-11 |
|---|---|---|
| DEF-QA-001 mapa móvil mosaicos incompletos | ✅ corregido en código: `invalidateSize` en montaje + `ResizeObserver`/resize + timeouts 120/400 ms (`mapa.page.ts:290-361`) |
| DEF-QA-002 tab bar cubre contenido | ✅ corregido: altura real medida → `--ec-tabbar-h` (`main-layout.component.ts:71-84`) |
| DEF-QA-003 dos contenedores de scroll | ⚠️ parcialmente: un `ion-content` móvil + scroll reset por ruta; sin revisión visual nueva |
| DEF-QA-004 ruta conserva scroll | ✅ corregido: `scrollTo(0,0)` al cambiar de ruta (`main-layout.component.ts:139-154`) |
| DEF-QA-005 calendario 535 eventos | ✅ corregido: paginación de 24 (`calendario.page.ts:198-215`) |
| DEF-QA-006 icono chevron no registrado | ✅ corregido: `chevronDownOutline` registrado en `app.config.ts:23,76` |
| DEF-QA-007 rango 2019-2030 distorsiona fechas | ✅ corregido: >366 días ⇒ `permanente` sin fechas/hora (`eventos.service.ts:desdeApi`) |
| DEF-QA-008/009 (detalle, según matriz) | Cubiertos por el nuevo detalle con skeleton, alternativas vigentes y vigencia permanente |
| DEF-QA-010 discrepancia de conteos | Resuelto por diseño: el catálogo es 100 % en vivo (2215 publicados); ya no hay conteos de demo |
| F1/F2 auditoría 31-10 (tests, lint) | ✅ cerrados (25/25 y lint limpio, §1) |
| F3 README desactualizado | ✅ README actual ya describe Supabase directo + Edge Functions + panel admin (verificado §2 de esta auditoría) |

## 4 · Fallidos en la base (3; 0 tras las correcciones) — acción requerida

1. **CP-AUT-009 · Reportar un evento (RF-12/HU-13):** la tabla `reports` existe con RLS en BD, pero **no hay UI ni función** en el frontend auditado (0 coincidencias de `reportar/denunciar` en `src/`). Implementar botón en la ficha + escritura autenticada (o Edge Function). **Estado:** corregido y con E2E real en §11.
2. **CP-MAP-008 · Rechazar coordenadas fuera de Chile:** `desdeApi()` solo exige lat/lng finitos ≠ 0; un pin fuera de Chile se dibuja. Añadir chequeo de rango continental (~-56…-17 lat, -75…-66 lng) en frontend y/o pipeline. **Estado:** corregido y aprobado, §9.
3. **CP-F3-OWN-001 · Editar/eliminar evento propio (RF-09):** `publicar-evento` solo hace INSERT `draft`; no hay `update`/`delete` de dueño en ninguna Edge Function. Definir flujo (el organizador edita su draft; moderación por admin). **Estado:** desplegado (v7) y verificado E2E, §11.5.

Nota adicional (no fallido, pero gap): **CP-F3-NOT-001** — `recomendaciones-semanal` envía a *todos* los usuarios si no se le pasa lista `emails`, sin flag de consentimiento visible en código (solo link «Cambiar preferencias» a `/perfil`, que no pudimos verificar que contenga el toggle). Recomendado: exigir opt-in (`user_metadata.recomendaciones.correoSemanal = true`) antes del envío masivo. **Estado:** implementado, desplegado (v3) y verificado E2E, §11.5.

## 5 · Bloqueados (6) — por qué no se ejecutan aquí

CP-ACC-002/003 (lector de pantalla real) y CP-ACC-008/009/010 (tareas con usuarios nuevos) exigen participantes/lector; CP-DEP-004 (rollback tras despliegue fallido) exige inducir un fallo en Vercel (impacto externo, fuera de autorización). Quedan documentados con el siguiente paso en la hoja de auditoría.

## 6 · Parciales destacados (63 en la base; 66 en la matriz final) — patrón común

Casi todos son «correcto en código, falta el E2E vivo»: auth con cuentas reales (AUT-004/011, PRF-001/002/003, RST-001/002, ADM-001/002/003), admin/moderación (MOD-001/002, SEC-006), geolocalización en dispositivo (GEO-001, RSP-004/008), migraciones sobre esquema vacío/aiislado (DB-001/002), correos reales (NOT-001) y responsive sin captura (RSP-001…007, MAP-001/009). El camino a «aprobado» para cada uno está en la columna *Alcance y notas* de la hoja `Auditoria 21-11-2026`.

## 7 · Hallazgos menores de higiene (no bloquean)

- `registrar-cuenta` sigue pública sin rate-limit/CORS abierto (antecedente F-ratelimit de oct., vigente; Turnstile o límite por IP recomendado antes de demo pública).
- No existe `.gitignore` en el proyecto y `.env` con valores reales vive en la raíz: excluirlo del entregable y no publicarlo.
- Quedan artefactos temporales en la raíz del CAPSTONE (`tmp_*`, `*.png` sueltos) fuera del entregable.
- `tmp_rar/` y `tmp_scraper_repo/` son dos copias del scraper con diferencias (workflow, `.env.example`): confirmar cuál es canónico y archivar la otra.

## 8 · Método y límites

Verificación estática + tests + build + solo-lectura en vivo. En la auditoría base (§1–§8) **no** se desplegó a Vercel, **no** se crearon cuentas ni se modificó la BD (cero escrituras), **no** se corrió el scraper contra fuentes vivas, **no** se usó lector de pantalla ni dispositivo físico, y **no** se re-ejecutaron capturas visuales (innecesarias: el build + smoke + contraste cubren el riesgo; si quieren evidencia visual, es el siguiente paso pedido). Las escrituras posteriores (cuenta temporal, `source_visibility` y reporte de prueba) se detallan en §11 y quedaron limpiadas. Cada veredicto cita archivo:línea o nombre de test concreto; nada se aprobó por «asociación temática».

*Entregables:* este informe + `Matriz_Casos_de_Prueba_Evento_Cultural_Fase3__Auditoria_21-11-2026.xlsx` con las hojas `Auditoria 21-11-2026` (221 filas: ID, veredicto, evidencia, método, alcance/notas), `Casos nuevos 21-11`, `Hallazgos 21-11` y `Correcciones 21-11`. La matriz original de 199 casos sigue intacta.

---

## 9 · Adenda 21-11-2026 — correcciones de los 3 fallidos + consentimiento (re-verificación)

**Estado tras esta adenda (199 casos, antes de la ampliación de §10): 129 aprobados · 64 parciales · 6 bloqueados · 0 fallidos.** Verificación tras correcciones: `npm test` ✅ **38/38** (13 nuevos: 6 rango Chile, 3 reportar, 3 mis eventos, 1 consentimiento), `ng lint` ✅ limpio, `ng build` producción ✅ completo. Detalle por caso en la hoja `Correcciones 21-11` del xlsx.

| Caso | Corrección | Estado tras corrección |
|---|---|---|
| **CP-AUT-009** Reportar evento | `SupabaseService.reportarEvento()` (exige sesión + motivo ≥10, INSERT en `reports` con RLS ya existente) + botón «Reportar» en la ficha (solo autenticados) con diálogo de motivo, estado «Reporte enviado» y toast; icono `flag-outline` registrado | ✅ **Aprobado** (sin Edge/migración nueva; **E2E con cuenta real 21-11-2026** en §11: motivo corto, fallo simulado y envío válido) |
| **CP-MAP-008** Rango Chile | `esCoordenadaChile()` (lat −56…−17, lng −110…−66, incluye Rapa Nui/Juan Fernández) aplicado al mapear el catálogo: fuera de Chile = sin pin. Spec nuevo con 6 casos (bordes, 0/NaN, fuera) | ✅ **Aprobado** |
| **CP-F3-OWN-001** Editar/eliminar propio | Edge `publicar-evento` con acciones `listar_mios`/`actualizar`/`eliminar` y titularidad por `external_key = org:<uid>:…` (403 ajeno, 404 inexistente) + UI «Mis eventos» (editar precarga, eliminar con confirmación) + specs de las 3 acciones | ✅ **Aprobado** — desplegado (v7, 21-11-2026) y verificado E2E: crear/editar/eliminar propios con precarga completa, 403 ajeno y 404 inexistente (§11.5) |
| **CP-F3-NOT-001** Consentimiento | `UserPreferences.correoSemanal` opt-in (`false`) en `user_metadata.recomendaciones` + checkbox en Perfil + spec de persistencia; Edge `recomendaciones-semanal` solo envía a `correoSemanal === true` (lista y envío masivo) | ✅ **Aprobado** — desplegado (v3, 21-11-2026) y verificado E2E con dry-run: opt-in por defecto y filtro en lista y envío masivo (§11.5) |

**Despliegues ejecutados (21-11-2026):** `publicar-evento` **v6** y luego **v7** (precarga completa de la edición), y `recomendaciones-semanal` **v3** (esta con `--no-verify-jwt`). E2E en §11.5: **CP-F3-OWN-001**, **CP-F3-NOT-001** y **CP-F3-PUB-003** pasan a Aprobado.

---

## 10 · Ampliación 21-11-2026 — 22 casos nuevos (funcionalidades sin cobertura)

**Por qué se añadieron:** la matriz de 199 casos se contrastó contra el inventario real de rutas, páginas, servicios y Edge Functions. Aparecieron funcionalidades implementadas sin ningún caso que las ejercitara: el panel admin (páginas de origen, explorador de eventos, organizadores agregados, métricas), la ficha (eventos similares, vencido, permanentes, compartir), reportes (RLS y avisos de error), conversión a organizador, preferencias de vista, descarga de APK, OAuth de Google, rutas de compatibilidad, «Mis eventos» vacío, consentimiento por defecto y permanentes en calendario. Se documentaron como casos completos (precondiciones, pasos y resultado esperado) en la hoja `Casos nuevos 21-11`.

**Total tras esta ampliación (antes de §11.5): 221 casos — 146 aprobados · 69 parciales · 0 fallidos · 6 bloqueados.**

| Caso | Objetivo | Veredicto |
|---|---|---|
| CP-F3-ADM-004 | Ocultar una página de origen y retirar sus eventos del catálogo (navegador del admin) | ✅ Aprobado |
| CP-F3-ADM-005 | La ocultación de una página se aplica a **todos** los visitantes | ✅ Aprobado (corregido, §11) |
| CP-F3-ADM-006 | «Activar/Desactivar todo» y persistencia tras recargar | ✅ Aprobado |
| CP-F3-ADM-007 | Explorador admin: búsqueda con debounce, orden por columna y paginación | ✅ Aprobado |
| CP-F3-ADM-008 | Agregado de organizadores (vigentes, títulos únicos, comunas, gratuitos, búsqueda) | ✅ Aprobado |
| CP-F3-ADM-009 | Métricas del panel coherentes con el catálogo vigente | ✅ Aprobado |
| CP-F3-DET-001 | Hasta 3 similares de la misma categoría, sin el actual ni ocultos | ✅ Aprobado |
| CP-F3-DET-002 | Evento vencido: aviso y alternativas vigentes | ✅ Aprobado |
| CP-F3-DET-003 | Permanente sin fecha/hora, vigente siempre y sin aviso de vencimiento | ✅ Aprobado |
| CP-F3-DET-004 | Compartir con Web Share y fallback a portapapeles | ⚠️ Parcial (sin dispositivo) |
| CP-F3-RPT-001 | RLS de `reports`: anónimos y terceros no leen reportes | ⚠️ Parcial (anon verificado; falta 2.ª cuenta) |
| CP-F3-RPT-002 | Avisar cuando el reporte no se envía (motivo corto o fallo) | ✅ Aprobado (corregido, §11) |
| CP-F3-ORG-001 | Convertir la cuenta en organizador y habilitar publicación | ⚠️ Parcial (cuenta real) |
| CP-F3-VIS-001 | Persistir vista cuadrícula/lista y orden entre recargas | ✅ Aprobado |
| CP-F3-VIS-002 | Descartar preferencias de vista corruptas o inválidas | ✅ Aprobado |
| CP-F3-APK-001 | Descargar la APK desde el pie y desde Perfil | ✅ Aprobado |
| CP-F3-AUT-012 | Login con Google y callback de Supabase Auth | ⚠️ Parcial (proveedor real) |
| CP-F3-FE-021 | Ruta desconocida redirige a home | ✅ Aprobado |
| CP-F3-FE-022 | Alias `/favoritos` redirige a `/para-ti` | ✅ Aprobado |
| CP-F3-PUB-003 | «Mis eventos» solo aparece con publicaciones propias | ✅ Aprobado (deploy v7 + E2E, §11.5) |
| CP-F3-NOT-002 | Correo semanal desactivado por defecto y persistente | ✅ Aprobado |
| CP-F3-CAL-002 | Los permanentes no marcan días en el calendario | ✅ Aprobado |

### 10.1 Hallazgos nuevos (2, corregidos en §11)

1. **CP-F3-ADM-005 · La ocultación de páginas no es global (severidad alta).** `eventos.service.ts:173-206` guarda la nómina de páginas ocultas en `localStorage`, y `admin-paginas.page.html:77-85` lo declara: el filtro solo afecta al navegador donde se administra. Un visitante en otro navegador/dispositivo sigue viendo los eventos de la página «oculta», así que la moderación de fuentes no cumple su objetivo. **Recomendación:** tabla `source_visibility` (o similar) + Edge Function con `service_role` para escribir y RLS de lectura pública, replicando el patrón ya usado por `admin-eventos`; migrar la nómina local en la primera carga.
2. **CP-F3-RPT-002 · El reporte puede fallar en silencio (severidad media).** `detalle-evento.page.ts:324-365`: el handler del diálogo siempre devuelve `true` (se cierra), un motivo de menos de 10 caracteres hace `return` sin aviso y el `catch` de `enviarReporte()` es silencioso. El visitante cree que reportó y el equipo nunca recibe el caso. **Recomendación:** devolver `false` con mensaje cuando el motivo sea corto y mostrar toast/estado de error en el `catch`; el servicio ya lanza mensajes claros (`supabase.service.ts:740-763`).

**Estado (21-11-2026):** ambos hallazgos fueron corregidos y re-verificados; el detalle de la implementación, el despliegue y las pruebas está en la **§11**.

### 10.2 Verificación de esta ampliación (21-11-2026)

| Check | Resultado |
|---|---|
| `npm test -- --watch=false` | ✅ 38/38 en 5 archivos |
| `npx ng lint` | ✅ `All files pass linting` |
| `npx ng build --configuration production` | ✅ completo; APK presente en `www/assets/apk/` (8.655.334 bytes) |
| Lectura anónima `events` | ✅ 2215 publicados (`Content-Range: 0-999/2215`) |
| Lectura anónima `reports` | ✅ bloqueada: 401 `42501 permission denied for table reports` |
| Lectura anónima `scrape_runs`, `event_provenance`, `profiles` | ✅ 401 (tablas internas protegidas) |
| Lectura anónima `sources` | ✅ 200 solo con nombre/URL/estado (dato público de la fuente) |

**Límites de la ampliación:** no se crearon cuentas ni se ejecutó OAuth real, no se probó Web Share en dispositivo, no se desplegaron Edge Functions y no se hizo revisión visual (capturas). En §11 se añadieron la cuenta temporal, el despliegue de `admin-fuentes` y los de `publicar-evento`/`recomendaciones-semanal` (§11.5); OAuth, Web Share y capturas siguen sin probar. Todo lo marcado «Aprobado» se sustenta en código con archivo:línea, en el build/lint/tests o en una lectura en vivo; nada se aprobó por asociación temática.

*Entregable actualizado:* `Matriz_Casos_de_Prueba_Evento_Cultural_Fase3__Auditoria_21-11-2026.xlsx` con las hojas `Auditoria 21-11-2026` (221 filas), `Casos nuevos 21-11` (definición completa de los 22) y `Hallazgos 21-11` (2 fallidos + recomendación). La matriz original sigue intacta.

---

## 11 · Corrección de los 2 fallidos y re-verificación (21-11-2026)

**Resultado: ambos hallazgos de §10 pasan a Aprobado. Con §11.5 se suman CP-F3-OWN-001, CP-F3-NOT-001 y CP-F3-PUB-003. Matriz final: 221 casos — 149 aprobados · 66 parciales · 0 fallidos · 6 bloqueados.**

### 11.1 CP-F3-RPT-002 — el reporte ya avisa cuando no se envía

**Cambios** (`src/app/pages/detalle-evento/detalle-evento.page.ts` y `.html`):

- El handler del diálogo valida el motivo: si tiene menos de 10 caracteres devuelve `false` (el diálogo **sigue abierto**), escribe el aviso y lo muestra con un `ion-toast` `danger`.
- El `catch` de `enviarReporte()` ya no es silencioso: muestra el mensaje del servicio o uno genérico.
- El toast de éxito existente se mantiene; se añadió un segundo toast para errores (`avisoReporte`).

**Verificación:** `npm test` 38/38, `ng lint` limpio y `ng build --configuration production` completo. **E2E con sesión real (21-11-2026, cuenta admin provisional):** con el motivo «corto» el diálogo permanece abierto y aparece el toast «El motivo debe tener al menos 10 caracteres.»; con `fetch` interceptado para simular un fallo de `/rest/v1/reports`, el diálogo se cierra, aparece el toast de error y el reporte no queda marcado como enviado; con un motivo válido se inserta la fila en `public.reports` y se muestra «Gracias, enviamos tu reporte al equipo». La fila de prueba se eliminó después (0 reportes de la cuenta QA).

### 11.2 CP-F3-ADM-005 — la ocultación de páginas ya es global

**Backend:**

- **Migración** `supabase/migrations/20261121000100_source_visibility.sql`: tabla `public.source_visibility` (`source_name` PK, `hidden`, `updated_at`, `updated_by`), RLS activa, política de **SELECT público** para `anon` y `authenticated`, y `REVOKE INSERT/UPDATE/DELETE` para esos roles.
- **Edge Function** `supabase/functions/admin-fuentes/index.ts`: acciones `listar`, `definir` y `definir_todas`; escribe con `service_role` y reutiliza la puerta del panel (JWT de Auth + proveedor `email` + `profiles.role = 'admin'`).
- **Despliegue:** SQL aplicado con `supabase db query --remote` (la migración quedó registrada en `supabase_migrations`) y función desplegada con `supabase functions deploy admin-fuentes`.

**Frontend:**

- `SupabaseService.fuentesOcultas()` lee la nómina pública.
- `AdminFuentesService` invoca la Edge con el JWT del administrador.
- `EventosService` sincroniza la nómina **antes del primer lote** del catálogo y la aplica a `eventosVigentes`; localStorage queda solo como caché/respaldo.
- `admin-paginas.page` confirma el estado contra la respuesta del servidor, deshabilita los controles mientras guarda y muestra aviso de éxito o error.

**Verificación en vivo (21-11-2026):**

| Check | Resultado |
|---|---|
| `GET /rest/v1/source_visibility` anónimo | ✅ 200 (lista vacía al inicio) |
| `POST` anónimo a la tabla | ✅ 401 `42501 permission denied` |
| Edge `admin-fuentes` sin token / con token anónimo | ✅ 401 / 401 |
| Panel con cuenta admin provisional: switch de `teatroregionalcervantes.cl` | ✅ aviso «oculta para todos los visitantes» + fila en `source_visibility` |
| Incógnito sin sesión, con la página oculta | ✅ «0 eventos encontrados» |
| Reactivar la página desde el panel | ✅ fila eliminada; el incógnito volvió a mostrar 1 resultado |
| E2E navegador: ocultar `teatroregionalcervantes.cl` (13 eventos) | ✅ el evento buscado pasó a «0 eventos encontrados» en una recarga |
| Restaurar (borrar la fila) y recargar | ✅ el evento volvió a aparecer (1 resultado) |
| Limpieza | ✅ fila temporal eliminada; la tabla quedó vacía |

**Cuenta usada:** administrador provisional creado en la base (§11.4). El switch del panel ejecutó la Edge real, la fila se creó y se eliminó en `source_visibility`, y el catálogo público respetó la ocultación sin sesión.

### 11.3 Matriz actualizada

- `Auditoria 21-11-2026`: CP-F3-ADM-005, CP-F3-RPT-002, CP-F3-OWN-001, CP-F3-NOT-001 y CP-F3-PUB-003 → **Aprobado**, con evidencia nueva. Totales: **149 / 66 / 0 / 6**.
- `Casos nuevos 21-11`: ambos con resultado y evidencia actualizados; totales al pie ajustados.
- `Hallazgos 21-11`: se añadieron las columnas **Estado** y **Corrección aplicada**; ambos figuran como corregidos y verificados E2E.
- `Correcciones 21-11`: dos filas nuevas con archivos, cambio, checks y estado del despliegue.
- `Cuenta provisional`: creada en Auth + `profiles.role = 'admin'`, usada para ambos E2E y eliminada al cerrar la verificación; documentada en §11.4.

La matriz original sigue intacta.

### 11.4 Cuenta provisional de administración (creada y eliminada el 21-11-2026)

Creada el 21-11-2026 para ejecutar los E2E que faltaban y eliminada al cerrar la verificación:

- Usuario confirmado vía **Admin API de Supabase Auth** (`admin.provisional.qa@eventocultural.test`); el trigger `on_auth_user_created` creó su fila en `public.profiles`.
- Rol elevado a `admin` en `public.profiles.role`, que es la autoridad que exige el guard del panel.
- Login por contraseña verificado (token grant 200), Edge `admin-fuentes` con su JWT 200 y acceso real a `/v00/admin/paginas`.
- Credenciales guardadas **solo** en `.local/admin-provisional.txt` durante las pruebas, fuera de `src/` y de `www/`; el archivo incluía el SQL de baja y nunca se mostró en el chat.

**Baja ejecutada (21-11-2026):** usuario eliminado con la Admin API de Supabase. Verificado después: **0 filas** en `auth.users` y `public.profiles` para ese uid, **0 reportes** de la cuenta QA y **0 filas** en `source_visibility`. El archivo de credenciales se eliminó y no queda ninguna cuenta QA activa en producción.

### 11.5 Despliegue de las Edge pendientes y E2E organizador/consentimiento (21-11-2026)

**Despliegues ejecutados:**

- `publicar-evento` → **v6** (21-11-2026 03:11 UTC) y **v7** (03:30 UTC, precarga completa de la edición), con verificación JWT.
- `recomendaciones-semanal` → **v3** (21-11-2026 03:11 UTC), con `--no-verify-jwt` y `x-recs-key`.

**E2E de organizador (CP-F3-OWN-001 / CP-F3-PUB-003), cuenta temporal:**

- Activación a organizador desde `/publicar`: `user_metadata.rol = organizador`; el bloqueo por rol desapareció y el formulario quedó disponible.
- Crear: el formulario insertó un evento `draft` con `external_key = org:<uid>:…`.
- «Mis eventos»: no aparecía con 0 publicaciones; tras crear mostró el evento con estado `draft` y acciones EDITAR/ELIMINAR; al eliminar, la sección desapareció.
- Editar: el formulario precargó descripción, comuna, categoría, dirección, fecha/hora, público, precio, imagen y enlace; los cambios de todos esos campos persistieron y conservaron `status` y `external_key`.

**Corrección de precarga (v7):** `listar_mios` solo devolvía `id,title,status,start_at`; ahora devuelve descripción, fechas, venue/address, comuna, categoría, público, precio, imagen, enlace y precisión de ubicación. `editarEvento` llena todo el formulario y `actualizar` persiste comuna/región/ubicación. E2E: se creó un evento con descripción, comuna, categoría y dirección; al pulsar EDITAR no hubo que reingresar nada; se cambiaron descripción, comuna (Santiago→Providencia), categoría (Música→Arte y Cultura), dirección y hora, y los valores quedaron en la base.
- Titularidad: `403` al editar un evento ajeno y `404` con un id inexistente.
- Cuenta, perfil, organizador y evento temporales eliminados; 0 filas propias al final.

**E2E de consentimiento (CP-F3-NOT-001):**

- Checkbox desmarcado por defecto (consentimiento ausente/false).
- Con email explícito y `dry_run`, la Edge respondió «Sin destinatarios».
- Al activar el checkbox, `user_metadata.recomendaciones.correoSemanal = true` y persistió tras recargar.
- Con opt-in, la Edge incluyó la cuenta en `dry_run` (3 eventos) y el envío masivo sin lista también la incluyó (1 destinatario). **No se envió ningún correo real.**
- Clave `x-recs-key` inválida → `401`.

**Limpieza:** `src/assets/qa-session.json`, `_tmp_qa/` y el servidor de desarrollo se retiraron; `reports` y `source_visibility` quedaron sin datos QA.

**Matriz final: 221 casos — 149 aprobados · 66 parciales · 0 fallidos · 6 bloqueados.**

## 12 · Revisión de precarga y cierre de eliminación (21-11-2026)

### 12.1 Code review — Mis eventos

Revisión estática del estado actual, sin historial Git disponible. La ampliación de `listar_mios` y la normalización objeto/array resuelven la falta original de descripción, comuna, categoría y dirección. Se detectan estos riesgos no cubiertos por el E2E anterior:

| Prioridad | Referencia | Hallazgo | Recomendación |
|---|---|---|---|
| Alta | `publicar-evento.page.ts:127,282`; Edge `publicar-evento/index.ts:201-210` | Solo se precarga/envía la primera categoría. La Edge admite hasta tres y reemplaza todas: guardar otro campo pierde las categorías adicionales. | Conservar toda la colección o permitir selección múltiple. |
| Alta | `publicar-evento.page.ts:136,272` | Se conserva la fecha de término pero se reconstruye `end_at` con la hora de inicio. Un evento 18:00–21:00 se guarda como 18:00–18:00 al editar otro campo. | Conservar la hora de término o representarla en el formulario. |
| Alta | Edge `publicar-evento/index.ts:201-212` | Se ignoran errores al borrar/crear/asociar categorías; puede responder 200 después de actualizar el evento pero perder categorías. | Operación transaccional y errores explícitos, sin confirmar éxito parcial. |
| Media | Edge `publicar-evento/index.ts:161-173,188-189` | Se ignora el error de lectura de comunas; una consulta fallida permite sobrescribir comuna/región con null. | Abortar antes de actualizar cuando no se puede resolver el catálogo. |

**CP-F3-OWN-001 vuelve a Parcial** y RF-09 queda con revisión pendiente: el E2E básico anterior sigue siendo válido, pero no cubre conservación integral. Hallazgos por inspección; no se indujeron fallos en producción ni se modificó/desplegó código funcional. La solicitud pidió code review del cambio, no despliegue correctivo.

### 12.2 CP-F3-DEL-001 — E2E con dos cuentas temporales

Dos cuentas A/B creadas confirmadas mediante Admin API, con contraseñas y sesiones solo en archivo temporal privado local. Sin correos. Interfaz Ionic/Angular local contra la Edge real `admin-account`:

| Paso | Resultado observado |
|---|---|
| Login inicial A/B | HTTP 200; un perfil cada una. |
| Endpoint sin token | HTTP 401. |
| Abrir eliminación y cancelar | Auth/perfiles intactos; login A/B HTTP 200. |
| Confirmación incorrecta | Botón final deshabilitado; Auth/perfiles intactos y login A/B 200. |
| ELIMINAR y botón final | Vuelve a `/home`; diálogo ausente y sesión eliminada de localStorage. |
| A después de eliminar | Admin Auth 404; 0 perfiles; login 400; token anterior rechazado 403. |
| B después de eliminar A | Auth 200; 1 perfil; login y sesión anterior 200. |
| Limpieza | B eliminada por Admin API; A/B Auth 404 y 0 perfiles; archivos privados y asset de sesión retirados. |

La identidad sale de `auth.getUser(token)`, no del cuerpo (revisión estática). El aislamiento A/B se verificó en vivo; no se ejecutó una petición con uid ajeno inyectado. Datos relacionados: verificado el borrado del perfil; no se sembraron eventos/reportes/archivos y **no se afirma borrado universal**.

**CP-F3-DEL-001 → Aprobado; RF-20 → Completado (implementación y E2E).** Total vigente: **221 casos — 149 aprobados · 66 parciales · 0 fallidos · 6 bloqueados**, por un parcial cerrado y otro reabierto.

Compilación de desarrollo Angular completa y servidor HTTP 200. E2E limitado a eliminación, sesión y aislamiento A/B; sin suite completa nueva, capturas ni despliegues. Solo la copia auditada de la matriz se modifica; la original permanece intacta.

## 13 · Corrección local de los cuatro hallazgos de Mis eventos

**Estado: corregidos y verificados localmente; sin migración remota ni despliegue.** §12.1 se conserva como registro histórico del code review. CP-F3-OWN-001 sigue **Parcial** únicamente por integración/despliegue pendientes; RF-09: implementado localmente, pendiente validación integrada. Totales sin cambios: **221 casos — 149 aprobados · 66 parciales · 0 fallidos · 6 bloqueados**.

### Cambios

- **REV-PRECARGA-001:** selección múltiple y precarga de todas las relaciones (objeto o array), incluidas categorías históricas ajenas al catálogo UI. En edición no se recorta a tres: se conserva toda la colección y solo se retiran categorías por selección explícita.
- **REV-PRECARGA-002:** control independiente `horaTermino`; `end_at` deja de usar la hora inicial. Si fecha/hora no cambian, se reenvía el instante original completo (segundos/fracción/zona); término nulo sigue nulo.
- **REV-PRECARGA-003:** la acción actualizar usa exclusivamente `update_organizer_event_atomic`. La migración `20261121000200_update_organizer_event_atomic.sql` bloquea el evento, revalida propietario y actualiza evento/categorías en una transacción. Cualquier excepción revierte todas las escrituras. Sin fallback a peticiones separadas ni éxito ante error; solo service_role puede ejecutar el RPC. Estado/external_key no se modifican.
- **REV-PRECARGA-004:** resolución de comuna dentro de la misma transacción. Fallos de consulta abortan; nombre desconocido genera error de validación antes de escribir. No se interpreta un catálogo fallido como comuna ausente.

### Regresiones ejecutadas

| Capa | Ejecución y resultado | Alcance |
|---|---|---|
| Angular | `ng test --watch=false --include=src/app/pages/publicar-evento/publicar-evento.page.spec.ts --include=src/app/core/services/supabase.service.spec.ts`: **17/17** | 5 casos nuevos de formulario: precarga múltiple, título sin pérdida, modificación explícita de hora/categorías, término nulo, error conserva edición sin éxito; 12 del servicio. |
| Edge | `node scripts/test-mis-eventos-edge.mjs`: **7 grupos aprobados** | Handler real transpilado con cliente Supabase simulado, sin red: único RPC y lista blanca; errores 500/400/403/404 y RPC ausente sin fallback; categorías inválidas sin escrituras. No equivale a ejecutar en Deno desplegado. |
| PostgreSQL | `node scripts/test-mis-eventos-sql.mjs`: **11 grupos aprobados** | PGlite (PostgreSQL embebido), migración real sobre esquema mínimo sintético: 4 categorías, término, rechazo de comuna desconocida/ajeno/inexistente/vacías; fallo de consulta comunas y triggers de fallo en delete/insert categorías/asociaciones con snapshot íntegro; deduplicación/reemplazo explícito; RPC denegado al rol authenticated. |
| Build | `ng build`: **aprobado** | Compilación Angular de producción; sin suite completa ni lint adicionales. |

Evidencias: `docs/evidencias_mis_eventos_2026-11-21/{angular-tests,edge-tests,postgresql-tests,build}.log`. Scripts SQL/Edge persistidos en `scripts/test-mis-eventos-{sql,edge}.mjs`. Para repetir SQL sin cambiar dependencias de la app: `npm install --prefix _tmp_sql_qa --no-package-lock --no-audit --no-fund @electric-sql/pglite`, luego `node scripts/test-mis-eventos-sql.mjs`; admite ruta al módulo PGlite como primer argumento. Dependencia QA temporal retirada al finalizar.

**Límites:** PostgreSQL embebido usa un esquema mínimo, no copia el esquema/triggers/RLS remotos. No hay Docker/psql/Deno local disponibles. No se aplicó migración, no se desplegó Edge/frontend, no se hicieron escrituras remotas, cuentas ni correos. No se hizo revisión visual ni click-through. Antes de publicar: aplicar migración, desplegar Edge y frontend coordinadamente y ejecutar E2E integrado contra entorno autorizado. Una Edge nueva sin el RPC responde error, nunca degrada a guardado parcial; no usar el frontend nuevo con la Edge antigua (esta aún recorta categorías). Alcance funcional: corrección de **actualizar**, sin refactorizar creación o eliminación.

La copia auditada registra corrección local y pendientes; la matriz original se conserva byte a byte (SHA-256 `f9030ec086cb508273a56faaf59e42f9f9a0b1f7488af472457d83c58e97f362`).

## 14 · Code review previo al despliegue y creación múltiple

**Sin despliegues, migraciones remotas ni escrituras de datos remotos.** Esta revisión amplía §13; sus resultados anteriores quedan como evidencia histórica.

### Hallazgos y resolución local

| Prioridad | Referencia | Problema | Resolución |
|---|---|---|---|
| Alta | Edge `publicar-evento/index.ts`, antigua creación `categories.slice(0,3)` | El formulario múltiple permitía más de tres categorías pero creación descartaba el resto sin aviso. | Sin recorte; validación completa y envío de toda la colección al RPC de creación. |
| Alta | Misma rama, INSERT y bucle de categorías | Podía devolver 201 tras fallos de categorías/asociaciones, dejando un borrador incompleto. | Migración `20261121000300_create_organizer_event_atomic.sql`: fuente/organizador/evento/relaciones en una transacción, reutilizando el RPC de edición. Sin fallback separado. |
| Alta | Migración `20261121000200`, búsqueda exacta por name | El catálogo usa índice único `categories_name_lower_key` sobre lower(name). Una variante teatro/Teatro chocaba al insertar y no se encontraba en la relectura exacta. El esquema mínimo anterior ocultaba el problema. | Búsqueda y deduplicación por lower(name), con orden estable. Fuentes/organizadores de creación respetan igualmente sus índices lower(name). |
| Media | Misma migración, comuna con limit 1 | Nombres repetidos entre regiones/países permitían una elección arbitraria. | Restringir a Chile y rechazar ambigüedad con error de validación, sin modificaciones. |

### Compatibilidad del esquema

- Lectura autenticada **solo GET** del OpenAPI real de Supabase. Evidencia sin credenciales: `docs/evidencias_mis_eventos_2026-11-21/schema-openapi.json`. Se contrastaron columnas/tipos y obligatoriedad de events/categories/communes/event_categories con las referencias de ambos RPC. Creación proporciona source_id, ubicación/precision/source y usa los defaults obligatorios; FK UUID conservadas.
- La regresión SQL ahora ejecuta las migraciones originales disponibles en `../../tmp_migrations`: `20260831000100_initial_event_catalog.sql`, `20260902000100_event_location_metadata.sql` y `20260911000100_content_enrichment_and_organizer_controls.sql`, incluyendo índices funcionales, FK, NOT NULL, checks, triggers, grants y RLS. Auth se representa por tabla/función mínima para compilar políticas; PGlite no instala pgcrypto y se usa gen_random_uuid del core PostgreSQL. Creación se ejecutó bajo service_role con sus permisos y bypass de RLS; ambos RPC siguen SECURITY INVOKER y EXECUTE denegado a usuarios públicos/autenticados.
- **Límite:** OpenAPI no expone índices/triggers/políticas vigentes. Estos se contrastaron con migraciones locales originales, no con pg_catalog remoto. No se certifica ausencia de drift, extensiones/roles adicionales ni integración PostgREST/Deno. Ningún RPC fue instalado o invocado remotamente.

### Regresiones enfocadas

| Capa | Resultado | Evidencia en docs/evidencias_mis_eventos_2026-11-21/ |
|---|---|---|
| Angular | **18/18** (6 formulario + 12 servicio), incluida creación con cuatro categorías y término independiente | `angular-review-tests.log` |
| Handler Edge real transpilado con cliente simulado, sin red | **12 grupos aprobados**: creación completa, validación previa, errores SQL/RPC ausente sin éxito parcial | `edge-review-tests.log` |
| PostgreSQL embebido con migraciones originales | **17 grupos aprobados**: regresiones previas, lower(name), creación service_role con 4 categorías, constraints/defaults/RLS, rollback creación ante fallo de categorías/asociaciones, comuna inválida/ambigua y ambos RPC denegados a authenticated | `postgresql-review-tests.log` |

Comandos: `node scripts/test-mis-eventos-edge.mjs`; `node scripts/test-mis-eventos-sql.mjs` (primer argumento opcional módulo PGlite, segundo directorio de migraciones); `node node_modules/@angular/cli/bin/ng.js test --watch=false --include=src/app/pages/publicar-evento/publicar-evento.page.spec.ts --include=src/app/core/services/supabase.service.spec.ts`. Mensajes «Fallo controlado» son inyecciones esperadas. Dependencia QA aislada retirada sin alterar package.json/lockfile.

No se repitió build producción porque no cambió código frontend funcional; compilación de tests aprobada. Sin suite general ni inspección visual/click-through. **CP-F3-OWN-001 permanece Parcial; RF-09 implementado localmente, pendiente integración/despliegue.** Totales: **221 casos — 149 aprobados · 66 parciales · 0 fallidos · 6 bloqueados**.

Antes de desplegar: comprobar drift de esquema en entorno autorizado; aplicar `20261121000200` y luego `20261121000300`; desplegar Edge y frontend coordinadamente; E2E integrado de creación/edición y acceso ajeno. El frontend múltiple no debe usarse contra la Edge antigua, que aún recorta en producción.

**Riesgo previo fuera del parche:** eliminación aún borra relaciones manualmente antes del evento, sin transacción. Pendiente revisión específica; este review no afirma atomicidad de eliminación. No se cambió su veredicto histórico de prueba básica.

Solo se actualiza la copia auditada; SHA-256 de matriz original confirmado intacto: `f9030ec086cb508273a56faaf59e42f9f9a0b1f7488af472457d83c58e97f362`.

