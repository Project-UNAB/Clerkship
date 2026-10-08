"""Foro de avisos de curso: permisos (docente dueño publica/edita/borra,
cualquier matriculado comenta) y que el HTML se sanitice al guardar.
No toca la base real — todo con monkeypatch."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.curso_avisos as ca_routes


def _token(app, role, identity="11111111-1111-1111-1111-111111111111"):
    with app.app_context():
        return create_access_token(identity=identity, additional_claims={"role": role})


def _headers(app, role, identity="11111111-1111-1111-1111-111111111111"):
    return {"Authorization": f"Bearer {_token(app, role, identity)}"}


@pytest.mark.parametrize("method,path", [
    ("get", "/api/cursos/11111111-1111-1111-1111-111111111111/avisos"),
    ("post", "/api/cursos/11111111-1111-1111-1111-111111111111/avisos"),
])
def test_avisos_requiere_sesion(client, method, path):
    res = getattr(client, method)(path, json={})
    assert res.status_code == 401


def test_listar_avisos_curso_inexistente_da_404(app, client, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: None))
    headers = _headers(app, "TEACHER")
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/avisos", headers=headers)
    assert res.status_code == 404


def test_listar_avisos_rechaza_estudiante_no_matriculado(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(ca_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: None)))
    headers = _headers(app, "STUDENT")
    res = client.get(f"/api/cursos/{curso.id}/avisos", headers=headers)
    assert res.status_code == 403


def test_listar_avisos_permite_estudiante_matriculado(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(ca_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))
        monkeypatch.setattr(
            ca_routes.CourseAnnouncement,
            "query",
            SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(order_by=lambda *a: SimpleNamespace(all=lambda: []))),
        )
    headers = _headers(app, "STUDENT")
    res = client.get(f"/api/cursos/{curso.id}/avisos", headers=headers)
    assert res.status_code == 200
    assert res.get_json() == {"avisos": []}


def test_crear_aviso_rechaza_estudiante(app, client):
    headers = _headers(app, "STUDENT")
    res = client.post(
        "/api/cursos/11111111-1111-1111-1111-111111111111/avisos",
        json={"title": "Aviso", "body": "<p>hola</p>"},
        headers=headers,
    )
    assert res.status_code == 403


def test_crear_aviso_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
    headers = _headers(app, "TEACHER")
    res = client.post(f"/api/cursos/{curso.id}/avisos", json={"title": "Aviso", "body": "<p>hola</p>"}, headers=headers)
    assert res.status_code == 403


def test_crear_aviso_exitoso_sanitiza_html(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    docente = SimpleNamespace(id=docente_id, first_name="Ana", last_name="Pérez", role="TEACHER")
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(ca_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(ca_routes.db.session, "commit", lambda: None)

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/avisos",
        json={"title": "Entrega 1 abierta", "body": "<p>hola</p><script>alert(1)</script>", "pinned": True},
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["title"] == "Entrega 1 abierta"
    assert "<script>" not in body["body"]
    assert "<p>hola</p>" in body["body"]
    assert body["pinned"] is True
    assert body["author_name"] == "Ana Pérez"


def test_borrar_aviso_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
    headers = _headers(app, "TEACHER")
    res = client.delete(
        f"/api/cursos/{curso.id}/avisos/11111111-1111-1111-1111-111111111111",
        headers=headers,
    )
    assert res.status_code == 403


def test_crear_comentario_requiere_acceso_al_curso(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(ca_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: None)))
    headers = _headers(app, "STUDENT")
    res = client.post(
        f"/api/cursos/{curso.id}/avisos/11111111-1111-1111-1111-111111111111/comentarios",
        json={"content": "Gracias!"},
        headers=headers,
    )
    assert res.status_code == 403


def test_crear_comentario_exitoso(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    aviso = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    estudiante = SimpleNamespace(id=estudiante_id, first_name="Luis", last_name="Gómez", role="STUDENT")
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: estudiante)
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(ca_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))
        monkeypatch.setattr(ca_routes.CourseAnnouncement, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: aviso)))
        monkeypatch.setattr(ca_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(ca_routes.db.session, "commit", lambda: None)

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.post(
        f"/api/cursos/{curso.id}/avisos/{aviso.id}/comentarios",
        json={"content": "Gracias por el aviso!"},
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["content"] == "Gracias por el aviso!"
    assert body["author_name"] == "Luis Gómez"


def test_borrar_comentario_rechaza_ajeno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    comentario = SimpleNamespace(id=uuid.uuid4(), announcement_id=uuid.uuid4(), author_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(ca_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))
        monkeypatch.setattr(ca_routes.CourseAnnouncementComment, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: comentario)))
    headers = _headers(app, "STUDENT")
    res = client.delete(
        f"/api/cursos/{curso.id}/avisos/{comentario.announcement_id}/comentarios/{comentario.id}",
        headers=headers,
    )
    assert res.status_code == 403
