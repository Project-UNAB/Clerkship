"""
End-to-End Functional Test Suite for the ClinicAI UNAB / Clerkship Mock API.

Validates that all 11 business modules are completely functional, returning
valid, schema-compliant responses using pre-seeded mock credentials and data:
1. Autenticación (Login, Me, Refresh)
2. Usuarios (Búsqueda, Perfil, Almacenamiento)
3. Cursos (Listado, Míos, Matrícula, Creación)
4. Biblioteca Médica (Artículos, Filtros, Estante de lectura)
5. Documentos y Carpetas (CRUD de carpetas)
6. Comunidad (Publicaciones, Comentarios, Likes)
7. Simulación Clínica (Consultas, Chat con Paciente Virtual, Finalización)
8. Historial y Evaluación (Trazabilidad, Rúbrica formativa, Estadísticas)
9. Agentes de IA (Generador de casos, Paciente virtual, Tutor evaluador)
10. Notificaciones / Correo (Estado, Notificar)
11. Documentación Interactiva (OpenAPI JSON, Swagger UI)
"""

import os

import pytest
from app.models import Course, Article, CommunityPost, Consultation

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="Requiere TEST_DATABASE_URL (base de pruebas dedicada, nunca producción)",
)


@pytest.fixture
def student_auth(client):
    """Logs in as the pre-seeded student and returns the access token headers."""
    res = client.post(
        "/api/auth/login",
        json={"email": "sarias202@unab.edu.co", "password": "Estudiante2026*"},
    )
    assert res.status_code == 200, f"Login failed: {res.get_json()}"
    data = res.get_json()
    token = data.get("access_token") or (data.get("tokens") or {}).get("access_token")
    refresh = data.get("refresh_token") or (data.get("tokens") or {}).get("refresh_token")
    return {
        "headers": {"Authorization": f"Bearer {token}"},
        "refresh_token": refresh,
        "user": data["user"],
    }


@pytest.fixture
def teacher_auth(client):
    """Logs in as the pre-seeded teacher and returns the access token headers."""
    res = client.post(
        "/api/auth/login",
        json={"email": "docente@unab.edu.co", "password": "Docente2026*"},
    )
    assert res.status_code == 200, f"Teacher login failed: {res.get_json()}"
    data = res.get_json()
    token = data.get("access_token") or (data.get("tokens") or {}).get("access_token")
    return {
        "headers": {"Authorization": f"Bearer {token}"},
        "user": data["user"],
    }


# =============================================================================
# 1. AUTENTICACIÓN
# =============================================================================

def test_auth_login_and_me_flow(client, student_auth, teacher_auth):
    """Validates login, user profile extraction, and JWT refresh."""
    # Student profile
    res_student_me = client.get("/api/auth/me", headers=student_auth["headers"])
    assert res_student_me.status_code == 200
    student_data = res_student_me.get_json()
    assert student_data["email"] == "sarias202@unab.edu.co"
    assert student_data["role"] == "STUDENT"

    # Teacher profile
    res_teacher_me = client.get("/api/auth/me", headers=teacher_auth["headers"])
    assert res_teacher_me.status_code == 200
    teacher_data = res_teacher_me.get_json()
    assert teacher_data["email"] == "docente@unab.edu.co"
    assert teacher_data["role"] == "TEACHER"

    # Refresh token
    refresh_headers = {"Authorization": f"Bearer {student_auth['refresh_token']}"}
    res_refresh = client.post("/api/auth/refresh", headers=refresh_headers)
    assert res_refresh.status_code == 200
    assert "access_token" in res_refresh.get_json()


# =============================================================================
# 2. USUARIOS
# =============================================================================

def test_usuarios_search_and_storage(client, student_auth):
    """Tests user search by query and storage quota check."""
    # Search for teachers
    res_search = client.get("/api/usuarios/buscar?q=docente", headers=student_auth["headers"])
    assert res_search.status_code == 200
    users_list = res_search.get_json()
    assert isinstance(users_list, list)
    assert any("docente" in u["username"] for u in users_list)

    # Storage usage
    res_storage = client.get("/api/usuarios/uso-almacenamiento", headers=student_auth["headers"])
    assert res_storage.status_code == 200
    storage_data = res_storage.get_json()
    assert "used_bytes" in storage_data
    assert storage_data["limit_bytes"] == 5 * 1024 * 1024 * 1024


# =============================================================================
# 3. CURSOS
# =============================================================================

def test_cursos_listing_and_enrollment(client, student_auth, teacher_auth):
    """Tests course catalog, enrolled courses, and enrollment lifecycle."""
    # List all courses
    res_all = client.get("/api/cursos", headers=student_auth["headers"])
    assert res_all.status_code == 200
    courses = res_all.get_json()
    assert len(courses) >= 3
    course_id = courses[0]["id"]

    # Student's enrolled courses
    res_mine = client.get("/api/cursos/mios", headers=student_auth["headers"])
    assert res_mine.status_code == 200
    my_courses = res_mine.get_json()
    assert len(my_courses) >= 1

    # Get single course detail
    res_single = client.get(f"/api/cursos/{course_id}", headers=student_auth["headers"])
    assert res_single.status_code == 200
    assert res_single.get_json()["id"] == course_id

    # Teacher creates a course
    res_create = client.post(
        "/api/cursos",
        headers=teacher_auth["headers"],
        json={
            "name": "Simulación Avanzada de Urgencias Médicas",
            "description": "Casos clínicos de alta complejidad.",
            "academic_period": "2026-1",
        },
    )
    assert res_create.status_code == 201
    created_id = res_create.get_json()["id"]

    # Student enrolls in new course
    res_enroll = client.post(f"/api/cursos/{created_id}/matricular", headers=student_auth["headers"])
    assert res_enroll.status_code == 201

    # Student unenrolls
    res_unenroll = client.delete(f"/api/cursos/{created_id}/matricular", headers=student_auth["headers"])
    assert res_unenroll.status_code == 200


# =============================================================================
# 4. BIBLIOTECA MÉDICA Y ARTÍCULOS
# =============================================================================

def test_articulos_and_shelf_lifecycle(client, student_auth, teacher_auth):
    """Tests medical articles retrieval, filters, and personal reading shelf."""
    # List articles
    res_articles = client.get("/api/articulos", headers=student_auth["headers"])
    assert res_articles.status_code == 200
    articles = res_articles.get_json()
    assert len(articles) >= 4
    article_id = articles[0]["id"]

    # Filter by specialty
    res_filtered = client.get("/api/articulos?specialty=Gastroenterología", headers=student_auth["headers"])
    assert res_filtered.status_code == 200
    for art in res_filtered.get_json():
        assert "Gastroenterología" in art["specialty"]

    # Reading shelf
    res_shelf = client.get("/api/articulos/estante", headers=student_auth["headers"])
    assert res_shelf.status_code == 200
    shelf_items = res_shelf.get_json()
    assert isinstance(shelf_items, list)

    # Save to shelf
    target_article_id = articles[2]["id"]
    res_save = client.post(
        f"/api/articulos/{target_article_id}/estante",
        headers=student_auth["headers"],
        json={"status": "NEXT"},
    )
    assert res_save.status_code == 200
    assert res_save.get_json()["status"] == "NEXT"

    # Remove from shelf
    res_del = client.delete(f"/api/articulos/{target_article_id}/estante", headers=student_auth["headers"])
    assert res_del.status_code == 200


# =============================================================================
# 5. DOCUMENTOS Y CARPETAS
# =============================================================================

def test_documentos_carpetas_crud(client, student_auth):
    """Tests clinical document folder management."""
    # List folders
    res_folders = client.get("/api/documentos/carpetas", headers=student_auth["headers"])
    assert res_folders.status_code == 200
    data = res_folders.get_json()
    assert "folders" in data
    assert len(data["folders"]) >= 1

    # Create new folder
    res_create = client.post(
        "/api/documentos/carpetas",
        headers=student_auth["headers"],
        json={"name": "Rotación Medicina Interna 2026", "color": "#2563EB"},
    )
    assert res_create.status_code == 201
    folder_id = res_create.get_json()["folder"]["id"]

    # Update folder
    res_update = client.patch(
        f"/api/documentos/carpetas/{folder_id}",
        headers=student_auth["headers"],
        json={"name": "Rotación Medicina Interna - Actualizada", "color": "#059669"},
    )
    assert res_update.status_code == 200

    # Delete folder
    res_del = client.delete(f"/api/documentos/carpetas/{folder_id}", headers=student_auth["headers"])
    assert res_del.status_code == 200


# =============================================================================
# 6. COMUNIDAD Y DISCUSIÓN CLÍNICA
# =============================================================================

def test_comunidad_posts_and_comments(client, student_auth):
    """Tests community posts, comments, and like toggle."""
    # List posts
    res_posts = client.get("/api/comunidad/posts", headers=student_auth["headers"])
    assert res_posts.status_code == 200
    posts = res_posts.get_json()
    assert len(posts) >= 1
    post_id = posts[0]["id"]

    # Create post
    res_create_post = client.post(
        "/api/comunidad/posts",
        headers=student_auth["headers"],
        json={
            "title": "Manejo de Hemorragia Digestiva Alta",
            "content": "Pregunta de caso: ¿Cuál es el momento idóneo para realizar EDA en hemorragia digestiva alta no variceal?",
        },
    )
    assert res_create_post.status_code == 201
    new_post_id = res_create_post.get_json()["id"]

    # Add comment
    res_comment = client.post(
        f"/api/comunidad/posts/{new_post_id}/comentarios",
        headers=student_auth["headers"],
        json={"content": "Dentro de las primeras 24 horas una vez lograda la reanimación hemodinámica con cristaloides."},
    )
    assert res_comment.status_code == 201

    # List comments
    res_comments = client.get(f"/api/comunidad/posts/{new_post_id}/comentarios", headers=student_auth["headers"])
    assert res_comments.status_code == 200
    assert len(res_comments.get_json()) >= 1

    # Toggle like
    res_like = client.post(f"/api/comunidad/posts/{new_post_id}/like", headers=student_auth["headers"])
    assert res_like.status_code == 200
    assert "liked" in res_like.get_json()

    # Clean up post
    res_del_post = client.delete(f"/api/comunidad/posts/{new_post_id}", headers=student_auth["headers"])
    assert res_del_post.status_code == 200


# =============================================================================
# 7. SIMULACIÓN CLÍNICA Y PACIENTE VIRTUAL
# =============================================================================

def test_simulacion_clinica_flow(client, student_auth):
    """Tests the clinical simulation lifecycle: start, chat with virtual patient, and finish."""
    # 1. List consultations
    res_consultas = client.get("/api/consultas", headers=student_auth["headers"])
    assert res_consultas.status_code == 200
    consultas = res_consultas.get_json()
    assert len(consultas) >= 1

    # 2. Get student's enrolled course to launch a new simulation
    res_courses = client.get("/api/cursos/mios", headers=student_auth["headers"])
    assert res_courses.status_code == 200
    my_courses = res_courses.get_json()
    assert len(my_courses) >= 1
    course_id = my_courses[0]["id"]

    # 3. Start a fresh simulated consultation
    res_start = client.post(
        "/api/consultas",
        headers=student_auth["headers"],
        json={
            "course_id": course_id,
            "title": "Simulación Interactiva: Dolor Epigástrico Agudo",
            "specialty": "Gastroenterología",
            "difficulty": "MEDIUM",
        },
    )
    assert res_start.status_code == 201
    new_cons = res_start.get_json()
    cid = new_cons["id"]
    assert new_cons["status"] == "IN_PROGRESS"

    # 4. Fetch consultation details
    res_detail = client.get(f"/api/consultas/{cid}", headers=student_auth["headers"])
    assert res_detail.status_code == 200
    assert res_detail.get_json()["id"] == cid

    # 5. Interrogate virtual patient
    res_msg = client.post(
        f"/api/consultas/{cid}/mensajes",
        headers=student_auth["headers"],
        json={"content": "¿Dónde le duele exactamente y desde qué horas?"},
    )
    assert res_msg.status_code == 200
    msg_data = res_msg.get_json()
    assert "sent" in msg_data
    assert "reply" in msg_data
    assert msg_data["reply"]["sender"] == "PATIENT"
    assert len(msg_data["reply"]["content"]) > 5

    # 6. Conclude consultation
    res_finish = client.patch(
        f"/api/consultas/{cid}/finalizar",
        headers=student_auth["headers"],
        json={"final_diagnosis": "Pancreatitis aguda litiásica"},
    )
    assert res_finish.status_code == 200
    assert res_finish.get_json()["consultation"]["status"] == "COMPLETED"


# =============================================================================
# 8. HISTORIAL, EVALUACIÓN Y ESTADÍSTICAS
# =============================================================================

def test_historial_and_evaluation_metrics(client, student_auth):
    """Tests clinical history retrieval, formative AI feedback rubric, and dashboard stats."""
    # Completed history
    res_hist = client.get("/api/historial", headers=student_auth["headers"])
    assert res_hist.status_code == 200
    history = res_hist.get_json()
    assert len(history) >= 1
    completed_id = history[0]["id"]

    # Formative feedback
    res_feedback = client.get(f"/api/historial/{completed_id}/retroalimentacion", headers=student_auth["headers"])
    assert res_feedback.status_code == 200
    feedback_data = res_feedback.get_json()
    assert "consultation" in feedback_data
    assert "evaluation" in feedback_data
    assert feedback_data["evaluation"]["final_score"] is not None

    # Dashboard stats
    res_stats = client.get("/api/historial/estadisticas", headers=student_auth["headers"])
    assert res_stats.status_code == 200
    stats = res_stats.get_json()
    assert stats["completadas"] >= 1
    assert stats["promedio_score"] > 0
    assert "por_especialidad" in stats


# =============================================================================
# 9. AGENTES DE IA (API REST)
# =============================================================================

def test_agentes_api_complete_lifecycle(client, student_auth):
    """Tests the 3 AI Agents directly through their REST endpoints."""
    # Agente 1: Generador de casos
    res_case = client.post(
        "/api/agentes/caso",
        headers=student_auth["headers"],
        json={"specialty": "Gastroenterología", "difficulty": "MEDIUM"},
    )
    assert res_case.status_code == 200
    case_data = res_case.get_json()
    assert case_data["case_id"] == "CASE-GI-001"
    assert "vital_signs" in case_data
    assert "ground_truth" in case_data

    # Agente 2: Paciente virtual
    res_patient = client.post(
        "/api/agentes/paciente/chat",
        headers=student_auth["headers"],
        json={"case_id": "CASE-GI-001", "message": "¿Tiene vómitos o fiebre doctor?"},
    )
    assert res_patient.status_code == 200
    patient_data = res_patient.get_json()
    assert "reply" in patient_data
    assert patient_data["pain_scale_reported"] is not None

    # Agente 3: Evaluador clínico
    res_eval = client.post(
        "/api/agentes/evaluar",
        headers=student_auth["headers"],
        json={
            "case_id": "CASE-GI-001",
            "chat_history": [
                {"sender": "doctor", "message": "¿Dónde le duele exactamente y desde qué horas inició el dolor?"},
                {"sender": "patient", "message": "En la boca del estómago y se me pasa a la espalda."},
                {"sender": "doctor", "message": "¿Ha tenido vómitos, náuseas o fiebre?"},
                {"sender": "patient", "message": "Muchos vómitos de color amarillo y náuseas intensas."},
                {"sender": "doctor", "message": "¿Tiene antecedentes de cálculos biliares o toma medicamentos?"},
                {"sender": "patient", "message": "Sí, me diagnosticaron colelitiasis el año pasado."},
            ],
            "requested_tests": ["Lipasa sérica", "Amilasa sérica", "Ecografía abdominal"],
            "differential_diagnoses": ["Colecistitis aguda", "Úlcera péptica perforada"],
            "final_diagnosis": "Pancreatitis aguda de origen litiásico",
        },
    )
    assert res_eval.status_code == 200
    eval_data = res_eval.get_json()
    assert eval_data["final_score"] >= 70.0
    assert "domain_scores" in eval_data
    assert "detected_biases" in eval_data


# =============================================================================
# 10. CORREO Y DOCUMENTACIÓN
# =============================================================================

def test_email_and_documentation_endpoints(client, student_auth):
    """Tests diagnostic notification status and OpenAPI / Swagger availability."""
    # Email status
    res_email = client.get("/api/email/status")
    assert res_email.status_code == 200
    assert res_email.get_json()["service"] == "Mailgun"

    # Send test notification
    res_notif = client.post(
        "/api/email/notificar",
        headers=student_auth["headers"],
        json={"to": "sarias202@unab.edu.co", "subject": "Simulación Completada", "text": "Su puntaje fue 88.5"},
    )
    assert res_notif.status_code == 200

    # OpenAPI JSON specification
    res_spec = client.get("/api/openapi.json")
    assert res_spec.status_code == 200
    assert res_spec.get_json()["openapi"] == "3.0.3"

    # Swagger UI interactive docs
    res_docs = client.get("/docs")
    assert res_docs.status_code == 200
    assert "swagger" in res_docs.get_data(as_text=True).lower()
