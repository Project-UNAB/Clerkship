"""Página de perfil: datos de la cuenta, ficha académica y descarga de los datos propios."""
import uuid
from types import SimpleNamespace

from flask_jwt_extended import create_access_token

import app.routes.usuarios as usuarios_routes
from app.models import User


def _usuario(role="STUDENT"):
    return User(id=uuid.uuid4(), username="perfil", first_name="Ana", last_name="Ríos", email="a@unab.edu.co",
                password_hash="x", role=role)


def _cabecera(app, u):
    with app.app_context():
        token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
    return {"Authorization": f"Bearer {token}"}


def test_perfil_requiere_sesion(client):
    assert client.get("/api/usuarios/me/perfil").status_code == 401
    assert client.get("/api/usuarios/me/exportar").status_code == 401


def test_perfil_trae_la_ficha_del_estudiante(app, client, monkeypatch):
    u = _usuario()
    ficha = SimpleNamespace(student_code="U00123", semester=7)
    monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: u)
    monkeypatch.setattr(usuarios_routes, "_ficha_de", lambda user: (ficha, None))
    res = client.get("/api/usuarios/me/perfil", headers=_cabecera(app, u))
    assert res.status_code == 200
    datos = res.get_json()
    assert datos["estudiante"] == {"codigo": "U00123", "semestre": 7}
    assert datos["docente"] is None
    assert "password_hash" not in datos


def test_el_estudiante_cambia_su_semestre(app, client, monkeypatch):
    u = _usuario()
    ficha = SimpleNamespace(student_code="U00123", semester=7)
    monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: u)
    monkeypatch.setattr(usuarios_routes, "_ficha_de", lambda user: (ficha, None))
    monkeypatch.setattr(usuarios_routes.db.session, "commit", lambda: None)
    res = client.patch("/api/usuarios/me", json={"semestre": 8}, headers=_cabecera(app, u))
    assert res.status_code == 200
    assert ficha.semester == 8 and res.get_json()["estudiante"]["semestre"] == 8


def test_el_estudiante_no_tiene_departamento(app, client, monkeypatch):
    u = _usuario()
    monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: u)
    monkeypatch.setattr(usuarios_routes, "_ficha_de", lambda user: (SimpleNamespace(student_code="U1", semester=1), None))
    monkeypatch.setattr(usuarios_routes.db.session, "commit", lambda: None)
    res = client.patch("/api/usuarios/me", json={"departamento": "Medicina interna"}, headers=_cabecera(app, u))
    assert res.status_code == 400


def test_el_docente_cambia_y_borra_su_departamento(app, client, monkeypatch):
    u = _usuario("TEACHER")
    ficha = SimpleNamespace(department=None)
    monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: u)
    monkeypatch.setattr(usuarios_routes, "_ficha_de", lambda user: (None, ficha))
    monkeypatch.setattr(usuarios_routes.db.session, "commit", lambda: None)
    res = client.patch("/api/usuarios/me", json={"departamento": "  Gastroenterología "}, headers=_cabecera(app, u))
    assert res.status_code == 200 and ficha.department == "Gastroenterología"
    res = client.patch("/api/usuarios/me", json={"departamento": ""}, headers=_cabecera(app, u))
    assert res.status_code == 200 and ficha.department is None


def test_semestre_fuera_de_rango(app, client, monkeypatch):
    u = _usuario()
    monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: u)
    for malo in (0, 15):
        res = client.patch("/api/usuarios/me", json={"semestre": malo}, headers=_cabecera(app, u))
        assert res.status_code == 400


def test_exportar_del_administrador_no_consulta_cursos(app, client, monkeypatch):
    """Un administrador no tiene cursos ni simulaciones: sale solo su perfil, como adjunto."""
    u = _usuario("ADMIN")
    monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: u)
    monkeypatch.setattr(usuarios_routes, "_ficha_de", lambda user: (None, None))
    res = client.get("/api/usuarios/me/exportar", headers=_cabecera(app, u))
    assert res.status_code == 200
    assert "attachment" in res.headers["Content-Disposition"]
    datos = res.get_json()
    assert datos["perfil"]["email"] == "a@unab.edu.co"
    assert "avatar_svg" not in datos["perfil"] and "password_hash" not in datos["perfil"]
    assert datos["cursos"] == [] and datos["simulaciones"] == [] and datos["entregas"] == []
