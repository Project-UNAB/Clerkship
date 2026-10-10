"""Fase 8 — checklist final de seguridad del módulo de cursos.

1. Inventario: toda ruta tiene rol y validación de propiedad, o está en una
   lista corta de excepciones justificadas (scripts/tabla_endpoints.py).
2. Permisos, recorridos a partir de ese inventario (no de una lista escrita a
   mano que se pueda quedar corta): sin sesión, con el rol equivocado, docente
   de otro curso y estudiante no matriculado.
3. Fugas: ninguna respuesta a un estudiante trae is_correct, notas de otros,
   correos del roster ni claves internas.
4. Límite de intentos de quiz con peticiones en paralelo.

Lo demás que pide la fase ya tiene su archivo: matrícula por código y por
aprobación (test_fase1_seguridad), validación de archivos y ventanas de
tiempo (test_fase3_tareas), portada (test_fase4_portadas), paginación y
borrado suave (test_fase5_rendimiento), auditoría (test_fase6_seguridad).

No toca la base real — todo con monkeypatch."""
import os
import re
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.curso_avisos as ca_routes
import app.routes.curso_calificaciones as cal_routes
import app.routes.curso_contenido as cc_routes
import app.routes.curso_quiz as cq_routes
import app.routes.cursos as cursos_routes
from app.models import (
    AssignmentSubmission, Course, CourseAnnouncement, CourseAnnouncementComment, CourseBlock, CourseContentItem,
    QuizAnswer, QuizAttempt, QuizChoice, QuizQuestion,
)
from tests.fakes import ConsultaFalsa

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import tabla_endpoints  # noqa: E402

MODULOS_DE_CURSOS = (cursos_routes, cc_routes, cq_routes, cal_routes, ca_routes)
AHORA = datetime.now(timezone.utc)


def _headers(app, role, identity):
    with app.app_context():
        token = create_access_token(identity=str(identity), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def inventario(app):
    return tabla_endpoints.inventario(app)


def _url(ruta: str) -> str:
    """La ruta con un id cualquiera en cada parámetro."""
    return re.sub(r"<[^>]+>", lambda _m: str(uuid.uuid4()), ruta)


# Cuerpo mínimo válido de las rutas que validan el JSON antes de mirar permisos.
_CUERPOS = {
    ("POST", "/bloques"): {"title": "Bloque"},
    ("POST", "/contenido"): {"type": "LINK", "title": "Enlace", "link_url": "https://example.com"},
    ("POST", "/preguntas"): {"type": "TRUE_FALSE", "prompt": "¿?", "choices": [{"text": "V", "is_correct": True}, {"text": "F"}]},
    ("POST", "/estudiantes"): {"email": "alguien@example.com"},
    ("POST", "/avisos"): {"title": "Aviso", "body": "<p>Hola</p>"},
    ("POST", "/comentarios"): {"content": "Hola"},
    ("PATCH", "/matricula"): {"enrollment_mode": "OPEN"},
    ("POST", "/entregas"): {"name": "a.pdf", "file_base64": "JVBERi0xLjQKJSVFT0YK"},
    ("POST", "/responder"): {"answers": []},
    ("PUT", "/respuestas"): {"answers": []},
}


def _cuerpo(metodo, ruta):
    for (m, sufijo), cuerpo in _CUERPOS.items():
        if m == metodo and ruta.endswith(sufijo):
            return cuerpo
    return {}


def _pedir(client, metodo, ruta, headers=None):
    kwargs = {"headers": headers or {}}
    if metodo in ("POST", "PUT", "PATCH"):
        kwargs["json"] = _cuerpo(metodo, ruta)
    return getattr(client, metodo.lower())(_url(ruta), **kwargs)


# ═══════════════════════════ 1. Inventario ═══════════════════════════

def test_ninguna_ruta_queda_sin_autenticacion_ni_sin_validacion_de_propiedad(inventario):
    sin_control = [f"{f['metodo']} {f['ruta']}" for f in inventario if f["estado"] in ("sin_autenticacion", "sin_propiedad")]
    assert sin_control == [], (
        "Rutas sin rol o sin validación de propiedad. Agrégales el control, o justifícalas en "
        "scripts/tabla_endpoints.py (PUBLICAS / SIN_PROPIEDAD_JUSTIFICADO): " + ", ".join(sin_control)
    )


def test_las_rutas_publicas_son_exactamente_las_esperadas(inventario):
    """Una ruta nueva sin sesión tiene que ser una decisión, no un descuido."""
    publicas = {f["ruta"] for f in inventario if f["estado"] == "publica"}
    assert publicas == set(tabla_endpoints.PUBLICAS) & {f["ruta"] for f in inventario}
    assert not any(ruta.startswith("/api/cursos") for ruta in publicas)


def test_todo_el_modulo_de_cursos_tiene_rol_y_propiedad(inventario):
    de_cursos = [f for f in inventario if f["ruta"].startswith("/api/cursos")]
    assert len(de_cursos) > 60
    sin_propiedad = {(f["metodo"], f["ruta"]) for f in de_cursos if f["estado"] != "ok"}
    # Las únicas que no restringen por dueño: el catálogo, la ficha del curso y las constantes de tareas.
    assert sin_propiedad == {
        ("GET", "/api/cursos"), ("GET", "/api/cursos/<course_id>"), ("GET", "/api/cursos/opciones-tarea"),
    }


def test_el_documento_de_endpoints_esta_al_dia(inventario):
    """backend/docs/ENDPOINTS_SEGURIDAD.md se regenera con
    `python scripts/tabla_endpoints.py --escribir`."""
    with open(tabla_endpoints.DESTINO, encoding="utf-8") as archivo:
        publicado = archivo.read()
    assert publicado == tabla_endpoints.a_markdown(inventario)


# ═══════════════════════════ 2. Permisos por rol ═══════════════════════════

def test_sin_sesion_todas_las_rutas_no_publicas_dan_401(client, inventario):
    for fila in inventario:
        if fila["estado"] == "publica" or not fila["ruta"].startswith("/api/"):
            continue
        res = _pedir(client, fila["metodo"], fila["ruta"])
        assert res.status_code == 401, f"{fila['metodo']} {fila['ruta']} respondió {res.status_code} sin sesión"


def test_el_rol_equivocado_da_403_en_todas_las_rutas_con_rol(app, client, inventario):
    """Estudiante en rutas de docente o admin, docente en rutas de estudiante o admin."""
    probadas = 0
    for fila in inventario:
        permitidos = set(fila["rol"].split(" o ")) & {"TEACHER", "STUDENT", "ADMIN"}
        if not permitidos:
            continue
        for rol in {"TEACHER", "STUDENT", "ADMIN"} - permitidos:
            res = _pedir(client, fila["metodo"], fila["ruta"], _headers(app, rol, uuid.uuid4()))
            assert res.status_code == 403, f"{rol} en {fila['metodo']} {fila['ruta']} respondió {res.status_code}"
            probadas += 1
    assert probadas > 100


def _instalar(app, monkeypatch, user, curso, matriculado=False):
    """Un usuario frente a un curso que existe, con todo lo demás vacío."""
    consulta_curso = ConsultaFalsa(first=curso)
    with app.app_context():
        for modulo in MODULOS_DE_CURSOS:
            monkeypatch.setattr(modulo, "get_current_user", lambda: user)
        monkeypatch.setattr(Course, "query", consulta_curso)
        monkeypatch.setattr(cursos_routes.StudentCourse, "query", ConsultaFalsa(first=object() if matriculado else None))


def test_docente_de_otro_curso_no_entra_a_ninguna_ruta_de_docente(app, client, monkeypatch, inventario):
    """Docente ajeno: tiene el rol correcto, pero el curso es de otra persona."""
    ajeno = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = Course(id=uuid.uuid4(), teacher_id=uuid.uuid4(), name="De otro docente", enrollment_mode="CODE", deleted_at=AHORA)
    _instalar(app, monkeypatch, ajeno, curso)
    headers = _headers(app, "TEACHER", ajeno.id)

    probadas = []
    for fila in inventario:
        if not fila["ruta"].startswith("/api/cursos/<course_id>") or "Docente dueño del curso" not in fila["propiedad"]:
            continue
        if "TEACHER" not in fila["rol"]:
            continue          # las que comparte con el estudiante se prueban abajo
        res = _pedir(client, fila["metodo"], fila["ruta"], headers)
        assert res.status_code == 403, f"{fila['metodo']} {fila['ruta']} respondió {res.status_code} a un docente ajeno"
        probadas.append((fila["metodo"], fila["ruta"]))

    assert len(probadas) >= 30
    # Entre ellas, las que más duelen si fallan.
    for esperada in (
        ("GET", "/api/cursos/<course_id>/estudiantes"), ("GET", "/api/cursos/<course_id>/calificaciones"),
        ("GET", "/api/cursos/<course_id>/calificaciones/exportar"), ("GET", "/api/cursos/<course_id>/matricula"),
        ("DELETE", "/api/cursos/<course_id>"), ("DELETE", "/api/cursos/<course_id>/permanente"),
        ("PATCH", "/api/cursos/<course_id>"), ("DELETE", "/api/cursos/<course_id>/cover"),
    ):
        assert esperada in probadas


def test_docente_de_otro_curso_tampoco_ve_su_contenido(app, client, monkeypatch, inventario):
    """Las rutas de lectura que comparten docente y estudiante: un docente
    ajeno no es ni el dueño ni un estudiante matriculado."""
    ajeno = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = Course(id=uuid.uuid4(), teacher_id=uuid.uuid4(), name="De otro docente", enrollment_mode="CODE")
    _instalar(app, monkeypatch, ajeno, curso)
    headers = _headers(app, "TEACHER", ajeno.id)

    probadas = 0
    for fila in inventario:
        compartida = "estudiante matriculado" in fila["propiedad"].lower() or "Estudiante matriculado" in fila["propiedad"]
        if not fila["ruta"].startswith("/api/cursos/<course_id>") or not compartida or fila["rol"] != "Cualquiera con sesión":
            continue
        res = _pedir(client, fila["metodo"], fila["ruta"], headers)
        assert res.status_code == 403, f"{fila['metodo']} {fila['ruta']} respondió {res.status_code} a un docente ajeno"
        probadas += 1
    assert probadas >= 12


def test_estudiante_no_matriculado_no_entra_a_ninguna_ruta_del_curso(app, client, monkeypatch, inventario):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = Course(id=uuid.uuid4(), teacher_id=uuid.uuid4(), name="Curso ajeno", enrollment_mode="CODE")
    _instalar(app, monkeypatch, estudiante, curso, matriculado=False)
    headers = _headers(app, "STUDENT", estudiante.id)

    probadas = []
    for fila in inventario:
        if not fila["ruta"].startswith("/api/cursos/<course_id>/") or fila["rol"] != "Cualquiera con sesión":
            continue
        res = _pedir(client, fila["metodo"], fila["ruta"], headers)
        assert res.status_code == 403, f"{fila['metodo']} {fila['ruta']} respondió {res.status_code} a un no matriculado"
        probadas.append(fila["ruta"])

    assert len(probadas) >= 18
    for esperada in ("/bloques", "/avisos", "/calificaciones/mias", "/contenido/<item_id>/intentos", "/contenido/<item_id>/entregas"):
        assert any(ruta.endswith(esperada) for ruta in probadas), esperada


# ═══════════════════════════ 3. Fugas hacia el estudiante ═══════════════════════════

# Claves que jamás deben aparecer en una respuesta a un estudiante.
CLAVES_PROHIBIDAS = {
    "is_correct", "email", "enrollment_code", "student_code", "password_hash", "storage_key", "file_key",
    "cover_image_key", "verification_code", "reset_code", "tokens_valid_after",
}
CORREO = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}")


def _claves(valor, encontradas=None):
    """Todas las claves con valor de un JSON, a cualquier profundidad."""
    encontradas = set() if encontradas is None else encontradas
    if isinstance(valor, dict):
        for clave, hijo in valor.items():
            if hijo is not None:      # una clave en null no revela nada
                encontradas.add(clave)
            _claves(hijo, encontradas)
    elif isinstance(valor, list):
        for hijo in valor:
            _claves(hijo, encontradas)
    return encontradas


def _sin_fugas(res, permitidas=()):
    assert res.status_code in (200, 201), res.get_data(as_text=True)[:200]
    filtradas = (_claves(res.get_json()) & CLAVES_PROHIBIDAS) - set(permitidas)
    assert filtradas == set(), f"la respuesta trae {filtradas}"
    assert CORREO.search(res.get_data(as_text=True)) is None, "la respuesta trae una dirección de correo"
    return res.get_json()


class _Escenario:
    """Un estudiante matriculado en un curso con compañeros, un quiz, una
    tarea, avisos y comentarios — todo con datos que NO le corresponde ver."""

    def __init__(self, app, monkeypatch):
        self.yo = SimpleNamespace(id=uuid.uuid4(), role="STUDENT", first_name="Yo", last_name="Mismo", email="yo@secreto.example")
        self.otro = SimpleNamespace(id=uuid.uuid4(), role="STUDENT", first_name="Otra", last_name="Persona", email="otra@secreto.example")
        self.docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER", first_name="Doc", last_name="Ente", email="docente@secreto.example")
        self.curso = Course(
            id=uuid.uuid4(), teacher_id=self.docente.id, name="Gastro I", enrollment_mode="CODE",
            enrollment_code="SECRETO99", academic_period="2026-2",
        )
        self.bloque = CourseBlock(id=uuid.uuid4(), course_id=self.curso.id, title="Semana 1", position=0)
        self.quiz = CourseContentItem(
            id=uuid.uuid4(), block_id=self.bloque.id, type="QUIZ", title="Parcial", position=0,
            max_attempts=3, grade_policy="BEST",
        )
        self.tarea = CourseContentItem(
            id=uuid.uuid4(), block_id=self.bloque.id, type="ASSIGNMENT", title="Informe", position=1,
            max_score=10, allow_late=False, allowed_extensions=[], max_files=1,
        )
        self.pregunta = QuizQuestion(id=uuid.uuid4(), item_id=self.quiz.id, type="SINGLE_CHOICE", prompt="¿Cuál?", points=1, position=0)
        self.correcta = QuizChoice(id=uuid.uuid4(), question_id=self.pregunta.id, text="A", is_correct=True, position=0)
        self.incorrecta = QuizChoice(id=uuid.uuid4(), question_id=self.pregunta.id, text="B", is_correct=False, position=1)
        self.intento_abierto = QuizAttempt(
            id=uuid.uuid4(), item_id=self.quiz.id, student_id=self.yo.id, attempt_number=1, started_at=AHORA,
            deadline_at=AHORA + timedelta(minutes=30), max_score=1, expired=False,
        )
        self.respuesta = QuizAnswer(
            id=uuid.uuid4(), attempt_id=self.intento_abierto.id, question_id=self.pregunta.id,
            selected_choice_ids=[self.incorrecta.id], is_correct=None,
        )
        self.entrega_ajena = AssignmentSubmission(
            id=uuid.uuid4(), item_id=self.tarea.id, student_id=self.otro.id, current_version=1, score=9.5,
            feedback="Nota privada de otra persona", submitted_at=AHORA, is_late=False,
        )
        self.aviso = CourseAnnouncement(
            id=uuid.uuid4(), course_id=self.curso.id, author_id=self.docente.id, title="Bienvenida", body="<p>Hola</p>",
            pinned=False, created_at=AHORA,
        )
        self.comentario = CourseAnnouncementComment(
            id=uuid.uuid4(), announcement_id=self.aviso.id, author_id=self.otro.id, content="Gracias", created_at=AHORA,
        )
        self.headers = _headers(app, "STUDENT", self.yo.id)
        self.base = f"/api/cursos/{self.curso.id}"
        self.item = f"{self.base}/bloques/{self.bloque.id}/contenido"

        usuarios = ConsultaFalsa(todos=[self.docente, self.otro, self.yo])
        usuarios.get = lambda ident: {str(u.id): u for u in (self.docente, self.otro, self.yo)}.get(str(ident))
        with app.app_context():
            for modulo in MODULOS_DE_CURSOS:
                monkeypatch.setattr(modulo, "get_current_user", lambda: self.yo)
            monkeypatch.setattr(Course, "query", ConsultaFalsa(first=self.curso, todos=[self.curso]))
            monkeypatch.setattr(cursos_routes.StudentCourse, "query", ConsultaFalsa(first=object()))
            monkeypatch.setattr(cursos_routes.User, "query", usuarios)
            monkeypatch.setattr(CourseBlock, "query", ConsultaFalsa(first=self.bloque, todos=[self.bloque]))
            monkeypatch.setattr(CourseContentItem, "query", ConsultaFalsa(first=self.quiz, todos=[self.quiz, self.tarea]))
            monkeypatch.setattr(QuizAttempt, "query", ConsultaFalsa(first=self.intento_abierto, todos=[self.intento_abierto]))
            monkeypatch.setattr(QuizAnswer, "query", ConsultaFalsa(todos=[self.respuesta]))
            monkeypatch.setattr(cq_routes, "_preguntas_con_opciones", lambda item_id: [(self.pregunta, [self.correcta, self.incorrecta])])
            monkeypatch.setattr(CourseAnnouncement, "query", ConsultaFalsa(first=self.aviso, todos=[self.aviso]))
            monkeypatch.setattr(CourseAnnouncementComment, "query", ConsultaFalsa(first=self.comentario, todos=[self.comentario]))
            monkeypatch.setattr(ca_routes.db.session, "query", lambda *a: ConsultaFalsa(todos=[]))
            monkeypatch.setattr(cursos_routes, "_indicadores_del_estudiante", lambda ids, sid: {})
            monkeypatch.setattr(cc_routes, "_archivos_de_entregas", lambda ids: {})
            monkeypatch.setattr(cq_routes.db.session, "commit", lambda: None)
            monkeypatch.setattr(cq_routes.db.session, "rollback", lambda: None)


def test_el_quiz_en_curso_nunca_le_muestra_is_correct_al_estudiante(app, client, monkeypatch):
    e = _Escenario(app, monkeypatch)
    quiz = f"{e.item}/{e.quiz.id}"

    # Iniciar (retoma el intento abierto), verlo, listar los suyos y guardar avance.
    retomado = _sin_fugas(client.post(f"{quiz}/intentos", headers=e.headers))
    assert retomado["reanudado"] is True and len(retomado["preguntas"][0]["choices"]) == 2
    abierto = _sin_fugas(client.get(f"{quiz}/intentos/{e.intento_abierto.id}", headers=e.headers), permitidas=())
    assert abierto["preguntas"][0]["tu_respuesta"]["selected_choice_ids"] == [str(e.incorrecta.id)]
    _sin_fugas(client.get(f"{quiz}/intentos", headers=e.headers))
    guardado = client.put(
        f"{quiz}/intentos/{e.intento_abierto.id}/respuestas",
        json={"answers": [{"question_id": str(e.pregunta.id), "selected_choice_ids": [str(e.correcta.id)]}]}, headers=e.headers,
    )
    assert guardado.status_code == 200 and "is_correct" not in guardado.get_data(as_text=True)

    # El detalle de la tarea y el listado de bloques tampoco traen la clave de nada.
    _sin_fugas(client.get(f"{e.base}/bloques", headers=e.headers))

    # El banco de preguntas (con is_correct) es solo del docente.
    assert client.get(f"{quiz}/preguntas", headers=e.headers).status_code == 403


def test_tras_entregar_con_intentos_disponibles_tampoco_se_revela_la_clave(app, client, monkeypatch):
    e = _Escenario(app, monkeypatch)
    e.intento_abierto.submitted_at = AHORA
    e.intento_abierto.score = 0
    e.respuesta.is_correct = False
    res = client.get(f"{e.item}/{e.quiz.id}/intentos/{e.intento_abierto.id}", headers=e.headers)

    assert res.status_code == 200
    body = res.get_json()
    assert body["respuestas_reveladas"] is False
    # Sabe si acertó su respuesta, pero ninguna OPCIÓN viene marcada como correcta.
    assert all("is_correct" not in opcion for p in body["preguntas"] for opcion in p["choices"])
    assert body["preguntas"][0]["tu_respuesta"]["is_correct"] is False


def test_el_estudiante_no_ve_el_intento_de_un_companero(app, client, monkeypatch):
    e = _Escenario(app, monkeypatch)
    e.intento_abierto.student_id = e.otro.id
    assert client.get(f"{e.item}/{e.quiz.id}/intentos/{e.intento_abierto.id}", headers=e.headers).status_code == 403


def test_los_listados_de_cursos_no_traen_el_codigo_de_matricula_ni_correos(app, client, monkeypatch):
    e = _Escenario(app, monkeypatch)
    for ruta in ("/api/cursos/mios", "/api/cursos", e.base, "/api/cursos/mios?page=1&per_page=10"):
        res = client.get(ruta, headers=e.headers)
        _sin_fugas(res)
        assert "SECRETO99" not in res.get_data(as_text=True)
    # Lo que sí ve: el nombre del docente.
    assert client.get("/api/cursos/mios", headers=e.headers).get_json()[0]["teacher_name"] == "Doc Ente"


def test_avisos_y_comentarios_muestran_nombres_pero_no_correos(app, client, monkeypatch):
    e = _Escenario(app, monkeypatch)
    with app.app_context():
        monkeypatch.setattr(ca_routes.User, "query", ConsultaFalsa(todos=[e.docente, e.otro]))

    avisos = _sin_fugas(client.get(f"{e.base}/avisos", headers=e.headers))
    assert avisos["avisos"][0]["author_name"] == "Doc Ente"
    comentarios = _sin_fugas(client.get(f"{e.base}/avisos/{e.aviso.id}/comentarios", headers=e.headers))
    assert comentarios["comentarios"][0]["author_name"] == "Otra Persona"


def test_mis_calificaciones_solo_trae_la_fila_propia(app, client, monkeypatch):
    e = _Escenario(app, monkeypatch)
    pedidos = []

    def matriz(course_id, student_ids):
        pedidos.append([str(s) for s in student_ids])
        # Aunque la consulta devolviera notas de otros, la respuesta solo usa la fila propia.
        return ([{"id": str(e.tarea.id), "block_id": str(e.bloque.id), "type": "ASSIGNMENT", "title": "Informe", "max_score": 10.0}], {
            str(e.yo.id): {str(e.tarea.id): {"score": 7.0, "status": "graded"}},
            str(e.otro.id): {str(e.tarea.id): {"score": 9.5, "status": "graded"}},
        })

    with app.app_context():
        monkeypatch.setattr(cal_routes, "_construir_matriz", matriz)
        monkeypatch.setattr(cal_routes.StudentCourse, "query", ConsultaFalsa(first=object()))

    res = client.get(f"{e.base}/calificaciones/mias", headers=e.headers)
    body = _sin_fugas(res)

    assert pedidos == [[str(e.yo.id)]]          # solo se piden las notas propias
    assert body["calificaciones"][str(e.tarea.id)]["score"] == 7.0
    assert "9.5" not in res.get_data(as_text=True) and str(e.otro.id) not in res.get_data(as_text=True)


def test_el_estudiante_no_llega_a_notas_roster_ni_datos_de_companeros(app, client, monkeypatch):
    e = _Escenario(app, monkeypatch)
    tarea = f"{e.item}/{e.tarea.id}"
    with app.app_context():
        monkeypatch.setattr(CourseContentItem, "query", ConsultaFalsa(first=e.tarea))
        monkeypatch.setattr(AssignmentSubmission, "query", ConsultaFalsa(first=e.entrega_ajena, todos=[e.entrega_ajena]))

    prohibidas = [
        ("get", f"{e.base}/calificaciones"),                         # el libro con las notas de todos
        ("get", f"{e.base}/calificaciones/exportar?formato=csv"),
        ("get", f"{e.base}/estudiantes"),                            # el roster, con correos
        ("get", f"{e.base}/matricula"),                              # el código de matrícula
        ("get", f"{e.base}/solicitudes"),
        ("get", f"{tarea}/entregas"),                                # las entregas de todos
        ("get", f"{tarea}/entregas/{e.entrega_ajena.id}/descarga"),  # el archivo de un compañero
        ("get", f"{tarea}/entregas/{e.entrega_ajena.id}/archivo"),
        ("get", f"{tarea}/entregas/{e.entrega_ajena.id}/archivos/{uuid.uuid4()}/descarga"),
        ("patch", f"{tarea}/entregas/{e.entrega_ajena.id}"),         # calificar
        ("get", "/api/admin/auditoria"),
        ("get", "/api/admin/usuarios"),
    ]
    for metodo, ruta in prohibidas:
        res = getattr(client, metodo)(ruta, headers=e.headers, **({"json": {"score": 10}} if metodo == "patch" else {}))
        assert res.status_code == 403, f"{metodo.upper()} {ruta} respondió {res.status_code}"
        texto = res.get_data(as_text=True)
        assert "9.5" not in texto and "Nota privada" not in texto and "@secreto.example" not in texto and "SECRETO99" not in texto

    # Su propia entrega: como no ha entregado, no ve la de nadie.
    with app.app_context():
        monkeypatch.setattr(AssignmentSubmission, "query", ConsultaFalsa(first=None))
    mia = _sin_fugas(client.get(f"{tarea}/entregas/mia", headers=e.headers))
    assert mia["entrega"] is None


def test_el_perfil_de_otro_usuario_no_trae_su_correo(app, client, monkeypatch):
    import app.routes.usuarios as usuarios_routes

    otro = SimpleNamespace(
        id=uuid.uuid4(), username="otra", first_name="Otra", last_name="Persona", role="STUDENT", avatar_svg=None,
        email="otra@secreto.example", to_dict=lambda: {"email": "otra@secreto.example"},
    )
    with app.app_context():
        monkeypatch.setattr(usuarios_routes.User, "query", ConsultaFalsa(first=otro, todos=[otro]))
    headers = _headers(app, "STUDENT", uuid.uuid4())

    _sin_fugas(client.get(f"/api/usuarios/{otro.id}", headers=headers))
    _sin_fugas(client.get("/api/usuarios/buscar?q=otr", headers=headers))


# ═══════════════════════════ 4. Intentos de quiz en paralelo ═══════════════════════════

class _TablaDeIntentos:
    """Hace de tabla quiz_attempts y de candado de fila para varios hilos.

    En producción el candado es el SELECT ... FOR UPDATE de la fila de
    matrícula (comprobado contra Postgres). Acá lo reemplaza un Lock de
    verdad: lo toma quien "bloquea la matrícula" y lo suelta su commit o su
    rollback, igual que una transacción. Con `con_candado=False` ese bloqueo
    no existe, para ver qué pasa sin él."""

    def __init__(self, app, monkeypatch, estudiante, curso, quiz, pregunta, opciones, ya_entregados, con_candado=True):
        self.filas = [
            QuizAttempt(id=uuid.uuid4(), item_id=quiz.id, student_id=estudiante.id, attempt_number=n + 1,
                        started_at=AHORA, submitted_at=AHORA, score=1, max_score=1, expired=False)
            for n in range(ya_entregados)
        ]
        self._candado = threading.Lock()
        self._local = threading.local()
        self._con_candado = con_candado
        tabla = self

        class _Consulta(ConsultaFalsa):
            def all(self):
                foto = list(tabla.filas)
                time.sleep(0.02)          # entre leer y escribir cabe otra petición
                return foto

        def bloquear(user, course):
            if tabla._con_candado:
                tabla._candado.acquire()
                tabla._local.tengo = True
            return object()

        def soltar():
            if getattr(tabla._local, "tengo", False):
                tabla._local.tengo = False
                tabla._candado.release()

        def add(obj):
            if isinstance(obj, QuizAttempt):
                obj.id = obj.id or uuid.uuid4()
                tabla._local.pendientes = getattr(tabla._local, "pendientes", []) + [obj]

        def commit():
            tabla.filas.extend(getattr(tabla._local, "pendientes", []))
            tabla._local.pendientes = []
            soltar()

        def rollback():
            tabla._local.pendientes = []
            soltar()

        with app.app_context():
            monkeypatch.setattr(cq_routes, "get_current_user", lambda: estudiante)
            monkeypatch.setattr(Course, "query", ConsultaFalsa(first=curso))
            monkeypatch.setattr(CourseBlock, "query", ConsultaFalsa(first=object()))
            monkeypatch.setattr(CourseContentItem, "query", ConsultaFalsa(first=quiz))
            monkeypatch.setattr(QuizAttempt, "query", _Consulta())
            monkeypatch.setattr(QuizAnswer, "query", ConsultaFalsa(todos=[]))
            monkeypatch.setattr(cq_routes, "_matricula_bloqueada", bloquear)
            monkeypatch.setattr(cq_routes, "_preguntas_con_opciones", lambda item_id: [(pregunta, opciones)])
            monkeypatch.setattr(cq_routes.db.session, "add", add)
            monkeypatch.setattr(cq_routes.db.session, "commit", commit)
            monkeypatch.setattr(cq_routes.db.session, "rollback", rollback)


def _iniciar_en_paralelo(app, ruta, headers, n):
    barrera = threading.Barrier(n)
    codigos = [None] * n

    def trabajo(i):
        cliente = app.test_client()
        barrera.wait()
        codigos[i] = cliente.post(ruta, headers=headers).status_code

    hilos = [threading.Thread(target=trabajo, args=(i,)) for i in range(n)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(timeout=30)
    return codigos


def _quiz_para_paralelo(max_attempts):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    quiz = CourseContentItem(
        id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ", title="Parcial", position=0, max_attempts=max_attempts,
        grade_policy="BEST",
    )
    pregunta = QuizQuestion(id=uuid.uuid4(), item_id=quiz.id, type="TRUE_FALSE", prompt="¿?", points=1, position=0)
    opciones = [
        QuizChoice(id=uuid.uuid4(), question_id=pregunta.id, text="V", is_correct=True, position=0),
        QuizChoice(id=uuid.uuid4(), question_id=pregunta.id, text="F", is_correct=False, position=1),
    ]
    return estudiante, curso, quiz, pregunta, opciones


def test_veinte_inicios_en_paralelo_no_superan_max_attempts(app, monkeypatch):
    estudiante, curso, quiz, pregunta, opciones = _quiz_para_paralelo(max_attempts=3)
    tabla = _TablaDeIntentos(app, monkeypatch, estudiante, curso, quiz, pregunta, opciones, ya_entregados=2)
    ruta = f"/api/cursos/{curso.id}/bloques/{quiz.block_id}/contenido/{quiz.id}/intentos"

    codigos = _iniciar_en_paralelo(app, ruta, _headers(app, "STUDENT", estudiante.id), 20)

    # Le quedaba UN intento: se crea uno solo y los otros 19 reciben ese mismo.
    assert codigos.count(201) == 1 and codigos.count(200) == 19
    assert len(tabla.filas) == 3 <= quiz.max_attempts
    assert sorted(i.attempt_number for i in tabla.filas) == [1, 2, 3]
    assert sum(1 for i in tabla.filas if i.submitted_at is None) == 1


def test_con_los_intentos_agotados_veinte_peticiones_no_crean_ninguno(app, monkeypatch):
    estudiante, curso, quiz, pregunta, opciones = _quiz_para_paralelo(max_attempts=2)
    tabla = _TablaDeIntentos(app, monkeypatch, estudiante, curso, quiz, pregunta, opciones, ya_entregados=2)
    ruta = f"/api/cursos/{curso.id}/bloques/{quiz.block_id}/contenido/{quiz.id}/intentos"

    codigos = _iniciar_en_paralelo(app, ruta, _headers(app, "STUDENT", estudiante.id), 20)

    assert codigos == [400] * 20
    assert len(tabla.filas) == 2


def test_control_sin_el_candado_las_mismas_peticiones_si_superan_el_limite(app, monkeypatch):
    """El control: la misma prueba SIN el bloqueo crea intentos de más. Si
    esto dejara de pasar, la prueba de arriba no estaría probando nada."""
    estudiante, curso, quiz, pregunta, opciones = _quiz_para_paralelo(max_attempts=3)
    tabla = _TablaDeIntentos(
        app, monkeypatch, estudiante, curso, quiz, pregunta, opciones, ya_entregados=2, con_candado=False,
    )
    ruta = f"/api/cursos/{curso.id}/bloques/{quiz.block_id}/contenido/{quiz.id}/intentos"

    codigos = _iniciar_en_paralelo(app, ruta, _headers(app, "STUDENT", estudiante.id), 20)

    assert codigos.count(201) > 1
    assert len(tabla.filas) > quiz.max_attempts
