"""CP-F3-PUB-002 / MOD-001 / MOD-002 con cuentas y eventos temporales.

Crea dos eventos como organizador temporal, comprueba validaciones del
servidor, publicación/ocultamiento y visibilidad masiva, y deja los eventos
para la prueba de interfaz. `cleanup` los elimina todos.
"""

from __future__ import annotations

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
H_ADMIN_JSON = {**H_ADMIN, "Content-Type": "application/json"}
PUBLICAR = f"{URL}/functions/v1/publicar-evento"
ADMIN_EVENTOS = f"{URL}/functions/v1/admin-eventos"
ORG_ID = ESTADO["cuentas"]["organizador"]["id"]
MARCA = "QA Fase3"


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


def publicar(token: str, cuerpo: dict) -> requests.Response:
    return requests.post(
        PUBLICAR,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        json=cuerpo,
        timeout=60,
    )


def admin(token: str, cuerpo: dict) -> requests.Response:
    return requests.post(
        ADMIN_EVENTOS,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        json=cuerpo,
        timeout=60,
    )


def eventos_propios() -> list[dict]:
    r = requests.get(
        f"{URL}/rest/v1/events",
        headers=H_ADMIN,
        params={
            "select": "id,title,status,is_suppressed,external_key,start_at",
            "external_key": f"like.org:{ORG_ID}:%",
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def borrar_propios() -> int:
    eventos = eventos_propios()
    for evento in eventos:
        requests.delete(
            f"{URL}/rest/v1/event_categories",
            headers={**H_ADMIN, "Prefer": "return=minimal"},
            params={"event_id": f"eq.{evento['id']}"},
            timeout=30,
        )
        requests.delete(
            f"{URL}/rest/v1/events",
            headers={**H_ADMIN, "Prefer": "return=minimal"},
            params={"id": f"eq.{evento['id']}"},
            timeout=30,
        )
    return len(eventos)


def base(titulo: str, fecha: str, categoria: str) -> dict:
    return {
        "titulo": titulo,
        "descripcion": "Evento temporal de QA Fase 3 para verificar publicación y moderación.",
        "start_at": fecha,
        "end_at": None,
        "venue": "Sala QA Fase3",
        "address": "Av. QA 123",
        "comuna": "Santiago",
        "modalidad": "presencial",
        "is_free": True,
        "price_text": None,
        "image_url": "https://picsum.photos/seed/qa-fase3/800/600",
        "audience": "Todo público",
        "categories": [categoria],
        "official_url": None,
    }


def main() -> None:
    org = login("organizador")
    usuario = login("usuario")
    admin_token = login("admin")

    print(f"eventos previos propios: {len(eventos_propios())}")

    # ---- PUB-002: datos inválidos no crean filas -------------------------
    antes = len(eventos_propios())
    invalidos = [
        ("título corto", {**base("QA", "2026-12-20T19:00", "Música")}),
        (
            "descripción corta",
            {**base(f"{MARCA} desc", "2026-12-20T19:00", "Música"), "descripcion": "corta"},
        ),
        (
            "sin recinto",
            {**base(f"{MARCA} recinto", "2026-12-20T19:00", "Música"), "venue": ""},
        ),
        (
            "fecha inválida",
            {**base(f"{MARCA} fecha", "no-es-fecha", "Música")},
        ),
        (
            "sin categorías",
            {**base(f"{MARCA} categoria", "2026-12-20T19:00", "Música"), "categories": []},
        ),
    ]
    for nombre, cuerpo in invalidos:
        r = publicar(org, cuerpo)
        print(f"PUB inválido ({nombre}): HTTP {r.status_code} {r.json().get('error','')[:60]}")
    despues = len(eventos_propios())
    print(f"filas antes/después de inválidos: {antes}/{despues}")
    if despues > antes:
        # El servidor aceptó una entrada inválida: se documenta y se retira
        # de inmediato para no contaminar las pruebas siguientes.
        print("FALLO: una entrada inválida creó fila; se elimina para continuar")
        borrar_propios()
        print(f"filas tras limpiar el inválido: {len(eventos_propios())}")

    # Cuenta normal no puede publicar.
    r = publicar(usuario, base(f"{MARCA} usuario", "2026-12-20T19:00", "Música"))
    print(f"PUB como usuario normal: HTTP {r.status_code} {r.json().get('error','')[:70]}")

    # ---- Crear A (para publicar/ocultar) y B (borrador para UI) ----------
    a = publicar(org, base(f"{MARCA} Validación", "2026-12-20T19:00", "Música"))
    b = publicar(org, base(f"{MARCA} Lote", "2026-12-21T18:00", "Teatro"))
    print(f"crear A: HTTP {a.status_code}")
    print(f"crear B: HTTP {b.status_code}")
    if a.status_code != 201 or b.status_code != 201:
        print(a.text[:300], b.text[:300])
        raise SystemExit(1)
    id_a = a.json()["evento"]["id"]
    id_b = b.json()["evento"]["id"]
    print(f"A={id_a} B={id_b}")

    # Estado inicial: drafts, invisibles al público.
    for etiqueta, eid in (("A", id_a), ("B", id_b)):
        fila = requests.get(
            f"{URL}/rest/v1/events",
            headers=H_ADMIN,
            params={"id": f"eq.{eid}", "select": "status,is_suppressed,title"},
            timeout=30,
        ).json()[0]
        publico = requests.get(
            f"{URL}/rest/v1/events",
            headers={"apikey": PUBLICA},
            params={"id": f"eq.{eid}", "select": "id"},
            timeout=30,
        ).json()
        print(f"{etiqueta} inicial: {fila['status']} suprimido={fila['is_suppressed']} publico={len(publico)}")

    # ---- MOD-001: validar, ocultar, reactivar ---------------------------
    r = admin(admin_token, {"accion": "validar", "evento_id": id_a})
    print(f"validar A: HTTP {r.status_code} {r.json().get('mensaje','')}")
    publico = requests.get(
        f"{URL}/rest/v1/events",
        headers={"apikey": PUBLICA},
        params={"id": f"eq.{id_a}", "select": "id,status"},
        timeout=30,
    ).json()
    print(f"A público tras validar: {publico}")

    r = admin(admin_token, {"accion": "definir_visibilidad", "evento_id": id_a, "visible": False})
    print(f"ocultar A: HTTP {r.status_code} {r.json().get('mensaje','')}")
    publico = requests.get(
        f"{URL}/rest/v1/events",
        headers={"apikey": PUBLICA},
        params={"id": f"eq.{id_a}", "select": "id"},
        timeout=30,
    ).json()
    sigue = requests.get(
        f"{URL}/rest/v1/events",
        headers=H_ADMIN,
        params={"id": f"eq.{id_a}", "select": "id,status,is_suppressed"},
        timeout=30,
    ).json()
    print(f"A oculto: publico={len(publico)} fila={sigue}")

    r = admin(admin_token, {"accion": "definir_visibilidad", "evento_id": id_a, "visible": True})
    print(f"reactivar A: HTTP {r.status_code} {r.json().get('mensaje','')}")
    publico = requests.get(
        f"{URL}/rest/v1/events",
        headers={"apikey": PUBLICA},
        params={"id": f"eq.{id_a}", "select": "id"},
        timeout=30,
    ).json()
    print(f"A público tras reactivar: {len(publico)}")

    # ---- MOD-002: visibilidad masiva limitada al grupo ------------------
    r = admin(admin_token, {"accion": "visibilidad_masiva", "grupo": "en_validacion", "visible": False})
    print(f"masiva ocultar drafts: HTTP {r.status_code} {r.json()}")
    a_fila = requests.get(
        f"{URL}/rest/v1/events", headers=H_ADMIN,
        params={"id": f"eq.{id_a}", "select": "status,is_suppressed"}, timeout=30,
    ).json()[0]
    b_fila = requests.get(
        f"{URL}/rest/v1/events", headers=H_ADMIN,
        params={"id": f"eq.{id_b}", "select": "status,is_suppressed"}, timeout=30,
    ).json()[0]
    print(f"tras masiva: A={a_fila} B={b_fila}")

    # Restaurar solo el borrador B (acción individual del panel).
    r = admin(admin_token, {"accion": "definir_visibilidad", "evento_id": id_b, "visible": True})
    print(f"restaurar B: HTTP {r.status_code} {r.json().get('mensaje','')}")

    r = admin(admin_token, {"accion": "visibilidad_masiva", "grupo": "otro", "visible": False})
    print(f"masiva grupo inválido: HTTP {r.status_code} {r.json().get('error','')}")
    r = admin(usuario, {"accion": "visibilidad_masiva", "grupo": "todos", "visible": False})
    print(f"masiva sin admin: HTTP {r.status_code} {r.json().get('error','')}")

    b_fila = requests.get(
        f"{URL}/rest/v1/events", headers=H_ADMIN,
        params={"id": f"eq.{id_b}", "select": "status,is_suppressed"}, timeout=30,
    ).json()[0]
    print(f"B final: {b_fila}")

    (RAIZ / "_qa_fase3_eventos.json").write_text(
        json.dumps({"a": id_a, "b": id_b}, indent=2), encoding="utf-8"
    )
    print("ids guardados en _qa_fase3_eventos.json")


def cleanup() -> None:
    print(f"eventos propios borrados: {borrar_propios()}")
    archivo = RAIZ / "_qa_fase3_eventos.json"
    if archivo.exists():
        archivo.unlink()
    print("limpieza de eventos terminada")


if __name__ == "__main__":
    accion = sys.argv[1] if len(sys.argv) > 1 else ""
    if accion == "create":
        main()
    elif accion == "cleanup":
        cleanup()
    else:
        print("uso: create | cleanup")
        raise SystemExit(2)
