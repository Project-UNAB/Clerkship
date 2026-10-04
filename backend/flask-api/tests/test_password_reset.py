"""Recuperación de contraseña: pruebas sin base de datos (usuario en memoria)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from werkzeug.security import check_password_hash, generate_password_hash

import app.routes.auth as auth_routes


class _FakeQuery:
    def __init__(self, store):
        self._store = store

    def filter_by(self, **kwargs):
        self._match = [u for u in self._store.values() if all(getattr(u, k, None) == v for k, v in kwargs.items())]
        return self

    def first(self):
        return self._match[0] if self._match else None


@pytest.fixture
def fake_user(monkeypatch):
    user = SimpleNamespace(
        id="u1",
        email="estudiante@unab.edu.co",
        first_name="Ana",
        email_verified=True,
        password_hash=generate_password_hash("ViejaClave123"),
        verification_code=None,
        verification_code_expires_at=None,
        verification_attempts=0,
        reset_code=None,
        reset_code_expires_at=None,
        reset_attempts=0,
        role="STUDENT",
        to_dict=lambda: {"id": "u1", "email": "estudiante@unab.edu.co"},
    )
    store = {user.id: user}
    fake_model = SimpleNamespace(query=_FakeQuery(store))
    monkeypatch.setattr(auth_routes, "User", fake_model)
    monkeypatch.setattr(auth_routes.db.session, "commit", lambda: None)
    sent = []
    monkeypatch.setattr(
        auth_routes, "send_password_reset_email",
        lambda to, first, code: sent.append((to, code)),
    )
    user.sent = sent
    return user


def _expire_cooldown(user):
    user.reset_code_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)


def test_forgot_password_responde_igual_exista_o_no(client, fake_user):
    res_existe = client.post("/api/auth/forgot-password", json={"email": fake_user.email})
    res_no_existe = client.post("/api/auth/forgot-password", json={"email": "nadie@unab.edu.co"})
    assert res_existe.status_code == res_no_existe.status_code == 200
    assert res_existe.get_json() == res_no_existe.get_json()
    assert len(fake_user.sent) == 1


def test_forgot_password_no_envia_a_cuentas_no_verificadas(client, fake_user):
    fake_user.email_verified = False
    res = client.post("/api/auth/forgot-password", json={"email": fake_user.email})
    assert res.status_code == 200
    assert fake_user.sent == []


def test_forgot_password_respeta_cooldown(client, fake_user):
    client.post("/api/auth/forgot-password", json={"email": fake_user.email})
    client.post("/api/auth/forgot-password", json={"email": fake_user.email})
    assert len(fake_user.sent) == 1


def test_reset_password_con_codigo_correcto_cambia_la_clave(client, fake_user):
    client.post("/api/auth/forgot-password", json={"email": fake_user.email})
    _, code = fake_user.sent[0]

    res = client.post("/api/auth/reset-password", json={
        "email": fake_user.email, "code": code, "new_password": "NuevaClave456",
    })
    assert res.status_code == 200
    assert check_password_hash(fake_user.password_hash, "NuevaClave456")
    assert fake_user.reset_code is None


def test_reset_password_rechaza_codigo_incorrecto_y_cuenta_intentos(client, fake_user):
    client.post("/api/auth/forgot-password", json={"email": fake_user.email})
    _, code = fake_user.sent[0]
    wrong = "000000" if code != "000000" else "111111"

    res = client.post("/api/auth/reset-password", json={
        "email": fake_user.email, "code": wrong, "new_password": "NuevaClave456",
    })
    assert res.status_code == 400
    assert fake_user.reset_attempts == 1
    assert check_password_hash(fake_user.password_hash, "ViejaClave123")


def test_reset_password_bloquea_tras_demasiados_intentos(client, fake_user):
    client.post("/api/auth/forgot-password", json={"email": fake_user.email})
    _, code = fake_user.sent[0]
    fake_user.reset_attempts = auth_routes.MAX_VERIFICATION_ATTEMPTS

    res = client.post("/api/auth/reset-password", json={
        "email": fake_user.email, "code": code, "new_password": "NuevaClave456",
    })
    assert res.status_code == 429
    assert check_password_hash(fake_user.password_hash, "ViejaClave123")


def test_reset_password_rechaza_codigo_vencido(client, fake_user):
    client.post("/api/auth/forgot-password", json={"email": fake_user.email})
    _, code = fake_user.sent[0]
    fake_user.reset_code_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)

    res = client.post("/api/auth/reset-password", json={
        "email": fake_user.email, "code": code, "new_password": "NuevaClave456",
    })
    assert res.status_code == 400


def test_reset_password_no_revela_si_el_correo_existe(client, fake_user):
    res = client.post("/api/auth/reset-password", json={
        "email": "nadie@unab.edu.co", "code": "123456", "new_password": "NuevaClave456",
    })
    assert res.status_code == 400
    assert res.get_json()["message"] == "Código inválido o vencido. Solicita uno nuevo."


def test_reset_password_valida_formato_del_codigo(client, fake_user):
    res = client.post("/api/auth/reset-password", json={
        "email": fake_user.email, "code": "12ab", "new_password": "NuevaClave456",
    })
    assert res.status_code == 400


def test_login_no_reenvia_codigo_si_aun_esta_en_cooldown(client, fake_user, monkeypatch):
    fake_user.email_verified = False
    fake_user.verification_code = "123456"
    fake_user.verification_code_expires_at = datetime.now(timezone.utc) + timedelta(minutes=9, seconds=50)
    enviados = []
    monkeypatch.setattr(auth_routes, "send_verification_email", lambda *a: enviados.append(a))

    res = client.post("/api/auth/login", json={"email": fake_user.email, "password": "ViejaClave123"})
    assert res.status_code == 403
    assert enviados == []


def test_login_reenvia_codigo_cuando_ya_paso_el_cooldown(client, fake_user, monkeypatch):
    fake_user.email_verified = False
    fake_user.verification_code = "123456"
    fake_user.verification_code_expires_at = datetime.now(timezone.utc) + timedelta(minutes=1)
    enviados = []
    monkeypatch.setattr(auth_routes, "send_verification_email", lambda *a: enviados.append(a))

    res = client.post("/api/auth/login", json={"email": fake_user.email, "password": "ViejaClave123"})
    assert res.status_code == 403
    assert len(enviados) == 1


def test_codigo_de_recuperacion_se_guarda_hasheado(client, fake_user):
    client.post("/api/auth/forgot-password", json={"email": fake_user.email})
    _, code = fake_user.sent[0]
    assert fake_user.reset_code != code
    assert check_password_hash(fake_user.reset_code, code)


def test_codigo_de_verificacion_se_guarda_hasheado(app, monkeypatch):
    import app as app_pkg
    user = SimpleNamespace(verification_code=None, verification_code_expires_at=None, verification_attempts=0)
    monkeypatch.setattr(auth_routes.db.session, "commit", lambda: None)
    with app.app_context():
        code = auth_routes._issue_code(user)
    assert user.verification_code != code
    assert check_password_hash(user.verification_code, code)
