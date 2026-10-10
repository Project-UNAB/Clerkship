"""Fase 2 — concurrencia en entregas y cuestionarios: upsert de la entrega,
bloqueo de fila al iniciar/entregar un intento, tiempo límite con tolerancia,
intento finalizado inmutable, política de nota y transacciones con rollback.

No toca la base real ni R2 — todo con monkeypatch. Lo que solo se puede ver
con Postgres de verdad (que dos peticiones simultáneas esperen el candado) se
comprueba con scripts/prueba_concurrencia.py contra un backend corriendo."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

import app.routes.curso_calificaciones as cal_routes
import app.routes.curso_contenido as cc_routes
import app.routes.curso_quiz as cq_routes
from app.services import quiz_intentos
from app.services.transacciones import transaccion

PDF_BASE64 = "JVBERi0xLjQKJSVFT0YK"
AHORA = datetime.now(timezone.utc)


def _headers(app, role, identity):
    with app.app_context():
        token = create_access_token(identity=str(identity), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def _query(first=None, todos=None, bloqueos=None):
    """Query falsa. Si se pasa `bloqueos`, anota cada with_for_update()."""
    q = SimpleNamespace(first=lambda: first, one=lambda: first, all=lambda: todos or [])
    q.filter_by = lambda **kw: q
    q.filter = lambda *a: q
    q.order_by = lambda *a: q
    q.populate_existing = lambda: q
    q.execution_options = lambda **kw: q

    def with_for_update(**kw):
        if bloqueos is not None:
            bloqueos.append(True)
        return q

    q.with_for_update = with_for_update
    return q


class _Sesion:
    """Reemplaza add/commit/rollback/flush de db.session y anota lo que pasa."""

    def __init__(self, app, monkeypatch, modulo, commit_falla=None):
        self.agregados = []
        self.borrados = []
        self.commits = 0
        self.rollbacks = 0
        self._commit_falla = commit_falla
        with app.app_context():
            monkeypatch.setattr(modulo.db.session, "add", self.agregados.append)
            monkeypatch.setattr(modulo.db.session, "delete", self.borrados.append)
            monkeypatch.setattr(modulo.db.session, "flush", lambda: None)
            monkeypatch.setattr(modulo.db.session, "commit", self._commit)
            monkeypatch.setattr(modulo.db.session, "rollback", self._rollback)

    def _commit(self):
        if self._commit_falla is not None:
            raise self._commit_falla
        self.commits += 1

    def _rollback(self):
        self.rollbacks += 1


@pytest.fixture(autouse=True)
def _bloque_del_curso(app, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(cc_routes.CourseBlock, "query", _query(first=object()))


# ─────────────────────────── Reglas puras ───────────────────────────

def _entregado(numero, score, hace_minutos=0):
    return SimpleNamespace(attempt_number=numero, score=score, submitted_at=AHORA - timedelta(minutes=hace_minutos))


@pytest.mark.parametrize("politica,esperada", [
    ("BEST", 9.0),
    ("LAST", 4.0),
    ("FIRST", 6.0),
    ("AVERAGE", 6.33),
    (None, 9.0),          # sin política guardada: mejor intento
    ("otra", 9.0),
])
def test_nota_segun_politica(politica, esperada):
    # Desordenados a propósito: el orden lo da attempt_number.
    intentos = [_entregado(3, 4), _entregado(1, 6), _entregado(2, 9)]
    assert quiz_intentos.nota_segun_politica(intentos, politica) == esperada


def test_nota_ignora_intentos_sin_entregar():
    abierto = SimpleNamespace(attempt_number=2, score=None, submitted_at=None)
    assert quiz_intentos.nota_segun_politica([_entregado(1, 5), abierto], "LAST") == 5.0
    assert quiz_intentos.nota_segun_politica([abierto], "BEST") is None
    assert quiz_intentos.nota_segun_politica([], "AVERAGE") is None


def test_intento_vencido_en_cero_cuenta_para_la_nota():
    intentos = [_entregado(1, 8), _entregado(2, 0)]
    assert quiz_intentos.nota_segun_politica(intentos, "LAST") == 0.0
    assert quiz_intentos.nota_segun_politica(intentos, "AVERAGE") == 4.0


def test_deadline_es_lo_que_llegue_primero():
    inicio = AHORA
    assert quiz_intentos.calcular_deadline(inicio, None, None) is None
    assert quiz_intentos.calcular_deadline(inicio, 20, None) == inicio + timedelta(minutes=20)
    cierre = inicio + timedelta(minutes=5)
    assert quiz_intentos.calcular_deadline(inicio, 20, cierre) == cierre
    assert quiz_intentos.calcular_deadline(inicio, None, cierre) == cierre
    # due_at sin zona (como lo devuelve una columna TIMESTAMP) se toma como UTC.
    assert quiz_intentos.calcular_deadline(inicio, 20, cierre.replace(tzinfo=None)) == cierre


def test_vencimiento_respeta_la_tolerancia():
    deadline = AHORA
    assert quiz_intentos.esta_vencido(None, AHORA + timedelta(days=9), 30) is False
    assert quiz_intentos.esta_vencido(deadline, AHORA + timedelta(seconds=29), 30) is False
    assert quiz_intentos.esta_vencido(deadline, AHORA + timedelta(seconds=31), 30) is True
    assert quiz_intentos.esta_vencido(deadline, AHORA + timedelta(seconds=1), 0) is True


def test_transaccion_confirma_o_deshace_todo(app, monkeypatch):
    sesion = _Sesion(app, monkeypatch, cq_routes)
    with app.app_context():
        with transaccion():
            pass
        assert (sesion.commits, sesion.rollbacks) == (1, 0)

        with pytest.raises(RuntimeError):
            with transaccion():
                raise RuntimeError("falla a mitad de la escritura")
        assert (sesion.commits, sesion.rollbacks) == (1, 1)


def test_transaccion_deshace_si_falla_el_commit(app, monkeypatch):
    sesion = _Sesion(app, monkeypatch, cq_routes, commit_falla=IntegrityError("x", {}, Exception("dup")))
    with app.app_context():
        with pytest.raises(IntegrityError):
            with transaccion():
                pass
    assert sesion.rollbacks == 1


# ─────────────────────────── Entregas ───────────────────────────

def _tarea():
    return SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", open_at=None, due_at=None, allow_late=False)


def _preparar_entrega(app, monkeypatch, estudiante_id, curso, item, entrega_existente=None, commit_falla=None):
    borrados_r2 = []
    sesion = _Sesion(app, monkeypatch, cc_routes, commit_falla=commit_falla)

    def entrega_bloqueada(item_id, student_id, ahora, es_tardia):
        if entrega_existente is not None:
            return entrega_existente
        return cc_routes.AssignmentSubmission(
            id=uuid.uuid4(), item_id=item_id, student_id=student_id, current_version=0, submitted_at=ahora, is_late=es_tardia,
        )

    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", _query(first=object()))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", _query(first=item))
        monkeypatch.setattr(cc_routes, "_entrega_bloqueada", entrega_bloqueada)
        # Lo que se "guarda" en la sesión falsa es lo que después se lee de vuelta.
        monkeypatch.setattr(
            cc_routes, "_archivos_de_entregas",
            lambda ids: {str(i): [o for o in sesion.agregados if isinstance(o, cc_routes.SubmissionFile)] for i in ids},
        )
        monkeypatch.setattr(cc_routes.storage, "nueva_clave", lambda owner_id, mime: "usuarios/x/nuevo.pdf")
        monkeypatch.setattr(cc_routes.storage, "subir_bytes", lambda clave, contenido, mime: None)
        monkeypatch.setattr(cc_routes.storage, "borrar", borrados_r2.append)
    ruta = f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas"
    return ruta, sesion, borrados_r2


def test_upsert_de_entrega_es_on_conflict_y_bloquea_la_fila(app, monkeypatch):
    """El SQL que sale: INSERT ... ON CONFLICT (item_id, student_id) DO NOTHING
    y después SELECT ... FOR UPDATE de esa fila."""
    ejecutadas = []
    entrega = object()
    bloqueos = []
    with app.app_context():
        monkeypatch.setattr(cc_routes.db.session, "execute", ejecutadas.append)
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", _query(first=entrega, bloqueos=bloqueos))
        resultado = cc_routes._entrega_bloqueada(uuid.uuid4(), uuid.uuid4(), AHORA, False)

    sql = str(ejecutadas[0].compile(dialect=postgresql.dialect()))
    assert "INSERT INTO assignment_submissions" in sql
    assert "ON CONFLICT (item_id, student_id) DO NOTHING" in sql
    assert bloqueos == [True]
    assert resultado is entrega


def test_select_de_la_entrega_lleva_for_update(app):
    with app.app_context():
        consulta = (
            cc_routes.AssignmentSubmission.query.filter_by(item_id=uuid.uuid4(), student_id=uuid.uuid4())
            .with_for_update()
            .statement
        )
        assert "FOR UPDATE" in str(consulta.compile(dialect=postgresql.dialect()))


def test_reentrega_usa_la_misma_fila_y_conserva_la_version_anterior(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _tarea()
    anterior = cc_routes.AssignmentSubmission(
        id=uuid.uuid4(), item_id=item.id, student_id=estudiante_id, current_version=1,
        submitted_at=AHORA - timedelta(days=1), is_late=False, score=9, feedback="Bien",
    )
    ruta, sesion, borrados_r2 = _preparar_entrega(app, monkeypatch, estudiante_id, curso, item, entrega_existente=anterior)

    res = client.post(ruta, json={"name": "v2.pdf", "file_base64": PDF_BASE64}, headers=_headers(app, "STUDENT", estudiante_id))

    assert res.status_code == 201
    body = res.get_json()
    assert body["id"] == str(anterior.id)                       # la misma fila, no una nueva
    assert body["version"] == 2
    assert anterior.score is None and anterior.feedback is None  # hay que volver a calificar
    assert not any(isinstance(o, cc_routes.AssignmentSubmission) for o in sesion.agregados)
    assert sesion.commits == 1
    # La versión anterior es historial: ni se borra su fila ni su archivo en R2.
    assert sesion.borrados == [] and borrados_r2 == []


def test_si_falla_el_commit_de_la_entrega_se_deshace_todo(app, client, monkeypatch):
    """Rollback, se quita de R2 el archivo recién subido y el anterior NO se toca."""
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _tarea()
    anterior = cc_routes.AssignmentSubmission(
        id=uuid.uuid4(), item_id=item.id, student_id=estudiante_id, current_version=1, submitted_at=AHORA, is_late=False,
    )
    ruta, sesion, borrados_r2 = _preparar_entrega(
        app, monkeypatch, estudiante_id, curso, item, entrega_existente=anterior, commit_falla=RuntimeError("se cayó la base"),
    )
    app.config["PROPAGATE_EXCEPTIONS"] = False

    res = client.post(ruta, json={"name": "v2.pdf", "file_base64": PDF_BASE64}, headers=_headers(app, "STUDENT", estudiante_id))

    assert res.status_code == 500
    assert sesion.rollbacks == 1
    assert borrados_r2 == ["usuarios/x/nuevo.pdf"]


def test_borrar_contenido_toca_r2_solo_despues_de_confirmar(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="DOCUMENT", file_id=uuid.uuid4())
    borrados_r2 = []
    sesion = _Sesion(app, monkeypatch, cc_routes, commit_falla=RuntimeError("se cayó la base"))
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", _query(first=item))
        monkeypatch.setattr(cc_routes.UserFile, "query", SimpleNamespace(get=lambda _id: SimpleNamespace(storage_key="usuarios/x/doc.pdf")))
        monkeypatch.setattr(cc_routes.storage, "borrar", borrados_r2.append)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    res = client.delete(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}", headers=_headers(app, "TEACHER", docente_id),
    )

    assert res.status_code == 500
    assert sesion.rollbacks == 1
    assert borrados_r2 == []      # el documento sigue referenciado: no se pierde


def test_crear_quiz_guarda_la_politica_de_nota(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    block_id = uuid.uuid4()
    sesion = _Sesion(app, monkeypatch, cc_routes)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.db.session, "query", lambda *a: SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(scalar=lambda: -1)))

    ruta = f"/api/cursos/{curso.id}/bloques/{block_id}/contenido"
    res = client.post(
        ruta, json={"type": "QUIZ", "title": "Parcial", "max_attempts": 2, "grade_policy": "AVERAGE"},
        headers=_headers(app, "TEACHER", docente_id),
    )
    assert res.status_code == 201
    assert res.get_json()["grade_policy"] == "AVERAGE"
    assert sesion.commits == 1

    res = client.post(ruta, json={"type": "QUIZ", "title": "Parcial"}, headers=_headers(app, "TEACHER", docente_id))
    assert res.get_json()["grade_policy"] == "BEST"

    res = client.post(
        ruta, json={"type": "QUIZ", "title": "Parcial", "grade_policy": "MEDIANA"}, headers=_headers(app, "TEACHER", docente_id),
    )
    assert res.status_code == 400


# ─────────────────────────── Cuestionarios ───────────────────────────

def _quiz(**kw):
    datos = dict(
        id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ", open_at=None, due_at=None,
        max_attempts=None, time_limit_minutes=None, grade_policy="BEST",
    )
    datos.update(kw)
    return SimpleNamespace(**datos)


def _pregunta(item, puntos=1):
    pregunta = cq_routes.QuizQuestion(id=uuid.uuid4(), item_id=item.id, type="SINGLE_CHOICE", prompt="P", points=puntos, position=0)
    correcta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=pregunta.id, text="A", is_correct=True, position=0)
    incorrecta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=pregunta.id, text="B", is_correct=False, position=1)
    return pregunta, correcta, incorrecta


def _intento(item, estudiante_id, numero=1, entregado=False, deadline=None, inicio=None):
    intento = cq_routes.QuizAttempt(
        id=uuid.uuid4(), item_id=item.id, student_id=estudiante_id, attempt_number=numero,
        started_at=inicio or AHORA, deadline_at=deadline, max_score=1, expired=False,
    )
    intento.submitted_at = AHORA if entregado else None
    intento.score = 1 if entregado else None
    return intento


def _preparar_quiz(app, monkeypatch, estudiante_id, curso, item, preguntas, intentos=(), intento=None,
                   guardadas=(), matriculado=True, commit_falla=None, politica=None, tolerancia=None):
    bloqueos = {"matricula": [], "intento": []}
    sesion = _Sesion(app, monkeypatch, cq_routes, commit_falla=commit_falla)
    if politica is not None:
        app.config["QUIZ_LATE_POLICY"] = politica
    if tolerancia is not None:
        app.config["QUIZ_GRACE_SECONDS"] = tolerancia
    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.CourseBlock, "query", _query(first=object()))
        monkeypatch.setattr(
            cq_routes.StudentCourse, "query",
            _query(first=object() if matriculado else None, bloqueos=bloqueos["matricula"]),
        )
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", _query(first=item))
        monkeypatch.setattr(
            cq_routes.QuizAttempt, "query", _query(first=intento, todos=list(intentos), bloqueos=bloqueos["intento"]),
        )
        monkeypatch.setattr(cq_routes.QuizAnswer, "query", _query(todos=list(guardadas)))
        monkeypatch.setattr(cq_routes, "_preguntas_con_opciones", lambda item_id: preguntas)
    base = f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/intentos"
    return base, sesion, bloqueos


@pytest.fixture(autouse=True)
def _config_quiz(app):
    """Cada test arranca con la configuración por defecto de tiempo límite."""
    anterior = (app.config.get("QUIZ_LATE_POLICY"), app.config.get("QUIZ_GRACE_SECONDS"), app.config.get("PROPAGATE_EXCEPTIONS"))
    app.config["QUIZ_LATE_POLICY"] = "GRADE_SAVED"
    app.config["QUIZ_GRACE_SECONDS"] = 30
    yield
    app.config["QUIZ_LATE_POLICY"], app.config["QUIZ_GRACE_SECONDS"], app.config["PROPAGATE_EXCEPTIONS"] = anterior


def test_iniciar_intento_bloquea_la_matricula_y_guarda_inicio_y_limite(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(time_limit_minutes=20, max_attempts=3)
    pregunta, correcta, incorrecta = _pregunta(item)
    previo = _intento(item, estudiante_id, numero=1, entregado=True)
    base, sesion, bloqueos = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])], intentos=[previo],
    )

    res = client.post(base, headers=_headers(app, "STUDENT", estudiante_id))

    assert res.status_code == 201
    assert bloqueos["matricula"] == [True]            # SELECT ... FOR UPDATE antes de contar
    nuevo = next(o for o in sesion.agregados if isinstance(o, cq_routes.QuizAttempt))
    assert nuevo.attempt_number == 2
    assert nuevo.started_at is not None
    assert nuevo.deadline_at - nuevo.started_at == timedelta(minutes=20)
    body = res.get_json()
    assert body["reanudado"] is False
    assert 1190 <= body["segundos_restantes"] <= 1200
    assert "is_correct" not in str(body["preguntas"][0]["choices"])


def test_select_de_la_matricula_lleva_for_update(app):
    with app.app_context():
        consulta = (
            cq_routes.StudentCourse.query.filter_by(student_id=uuid.uuid4(), course_id=uuid.uuid4()).with_for_update().statement
        )
        assert "FOR UPDATE" in str(consulta.compile(dialect=postgresql.dialect()))


def test_el_limite_del_intento_no_pasa_del_cierre_del_cuestionario(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    cierre = datetime.now(timezone.utc) + timedelta(minutes=5)
    item = _quiz(time_limit_minutes=60, due_at=cierre)
    pregunta, correcta, incorrecta = _pregunta(item)
    base, sesion, _ = _preparar_quiz(app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])])

    assert client.post(base, headers=_headers(app, "STUDENT", estudiante_id)).status_code == 201
    nuevo = next(o for o in sesion.agregados if isinstance(o, cq_routes.QuizAttempt))
    assert nuevo.deadline_at == cierre


def test_segunda_peticion_retoma_el_intento_abierto_en_vez_de_crear_otro(app, client, monkeypatch):
    """Es lo que ve la petición que esperó el candado: el intento de la primera."""
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(time_limit_minutes=20, max_attempts=1)
    pregunta, correcta, incorrecta = _pregunta(item)
    abierto = _intento(item, estudiante_id, deadline=datetime.now(timezone.utc) + timedelta(minutes=10))
    guardada = cq_routes.QuizAnswer(id=uuid.uuid4(), attempt_id=abierto.id, question_id=pregunta.id, selected_choice_ids=[incorrecta.id])
    base, sesion, _ = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])],
        intentos=[abierto], guardadas=[guardada],
    )

    res = client.post(base, headers=_headers(app, "STUDENT", estudiante_id))

    assert res.status_code == 200
    body = res.get_json()
    assert body["reanudado"] is True and body["id"] == str(abierto.id)
    assert body["preguntas"][0]["tu_respuesta"]["selected_choice_ids"] == [str(incorrecta.id)]
    assert body["preguntas"][0]["tu_respuesta"]["is_correct"] is None
    assert not any(isinstance(o, cq_routes.QuizAttempt) for o in sesion.agregados)


def test_con_los_intentos_agotados_no_se_crea_otro(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(max_attempts=2)
    pregunta, correcta, incorrecta = _pregunta(item)
    usados = [_intento(item, estudiante_id, numero=n, entregado=True) for n in (1, 2)]
    base, sesion, _ = _preparar_quiz(app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])], intentos=usados)

    res = client.post(base, headers=_headers(app, "STUDENT", estudiante_id))

    assert res.status_code == 400
    assert sesion.agregados == [] and sesion.commits == 0
    assert sesion.rollbacks == 1          # suelta el candado sin escribir nada


def test_intento_abierto_vencido_se_cierra_y_cuenta_como_usado(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(time_limit_minutes=10, max_attempts=1)
    pregunta, correcta, incorrecta = _pregunta(item, puntos=2)
    abandonado = _intento(item, estudiante_id, deadline=datetime.now(timezone.utc) - timedelta(hours=1))
    guardada = cq_routes.QuizAnswer(id=uuid.uuid4(), attempt_id=abandonado.id, question_id=pregunta.id, selected_choice_ids=[correcta.id])
    base, sesion, _ = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])],
        intentos=[abandonado], guardadas=[guardada],
    )

    res = client.post(base, headers=_headers(app, "STUDENT", estudiante_id))

    # Se califica lo que había guardado y, como era su único intento, no hay otro.
    assert res.status_code == 400
    assert abandonado.submitted_at is not None and abandonado.expired is True
    assert float(abandonado.score) == 2.0
    assert sesion.commits == 1


def test_choque_con_la_restriccion_unica_responde_409(app, client, monkeypatch):
    """Segunda barrera: si algo se salta el candado, el UNIQUE de quiz_attempts frena el duplicado."""
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(max_attempts=1)
    pregunta, correcta, incorrecta = _pregunta(item)
    base, sesion, _ = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])],
        commit_falla=IntegrityError("INSERT", {}, Exception("uq_quiz_attempts_un_abierto")),
    )

    res = client.post(base, headers=_headers(app, "STUDENT", estudiante_id))

    assert res.status_code == 409
    assert sesion.rollbacks == 1


def test_no_matriculado_no_inicia_intento(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz()
    base, sesion, _ = _preparar_quiz(app, monkeypatch, estudiante_id, curso, item, [], matriculado=False)
    assert client.post(base, headers=_headers(app, "STUDENT", estudiante_id)).status_code == 403
    assert sesion.agregados == []


def test_entregar_bloquea_el_intento_y_lo_finaliza(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(time_limit_minutes=10)
    pregunta, correcta, incorrecta = _pregunta(item, puntos=3)
    intento = _intento(item, estudiante_id, deadline=datetime.now(timezone.utc) + timedelta(minutes=5))
    base, sesion, bloqueos = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])], intento=intento,
    )

    res = client.post(
        f"{base}/{intento.id}/responder",
        json={"answers": [{"question_id": str(pregunta.id), "selected_choice_ids": [str(correcta.id)]}]},
        headers=_headers(app, "STUDENT", estudiante_id),
    )

    assert res.status_code == 200
    assert bloqueos["intento"] == [True]
    body = res.get_json()
    assert body["score"] == 3.0 and body["completed"] is True
    assert body["vencido"] is False and body["expired"] is False
    assert sesion.commits == 1


@pytest.mark.parametrize("ruta,metodo", [("responder", "post"), ("respuestas", "put")])
def test_intento_finalizado_no_se_reenvia_ni_se_modifica(app, client, monkeypatch, ruta, metodo):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz()
    pregunta, correcta, incorrecta = _pregunta(item)
    intento = _intento(item, estudiante_id, entregado=True)
    nota_original = intento.score
    base, sesion, _ = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])], intento=intento,
    )

    res = getattr(client, metodo)(
        f"{base}/{intento.id}/{ruta}",
        json={"answers": [{"question_id": str(pregunta.id), "selected_choice_ids": [str(correcta.id)]}]},
        headers=_headers(app, "STUDENT", estudiante_id),
    )

    assert res.status_code == 409
    assert intento.score == nota_original
    assert sesion.agregados == [] and sesion.commits == 0


def test_envio_dentro_de_la_tolerancia_se_acepta(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(time_limit_minutes=10)
    pregunta, correcta, incorrecta = _pregunta(item)
    intento = _intento(item, estudiante_id, deadline=datetime.now(timezone.utc) - timedelta(seconds=10))
    base, _, _ = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])], intento=intento, tolerancia=30,
    )

    res = client.post(
        f"{base}/{intento.id}/responder",
        json={"answers": [{"question_id": str(pregunta.id), "selected_choice_ids": [str(correcta.id)]}]},
        headers=_headers(app, "STUDENT", estudiante_id),
    )

    assert res.status_code == 200
    assert res.get_json()["score"] == 1.0 and res.get_json()["vencido"] is False


def test_envio_tardio_califica_solo_lo_guardado(app, client, monkeypatch):
    """GRADE_SAVED: lo que llega en el envío tardío se ignora."""
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(time_limit_minutes=10)
    p1, p1_ok, p1_mal = _pregunta(item, puntos=2)
    p2, p2_ok, p2_mal = _pregunta(item, puntos=5)
    intento = _intento(item, estudiante_id, deadline=datetime.now(timezone.utc) - timedelta(minutes=5))
    # A tiempo solo alcanzó a guardar bien la primera.
    guardada = cq_routes.QuizAnswer(id=uuid.uuid4(), attempt_id=intento.id, question_id=p1.id, selected_choice_ids=[p1_ok.id])
    base, sesion, _ = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(p1, [p1_ok, p1_mal]), (p2, [p2_ok, p2_mal])],
        intento=intento, guardadas=[guardada], politica="GRADE_SAVED",
    )

    res = client.post(
        f"{base}/{intento.id}/responder",
        json={"answers": [
            {"question_id": str(p1.id), "selected_choice_ids": [str(p1_ok.id)]},
            {"question_id": str(p2.id), "selected_choice_ids": [str(p2_ok.id)]},   # llegó tarde: no cuenta
        ]},
        headers=_headers(app, "STUDENT", estudiante_id),
    )

    assert res.status_code == 200
    body = res.get_json()
    assert body["score"] == 2.0
    assert body["vencido"] is True and body["expired"] is True and body["completed"] is True
    assert sesion.commits == 1


def test_envio_tardio_en_modo_reject_se_rechaza_y_cierra_en_cero(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(time_limit_minutes=10)
    pregunta, correcta, incorrecta = _pregunta(item, puntos=4)
    intento = _intento(item, estudiante_id, deadline=datetime.now(timezone.utc) - timedelta(minutes=5))
    guardada = cq_routes.QuizAnswer(id=uuid.uuid4(), attempt_id=intento.id, question_id=pregunta.id, selected_choice_ids=[correcta.id])
    base, sesion, _ = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])],
        intento=intento, guardadas=[guardada], politica="REJECT",
    )

    res = client.post(
        f"{base}/{intento.id}/responder",
        json={"answers": [{"question_id": str(pregunta.id), "selected_choice_ids": [str(correcta.id)]}]},
        headers=_headers(app, "STUDENT", estudiante_id),
    )

    assert res.status_code == 409
    assert float(intento.score) == 0.0 and intento.expired is True and intento.submitted_at is not None
    assert sesion.commits == 1      # el cierre sí queda guardado: no se puede reintentar el envío


def test_intento_sin_limite_guardado_usa_el_cierre_del_cuestionario(app, client, monkeypatch):
    """Intentos anteriores a deadline_at: el límite sale del cuestionario."""
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(due_at=datetime.now(timezone.utc) - timedelta(hours=2))
    pregunta, correcta, incorrecta = _pregunta(item)
    intento = _intento(item, estudiante_id, deadline=None, inicio=datetime.now(timezone.utc) - timedelta(hours=3))
    base, _, _ = _preparar_quiz(app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])], intento=intento)

    res = client.post(
        f"{base}/{intento.id}/responder",
        json={"answers": [{"question_id": str(pregunta.id), "selected_choice_ids": [str(correcta.id)]}]},
        headers=_headers(app, "STUDENT", estudiante_id),
    )

    assert res.status_code == 200
    assert res.get_json()["vencido"] is True and res.get_json()["score"] == 0.0


def test_guardar_avance_no_califica_ni_entrega(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(time_limit_minutes=10)
    pregunta, correcta, incorrecta = _pregunta(item)
    intento = _intento(item, estudiante_id, deadline=datetime.now(timezone.utc) + timedelta(minutes=5))
    base, sesion, bloqueos = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])], intento=intento,
    )

    res = client.put(
        f"{base}/{intento.id}/respuestas",
        json={"answers": [{"question_id": str(pregunta.id), "selected_choice_ids": [str(correcta.id)]}]},
        headers=_headers(app, "STUDENT", estudiante_id),
    )

    assert res.status_code == 200
    assert bloqueos["intento"] == [True]
    fila = next(o for o in sesion.agregados if isinstance(o, cq_routes.QuizAnswer))
    assert fila.selected_choice_ids == [correcta.id] and fila.is_correct is None
    assert intento.submitted_at is None and intento.score is None
    assert "is_correct" not in res.get_data(as_text=True)
    assert 0 < res.get_json()["segundos_restantes"] <= 300


def test_guardar_avance_con_el_tiempo_vencido_se_rechaza(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(time_limit_minutes=10)
    pregunta, correcta, incorrecta = _pregunta(item)
    intento = _intento(item, estudiante_id, deadline=datetime.now(timezone.utc) - timedelta(minutes=5))
    base, sesion, _ = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])], intento=intento,
    )

    res = client.put(
        f"{base}/{intento.id}/respuestas",
        json={"answers": [{"question_id": str(pregunta.id), "selected_choice_ids": [str(correcta.id)]}]},
        headers=_headers(app, "STUDENT", estudiante_id),
    )

    assert res.status_code == 409
    assert sesion.agregados == [] and sesion.commits == 0


def test_ids_de_opcion_invalidos_dan_400_sin_tocar_el_intento(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz()
    pregunta, correcta, incorrecta = _pregunta(item)
    intento = _intento(item, estudiante_id)
    base, sesion, bloqueos = _preparar_quiz(
        app, monkeypatch, estudiante_id, curso, item, [(pregunta, [correcta, incorrecta])], intento=intento,
    )
    res = client.post(
        f"{base}/{intento.id}/responder",
        json={"answers": [{"question_id": str(pregunta.id), "selected_choice_ids": ["no-es-uuid"]}]},
        headers=_headers(app, "STUDENT", estudiante_id),
    )
    assert res.status_code == 400
    assert bloqueos["intento"] == [] and intento.submitted_at is None


def test_listado_del_estudiante_trae_la_nota_segun_la_politica(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(grade_policy="LAST")
    primero = _intento(item, estudiante_id, numero=1, entregado=True)
    primero.score = 9
    segundo = _intento(item, estudiante_id, numero=2, entregado=True)
    segundo.score = 5
    base, _, _ = _preparar_quiz(app, monkeypatch, estudiante_id, curso, item, [], intentos=[segundo, primero])

    body = client.get(base, headers=_headers(app, "STUDENT", estudiante_id)).get_json()

    assert body["grade_policy"] == "LAST"
    assert body["nota"] == 5.0
    assert len(body["intentos"]) == 2


# ─────────────────────────── Calificaciones ───────────────────────────

@pytest.mark.parametrize("politica,esperada", [("BEST", 9.0), ("LAST", 4.0), ("FIRST", 6.0), ("AVERAGE", 6.33)])
def test_mis_calificaciones_usa_la_politica_del_cuestionario(app, client, monkeypatch, politica, esperada):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    quiz = SimpleNamespace(
        id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ", title="Parcial", position=0, max_score=None, grade_policy=politica,
    )
    intentos = [
        SimpleNamespace(student_id=estudiante_id, item_id=quiz.id, attempt_number=n, score=s, submitted_at=AHORA)
        for n, s in ((1, 6), (2, 9), (3, 4))
    ]
    # El intento de otro estudiante no se mezcla con los suyos.
    intentos.append(SimpleNamespace(student_id=uuid.uuid4(), item_id=quiz.id, attempt_number=1, score=10, submitted_at=AHORA))

    with app.app_context():
        monkeypatch.setattr(cal_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cal_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cal_routes.StudentCourse, "query", _query(first=object()))
        cadena = SimpleNamespace(filter=lambda *a: SimpleNamespace(order_by=lambda *a2: SimpleNamespace(all=lambda: [quiz])))
        monkeypatch.setattr(cal_routes.CourseContentItem, "query", SimpleNamespace(join=lambda *a: cadena))
        monkeypatch.setattr(cal_routes.QuizAttempt, "query", _query(todos=intentos))
        monkeypatch.setattr(
            cal_routes.db.session, "query",
            lambda *a: SimpleNamespace(filter=lambda *a2: SimpleNamespace(group_by=lambda *a3: SimpleNamespace(all=lambda: [(quiz.id, 10)]))),
        )

    body = client.get(f"/api/cursos/{curso.id}/calificaciones/mias", headers=_headers(app, "STUDENT", estudiante_id)).get_json()

    assert body["items"][0]["grade_policy"] == politica
    celda = body["calificaciones"][str(quiz.id)]
    assert celda["score"] == esperada and celda["attempts"] == 3
    assert body["promedio"] == round(esperada / 10 * 100, 1)
