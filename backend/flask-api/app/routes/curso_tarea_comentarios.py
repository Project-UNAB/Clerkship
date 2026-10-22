"""Comentarios privados de una tarea: un hilo por estudiante con el docente.

- El estudiante matriculado ve y escribe solo en su propio hilo, haya
  entregado o no (puede preguntar antes de entregar).
- El docente dueño del curso ve la lista de hilos de la tarea y responde en
  el hilo de cada estudiante matriculado.
Cada quien borra sus propios comentarios; el docente puede borrar cualquiera
de su curso."""
import uuid
from typing import Annotated, Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from pydantic import Field, ValidationError
from sqlalchemy import func

from app import db, limiter
from app.models import AssignmentComment, StudentCourse, User
from app.routes.curso_contenido import (
    _curso_o_404, _es_docente_dueno, _es_estudiante_matriculado, _forbidden, _tarea_o_404,
)
from app.schemas.base import BaseSchema
from app.utils import get_current_user

curso_tarea_comentarios_bp = Blueprint("curso_tarea_comentarios", __name__)

RUTA = "/<course_id>/bloques/<block_id>/contenido/<item_id>/comentarios"
MAXIMO_POR_HILO = 500


class CrearComentarioTareaRequest(BaseSchema):
    body: Annotated[str, Field(min_length=1, max_length=2000)]
    # Solo para el docente: el estudiante del hilo en el que responde.
    estudiante_id: Optional[uuid.UUID] = None


def _error(status, mensaje):
    nombres = {400: "Bad Request", 404: "Not Found"}
    return jsonify({"error": nombres.get(status, "Error"), "message": mensaje, "status_code": status}), status


def _contexto(course_id, block_id, item_id):
    """(usuario, curso, tarea, es_docente) o la respuesta de error."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return None, err
    es_docente = _es_docente_dueno(user, course)
    if not es_docente and not _es_estudiante_matriculado(user, course):
        return None, _forbidden()
    item, err = _tarea_o_404(course_id, block_id, item_id)
    if err:
        return None, err
    return (user, course, item, es_docente), None


def _matriculado(course_id, student_id) -> bool:
    return StudentCourse.query.filter_by(student_id=student_id, course_id=course_id).first() is not None


def _hilo(item_id, student_id, yo):
    comentarios = (AssignmentComment.query.filter_by(item_id=item_id, student_id=student_id)
                   .order_by(AssignmentComment.created_at.asc()).limit(MAXIMO_POR_HILO).all())
    autores = {str(u.id): u for u in User.query.filter(User.id.in_({c.author_id for c in comentarios})).all()} if comentarios else {}
    return [c.to_dict(autores.get(str(c.author_id)), yo) for c in comentarios]


@curso_tarea_comentarios_bp.get(RUTA)
@jwt_required()
def listar_comentarios_tarea(course_id, block_id, item_id):
    """Estudiante: su hilo. Docente: con ?estudiante=<id>, ese hilo; sin él, la
    lista de hilos de la tarea (quién escribió, cuántos y cuándo el último)."""
    ctx, err = _contexto(course_id, block_id, item_id)
    if err:
        return err
    user, course, item, es_docente = ctx

    if not es_docente:
        return jsonify({"comentarios": _hilo(item.id, user.id, user.id)}), 200

    estudiante = request.args.get("estudiante")
    if estudiante:
        try:
            estudiante_id = uuid.UUID(estudiante)
        except ValueError:
            return _error(400, "Estudiante inválido.")
        if not _matriculado(course.id, estudiante_id):
            return _error(404, "Ese estudiante no está en el curso.")
        return jsonify({"comentarios": _hilo(item.id, estudiante_id, user.id)}), 200

    filas = (db.session.query(AssignmentComment.student_id, func.count(AssignmentComment.id), func.max(AssignmentComment.created_at))
             .filter(AssignmentComment.item_id == item.id)
             .group_by(AssignmentComment.student_id).all())
    nombres = {str(u.id): u for u in User.query.filter(User.id.in_([f[0] for f in filas])).all()} if filas else {}
    hilos = []
    for student_id, total, ultimo in sorted(filas, key=lambda f: f[2] or 0, reverse=True):
        u = nombres.get(str(student_id))
        hilos.append({
            "student_id": str(student_id),
            "student_name": f"{u.first_name} {u.last_name}".strip() if u else "Estudiante",
            "total": total,
            "ultimo_at": ultimo.isoformat() if ultimo else None,
        })
    return jsonify({"hilos": hilos}), 200


@curso_tarea_comentarios_bp.post(RUTA)
@jwt_required()
@limiter.limit("60 per minute")
def crear_comentario_tarea(course_id, block_id, item_id):
    # Primero los permisos: a quien no es del curso no se le dice nada del formato.
    ctx, err = _contexto(course_id, block_id, item_id)
    if err:
        return err
    user, course, item, es_docente = ctx
    try:
        validated_body = CrearComentarioTareaRequest.model_validate(request.get_json(silent=True) or {})
    except ValidationError as e:
        return jsonify({"error": "Bad Request", "message": "Comentario inválido.", "status_code": 400,
                        "details": e.errors(include_url=False, include_context=False)}), 400
    texto = validated_body.body.strip()
    if not texto:
        return _error(400, "Escribe el comentario.")

    if es_docente:
        if validated_body.estudiante_id is None:
            return _error(400, "Indica en qué hilo respondes (estudiante_id).")
        if not _matriculado(course.id, validated_body.estudiante_id):
            return _error(404, "Ese estudiante no está en el curso.")
        student_id = validated_body.estudiante_id
    else:
        student_id = user.id

    comentario = AssignmentComment(item_id=item.id, student_id=student_id, author_id=user.id, body=texto)
    db.session.add(comentario)
    db.session.commit()
    return jsonify({"comentario": comentario.to_dict(user, user.id)}), 201


@curso_tarea_comentarios_bp.delete(RUTA + "/<comment_id>")
@jwt_required()
def borrar_comentario_tarea(course_id, block_id, item_id, comment_id):
    ctx, err = _contexto(course_id, block_id, item_id)
    if err:
        return err
    user, course, item, es_docente = ctx
    try:
        cid = uuid.UUID(comment_id)
    except ValueError:
        return _error(404, "El comentario no existe.")
    comentario = AssignmentComment.query.filter_by(id=cid, item_id=item.id).first()
    # El estudiante solo ve su hilo: un comentario de otro hilo es como si no existiera.
    if comentario is None or (not es_docente and comentario.student_id != user.id):
        return _error(404, "El comentario no existe.")
    if not es_docente and comentario.author_id != user.id:
        return _forbidden()
    db.session.delete(comentario)
    db.session.commit()
    return jsonify({"ok": True}), 200
