"""Banco de preguntas y toma de intentos de un cuestionario (QUIZ): permisos,
validación de opciones correctas, ventana de disponibilidad, límite de
intentos y calificación automática. No toca la base real — todo con
monkeypatch."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.curso_quiz as cq_routes


def _token(app, role, identity="11111111-1111-1111-1111-111111111111"):
    with app.app_context():
        return create_access_token(identity=identity, additional_claims={"role": role})


def _headers(app, role, identity="11111111-1111-1111-1111-111111111111"):
    return {"Authorization": f"Bearer {_token(app, role, identity)}"}


@pytest.fixture(autouse=True)
def _bloque_del_curso(app, monkeypatch):
    """Por defecto el bloque de la URL sí pertenece al curso. Los tests que
    prueban el cruce bloque-curso vuelven a parchear CourseBlock.query."""
    with app.app_context():
        monkeypatch.setattr(
            cq_routes.CourseBlock,
            "query",
            SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: SimpleNamespace(id=kw.get("id")))),
        )


def _q(first=None, todos=None):
    """Query falsa: filter_by / order_by / with_for_update devuelven lo mismo."""
    q = SimpleNamespace(first=lambda: first, all=lambda: todos or [])
    q.filter_by = lambda **kw: q
    q.order_by = lambda *a: q
    q.with_for_update = lambda **kw: q
    q.populate_existing = lambda: q
    return q


def _mock_preguntas_con_opciones(monkeypatch, preguntas_y_opciones):
    """preguntas_y_opciones: lista de (QuizQuestion, [QuizChoice, ...])."""
    monkeypatch.setattr(cq_routes, "_preguntas_con_opciones", lambda item_id: preguntas_y_opciones)


# ─────────────────────────── Preguntas ───────────────────────────

def test_preguntas_requiere_sesion(client):
    res = client.post(
        "/api/cursos/11111111-1111-1111-1111-111111111111/bloques/22222222-2222-2222-2222-222222222222"
        "/contenido/33333333-3333-3333-3333-333333333333/preguntas",
        json={},
    )
    assert res.status_code == 401


def test_crear_pregunta_rechaza_estudiante(app, client):
    headers = _headers(app, "STUDENT")
    res = client.post(
        "/api/cursos/11111111-1111-1111-1111-111111111111/bloques/22222222-2222-2222-2222-222222222222"
        "/contenido/33333333-3333-3333-3333-333333333333/preguntas",
        json={"type": "SINGLE_CHOICE", "prompt": "¿Cuál es?", "choices": [{"text": "A", "is_correct": True}, {"text": "B"}]},
        headers=headers,
    )
    assert res.status_code == 403


def test_crear_pregunta_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
    headers = _headers(app, "TEACHER")
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/22222222-2222-2222-2222-222222222222"
        "/contenido/33333333-3333-3333-3333-333333333333/preguntas",
        json={"type": "SINGLE_CHOICE", "prompt": "¿Cuál es?", "choices": [{"text": "A", "is_correct": True}, {"text": "B"}]},
        headers=headers,
    )
    assert res.status_code == 403


def test_crear_pregunta_single_choice_sin_correcta_da_400(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ")
    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/preguntas",
        json={"type": "SINGLE_CHOICE", "prompt": "¿Cuál es?", "choices": [{"text": "A"}, {"text": "B"}]},
        headers=headers,
    )
    assert res.status_code == 400


def test_crear_pregunta_single_choice_con_dos_correctas_da_400(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ")
    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/preguntas",
        json={"type": "SINGLE_CHOICE", "prompt": "¿Cuál es?", "choices": [{"text": "A", "is_correct": True}, {"text": "B", "is_correct": True}]},
        headers=headers,
    )
    assert res.status_code == 400


def test_crear_pregunta_exitosa(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ")
    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        monkeypatch.setattr(
            cq_routes.db.session,
            "query",
            lambda *a: SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(scalar=lambda: -1)),
        )
        monkeypatch.setattr(cq_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cq_routes.db.session, "flush", lambda: None)
        monkeypatch.setattr(cq_routes.db.session, "commit", lambda: None)

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/preguntas",
        json={
            "type": "TRUE_FALSE", "prompt": "El hígado produce bilis.", "points": 2,
            "choices": [{"text": "Verdadero", "is_correct": True}, {"text": "Falso", "is_correct": False}],
        },
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["type"] == "TRUE_FALSE"
    assert body["points"] == 2.0
    assert len(body["choices"]) == 2
    assert body["choices"][0]["is_correct"] is True


# ─────────────────────────── Intentos ───────────────────────────

def test_iniciar_intento_rechaza_no_matriculado(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.StudentCourse, "query", _q(first=None))
    headers = _headers(app, "STUDENT")
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/11111111-1111-1111-1111-111111111111"
        "/contenido/33333333-3333-3333-3333-333333333333/intentos",
        headers=headers,
    )
    assert res.status_code == 403


def test_iniciar_intento_sin_preguntas_da_400(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ", open_at=None, due_at=None, max_attempts=None)
    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.StudentCourse, "query", _q(first=object()))
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        monkeypatch.setattr(cq_routes.QuizAttempt, "query", _q(todos=[]))
        _mock_preguntas_con_opciones(monkeypatch, [])

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/intentos",
        headers=headers,
    )
    assert res.status_code == 400


def test_iniciar_intento_excede_max_intentos_da_400(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ", open_at=None, due_at=None, max_attempts=1)
    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.StudentCourse, "query", _q(first=object()))
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        usado = SimpleNamespace(submitted_at=datetime.now(timezone.utc), attempt_number=1)
        monkeypatch.setattr(cq_routes.QuizAttempt, "query", _q(todos=[usado]))
        _mock_preguntas_con_opciones(monkeypatch, [])

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/intentos",
        headers=headers,
    )
    assert res.status_code == 400


def test_iniciar_intento_exitoso_no_expone_respuesta_correcta(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ", open_at=None, due_at=None, max_attempts=None, time_limit_minutes=20)

    pregunta = cq_routes.QuizQuestion(id=uuid.uuid4(), item_id=item.id, type="SINGLE_CHOICE", prompt="¿Cuál es?", points=1, position=0)
    opcion_correcta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=pregunta.id, text="A", is_correct=True, position=0)
    opcion_incorrecta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=pregunta.id, text="B", is_correct=False, position=1)

    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.StudentCourse, "query", _q(first=object()))
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        monkeypatch.setattr(cq_routes.QuizAttempt, "query", _q(todos=[]))
        monkeypatch.setattr(cq_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cq_routes.db.session, "commit", lambda: None)
        _mock_preguntas_con_opciones(monkeypatch, [(pregunta, [opcion_correcta, opcion_incorrecta])])

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/intentos",
        headers=headers,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["max_score"] == 1.0
    assert body["time_limit_minutes"] == 20
    assert "is_correct" not in body["preguntas"][0]["choices"][0]


def test_responder_intento_ya_entregado_da_409(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ")
    intento = SimpleNamespace(id=uuid.uuid4(), item_id=item.id, student_id=estudiante_id, submitted_at="ya-entregado")
    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.StudentCourse, "query", _q(first=object()))
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        monkeypatch.setattr(cq_routes.QuizAttempt, "query", _q(first=intento))

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/intentos/{intento.id}/responder",
        json={"answers": []},
        headers=headers,
    )
    assert res.status_code == 409


def test_responder_intento_califica_automaticamente(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ")
    intento = cq_routes.QuizAttempt(id=uuid.uuid4(), item_id=item.id, student_id=estudiante_id)
    intento.submitted_at = None

    p1 = cq_routes.QuizQuestion(id=uuid.uuid4(), item_id=item.id, type="SINGLE_CHOICE", prompt="P1", points=1, position=0)
    p1_correcta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=p1.id, text="A", is_correct=True, position=0)
    p1_incorrecta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=p1.id, text="B", is_correct=False, position=1)

    p2 = cq_routes.QuizQuestion(id=uuid.uuid4(), item_id=item.id, type="SINGLE_CHOICE", prompt="P2", points=3, position=1)
    p2_correcta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=p2.id, text="C", is_correct=True, position=0)
    p2_incorrecta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=p2.id, text="D", is_correct=False, position=1)

    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.StudentCourse, "query", _q(first=object()))
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: item)))
        monkeypatch.setattr(cq_routes.QuizAttempt, "query", _q(first=intento))
        monkeypatch.setattr(cq_routes.QuizAnswer, "query", _q(todos=[]))
        monkeypatch.setattr(cq_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cq_routes.db.session, "commit", lambda: None)
        _mock_preguntas_con_opciones(monkeypatch, [
            (p1, [p1_correcta, p1_incorrecta]),
            (p2, [p2_correcta, p2_incorrecta]),
        ])

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/intentos/{intento.id}/responder",
        json={"answers": [
            {"question_id": str(p1.id), "selected_choice_ids": [str(p1_correcta.id)]},
            {"question_id": str(p2.id), "selected_choice_ids": [str(p2_incorrecta.id)]},
        ]},
        headers=headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    # P1 correcta (1 punto), P2 incorrecta (0 de 3) -> 1.0 total
    assert body["score"] == 1.0
    assert body["completed"] is True
