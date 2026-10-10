"""
Integration tests for the standardized initial endpoint structure.
Verifies Pydantic body validation, RBAC security guards, and HTTP status codes.
"""

from flask_jwt_extended import create_access_token
import pytest


@pytest.fixture
def student_headers(app):
    """Fixture to generate valid STUDENT JWT authorization headers."""
    with app.app_context():
        token = create_access_token(
            identity="11111111-1111-1111-1111-111111111111",
            additional_claims={"role": "STUDENT"},
        )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def teacher_headers(app):
    """Fixture to generate valid TEACHER JWT authorization headers."""
    with app.app_context():
        token = create_access_token(
            identity="22222222-2222-2222-2222-222222222222",
            additional_claims={"role": "TEACHER"},
        )
    return {"Authorization": f"Bearer {token}"}


def test_auth_register_validation_error(client):
    """POST /api/auth/register should fail with 400 Bad Request and validation details when payload is malformed."""
    res = client.post(
        "/api/auth/register",
        json={
            "role": "STUDENT",
            "first_name": "Test",
            # missing last_name, invalid email, short password
            "email": "invalid-email-address",
            "password": "123",
        },
    )
    assert res.status_code == 400
    data = res.get_json()
    assert data["error"] == "Bad Request"
    assert "details" in data
    fields = [d["field"] for d in data["details"]]
    assert any("last_name" in f for f in fields)
    assert any("password" in f for f in fields)


def test_auth_login_validation_error(client):
    """POST /api/auth/login should fail with 400 if email is malformed."""
    res = client.post("/api/auth/login", json={"email": "not-an-email", "password": "somepassword"})
    assert res.status_code == 400
    data = res.get_json()
    assert data["error"] == "Bad Request"
    assert "details" in data


def test_cursos_creation_rbac_and_validation(client, student_headers, teacher_headers):
    """POST /api/cursos: STUDENT gets 403 Forbidden; TEACHER with invalid payload gets 400."""
    # Student cannot create courses (RBAC check)
    res_student = client.post(
        "/api/cursos",
        headers=student_headers,
        json={"name": "Semiología Médica"},
    )
    assert res_student.status_code == 403

    # Teacher with empty name gets 400 Bad Request
    res_bad = client.post(
        "/api/cursos",
        headers=teacher_headers,
        json={"name": ""},
    )
    assert res_bad.status_code == 400
    assert "details" in res_bad.get_json()


def test_articulos_creation_rbac_and_validation(client, student_headers, teacher_headers):
    """POST /api/articulos: STUDENT gets 403 Forbidden; TEACHER with missing fields gets 400."""
    # Student cannot create articles
    res_student = client.post(
        "/api/articulos",
        headers=student_headers,
        json={"title": "Guía", "content": "Contenido", "specialty": "Cardio"},
    )
    assert res_student.status_code == 403

    # Teacher with missing required fields
    res_bad = client.post(
        "/api/articulos",
        headers=teacher_headers,
        json={"title": "Guía"},  # missing content and specialty
    )
    assert res_bad.status_code == 400
    data = res_bad.get_json()
    assert "details" in data


def test_documentos_carpetas_validation(client, student_headers):
    """POST /api/documentos/carpetas: fails with 400 when color hex is invalid."""
    res_bad = client.post(
        "/api/documentos/carpetas",
        headers=student_headers,
        json={"name": "Rotación Interna", "color": "invalid-color"},
    )
    assert res_bad.status_code == 400
    data = res_bad.get_json()
    assert "details" in data


def test_comunidad_posts_validation(client, student_headers):
    """POST /api/comunidad/posts: fails with 400 when content is missing."""
    res_bad = client.post(
        "/api/comunidad/posts",
        headers=student_headers,
        json={"title": "Caso clínico"},  # missing content
    )
    assert res_bad.status_code == 400
    data = res_bad.get_json()
    assert "details" in data


def test_consultas_creation_rbac_and_validation(client, teacher_headers, student_headers):
    """POST /api/consultas: TEACHER gets 403 Forbidden; STUDENT with invalid difficulty gets 400."""
    # Teacher cannot start student clinical simulations
    res_teacher = client.post(
        "/api/consultas",
        headers=teacher_headers,
        json={"course_id": "c1"},
    )
    assert res_teacher.status_code == 403

    # Student with invalid difficulty
    res_bad = client.post(
        "/api/consultas",
        headers=student_headers,
        json={"course_id": "c1", "difficulty": "ULTRA_HARD"},
    )
    assert res_bad.status_code == 400
    data = res_bad.get_json()
    assert "details" in data


def test_email_notificar_validation(app, client, student_headers):
    """POST /api/email/notificar: solo ADMIN; con datos incompletos responde 400."""
    from flask_jwt_extended import create_access_token

    with app.app_context():
        admin = create_access_token(identity="33333333-3333-3333-3333-333333333333", additional_claims={"role": "ADMIN"})
    res_bad = client.post(
        "/api/email/notificar",
        headers={"Authorization": f"Bearer {admin}"},
        json={"to": "not-an-email"},
    )
    assert res_bad.status_code == 400
    data = res_bad.get_json()
    assert "details" in data

    # Un estudiante (o un docente) no puede mandar correos desde la plataforma.
    res_estudiante = client.post(
        "/api/email/notificar", headers=student_headers,
        json={"to": "alguien@example.com", "subject": "Hola", "text": "Texto"},
    )
    assert res_estudiante.status_code == 403


def test_public_endpoints_accessible_without_auth(client):
    """Public endpoints (/api/health, /api/email/status, /api/openapi.json) must be accessible without JWT."""
    res_health = client.get("/api/health")
    assert res_health.status_code == 200

    res_email_status = client.get("/api/email/status")
    assert res_email_status.status_code == 200

    res_openapi = client.get("/api/openapi.json")
    assert res_openapi.status_code == 200

    res_simulador = client.get("/simulador")
    assert res_simulador.status_code == 200
    assert "ClinicAI UNAB" in res_simulador.get_data(as_text=True)

