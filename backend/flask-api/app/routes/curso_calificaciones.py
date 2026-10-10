"""
Libro de calificaciones de un curso: junta en una sola vista las notas de
todas las Tareas (ASSIGNMENT) y Cuestionarios (QUIZ) del curso, sin
importar en qué bloque estén. El docente dueño ve a todos los estudiantes;
cada estudiante solo ve su propia fila.

Tareas: la nota es la de la entrega ya calificada (AssignmentSubmission.score).
Cuestionarios: la nota sale de los intentos ya entregados según el
grade_policy del cuestionario — BEST (el más alto, por defecto), LAST (el
último), FIRST (el primero) o AVERAGE (el promedio). El puntaje máximo se
calcula sumando los puntos de las preguntas actuales, no de un intento viejo
que pudo quedar desactualizado.
"""
from datetime import datetime, timezone

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models import (
    AssignmentSubmission,
    Course,
    CourseBlock,
    CourseContentItem,
    QuizAttempt,
    QuizQuestion,
    Student,
    StudentCourse,
    User,
)
from app.services import auditoria, exportar_calificaciones, paginacion
from app.services.quiz_intentos import POLITICA_NOTA_POR_DEFECTO, POLITICAS_NOTA, nota_segun_politica
from app.utils import get_current_user, role_required

curso_calificaciones_bp = Blueprint("curso_calificaciones", __name__)


def _curso_o_404(course_id):
    course = Course.query.get(course_id)
    if course is None:
        return None, (jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404)
    return course, None


def _es_docente_dueno(user, course) -> bool:
    return user.role == "TEACHER" and str(course.teacher_id) == str(user.id)


def _forbidden():
    return jsonify({"error": "Forbidden", "message": "No tienes acceso a este curso", "status_code": 403}), 403


def _items_calificables(course_id):
    """Todas las Tareas y Cuestionarios del curso, en cualquier bloque,
    ordenados por posición del bloque y luego del item."""
    return (
        CourseContentItem.query.join(CourseBlock, CourseContentItem.block_id == CourseBlock.id)
        .filter(CourseBlock.course_id == course_id, CourseContentItem.type.in_(["ASSIGNMENT", "QUIZ"]))
        .order_by(CourseBlock.position.asc(), CourseContentItem.position.asc())
        .all()
    )


def _max_score_quiz_por_item(quiz_ids):
    if not quiz_ids:
        return {}
    filas = (
        db.session.query(QuizQuestion.item_id, db.func.coalesce(db.func.sum(QuizQuestion.points), 0))
        .filter(QuizQuestion.item_id.in_(quiz_ids))
        .group_by(QuizQuestion.item_id)
        .all()
    )
    return {str(item_id): float(total) for item_id, total in filas}


def _politica_de_nota(item) -> str:
    politica = getattr(item, "grade_policy", None)
    return politica if politica in POLITICAS_NOTA else POLITICA_NOTA_POR_DEFECTO


def _construir_matriz(course_id, student_ids):
    """({items_meta}, {student_id: {item_id: {score, max_score, status}}}),
    solo para los estudiantes de `student_ids` (los de la página que se pide,
    o uno solo en /calificaciones/mias): no se carga el curso entero."""
    items = _items_calificables(course_id)
    student_ids = list(student_ids)
    assignment_ids = [i.id for i in items if i.type == "ASSIGNMENT"]
    quiz_ids = [i.id for i in items if i.type == "QUIZ"]

    max_score_quiz = _max_score_quiz_por_item(quiz_ids)

    items_meta = []
    for item in items:
        max_score = float(item.max_score) if item.type == "ASSIGNMENT" and item.max_score is not None else None
        if item.type == "QUIZ":
            max_score = max_score_quiz.get(str(item.id))
        meta = {
            "id": str(item.id),
            "block_id": str(item.block_id),
            "type": item.type,
            "title": item.title,
            "max_score": max_score,
        }
        if item.type == "QUIZ":
            meta["grade_policy"] = _politica_de_nota(item)
        items_meta.append(meta)

    celdas_por_estudiante: dict = {}

    if assignment_ids and student_ids:
        # Las entregas en la papelera quedan fuera solas (borrado suave).
        entregas = AssignmentSubmission.query.filter(
            AssignmentSubmission.item_id.in_(assignment_ids), AssignmentSubmission.student_id.in_(student_ids),
        ).all()
        for e in entregas:
            fila = celdas_por_estudiante.setdefault(str(e.student_id), {})
            if e.score is not None:
                fila[str(e.item_id)] = {"score": float(e.score), "status": "graded"}
            else:
                fila[str(e.item_id)] = {"score": None, "status": "submitted"}

    if quiz_ids and student_ids:
        intentos = QuizAttempt.query.filter(
            QuizAttempt.item_id.in_(quiz_ids), QuizAttempt.student_id.in_(student_ids),
            QuizAttempt.submitted_at.isnot(None),
        ).all()
        politica_por_item = {str(i.id): _politica_de_nota(i) for i in items if i.type == "QUIZ"}
        intentos_por_estudiante_item: dict = {}
        for a in intentos:
            intentos_por_estudiante_item.setdefault((str(a.student_id), str(a.item_id)), []).append(a)
        for (student_id, item_id), suyos in intentos_por_estudiante_item.items():
            score = nota_segun_politica(suyos, politica_por_item.get(item_id))
            if score is None:
                continue
            fila = celdas_por_estudiante.setdefault(student_id, {})
            fila[item_id] = {"score": score, "status": "graded", "attempts": len(suyos)}

    return items_meta, celdas_por_estudiante


def _promedio(items_meta, calificaciones) -> float | None:
    total_obtenido = 0.0
    total_posible = 0.0
    for meta in items_meta:
        if meta["max_score"] is None:
            continue
        celda = calificaciones.get(meta["id"])
        if celda and celda.get("score") is not None:
            total_obtenido += celda["score"]
            total_posible += meta["max_score"]
    if total_posible == 0:
        return None
    return round((total_obtenido / total_posible) * 100, 1)


@curso_calificaciones_bp.get("/<course_id>/calificaciones")
@role_required("TEACHER")
def calificaciones_curso(course_id):
    """El docente dueño ve la matriz completa: todos los estudiantes x
    todas las Tareas/Cuestionarios del curso, con el promedio de cada uno."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()

    # Se pagina por estudiante (las filas de la matriz); las columnas son
    # siempre todas las tareas y cuestionarios del curso.
    page, per_page = paginacion.parametros()
    matriculas, total = paginacion.paginar(
        db.session.query(StudentCourse, Student, User)
        .join(Student, Student.user_id == StudentCourse.student_id)
        .join(User, User.id == Student.user_id)
        .filter(StudentCourse.course_id == course_id)
        .order_by(User.first_name.asc(), User.last_name.asc(), User.id.asc()),
        page, per_page,
    )

    # Solo se traen las entregas e intentos de los estudiantes de esta página.
    items_meta, celdas_por_estudiante = _construir_matriz(course_id, [u.id for _m, _s, u in matriculas])

    estudiantes = []
    for _matricula, student, user_row in matriculas:
        calificaciones = celdas_por_estudiante.get(str(user_row.id), {})
        estudiantes.append({
            "student_id": str(user_row.id),
            "nombre": f"{user_row.first_name} {user_row.last_name}",
            "student_code": student.student_code,
            "calificaciones": calificaciones,
            "promedio": _promedio(items_meta, calificaciones),
        })

    return jsonify({"items": items_meta, "estudiantes": estudiantes, **paginacion.meta(total, page, per_page)}), 200


@curso_calificaciones_bp.get("/<course_id>/calificaciones/exportar")
@role_required("TEACHER")
def exportar_calificaciones_curso(course_id):
    """El docente dueño descarga el libro completo (todos los estudiantes) en
    CSV o XLSX: ?formato=csv|xlsx. Solo de sus propios cursos."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()

    formato = (request.args.get("formato") or "xlsx").strip().lower()
    if formato not in exportar_calificaciones.FORMATOS:
        return jsonify({"error": "Bad Request", "message": "formato debe ser csv o xlsx", "status_code": 400}), 400

    matriculas = (
        db.session.query(StudentCourse, Student, User)
        .join(Student, Student.user_id == StudentCourse.student_id)
        .join(User, User.id == Student.user_id)
        .filter(StudentCourse.course_id == course_id)
        .order_by(User.first_name.asc(), User.last_name.asc(), User.id.asc())
        .all()
    )
    items_meta, celdas_por_estudiante = _construir_matriz(course_id, [u.id for _m, _s, u in matriculas])

    estudiantes = []
    for _matricula, student, user_row in matriculas:
        calificaciones = celdas_por_estudiante.get(str(user_row.id), {})
        estudiantes.append({
            "student_code": student.student_code,
            "nombre": f"{user_row.first_name} {user_row.last_name}",
            "email": user_row.email,
            "calificaciones": calificaciones,
            "promedio": _promedio(items_meta, calificaciones),
        })

    contenido = exportar_calificaciones.exportar(formato, items_meta, estudiantes, titulo_hoja=course.name)

    # Sacar las notas de todo un curso queda registrado.
    auditoria.registrar(
        auditoria.GRADEBOOK_EXPORT, "course", course.id, new={"formato": formato, "estudiantes": len(estudiantes)},
    )
    db.session.commit()

    nombre = exportar_calificaciones.nombre_de_archivo(course.name, formato, datetime.now(timezone.utc))
    return Response(
        contenido,
        mimetype=exportar_calificaciones.MIME[formato],
        headers={"Content-Disposition": f'attachment; filename="{nombre}"', "Cache-Control": "no-store"},
    )


@curso_calificaciones_bp.get("/<course_id>/calificaciones/mias")
@jwt_required()
def mis_calificaciones(course_id):
    """El estudiante matriculado ve solo su propia fila."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if user.role != "STUDENT" or StudentCourse.query.filter_by(student_id=user.id, course_id=course.id).first() is None:
        return _forbidden()

    items_meta, celdas_por_estudiante = _construir_matriz(course_id, [user.id])
    calificaciones = celdas_por_estudiante.get(str(user.id), {})

    return jsonify({
        "items": items_meta,
        "calificaciones": calificaciones,
        "promedio": _promedio(items_meta, calificaciones),
    }), 200
