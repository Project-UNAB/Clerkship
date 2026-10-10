"""
Notificaciones del usuario dentro de la plataforma (nueva tarea, nuevo aviso,
tarea calificada, fecha límite próxima): listarlas, marcarlas como leídas y
elegir si además llegan por correo. Cada quien ve y toca solo las suyas.
"""
import hmac
import uuid
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models import Notification
from app.schemas import PreferenciasNotificacionRequest, validate_body
from app.services import notificaciones, paginacion
from app.utils import get_current_user

notificaciones_bp = Blueprint("notificaciones", __name__)


def _no_leidas(user_id) -> int:
    return Notification.query.filter(Notification.user_id == user_id, Notification.read_at.is_(None)).count()


@notificaciones_bp.get("")
@jwt_required()
def listar():
    """Notificaciones del usuario, de la más reciente a la más vieja.
    ?solo_no_leidas=1 deja solo las pendientes. Trae además `no_leidas`."""
    user = get_current_user()
    query = Notification.query.filter(Notification.user_id == user.id)
    if (request.args.get("solo_no_leidas") or "").lower() in ("1", "true", "si", "sí"):
        query = query.filter(Notification.read_at.is_(None))

    page, per_page = paginacion.parametros()
    filas, total = paginacion.paginar(query.order_by(Notification.created_at.desc(), Notification.id.asc()), page, per_page)
    return jsonify({
        "notificaciones": [n.to_dict() for n in filas],
        "no_leidas": _no_leidas(user.id),
        **paginacion.meta(total, page, per_page),
    }), 200


@notificaciones_bp.get("/no-leidas")
@jwt_required()
def contar_no_leidas():
    """Solo el número, para el globo de la campana (se consulta cada tanto)."""
    return jsonify({"no_leidas": _no_leidas(get_current_user().id)}), 200


@notificaciones_bp.post("/<notification_id>/leer")
@jwt_required()
def marcar_leida(notification_id):
    user = get_current_user()
    try:
        ident = uuid.UUID(notification_id)
    except ValueError:
        ident = None
    # Se busca por id Y dueño: la notificación de otro usuario no existe para este.
    notificacion = Notification.query.filter_by(id=ident, user_id=user.id).first() if ident else None
    if notificacion is None:
        return jsonify({"error": "Not Found", "message": "Notificación no encontrada", "status_code": 404}), 404

    if notificacion.read_at is None:
        notificacion.read_at = datetime.now(timezone.utc)
        db.session.commit()
    return jsonify(notificacion.to_dict()), 200


@notificaciones_bp.post("/leer-todas")
@jwt_required()
def marcar_todas_leidas():
    user = get_current_user()
    marcadas = Notification.query.filter(Notification.user_id == user.id, Notification.read_at.is_(None)).update(
        {"read_at": datetime.now(timezone.utc)}, synchronize_session=False,
    )
    db.session.commit()
    return jsonify({"marcadas": int(marcadas or 0), "no_leidas": 0}), 200


@notificaciones_bp.get("/preferencias")
@jwt_required()
def obtener_preferencias():
    return jsonify({"email": bool(get_current_user().email_notifications)}), 200


@notificaciones_bp.patch("/preferencias")
@jwt_required()
@validate_body(PreferenciasNotificacionRequest)
def actualizar_preferencias(validated_body: PreferenciasNotificacionRequest):
    """Activa o desactiva recibir las notificaciones también por correo. Las
    de dentro de la plataforma llegan siempre."""
    user = get_current_user()
    user.email_notifications = validated_body.email
    db.session.commit()
    return jsonify({"email": bool(user.email_notifications)}), 200


@notificaciones_bp.post("/recordatorios")
def disparar_recordatorios():
    """Dispara el recordatorio de "cierra en 24 h" (para un programador de
    tareas externo, p. ej. Cloud Scheduler cada hora). No usa sesión de
    usuario: pide la cabecera X-Cron-Secret igual a CRON_SECRET. Si CRON_SECRET
    no está configurado, esta ruta no existe (404)."""
    secreto = current_app.config.get("CRON_SECRET") or ""
    recibido = request.headers.get("X-Cron-Secret") or ""
    if not secreto or not hmac.compare_digest(secreto.encode(), recibido.encode()):
        return jsonify({"error": "Not Found", "message": "El recurso solicitado no fue encontrado.", "status_code": 404}), 404
    return jsonify(notificaciones.recordar_vencimientos()), 200
