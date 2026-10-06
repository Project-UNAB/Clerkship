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
