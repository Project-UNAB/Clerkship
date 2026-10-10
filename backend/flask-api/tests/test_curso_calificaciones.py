"""Libro de calificaciones: permisos (docente dueño ve todo, estudiante solo
lo suyo) y que junte bien notas de Tareas + Cuestionarios con el cálculo del
promedio. No toca la base real — todo con monkeypatch."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.curso_calificaciones as cal_routes
from tests.fakes import ConsultaFalsa


def _token(app, role, identity="11111111-1111-1111-1111-111111111111"):
    with app.app_context():
        return create_access_token(identity=identity, additional_claims={"role": role})


def _headers(app, role, identity="11111111-1111-1111-1111-111111111111"):
    return {"Authorization": f"Bearer {_token(app, role, identity)}"}


def _mock_items(monkeypatch, items):
    """CourseContentItem.query.join(...).filter(...).order_by(...).all()"""
    chain = SimpleNamespace(
        filter=lambda *a: SimpleNamespace(order_by=lambda *a2: SimpleNamespace(all=lambda: items))
    )
    monkeypatch.setattr(cal_routes.CourseContentItem, "query", SimpleNamespace(join=lambda *a: chain))


def test_calificaciones_requiere_sesion(client):
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/calificaciones")
    assert res.status_code == 401


def test_calificaciones_rechaza_estudiante(app, client):
    headers = _headers(app, "STUDENT")
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/calificaciones", headers=headers)
    assert res.status_code == 403


def test_calificaciones_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cal_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cal_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
    headers = _headers(app, "TEACHER")
    res = client.get(f"/api/cursos/{curso.id}/calificaciones", headers=headers)
    assert res.status_code == 403


def test_calificaciones_junta_tarea_y_quiz_con_promedio(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)

    tarea = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", title="Avances", position=0, max_score=10)
    quiz = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ", title="Parcial 1", position=1, max_score=None)

    entrega = SimpleNamespace(student_id=estudiante_id, item_id=tarea.id, score=8)
    pregunta1 = SimpleNamespace(item_id=quiz.id, points=5)
    pregunta2 = SimpleNamespace(item_id=quiz.id, points=5)
    intento = SimpleNamespace(student_id=estudiante_id, item_id=quiz.id, submitted_at="2026-01-01", score=6)

    student = SimpleNamespace(student_code="EST001")
    user_row = SimpleNamespace(id=estudiante_id, first_name="Luisa", last_name="Ramírez")
    matricula = SimpleNamespace()

    with app.app_context():
        monkeypatch.setattr(cal_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cal_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        _mock_items(monkeypatch, [tarea, quiz])

        monkeypatch.setattr(
            cal_routes.AssignmentSubmission, "query",
            SimpleNamespace(filter=lambda *a: SimpleNamespace(all=lambda: [entrega])),
        )
        monkeypatch.setattr(
            cal_routes.QuizAttempt, "query",
            SimpleNamespace(filter=lambda *a: SimpleNamespace(all=lambda: [intento])),
        )

        # db.session.query(...) se usa dos veces con formas distintas:
        # 1) suma de puntos de preguntas del quiz, 2) matrícula+estudiante+usuario.
        def fake_query(*args):
            if args and args[0] is cal_routes.QuizQuestion.item_id:
                return SimpleNamespace(
                    filter=lambda *a: SimpleNamespace(
                        group_by=lambda *a2: SimpleNamespace(all=lambda: [(quiz.id, 10)])
                    )
                )
            return ConsultaFalsa(todos=[(matricula, student, user_row)])
        monkeypatch.setattr(cal_routes.db.session, "query", fake_query)

    headers = _headers(app, "TEACHER", identity=str(docente_id))
    res = client.get(f"/api/cursos/{curso.id}/calificaciones", headers=headers)
    assert res.status_code == 200
    body = res.get_json()

    assert len(body["items"]) == 2
    quiz_meta = next(i for i in body["items"] if i["type"] == "QUIZ")
    assert quiz_meta["max_score"] == 10.0

    fila = body["estudiantes"][0]
    assert fila["nombre"] == "Luisa Ramírez"
    assert fila["calificaciones"][str(tarea.id)]["score"] == 8
    assert fila["calificaciones"][str(quiz.id)]["score"] == 6
    # (8/10 + 6/10) / (10+10) * 100 = 70.0
    assert fila["promedio"] == 70.0


def test_mis_calificaciones_requiere_sesion(client):
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/calificaciones/mias")
    assert res.status_code == 401


def test_mis_calificaciones_rechaza_no_matriculado(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cal_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(cal_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cal_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: None)))
    headers = _headers(app, "STUDENT")
    res = client.get(f"/api/cursos/{curso.id}/calificaciones/mias", headers=headers)
    assert res.status_code == 403


def test_mis_calificaciones_devuelve_solo_lo_propio(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    tarea = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", title="Avances", position=0, max_score=10)

    with app.app_context():
        monkeypatch.setattr(cal_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cal_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cal_routes.StudentCourse, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: object())))
        _mock_items(monkeypatch, [tarea])
        monkeypatch.setattr(
            cal_routes.AssignmentSubmission, "query",
            SimpleNamespace(filter=lambda *a: SimpleNamespace(all=lambda: [])),
        )

    headers = _headers(app, "STUDENT", identity=str(estudiante_id))
    res = client.get(f"/api/cursos/{curso.id}/calificaciones/mias", headers=headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["items"][0]["title"] == "Avances"
    assert body["calificaciones"] == {}
    assert body["promedio"] is None
