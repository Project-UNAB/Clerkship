"""Pruebas de edición, retiro y paginación de recursos de la biblioteca médica."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.articulos as articulos_routes
from app.models import Article
from tests.fakes import ConsultaFalsa


def _headers(app, role: str, user_id: uuid.UUID) -> dict:
    with app.app_context():
        token = create_access_token(identity=str(user_id), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def test_autor_puede_editar_su_recurso(app, client, monkeypatch):
    autor_id = uuid.uuid4()
    art_id = uuid.uuid4()
    articulo = Article(
        id=art_id,
        type="GUIA",
        title="Título original",
        authors="Dr. Original",
        year=2020,
        pages=15,
        description="Descripción vieja",
        url="/library/original",
        created_by=autor_id,
        publicado_por=autor_id,
        estado="APROBADO",
    )

    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: articulo if str(_id) == str(art_id) else None))
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(articulos_routes, "_tags_for", lambda _id: ["GASTRO"])
        monkeypatch.setattr(articulos_routes, "_tags_de", lambda ids: {i: ["GASTRO"] for i in ids})

        payload = {
            "title": "Título actualizado",
            "authors": "Dra. Nueva, Dr. Coautor",
            "year": 2024,
            "pages": 25,
            "description": "Nueva descripción detallada",
        }
        res = client.patch(
            f"/api/articulos/{art_id}",
            json=payload,
            headers=_headers(app, "TEACHER", autor_id),
        )

        assert res.status_code == 200
        data = res.get_json()
        assert data["title"] == "Título actualizado"
        assert data["authors"] == "Dra. Nueva, Dr. Coautor"
        assert data["year"] == 2024
        assert data["pages"] == 25
        assert data["description"] == "Nueva descripción detallada"
        # La edición de un autor sobre un recurso APROBADO lo regresa a PENDIENTE
        assert data["estado"] == "PENDIENTE"
        assert articulo.estado == "PENDIENTE"


def test_admin_puede_editar_cualquier_recurso_y_conserva_aprobado(app, client, monkeypatch):
    autor_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    art_id = uuid.uuid4()
    articulo = Article(
        id=art_id,
        type="LIBRO",
        title="Libro clínico",
        authors="Autor externo",
        year=2021,
        pages=100,
        description="Texto base",
        url="/library/libro",
        created_by=autor_id,
        publicado_por=autor_id,
        estado="APROBADO",
    )

    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: articulo if str(_id) == str(art_id) else None))
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(articulos_routes, "_tags_for", lambda _id: [])
        monkeypatch.setattr(articulos_routes, "_tags_de", lambda ids: {i: [] for i in ids})

        res = client.patch(
            f"/api/articulos/{art_id}",
            json={"title": "Libro revisado por admin"},
            headers=_headers(app, "ADMIN", admin_id),
        )

        assert res.status_code == 200
        data = res.get_json()
        assert data["title"] == "Libro revisado por admin"
        # Como lo editó un ADMIN, no vuelve a PENDIENTE
        assert data["estado"] == "APROBADO"
        assert articulo.estado == "APROBADO"


def test_otro_usuario_no_puede_editar_recurso(app, client, monkeypatch):
    autor_id = uuid.uuid4()
    otro_id = uuid.uuid4()
    art_id = uuid.uuid4()
    articulo = Article(
        id=art_id,
        type="GUIA",
        title="Guía privada o ajena",
        url="/library/guia",
        created_by=autor_id,
        publicado_por=autor_id,
        estado="APROBADO",
    )

    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: articulo if str(_id) == str(art_id) else None))

        res = client.patch(
            f"/api/articulos/{art_id}",
            json={"title": "Intento de usurpación"},
            headers=_headers(app, "STUDENT", otro_id),
        )
        assert res.status_code == 403


def test_autor_puede_retirar_su_recurso_y_borra_en_r2(app, client, monkeypatch):
    autor_id = uuid.uuid4()
    art_id = uuid.uuid4()
    articulo = Article(
        id=art_id,
        type="GUIA",
        title="Guía con PDF",
        url="/library/guia-pdf",
        archivo_key="biblioteca/archivo_123.pdf",
        created_by=autor_id,
        publicado_por=autor_id,
        estado="APROBADO",
    )

    borrados_r2 = []
    borrados_db = []

    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: articulo if str(_id) == str(art_id) else None))
        monkeypatch.setattr(articulos_routes.storage, "borrar", lambda clave: borrados_r2.append(clave))
        monkeypatch.setattr(articulos_routes.ArticleTag, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(delete=lambda: None)))
        monkeypatch.setattr(articulos_routes.StudentLibrary, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(delete=lambda: None)))
        monkeypatch.setattr(articulos_routes.db.session, "delete", lambda obj: borrados_db.append(obj))
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: None)

        res = client.delete(f"/api/articulos/{art_id}", headers=_headers(app, "TEACHER", autor_id))
        assert res.status_code == 200
        assert borrados_r2 == ["biblioteca/archivo_123.pdf"]
        assert articulo in borrados_db


def test_otro_usuario_no_puede_retirar_recurso(app, client, monkeypatch):
    autor_id = uuid.uuid4()
    otro_id = uuid.uuid4()
    art_id = uuid.uuid4()
    articulo = Article(
        id=art_id,
        type="GUIA",
        title="Guía protegida",
        url="/library/guia",
        created_by=autor_id,
        publicado_por=autor_id,
        estado="APROBADO",
    )

    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: articulo if str(_id) == str(art_id) else None))

        res = client.delete(f"/api/articulos/{art_id}", headers=_headers(app, "STUDENT", otro_id))
        assert res.status_code == 403


def test_admin_puede_retirar_cualquier_recurso(app, client, monkeypatch):
    autor_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    art_id = uuid.uuid4()
    articulo = Article(
        id=art_id,
        type="GUIA",
        title="Guía a retirar por admin",
        url="/library/guia",
        created_by=autor_id,
        publicado_por=autor_id,
        estado="APROBADO",
    )

    borrados_db = []

    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: articulo if str(_id) == str(art_id) else None))
        monkeypatch.setattr(articulos_routes.ArticleTag, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(delete=lambda: None)))
        monkeypatch.setattr(articulos_routes.StudentLibrary, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(delete=lambda: None)))
        monkeypatch.setattr(articulos_routes.db.session, "delete", lambda obj: borrados_db.append(obj))
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: None)

        res = client.delete(f"/api/articulos/{art_id}", headers=_headers(app, "ADMIN", admin_id))
        assert res.status_code == 200
        assert articulo in borrados_db


def test_paginacion_opcional_articulos(app, client, monkeypatch):
    user_id = uuid.uuid4()
    arts = [
        Article(id=uuid.uuid4(), type="GUIA", title=f"Guía {i}", url=f"/library/{i}", estado="APROBADO")
        for i in range(5)
    ]

    consulta = ConsultaFalsa(todos=arts)

    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", consulta)
        monkeypatch.setattr(articulos_routes, "_tags_for", lambda _id: [])
        monkeypatch.setattr(articulos_routes, "_tags_de", lambda ids: {i: [] for i in ids})

        # 1. Sin parámetros de paginación -> lista plana (retrocompatibilidad)
        res_plano = client.get("/api/articulos", headers=_headers(app, "ADMIN", user_id))
        assert res_plano.status_code == 200
        assert isinstance(res_plano.get_json(), list)
        assert len(res_plano.get_json()) == 5

        # 2. Con parámetros de paginación -> diccionario con metadatos y lista 'articulos'
        res_pag = client.get("/api/articulos?page=1&per_page=2", headers=_headers(app, "ADMIN", user_id))
        assert res_pag.status_code == 200
        data = res_pag.get_json()
        assert isinstance(data, dict)
        assert "articulos" in data
        assert len(data["articulos"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1
        assert data["per_page"] == 2
        assert data["pages"] == 3


def test_corregir_un_recurso_rechazado_lo_devuelve_a_revision(app, client, monkeypatch):
    autor_id, art_id = uuid.uuid4(), uuid.uuid4()
    articulo = Article(
        id=art_id, type="GUIA", title="Guía rechazada", url="/library/x", created_by=autor_id,
        estado="RECHAZADO", motivo_rechazo="Falta bibliografía",
    )
    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: articulo))
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(articulos_routes, "_tags_for", lambda _id: [])
        monkeypatch.setattr(articulos_routes, "_tags_de", lambda ids: {i: [] for i in ids})
        res = client.patch(f"/api/articulos/{art_id}", json={"description": "Con bibliografía 2025"},
                           headers=_headers(app, "TEACHER", autor_id))
    assert res.status_code == 200
    assert articulo.estado == "PENDIENTE" and articulo.motivo_rechazo is None


def test_retirar_borra_el_pdf_solo_despues_de_confirmar(app, client, monkeypatch):
    autor_id, art_id = uuid.uuid4(), uuid.uuid4()
    articulo = Article(id=art_id, type="GUIA", title="Con PDF", url="/x", publicado_por=autor_id,
                       estado="APROBADO", archivo_key="biblioteca/x.pdf")
    orden = []
    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: articulo))
        monkeypatch.setattr(articulos_routes.db.session, "delete", lambda _o: orden.append("delete"))
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: orden.append("commit"))
        monkeypatch.setattr(articulos_routes.storage, "borrar", lambda clave: orden.append(f"r2:{clave}"))
        res = client.delete(f"/api/articulos/{art_id}", headers=_headers(app, "TEACHER", autor_id))
    assert res.status_code == 200
    assert orden == ["delete", "commit", "r2:biblioteca/x.pdf"]
