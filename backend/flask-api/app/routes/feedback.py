"""Formularios de retroalimentación, un endpoint por pestaña del dashboard.

Cada pestaña guarda en su propia tabla (feedback_inicio, feedback_casos,
feedback_historial, feedback_biblioteca) con sus propias preguntas.
"""
import uuid

from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import FeedbackBiblioteca, FeedbackCasos, FeedbackHistorial, FeedbackInicio
from app.schemas import validate_body
from app.schemas.feedback import (
    FeedbackBibliotecaRequest,
    FeedbackCasosRequest,
    FeedbackHistorialRequest,
    FeedbackInicioRequest,
)

feedback_bp = Blueprint("feedback", __name__)


def _guardar(modelo, validated_body):
    """Guarda el formulario asociado al usuario del JWT."""
    try:
        user_id = uuid.UUID(get_jwt_identity())
    except (TypeError, ValueError):
        return jsonify({"error": "Unauthorized", "message": "Sesión inválida", "status_code": 401}), 401

    registro = modelo(user_id=user_id, **validated_body.model_dump())
    db.session.add(registro)
    db.session.commit()
    return jsonify({"ok": True, "message": "Gracias por tu retroalimentación."}), 201


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
