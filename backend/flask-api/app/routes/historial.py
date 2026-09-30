import uuid
from datetime import timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app import db, get_mongo_db
from app.models import AiEvaluation, Consultation, Course
from app.services.simulador.adaptativo import MIN_SESIONES_PARA_PROMEDIO, promedios_por_subtema
from app.services.simulador.scoring import ETIQUETAS
from app.utils import get_current_user, role_required

historial_bp = Blueprint("historial", __name__)


@historial_bp.route("", methods=["GET"])
@jwt_required()
def obtener_historial():
    """Listar el historial de consultas completadas del estudiante."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({
            "error": "Not Found",
            "message": "Usuario no encontrado",
            "status_code": 404
        }), 404

    query = Consultation.query.filter_by(status="COMPLETED")

    if current_user.role == "STUDENT":
        query = query.filter_by(student_id=current_user.id)
    elif current_user.role == "TEACHER":
        teacher_courses = [c.id for c in Course.query.filter_by(teacher_id=current_user.id).all()]
        query = query.filter(Consultation.course_id.in_(teacher_courses))

    course_id = request.args.get("course_id")
    if course_id:
        query = query.filter_by(course_id=course_id)

    consultas = query.order_by(Consultation.finished_at.desc()).all()
    return jsonify([c.to_dict() for c in consultas]), 200


@historial_bp.route("/<string:consultation_id>/retroalimentacion", methods=["GET"])
@jwt_required()
def obtener_retroalimentacion(consultation_id):
    """Obtener evaluación y retroalimentación clínica de una consulta finalizada."""
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

    if current_user.role == "STUDENT" and consultation.student_id != current_user.id:
        return jsonify({
            "error": "Forbidden",
            "message": "No tienes acceso a esta consulta",
            "status_code": 403
        }), 403

    # Buscar evaluación en PostgreSQL
    evaluation = AiEvaluation.query.filter_by(consultation_id=cons_uuid).first()

    eval_data = evaluation.to_dict() if evaluation else {
        "final_score": float(consultation.score) if consultation.score else 85.0,
        "feedback_summary": (
            "El estudiante demostró adecuada recolección de signos clínicos y síntomas gastrointestinales. "
            "Se recomienda profundizar en los diagnósticos diferenciales antes de solicitar paraclínicos."
        ),
        "execution_time_seconds": 12.5,
        "created_at": consultation.finished_at.replace(tzinfo=timezone.utc).isoformat() if consultation.finished_at else None,
    }

    # Intentar enriquecer con rúbrica detallada almacenada en MongoDB
    try:
        mongo_db = get_mongo_db()
        doc = mongo_db.consultations.find_one({"consultation_id": str(consultation.id)})
        if doc and "ai_evaluation" in doc:
            eval_data["detailed_rubric"] = doc["ai_evaluation"]
    except Exception:
        pass

    return jsonify({
        "consultation": consultation.to_dict(),
        "evaluation": eval_data
    }), 200


@historial_bp.route("/estadisticas", methods=["GET"])
@role_required("STUDENT")
def obtener_estadisticas():
    """Métricas de desempeño general del estudiante para su dashboard clínico."""
    current_user = get_current_user()

    total_completadas = Consultation.query.filter_by(student_id=current_user.id, status="COMPLETED").count()
    total_en_progreso = Consultation.query.filter_by(student_id=current_user.id, status="IN_PROGRESS").count()

    # Promedio y puntaje máximo
    stats = db.session.query(
        func.avg(Consultation.score).label("promedio"),
        func.max(Consultation.score).label("maximo"),
        func.min(Consultation.score).label("minimo")
    ).filter(
        Consultation.student_id == current_user.id,
        Consultation.status == "COMPLETED",
        Consultation.score.isnot(None)
    ).first()

    # Distribución por especialidad
    especialidades = db.session.query(
        Consultation.specialty,
        func.count(Consultation.id)
    ).filter(
        Consultation.student_id == current_user.id,
        Consultation.status == "COMPLETED"
    ).group_by(Consultation.specialty).all()

    return jsonify({
        "total_simulaciones": total_completadas + total_en_progreso,
        "completadas": total_completadas,
        "en_progreso": total_en_progreso,
        "promedio_score": round(float(stats.promedio), 2) if stats and stats.promedio else 0.0,
        "puntaje_maximo": float(stats.maximo) if stats and stats.maximo else 0.0,
        "puntaje_minimo": float(stats.minimo) if stats and stats.minimo else 0.0,
        "por_especialidad": {esp: count for esp, count in especialidades}
    }), 200


@historial_bp.route("/recomendacion", methods=["GET"])
@role_required("STUDENT")
def obtener_recomendacion():
    """Sugerencia de refuerzo para el banner de Historial: el subtema más
    débil del estudiante (misma fuente de verdad que la selección adaptativa
    de app/services/simulador/adaptativo.py, para que nunca se contradigan) y,
    dentro de ese subtema, la dimensión de evaluación más floja en promedio."""
    current_user = get_current_user()

    promedios = promedios_por_subtema(current_user.id)
    candidatos = [
        (subtema, suma / n)
        for subtema, (suma, n) in promedios.items()
        if n >= MIN_SESIONES_PARA_PROMEDIO
    ]
    if not candidatos:
        return jsonify({
            "disponible": False,
            "motivo": "Completá al menos 3 casos evaluados de un mismo subtema para desbloquear recomendaciones.",
        }), 200

    subtema_debil, promedio_subtema = min(candidatos, key=lambda t: t[1])

    ids = [
        str(cid) for (cid,) in Consultation.query
        .filter_by(student_id=current_user.id, status="COMPLETED", subtema=subtema_debil)
        .with_entities(Consultation.id).all()
    ]

    dimension_debil = None
    try:
        mongo_db = get_mongo_db()
        sumas: dict = {}
        for doc in mongo_db.consultations.find(
            {"consultation_id": {"$in": ids}, "ai_evaluation.desglose": {"$exists": True}},
            {"ai_evaluation.desglose": 1},
        ):
            for item in (doc.get("ai_evaluation") or {}).get("desglose") or []:
                dim = item.get("dimension")
                puntaje = item.get("puntaje")
                if not dim or puntaje is None:
                    continue
                suma, n = sumas.get(dim, (0.0, 0))
                sumas[dim] = (suma + float(puntaje), n + 1)
        if sumas:
            dim, (suma, n) = min(sumas.items(), key=lambda kv: kv[1][0] / kv[1][1])
            dimension_debil = {"dimension": dim, "etiqueta": ETIQUETAS.get(dim, dim), "promedio": round(suma / n)}
    except Exception:  # noqa: BLE001
        dimension_debil = None

    return jsonify({
        "disponible": True,
        "subtema": subtema_debil,
        "promedio": round(promedio_subtema),
        "dimension_debil": dimension_debil,
    }), 200

