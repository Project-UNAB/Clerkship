"""Panel de administrador: solo ADMIN entra, y un admin no puede
desactivarse ni quitarse el rol a sí mismo por accidente."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.admin as admin_routes

RUTAS = [
    ("get", "/api/admin/estadisticas"),
    ("get", "/api/admin/usuarios"),
    ("patch", "/api/admin/usuarios/11111111-1111-1111-1111-111111111111"),
    ("get", "/api/admin/comunidad/posts"),
    ("delete", "/api/admin/comunidad/posts/11111111-1111-1111-1111-111111111111"),
    ("delete", "/api/admin/comunidad/comentarios/11111111-1111-1111-1111-111111111111"),
    ("get", "/api/admin/biblioteca"),
    ("delete", "/api/admin/biblioteca/11111111-1111-1111-1111-111111111111"),
    ("get", "/api/admin/feedback/inicio"),
    ("get", "/api/admin/validacion/inicio"),
    ("get", "/api/admin/tokens"),
]


def _token(app, role):
    with app.app_context():
        return create_access_token(identity="11111111-1111-1111-1111-111111111111", additional_claims={"role": role})


@pytest.mark.parametrize("method,path", RUTAS)
def test_admin_requiere_sesion(client, method, path):
    res = getattr(client, method)(path, json={})
    assert res.status_code == 401


@pytest.mark.parametrize("method,path", RUTAS)
def test_admin_rechaza_roles_sin_permiso(app, client, method, path):
    headers = {"Authorization": f"Bearer {_token(app, 'STUDENT')}"}
    res = getattr(client, method)(path, json={}, headers=headers)
    assert res.status_code == 403

    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = getattr(client, method)(path, json={}, headers=headers)
    assert res.status_code == 403


def test_admin_no_puede_desactivarse_a_si_mismo(app, client, monkeypatch):
    admin_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    admin_fake = SimpleNamespace(id=admin_id, role="ADMIN")
    monkeypatch.setattr(admin_routes, "get_current_user", lambda: admin_fake)
    with app.app_context():
        monkeypatch.setattr(admin_routes.User, "query", SimpleNamespace(get=lambda _id: admin_fake))

    headers = {"Authorization": f"Bearer {_token(app, 'ADMIN')}"}
    res = client.patch(f"/api/admin/usuarios/{admin_id}", json={"activo": False}, headers=headers)
    assert res.status_code == 400


def test_admin_no_puede_quitarse_el_rol_a_si_mismo(app, client, monkeypatch):
    admin_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    admin_fake = SimpleNamespace(id=admin_id, role="ADMIN")
    monkeypatch.setattr(admin_routes, "get_current_user", lambda: admin_fake)
    with app.app_context():
        monkeypatch.setattr(admin_routes.User, "query", SimpleNamespace(get=lambda _id: admin_fake))

    headers = {"Authorization": f"Bearer {_token(app, 'ADMIN')}"}
    res = client.patch(f"/api/admin/usuarios/{admin_id}", json={"role": "STUDENT"}, headers=headers)
    assert res.status_code == 400


def test_admin_puede_desactivar_a_otro_usuario(app, client, monkeypatch):
    admin_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    otro_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    admin_fake = SimpleNamespace(id=admin_id, role="ADMIN")
    otro_fake = SimpleNamespace(id=otro_id, role="STUDENT", activo=True, to_dict=lambda: {"id": str(otro_id), "activo": False})

    monkeypatch.setattr(admin_routes, "get_current_user", lambda: admin_fake)
    with app.app_context():
        monkeypatch.setattr(admin_routes.User, "query", SimpleNamespace(get=lambda _id: otro_fake))
        monkeypatch.setattr(admin_routes.db.session, "commit", lambda: None)

    headers = {"Authorization": f"Bearer {_token(app, 'ADMIN')}"}
    res = client.patch(f"/api/admin/usuarios/{otro_id}", json={"activo": False}, headers=headers)
    assert res.status_code == 200
    assert otro_fake.activo is False
