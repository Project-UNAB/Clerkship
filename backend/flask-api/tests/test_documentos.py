"""Carpeta de Documentos: ahora sube a R2 en vez de Mongo, manteniendo el
mismo contrato (nombre + base64). Pruebas de autenticación y validación,
sin tocar la base real ni R2."""
import base64
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token


@pytest.fixture
def headers(app):
    with app.app_context():
        token = create_access_token(
            identity="11111111-1111-1111-1111-111111111111",
            additional_claims={"role": "STUDENT"},
        )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("method,path", [
    ("get", "/api/documentos/carpetas"),
    ("get", "/api/documentos/documentos"),
    ("post", "/api/documentos/documentos"),
    ("get", "/api/documentos/documentos/11111111-1111-1111-1111-111111111111"),
    ("patch", "/api/documentos/documentos/11111111-1111-1111-1111-111111111111"),
    ("delete", "/api/documentos/documentos/11111111-1111-1111-1111-111111111111"),
])
def test_documentos_requiere_sesion(client, method, path):
    res = getattr(client, method)(path, json={})
    assert res.status_code == 401


def test_subir_documento_sin_contenido_responde_400(client, headers):
    res = client.post("/api/documentos/documentos", json={
        "name": "informe.pdf", "mime_type": "application/pdf",
    }, headers=headers)
    assert res.status_code == 400


def test_subir_documento_con_base64_invalido_responde_400(client, headers):
    res = client.post("/api/documentos/documentos", json={
        "name": "informe.pdf", "mime_type": "application/pdf", "data": "esto-no-es-base64-válido-¡!",
    }, headers=headers)
    assert res.status_code == 400


def test_subir_documento_acepta_base64_y_llega_a_r2(app, client, headers, monkeypatch):
    """No toca R2 ni la base: se reemplazan ambos por fakes. Solo confirma que
    pasa la validación y decodifica el contenido antes de intentar guardar."""
    import app.routes.documentos as documentos_routes

    usuario_falso = SimpleNamespace(id=uuid.UUID("11111111-1111-1111-1111-111111111111"))
    monkeypatch.setattr(documentos_routes, "get_current_user", lambda: usuario_falso)
    monkeypatch.setattr(documentos_routes.storage, "nueva_clave", lambda owner_id, mime: "usuarios/x/y.pdf")
    monkeypatch.setattr(documentos_routes.storage, "subir_bytes", lambda clave, contenido, mime: None)
    with app.app_context():
        monkeypatch.setattr(documentos_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(documentos_routes.db.session, "commit", lambda: None)

    contenido_b64 = base64.b64encode(b"contenido de prueba").decode("ascii")
    res = client.post("/api/documentos/documentos", json={
        "name": "informe.pdf", "mime_type": "application/pdf", "data": contenido_b64,
    }, headers=headers)
    assert res.status_code == 201
    body = res.get_json()
    assert body["document"]["origen"] == "r2"
    assert body["document"]["size_bytes"] == len(b"contenido de prueba")


def test_obtener_documento_inexistente_responde_404(client, headers):
    res = client.get("/api/documentos/documentos/000000000000000000000000", headers=headers)
    assert res.status_code == 404


def test_obtener_documento_con_id_no_valido_responde_404(client, headers):
    res = client.get("/api/documentos/documentos/no-es-un-id-valido", headers=headers)
    assert res.status_code == 404
