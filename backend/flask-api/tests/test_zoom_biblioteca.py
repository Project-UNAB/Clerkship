"""Zoom de la biblioteca guardado por usuario (PATCH /api/usuarios/me)."""
import uuid

from flask_jwt_extended import create_access_token

import app.routes.usuarios as usuarios_routes
from app.models import User
from app.schemas import UpdateUserRequest


def _usuario():
    return User(id=uuid.uuid4(), username="lector", first_name="Ana", last_name="Ríos", email="a@example.com",
                password_hash="x", role="STUDENT")


def test_el_zoom_se_valida_entre_60_y_200():
    assert UpdateUserRequest(biblioteca_zoom=125).biblioteca_zoom == 125
    for malo in (59, 201, -1):
        try:
            UpdateUserRequest(biblioteca_zoom=malo)
        except Exception:
            continue
        raise AssertionError(f"aceptó biblioteca_zoom={malo}")


def test_sin_zoom_guardado_es_el_predeterminado_130():
    assert _usuario().to_dict()["biblioteca_zoom"] == 130


def test_guardar_el_zoom(app, client, monkeypatch):
    u = _usuario()
    with app.app_context():
        token = create_access_token(identity=str(u.id), additional_claims={"role": "STUDENT"})
        monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: u)
        monkeypatch.setattr(usuarios_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(usuarios_routes, "_ficha_de", lambda user: (None, None))
        res = client.patch("/api/usuarios/me", json={"biblioteca_zoom": 140}, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert u.library_zoom == 140 and res.get_json()["biblioteca_zoom"] == 140
