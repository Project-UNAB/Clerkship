from datetime import datetime, timezone
import uuid

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy.sql import func

from app import db, get_mongo_db
from app.models import AiEvaluation, Consultation, Course, StudentCourse
from app.schemas import (
    ConsultationDetailResponse,
    ConsultationResponse,
    CreateConsultationRequest,
    FinishConsultationRequest,
    FinishConsultationResponse,
    PatientChatRequest,
    SendMessageRequest,
    SendMessageResponse,
    validate_body,
)
from app.schemas.agentes import EvaluateSessionRequest, GenerateCaseRequest
from app.services.agents import (
    get_case_generator_agent,
    get_clinical_evaluator_agent,
    get_virtual_patient_agent,
)
from app.utils import get_current_user, role_required

consultas_bp = Blueprint("consultas", __name__)


def _public_case_view(case_dict: dict) -> dict:
    """Versión del caso segura para el cliente — nunca incluye ground_truth
    (diagnóstico real, paraclínicos clave, diferenciales esperados): eso
    solo lo usan los Agentes 2 y 3 del lado del servidor."""
    safe = dict(case_dict or {})
    safe.pop("ground_truth", None)
    return safe


@consultas_bp.route("", methods=["GET"])
@jwt_required()
def listar_consultas():
    """Listar consultas clínicas del usuario autenticado."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({
            "error": "Not Found",
            "message": "Usuario no encontrado",
            "status_code": 404
        }), 404

    query = Consultation.query

    # Si es estudiante, solo ve sus propias simulaciones
    if current_user.role == "STUDENT":
        query = query.filter_by(student_id=current_user.id)
    # Si es docente, puede ver las de sus cursos
    elif current_user.role == "TEACHER":
        teacher_course_ids = [c.id for c in Course.query.filter_by(teacher_id=current_user.id).all()]
        query = query.filter(Consultation.course_id.in_(teacher_course_ids))

    # Filtros opcionales
    status = request.args.get("status")
    if status:
        query = query.filter_by(status=status.upper())

    course_id = request.args.get("course_id")
    if course_id:
        query = query.filter_by(course_id=course_id)

    specialty = request.args.get("specialty")
    if specialty:
        query = query.filter(Consultation.specialty.ilike(f"%{specialty}%"))

    consultations = query.order_by(Consultation.started_at.desc()).all()
    return jsonify([c.to_dict() for c in consultations]), 200


@consultas_bp.route("", methods=["POST"])
@role_required("STUDENT")
@validate_body(CreateConsultationRequest)
def crear_consulta(validated_body: CreateConsultationRequest):
    """Iniciar una nueva consulta clínica simulada — invoca al Agente 1
    (Generador de Casos) para crear una viñeta real y la deja lista en
    Mongo para que el Agente 2 (Paciente) la use en los próximos mensajes."""
    current_user = get_current_user()

    course_id = validated_body.course_id
    difficulty = validated_body.difficulty or "MEDIUM"
    specialty = validated_body.specialty or "Gastroenterología"

    # Validar que el estudiante esté matriculado en el curso
    enrollment = StudentCourse.query.filter_by(student_id=current_user.id, course_id=course_id).first()
    if not enrollment:
        return jsonify({
            "error": "Forbidden",
            "message": "El estudiante no está matriculado en este curso",
            "status_code": 403
        }), 403

    # 1. Agente 1 — genera el caso clínico real de esta sesión (elige uno de
    # los 8 subtemas de gastroenterología al azar si no se fuerza `condition`).
    case_agent = get_case_generator_agent()
    case_response = case_agent.generate_case(GenerateCaseRequest(
        course_id=course_id,
        specialty=specialty,
        difficulty=difficulty,
        condition=validated_body.condition,
    ))
    case_dict = case_response.model_dump()
    title = validated_body.title or case_dict.get("title") or "Simulación de Caso Clínico"

    # 2. Crear registro relacional en PostgreSQL
    consultation = Consultation(
        student_id=current_user.id,
        course_id=course_id,
        title=title,
        specialty=specialty,
        difficulty=difficulty,
        status="IN_PROGRESS",
    )
    db.session.add(consultation)
    db.session.commit()

    # 3. Guardar el caso COMPLETO (con ground_truth) en Mongo — el cliente
    # nunca lo recibe entero, solo la versión pública sin diagnóstico.
    chief_complaint = case_dict.get("chief_complaint") or "Buenos días doctor(a), he venido a consulta porque no me he sentido bien últimamente."
    try:
        mongo_db = get_mongo_db()
        mongo_db.consultations.insert_one({
            "consultation_id": str(consultation.id),
            "status": "IN_PROGRESS",
            "case": case_dict,
            "chat_history": [
                {
                    "sender": "PATIENT",
                    "content": chief_complaint,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ],
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        # No bloquear la creación si Mongo opera en modo desconectado
        pass

    result = consultation.to_dict()
    result["case_details"] = _public_case_view(case_dict)
    result["chat_history"] = [{
        "sender": "PATIENT",
        "content": chief_complaint,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }]
    return jsonify(result), 201


@consultas_bp.route("/<string:consultation_id>", methods=["GET"])
@jwt_required()
def obtener_consulta(consultation_id):
    """Obtener el detalle y transcripción de una consulta clínica."""
    current_user = get_current_user()
    try:
        cons_uuid = uuid.UUID(consultation_id)
    except ValueError:
        return jsonify({
            "error": "Bad Request",
            "message": "ID de consulta inválido",
            "status_code": 400
        }), 400

    consultation = Consultation.query.get(cons_uuid)
    if not consultation:
        return jsonify({
            "error": "Not Found",
            "message": "Consulta no encontrada",
            "status_code": 404
        }), 404

    # Control de acceso: solo el estudiante dueño o el docente del curso
    if current_user.role == "STUDENT" and consultation.student_id != current_user.id:
        return jsonify({
            "error": "Forbidden",
            "message": "No tienes acceso a esta consulta",
            "status_code": 403
        }), 403

    res_data = consultation.to_dict()

    # Obtener historial de chat desde MongoDB — igual que en crear_consulta,
    # nunca se manda el ground_truth (diagnostico real) al cliente aca.
    try:
        mongo_db = get_mongo_db()
        doc = mongo_db.consultations.find_one({"consultation_id": str(consultation.id)}, {"_id": 0})
        if doc:
            res_data["chat_history"] = doc.get("chat_history", [])
            res_data["case_details"] = _public_case_view(doc.get("case", {}))
    except Exception:
        res_data["chat_history"] = []
        res_data["case_details"] = {}

    return jsonify(res_data), 200


@consultas_bp.route("/<string:consultation_id>/mensajes", methods=["POST"])
@role_required("STUDENT")
@validate_body(SendMessageRequest)
def enviar_mensaje(consultation_id, validated_body: SendMessageRequest):
    """Enviar mensaje durante la consulta y recibir respuesta del paciente virtual."""
    current_user = get_current_user()
    try:
        cons_uuid = uuid.UUID(consultation_id)
    except ValueError:
        return jsonify({
            "error": "Bad Request",
            "message": "ID de consulta inválido",
            "status_code": 400
        }), 400

    consultation = Consultation.query.get(cons_uuid)
    if not consultation:
        return jsonify({
            "error": "Not Found",
            "message": "Consulta no encontrada",
            "status_code": 404
        }), 404

    if consultation.student_id != current_user.id:
        return jsonify({
            "error": "Forbidden",
            "message": "No tienes acceso a esta consulta",
            "status_code": 403
        }), 403

    if consultation.status != "IN_PROGRESS":
        return jsonify({
            "error": "Bad Request",
            "message": "La consulta no está en curso",
            "status_code": 400
        }), 400

    content = validated_body.content.strip()

    user_msg = {
        "sender": "STUDENT",
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Traer el caso real (con ground_truth) y el historial previo desde
    # Mongo — sin esto el Agente 2 no tiene contexto de qué paciente es ni
    # el guardrail anti-fuga de diagnóstico tiene nada contra qué comparar.
    mongo_db = get_mongo_db()
    try:
        mongo_doc = mongo_db.consultations.find_one({"consultation_id": str(consultation.id)}) or {}
    except Exception:
        mongo_doc = {}
    case_context = mongo_doc.get("case") or {}
    chat_history = mongo_doc.get("chat_history") or []

    # Generar respuesta dinámica del Agente 2 (Paciente Virtual)
    patient_agent = get_virtual_patient_agent()
    simulated_resp = patient_agent.respond_to_student(
        PatientChatRequest(
            consultation_id=str(consultation.id),
            case_context=case_context,
            message=content,
            chat_history=chat_history,
        )
    )

    patient_reply = {
        "sender": "PATIENT",
        "content": simulated_resp.reply,
        "timestamp": simulated_resp.timestamp,
    }

    try:
        mongo_db.consultations.update_one(
            {"consultation_id": str(consultation.id)},
            {"$push": {"chat_history": {"$each": [user_msg, patient_reply]}}}
        )
    except Exception:
        pass

    return jsonify({
        "sent": user_msg,
        "reply": patient_reply,
        "guardrail_activado": simulated_resp.guardrail_activado,
    }), 200


@consultas_bp.route("/<string:consultation_id>/finalizar", methods=["PATCH"])
@role_required("STUDENT")
@validate_body(FinishConsultationRequest)
def finalizar_consulta(consultation_id, validated_body: FinishConsultationRequest):
    """Finalizar la sesión de consulta clínica."""
    current_user = get_current_user()
    try:
        cons_uuid = uuid.UUID(consultation_id)
    except ValueError:
        return jsonify({
            "error": "Bad Request",
            "message": "ID de consulta inválido",
            "status_code": 400
        }), 400

    consultation = Consultation.query.get(cons_uuid)
    if not consultation:
        return jsonify({
            "error": "Not Found",
            "message": "Consulta no encontrada",
            "status_code": 404
        }), 404

    if consultation.student_id != current_user.id:
        return jsonify({
            "error": "Forbidden",
            "message": "No tienes acceso a esta consulta",
            "status_code": 403
        }), 403

    if consultation.status == "COMPLETED":
        return jsonify({
            "message": "La consulta ya había sido completada",
            "consultation": consultation.to_dict()
        }), 200

    final_diagnosis = (validated_body.final_diagnosis or "").strip()
    if not final_diagnosis:
        return jsonify({
            "error": "Bad Request",
            "message": "final_diagnosis es requerido para poder evaluar la consulta",
            "status_code": 400
        }), 400

    mongo_db = get_mongo_db()
    try:
        mongo_doc = mongo_db.consultations.find_one({"consultation_id": str(consultation.id)}) or {}
    except Exception:
        mongo_doc = {}
    case_context = mongo_doc.get("case") or {}
    chat_history = mongo_doc.get("chat_history") or []

    # Agente 3 — evalúa la sesión completa contra la rúbrica/ground_truth
    # del caso real generado al abrir la consulta (Agente 1).
    evaluator_agent = get_clinical_evaluator_agent()
    evaluation = evaluator_agent.evaluate_session(EvaluateSessionRequest(
        consultation_id=str(consultation.id),
        case_context=case_context,
        chat_history=chat_history,
        requested_tests=validated_body.requested_tests,
        differential_diagnoses=validated_body.differential_diagnoses,
        final_diagnosis=final_diagnosis,
    ))
    eval_dict = evaluation.model_dump()

    consultation.status = "COMPLETED"
    consultation.finished_at = func.now()
    consultation.score = evaluation.final_score
    db.session.commit()

    # Persistir la evaluación resumida en Postgres (ai_evaluations, 1:1 con la consulta)
    ai_eval_row = AiEvaluation.query.filter_by(consultation_id=cons_uuid).first()
    if ai_eval_row is None:
        ai_eval_row = AiEvaluation(consultation_id=cons_uuid)
        db.session.add(ai_eval_row)
    ai_eval_row.final_score = evaluation.final_score
    ai_eval_row.feedback_summary = evaluation.feedback_summary
    ai_eval_row.execution_time_seconds = (evaluation.latency_ms or 0) / 1000
    db.session.commit()

    try:
        mongo_db.consultations.update_one(
            {"consultation_id": str(consultation.id)},
            {"$set": {
                "status": "COMPLETED",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "ai_evaluation": eval_dict,
            }}
        )
    except Exception:
        pass

    return jsonify({
        "message": "Consulta finalizada con éxito",
        "consultation": consultation.to_dict(),
        "evaluation": eval_dict,
    }), 200
