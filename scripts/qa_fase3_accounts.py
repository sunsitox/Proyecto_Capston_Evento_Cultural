"""Cuentas temporales de QA Fase 3: crear y eliminar (uso único).

Uso:
    python scripts/qa_fase3_accounts.py create
    python scripts/qa_fase3_accounts.py cleanup

No imprime claves. Las cuentas se crean confirmadas con la API de
administración y se eliminan al final (cascade a profiles/interacciones).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests
from dotenv import dotenv_values

RAIZ = Path(__file__).resolve().parents[1]
ESTADO = RAIZ / "_qa_fase3_state.json"
PREFIJO = "qa-f3-2211"
PASSWORD = "QaF3!Temp2026"

CUENTAS = [
    ("admin", f"{PREFIJO}-admin@example.com", "QA Admin Fase3", "admin"),
    ("organizador", f"{PREFIJO}-org@example.com", "QA Organizador Fase3", "organizador"),
    ("usuario", f"{PREFIJO}-user@example.com", "QA Usuario Fase3", "usuario"),
]

config = dotenv_values(RAIZ / ".env")
URL = str(config["SUPABASE_URL"]).rstrip("/")
SECRET = str(config["SUPABASE_SECRET_KEY"])
ADMIN_HEADERS = {"apikey": SECRET, "Authorization": f"Bearer {SECRET}"}


def crear() -> None:
    estado = {"url": URL, "password": PASSWORD, "cuentas": {}}
    for clave, email, nombre, rol in CUENTAS:
        respuesta = requests.post(
            f"{URL}/auth/v1/admin/users",
            headers=ADMIN_HEADERS,
            json={
                "email": email,
                "password": PASSWORD,
                "email_confirm": True,
                "user_metadata": {
                    "nombre": nombre,
                    "nombre_display": nombre,
                    "email": email,
                    "rol": rol,
                },
            },
            timeout=30,
        )
        if respuesta.status_code >= 400:
            print(f"ERROR creando {clave}: {respuesta.status_code} {respuesta.text[:200]}")
            sys.exit(1)
        usuario = respuesta.json()
        estado["cuentas"][clave] = {"id": usuario["id"], "email": email, "rol": rol}
        print(f"creada {clave}: {email} id={usuario['id']}")

    # El rol admin vive en public.profiles (no en user_metadata).
    admin_id = estado["cuentas"]["admin"]["id"]
    cambio = requests.patch(
        f"{URL}/rest/v1/profiles",
        headers={**ADMIN_HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{admin_id}"},
        json={"role": "admin"},
        timeout=30,
    )
    print(f"profiles.role=admin: HTTP {cambio.status_code}")

    for clave, datos in estado["cuentas"].items():
        perfil = requests.get(
            f"{URL}/rest/v1/profiles",
            headers=ADMIN_HEADERS,
            params={"id": f"eq.{datos['id']}", "select": "id,role,display_name"},
            timeout=30,
        )
        print(f"perfil {clave}: {perfil.status_code} {perfil.json()}")

    ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"estado guardado en {ESTADO.name}")


def limpiar() -> None:
    if ESTADO.exists():
        estado = json.loads(ESTADO.read_text(encoding="utf-8"))
        ids = {c["email"]: c["id"] for c in estado.get("cuentas", {}).values()}
    else:
        ids = {}
        listado = requests.get(
            f"{URL}/auth/v1/admin/users",
            headers=ADMIN_HEADERS,
            params={"page": 1, "per_page": 200},
            timeout=30,
        )
        for usuario in listado.json().get("users", []):
            email = usuario.get("email") or ""
            if email.startswith(PREFIJO):
                ids[email] = usuario["id"]

    for email, uid in ids.items():
        borrado = requests.delete(
            f"{URL}/auth/v1/admin/users/{uid}", headers=ADMIN_HEADERS, timeout=30
        )
        print(f"borrada {email}: HTTP {borrado.status_code}")

    if ESTADO.exists():
        ESTADO.unlink()
    print("limpieza terminada")


if __name__ == "__main__":
    accion = sys.argv[1] if len(sys.argv) > 1 else ""
    if accion == "create":
        crear()
    elif accion == "cleanup":
        limpiar()
    else:
        print("uso: create | cleanup")
        sys.exit(2)
