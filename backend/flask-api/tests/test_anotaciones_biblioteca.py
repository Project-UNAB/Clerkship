"""Anotaciones de los libros de la biblioteca: cada usuario guarda y lee solo
las suyas, solo en libros que puede ver, y los trazos se validan."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.anotaciones as anotaciones_routes
from app.models import Article

AUTOR = uuid.UUID("11111111-1111-1111-1111-111111111111")
LECTOR_A = uuid.UUID("22222222-2222-2222-2222-222222222222")
LECTOR_B = uuid.UUID("33333333-3333-3333-3333-333333333333")
TRAZO = {"herramienta": "lapiz", "color": "#E11D48", "grosor": 0.004, "puntos": [[0.1, 0.2], [0.15, 0.22]]}


def _headers(app, role, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


class _FilaFalsa(SimpleNamespace):
    pass


@pytest.fixture
def entorno(app, monkeypatch):
    """Un libro y una tabla de anotaciones en memoria, sin tocar la base."""
    libro = Article(id=uuid.uuid4(), type="LIBRO", title="Libro", url="/x", estado="APROBADO",
                    created_by=AUTOR, publicado_por=AUTOR)
    filas = {}

    class Consulta:
        def get(self, clave):
            return filas.get(clave)

        def filter_by(self, user_id, article_id):
            return SimpleNamespace(all=lambda: [f for (u, a, _p), f in filas.items() if u == user_id and a == article_id])

    def crear_fila(user_id, article_id, page, strokes):
        return _FilaFalsa(user_id=user_id, article_id=article_id, page=page, strokes=strokes)

    crear_fila.query = Consulta()
    sesion = SimpleNamespace(
        add=lambda f: filas.__setitem__((f.user_id, f.article_id, f.page), f),
        delete=lambda f: filas.pop((f.user_id, f.article_id, f.page)),
        commit=lambda: None,
    )
    monkeypatch.setattr(anotaciones_routes, "ArticleAnnotation", crear_fila)
    monkeypatch.setattr(anotaciones_routes, "Article", SimpleNamespace(query=SimpleNamespace(
        get=lambda aid: libro if aid == libro.id else None)))
    monkeypatch.setattr(anotaciones_routes, "db", SimpleNamespace(session=sesion))
    return libro, filas


def test_cada_usuario_ve_solo_sus_anotaciones(app, client, entorno):
    libro, _ = entorno
    url = f"/api/articulos/{libro.id}/anotaciones"
    res = client.put(f"{url}/3", json={"trazos": [TRAZO]}, headers=_headers(app, "STUDENT", LECTOR_A))
    assert res.status_code == 200 and res.get_json() == {"pagina": 3, "trazos": 1}

    propias = client.get(url, headers=_headers(app, "STUDENT", LECTOR_A)).get_json()
    assert list(propias["paginas"]) == ["3"]
    assert propias["paginas"]["3"][0]["puntos"] == [[0.1, 0.2], [0.15, 0.22]]

    ajenas = client.get(url, headers=_headers(app, "STUDENT", LECTOR_B)).get_json()
    assert ajenas == {"paginas": {}}


def test_guardar_lista_vacia_limpia_la_pagina_y_reemplaza(app, client, entorno):
    libro, filas = entorno
    url = f"/api/articulos/{libro.id}/anotaciones/1"
    h = _headers(app, "STUDENT", LECTOR_A)
    client.put(url, json={"trazos": [TRAZO, TRAZO]}, headers=h)
    client.put(url, json={"trazos": [TRAZO]}, headers=h)
    assert len(filas[(LECTOR_A, libro.id, 1)].strokes) == 1
    assert client.put(url, json={"trazos": []}, headers=h).status_code == 200
    assert filas == {}


def test_libro_en_revision_solo_lo_anotan_autor_y_admin(app, client, entorno):
    libro, _ = entorno
    libro.estado = "PENDIENTE"
    url = f"/api/articulos/{libro.id}/anotaciones/1"
    assert client.put(url, json={"trazos": [TRAZO]}, headers=_headers(app, "STUDENT", LECTOR_A)).status_code == 404
    assert client.put(url, json={"trazos": [TRAZO]}, headers=_headers(app, "TEACHER", AUTOR)).status_code == 200
    assert client.put(url, json={"trazos": [TRAZO]}, headers=_headers(app, "ADMIN", LECTOR_B)).status_code == 200


@pytest.mark.parametrize("trazo", [
    {**TRAZO, "herramienta": "tijeras"},
    {**TRAZO, "color": "red"},
    {**TRAZO, "grosor": 0.5},
    {**TRAZO, "puntos": [[1.5, 0.2]]},
    {**TRAZO, "puntos": [[0.1, 0.2, 0.3]]},
    {**TRAZO, "puntos": []},
])
def test_trazos_invalidos_dan_400(app, client, entorno, trazo):
    libro, filas = entorno
    res = client.put(f"/api/articulos/{libro.id}/anotaciones/1", json={"trazos": [trazo]},
                     headers=_headers(app, "STUDENT", LECTOR_A))
    assert res.status_code == 400
    assert filas == {}


@pytest.mark.parametrize("pagina", ["0", "10001", "abc"])
def test_pagina_fuera_de_rango_da_400(app, client, entorno, pagina):
    libro, _ = entorno
    res = client.put(f"/api/articulos/{libro.id}/anotaciones/{pagina}", json={"trazos": [TRAZO]},
                     headers=_headers(app, "STUDENT", LECTOR_A))
    assert res.status_code == 400


def test_libro_inexistente_da_404(app, client, entorno):
    res = client.get(f"/api/articulos/{uuid.uuid4()}/anotaciones", headers=_headers(app, "STUDENT", LECTOR_A))
    assert res.status_code == 404
