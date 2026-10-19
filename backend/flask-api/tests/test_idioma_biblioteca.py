"""Idioma de los recursos de la biblioteca: se guarda al publicar, se edita y
filtra el listado."""
import uuid

from flask_jwt_extended import create_access_token

import app.routes.articulos as articulos_routes
from app.models import Article
from app.routes.almacenamiento import PublicarRequest
from app.schemas import ActualizarArticuloRequest

ADMIN = uuid.UUID("22222222-2222-2222-2222-222222222222")


def _headers(app, role, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def test_publicar_y_editar_aceptan_solo_es_o_en():
    assert PublicarRequest(idioma="es").idioma == "es"
    assert ActualizarArticuloRequest(idioma="en").idioma == "en"
    for malo in ("fr", "español", ""):
        try:
            PublicarRequest(idioma=malo)
        except Exception:
            continue
        raise AssertionError(f"aceptó idioma={malo!r}")


def test_to_dict_incluye_el_idioma():
    a = Article(id=uuid.uuid4(), type="LIBRO", title="Libro", url="/x", estado="APROBADO", language="es")
    assert a.to_dict()["idioma"] == "es"


def test_editar_cambia_el_idioma(app, client, monkeypatch):
    libro = Article(id=uuid.uuid4(), type="LIBRO", title="Libro", url="/x", estado="APROBADO", language="en", publicado_por=ADMIN)
    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", type("Q", (), {"get": staticmethod(lambda _id: libro)})())
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(articulos_routes, "_tags_for", lambda _id: [])
        res = client.patch(f"/api/articulos/{libro.id}", json={"idioma": "es"}, headers=_headers(app, "ADMIN", ADMIN))
    assert res.status_code == 200
    assert res.get_json()["idioma"] == "es" and libro.language == "es"
