from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from app.models import Course, User


def puede_ver_consulta(user, consultation) -> bool:
    """Regla única de acceso a una consulta clínica: el estudiante dueño, o el
    docente que dicta el curso al que pertenece la consulta."""
    if user.role == "STUDENT":
        return consultation.student_id == user.id
    if user.role == "TEACHER":
        curso = Course.query.get(consultation.course_id)
        return curso is not None and curso.teacher_id == user.id
    return False


def get_current_user():
    identity = get_jwt_identity()
    if not identity:
        return None
    try:
        user = User.query.get(identity)
        if user:
            return user
    except Exception:
        pass
    try:
        user = User.query.filter_by(email=identity).first()
        if user:
            return user
    except Exception:
        pass
    return None


def role_required(*roles):
    """Decorador: exige JWT válido Y que el rol del token esté en `roles`."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            if get_jwt().get("role") not in roles:
                return jsonify({"error": "No tienes permisos para esta acción"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
