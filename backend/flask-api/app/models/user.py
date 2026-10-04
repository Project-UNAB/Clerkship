from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    username = db.Column(db.String(50), unique=True, nullable=False)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.Text, nullable=False)
    role = db.Column(db.Enum("STUDENT", "TEACHER", name="user_role", create_type=False), nullable=False)
    created_at = db.Column(db.DateTime, server_default=func.now())
    updated_at = db.Column(db.DateTime, server_default=func.now())

    # Verificación de correo (código de 6 dígitos por Mailgun).
    email_verified = db.Column(db.Boolean, nullable=False, server_default=db.text("false"))
<<<<<<< HEAD
    verification_code = db.Column(db.String(6))
    verification_code_expires_at = db.Column(db.DateTime)
    verification_attempts = db.Column(db.Integer, nullable=False, server_default=db.text("0"))

=======
    verification_code = db.Column(db.String(255))  # hash del código (werkzeug)
    verification_code_expires_at = db.Column(db.DateTime)
    verification_attempts = db.Column(db.Integer, nullable=False, server_default=db.text("0"))

    # Recuperación de contraseña: campos propios, separados de la verificación.
    reset_code = db.Column(db.String(255))  # hash del código (werkzeug)
    reset_code_expires_at = db.Column(db.DateTime)
    reset_attempts = db.Column(db.Integer, nullable=False, server_default=db.text("0"))

>>>>>>> main
    # Avatar DiceBear elegido/personalizado en el registro — se guarda el SVG
    # real (texto, unos KB) para no depender de que la API siga disponible.
    avatar_svg = db.Column(db.Text)

    # Buzón real (Mailgun) — false hasta que el usuario autoriza crear su
    # dirección real {username}@clerk-ship.online (ver app/routes/mailbox.py).
    mailbox_created = db.Column(db.Boolean, nullable=False, server_default=db.text("false"))

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
        }
