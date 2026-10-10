"""
Envío de correos transaccionales por Mailgun (verificación de cuenta y
recuperación de contraseña).

Modo simulado: solo en desarrollo (FLASK_ENV=development o testing) y si
MAILGUN_API_KEY o MAILGUN_DOMAIN no están seteados, el código se escribe en
los logs en vez de enviarse. En producción, si Mailgun no está configurado,
el envío FALLA en voz alta (MailNotConfiguredError): nunca se deja un código
de recuperación en los logs de producción, porque quien tenga acceso a esos
logs podría recuperar cualquier cuenta.
"""
import json
import logging

import requests
from flask import current_app

from app.email_templates import notification_email_html, password_reset_email_html, verification_email_html

logger = logging.getLogger(__name__)

SIMULATED_ENVS = {"development", "testing"}


class MailNotConfiguredError(RuntimeError):
    pass


def _send(to_email: str, subject: str, text: str, html: str, code_for_dev_log: str, purpose: str) -> None:
    api_key = current_app.config.get("MAILGUN_API_KEY")
    domain = current_app.config.get("MAILGUN_DOMAIN")

    if not api_key or not domain:
        if current_app.config.get("FLASK_ENV") in SIMULATED_ENVS:
            logger.warning(
                "[MODO SIMULADO - solo desarrollo] Mailgun no configurado. Código de %s para %s: %s (válido 10 min)",
                purpose, to_email, code_for_dev_log,
            )
            return
        logger.error("Mailgun no está configurado; no se pudo enviar el correo de %s", purpose)
        raise MailNotConfiguredError("El servicio de correo no está configurado.")

    response = requests.post(
        f"https://api.mailgun.net/v3/{domain}/messages",
        auth=("api", api_key),
        data={
            "from": current_app.config.get("MAILGUN_FROM"),
            "to": [to_email],
            "subject": subject,
            "text": text,
            "html": html,
        },
        timeout=10,
    )
    response.raise_for_status()


def send_notification_emails(destinatarios, subject: str, text: str) -> None:
    """Un correo de notificación para cada (email, nombre) de `destinatarios`,
    en UN solo pedido a Mailgun (envío por lotes: con `recipient-variables`
    cada persona recibe su propia copia y no ve a los demás).

    Sin Mailgun configurado no falla en ningún entorno: una notificación por
    correo es un extra, no un código que el usuario esté esperando. En el log
    queda cuántos correos NO salieron, nunca su contenido ni las direcciones."""
    destinatarios = [(email, nombre) for email, nombre in destinatarios if email]
    if not destinatarios:
        return

    api_key = current_app.config.get("MAILGUN_API_KEY")
    domain = current_app.config.get("MAILGUN_DOMAIN")
    if not api_key or not domain:
        logger.warning("Mailgun no configurado: no se enviaron %d correos de notificación", len(destinatarios))
        return

    # Mailgun acepta hasta 1000 destinatarios por pedido.
    for inicio in range(0, len(destinatarios), 1000):
        lote = destinatarios[inicio:inicio + 1000]
        response = requests.post(
            f"https://api.mailgun.net/v3/{domain}/messages",
            auth=("api", api_key),
            data={
                "from": current_app.config.get("MAILGUN_FROM"),
                "to": [email for email, _nombre in lote],
                "subject": subject,
                "text": f"Hola %recipient.nombre%,\n\n{text}\n\nPuedes desactivar estos correos en Configuración → Notificaciones.",
                "html": notification_email_html(subject, text),
                "recipient-variables": json.dumps({email: {"nombre": nombre or ""} for email, nombre in lote}),
            },
            timeout=15,
        )
        response.raise_for_status()


def send_verification_email(to_email: str, first_name: str, code: str) -> None:
    _send(
        to_email,
        subject="Tu código de verificación de Clerkship",
        text=(
            f"Hola {first_name},\n\n"
            f"Tu código de verificación es: {code}\n\n"
            "Vence en 10 minutos. Si no creaste una cuenta en Clerkship, "
            "ignorá este correo."
        ),
        html=verification_email_html(first_name, code),
        code_for_dev_log=code,
        purpose="verificación",
    )


def send_password_reset_email(to_email: str, first_name: str, code: str) -> None:
    _send(
        to_email,
        subject="Recuperá tu contraseña de Clerkship",
        text=(
            f"Hola {first_name},\n\n"
            f"Tu código para cambiar la contraseña es: {code}\n\n"
            "Vence en 10 minutos. Si no pediste este cambio, ignorá este correo: "
            "tu contraseña no cambia hasta que uses el código."
        ),
        html=password_reset_email_html(first_name, code),
        code_for_dev_log=code,
        purpose="recuperación de contraseña",
    )
