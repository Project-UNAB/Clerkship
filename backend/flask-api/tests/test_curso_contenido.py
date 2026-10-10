"""Material de curso (bloques y contenido): permisos (docente dueño /
estudiante matriculado) y validación de los distintos tipos de contenido.
No toca la base real ni R2 — todo con monkeypatch."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.curso_contenido as cc_routes


def _token(app, role, identity="11111111-1111-1111-1111-111111111111"):
    with app.app_context():
        return create_access_token(identity=identity, additional_claims={"role": role})


def _headers(app, role, identity="11111111-1111-1111-1111-111111111111"):
    return {"Authorization": f"Bearer {_token(app, role, identity)}"}


PDF_BASE64 = "JVBERi0xLjQKJSVFT0YK"  # "%PDF-1.4\n%%EOF\n"


@pytest.fixture(autouse=True)
def _bloque_del_curso(app, monkeypatch):
    """Por defecto el bloque de la URL sí pertenece al curso. Los tests que
    prueban el cruce bloque-curso vuelven a parchear CourseBlock.query."""
    with app.app_context():
        monkeypatch.setattr(
            cc_routes.CourseBlock,
            "query",
            SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: SimpleNamespace(id=kw.get("id")))),
        )
        # Sin archivos de entregas guardados, salvo que el test diga otra cosa.
        monkeypatch.setattr(cc_routes, "_archivos_de_entregas", lambda ids: {})


@pytest.mark.parametrize("method,path", [
    ("get", "/api/cursos/11111111-1111-1111-1111-111111111111/bloques"),
    ("post", "/api/cursos/11111111-1111-1111-1111-111111111111/bloques"),
])
def test_bloques_requiere_sesion(client, method, path):
    res = getattr(client, method)(path, json={})
    assert res.status_code == 401


def test_listar_bloques_curso_inexistente_da_404(app, client, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: None))
    headers = _headers(app, "TEACHER")
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/bloques", headers=headers)
    assert res.status_code == 404


def test_listar_bloques_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
    headers = _headers(app, "TEACHER")
    res = client.get(f"/api/cursos/{curso.id}/bloques", headers=headers)
    assert res.status_code == 403


def test_listar_bloques_rechaza_estudiante_no_matriculado(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: None)))
    headers = _headers(app, "STUDENT")
    res = client.get(f"/api/cursos/{curso.id}/bloques", headers=headers)
    assert res.status_code == 403


def test_listar_bloques_permite_estudiante_matriculado(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))
        monkeypatch.setattr(
            cc_routes.CourseBlock,
            "query",
            SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(order_by=lambda *a: SimpleNamespace(all=lambda: []))),
        )
    headers = _headers(app, "STUDENT")
    res = client.get(f"/api/cursos/{curso.id}/bloques", headers=headers)
    assert res.status_code == 200
    assert res.get_json() == {"bloques": []}


def test_crear_bloque_rechaza_estudiante(app, client):
    headers = _headers(app, "STUDENT")
    res = client.post(
        "/api/cursos/11111111-1111-1111-1111-111111111111/bloques",
        json={"title": "Semana 1"},
        headers=headers,
    )
    assert res.status_code == 403


def test_crear_bloque_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
    headers = _headers(app, "TEACHER")
    res = client.post(f"/api/cursos/{curso.id}/bloques", json={"title": "Semana 1"}, headers=headers)
    assert res.status_code == 403


def test_crear_bloque_exitoso(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(
            cc_routes.db.session,
            "query",
            lambda *a: SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(scalar=lambda: -1)),
        )
        monkeypatch.setattr(cc_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cc_routes.db.session, "commit", lambda: None)

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques",
        json={"title": "Semana 1: Dolor abdominal", "description": "Material introductorio"},
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["title"] == "Semana 1: Dolor abdominal"
    assert body["position"] == 0
    assert body["contenido"] == []


def test_crear_contenido_rechaza_tipo_invalido(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloque = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: bloque)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{bloque.id}/contenido",
        json={"type": "AUDIO", "title": "Algo"},
        headers=headers,
    )
    assert res.status_code == 400


def test_crear_contenido_video_sin_url_da_400(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloque = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: bloque)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{bloque.id}/contenido",
        json={"type": "VIDEO", "title": "Caso en video"},
        headers=headers,
    )
    assert res.status_code == 400


def test_crear_contenido_video_exitoso(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloque = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: bloque)))
        monkeypatch.setattr(
            cc_routes.db.session,
            "query",
            lambda *a: SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(scalar=lambda: -1)),
        )
        monkeypatch.setattr(cc_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cc_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(cc_routes.UserFile, "query", SimpleNamespace(get=lambda _id: None))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{bloque.id}/contenido",
        json={"type": "VIDEO", "title": "Caso en video", "video_url": "https://youtube.com/watch?v=abc"},
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["type"] == "VIDEO"
    assert body["video_url"] == "https://youtube.com/watch?v=abc"


def test_obtener_archivo_contenido_no_documento_da_404(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item_texto = SimpleNamespace(id=uuid.uuid4(), type="TEXT", file_id=None)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item_texto)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.get(
        f"/api/cursos/{curso.id}/bloques/11111111-1111-1111-1111-111111111111/contenido/{item_texto.id}/archivo",
        headers=headers,
    )
    assert res.status_code == 404


# ─────────────────────────── Tareas (ASSIGNMENT) ───────────────────────────

def test_crear_contenido_assignment_exitoso(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloque = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: bloque)))
        monkeypatch.setattr(
            cc_routes.db.session,
            "query",
            lambda *a: SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(scalar=lambda: -1)),
        )
        monkeypatch.setattr(cc_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cc_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(cc_routes.UserFile, "query", SimpleNamespace(get=lambda _id: None))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{bloque.id}/contenido",
        json={
            "type": "ASSIGNMENT",
            "title": "Entrega 1: Avances",
            "open_at": "2026-10-01T00:00:00Z",
            "due_at": "2026-10-10T23:59:00Z",
            "max_score": 100,
            "allow_late": True,
        },
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["type"] == "ASSIGNMENT"
    assert body["due_at"] is not None
    assert body["max_score"] == 100.0
    assert body["allow_late"] is True


def test_crear_contenido_assignment_open_despues_de_due_da_400(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloque = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: bloque)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{bloque.id}/contenido",
        json={"type": "ASSIGNMENT", "title": "Tarea", "open_at": "2026-10-10T00:00:00Z", "due_at": "2026-10-01T00:00:00Z"},
        headers=headers,
    )
    assert res.status_code == 400


def test_crear_contenido_assignment_fecha_invalida_da_400(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloque = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: bloque)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{bloque.id}/contenido",
        json={"type": "ASSIGNMENT", "title": "Tarea", "due_at": "no-es-una-fecha"},
        headers=headers,
    )
    assert res.status_code == 400


def test_entregar_tarea_requiere_sesion(client):
    res = client.post(
        "/api/cursos/11111111-1111-1111-1111-111111111111/bloques/22222222-2222-2222-2222-222222222222"
        "/contenido/33333333-3333-3333-3333-333333333333/entregas",
        json={"name": "x.pdf", "file_base64": PDF_BASE64},
    )
    assert res.status_code == 401


def test_entregar_tarea_rechaza_no_matriculado(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: None)))

    headers = _headers(app, "STUDENT")
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/11111111-1111-1111-1111-111111111111"
        "/contenido/33333333-3333-3333-3333-333333333333/entregas",
        json={"name": "x.pdf", "file_base64": PDF_BASE64},
        headers=headers,
    )
    assert res.status_code == 403


def test_entregar_tarea_antes_de_abrir_da_400(app, client, monkeypatch):
    from datetime import datetime, timedelta, timezone

    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(
        id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT",
        open_at=datetime.now(timezone.utc) + timedelta(days=5), due_at=None, allow_late=False,
    )
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas",
        json={"name": "x.pdf", "file_base64": PDF_BASE64},
        headers=headers,
    )
    assert res.status_code == 400


def test_entregar_tarea_despues_de_cerrar_sin_tardias_da_400(app, client, monkeypatch):
    from datetime import datetime, timedelta, timezone

    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(
        id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT",
        open_at=None, due_at=datetime.now(timezone.utc) - timedelta(days=1), allow_late=False,
    )
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas",
        json={"name": "x.pdf", "file_base64": PDF_BASE64},
        headers=headers,
    )
    assert res.status_code == 400


def test_entregar_tarea_exitosa_primera_vez(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(
        id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT",
        open_at=None, due_at=None, allow_late=False,
    )
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        monkeypatch.setattr(cc_routes.storage, "nueva_clave", lambda owner_id, mime: "usuarios/x/entrega.pdf")
        monkeypatch.setattr(cc_routes.storage, "subir_bytes", lambda clave, contenido, mime: None)
        monkeypatch.setattr(cc_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cc_routes.db.session, "flush", lambda: None)
        monkeypatch.setattr(cc_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(
            cc_routes, "_entrega_bloqueada",
            lambda item_id, student_id, ahora, es_tardia: cc_routes.AssignmentSubmission(
                id=uuid.uuid4(), item_id=item_id, student_id=student_id, current_version=0, submitted_at=ahora, is_late=es_tardia,
            ),
        )

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas",
        json={"name": "entrega.pdf", "mime_type": "application/pdf", "file_base64": PDF_BASE64},
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["is_late"] is False


def test_listar_entregas_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))

    headers = _headers(app, "TEACHER")
    res = client.get(
        f"/api/cursos/{curso.id}/bloques/11111111-1111-1111-1111-111111111111"
        "/contenido/33333333-3333-3333-3333-333333333333/entregas",
        headers=headers,
    )
    assert res.status_code == 403


def test_calificar_entrega_supera_el_maximo_da_400(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", max_score=10)
    entrega = SimpleNamespace(id=uuid.uuid4(), item_id=item.id, file_id=None)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: entrega)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.patch(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas/{entrega.id}",
        json={"score": 15},
        headers=headers,
    )
    assert res.status_code == 400


def test_calificar_entrega_exitosa(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", max_score=10)
    entrega = cc_routes.AssignmentSubmission(id=uuid.uuid4(), item_id=item.id, student_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: entrega)))
        monkeypatch.setattr(cc_routes.db.session, "commit", lambda: None)

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.patch(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas/{entrega.id}",
        json={"score": 8, "feedback": "Buen avance"},
        headers=headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["score"] == 8.0
    assert body["feedback"] == "Buen avance"
    assert entrega.graded_at.tzinfo is not None
    assert body["graded_at"].endswith("+00:00")


def test_obtener_archivo_entrega_rechaza_estudiante_ajeno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT")
    entrega = SimpleNamespace(id=uuid.uuid4(), item_id=item.id, file_id=uuid.uuid4(), student_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: entrega)))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))

    headers = _headers(app, "STUDENT")
    res = client.get(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas/{entrega.id}/archivo",
        headers=headers,
    )
    assert res.status_code == 403
