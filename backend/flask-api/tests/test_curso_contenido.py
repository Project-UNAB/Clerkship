"""Material de curso (bloques y contenido): permisos (docente dueño /
estudiante matriculado) y validación de los distintos tipos de contenido.
No toca la base real ni R2 — todo con monkeypatch."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.curso_contenido as cc_routes


def _token(app, role, identity="11111111-1111-1111-1111-111111111111"):
    with app.app_context():
        return create_access_token(identity=identity, additional_claims={"role": role})


def _headers(app, role, identity="11111111-1111-1111-1111-111111111111"):
    return {"Authorization": f"Bearer {_token(app, role, identity)}"}


@pytest.mark.parametrize("method,path", [
    ("get", "/api/cursos/11111111-1111-1111-1111-111111111111/bloques"),
    ("post", "/api/cursos/11111111-1111-1111-1111-111111111111/bloques"),
])
def test_bloques_requiere_sesion(client, method, path):
    res = getattr(client, method)(path, json={})
    assert res.status_code == 401


def test_listar_bloques_curso_inexistente_da_404(app, client, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: None))
    headers = _headers(app, "TEACHER")
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/bloques", headers=headers)
    assert res.status_code == 404


def test_listar_bloques_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
    headers = _headers(app, "TEACHER")
    res = client.get(f"/api/cursos/{curso.id}/bloques", headers=headers)
    assert res.status_code == 403


def test_listar_bloques_rechaza_estudiante_no_matriculado(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: None)))
    headers = _headers(app, "STUDENT")
    res = client.get(f"/api/cursos/{curso.id}/bloques", headers=headers)
    assert res.status_code == 403


def test_listar_bloques_permite_estudiante_matriculado(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))
        monkeypatch.setattr(
            cc_routes.CourseBlock,
            "query",
            SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(order_by=lambda *a: SimpleNamespace(all=lambda: []))),
        )
    headers = _headers(app, "STUDENT")
    res = client.get(f"/api/cursos/{curso.id}/bloques", headers=headers)
    assert res.status_code == 200
    assert res.get_json() == {"bloques": []}


def test_crear_bloque_rechaza_estudiante(app, client):
    headers = _headers(app, "STUDENT")
    res = client.post(
        "/api/cursos/11111111-1111-1111-1111-111111111111/bloques",
        json={"title": "Semana 1"},
        headers=headers,
    )
    assert res.status_code == 403


def test_crear_bloque_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
    headers = _headers(app, "TEACHER")
    res = client.post(f"/api/cursos/{curso.id}/bloques", json={"title": "Semana 1"}, headers=headers)
    assert res.status_code == 403


def test_crear_bloque_exitoso(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(
            cc_routes.db.session,
            "query",
            lambda *a: SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(scalar=lambda: -1)),
        )
        monkeypatch.setattr(cc_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cc_routes.db.session, "commit", lambda: None)

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques",
        json={"title": "Semana 1: Dolor abdominal", "description": "Material introductorio"},
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["title"] == "Semana 1: Dolor abdominal"
    assert body["position"] == 0
    assert body["contenido"] == []


def test_crear_contenido_rechaza_tipo_invalido(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloque = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: bloque)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{bloque.id}/contenido",
        json={"type": "AUDIO", "title": "Algo"},
        headers=headers,
    )
    assert res.status_code == 400


def test_crear_contenido_video_sin_url_da_400(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloque = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: bloque)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{bloque.id}/contenido",
        json={"type": "VIDEO", "title": "Caso en video"},
        headers=headers,
    )
    assert res.status_code == 400


def test_crear_contenido_video_exitoso(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloque = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: bloque)))
        monkeypatch.setattr(
            cc_routes.db.session,
            "query",
            lambda *a: SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(scalar=lambda: -1)),
        )
        monkeypatch.setattr(cc_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cc_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(cc_routes.UserFile, "query", SimpleNamespace(get=lambda _id: None))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{bloque.id}/contenido",
        json={"type": "VIDEO", "title": "Caso en video", "video_url": "https://youtube.com/watch?v=abc"},
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["type"] == "VIDEO"
    assert body["video_url"] == "https://youtube.com/watch?v=abc"


def test_obtener_archivo_contenido_no_documento_da_404(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item_texto = SimpleNamespace(id=uuid.uuid4(), type="TEXT", file_id=None)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item_texto)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.get(
        f"/api/cursos/{curso.id}/bloques/11111111-1111-1111-1111-111111111111/contenido/{item_texto.id}/archivo",
        headers=headers,
    )
    assert res.status_code == 404
