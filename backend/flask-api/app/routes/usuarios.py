from datetime import datetime, timezone
import uuid
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from sqlalchemy import func as sa_func

from app import db, get_mongo_db, limiter
from app.models import (
    AssignmentSubmission, Consultation, Course, CourseContentItem, Student, StudentCourse, Teacher, User, UserFile,
)
from app.services import limites
from app.schemas import (
    RegistrarConsentimientoRequest,
    StorageUsageResponse,
    UpdateUserRequest,
    UserResponse,
    UserSummary,
    validate_body,
)
from app.utils import get_current_user

usuarios_bp = Blueprint("usuarios", __name__)

STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024  # 5 GB


@usuarios_bp.get("/uso-almacenamiento")
@jwt_required()
def uso_almacenamiento():
    user = get_current_user()
    if not user:
        return jsonify({
            "error": "Not Found",
            "message": "Usuario no encontrado",
            "status_code": 404,
        }), 404

    # Lo que ya se subió a Cloudflare R2 (la Carpeta de Documentos usa R2
    # para todo lo nuevo, ver app/routes/documentos.py).
    r2_bytes = int(
        db.session.query(sa_func.coalesce(sa_func.sum(UserFile.size_bytes), 0))
        .filter(UserFile.owner_id == user.id, UserFile.estado == "LISTO")
        .scalar() or 0
    )

    # Lo que todavía quede de antes en Mongo (documentos sin migrar).
    mongo_bytes = 0
    try:
        mongo = get_mongo_db()
        mongo_bytes = int(
            next(
                mongo.documents.aggregate([
                    {"$match": {"owner_user_id": str(user.id)}},
                    {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$size_bytes", 0]}}}},
                ]),
                {},
            ).get("total", 0)
        )
    except Exception:
        mongo_bytes = 0

    used_bytes = r2_bytes + mongo_bytes

    return jsonify({
        "used_bytes": used_bytes,
        "limit_bytes": STORAGE_LIMIT_BYTES,
        "breakdown": {
            "documentos": used_bytes,
        },
    }), 200


@usuarios_bp.get("/buscar")
@jwt_required()
def buscar():
    q = (request.args.get("q") or "").strip().lstrip("@")
    if not q:
        return jsonify({
            "error": "Bad Request",
            "message": "El parámetro de búsqueda 'q' es requerido",
            "status_code": 400
        }), 400

    users = User.query.filter(User.username.ilike(f"{q}%")).limit(20).all()
    user_list = [
        {
            "id": str(u.id),
            "username": u.username,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "role": u.role,
        }
        for u in users
    ]
    return jsonify(user_list), 200


@usuarios_bp.get("/<user_id>")
@jwt_required()
def obtener(user_id):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return jsonify({"error": "Bad Request", "message": "ID de usuario inválido", "status_code": 400}), 400

    user = User.query.get(uid)
    if user is None:
        return jsonify({
            "error": "Not Found",
            "message": "Usuario no encontrado",
            "status_code": 404
        }), 404

    # Correo, verificación y buzón son datos privados: solo para el propio usuario.
    if str(user.id) == get_jwt_identity():
        return jsonify(user.to_dict()), 200
    return jsonify({
        "id": str(user.id),
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "avatar_svg": user.avatar_svg,
    }), 200


@usuarios_bp.patch("/me")
@jwt_required()
@validate_body(UpdateUserRequest)
def actualizar_me(validated_body: UpdateUserRequest):
    user = get_current_user()
    if not user:
        return jsonify({
            "error": "Not Found",
            "message": "Usuario no encontrado",
            "status_code": 404,
        }), 404

    if validated_body.first_name and validated_body.first_name.strip():
        user.first_name = validated_body.first_name.strip()
    if validated_body.last_name and validated_body.last_name.strip():
        user.last_name = validated_body.last_name.strip()
    if validated_body.biblioteca_zoom is not None:
        user.library_zoom = validated_body.biblioteca_zoom

    if validated_body.semestre is not None or validated_body.departamento is not None:
        estudiante, docente = _ficha_de(user)
        if validated_body.semestre is not None:
            if estudiante is None:
                return jsonify({"error": "Bad Request", "message": "Solo un estudiante tiene semestre.", "status_code": 400}), 400
            estudiante.semester = validated_body.semestre
        if validated_body.departamento is not None:
            if docente is None:
                return jsonify({"error": "Bad Request", "message": "Solo un docente tiene departamento.", "status_code": 400}), 400
            docente.department = validated_body.departamento.strip() or None

    db.session.commit()
    return jsonify(_perfil_de(user)), 200


def _ficha_de(user):
    """Ficha de estudiante o de docente del usuario (la que no aplica, None)."""
    estudiante = db.session.get(Student, user.id) if user.role == "STUDENT" else None
    docente = db.session.get(Teacher, user.id) if user.role == "TEACHER" else None
    return estudiante, docente


def _perfil_de(user):
    """Datos de la cuenta más los de su ficha académica y la fecha de alta."""
    estudiante, docente = _ficha_de(user)
    datos = user.to_dict()
    datos["created_at"] = user.created_at.isoformat() if user.created_at else None
    datos["estudiante"] = {"codigo": estudiante.student_code, "semestre": estudiante.semester} if estudiante else None
    datos["docente"] = {"departamento": docente.department} if docente else None
    return datos


@usuarios_bp.get("/me/perfil")
@jwt_required()
def mi_perfil():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not Found", "message": "Usuario no encontrado", "status_code": 404}), 404
    return jsonify(_perfil_de(user)), 200


def _iso(valor):
    return valor.isoformat() if valor else None


@usuarios_bp.get("/me/exportar")
@jwt_required()
@limiter.limit("10 per hour", key_func=limites.usuario_o_ip)
def exportar_mis_datos():
    """Copia de los datos personales del usuario (derecho de acceso, Ley 1581 de 2012).
    No incluye contraseñas, códigos de verificación ni archivos."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not Found", "message": "Usuario no encontrado", "status_code": 404}), 404

    perfil = _perfil_de(user)
    perfil.pop("avatar_svg", None)
    datos = {
        "generado_en": datetime.now(timezone.utc).isoformat(),
        "plataforma": "Clerkship",
        "perfil": perfil,
        "cursos": [],
        "simulaciones": [],
        "entregas": [],
    }

    if user.role == "STUDENT":
        cursos = (
            db.session.query(Course, StudentCourse.enrolled_at)
            .join(StudentCourse, StudentCourse.course_id == Course.id)
            .filter(StudentCourse.student_id == user.id)
            .order_by(StudentCourse.enrolled_at)
            .all()
        )
        datos["cursos"] = [
            {"nombre": c.name, "periodo": c.academic_period, "matriculado_en": _iso(fecha)} for c, fecha in cursos
        ]
        consultas = Consultation.query.filter_by(student_id=user.id).order_by(Consultation.started_at).all()
        datos["simulaciones"] = [
            {
                "titulo": c.title,
                "subtema": c.subtema,
                "dificultad": c.difficulty,
                "estado": c.status,
                "puntaje": float(c.score) if c.score is not None else None,
                "inicio": _iso(c.started_at),
                "fin": _iso(c.finished_at),
            }
            for c in consultas
        ]
        entregas = (
            db.session.query(AssignmentSubmission, CourseContentItem.title)
            .join(CourseContentItem, CourseContentItem.id == AssignmentSubmission.item_id)
            .filter(AssignmentSubmission.student_id == user.id)
            .order_by(AssignmentSubmission.submitted_at)
            .all()
        )
        datos["entregas"] = [
            {
                "tarea": titulo,
                "entregada_en": _iso(e.submitted_at),
                "tardia": bool(e.is_late),
                "version": e.current_version,
                "puntaje": float(e.score) if e.score is not None else None,
                "retroalimentacion": e.feedback,
            }
            for e, titulo in entregas
        ]
    elif user.role == "TEACHER":
        cursos = Course.query.filter_by(teacher_id=user.id).order_by(Course.name).all()
        datos["cursos"] = [{"nombre": c.name, "periodo": c.academic_period, "rol": "Docente"} for c in cursos]

    respuesta = jsonify(datos)
    respuesta.headers["Content-Disposition"] = 'attachment; filename="mis-datos-clerkship.json"'
    return respuesta, 200


@usuarios_bp.post("/consentimiento")
@jwt_required()
@validate_body(RegistrarConsentimientoRequest)
def registrar_consentimiento(validated_body: RegistrarConsentimientoRequest):
    user = get_current_user()
    if not user:
        return jsonify({
            "error": "Not Found",
            "message": "Usuario no encontrado",
            "status_code": 404,
        }), 404

    # Idempotente: si ya había aceptado exactamente esta versión, no movemos la fecha
    if user.consent_version != validated_body.version or user.consent_accepted_at is None:
        user.consent_accepted_at = datetime.now(timezone.utc)
        user.consent_version = validated_body.version
        db.session.commit()

    return jsonify(user.to_dict()), 200
