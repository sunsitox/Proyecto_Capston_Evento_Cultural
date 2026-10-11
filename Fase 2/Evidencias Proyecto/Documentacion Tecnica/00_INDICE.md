# Índice de Documentación Técnica — Proyecto "Evento Cultural"

Carpeta oficial de documentación técnica, ubicada en `Fase 2/Evidencias Proyecto/`
según la estructura de evidencias definida en `Fase 2/Resumen evidencias.xlsx`
(categoría "Evidencias de documentación").

## Documento principal

| Archivo | Formato | Estado |
|---|---|---|
| `Documento_Tecnico_Capstone.tex` | LaTeX (fuente) | Compilado sin errores ni referencias pendientes; actualizado 10-10-2026 (integración frontend--Supabase: catálogo real vía API intermedia, autenticación real, OAuth preparado, mapa Leaflet/OSM, publicación bloqueada por RLS) |
| `Documento_Tecnico_Capstone.pdf` | PDF (21 páginas) | ✅ Compilado con MiKTeX (pdflatex, dos pasadas) |
| `secciones/01-arquitectura.tex`, `02-datos-uml.tex`, `03-rnf-pruebas-docker-innovacion.tex` | LaTeX | Fragmentos fuente incluidos por el maestro (única forma de compilación) |

Contenido del PDF: portada con equipo y roles, índice, introducción y alcance,
arquitectura general / del scraper / del frontend (incluida la estrategia de despliegue:
GitHub Actions, Vercel y Capacitor/Android Studio), modelo de datos (Supabase/PostgreSQL),
diagramas UML (casos de uso, componentes, secuencia, clases), requisitos no funcionales
con estado real, pruebas (existentes vs. pendientes), Docker (estado real y decisión del
equipo de no usarlo; plan conservado como alternativa) e innovación.
Toda omisión se marca como *Pendiente de completar por el equipo*. **Actualización de arquitectura (10-10-2026):** la versión integrada de la página web consume el catálogo y gestiona la autenticación directamente desde Supabase en TypeScript (`@supabase/supabase-js`), complementado con la Edge Function `admin-account` para operaciones administrativas, eliminando la necesidad de un servidor intermedio en Python. Cuenta con mapa interactivo georreferenciado (Leaflet/OSM) y autenticación real (password + OAuth preparado); la publicación por organizadores permanece sujeta a la definición de la política RLS INSERT por rol. Las secciones de arquitectura, RNF y casos de uso reflejan fielmente esta arquitectura.

## Diagramas (fuente Mermaid y renders)

Cada diagrama se escribe como código Mermaid (`.mmd`, editable en texto plano) y se
renderiza con `mermaid-cli` a `.pdf` (incluido en el documento LaTeX) y `.svg`
(intercambio). Los archivos Mermaid son la fuente vigente y editable de Fase 2.

| Diagrama | Fuente y renders en `Diagramas/` |
|---|---|
| Arquitectura general | `01_arquitectura_general.mmd` / `.pdf` / `.svg` |
| Componentes | `02_componentes.mmd` / `.pdf` / `.svg` |
| Casos de uso | `03_casos_de_uso.mmd` / `.pdf` / `.svg` |
| Secuencia | `04_secuencia.mmd` / `.pdf` / `.svg` |
| Clases (conceptual) | `05_clases.mmd` / `.pdf` / `.svg` |
| Modelo entidad–relación | `06_modelo_er.mmd` / `.pdf` / `.svg` |
| Arquitectura del scraper (original del equipo, consolidado) | `07_arquitectura_scraper.mmd` / `.pdf` / `.svg` |

## Cómo recompilar

```bash
cd "Fase 2/Evidencias Proyecto/Documentacion Tecnica"
pdflatex -interaction=nonstopmode Documento_Tecnico_Capstone.tex   # primera pasada
pdflatex -interaction=nonstopmode Documento_Tecnico_Capstone.tex   # segunda pasada: índice y referencias
```

También funciona con `latexmk -pdf Documento_Tecnico_Capstone.tex` o en Overleaf
(compilador pdfLaTeX), subiendo la carpeta completa (incluye `secciones/` y `Diagramas/`).

### Cómo recompilar cada sección por separado

Los fragmentos de `secciones/` **no se compilan directamente**: no tienen preámbulo ni
`\begin{document}`; el maestro los incluye. Esa es la única forma de compilación.

## Reglas de este repositorio

El estándar aplicado en Fase 2 utiliza Latin Modern, A4 con márgenes aproximados de
2,5 cm, interlineado 1,15 y marcadores explícitos para lo no respaldado por evidencia.
En resumen: los documentos
académicos/técnicos evaluables se mantienen en LaTeX compilado y los diagramas como fuente
Mermaid (`.mmd`) con renders PDF/SVG generados por `mermaid-cli`. Los archivos Markdown se limitan a README, registro de
cambios, índices y guías breves de desarrollador. No se conservan versiones intermedias ni
artefactos temporales; los estados vigentes y pendientes quedan descritos en este índice
y en los propios documentos de Fase 2.
