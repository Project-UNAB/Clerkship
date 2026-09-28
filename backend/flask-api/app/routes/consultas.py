"""
Rutas de consultas clinicas — flujo completo del simulador de gastroenterologia
adoptado de jrojas710/proyectodegrado2 (antes un workflow de n8n de 33 nodos,
ver app/services/simulador/). n8n NO hace falta correrlo: estas rutas
reemplazan por completo esa orquestacion, con Postgres + Mongo como estado en
vez de que el cliente cargue el caso completo de un lado a otro.

Mapeo de las 4 acciones del contrato original a nuestras rutas REST
autenticadas:
  generar_caso -> POST   /api/consultas
  chat         -> POST   /api/consultas/<id>/mensajes
  explorar     -> POST   /api/consultas/<id>/explorar
  evaluar      -> PATCH  /api/consultas/<id>/finalizar
"""

from datetime import datetime, timezone
import os
import time
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
    ExplorarRequest,
    FinishConsultationRequest,
    FinishConsultationResponse,
    SendMessageRequest,
    SendMessageResponse,
    validate_body,
)
from app.services.simulador import agentes
from app.services.simulador.adaptativo import elegir_subtema_y_dificultad
from app.services.simulador.catalogo import PERFILES_DIFICULTAD
from app.services.simulador.rag import obtener_referencias
from app.utils import get_current_user, role_required

consultas_bp = Blueprint("consultas", __name__)

# La dificultad de UI (ENUM de Postgres, en ingles) y la del catalogo del
# simulador (en español) son conceptos equivalentes con distinto nombre.
_DIFICULTAD_UI_A_CATALOGO = {"EASY": "facil", "MEDIUM": "intermedio", "HARD": "dificil"}
_DIFICULTAD_CATALOGO_A_UI = {v: k for k, v in _DIFICULTAD_UI_A_CATALOGO.items()}


def _real_ai_expected() -> bool:
    """True si se espera IA real (Gemini configurado y AI_AGENT_PROVIDER != mock).
    En ese caso una respuesta del mock significa que ningun proveedor respondió:
    no se guarda nada y se devuelve 503 para que el cliente reintente."""
    return (
        os.getenv("AI_AGENT_PROVIDER", "gemini").lower() != "mock"
        and bool(os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("OPENROUTER_API_KEY", "").strip())
    )


def _servicio_no_disponible(que: str, detalle=None):
    body = {
        "error": "Service Unavailable",
        "message": f"Ningún proveedor de IA respondió al {que}. Reintentá en unos segundos.",
        "status_code": 503,
        "retry": True,
    }
    if detalle:
        body["detalle"] = detalle
    return jsonify(body), 503


def _consulta_o_404(consultation_id):
    try:
        cons_uuid = uuid.UUID(consultation_id)
    except ValueError:
        return None, (jsonify({"error": "Bad Request", "message": "ID de consulta inválido", "status_code": 400}), 400)
    consultation = Consultation.query.get(cons_uuid)
    if not consultation:
        return None, (jsonify({"error": "Not Found", "message": "Consulta no encontrada", "status_code": 404}), 404)
    return consultation, None


def _mongo_doc(consultation_id) -> dict:
    try:
        return get_mongo_db().consultations.find_one({"consultation_id": str(consultation_id)}) or {}
    except Exception:  # noqa: BLE001
        return {}


def _historial_para_agentes(chat_history: list) -> list:
    """Convierte nuestro chat_history persistido (sender STUDENT/PATIENT) al
    formato {role: user|assistant, content} que usan los prompts/guardrails."""
    return [
        {"role": "user" if m.get("sender") == "STUDENT" else "assistant", "content": m.get("content", "")}
        for m in (chat_history or [])
        if m.get("sender") in ("STUDENT", "PATIENT")
    ]


def _consultation_dict(consultation: Consultation) -> dict:
    """`to_dict()` oculta subtema mientras la consulta esta en curso — no se
    debe revelar el area diagnostica antes de que el estudiante cierre el
    caso (ver docs/CONTRATO_API.md del repo adoptado)."""
    data = consultation.to_dict()
    if consultation.status == "IN_PROGRESS":
        data["subtema"] = None
    return data


def _public_case_view(caso: dict) -> dict:
    """Lo unico que el cliente ve al abrir/consultar el caso: nombre del
    paciente, saludo inicial, estado emocional y el menu de exploracion
    (claves/etiquetas, sin resultados). NUNCA el diagnostico, la rubrica, los
    antecedentes ni los sintomas — esos se revelan solo conversando con el
    Agente 2, o (el diagnostico) al finalizar."""
    if not caso:
        return {}
    return {
        "id_caso": caso.get("id_caso"),
        "dificultad": _DIFICULTAD_CATALOGO_A_UI.get(caso.get("dificultad_asignada"), "MEDIUM"),
        "paciente": {"nombre": (caso.get("datos_paciente") or {}).get("nombre")},
        "estado_emocional_inicial": caso.get("estado_emocional_inicial"),
        "presentacion_inicial": caso.get("presentacion_inicial"),
        "catalogo_exploracion": agentes.catalogo_exploracion(),
    }


@consultas_bp.route("", methods=["GET"])
@jwt_required()
def listar_consultas():
    """Listar consultas clínicas del usuario autenticado."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": "Not Found", "message": "Usuario no encontrado", "status_code": 404}), 404

    query = Consultation.query

    if current_user.role == "STUDENT":
        query = query.filter_by(student_id=current_user.id)
    elif current_user.role == "TEACHER":
        teacher_course_ids = [c.id for c in Course.query.filter_by(teacher_id=current_user.id).all()]
        query = query.filter(Consultation.course_id.in_(teacher_course_ids))

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
    return jsonify([_consultation_dict(c) for c in consultations]), 200


@consultas_bp.route("", methods=["POST"])
@role_required("STUDENT")
@validate_body(CreateConsultationRequest)
def crear_consulta(validated_body: CreateConsultationRequest):
    """Iniciar una nueva consulta clínica simulada — Agente Generador de Casos:
    selección adaptativa de subtema/dificultad (por desempeño histórico del
    estudiante) + RAG (referencias_clinicas) + generación + validación +
    saneamiento contra el catálogo cerrado."""
    current_user = get_current_user()

    course_id = validated_body.course_id

    enrollment = StudentCourse.query.filter_by(student_id=current_user.id, course_id=course_id).first()
    if not enrollment:
        return jsonify({"error": "Forbidden", "message": "El estudiante no está matriculado en este curso", "status_code": 403}), 403

    # Sin difficulty explícito (UI "Automática") -> selección adaptativa decide
    # según el desempeño histórico del estudiante en el subtema elegido.
    dificultad_pedida = _DIFICULTAD_UI_A_CATALOGO.get(validated_body.difficulty) if validated_body.difficulty else None
    seleccion = elegir_subtema_y_dificultad(
        current_user.id,
        subtema_pedido=validated_body.condition,
        dificultad_pedida=dificultad_pedida,
    )
    referencias = obtener_referencias(seleccion["subtema"])
    resultado = agentes.generar_caso(seleccion["subtema"], seleccion["dificultad"], referencias)

    if resultado["is_mock"] and _real_ai_expected():
        return _servicio_no_disponible("generar el caso", resultado.get("error_details"))

    caso = resultado["caso_completo_oculto"]
    title = validated_body.title or f"Caso clínico — {PERFILES_DIFICULTAD[seleccion['dificultad']]['etiqueta']}"

    consultation = Consultation(
        student_id=current_user.id,
        course_id=course_id,
        title=title,
        specialty=validated_body.specialty or "Gastroenterología",
        difficulty=_DIFICULTAD_CATALOGO_A_UI.get(seleccion["dificultad"], "MEDIUM"),
        subtema=seleccion["subtema"],
        status="IN_PROGRESS",
    )
    db.session.add(consultation)
    db.session.commit()

    chief_complaint = caso["presentacion_inicial"]
    try:
        mongo_db = get_mongo_db()
        mongo_db.consultations.insert_one({
            "consultation_id": str(consultation.id),
            "status": "IN_PROGRESS",
            "case": caso,
            "acciones_clinicas": [],
            "chat_history": [{
                "sender": "PATIENT",
                "content": chief_complaint,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }],
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:  # noqa: BLE001
        pass

    result = _consultation_dict(consultation)
    result["case_details"] = _public_case_view(caso)
    result["is_mock"] = bool(resultado["is_mock"])
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
    consultation, error = _consulta_o_404(consultation_id)
    if error:
        return error

    if current_user.role == "STUDENT" and consultation.student_id != current_user.id:
        return jsonify({"error": "Forbidden", "message": "No tienes acceso a esta consulta", "status_code": 403}), 403

    res_data = _consultation_dict(consultation)
    doc = _mongo_doc(consultation.id)
    res_data["chat_history"] = doc.get("chat_history", [])
    res_data["case_details"] = _public_case_view(doc.get("case", {}))
    if consultation.status == "COMPLETED":
        res_data["evaluation"] = doc.get("ai_evaluation")

    return jsonify(res_data), 200


@consultas_bp.route("/<string:consultation_id>/mensajes", methods=["POST"])
@role_required("STUDENT")
@validate_body(SendMessageRequest)
def enviar_mensaje(consultation_id, validated_body: SendMessageRequest):
    """Enviar mensaje durante la consulta y recibir respuesta del paciente
    virtual — Agente Paciente, con guardrails deterministas de fuga de
    diagnóstico y ruptura de personaje."""
    current_user = get_current_user()
    consultation, error = _consulta_o_404(consultation_id)
    if error:
        return error

    if consultation.student_id != current_user.id:
        return jsonify({"error": "Forbidden", "message": "No tienes acceso a esta consulta", "status_code": 403}), 403
    if consultation.status != "IN_PROGRESS":
        return jsonify({"error": "Bad Request", "message": "La consulta no está en curso", "status_code": 400}), 400

    content = validated_body.content.strip()
    mongo_db = get_mongo_db()
    doc = _mongo_doc(consultation.id)
    caso = doc.get("case") or {}
    chat_history = doc.get("chat_history") or []

    resultado = agentes.chat(
        system_prompt_paciente=agentes.construir_system_prompt_paciente(caso),
        caso_completo_oculto=caso,
        historial=_historial_para_agentes(chat_history),
        mensaje_estudiante=content,
    )

    if resultado["is_mock"] and _real_ai_expected():
        return _servicio_no_disponible("responder", resultado.get("error_details"))

    es_exploracion = content.startswith("[Exploracion fisica:")
    user_msg = {"sender": "STUDENT", "content": content, "timestamp": datetime.now(timezone.utc).isoformat(), "es_exploracion": es_exploracion}
    patient_reply = {
        "sender": "PATIENT",
        "content": resultado["respuesta_paciente"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "es_exploracion": es_exploracion,
    }

    try:
        mongo_db.consultations.update_one(
            {"consultation_id": str(consultation.id)},
            {"$push": {"chat_history": {"$each": [user_msg, patient_reply]}}},
        )
    except Exception:  # noqa: BLE001
        pass

    return jsonify({
        "sent": user_msg,
        "reply": patient_reply,
        "estado_emocional": resultado["estado_emocional"],
        "consulta_terminada": resultado["consulta_terminada"],
        "guardrail_activado": bool(resultado["guardrails"]),
        "guardrails": resultado["guardrails"],
        "is_mock": resultado["is_mock"],
    }), 200


@consultas_bp.route("/<string:consultation_id>/explorar", methods=["POST"])
@role_required("STUDENT")
@validate_body(ExplorarRequest)
def explorar_consulta(consultation_id, validated_body: ExplorarRequest):
    """Realizar una maniobra de examen físico o pedir un paraclínico —
    herramienta determinista (no llama al modelo, responde en milisegundos).
    Si la maniobra requiere reacción del paciente, el cliente debe seguir con
    un POST a /mensajes usando `mensaje_para_paciente` como contenido."""
    current_user = get_current_user()
    consultation, error = _consulta_o_404(consultation_id)
    if error:
        return error

    if consultation.student_id != current_user.id:
        return jsonify({"error": "Forbidden", "message": "No tienes acceso a esta consulta", "status_code": 403}), 403
    if consultation.status != "IN_PROGRESS":
        return jsonify({"error": "Bad Request", "message": "La consulta no está en curso", "status_code": 400}), 400

    doc = _mongo_doc(consultation.id)
    caso = doc.get("case") or {}

    try:
        resultado = agentes.explorar(caso, validated_body.tipo, validated_body.clave)
    except agentes.ExploracionInvalida as exc:
        return jsonify({"error": "Bad Request", "message": str(exc), "status_code": 400}), 400

    try:
        get_mongo_db().consultations.update_one(
            {"consultation_id": str(consultation.id)},
            {"$push": {"acciones_clinicas": {
                "tipo": validated_body.tipo,
                "clave": validated_body.clave,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }}},
        )
    except Exception:  # noqa: BLE001
        pass

    return jsonify(resultado), 200


@consultas_bp.route("/<string:consultation_id>/finalizar", methods=["PATCH"])
@role_required("STUDENT")
@validate_body(FinishConsultationRequest)
def finalizar_consulta(consultation_id, validated_body: FinishConsultationRequest):
    """Finalizar la sesión de consulta clínica — Agente Evaluador: clasifica
    contra la rúbrica del caso, el puntaje lo calcula el backend con la
    fórmula ponderada (nunca el modelo)."""
    current_user = get_current_user()
    consultation, error = _consulta_o_404(consultation_id)
    if error:
        return error

    if consultation.student_id != current_user.id:
        return jsonify({"error": "Forbidden", "message": "No tienes acceso a esta consulta", "status_code": 403}), 403

    if consultation.status == "COMPLETED":
        return jsonify({"message": "La consulta ya había sido completada", "consultation": _consultation_dict(consultation)}), 200

    final_diagnosis = (validated_body.final_diagnosis or "").strip()
    if not final_diagnosis:
        return jsonify({"error": "Bad Request", "message": "final_diagnosis es requerido para poder evaluar la consulta", "status_code": 400}), 400

    mongo_db = get_mongo_db()
    doc = _mongo_doc(consultation.id)
    caso = doc.get("case") or {}
    chat_history = doc.get("chat_history") or []
    acciones_clinicas = doc.get("acciones_clinicas") or []

    inicio = time.perf_counter()
    resultado = agentes.evaluar(
        caso_completo_oculto=caso,
        historial=_historial_para_agentes(chat_history),
        hipotesis=final_diagnosis,
        diferenciales=validated_body.differential_diagnoses,
        plan=validated_body.treatment_plan or "",
        notas=validated_body.notes or "",
        acciones_clinicas=acciones_clinicas,
        duracion_segundos=validated_body.duration_seconds,
    )
    execution_time = time.perf_counter() - inicio

    if resultado["is_mock"] and _real_ai_expected():
        return _servicio_no_disponible("evaluar", resultado.get("error_details"))

    evaluacion = resultado["evaluacion"]

    consultation.status = "COMPLETED"
    consultation.finished_at = func.now()
    consultation.score = evaluacion["puntaje_global"]
    db.session.commit()

    ai_eval_row = AiEvaluation.query.filter_by(consultation_id=consultation.id).first()
    if ai_eval_row is None:
        ai_eval_row = AiEvaluation(consultation_id=consultation.id)
        db.session.add(ai_eval_row)
    ai_eval_row.final_score = evaluacion["puntaje_global"]
    ai_eval_row.feedback_summary = evaluacion.get("retroalimentacion_formativa")
    ai_eval_row.execution_time_seconds = round(execution_time, 2)
    db.session.commit()

    try:
        mongo_db.consultations.update_one(
            {"consultation_id": str(consultation.id)},
            {"$set": {
                "status": "COMPLETED",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "ai_evaluation": evaluacion,
                "provider_used": resultado["provider_used"],
            }},
        )
    except Exception:  # noqa: BLE001
        pass

    return jsonify({
        "message": "Consulta finalizada con éxito",
        "consultation": _consultation_dict(consultation),
        "evaluation": evaluacion,
        "is_mock": resultado["is_mock"],
    }), 200
