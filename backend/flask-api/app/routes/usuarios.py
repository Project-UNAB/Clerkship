import uuid
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db, get_mongo_db
from app.models import User
from app.schemas import StorageUsageResponse, UpdateUserRequest, UserResponse, UserSummary, validate_body
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

    used_bytes = 0
    try:
        mongo = get_mongo_db()
        uid = str(user.id)
        documentos_bytes = next(
            mongo.documents.aggregate([
                {"$match": {"owner_user_id": uid}},
                {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$size_bytes", 0]}}}},
            ]),
            {},
        ).get("total", 0)
        used_bytes = int(documentos_bytes)
    except Exception:
        # Fallback si Mongo opera en modo desconectado
        used_bytes = 1048576  # 1 MB mock

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

    db.session.commit()
    return jsonify(user.to_dict()), 200
