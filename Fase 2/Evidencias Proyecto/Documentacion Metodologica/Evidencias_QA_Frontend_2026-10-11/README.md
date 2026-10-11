# Evidencia QA del frontend — ciclo parcial de Fase 2

Fecha de ejecución: **11 de octubre de 2026**  
Entorno: **producción / Vercel**  
URL: <https://eventocultural.vercel.app>  
Rama evaluada: **`deploy/vercel-preview`**  
Commit evaluado: **`4da3963`**  
Responsable: **José Miguel Moncada (QA)**

## Alcance

Se ejecutó una muestra funcional y exploratoria sobre el catálogo público. La revisión
incluyó inicio, búsqueda con y sin resultados, filtro regional, detalle de evento, mapa,
calendario, navegación móvil, recomendaciones temporales para visitante y perfil sin
sesión. Se usaron una vista de escritorio de 1440 × 900 y una vista móvil de 390 × 844.

La fuente operativa de verdad es
`../Matriz_Casos_de_Prueba_Evento_Cultural.xlsx`: la hoja `Ejecuciones` contiene los 13
escenarios y la hoja `Defectos` contiene los 13 hallazgos. Esta carpeta conserva las
capturas citadas por esas filas.

La rama y el commit se verificaron contra el historial público del repositorio
<https://github.com/sunsitox/Proyecto_Capston_Evento_Cultural>. La captura
`screenshots/GitHub_frontend_rama_deploy_commits.png` conserva esa trazabilidad. La
asociación de dicha rama con el despliegue productivo fue informada por el equipo.

## Resultado consolidado

- 13 escenarios ejecutados sobre 12 casos canónicos de la matriz; la búsqueda por título
  se verificó tanto en escritorio como en móvil.
- 6 ejecuciones aprobadas.
- 6 ejecuciones aprobadas con observaciones. En la matriz se registran como `Aprobado` y
  mantienen los defectos asociados en `Observaciones`.
- 1 ejecución fallida: mapa en vista móvil.
- 13 defectos abiertos: 2 altos, 8 medios y 3 bajos.

## Hallazgos prioritarios

1. **Mapa móvil incompleto:** en 390 × 844 solo se renderiza una parte de los mosaicos.
2. **Navegación inferior superpuesta:** la barra fija cubre contenido en mapa, calendario
   y perfil.
3. **Carga extensa del calendario:** un día muestra 535–564 eventos sin paginación o
   virtualización visible.
4. **Calidad de datos:** se detectó un registro permanente con rango 2019–2030, CTA
   genérico y organizador de respaldo.
5. **Cobertura cartográfica:** 509 eventos mostraron posición y 743 quedaron fuera del
   mapa por falta de ubicación aproximada.

## Medición básica de red

Cinco solicitudes del documento HTML de inicio respondieron HTTP 200. Los tiempos
observados fueron 0,239–0,575 segundos, con promedio de 0,409 segundos. Esta comprobación
solo valida disponibilidad y tiempo del HTML inicial; no equivale a LCP, INP, CLS ni a una
auditoría de Core Web Vitals.

## Pendientes para Fase 3

Quedan fuera de este ciclo: registro/inicio/cierre de sesión, recuperación de contraseña,
persistencia de señales y preferencias, verificación de RLS por rol, auditoría WCAG 2.2,
compatibilidad entre navegadores y dispositivos físicos, Core Web Vitals, concurrencia,
integridad exhaustiva de enlaces y regresión de los defectos abiertos.

## Inventario de capturas

| Archivo | Evidencia principal |
|---|---|
| `screenshots/GitHub_frontend_rama_deploy_commits.png` | Rama de despliegue y commit `4da3963` evaluado |
| `screenshots/TC01_home_laptop.png` | Inicio en escritorio y discrepancia de conteos |
| `screenshots/TC02_busqueda_museo_laptop.png` | Búsqueda `Museo` |
| `screenshots/TC03_busqueda_sin_resultados.png` | Estado vacío de búsqueda |
| `screenshots/TC04_filtro_region_valparaiso.png` | Filtro Región de Valparaíso |
| `screenshots/TC05_detalle_evento_laptop.png` | Ficha de evento y calidad de datos |
| `screenshots/TC06_mapa_laptop.png` | Entrada al mapa con scroll preservado |
| `screenshots/TC06b_mapa_laptop_top.png` | Mapa de escritorio y conteos geográficos |
| `screenshots/DEF02_mapa_navbar_mobile.png` | Fallo del mapa y solapamiento móvil |
| `screenshots/TC07_home_mobile.png` | Inicio móvil, chips y doble scroll |
| `screenshots/TC08_busqueda_teatro_mobile.png` | Búsqueda `teatro` en móvil |
| `screenshots/TC09_calendario_mobile.png` | Calendario móvil |
| `screenshots/TC10_calendario_dia_mobile.png` | Selección del 12 de octubre |
| `screenshots/TC11_para_ti_sin_sesion_mobile.png` | Recomendación temporal del visitante |
| `screenshots/TC12_perfil_sin_sesion_mobile.png` | Perfil sin sesión |
