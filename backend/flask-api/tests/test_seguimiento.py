"""Pruebas del seguimiento docente en el simulador (/api/seguimiento/*)."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import uuid

from flask_jwt_extended import create_access_token

import app.routes.seguimiento as seguimiento_routes
from tests.fakes import ConsultaFalsa


def _token(app, role, identity="11111111-1111-1111-1111-111111111111"):
    with app.app_context():
        return create_access_token(identity=str(identity), additional_claims={"role": role})


def _mongo_falso(documentos):
    """Doble de get_mongo_db() que filtra por consultation_id y proyecta solo los campos pedidos."""
    def _find(filtro, proyeccion=None):
        ids_buscados = set((filtro.get("consultation_id") or {}).get("$in") or [])
        salida = []
        for doc in documentos:
            if doc.get("consultation_id") not in ids_buscados:
                continue
            if "ai_evaluation.desglose" in filtro and not (doc.get("ai_evaluation") or {}).get("desglose"):
                continue
            if proyeccion:
                item = {"consultation_id": doc.get("consultation_id")}
                if proyeccion.get("ai_evaluation.desglose"):
                    desglose = (doc.get("ai_evaluation") or {}).get("desglose")
                    item["ai_evaluation"] = {"desglose": desglose}
                salida.append(item)
            else:
                salida.append(doc)
        return salida

    return SimpleNamespace(consultations=SimpleNamespace(find=_find))


def test_seguimiento_requiere_sesion(client):
    cid = uuid.uuid4()
    assert client.get(f"/api/seguimiento/cursos/{cid}").status_code == 401
    assert client.get(f"/api/seguimiento/cursos/{cid}/estudiantes/{uuid.uuid4()}").status_code == 401


def test_estudiante_recibe_403(app, client):
    headers = {"Authorization": f"Bearer {_token(app, 'STUDENT')}"}
    cid = uuid.uuid4()
    assert client.get(f"/api/seguimiento/cursos/{cid}", headers=headers).status_code == 403
    assert client.get(f"/api/seguimiento/cursos/{cid}/estudiantes/{uuid.uuid4()}", headers=headers).status_code == 403


def test_docente_ajeno_recibe_403(app, client, monkeypatch):
    docente_dueno = uuid.uuid4()
    docente_ajeno = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_dueno, name="Gastroenterología I")

    with app.app_context():
        monkeypatch.setattr(seguimiento_routes.Course, "query", ConsultaFalsa(first=curso))

    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=docente_ajeno)}"}
    r_curso = client.get(f"/api/seguimiento/cursos/{curso.id}", headers=headers)
    assert r_curso.status_code == 403

    r_est = client.get(f"/api/seguimiento/cursos/{curso.id}/estudiantes/{uuid.uuid4()}", headers=headers)
    assert r_est.status_code == 403


def test_curso_inexistente_recibe_404(app, client, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(seguimiento_routes.Course, "query", ConsultaFalsa(first=None))

    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    cid = uuid.uuid4()
    assert client.get(f"/api/seguimiento/cursos/{cid}", headers=headers).status_code == 404
    assert client.get(f"/api/seguimiento/cursos/{cid}/estudiantes/{uuid.uuid4()}", headers=headers).status_code == 404


def test_estudiante_no_matriculado_recibe_404(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id, name="Clínica Digestiva")

    with app.app_context():
        monkeypatch.setattr(seguimiento_routes.Course, "query", ConsultaFalsa(first=curso))
        monkeypatch.setattr(seguimiento_routes.User, "query", ConsultaFalsa(first=None))

    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=docente_id)}"}
    res = client.get(
        f"/api/seguimiento/cursos/{curso.id}/estudiantes/{uuid.uuid4()}",
        headers=headers,
    )
    assert res.status_code == 404


def test_seguimiento_curso_calcula_promedios_subtemas_y_dimension_mas_debil(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id, name="Semiología Digestiva")

    est_1 = SimpleNamespace(
        id=uuid.uuid4(),
        first_name="Ana",
        last_name="Gómez",
        email="ana@clerk-ship.online",
    )
    est_2 = SimpleNamespace(
        id=uuid.uuid4(),
        first_name="Carlos",
        last_name="Pérez",
        email="carlos@clerk-ship.online",
    )

    t1 = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 10, 5, 14, 30, tzinfo=timezone.utc)

    c1 = SimpleNamespace(
        id=uuid.uuid4(),
        student_id=est_1.id,
        course_id=curso.id,
        subtema="Enfermedad por reflujo gastroesofágico",
        difficulty="EASY",
        status="COMPLETED",
        score=70.0,
        started_at=t1,
        finished_at=t1 + timedelta(minutes=15),
    )
    c2 = SimpleNamespace(
        id=uuid.uuid4(),
        student_id=est_1.id,
        course_id=curso.id,
        subtema="Gastritis aguda",
        difficulty="MEDIUM",
        status="COMPLETED",
        score=90.0,
        started_at=t2,
        finished_at=t2 + timedelta(minutes=25),
    )
    c3 = SimpleNamespace(
        id=uuid.uuid4(),
        student_id=est_2.id,
        course_id=curso.id,
        subtema="Gastritis aguda",
        difficulty="EASY",
        status="COMPLETED",
        score=50.0,
        started_at=t1,
        finished_at=t1 + timedelta(minutes=20),
    )
    consultas_completadas = [c1, c2, c3]

    docs_mongo = [
        {
            "consultation_id": str(c1.id),
            "ai_evaluation": {
                "desglose": [
                    {"dimension": "anamnesis", "puntaje": 80},
                    {"dimension": "razonamiento", "puntaje": 50},
                    {"dimension": "comunicacion", "puntaje": 85},
                ]
            },
        },
        {
            "consultation_id": str(c2.id),
            "ai_evaluation": {
                "desglose": [
                    {"dimension": "anamnesis", "puntaje": 90},
                    {"dimension": "razonamiento", "puntaje": 60},
                    {"dimension": "comunicacion", "puntaje": 95},
                ]
            },
        },
        {
            "consultation_id": str(c3.id),
            "ai_evaluation": {
                "desglose": [
                    {"dimension": "anamnesis", "puntaje": 60},
                    {"dimension": "exploracion", "puntaje": 40},
                ]
            },
        },
    ]

    def _promedios_subtema_falso(student_id):
        acumulado = {}
        for c in consultas_completadas:
            if c.student_id == student_id and c.subtema and c.score is not None:
                acumulado.setdefault(c.subtema, []).append(float(c.score))
        return {s: (sum(v), len(v)) for s, v in acumulado.items()}

    with app.app_context():
        monkeypatch.setattr(seguimiento_routes.Course, "query", ConsultaFalsa(first=curso))
        monkeypatch.setattr(seguimiento_routes.User, "query", ConsultaFalsa(todos=[est_1, est_2]))
        monkeypatch.setattr(
            seguimiento_routes.StudentCourse,
            "query",
            ConsultaFalsa(todos=[
                SimpleNamespace(student_id=est_1.id, course_id=curso.id),
                SimpleNamespace(student_id=est_2.id, course_id=curso.id),
            ]),
        )
        monkeypatch.setattr(
            seguimiento_routes.Consultation,
            "query",
            ConsultaFalsa(todos=consultas_completadas),
        )
        monkeypatch.setattr(seguimiento_routes, "get_mongo_db", lambda: _mongo_falso(docs_mongo))

    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=docente_id)}"}
    res = client.get(f"/api/seguimiento/cursos/{curso.id}", headers=headers)
    assert res.status_code == 200
    datos = res.get_json()

    assert datos["total"] == 2
    assert datos["curso_titulo"] == curso.name
    assert datos["resumen"]["total_consultas"] == 3
    assert datos["resumen"]["promedio_general"] == 70.0

    subtemas = {s["subtema"]: s for s in datos["resumen"]["promedio_por_subtema"]}
    assert subtemas["Enfermedad por reflujo gastroesofágico"]["promedio"] == 70.0
    assert subtemas["Gastritis aguda"]["promedio"] == 70.0

    por_id = {e["student_id"]: e for e in datos["estudiantes"]}
    fila_ana = por_id[str(est_1.id)]
    assert fila_ana["nombre"] == "Ana Gómez"
    assert fila_ana["consultas_completadas"] == 2
    assert fila_ana["promedio"] == 80.0
    assert fila_ana["ultimo_puntaje"] == 90.0
    assert fila_ana["fecha_ultima_consulta"] == (t2 + timedelta(minutes=25)).isoformat()
    assert fila_ana["dimension_debil"]["dimension"] == "razonamiento"
    assert fila_ana["dimension_debil"]["promedio"] == 55.0

    fila_carlos = por_id[str(est_2.id)]
    assert fila_carlos["consultas_completadas"] == 1
    assert fila_carlos["promedio"] == 50.0
    assert fila_carlos["dimension_debil"]["dimension"] == "exploracion"
    assert fila_carlos["dimension_debil"]["promedio"] == 40.0


def test_detalle_estudiante_evolucion_y_sin_exponer_diagnostico_oculto(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id, name="Clínica Gastroenterológica")
    estudiante = SimpleNamespace(
        id=uuid.uuid4(),
        first_name="Laura",
        last_name="Martínez",
        email="laura@clerk-ship.online",
    )

    t1 = datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 10, 6, 11, 0, tzinfo=timezone.utc)

    c1 = SimpleNamespace(
        id=uuid.uuid4(),
        student_id=estudiante.id,
        course_id=curso.id,
        subtema="Pancreatitis aguda",
        difficulty="MEDIUM",
        status="COMPLETED",
        score=65.0,
        started_at=t1,
        finished_at=t1 + timedelta(minutes=20),
    )
    c2 = SimpleNamespace(
        id=uuid.uuid4(),
        student_id=estudiante.id,
        course_id=curso.id,
        subtema="Colelitiasis",
        difficulty="HARD",
        status="COMPLETED",
        score=85.0,
        started_at=t2,
        finished_at=t2 + timedelta(minutes=30),
    )

    docs_mongo = [
        {
            "consultation_id": str(c1.id),
            "case": {"diagnostico_oculto": "Pancreatitis biliar aguda", "rubrica": "Rúbrica secreta"},
            "ai_evaluation": {
                "desglose": [
                    {"dimension": "hallazgos", "puntaje": 55},
                    {"dimension": "anamnesis", "puntaje": 75},
                ]
            },
        },
        {
            "consultation_id": str(c2.id),
            "case": {"diagnostico_oculto": "Cólico biliar simple", "rubrica": "Rúbrica secreta"},
            "ai_evaluation": {
                "desglose": [
                    {"dimension": "hallazgos", "puntaje": 75},
                    {"dimension": "anamnesis", "puntaje": 95},
                ]
            },
        },
    ]

    with app.app_context():
        monkeypatch.setattr(seguimiento_routes.Course, "query", ConsultaFalsa(first=curso))
        monkeypatch.setattr(seguimiento_routes.User, "query", ConsultaFalsa(first=estudiante))
        monkeypatch.setattr(seguimiento_routes.Consultation, "query", ConsultaFalsa(todos=[c1, c2]))
        monkeypatch.setattr(seguimiento_routes, "get_mongo_db", lambda: _mongo_falso(docs_mongo))

    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=docente_id)}"}
    res = client.get(
        f"/api/seguimiento/cursos/{curso.id}/estudiantes/{estudiante.id}",
        headers=headers,
    )
    assert res.status_code == 200
    datos = res.get_json()
    texto_respuesta = res.get_data(as_text=True)

    assert "Pancreatitis biliar aguda" not in texto_respuesta
    assert "Rúbrica secreta" not in texto_respuesta

    assert datos["estudiante"]["consultas_completadas"] == 2
    assert datos["estudiante"]["promedio"] == 75.0
    assert datos["estudiante"]["dimension_debil"]["dimension"] == "hallazgos"
    assert datos["estudiante"]["dimension_debil"]["promedio"] == 65.0
    assert [p["puntaje"] for p in datos["evolucion"]] == [65.0, 85.0]
    assert len(datos["consultas"]) == 2
    assert datos["consultas"][0]["subtema"] == "Colelitiasis"
    assert len(datos["consultas"][0]["desglose"]) == 2
