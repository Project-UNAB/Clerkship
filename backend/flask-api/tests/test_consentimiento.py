"""Pruebas del registro de consentimiento informado en el servidor."""
from datetime import datetime, timezone, timedelta
import uuid
from flask_jwt_extended import create_access_token
import pytest

import app.routes.usuarios as usuarios_routes


def _token(app, role="STUDENT", identity="11111111-1111-1111-1111-111111111111"):
    with app.app_context():
        return create_access_token(identity=identity, additional_claims={"role": role})


class MockUser:
    """Usuario simulado para probar el registro de consentimiento sin tocar la BD."""

    def __init__(self, consent_accepted_at=None, consent_version=None):
        self.id = uuid.uuid4()
        self.username = "estudiante_test"
        self.first_name = "Estudiante"
        self.last_name = "Prueba"
        self.email = "estudiante@clerk-ship.online"
        self.role = "STUDENT"
        self.email_verified = True
        self.avatar_svg = None
        self.mailbox_created = False
        self.activo = True
        self.email_notifications = False
        self.consent_accepted_at = consent_accepted_at
        self.consent_version = consent_version

    def to_dict(self):
        return {
            "id": str(self.id),
            "username": self.username,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "email": self.email,
            "role": self.role,
            "email_verified": self.email_verified,
            "avatar_svg": self.avatar_svg,
            "mailbox_created": self.mailbox_created,
            "activo": self.activo,
            "email_notifications": self.email_notifications,
            "consent_accepted_at": self.consent_accepted_at.isoformat() if self.consent_accepted_at else None,
            "consent_version": self.consent_version,
        }


def test_consentimiento_requiere_sesion(client):
    """Sin token de autorización debe responder 401."""
    res = client.post("/api/usuarios/consentimiento", json={"version": "2026-10"})
    assert res.status_code == 401


def test_consentimiento_guarda_fecha_y_version(app, client, monkeypatch):
    """Registra la versión y fecha actual cuando el usuario no tenía consentimiento."""
    user = MockUser(consent_accepted_at=None, consent_version=None)
    with app.app_context():
        monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(usuarios_routes.db.session, "commit", lambda: None)

    headers = {"Authorization": f"Bearer {_token(app, identity=str(user.id))}"}
    res = client.post("/api/usuarios/consentimiento", json={"version": "2026-10"}, headers=headers)

    assert res.status_code == 200
    data = res.get_json()
    assert data["consent_version"] == "2026-10"
    assert data["consent_accepted_at"] is not None
    assert user.consent_version == "2026-10"
    assert user.consent_accepted_at is not None


def test_consentimiento_idempotente_misma_version(app, client, monkeypatch):
    """Si el usuario ya aceptó la misma versión, no se actualiza la fecha."""
    fecha_previa = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    user = MockUser(consent_accepted_at=fecha_previa, consent_version="2026-10")

    with app.app_context():
        monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(usuarios_routes.db.session, "commit", lambda: None)

    headers = {"Authorization": f"Bearer {_token(app, identity=str(user.id))}"}
    res = client.post("/api/usuarios/consentimiento", json={"version": "2026-10"}, headers=headers)

    assert res.status_code == 200
    assert user.consent_accepted_at == fecha_previa
    data = res.get_json()
    assert data["consent_version"] == "2026-10"
    assert data["consent_accepted_at"] == fecha_previa.isoformat()


def test_consentimiento_nueva_version_actualiza_fecha(app, client, monkeypatch):
    """Si la versión cambia, se actualiza la versión y se registra la fecha nueva."""
    fecha_vieja = datetime.now(timezone.utc) - timedelta(days=30)
    user = MockUser(consent_accepted_at=fecha_vieja, consent_version="2026-01")

    with app.app_context():
        monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(usuarios_routes.db.session, "commit", lambda: None)

    headers = {"Authorization": f"Bearer {_token(app, identity=str(user.id))}"}
    res = client.post("/api/usuarios/consentimiento", json={"version": "2026-10"}, headers=headers)

    assert res.status_code == 200
    assert user.consent_version == "2026-10"
    assert user.consent_accepted_at > fecha_vieja
    data = res.get_json()
    assert data["consent_version"] == "2026-10"
    assert data["consent_accepted_at"] == user.consent_accepted_at.isoformat()


def test_consentimiento_body_invalido(app, client, monkeypatch):
    """Valida que rechace cadenas vacías, muy largas o campos faltantes."""
    user = MockUser()
    with app.app_context():
        monkeypatch.setattr(usuarios_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(usuarios_routes.db.session, "commit", lambda: None)

    headers = {"Authorization": f"Bearer {_token(app, identity=str(user.id))}"}

    # Sin campo version
    res = client.post("/api/usuarios/consentimiento", json={}, headers=headers)
    assert res.status_code in (400, 422)

    # Version vacía (min_length=1)
    res = client.post("/api/usuarios/consentimiento", json={"version": ""}, headers=headers)
    assert res.status_code in (400, 422)

    # Version mayor a 20 caracteres (max_length=20)
    res = client.post("/api/usuarios/consentimiento", json={"version": "a" * 21}, headers=headers)
    assert res.status_code in (400, 422)
