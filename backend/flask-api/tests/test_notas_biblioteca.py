"""Notas y comentarios en los libros de la biblioteca: cada usuario crea, ve,
edita y borra solo las suyas, en libros que puede ver, y se validan."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.anotaciones as anotaciones_routes
from app.models import Article, ArticleNote

AUTOR = uuid.UUID("11111111-1111-1111-1111-111111111111")
LECTOR_A = uuid.UUID("22222222-2222-2222-2222-222222222222")
LECTOR_B = uuid.UUID("33333333-3333-3333-3333-333333333333")
NOTA = {"pagina": 3, "rect": {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.1}, "cita": "La gastritis es…", "texto": "Repasar"}


def _h(app, role, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def entorno(app, monkeypatch):
    """Un libro y una tabla de notas en memoria, sin tocar la base."""
    libro = Article(id=uuid.uuid4(), type="LIBRO", title="Libro", url="/x", estado="APROBADO",
                    created_by=AUTOR, publicado_por=AUTOR)
    notas = {}

    class Consulta:
        def __init__(self, filtro=None):
            self.filtro = filtro or {}

        def filter_by(self, **kw):
            return Consulta({**self.filtro, **kw})

        def _todas(self):
            return [n for n in notas.values() if all(getattr(n, k) == v for k, v in self.filtro.items())]

        def order_by(self, *_a):
            return self

        def all(self):
            return sorted(self._todas(), key=lambda n: n.page)

        def first(self):
            t = self._todas()
            return t[0] if t else None

    class NotaFalsa:
        """Como ArticleNote, pero en memoria (y con su mismo to_dict)."""
        query = Consulta()
        to_dict = ArticleNote.to_dict
        # Columnas que la ruta usa para ordenar (order_by(page.asc(), created_at.asc()))
        page = created_at = SimpleNamespace(asc=lambda: None)

        def __init__(self, **campos):
            self.created_at = self.updated_at = None
            self.__dict__.update(campos)

    sesion = SimpleNamespace(add=lambda n: notas.__setitem__(n.id, n), delete=lambda n: notas.pop(n.id), commit=lambda: None)
    monkeypatch.setattr(anotaciones_routes, "ArticleNote", NotaFalsa)
    monkeypatch.setattr(anotaciones_routes, "Article", SimpleNamespace(query=SimpleNamespace(
        get=lambda aid: libro if aid == libro.id else None)))
    monkeypatch.setattr(anotaciones_routes, "db", SimpleNamespace(session=sesion))
    return libro, notas


def test_crear_listar_editar_y_borrar(app, client, entorno):
    libro, notas = entorno
    url = f"/api/articulos/{libro.id}/notas"
    h = _h(app, "STUDENT", LECTOR_A)
    res = client.post(url, json=NOTA, headers=h)
    assert res.status_code == 201
    nota = res.get_json()
    assert nota["pagina"] == 3 and nota["cita"] == "La gastritis es…" and nota["texto"] == "Repasar"
    assert nota["color"] == "#FACC15"

    lista = client.get(url, headers=h).get_json()["notas"]
    assert [n["id"] for n in lista] == [nota["id"]]

    res = client.patch(f"{url}/{nota['id']}", json={"texto": "Repasar para el parcial", "color": "#60A5FA"}, headers=h)
    assert res.status_code == 200 and res.get_json()["texto"] == "Repasar para el parcial"
    assert res.get_json()["color"] == "#60A5FA"

    assert client.delete(f"{url}/{nota['id']}", headers=h).status_code == 200
    assert notas == {}


def test_otro_usuario_no_ve_ni_toca_las_notas_ajenas(app, client, entorno):
    libro, notas = entorno
    url = f"/api/articulos/{libro.id}/notas"
    nota = client.post(url, json=NOTA, headers=_h(app, "STUDENT", LECTOR_A)).get_json()
    otro = _h(app, "STUDENT", LECTOR_B)
    assert client.get(url, headers=otro).get_json() == {"notas": []}
    assert client.patch(f"{url}/{nota['id']}", json={"texto": "x"}, headers=otro).status_code == 404
    assert client.delete(f"{url}/{nota['id']}", headers=otro).status_code == 404
    assert len(notas) == 1


def test_libro_en_revision_solo_autor_y_admin(app, client, entorno):
    libro, _ = entorno
    libro.estado = "PENDIENTE"
    url = f"/api/articulos/{libro.id}/notas"
    assert client.post(url, json=NOTA, headers=_h(app, "STUDENT", LECTOR_A)).status_code == 404
    assert client.post(url, json=NOTA, headers=_h(app, "TEACHER", AUTOR)).status_code == 201


@pytest.mark.parametrize("cambio", [
    {"rect": {"x": 0.8, "y": 0.2, "w": 0.5, "h": 0.1}},   # se sale de la página
    {"rect": {"x": 0.1, "y": 0.2, "w": 0, "h": 0.1}},     # sin ancho
    {"pagina": 0},
    {"color": "#000000"},
    {"texto": "x" * 5001},
    {"cita": "x" * 2001},
])
def test_notas_invalidas_dan_400(app, client, entorno, cambio):
    libro, notas = entorno
    res = client.post(f"/api/articulos/{libro.id}/notas", json={**NOTA, **cambio}, headers=_h(app, "STUDENT", LECTOR_A))
    assert res.status_code == 400
    assert notas == {}


def test_nota_inexistente_da_404(app, client, entorno):
    libro, _ = entorno
    h = _h(app, "STUDENT", LECTOR_A)
    assert client.patch(f"/api/articulos/{libro.id}/notas/{uuid.uuid4()}", json={"texto": "x"}, headers=h).status_code == 404
    assert client.delete(f"/api/articulos/{libro.id}/notas/no-es-un-id", headers=h).status_code == 404
