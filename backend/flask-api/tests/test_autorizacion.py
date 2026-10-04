"""Autorización por recurso: pruebas sin base de datos."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.utils as utils
import app.routes.usuarios as usuarios_routes


def _course_stub(teacher_id):
    class _Q:
        @staticmethod
        def get(_):
            return SimpleNamespace(teacher_id=teacher_id)
    return SimpleNamespace(query=_Q)


def test_estudiante_solo_ve_sus_consultas(monkeypatch):
    dueno = uuid.uuid4()
    consulta = SimpleNamespace(student_id=dueno, course_id=uuid.uuid4())
    assert utils.puede_ver_consulta(SimpleNamespace(role="STUDENT", id=dueno), consulta)
    assert not utils.puede_ver_consulta(SimpleNamespace(role="STUDENT", id=uuid.uuid4()), consulta)


def test_docente_solo_ve_consultas_de_sus_cursos(monkeypatch):
    docente = uuid.uuid4()
    consulta = SimpleNamespace(student_id=uuid.uuid4(), course_id=uuid.uuid4())
    monkeypatch.setattr(utils, "Course", _course_stub(docente))
    assert utils.puede_ver_consulta(SimpleNamespace(role="TEACHER", id=docente), consulta)

    monkeypatch.setattr(utils, "Course", _course_stub(uuid.uuid4()))
    assert not utils.puede_ver_consulta(SimpleNamespace(role="TEACHER", id=docente), consulta)


def test_otros_roles_no_ven_consultas(monkeypatch):
    consulta = SimpleNamespace(student_id=uuid.uuid4(), course_id=uuid.uuid4())
    assert not utils.puede_ver_consulta(SimpleNamespace(role="ADMIN", id=uuid.uuid4()), consulta)


@pytest.fixture
def perfiles(monkeypatch):
    yo = SimpleNamespace(
        id=uuid.uuid4(), username="yo", first_name="Yo", last_name="Test",
        email="yo@unab.edu.co", role="STUDENT", email_verified=True,
        avatar_svg=None, mailbox_created=False,
        to_dict=lambda: {"id": str(yo.id), "email": "yo@unab.edu.co"},
    )
    otro = SimpleNamespace(
        id=uuid.uuid4(), username="otro", first_name="Otro", last_name="Test",
        email="otro@unab.edu.co", role="STUDENT", email_verified=True,
        avatar_svg=None, mailbox_created=False,
        to_dict=lambda: {"id": str(otro.id), "email": "otro@unab.edu.co"},
    )
    store = {yo.id: yo, otro.id: otro}

    class _Q:
        @staticmethod
        def get(uid):
            return store.get(uid)

    monkeypatch.setattr(usuarios_routes, "User", SimpleNamespace(query=_Q))
    return yo, otro


def _headers(app, user):
    with app.app_context():
        token = create_access_token(identity=str(user.id), additional_claims={"role": user.role})
    return {"Authorization": f"Bearer {token}"}


def test_perfil_de_otro_usuario_no_expone_correo(app, client, perfiles):
    yo, otro = perfiles
    res = client.get(f"/api/usuarios/{otro.id}", headers=_headers(app, yo))
    assert res.status_code == 200
    body = res.get_json()
    assert "email" not in body
    assert body["username"] == "otro"


def test_perfil_propio_incluye_correo(app, client, perfiles):
    yo, _ = perfiles
    res = client.get(f"/api/usuarios/{yo.id}", headers=_headers(app, yo))
    assert res.status_code == 200
    assert res.get_json()["email"] == "yo@unab.edu.co"


def test_perfil_con_id_invalido_responde_400(app, client, perfiles):
    yo, _ = perfiles
    res = client.get("/api/usuarios/no-es-uuid", headers=_headers(app, yo))
    assert res.status_code == 400


class _FakeMongo:
    def __init__(self, doc):
        self.doc = doc

    def __getitem__(self, _):
        return {"user_security": SimpleNamespace(find_one=lambda q: self.doc)}


def test_token_anterior_a_invalidacion_responde_401(app, client, perfiles, monkeypatch):
    import time
    import app as app_pkg
    yo, _ = perfiles
    token_viejo = _headers(app, yo)
    monkeypatch.setattr(app_pkg, "mongo_client", _FakeMongo({"sessions_valid_after": int(time.time()) + 60}))
    res = client.get("/api/auth/me", headers=token_viejo)
    assert res.status_code == 401
