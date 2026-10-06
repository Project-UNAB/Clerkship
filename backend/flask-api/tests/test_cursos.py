"""Cursos: solo el docente dueño ve el roster o puede borrar su curso."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.cursos as cursos_routes


def _token(app, role, identity="11111111-1111-1111-1111-111111111111"):
    with app.app_context():
        return create_access_token(identity=identity, additional_claims={"role": role})


def test_listar_estudiantes_requiere_sesion(client):
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes")
    assert res.status_code == 401


def test_listar_estudiantes_rechaza_rol_estudiante(app, client):
    headers = {"Authorization": f"Bearer {_token(app, 'STUDENT')}"}
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes", headers=headers)
    assert res.status_code == 403


def test_listar_estudiantes_curso_inexistente_da_404(app, client, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: None))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes", headers=headers)
    assert res.status_code == 404


def test_listar_estudiantes_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    otro_docente_id = uuid.uuid4()
    curso_falso = SimpleNamespace(id=uuid.uuid4(), teacher_id=otro_docente_id)
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso_falso))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.get(f"/api/cursos/{curso_falso.id}/estudiantes", headers=headers)
    assert res.status_code == 403


def test_agregar_estudiante_requiere_sesion(client):
    res = client.post("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes", json={"email": "x@x.com"})
    assert res.status_code == 401


def test_agregar_estudiante_rechaza_rol_estudiante(app, client):
    headers = {"Authorization": f"Bearer {_token(app, 'STUDENT')}"}
    res = client.post("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes", json={"email": "x@x.com"}, headers=headers)
    assert res.status_code == 403


def test_agregar_estudiante_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso_falso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso_falso))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.post(f"/api/cursos/{curso_falso.id}/estudiantes", json={"email": "x@x.com"}, headers=headers)
    assert res.status_code == 403


def test_agregar_estudiante_con_correo_inexistente_da_404(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cursos_routes.User, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: None)))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=str(docente_id))}"}
    res = client.post(f"/api/cursos/{curso.id}/estudiantes", json={"email": "nadie@clerk-ship.online"}, headers=headers)
    assert res.status_code == 404


def test_quitar_estudiante_requiere_sesion(client):
    res = client.delete("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes/22222222-2222-2222-2222-222222222222")
    assert res.status_code == 401


def test_quitar_estudiante_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso_falso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso_falso))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.delete(f"/api/cursos/{curso_falso.id}/estudiantes/22222222-2222-2222-2222-222222222222", headers=headers)
    assert res.status_code == 403


def test_borrar_curso_requiere_sesion(client):
    res = client.delete("/api/cursos/11111111-1111-1111-1111-111111111111")
    assert res.status_code == 401


def test_borrar_curso_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso_falso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso_falso))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.delete(f"/api/cursos/{curso_falso.id}", headers=headers)
    assert res.status_code == 403
