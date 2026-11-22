"""CP-F3-PUB-002 y CP-F3-PRF-003 contra el proyecto desplegado.

Requiere las cuentas temporales de `qa_fase3_accounts.py create`.

- PUB-002: la Edge `publicar-evento` desplegada debe rechazar (400) un
  borrador sin categorías y no crear filas; un borrador válido sigue
  entrando (201) y se elimina al final.
- PRF-003: un usuario autenticado sube su avatar a `avatars/<uid>/...`,
  obtiene la URL pública, la guarda en su metadata y puede borrarla.
  Las políticas impiden escribir en la carpeta de otro usuario.

Uso:
    python scripts/qa_fase3_avatar_pub.py
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import requests
from dotenv import dotenv_values

RAIZ = Path(__file__).resolve().parents[1]
ESTADO = json.loads((RAIZ / "_qa_fase3_state.json").read_text(encoding="utf-8"))
config = dotenv_values(RAIZ / ".env")
URL = str(config["SUPABASE_URL"]).rstrip("/")
PUBLICA = str(config["SUPABASE_PUBLIC_KEY"])
SECRETA = str(config["SUPABASE_SECRET_KEY"])
H_ADMIN = {"apikey": SECRETA, "Authorization": f"Bearer {SECRETA}"}
PUBLICAR = f"{URL}/functions/v1/publicar-evento"
ORG_ID = ESTADO["cuentas"]["organizador"]["id"]
USER_ID = ESTADO["cuentas"]["usuario"]["id"]
MARCA = "QA Fase3"

# PNG 1x1 transparente: contenido real para que Storage sirva un objeto válido.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

fallos: list[str] = []


def comprobar(nombre: str, condicion: bool, detalle: str) -> None:
    print(f"{'PASS' if condicion else 'FALLO'} · {nombre}: {detalle}")
    if not condicion:
        fallos.append(nombre)


def login(clave: str) -> str:
    cuenta = ESTADO["cuentas"][clave]
    r = requests.post(
        f"{URL}/auth/v1/token",
        params={"grant_type": "password"},
        headers={"apikey": PUBLICA, "Content-Type": "application/json"},
        json={"email": cuenta["email"], "password": ESTADO["password"]},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def contar_eventos() -> int:
    r = requests.get(
        f"{URL}/rest/v1/events",
        headers=H_ADMIN,
        params={"select": "id", "external_key": f"like.org:{ORG_ID}:%"},
        timeout=30,
    )
    r.raise_for_status()
    return len(r.json())


def borrar_evento(evento_id: str) -> None:
    requests.delete(
        f"{URL}/rest/v1/event_categories",
        headers={**H_ADMIN, "Prefer": "return=minimal"},
        params={"event_id": f"eq.{evento_id}"},
        timeout=30,
    )
    requests.delete(
        f"{URL}/rest/v1/events",
        headers={**H_ADMIN, "Prefer": "return=minimal"},
        params={"id": f"eq.{evento_id}"},
        timeout=30,
    )


def base(titulo: str, categories: list[str] | None = None) -> dict:
    return {
        "titulo": titulo,
        "descripcion": "Evento temporal de QA Fase 3 para verificar la validación de categorías.",
        "start_at": "2026-12-20T19:00",
        "end_at": None,
        "venue": "Sala QA Fase3",
        "address": "Av. QA 123",
        "comuna": "Santiago",
        "modalidad": "presencial",
        "is_free": True,
        "price_text": None,
        "image_url": "https://picsum.photos/seed/qa-fase3/800/600",
        "audience": "Todo público",
        "categories": ["Música"] if categories is None else categories,
        "official_url": None,
    }


def probar_pub_002(org: str) -> None:
    antes = contar_eventos()
    invalidos = [
        ("sin categorías", base(f"{MARCA} sin categoria", [])),
        ("categoría vacía", base(f"{MARCA} categoria vacia", ["  "])),
        ("categoría no textual", {**base(f"{MARCA} categoria tipo"), "categories": [123]}),
        ("título corto", {**base("QA"), "categories": ["Música"]}),
    ]

    for nombre, cuerpo in invalidos:
        r = requests.post(
            PUBLICAR,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {org}"},
            json=cuerpo,
            timeout=60,
        )
        comprobar(
            f"PUB-002 rechaza {nombre}",
            r.status_code == 400,
            f"HTTP {r.status_code} {r.json().get('error', '')[:60]}",
        )

    despues = contar_eventos()
    comprobar("PUB-002 sin filas nuevas", despues == antes, f"antes={antes} después={despues}")

    valido = requests.post(
        PUBLICAR,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {org}"},
        json=base(f"{MARCA} categoría válida"),
        timeout=60,
    )
    comprobar("PUB-002 no bloquea el caso válido", valido.status_code == 201, f"HTTP {valido.status_code}")
    if valido.status_code == 201:
        borrar_evento(valido.json()["evento"]["id"])
        print("evento válido de prueba eliminado")


def subir(ruta: str, token: str | None) -> requests.Response:
    headers = {"Content-Type": "image/png", "x-upsert": "true"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(
        f"{URL}/storage/v1/object/avatars/{ruta}",
        headers={**headers, "apikey": PUBLICA},
        data=PNG,
        timeout=60,
    )


def probar_prf_003(usuario: str) -> None:
    ruta = f"{USER_ID}/avatar-qa.png"
    subida = subir(ruta, usuario)
    comprobar("PRF-003 subida en carpeta propia", subida.status_code == 200, f"HTTP {subida.status_code} {subida.text[:80]}")

    publica = f"{URL}/storage/v1/object/public/avatars/{ruta}"
    lectura = requests.get(publica, timeout=30)
    comprobar(
        "PRF-003 URL pública sirve la imagen",
        lectura.status_code == 200 and lectura.headers.get("content-type", "").startswith("image/"),
        f"HTTP {lectura.status_code} {lectura.headers.get('content-type')}",
    )

    meta = requests.put(
        f"{URL}/auth/v1/user",
        headers={"apikey": PUBLICA, "Authorization": f"Bearer {usuario}", "Content-Type": "application/json"},
        json={"data": {"avatar_url_custom": publica}},
        timeout=30,
    )
    guardado = (meta.json().get("user_metadata") or {}).get("avatar_url_custom") if meta.ok else None
    comprobar("PRF-003 avatar guardado en el perfil", guardado == publica, f"HTTP {meta.status_code}")

    ajena = subir(f"{ORG_ID}/avatar-qa.png", usuario)
    comprobar("PRF-003 no escribe en carpeta ajena", ajena.status_code in (400, 403), f"HTTP {ajena.status_code}")

    anonima = subir(f"{USER_ID}/avatar-anonima.png", None)
    rechazo = f"{anonima.text[:80]}".lower()
    sin_sesion = anonima.status_code in (401, 403) or (
        anonima.status_code == 400 and any(p in rechazo for p in ("jwt", "unauthorized", "policy"))
    )
    comprobar("PRF-003 sin sesión no sube", sin_sesion, f"HTTP {anonima.status_code} {anonima.text[:80]}")

    borrado = requests.delete(
        f"{URL}/storage/v1/object/avatars/{ruta}",
        headers={"apikey": PUBLICA, "Authorization": f"Bearer {usuario}"},
        timeout=30,
    )
    comprobar("PRF-003 borra su propia imagen", borrado.status_code == 200, f"HTTP {borrado.status_code}")

    # La URL pública puede seguir en la caché del CDN unos minutos; la
    # comprobación fiable es el listado real del bucket con service_role.
    listado = requests.post(
        f"{URL}/storage/v1/object/list/avatars",
        headers=H_ADMIN,
        json={"prefix": f"{USER_ID}/", "limit": 100},
        timeout=30,
    )
    objetos = listado.json() if listado.ok else []
    comprobar(
        "PRF-003 el objeto borrado ya no existe",
        listado.ok and objetos == [],
        f"HTTP {listado.status_code} objetos={objetos}",
    )


def main() -> None:
    org = login("organizador")
    usuario = login("usuario")
    print("== CP-F3-PUB-002 ==")
    probar_pub_002(org)
    print("== CP-F3-PRF-003 ==")
    probar_prf_003(usuario)
    print(f"\nresultado: {len(fallos)} fallo(s)")
    if fallos:
        print("fallos: " + ", ".join(fallos))
        sys.exit(1)


if __name__ == "__main__":
    main()
