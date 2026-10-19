from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


# Zoom con el que se ve la biblioteca si el usuario nunca lo cambió.
ZOOM_BIBLIOTECA_PREDETERMINADO = 130


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    username = db.Column(db.String(50), unique=True, nullable=False)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.Text, nullable=False)
    role = db.Column(db.Enum("STUDENT", "TEACHER", "ADMIN", name="user_role", create_type=False), nullable=False)
    created_at = db.Column(db.DateTime, server_default=func.now())
    updated_at = db.Column(db.DateTime, server_default=func.now())

    # Verificación de correo (código de 6 dígitos por Mailgun).
    email_verified = db.Column(db.Boolean, nullable=False, server_default=db.text("false"))
    verification_code = db.Column(db.String(255))  # hash del código (werkzeug)
    verification_code_expires_at = db.Column(db.DateTime)
    verification_attempts = db.Column(db.Integer, nullable=False, server_default=db.text("0"))

    # Recuperación de contraseña: campos propios, separados de la verificación.
    reset_code = db.Column(db.String(255))  # hash del código (werkzeug)
    reset_code_expires_at = db.Column(db.DateTime)
    reset_attempts = db.Column(db.Integer, nullable=False, server_default=db.text("0"))

    # Avatar DiceBear elegido/personalizado en el registro — se guarda el SVG
    # real (texto, unos KB) para no depender de que la API siga disponible.
    avatar_svg = db.Column(db.Text)

    # Buzón real (Mailgun) — false hasta que el usuario autoriza crear su
    # dirección real {username}@clerk-ship.online (ver app/routes/mailbox.py).
    mailbox_created = db.Column(db.Boolean, nullable=False, server_default=db.text("false"))

    # Cuenta desactivada por un administrador — no puede iniciar sesión.
    activo = db.Column(db.Boolean, nullable=False, server_default=db.text("true"))

    # Corte de sesiones: los JWT emitidos antes de este momento ya no valen.
    # Se mueve al cambiar el rol o la contraseña, o al cerrar todas las
    # sesiones (ver app/services/sesiones.py). NULL = nunca se cortó.
    tokens_valid_after = db.Column(db.DateTime(timezone=True))

    # Recibir las notificaciones también por correo (las de dentro de la
    # plataforma llegan siempre). Apagado hasta que el usuario lo active.
    email_notifications = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))

    # Consentimiento informado (Ley 1581 de 2012): fecha de aceptación y versión.
    # Null si no ha aceptado. Se guarda en el servidor para persistir entre navegadores.
    consent_accepted_at = db.Column(db.DateTime(timezone=True))
    consent_version = db.Column(db.String(20))
    # Zoom de la biblioteca (porcentaje, 60 a 200). NULL = 130 % (el predeterminado). Se guarda por
    # usuario para que se mantenga en cualquier dispositivo.
    library_zoom = db.Column(db.SmallInteger)

    def to_dict(self):
        return {
            "id": str(self.id),
            "username": self.username,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "email": self.email,
            "role": self.role,
            "email_verified": self.email_verified,
            "avatar_svg": self.avatar_svg,
            "mailbox_created": self.mailbox_created,
            "activo": self.activo,
            "email_notifications": bool(self.email_notifications),
            "consent_accepted_at": self.consent_accepted_at.isoformat() if self.consent_accepted_at else None,
            "consent_version": self.consent_version,
            "biblioteca_zoom": self.library_zoom or ZOOM_BIBLIOTECA_PREDETERMINADO,
        }
