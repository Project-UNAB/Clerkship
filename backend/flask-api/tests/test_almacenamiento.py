"""Almacenamiento personal (R2): autenticación y validación de los endpoints.
No habla con R2 ni con la base real: solo prueba las reglas antes de llegar ahí."""
import pytest
from flask_jwt_extended import create_access_token

import app.routes.almacenamiento as almacenamiento_routes


@pytest.fixture
def headers(app):
    with app.app_context():
        token = create_access_token(
            identity="11111111-1111-1111-1111-111111111111",
            additional_claims={"role": "STUDENT"},
        )
    return {"Authorization": f"Bearer {token}"}


def test_uso_requiere_sesion(client):
    res = client.get("/api/almacenamiento/uso")
    assert res.status_code == 401


def test_listar_archivos_requiere_sesion(client):
    res = client.get("/api/almacenamiento/archivos")
    assert res.status_code == 401


def test_subida_requiere_sesion(client):
    res = client.post("/api/almacenamiento/subidas", json={
        "nombre": "informe.pdf", "mime_type": "application/pdf", "size_bytes": 1024,
    })
    assert res.status_code == 401


def test_subida_rechaza_tipo_no_permitido(client, headers):
    res = client.post("/api/almacenamiento/subidas", json={
        "nombre": "virus.exe", "mime_type": "application/x-msdownload", "size_bytes": 1024,
    }, headers=headers)
    assert res.status_code == 400


def test_subida_acepta_tipos_de_oficina_e_imagenes(app, client, headers, monkeypatch):
    """No toca la base ni R2: se reemplazan ambos por fakes, para probar solo
    que la validación de tipo y tamaño deja pasar estos formatos."""
    with app.app_context():
        monkeypatch.setattr(almacenamiento_routes, "_espacio_usado", lambda owner_id: 0)
        monkeypatch.setattr(almacenamiento_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(almacenamiento_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(almacenamiento_routes.db.session, "delete", lambda *a: None)
    for mime in ["application/msword", "application/vnd.ms-excel", "image/png", "text/plain"]:
        res = client.post("/api/almacenamiento/subidas", json={
            "nombre": "archivo", "mime_type": mime, "size_bytes": 1024,
        }, headers=headers)
        assert res.status_code in (201, 503), f"{mime} -> {res.status_code}"


def test_subida_rechaza_archivo_demasiado_pesado(client, headers):
    res = client.post("/api/almacenamiento/subidas", json={
        "nombre": "gigante.pdf", "mime_type": "application/pdf", "size_bytes": 200 * 1024 * 1024,
    }, headers=headers)
    assert res.status_code == 413


def test_actualizar_archivo_requiere_sesion(client):
    res = client.patch("/api/almacenamiento/archivos/11111111-1111-1111-1111-111111111111", json={"nombre": "x"})
    assert res.status_code == 401


class _SinResultados:
    def filter_by(self, **kwargs):
        return self

    def first(self):
        return None


def test_actualizar_archivo_inexistente_da_404(app, client, headers, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(almacenamiento_routes.UserFile, "query", _SinResultados())
    res = client.patch(
        "/api/almacenamiento/archivos/22222222-2222-2222-2222-222222222222",
        json={"nombre": "nuevo-nombre.pdf"},
        headers=headers,
    )
    assert res.status_code == 404


def test_publicar_requiere_sesion(client):
    res = client.post("/api/almacenamiento/archivos/11111111-1111-1111-1111-111111111111/publicar", json={})
    assert res.status_code == 401


def test_descarga_de_biblioteca_sin_articulo_da_404(app, client, headers, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(almacenamiento_routes.Article, "query", type("Q", (), {"get": staticmethod(lambda _id: None)})())
    res = client.get("/api/almacenamiento/biblioteca/33333333-3333-3333-3333-333333333333/descarga", headers=headers)
    assert res.status_code == 404
