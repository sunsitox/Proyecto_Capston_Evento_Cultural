# Evidencias Proyecto — Fase 2

Índice de esta carpeta (categoría "Evidencias Proyecto" del Excel rector).
Las reglas de formato aplicables a esta fase se resumen en los índices de
`Documentacion Tecnica/` y `Documentacion Metodologica/`.

## Evidencias de documentación

| Archivo / carpeta | Contenido |
|---|---|
| `Documentacion Tecnica/` | Documento técnico formal (`Documento_Tecnico_Capstone.tex`/`.pdf`), secciones LaTeX y diagramas editables `Diagramas/01…07` (detalle en su `00_INDICE.md`) |
| `Documentacion Metodologica/` | Artefactos ágiles del anexo metodológico: Product Vision, Definition of Done, Plan de pruebas, matriz operativa, evidencias QA del frontend y CI del scraper del 11-10-2026, Manual técnico/despliegue y plantilla de retrospectiva (detalle en su `00_INDICE.md`) |
| `design_brief_capstone.docx` | Design brief v0.3 (identidad visual y mockups referenciados; logo pendiente) |
| `Historias_de_Usuario_Plataforma_Cultural.xlsx` | Backlog de 15 historias de usuario derivadas de evidencia web (HU-01…HU-15, con fuente URL) + hoja "Mis historias" para el equipo (HU-16…HU-35) |
| `Requerimientos_Funcionales_NoFuncionales_MoSCoW_ADAPTADO_Fase2.xlsx` | Matriz MoSCoW adaptada a Fase 2 con plantilla completa (detalle en la sección 12 del registro) |
| `mockups/` | Cuatro mockups de referencia (01, 02, 05 y 06) y `Arquitectura_general_Evento_Cultural_FINAL.pptx`, actualizado con el stack y la automatización vigentes |
| `ppt capsula/Presentacion_Proyecto_Eventos_Culturales_Actualizada.pptx` | Presentación vigente de Fase 2; incluye arquitectura, automatización, experiencia de usuario, sostenibilidad y hoja de ruta |

## Evidencias de sistema

| Archivo | Contenido |
|---|---|
| `Scraper de eventos culturales.rar` | Entregable de sistema del scraper Python. La configuración vigente documentada en Fase 2 contempla 22 fuentes: 21 permanentes y FondasChile como fuente estacional de septiembre |
| `evento-cultural.rar` | Entregable de sistema: frontend Angular/Ionic con su README y documentación LaTeX (consolidado junto al scraper en esta carpeta) |
| `Evidencia_ejecución_scraper_en_GitHub_Actions.PNG` | Captura de la ejecución real del workflow del scraper |

## Evidencia QA del frontend

El ciclo parcial del 11-10-2026 se integra en
`Documentacion Metodologica/Matriz_Casos_de_Prueba_Evento_Cultural.xlsx` y en
`Documentacion Metodologica/Evidencias_QA_Frontend_2026-10-11/`. Se ejecutaron 13
escenarios sobre `https://eventocultural.vercel.app`: 6 aprobados, 6 aprobados con
observaciones y 1 fallido. Se registraron 13 defectos, incluidos dos de severidad alta
relacionados con el mapa móvil y el solapamiento de la navegación inferior.

## Evidencia CI del scraper

La matriz también incorpora cinco ejecuciones de GitHub Actions vinculadas a casos
canónicos de integración continua. Las capturas y el detalle se conservan en
`Documentacion Metodologica/Evidencias_CI_Scraper_2026-10-11/`. El run programado #25
terminó correctamente con dos artefactos; se dejó abierto `DEF-CI-001` porque el inicio
real (06:16 de Chile) quedó fuera de la ventana nocturna acordada.


`iconos_frontend.zip` es iconografía de apoyo del frontend.

## Pendientes de esta carpeta

- Validar las historias de usuario con usuarios reales y completar HU-16…HU-35 en la hoja "Mis historias" (plantilla con instrucciones).
- Logo institucional del design brief: **Pendiente de completar por el equipo**.
