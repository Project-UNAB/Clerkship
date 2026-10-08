"""
Banco de preguntas y toma de intentos de un CourseContentItem tipo QUIZ.

El docente dueño arma las preguntas (opción única, opción múltiple o
verdadero/falso) con sus opciones marcando cuáles son correctas. El
estudiante nunca ve `is_correct` mientras responde — solo después de haber
entregado un intento, para poder revisar qué le quedó bien y qué no.
Calificación automática: todo o nada por pregunta (no hay puntaje parcial
dentro de una pregunta de opción múltiple).
"""
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app import db
from app.models import (
    Course,
    CourseContentItem,
    QuizAnswer,
    QuizAttempt,
    QuizChoice,
    QuizQuestion,
    StudentCourse,
    User,
)
from app.models.quiz_question import TIPOS_PREGUNTA
from app.schemas import ActualizarPreguntaRequest, CrearPreguntaRequest, ResponderIntentoRequest, validate_body
from app.utils import get_current_user, role_required

curso_quiz_bp = Blueprint("curso_quiz", __name__)


def _curso_o_404(course_id):
    course = Course.query.get(course_id)
    if course is None:
        return None, (jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404)
    return course, None


def _es_docente_dueno(user, course) -> bool:
    return user.role == "TEACHER" and str(course.teacher_id) == str(user.id)


def _es_estudiante_matriculado(user, course) -> bool:
    return user.role == "STUDENT" and StudentCourse.query.filter_by(student_id=user.id, course_id=course.id).first() is not None


def _puede_ver(user, course) -> bool:
    return _es_docente_dueno(user, course) or _es_estudiante_matriculado(user, course)


def _forbidden():
    return jsonify({"error": "Forbidden", "message": "No tienes acceso a este curso", "status_code": 403}), 403


def _quiz_o_404(block_id, item_id):
    item = CourseContentItem.query.filter_by(id=item_id, block_id=block_id).first()
    if item is None or item.type != "QUIZ":
        return None, (jsonify({"error": "Not Found", "message": "Cuestionario no encontrado", "status_code": 404}), 404)
    return item, None


def _preguntas_con_opciones(item_id):
    """[(QuizQuestion, [QuizChoice, ...]), ...] ordenado por posición."""
    preguntas = QuizQuestion.query.filter_by(item_id=item_id).order_by(QuizQuestion.position.asc()).all()
    if not preguntas:
        return []
    opciones = QuizChoice.query.filter(QuizChoice.question_id.in_([p.id for p in preguntas])).order_by(QuizChoice.position.asc()).all()
    opciones_por_pregunta = {}
    for o in opciones:
        opciones_por_pregunta.setdefault(str(o.question_id), []).append(o)
    return [(p, opciones_por_pregunta.get(str(p.id), [])) for p in preguntas]


# ─────────────────────────── Banco de preguntas (docente) ───────────────────────────

@curso_quiz_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/preguntas")
@role_required("TEACHER")
def listar_preguntas(course_id, block_id, item_id):
    """Vista de gestión del docente: incluye is_correct de cada opción."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    _item, err = _quiz_o_404(block_id, item_id)
    if err:
        return err

    return jsonify({
        "preguntas": [
            p.to_dict(choices=choices, incluir_respuesta_correcta=True)
            for p, choices in _preguntas_con_opciones(item_id)
        ]
    }), 200


@curso_quiz_bp.post("/<course_id>/bloques/<block_id>/contenido/<item_id>/preguntas")
@role_required("TEACHER")
@validate_body(CrearPreguntaRequest)
def crear_pregunta(course_id, block_id, item_id, validated_body: CrearPreguntaRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    _item, err = _quiz_o_404(block_id, item_id)
    if err:
        return err

    tipo = (validated_body.type or "").strip().upper()
    if tipo not in TIPOS_PREGUNTA:
        return jsonify({
            "error": "Bad Request",
            "message": f"type debe ser uno de: {', '.join(TIPOS_PREGUNTA)}",
            "status_code": 400,
        }), 400

    correctas = sum(1 for c in validated_body.choices if c.is_correct)
    if correctas == 0:
        return jsonify({"error": "Bad Request", "message": "Marca al menos una opción como correcta", "status_code": 400}), 400
    if tipo in ("SINGLE_CHOICE", "TRUE_FALSE") and correctas != 1:
        return jsonify({"error": "Bad Request", "message": f"{tipo} debe tener exactamente una opción correcta", "status_code": 400}), 400
    if tipo == "TRUE_FALSE" and len(validated_body.choices) != 2:
        return jsonify({"error": "Bad Request", "message": "TRUE_FALSE debe tener exactamente 2 opciones", "status_code": 400}), 400

    max_pos = db.session.query(db.func.coalesce(db.func.max(QuizQuestion.position), -1)).filter_by(item_id=item_id).scalar()

    pregunta = QuizQuestion(
        item_id=item_id,
        type=tipo,
        prompt=validated_body.prompt.strip(),
        points=validated_body.points or 1,
        position=max_pos + 1,
    )
    db.session.add(pregunta)
    db.session.flush()

    opciones = []
    for i, c in enumerate(validated_body.choices):
        opcion = QuizChoice(question_id=pregunta.id, text=c.text.strip(), is_correct=c.is_correct, position=i)
        db.session.add(opcion)
        opciones.append(opcion)

    db.session.commit()
    return jsonify(pregunta.to_dict(choices=opciones, incluir_respuesta_correcta=True)), 201


@curso_quiz_bp.patch("/<course_id>/bloques/<block_id>/contenido/<item_id>/preguntas/<question_id>")
@role_required("TEACHER")
@validate_body(ActualizarPreguntaRequest)
def actualizar_pregunta(course_id, block_id, item_id, question_id, validated_body: ActualizarPreguntaRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    _item, err = _quiz_o_404(block_id, item_id)
    if err:
        return err

    pregunta = QuizQuestion.query.filter_by(id=question_id, item_id=item_id).first()
    if pregunta is None:
        return jsonify({"error": "Not Found", "message": "Pregunta no encontrada", "status_code": 404}), 404

    if validated_body.prompt is not None:
        pregunta.prompt = validated_body.prompt.strip()
    if validated_body.points is not None:
        pregunta.points = validated_body.points
    if validated_body.position is not None:
        pregunta.position = validated_body.position

    opciones = None
    if validated_body.choices is not None:
        correctas = sum(1 for c in validated_body.choices if c.is_correct)
        if correctas == 0:
            return jsonify({"error": "Bad Request", "message": "Marca al menos una opción como correcta", "status_code": 400}), 400
        if pregunta.type in ("SINGLE_CHOICE", "TRUE_FALSE") and correctas != 1:
            return jsonify({"error": "Bad Request", "message": f"{pregunta.type} debe tener exactamente una opción correcta", "status_code": 400}), 400

        QuizChoice.query.filter_by(question_id=pregunta.id).delete()
        opciones = []
        for i, c in enumerate(validated_body.choices):
            opcion = QuizChoice(question_id=pregunta.id, text=c.text.strip(), is_correct=c.is_correct, position=i)
            db.session.add(opcion)
            opciones.append(opcion)

    db.session.commit()
    if opciones is None:
        opciones = QuizChoice.query.filter_by(question_id=pregunta.id).order_by(QuizChoice.position.asc()).all()
    return jsonify(pregunta.to_dict(choices=opciones, incluir_respuesta_correcta=True)), 200


@curso_quiz_bp.delete("/<course_id>/bloques/<block_id>/contenido/<item_id>/preguntas/<question_id>")
@role_required("TEACHER")
def borrar_pregunta(course_id, block_id, item_id, question_id):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    _item, err = _quiz_o_404(block_id, item_id)
    if err:
        return err

    pregunta = QuizQuestion.query.filter_by(id=question_id, item_id=item_id).first()
    if pregunta is None:
        return jsonify({"error": "Not Found", "message": "Pregunta no encontrada", "status_code": 404}), 404

    db.session.delete(pregunta)
    db.session.commit()
    return jsonify({"ok": True}), 200


# ─────────────────────────── Intentos (estudiante) ───────────────────────────

@curso_quiz_bp.post("/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos")
@jwt_required()
def iniciar_intento(course_id, block_id, item_id):
    """El estudiante arranca un intento nuevo. Devuelve las preguntas SIN
    is_correct — eso solo se ve después de entregar (ver obtener_intento)."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_estudiante_matriculado(user, course):
        return _forbidden()
    item, err = _quiz_o_404(block_id, item_id)
    if err:
        return err

    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    if item.open_at and ahora < item.open_at:
        return jsonify({"error": "Bad Request", "message": "Este cuestionario todavía no abre", "status_code": 400}), 400
    if item.due_at and ahora > item.due_at:
        return jsonify({"error": "Bad Request", "message": "El plazo para responder este cuestionario ya cerró", "status_code": 400}), 400

    intentos_previos = QuizAttempt.query.filter_by(item_id=item_id, student_id=user.id).count()
    if item.max_attempts and intentos_previos >= item.max_attempts:
        return jsonify({"error": "Bad Request", "message": "Ya usaste todos tus intentos para este cuestionario", "status_code": 400}), 400

    preguntas = _preguntas_con_opciones(item_id)
    if not preguntas:
        return jsonify({"error": "Bad Request", "message": "Este cuestionario todavía no tiene preguntas", "status_code": 400}), 400

    max_score = sum(float(p.points) for p, _ in preguntas)

    intento = QuizAttempt(
        item_id=item_id,
        student_id=user.id,
        attempt_number=intentos_previos + 1,
        max_score=max_score,
    )
    db.session.add(intento)
    db.session.commit()

    d = intento.to_dict()
    d["preguntas"] = [p.to_dict(choices=choices, incluir_respuesta_correcta=False) for p, choices in preguntas]
    d["time_limit_minutes"] = item.time_limit_minutes
    return jsonify(d), 201


@curso_quiz_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos")
@jwt_required()
def listar_intentos(course_id, block_id, item_id):
    """Docente dueño: todos los intentos de todos los estudiantes (para
    revisar notas). Estudiante: solo los suyos."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()
    _item, err = _quiz_o_404(block_id, item_id)
    if err:
        return err

    query = QuizAttempt.query.filter_by(item_id=item_id)
    if not _es_docente_dueno(user, course):
        query = query.filter_by(student_id=user.id)
    intentos = query.order_by(QuizAttempt.started_at.desc()).all()

    estudiantes = {}
    if _es_docente_dueno(user, course) and intentos:
        ids = [i.student_id for i in intentos]
        estudiantes = {str(u.id): u for u in User.query.filter(User.id.in_(ids)).all()}

    return jsonify({
        "intentos": [i.to_dict(student=estudiantes.get(str(i.student_id))) for i in intentos]
    }), 200


@curso_quiz_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos/<attempt_id>")
@jwt_required()
def obtener_intento(course_id, block_id, item_id, attempt_id):
    """Revisión de un intento ya entregado: acá sí se incluye is_correct de
    cada opción y de cada respuesta — solo dueño del intento o docente."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()
    _item, err = _quiz_o_404(block_id, item_id)
    if err:
        return err

    intento = QuizAttempt.query.filter_by(id=attempt_id, item_id=item_id).first()
    if intento is None:
        return jsonify({"error": "Not Found", "message": "Intento no encontrado", "status_code": 404}), 404

    es_dueno_intento = str(intento.student_id) == str(user.id)
    if not es_dueno_intento and not _es_docente_dueno(user, course):
        return _forbidden()

    d = intento.to_dict()
    if intento.submitted_at is not None:
        respuestas = QuizAnswer.query.filter_by(attempt_id=intento.id).all()
        respuestas_por_pregunta = {str(r.question_id): r for r in respuestas}
        d["preguntas"] = []
        for pregunta, opciones in _preguntas_con_opciones(item_id):
            pd = pregunta.to_dict(choices=opciones, incluir_respuesta_correcta=True)
            respuesta = respuestas_por_pregunta.get(str(pregunta.id))
            pd["tu_respuesta"] = respuesta.to_dict() if respuesta else None
            d["preguntas"].append(pd)

    return jsonify(d), 200


@curso_quiz_bp.post("/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos/<attempt_id>/responder")
@jwt_required()
@validate_body(ResponderIntentoRequest)
def responder_intento(course_id, block_id, item_id, attempt_id, validated_body: ResponderIntentoRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_estudiante_matriculado(user, course):
        return _forbidden()
    _item, err = _quiz_o_404(block_id, item_id)
    if err:
        return err

    intento = QuizAttempt.query.filter_by(id=attempt_id, item_id=item_id, student_id=user.id).first()
    if intento is None:
        return jsonify({"error": "Not Found", "message": "Intento no encontrado", "status_code": 404}), 404
    if intento.submitted_at is not None:
        return jsonify({"error": "Bad Request", "message": "Este intento ya fue entregado", "status_code": 400}), 400

    preguntas = _preguntas_con_opciones(item_id)

    # IDs tal como llegan del cliente (strings) — se validan como UUID antes
    # de intentar guardarlos en la columna ARRAY(UUID).
    respuestas_enviadas = {}
    for a in validated_body.answers:
        try:
            respuestas_enviadas[a.question_id] = {uuid.UUID(cid) for cid in a.selected_choice_ids}
        except ValueError:
            return jsonify({"error": "Bad Request", "message": "selected_choice_ids inválido", "status_code": 400}), 400

    puntaje = 0.0
    for pregunta, opciones in preguntas:
        correctas = {o.id for o in opciones if o.is_correct}
        seleccionadas = respuestas_enviadas.get(str(pregunta.id), set())
        es_correcta = seleccionadas == correctas
        if es_correcta:
            puntaje += float(pregunta.points)

        db.session.add(QuizAnswer(
            attempt_id=intento.id,
            question_id=pregunta.id,
            selected_choice_ids=list(seleccionadas),
            is_correct=es_correcta,
        ))

    intento.submitted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    intento.score = puntaje
    db.session.commit()

    return jsonify(intento.to_dict()), 200
