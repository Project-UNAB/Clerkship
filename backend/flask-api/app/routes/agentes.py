"""
Routes for ClinicAI UNAB AI Agents (Agente 1: Generador de Casos, Agente 2: Paciente Virtual, Agente 3: Evaluador Clínico).

These endpoints provide unified access to the multi-agent cognitive simulation architecture.
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app import limiter
from app.services import limites

from app.schemas.agentes import (
    EvaluateSessionRequest,
    EvaluationResultResponse,
    GenerateCaseRequest,
    GeneratedCaseResponse,
    PatientChatRequest,
    PatientChatResponse,
)
from app.schemas.base import validate_body
from app.services.agents import (
    get_case_generator_agent,
    get_clinical_evaluator_agent,
    get_virtual_patient_agent,
)

agentes_bp = Blueprint("agentes", __name__)


@agentes_bp.route("/caso", methods=["POST"])
@jwt_required()
@limiter.limit(limites.GENERAR_CASO, key_func=limites.usuario_o_ip)
@validate_body(GenerateCaseRequest)
def generar_caso(validated_body: GenerateCaseRequest):
    """
    Agente 1: Generador / Presentador de Casos Clínicos.
    Genera o presenta una viñeta clínica estructurada (motivo de consulta, enfermedad actual,
    antecedentes, signos vitales, examen físico y estándar de referencia ground truth).
    """
    agent = get_case_generator_agent()
    response_data: GeneratedCaseResponse = agent.generate_case(validated_body)
    return jsonify(response_data.model_dump()), 200


@agentes_bp.route("/paciente/chat", methods=["POST"])
@jwt_required()
@limiter.limit(limites.MENSAJE_PACIENTE, key_func=limites.usuario_o_ip)
@validate_body(PatientChatRequest)
def interrogar_paciente(validated_body: PatientChatRequest):
    """
    Agente 2: Paciente Virtual Estandarizado.
    Recibe la pregunta o intervención del estudiante y responde en lenguaje natural
    coloquial, clínicamente consistente con la patología asignada y reflejando su estado afectivo.
    """
    agent = get_virtual_patient_agent()
    response_data: PatientChatResponse = agent.respond_to_student(validated_body)
    return jsonify(response_data.model_dump()), 200


@agentes_bp.route("/evaluar", methods=["POST"])
@jwt_required()
@limiter.limit(limites.EVALUAR_CONSULTA, key_func=limites.usuario_o_ip)
@validate_body(EvaluateSessionRequest)
def evaluar_sesion(validated_body: EvaluateSessionRequest):
    """
    Agente 3: Tutor Evaluador de Razonamiento Clínico.
    Evalúa el desempeño del estudiante comparando la sesión contra el Ground Truth,
    generando una rúbrica cuantitativa por dominios y detectando sesgos cognitivos
    según la teoría de procesamiento dual (Sistema 1 vs Sistema 2).
    """
    agent = get_clinical_evaluator_agent()
    response_data: EvaluationResultResponse = agent.evaluate_session(validated_body)
    return jsonify(response_data.model_dump()), 200

