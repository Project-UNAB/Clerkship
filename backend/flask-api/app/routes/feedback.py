"""Formularios de retroalimentación («Opinión», de 1 a 5), uno por pestaña.

Cada pestaña guarda en su propia tabla (feedback_inicio, feedback_casos,
feedback_historial, feedback_biblioteca) con sus propias preguntas. Cada
usuario tiene una respuesta por pestaña: si vuelve a responder, se actualiza
(la fecha pasa a ser la de la última respuesta).
"""
import uuid

from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.sql import func

from app import db
from app.models import FeedbackBiblioteca, FeedbackCasos, FeedbackHistorial, FeedbackInicio, User
from app.schemas import validate_body
from app.schemas.feedback import (
    FeedbackBibliotecaRequest,
    FeedbackCasosRequest,
    FeedbackHistorialRequest,
    FeedbackInicioRequest,
)

feedback_bp = Blueprint("feedback", __name__)

MODELOS = {"inicio": FeedbackInicio, "casos": FeedbackCasos, "historial": FeedbackHistorial, "biblioteca": FeedbackBiblioteca}
# Columnas que no son respuestas del formulario.
NO_RESPUESTAS = {"id", "user_id", "id_usuario", "comentario", "created_at"}


def preguntas_de(modelo) -> list:
    """Claves de las preguntas (1 a 5) del formulario, en el orden de la tabla."""
    return [c.name for c in modelo.__table__.columns if c.name not in NO_RESPUESTAS]


def _usuario_de_la_sesion():
    try:
        return uuid.UUID(get_jwt_identity())
    except (TypeError, ValueError):
        return None


def _sesion_invalida():
    return jsonify({"error": "Unauthorized", "message": "Sesión inválida", "status_code": 401}), 401


def _respuesta_a_dict(modelo, fila) -> dict:
    return {
        "respuestas": {k: getattr(fila, k) for k in preguntas_de(modelo)},
        "comentario": fila.comentario,
        "fecha": fila.created_at.isoformat() if fila.created_at else None,
    }


def _guardar(modelo, validated_body):
    """Guarda (o actualiza) la respuesta del usuario de la sesión."""
    user_id = _usuario_de_la_sesion()
    if user_id is None:
        return _sesion_invalida()
    datos = validated_body.model_dump()
    if not datos.get("id_usuario"):
        usuario = User.query.get(user_id)
        datos["id_usuario"] = (usuario.username if usuario else str(user_id))[:60]

    existente = modelo.query.filter_by(user_id=user_id).order_by(modelo.created_at.desc()).first()
    if existente is None:
        db.session.add(modelo(user_id=user_id, **datos))
        estado, mensaje = 201, "Gracias por tu retroalimentación."
    else:
        for clave, valor in datos.items():
            setattr(existente, clave, valor)
        existente.created_at = func.now()
        estado, mensaje = 200, "Actualizamos tu retroalimentación."
    db.session.commit()
    return jsonify({"ok": True, "message": mensaje, "actualizada": estado == 200}), estado


@feedback_bp.get("/<pestana>/mia")
@jwt_required()
def mi_respuesta(pestana):
    """La respuesta del usuario en esa pestaña (para mostrarla y poder actualizarla)."""
    modelo = MODELOS.get(pestana)
    if modelo is None:
        return jsonify({"error": "Not Found", "message": "Pestaña no válida.", "status_code": 404}), 404
    user_id = _usuario_de_la_sesion()
    if user_id is None:
        return _sesion_invalida()
    fila = modelo.query.filter_by(user_id=user_id).order_by(modelo.created_at.desc()).first()
    return jsonify({"respuesta": _respuesta_a_dict(modelo, fila) if fila else None}), 200


@feedback_bp.post("/inicio")
@jwt_required()
@validate_body(FeedbackInicioRequest)
def feedback_inicio(validated_body: FeedbackInicioRequest):
    return _guardar(FeedbackInicio, validated_body)


@feedback_bp.post("/casos")
@jwt_required()
@validate_body(FeedbackCasosRequest)
def feedback_casos(validated_body: FeedbackCasosRequest):
    return _guardar(FeedbackCasos, validated_body)


@feedback_bp.post("/historial")
@jwt_required()
@validate_body(FeedbackHistorialRequest)
def feedback_historial(validated_body: FeedbackHistorialRequest):
    return _guardar(FeedbackHistorial, validated_body)


@feedback_bp.post("/biblioteca")
@jwt_required()
@validate_body(FeedbackBibliotecaRequest)
def feedback_biblioteca(validated_body: FeedbackBibliotecaRequest):
    return _guardar(FeedbackBiblioteca, validated_body)
