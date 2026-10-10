"""
Banco de preguntas y toma de intentos de un CourseContentItem tipo QUIZ.

El docente dueño arma las preguntas (opción única, opción múltiple o
verdadero/falso) con sus opciones marcando cuáles son correctas. El
estudiante nunca ve `is_correct` mientras responde — solo después de haber
entregado un intento, para poder revisar qué le quedó bien y qué no.
Calificación automática: todo o nada por pregunta (no hay puntaje parcial
dentro de una pregunta de opción múltiple).

Concurrencia: iniciar un intento bloquea la fila de matrícula del estudiante
(SELECT ... FOR UPDATE) y entregar o guardar bloquea la fila del intento, así
que peticiones en paralelo del mismo estudiante se atienden de a una. Detrás
están las restricciones únicas de quiz_attempts por si algo se salta el
bloqueo.
"""
import uuid
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import IntegrityError

from app import db, limiter
from app.models import (
    Course,
    CourseBlock,
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
from app.services.quiz_intentos import (
    POLITICAS_ENVIO_TARDIO,
    calcular_deadline,
    esta_vencido,
    nota_segun_politica,
    segundos_restantes,
)
from app.services import limites
from app.services.transacciones import transaccion
from app.utils import get_current_user, role_required

curso_quiz_bp = Blueprint("curso_quiz", __name__)


def _ensure_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _error(status_code, error, message, **extra):
    return jsonify({"error": error, "message": message, "status_code": status_code, **extra}), status_code


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


def _quiz_o_404(course_id, block_id, item_id):
    # El bloque tiene que ser de ESE curso: los permisos se deciden con el
    # curso de la URL, así que sin este cruce se podría llegar al cuestionario
    # de otro curso poniendo sus ids.
    if CourseBlock.query.filter_by(id=block_id, course_id=course_id).first() is None:
        return None, (jsonify({"error": "Not Found", "message": "Cuestionario no encontrado", "status_code": 404}), 404)
    item = CourseContentItem.query.filter_by(id=item_id, block_id=block_id).first()
    if item is None or item.type != "QUIZ":
        return None, (jsonify({"error": "Not Found", "message": "Cuestionario no encontrado", "status_code": 404}), 404)
    return item, None


def _tolerancia_segundos() -> int:
    return int(current_app.config.get("QUIZ_GRACE_SECONDS", 30) or 0)


def _politica_envio_tardio() -> str:
    politica = current_app.config.get("QUIZ_LATE_POLICY")
    return politica if politica in POLITICAS_ENVIO_TARDIO else "GRADE_SAVED"


def _deadline_del_intento(intento, item):
    """El límite que se fijó al iniciar el intento. Los intentos anteriores a
    esa columna no lo tienen guardado: se calcula con el cuestionario actual."""
    deadline = getattr(intento, "deadline_at", None)
    if deadline is not None:
        return _ensure_utc(deadline)
    return calcular_deadline(
        intento.started_at or datetime.now(timezone.utc),
        getattr(item, "time_limit_minutes", None),
        getattr(item, "due_at", None),
    )


def _intento_vencido(intento, item, ahora) -> bool:
    return esta_vencido(_deadline_del_intento(intento, item), ahora, _tolerancia_segundos())


def _puede_ver_respuestas_correctas(user, item) -> bool:
    """El estudiante solo ve cuáles eran las opciones correctas cuando ya no
    puede usarlas: sin intento que todavía pueda entregar y, además, con el
    plazo cerrado o los intentos agotados. Si no, bastaría entregar un
    intento en blanco para leer la clave y sacar la nota completa en el
    siguiente."""
    ahora = datetime.now(timezone.utc)
    intentos = QuizAttempt.query.filter_by(item_id=item.id, student_id=user.id).all()
    if any(i.submitted_at is None and not _intento_vencido(i, item, ahora) for i in intentos):
        return False
    due_at = _ensure_utc(item.due_at)
    if due_at and ahora > due_at:
        return True
    if not item.max_attempts:
        return False
    return len(intentos) >= item.max_attempts


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


def _error_en_opciones(tipo, choices):
    """Mensaje de error si las opciones no cuadran con el tipo de pregunta."""
    correctas = sum(1 for c in choices if c.is_correct)
    if correctas == 0:
        return "Marca al menos una opción como correcta"
    if tipo in ("SINGLE_CHOICE", "TRUE_FALSE") and correctas != 1:
        return f"{tipo} debe tener exactamente una opción correcta"
    return None


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
    _item, err = _quiz_o_404(course_id, block_id, item_id)
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
    _item, err = _quiz_o_404(course_id, block_id, item_id)
    if err:
        return err

    tipo = (validated_body.type or "").strip().upper()
    if tipo not in TIPOS_PREGUNTA:
        return jsonify({
            "error": "Bad Request",
            "message": f"type debe ser uno de: {', '.join(TIPOS_PREGUNTA)}",
            "status_code": 400,
        }), 400

    mensaje = _error_en_opciones(tipo, validated_body.choices)
    if mensaje:
        return jsonify({"error": "Bad Request", "message": mensaje, "status_code": 400}), 400
    if tipo == "TRUE_FALSE" and len(validated_body.choices) != 2:
        return jsonify({"error": "Bad Request", "message": "TRUE_FALSE debe tener exactamente 2 opciones", "status_code": 400}), 400

    # La pregunta y sus opciones se guardan juntas o no se guarda nada.
    with transaccion():
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
    _item, err = _quiz_o_404(course_id, block_id, item_id)
    if err:
        return err

    pregunta = QuizQuestion.query.filter_by(id=question_id, item_id=item_id).first()
    if pregunta is None:
        return jsonify({"error": "Not Found", "message": "Pregunta no encontrada", "status_code": 404}), 404

    # Se valida todo antes de tocar la pregunta: un 400 no deja cambios a medias.
    if validated_body.choices is not None:
        mensaje = _error_en_opciones(pregunta.type, validated_body.choices)
        if mensaje:
            return jsonify({"error": "Bad Request", "message": mensaje, "status_code": 400}), 400

    opciones = None
    with transaccion():
        if validated_body.prompt is not None:
            pregunta.prompt = validated_body.prompt.strip()
        if validated_body.points is not None:
            pregunta.points = validated_body.points
        if validated_body.position is not None:
            pregunta.position = validated_body.position

        if validated_body.choices is not None:
            QuizChoice.query.filter_by(question_id=pregunta.id).delete()
            opciones = []
            for i, c in enumerate(validated_body.choices):
                opcion = QuizChoice(question_id=pregunta.id, text=c.text.strip(), is_correct=c.is_correct, position=i)
                db.session.add(opcion)
                opciones.append(opcion)

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
    _item, err = _quiz_o_404(course_id, block_id, item_id)
    if err:
        return err

    pregunta = QuizQuestion.query.filter_by(id=question_id, item_id=item_id).first()
    if pregunta is None:
        return jsonify({"error": "Not Found", "message": "Pregunta no encontrada", "status_code": 404}), 404

    db.session.delete(pregunta)
    db.session.commit()
    return jsonify({"ok": True}), 200


# ─────────────────────────── Intentos (estudiante) ───────────────────────────

def _matricula_bloqueada(user, course):
    """La matrícula del estudiante en el curso con la fila bloqueada (SELECT
    ... FOR UPDATE) hasta que termine la transacción. Es el candado de
    "iniciar intento": dos peticiones en paralelo del mismo estudiante pasan
    de a una, así que la segunda ya ve el intento que creó la primera."""
    if user.role != "STUDENT":
        return None
    return (
        StudentCourse.query.filter_by(student_id=user.id, course_id=course.id)
        .with_for_update()
        .first()
    )


def _intento_bloqueado(attempt_id, item_id, student_id):
    """El intento con su fila bloqueada: quien entrega o guarda tiene el
    intento para sí hasta confirmar, y el siguiente lo lee ya actualizado."""
    return (
        QuizAttempt.query.filter_by(id=attempt_id, item_id=item_id, student_id=student_id)
        .with_for_update()
        .populate_existing()
        .first()
    )


def _respuestas_del_cuerpo(validated_body):
    """{question_id: {UUID de opción, ...}} — None si algún id no es un UUID
    (se valida antes de guardarlo en la columna ARRAY(UUID))."""
    enviadas = {}
    for a in validated_body.answers:
        try:
            enviadas[str(a.question_id)] = {uuid.UUID(str(cid)) for cid in a.selected_choice_ids}
        except ValueError:
            return None
    return enviadas


def _respuestas_guardadas(intento):
    """{question_id: QuizAnswer} de lo que el intento ya tiene guardado."""
    return {str(r.question_id): r for r in QuizAnswer.query.filter_by(attempt_id=intento.id).all()}


def _guardar_respuestas(intento, preguntas, enviadas):
    """Guarda (sin calificar) las respuestas enviadas, pisando las que hubiera
    para esas preguntas. Devuelve todas las respuestas del intento."""
    respuestas = _respuestas_guardadas(intento)
    for pregunta, _opciones in preguntas:
        clave = str(pregunta.id)
        if clave not in enviadas:
            continue
        fila = respuestas.get(clave)
        if fila is None:
            fila = QuizAnswer(attempt_id=intento.id, question_id=pregunta.id)
            db.session.add(fila)
            respuestas[clave] = fila
        fila.selected_choice_ids = list(enviadas[clave])
        fila.is_correct = None
    return respuestas


def _cerrar_intento(intento, preguntas, respuestas, ahora, vencido=False, anular=False):
    """Califica lo que haya en `respuestas` y deja el intento finalizado. Con
    `anular` (envío fuera de tiempo en modo REJECT) el intento cierra en cero."""
    puntaje = 0.0
    for pregunta, opciones in preguntas:
        fila = respuestas.get(str(pregunta.id))
        if fila is None:
            fila = QuizAnswer(attempt_id=intento.id, question_id=pregunta.id, selected_choice_ids=[])
            db.session.add(fila)
        correctas = {o.id for o in opciones if o.is_correct}
        es_correcta = (not anular) and set(fila.selected_choice_ids or []) == correctas
        fila.is_correct = es_correcta
        if es_correcta:
            puntaje += float(pregunta.points)

    intento.submitted_at = ahora
    intento.score = puntaje
    intento.expired = bool(vencido)


def _intento_abierto_dict(intento, item, preguntas, respuestas, ahora):
    """El intento en curso tal como lo ve el estudiante: preguntas sin
    is_correct, lo que lleva guardado y cuánto tiempo le queda."""
    deadline = _deadline_del_intento(intento, item)
    d = intento.to_dict()
    d["deadline_at"] = deadline.isoformat() if deadline else None
    d["time_limit_minutes"] = getattr(item, "time_limit_minutes", None)
    d["segundos_restantes"] = segundos_restantes(deadline, ahora)
    d["preguntas"] = []
    for pregunta, opciones in preguntas:
        pd = pregunta.to_dict(choices=opciones, incluir_respuesta_correcta=False)
        fila = respuestas.get(str(pregunta.id))
        if fila is not None:
            guardada = fila.to_dict()
            guardada["is_correct"] = None
            pd["tu_respuesta"] = guardada
        else:
            pd["tu_respuesta"] = None
        d["preguntas"].append(pd)
    return d


@curso_quiz_bp.post("/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos")
@jwt_required()
@limiter.limit(limites.INICIO_QUIZ, key_func=limites.usuario_o_ip)
def iniciar_intento(course_id, block_id, item_id):
    """El estudiante arranca un intento (201) o retoma el que tenía abierto
    (200). Devuelve las preguntas SIN is_correct — eso solo se ve después de
    entregar (ver obtener_intento). Todo ocurre con la fila de matrícula
    bloqueada: contar los intentos y crear el nuevo es una sola operación,
    así que max_attempts se respeta aunque lleguen varias peticiones a la vez."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err

    try:
        return _iniciar_intento(user, course, course_id, block_id, item_id)
    except IntegrityError:
        # Segunda barrera: las restricciones únicas de quiz_attempts.
        db.session.rollback()
        return _error(409, "Conflict", "Ya hay otro intento en curso para este cuestionario. Vuelve a intentarlo.")
    except Exception:
        db.session.rollback()
        raise


def _iniciar_intento(user, course, course_id, block_id, item_id):
    if _matricula_bloqueada(user, course) is None:
        db.session.rollback()
        return _forbidden()
    item, err = _quiz_o_404(course_id, block_id, item_id)
    if err:
        db.session.rollback()
        return err

    ahora = datetime.now(timezone.utc)
    preguntas = _preguntas_con_opciones(item_id)
    intentos = (
        QuizAttempt.query.filter_by(item_id=item_id, student_id=user.id)
        .order_by(QuizAttempt.attempt_number.asc())
        .all()
    )

    # Un intento abierto al que se le acabó el tiempo se cierra acá (nadie lo
    # entregó): cuenta como intento usado y deja de bloquear el siguiente.
    vigente = None
    hubo_cierres = False
    for intento in intentos:
        if intento.submitted_at is not None:
            continue
        if _intento_vencido(intento, item, ahora):
            _cerrar_intento(
                intento, preguntas, _respuestas_guardadas(intento), ahora,
                vencido=True, anular=_politica_envio_tardio() == "REJECT",
            )
            hubo_cierres = True
        else:
            vigente = intento

    def _salir(respuesta):
        # Los cierres por tiempo se confirman aunque la petición termine en error.
        if hubo_cierres:
            db.session.commit()
        else:
            db.session.rollback()
        return respuesta

    if vigente is not None:
        d = _intento_abierto_dict(vigente, item, preguntas, _respuestas_guardadas(vigente), ahora)
        d["reanudado"] = True
        return _salir((jsonify(d), 200))

    open_at = _ensure_utc(item.open_at)
    due_at = _ensure_utc(item.due_at)
    if open_at and ahora < open_at:
        return _salir(_error(400, "Bad Request", "Este cuestionario todavía no abre"))
    if due_at and ahora > due_at:
        return _salir(_error(400, "Bad Request", "El plazo para responder este cuestionario ya cerró"))
    if item.max_attempts and len(intentos) >= item.max_attempts:
        return _salir(_error(400, "Bad Request", "Ya usaste todos tus intentos para este cuestionario"))
    if not preguntas:
        return _salir(_error(400, "Bad Request", "Este cuestionario todavía no tiene preguntas"))

    intento = QuizAttempt(
        item_id=item_id,
        student_id=user.id,
        attempt_number=max((i.attempt_number or 0 for i in intentos), default=0) + 1,
        started_at=ahora,
        deadline_at=calcular_deadline(ahora, getattr(item, "time_limit_minutes", None), due_at),
        max_score=sum(float(p.points) for p, _ in preguntas),
        expired=False,
    )
    db.session.add(intento)
    db.session.commit()

    d = _intento_abierto_dict(intento, item, preguntas, {}, ahora)
    d["reanudado"] = False
    return jsonify(d), 201


@curso_quiz_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos")
@jwt_required()
def listar_intentos(course_id, block_id, item_id):
    """Docente dueño: todos los intentos de todos los estudiantes (para
    revisar notas). Estudiante: solo los suyos, con la nota que le queda
    según la política del cuestionario."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()
    item, err = _quiz_o_404(course_id, block_id, item_id)
    if err:
        return err

    es_docente = _es_docente_dueno(user, course)
    query = QuizAttempt.query.filter_by(item_id=item_id)
    if not es_docente:
        query = query.filter_by(student_id=user.id)
    intentos = query.order_by(QuizAttempt.started_at.desc()).all()

    estudiantes = {}
    if es_docente and intentos:
        ids = [i.student_id for i in intentos]
        estudiantes = {str(u.id): u for u in User.query.filter(User.id.in_(ids)).all()}

    politica = getattr(item, "grade_policy", None) or "BEST"
    cuerpo = {
        "intentos": [i.to_dict(student=estudiantes.get(str(i.student_id))) for i in intentos],
        "grade_policy": politica,
    }
    if not es_docente:
        cuerpo["nota"] = nota_segun_politica(intentos, politica)
    return jsonify(cuerpo), 200


@curso_quiz_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos/<attempt_id>")
@jwt_required()
def obtener_intento(course_id, block_id, item_id, attempt_id):
    """Un intento — solo su dueño o el docente. Entregado: el estudiante
    siempre ve qué preguntas acertó; cuáles eran las opciones correctas
    (is_correct de cada opción) solo cuando ya no puede volver a responder
    (ver _puede_ver_respuestas_correctas). En curso: las preguntas sin
    is_correct y lo que lleva guardado, para retomarlo."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()
    item, err = _quiz_o_404(course_id, block_id, item_id)
    if err:
        return err

    intento = QuizAttempt.query.filter_by(id=attempt_id, item_id=item_id).first()
    if intento is None:
        return jsonify({"error": "Not Found", "message": "Intento no encontrado", "status_code": 404}), 404

    es_dueno_intento = str(intento.student_id) == str(user.id)
    if not es_dueno_intento and not _es_docente_dueno(user, course):
        return _forbidden()

    if intento.submitted_at is None:
        if not es_dueno_intento:
            return jsonify(intento.to_dict()), 200
        d = _intento_abierto_dict(
            intento, item, _preguntas_con_opciones(item_id), _respuestas_guardadas(intento), datetime.now(timezone.utc)
        )
        return jsonify(d), 200

    d = intento.to_dict()
    revelar = _es_docente_dueno(user, course) or _puede_ver_respuestas_correctas(user, item)
    d["respuestas_reveladas"] = revelar
    respuestas_por_pregunta = _respuestas_guardadas(intento)
    d["preguntas"] = []
    for pregunta, opciones in _preguntas_con_opciones(item_id):
        pd = pregunta.to_dict(choices=opciones, incluir_respuesta_correcta=revelar)
        respuesta = respuestas_por_pregunta.get(str(pregunta.id))
        pd["tu_respuesta"] = respuesta.to_dict() if respuesta else None
        d["preguntas"].append(pd)

    return jsonify(d), 200


@curso_quiz_bp.put("/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos/<attempt_id>/respuestas")
@jwt_required()
@validate_body(ResponderIntentoRequest)
def guardar_respuestas(course_id, block_id, item_id, attempt_id, validated_body: ResponderIntentoRequest):
    """Guarda el avance de un intento en curso, sin entregarlo ni calificarlo.
    Es lo que se califica si el tiempo se acaba antes de que el estudiante
    entregue. No se puede guardar sobre un intento finalizado ni vencido."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_estudiante_matriculado(user, course):
        return _forbidden()
    item, err = _quiz_o_404(course_id, block_id, item_id)
    if err:
        return err

    enviadas = _respuestas_del_cuerpo(validated_body)
    if enviadas is None:
        return _error(400, "Bad Request", "selected_choice_ids inválido")

    try:
        intento = _intento_bloqueado(attempt_id, item_id, user.id)
        if intento is None:
            db.session.rollback()
            return _error(404, "Not Found", "Intento no encontrado")
        if intento.submitted_at is not None:
            db.session.rollback()
            return _error(409, "Conflict", "Este intento ya fue entregado y no se puede modificar")

        ahora = datetime.now(timezone.utc)
        if _intento_vencido(intento, item, ahora):
            db.session.rollback()
            return _error(409, "Conflict", "El tiempo de este intento se agotó: ya no se pueden guardar respuestas")

        _guardar_respuestas(intento, _preguntas_con_opciones(item_id), enviadas)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error(409, "Conflict", "No se pudo guardar: el intento cambió mientras tanto. Vuelve a intentarlo.")
    except Exception:
        db.session.rollback()
        raise

    deadline = _deadline_del_intento(intento, item)
    return jsonify({
        "ok": True,
        "deadline_at": deadline.isoformat() if deadline else None,
        "segundos_restantes": segundos_restantes(deadline, ahora),
    }), 200


@curso_quiz_bp.post("/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos/<attempt_id>/responder")
@jwt_required()
@validate_body(ResponderIntentoRequest)
def responder_intento(course_id, block_id, item_id, attempt_id, validated_body: ResponderIntentoRequest):
    """Entrega el intento: se califica y queda finalizado. Un intento
    finalizado no se puede volver a entregar (409). Si el envío llega con el
    tiempo vencido (límite + tolerancia), según QUIZ_LATE_POLICY se califica
    solo lo que estaba guardado (GRADE_SAVED) o se rechaza y el intento cierra
    en cero (REJECT)."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_estudiante_matriculado(user, course):
        return _forbidden()
    item, err = _quiz_o_404(course_id, block_id, item_id)
    if err:
        return err

    enviadas = _respuestas_del_cuerpo(validated_body)
    if enviadas is None:
        return _error(400, "Bad Request", "selected_choice_ids inválido")

    try:
        # Con la fila bloqueada, de dos envíos simultáneos el segundo espera
        # al primero y ya encuentra el intento entregado.
        intento = _intento_bloqueado(attempt_id, item_id, user.id)
        if intento is None:
            db.session.rollback()
            return _error(404, "Not Found", "Intento no encontrado")
        if intento.submitted_at is not None:
            db.session.rollback()
            return _error(409, "Conflict", "Este intento ya fue entregado y no se puede volver a enviar")

        preguntas = _preguntas_con_opciones(item_id)
        ahora = datetime.now(timezone.utc)
        vencido = _intento_vencido(intento, item, ahora)

        if vencido and _politica_envio_tardio() == "REJECT":
            _cerrar_intento(intento, preguntas, _respuestas_guardadas(intento), ahora, vencido=True, anular=True)
            db.session.commit()
            return _error(
                409, "Conflict",
                "El tiempo de este intento se agotó: el envío se rechazó y el intento quedó cerrado",
                intento=intento.to_dict(),
            )

        if vencido:
            # Fuera de tiempo: lo que llega en este envío no cuenta, solo lo
            # que el estudiante alcanzó a guardar antes del límite.
            respuestas = _respuestas_guardadas(intento)
        else:
            respuestas = _guardar_respuestas(intento, preguntas, enviadas)

        _cerrar_intento(intento, preguntas, respuestas, ahora, vencido=vencido)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error(409, "Conflict", "Este intento ya fue entregado y no se puede volver a enviar")
    except Exception:
        db.session.rollback()
        raise

    d = intento.to_dict()
    d["vencido"] = vencido
    return jsonify(d), 200
