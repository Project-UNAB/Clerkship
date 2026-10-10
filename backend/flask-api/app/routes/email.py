import logging
from html import escape

import requests
from flask import Blueprint, current_app, jsonify, request

from app import limiter
from app.config import Config
from app.schemas import EmailNotificationResponse, EmailStatusResponse, SendNotificationRequest, validate_body
from app.services import limites
from app.utils import get_current_user, role_required

logger = logging.getLogger(__name__)
email_bp = Blueprint("email", __name__)


@email_bp.route("/status", methods=["GET"])
def email_status():
    """Estado de configuración del servicio de correo electrónico."""
    is_configured = bool(Config.MAILGUN_API_KEY and Config.MAILGUN_DOMAIN)
    return jsonify({
        "service": "Mailgun",
        "configured": is_configured,
        "mode": "live" if is_configured else "simulated",
        "domain": Config.MAILGUN_DOMAIN if is_configured else "none",
        "from_address": Config.MAILGUN_FROM,
    }), 200


@email_bp.route("/notificar", methods=["POST"])
@role_required("ADMIN")
@limiter.limit("20 per hour", key_func=limites.usuario_o_ip)
@validate_body(SendNotificationRequest)
def enviar_notificacion(validated_body: SendNotificationRequest):
    """Enviar un correo a un destinatario cualquiera, con asunto y texto
    libres, desde el dominio de la plataforma. Solo administradores: abierto
    a cualquier usuario sería una vía para mandar spam o suplantar a
    Clerkship. Las notificaciones a estudiantes no pasan por acá (ver
    app/services/notificaciones.py)."""
    current_user = get_current_user()

    to_email = validated_body.to
    subject = validated_body.subject.strip()
    text_content = validated_body.text.strip()

    api_key = current_app.config.get("MAILGUN_API_KEY")
    domain = current_app.config.get("MAILGUN_DOMAIN")

    if not api_key or not domain:
        # Ni el destinatario ni el contenido van al log.
        logger.warning("[MODO SIMULADO] Mailgun no configurado: no se envió el correo de prueba")
        return jsonify({
            "success": True,
            "mode": "simulated",
            "recipient": to_email,
            "message": "Correo simulado (impreso en consola del servidor)"
        }), 200

    try:
        response = requests.post(
            f"https://api.mailgun.net/v3/{domain}/messages",
            auth=("api", api_key),
            data={
                "from": current_app.config.get("MAILGUN_FROM"),
                "to": [to_email],
                "subject": subject,
                "text": text_content,
                "html": f"<p>{escape(text_content)}</p><br><small>Enviado por {escape(current_user.email)} vía Clerkship</small>",
            },
            timeout=10,
        )
        response.raise_for_status()
        return jsonify({
            "success": True,
            "recipient": to_email,
            "message": "Correo enviado con éxito"
        }), 200
    except Exception:
        # El error del proveedor trae URL y dominio de la cuenta: va al log.
        current_app.logger.error("No se pudo enviar el correo", exc_info=True)
        return jsonify({
            "success": False,
            "error": "No se pudo enviar el correo. Intenta de nuevo más tarde."
        }), 500
