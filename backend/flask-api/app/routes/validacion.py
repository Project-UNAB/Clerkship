"""Validación por expertos. Ruta pública (sin sesión): los expertos no tienen cuenta.
Límite de envíos por IP para evitar spam."""
from flask import Blueprint, jsonify

from app import db, limiter
from app.models import ValidacionBiblioteca, ValidacionCasos, ValidacionHistorial, ValidacionInicio
from app.schemas import validate_body
from app.schemas.validacion import (
    ValidacionBibliotecaRequest,
    ValidacionCasosRequest,
    ValidacionHistorialRequest,
    ValidacionInicioRequest,
)

validacion_bp = Blueprint("validacion", __name__)


def _guardar(modelo, validated_body):
    registro = modelo(**validated_body.model_dump())
    db.session.add(registro)
    db.session.commit()
    return jsonify({"ok": True, "message": "Gracias por tu validación."}), 201


@validacion_bp.post("/inicio")
@limiter.limit("20 per hour")
@validate_body(ValidacionInicioRequest)
def validar_inicio(validated_body: ValidacionInicioRequest):
    return _guardar(ValidacionInicio, validated_body)


@validacion_bp.post("/casos")
@limiter.limit("20 per hour")
@validate_body(ValidacionCasosRequest)
def validar_casos(validated_body: ValidacionCasosRequest):
    return _guardar(ValidacionCasos, validated_body)


@validacion_bp.post("/historial")
@limiter.limit("20 per hour")
@validate_body(ValidacionHistorialRequest)
def validar_historial(validated_body: ValidacionHistorialRequest):
    return _guardar(ValidacionHistorial, validated_body)


@validacion_bp.post("/biblioteca")
@limiter.limit("20 per hour")
@validate_body(ValidacionBibliotecaRequest)
def validar_biblioteca(validated_body: ValidacionBibliotecaRequest):
    return _guardar(ValidacionBiblioteca, validated_body)
