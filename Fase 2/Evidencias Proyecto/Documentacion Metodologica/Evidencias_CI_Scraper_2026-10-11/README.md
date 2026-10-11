# Evidencia CI del scraper — GitHub Actions

Fecha de consolidación: **11 de octubre de 2026**  
Repositorio: <https://github.com/sunsitox/sunsitox-Scraper_de_eventos_culturales>  
Entorno: **GitHub Actions / `ubuntu-latest`**

## Alcance verificado

Se revisaron los workflows públicos del scraper y sus ejecuciones reales. La matriz
`../Matriz_Casos_de_Prueba_Evento_Cultural.xlsx` registra cinco ejecuciones vinculadas a
los casos `CP-CI-001`, `CP-CI-002`, `CP-CI-004`, `CP-CI-007` y `CP-CI-009`.

## Resultados

| Evidencia | Resultado |
|---|---|
| Workflow **Extraer eventos y sincronizar Supabase**, run [#25](https://github.com/sunsitox/sunsitox-Scraper_de_eventos_culturales/actions/runs/38127762874) | `Success`, rama `main`, commit `bd7a052`, duración 13 min 58 s y 2 artefactos (`extract` y `final`) |
| Workflow **Validar inventario de fuentes culturales**, run [#1](https://github.com/sunsitox/sunsitox-Scraper_de_eventos_culturales/actions/runs/35942705644) | `Success`, ejecución manual, commit `0498e63`, duración 1 min 14 s y 1 artefacto de auditoría |
| Secuencia de runs programados | Runs #18 a #25 en estado exitoso; también se conserva el antecedente del run #12 fallido |

El run #25 completó la validación de secretos, pruebas, restauración de estado,
extracción, enriquecimiento, sincronización y persistencia de artefactos. La ejecución
confirma que el pipeline funciona de extremo a extremo en CI.

## Hallazgo operativo

El workflow declara `cron: "37 23 * * *"` con zona `America/Santiago`, pero las
ejecuciones programadas recientes visibles en GitHub comenzaron aproximadamente entre
las 05:32 y 06:35 de Chile. El run #25 comenzó a las 06:16. Por ello, el caso
`CP-CI-002` queda **fallido** aunque el pipeline haya terminado con éxito, y se registra
`DEF-CI-001`: el scheduler no inicia dentro de la ventana nocturna acordada.

Esto distingue dos resultados diferentes:

- **funcionalidad del pipeline:** aprobada;
- **puntualidad de la programación:** pendiente de corrección o aceptación del riesgo.

## Observaciones no bloqueantes

GitHub muestra una advertencia por acciones basadas en Node.js 20 que se fuerzan a
Node.js 24, además del aviso de futura migración de `ubuntu-latest` a Ubuntu 26. No
causaron fallos en los runs revisados, pero conviene actualizar las versiones de las
acciones y fijar el runner si la migración altera el comportamiento.

## Inventario de capturas

| Archivo | Contenido |
|---|---|
| `screenshots/GitHub_scraper_run_25_success.png` | Resumen del run #25, estado, commit, duración y dos artefactos |
| `screenshots/GitHub_scraper_runs_scheduled.png` | Historial de ejecuciones manuales/programadas y sus horas visibles |
| `screenshots/GitHub_validacion_fuentes_run_1_success.png` | Validación manual del inventario de fuentes y artefacto generado |

Las capturas no contienen secretos ni valores de variables privadas.
