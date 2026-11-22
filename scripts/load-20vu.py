"""CP-PER-007: 20 usuarios virtuales concurrentes contra el catálogo (lectura).

Cada usuario hace 3 consultas al endpoint REST público de eventos publicados,
igual que la carga inicial del catálogo. No escribe datos.
"""

from __future__ import annotations

import re
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ENV = Path(__file__).resolve().parents[1] / "src/environments/environment.prod.ts"
texto = ENV.read_text(encoding="utf-8")
url = re.search(r"supabaseUrl:\s*'([^']+)'", texto).group(1)
key = re.search(r"supabaseAnonKey:\s*'([^']+)'", texto).group(1)

ENDPOINT = f"{url}/rest/v1/events"
HEADERS = {"apikey": key, "Authorization": f"Bearer {key}"}
PARAMS = {
    "select": "id,title,start_at,commune_id",
    "status": "eq.published",
    "is_suppressed": "eq.false",
    "order": "start_at.asc",
    "limit": "12",
}
USUARIOS = 20
CONSULTAS_POR_USUARIO = 3


def usuario(_: int) -> list[tuple[float, int]]:
    resultados = []
    for _ in range(CONSULTAS_POR_USUARIO):
        inicio = time.perf_counter()
        try:
            respuesta = requests.get(ENDPOINT, headers=HEADERS, params=PARAMS, timeout=15)
            latencia = (time.perf_counter() - inicio) * 1000
            resultados.append((latencia, respuesta.status_code))
        except requests.RequestException:
            resultados.append(((time.perf_counter() - inicio) * 1000, 0))
    return resultados


inicio_total = time.perf_counter()
with ThreadPoolExecutor(max_workers=USUARIOS) as pool:
    mediciones = [item for lote in pool.map(usuario, range(USUARIOS)) for item in lote]
duracion = time.perf_counter() - inicio_total

latencias = [latencia for latencia, _ in mediciones]
errores = [codigo for _, codigo in mediciones if codigo != 200]
latencias.sort()


def percentil(p: float) -> float:
    indice = min(len(latencias) - 1, max(0, round(p * (len(latencias) - 1))))
    return latencias[indice]


print(f"usuarios_virtuales={USUARIOS} consultas={len(mediciones)} duracion_s={duracion:.2f}")
print(
    f"p50_ms={statistics.median(latencias):.0f} p95_ms={percentil(0.95):.0f} "
    f"max_ms={max(latencias):.0f} errores={len(errores)}"
)
print(f"codigos={sorted({codigo for _, codigo in mediciones})}")
print(f"throughput_rps={len(mediciones) / duracion:.2f}")
print(
    "umbral_p95_2000ms="
    + ("CUMPLE" if percentil(0.95) < 2000 else "NO CUMPLE")
    + " errores_0="
    + ("CUMPLE" if not errores else "NO CUMPLE")
)
