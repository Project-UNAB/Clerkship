"""Portada de los libros de la biblioteca: imagen vertical (2:3) que pone el
autor o el administrador, procesada igual que las portadas de los cursos."""
import io
import uuid
from types import SimpleNamespace

from flask_jwt_extended import create_access_token
from PIL import Image

import app.routes.articulos as articulos_routes
from app.models import Article
from app.services import portadas


def _headers(app, role, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def _imagen(ancho, alto, formato="PNG"):
    salida = io.BytesIO()
    Image.new("RGB", (ancho, alto), (30, 90, 160)).save(salida, format=formato)
    return salida.getvalue()


def _preparar(app, monkeypatch, articulo):
    subidos = {}
    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: articulo))
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(articulos_routes, "_tags_for", lambda _id: [])
        monkeypatch.setattr(articulos_routes.storage, "subir_bytes", lambda clave, datos, mime: subidos.__setitem__(clave, datos))
        monkeypatch.setattr(articulos_routes.storage, "borrar", lambda clave: subidos.setdefault("_borrados", []).append(clave))
        monkeypatch.setattr(articulos_routes.storage, "url_imagen", lambda clave, **_k: f"https://r2.example/{clave}")
    return subidos


def test_el_autor_pone_una_portada_horizontal_y_queda_vertical_2_3(app, client, monkeypatch):
    autor = uuid.uuid4()
    articulo = Article(id=uuid.uuid4(), type="GUIA", title="Guía", url="/x", publicado_por=autor, estado="APROBADO")
    subidos = _preparar(app, monkeypatch, articulo)

    res = client.post(
        f"/api/articulos/{articulo.id}/portada",
        data={"cover": (io.BytesIO(_imagen(1600, 900)), "portada.png"), "focus_x": "0.3", "focus_y": "0.5"},
        content_type="multipart/form-data",
        headers=_headers(app, "TEACHER", autor),
    )
    assert res.status_code == 200
    portada = next(v for k, v in subidos.items() if k.endswith(".webp") and "_thumb" not in k)
    assert Image.open(io.BytesIO(portada)).size == portadas.PORTADA_LIBRO_TAMANO
    assert articulo.portada_key.startswith("biblioteca/portadas/")
    assert res.get_json()["portada_url"].endswith("_thumb.webp")
    # Cambiar la portada de algo aprobado lo devuelve a revisión.
    assert articulo.estado == "PENDIENTE"


def test_otro_usuario_no_puede_poner_la_portada(app, client, monkeypatch):
    articulo = Article(id=uuid.uuid4(), type="GUIA", title="Guía", url="/x", publicado_por=uuid.uuid4(), estado="APROBADO")
    _preparar(app, monkeypatch, articulo)
    res = client.post(
        f"/api/articulos/{articulo.id}/portada",
        data={"cover": (io.BytesIO(_imagen(600, 900)), "p.png")},
        content_type="multipart/form-data",
        headers=_headers(app, "STUDENT", uuid.uuid4()),
    )
    assert res.status_code == 403
    assert articulo.portada_key is None


def test_un_archivo_que_no_es_imagen_se_rechaza(app, client, monkeypatch):
    autor = uuid.uuid4()
    articulo = Article(id=uuid.uuid4(), type="GUIA", title="Guía", url="/x", publicado_por=autor, estado="PENDIENTE")
    _preparar(app, monkeypatch, articulo)
    res = client.post(
        f"/api/articulos/{articulo.id}/portada",
        data={"cover": (io.BytesIO(b"%PDF-1.4 no soy una imagen"), "falsa.png")},
        content_type="multipart/form-data",
        headers=_headers(app, "TEACHER", autor),
    )
    assert res.status_code in (400, 415)
    assert articulo.portada_key is None


def test_reemplazar_la_portada_borra_la_anterior_despues_de_guardar(app, client, monkeypatch):
    admin = uuid.uuid4()
    articulo = Article(id=uuid.uuid4(), type="LIBRO", title="Libro", url="/x", publicado_por=uuid.uuid4(),
                       estado="APROBADO", portada_key="biblioteca/portadas/vieja.webp")
    subidos = _preparar(app, monkeypatch, articulo)
    res = client.post(
        f"/api/articulos/{articulo.id}/portada",
        data={"cover": (io.BytesIO(_imagen(600, 900, "JPEG")), "nueva.jpg")},
        content_type="multipart/form-data",
        headers=_headers(app, "ADMIN", admin),
    )
    assert res.status_code == 200
    assert subidos["_borrados"] == ["biblioteca/portadas/vieja.webp", "biblioteca/portadas/vieja_thumb.webp"]
    # Lo que cambia el ADMIN conserva su estado.
    assert articulo.estado == "APROBADO"
