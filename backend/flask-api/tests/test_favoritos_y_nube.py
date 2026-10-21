"""Favoritos de la biblioteca y «Guardar en mi nube» desde la biblioteca."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.almacenamiento as almacenamiento_routes
import app.routes.articulos as articulos_routes
from app.models import Article

AUTOR = uuid.UUID("11111111-1111-1111-1111-111111111111")
LECTOR = uuid.UUID("22222222-2222-2222-2222-222222222222")
OTRO = uuid.UUID("33333333-3333-3333-3333-333333333333")


def _h(app, role, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def _libro(estado="APROBADO"):
    return Article(id=uuid.uuid4(), type="LIBRO", title='Guía: "Gastritis"/2024', url="/x", estado=estado,
                   created_by=AUTOR, publicado_por=AUTOR, archivo_key="biblioteca/x.pdf")


@pytest.fixture
def favoritos(app, monkeypatch):
    libro = _libro()
    filas = {}

    class FavoritoFalso:
        query = SimpleNamespace(
            get=lambda clave: filas.get(clave),
            filter_by=lambda user_id: SimpleNamespace(all=lambda: [f for (u, _a), f in filas.items() if u == user_id]),
        )

        def __init__(self, user_id, article_id):
            self.user_id, self.article_id = user_id, article_id

    sesion = SimpleNamespace(add=lambda f: filas.__setitem__((f.user_id, f.article_id), f),
                             delete=lambda f: filas.pop((f.user_id, f.article_id)), commit=lambda: None)
    monkeypatch.setattr(articulos_routes, "ArticleFavorite", FavoritoFalso)
    monkeypatch.setattr(articulos_routes, "Article", SimpleNamespace(query=SimpleNamespace(get=lambda aid: libro if aid == libro.id else None)))
    monkeypatch.setattr(articulos_routes, "db", SimpleNamespace(session=sesion))
    return libro, filas


def test_marcar_listar_y_quitar_favorito(app, client, favoritos):
    libro, filas = favoritos
    h = _h(app, "STUDENT", LECTOR)
    assert client.put(f"/api/articulos/{libro.id}/favorito", headers=h).get_json()["favorito"] is True
    assert client.put(f"/api/articulos/{libro.id}/favorito", headers=h).status_code == 200  # idempotente
    assert len(filas) == 1
    assert client.get("/api/articulos/favoritos", headers=h).get_json() == {"favoritos": [str(libro.id)]}
    assert client.get("/api/articulos/favoritos", headers=_h(app, "TEACHER", OTRO)).get_json() == {"favoritos": []}
    assert client.delete(f"/api/articulos/{libro.id}/favorito", headers=h).get_json()["favorito"] is False
    assert filas == {}


def test_no_se_marca_un_libro_que_no_se_puede_ver(app, client, favoritos):
    libro, filas = favoritos
    libro.estado = "PENDIENTE"
    assert client.put(f"/api/articulos/{libro.id}/favorito", headers=_h(app, "STUDENT", LECTOR)).status_code == 404
    assert client.put(f"/api/articulos/{uuid.uuid4()}/favorito", headers=_h(app, "STUDENT", LECTOR)).status_code == 404
    assert filas == {}


@pytest.fixture
def nube(app, monkeypatch):
    libro = _libro()
    creados, copias, borrados = [], [], []
    monkeypatch.setattr(almacenamiento_routes, "Article", SimpleNamespace(query=SimpleNamespace(get=lambda aid: libro if aid == libro.id else None)))
    monkeypatch.setattr(almacenamiento_routes.storage, "tamano_real", lambda clave: 4096)
    monkeypatch.setattr(almacenamiento_routes.storage, "copiar", lambda o, d: copias.append((o, d)))
    monkeypatch.setattr(almacenamiento_routes.storage, "borrar", lambda c: borrados.append(c))
    monkeypatch.setattr(almacenamiento_routes, "_espacio_usado", lambda owner: 0)
    monkeypatch.setattr(almacenamiento_routes, "db", SimpleNamespace(session=SimpleNamespace(
        add=lambda a: creados.append(a), commit=lambda: None, rollback=lambda: None)))
    return libro, creados, copias


def test_guardar_en_mi_nube_copia_dentro_de_r2(app, client, nube):
    libro, creados, copias = nube
    res = client.post(f"/api/almacenamiento/biblioteca/{libro.id}/guardar", headers=_h(app, "STUDENT", LECTOR))
    assert res.status_code == 201
    archivo = creados[0]
    assert archivo.owner_id == LECTOR and archivo.estado == "LISTO" and archivo.size_bytes == 4096
    assert archivo.nombre == "Guía Gastritis2024.pdf"
    assert copias == [("biblioteca/x.pdf", archivo.storage_key)]
    assert archivo.storage_key.startswith(f"usuarios/{LECTOR}/")


def test_guardar_sin_espacio_da_413_y_no_copia(app, client, nube, monkeypatch):
    libro, creados, copias = nube
    monkeypatch.setattr(almacenamiento_routes, "_espacio_usado", lambda owner: almacenamiento_routes.storage.QUOTA_BYTES_PER_USER)
    res = client.post(f"/api/almacenamiento/biblioteca/{libro.id}/guardar", headers=_h(app, "STUDENT", LECTOR))
    assert res.status_code == 413
    assert creados == [] and copias == []


def test_guardar_un_libro_en_revision_ajeno_da_404(app, client, nube):
    libro, creados, _ = nube
    libro.estado = "PENDIENTE"
    assert client.post(f"/api/almacenamiento/biblioteca/{libro.id}/guardar", headers=_h(app, "STUDENT", LECTOR)).status_code == 404
    assert client.post(f"/api/almacenamiento/biblioteca/{libro.id}/guardar", headers=_h(app, "TEACHER", AUTOR)).status_code == 201
