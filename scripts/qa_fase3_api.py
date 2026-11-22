"""CP-DB-016 / CP-SEC-006 / CP-F3-ADM-001 / CP-F3-ADM-003 (servidor).

Comprueba con cuentas temporales que:
- sin JWT o con JWT inválido, las funciones admin responden 401;
- un usuario normal recibe 403;
- un admin accede (200);
- si se retira el rol en profiles, el mismo JWT deja de servir (403);
- las tablas internas no son legibles con la clave pública.
No imprime tokens ni claves.
"""

from __future__ import annotations

import json
from pathlib import Path

import requests
from dotenv import dotenv_values

RAIZ = Path(__file__).resolve().parents[1]
ESTADO = json.loads((RAIZ / "_qa_fase3_state.json").read_text(encoding="utf-8"))
config = dotenv_values(RAIZ / ".env")
URL = str(config["SUPABASE_URL"]).rstrip("/")
PUBLICA = str(config["SUPABASE_PUBLIC_KEY"])
SECRETA = str(config["SUPABASE_SECRET_KEY"])
ADMIN_HEADERS = {"apikey": SECRETA, "Authorization": f"Bearer {SECRETA}"}
FUNCION = f"{URL}/functions/v1/admin-eventos"


def login(clave: str) -> str:
    cuenta = ESTADO["cuentas"][clave]
    respuesta = requests.post(
        f"{URL}/auth/v1/token",
        params={"grant_type": "password"},
        headers={"apikey": PUBLICA, "Content-Type": "application/json"},
        json={"email": cuenta["email"], "password": ESTADO["password"]},
        timeout=30,
    )
    respuesta.raise_for_status()
    return respuesta.json()["access_token"]


def llamar(token: str | None, accion: str = "listar") -> int:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(
        FUNCION, headers=headers, json={"accion": accion, "limite": 1}, timeout=45
    ).status_code


def main() -> None:
    admin = login("admin")
    usuario = login("usuario")
    organizador = login("organizador")

    resultados = []
    resultados.append(("sin JWT", llamar(None), 401))
    resultados.append(("JWT inválido", llamar("token-invalido"), 401))
    resultados.append(("usuario normal", llamar(usuario), 403))
    resultados.append(("organizador (no admin)", llamar(organizador), 403))
    resultados.append(("admin", llamar(admin), 200))

    # Tablas internas: la clave pública no debe poder leerlas.
    for tabla in ("profiles", "event_provenance", "reports"):
        respuesta = requests.get(
            f"{URL}/rest/v1/{tabla}",
            headers={"apikey": PUBLICA, "Authorization": f"Bearer {PUBLICA}"},
            params={"select": "*", "limit": 1},
            timeout=30,
        )
        resultados.append((f"anon {tabla}", respuesta.status_code, 401))

    # Retirar el rol admin: el mismo token debe dejar de autorizar.
    admin_id = ESTADO["cuentas"]["admin"]["id"]
    requests.patch(
        f"{URL}/rest/v1/profiles",
        headers={**ADMIN_HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{admin_id}"},
        json={"role": "visitor"},
        timeout=30,
    )
    resultados.append(("admin sin rol (mismo JWT)", llamar(admin), 403))

    # Restaurar para las pruebas de interfaz.
    requests.patch(
        f"{URL}/rest/v1/profiles",
        headers={**ADMIN_HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{admin_id}"},
        json={"role": "admin"},
        timeout=30,
    )
    resultados.append(("admin con rol restaurado", llamar(admin), 200))

    fallos = 0
    for nombre, obtenido, esperado in resultados:
        ok = obtenido == esperado
        fallos += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} {nombre}: HTTP {obtenido} (esperado {esperado})")
    print(f"RESUMEN {len(resultados) - fallos}/{len(resultados)} PASS")
    if fallos:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
