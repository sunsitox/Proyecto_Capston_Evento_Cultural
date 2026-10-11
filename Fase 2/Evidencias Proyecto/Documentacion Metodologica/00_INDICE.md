# Documentación Metodológica — Artefactos ágiles (Fase 2)

Artefactos de la **Opción 2 del anexo metodológico: Marco Ágil (Scrum, Kanban)**,
creados con la información verificable del repositorio. Todo lo no respaldado por
evidencia queda marcado "Pendiente de completar por el equipo" dentro de cada documento.

La plantilla LaTeX está incluida en esta carpeta como `estilo_capstone.sty`; para
recompilar se requieren dos pasadas:

```bash
pdflatex documento.tex   # primera pasada
pdflatex documento.tex   # segunda pasada (índice/referencias)
```

O en Overleaf (pdfLaTeX) subiendo esta carpeta completa.

## Artefactos

| # Anexo | Documento | Archivo | Estado |
|---|---|---|---|
| 1 | Product Vision | `01_Product_Vision_Evento_Cultural.tex` / `.pdf` | ✅ Redactado desde design brief, HU y estado real; métricas de éxito pendientes del equipo |
| 4 | Definition of Done | `02_Definition_of_Done_Evento_Cultural.tex` / `.pdf` | ✅ Redactado desde los criterios de aceptación de HU y matriz MoSCoW; pendiente ratificación del equipo |
| — | Matriz MoSCoW Fase 2 | `../Requerimientos_Funcionales_NoFuncionales_MoSCoW_ADAPTADO_Fase2.xlsx` | ✅ Revisada al 10-10-2026: estados de integración y automatización coherentes con el código y el repo oficial en GitHub |
| 7 | Plan de pruebas + evidencias | `03_Plan_de_Pruebas_Evento_Cultural.tex` / `.pdf` | ✅ Estado real por RNF: ejecutadas / parciales / pendientes, con plan para cubrir las faltantes |
| 8 | Manual técnico/despliegue | `04_Manual_Tecnico_Despliegue_Evento_Cultural.tex` / `.pdf` | ✅ Ejecución local verificada. GitHub Actions desplegado y en testeo (job programado); arquitectura migrada a TypeScript directo con Supabase; **Vercel como plataforma objetivo para despliegue web** y app Android (Capacitor 8) diferida por decisión del equipo; sin Docker |
| 6 | Evidencia de retrospectivas | `05_Plantilla_Acta_Retrospectiva_Semanal.docx` | Plantilla lista; el equipo la completa en cada reunión semanal y archiva el acta con fecha |

## Artefactos ágiles NO creados (requieren decisión o contenido humano)

| # Anexo | Artefacto | Motivo |
|---|---|---|
| 2 | Product Backlog priorizado | Ya existe como `Historias_de_Usuario_Plataforma_Cultural.xlsx` (HU-01…15 priorizadas) + matriz MoSCoW; completar HU-16…35 y validación con usuarios |
| 3 | Sprint Backlog (por sprint) | El equipo trabaja Scrumban **sin sprints fijos**: decidir si se adapta a las iteraciones semanales del tablero Trello o se declara la adaptación |
| 5 | Documento de diseño | Ya cubierto por `../Documentacion Tecnica/` (arquitectura, modelo de datos, UML, RNF) |

## Automatización de la fase (estado verificable)

| Elemento | Estado |
|---|---|
| GitHub Actions (workflow "Extraer eventos y sincronizar Supabase") | Configurada en el repositorio; cron `37 23 * * *` (hora Santiago), desencadenante `workflow_dispatch` probada el 29-09 04:05 UTC → **éxito** (run #13). |
| Corridas programadas completas | Pendiente: la primera ejecución programada en verde hasta confirmarla. |
| Repositorio oficial del scraper | `github.com/sunsitox/sunsitox-Scraper_de_eventos_culturales`: incluye la carpeta `supabase/` con las migraciones SQL y el workflow `scrape-events.yml` activo. |
| Corridas de pruebas | #9/#10/#11/#12 fallaron; #13 OK. |
| Integración frontend ↔ base de datos | **Implementada**: la web consume el catálogo real de Supabase directamente en TypeScript (`@supabase/supabase-js`) con autenticación real (password + OAuth preparado) y Edge Function `admin-account`; publicación sujeta a política RLS INSERT y señales de interés aún sin persistir. |

## Verificación

Los 4 PDF compilaron con pdfLaTeX/MiKTeX sin errores (portada Latin Modern,
márgenes 2,5 cm, interlineado 1,15) y se verificó su apertura. La plantilla DOCX
usa Aptos 11 pt, interlineado 1,15 y márgenes de 2,5 cm, y abre correctamente.
Los artefactos LaTeX auxiliares **no se eliminan**: se regeneran en cada
compilación y se omiten a la hora de subir a GitHub (regla `.gitignore`/del
repositorio, no borrado físico).
