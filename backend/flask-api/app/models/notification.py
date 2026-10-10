"""Notificación dentro de la plataforma para un usuario: nueva tarea, nuevo
aviso, tarea calificada o fecha límite próxima. `read_at` NULL = no leída.
Creado por la revisión de Alembic `fase7_funcionalidades`."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db

TIPOS_NOTIFICACION = ("ASSIGNMENT_PUBLISHED", "ANNOUNCEMENT", "ASSIGNMENT_GRADED", "DUE_SOON")


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = db.Column(db.String(30), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.String(500))
    # A qué se refiere, para que la interfaz arme el enlace.
    course_id = db.Column(UUID(as_uuid=True), db.ForeignKey("courses.id", ondelete="CASCADE"))
    entity_type = db.Column(db.String(30))
    entity_id = db.Column(UUID(as_uuid=True))
    # Una fecha que la interfaz muestra en la zona horaria del usuario (p. ej.
    # el cierre de la tarea), en vez de dejarla escrita dentro del texto.
    event_at = db.Column(db.DateTime(timezone=True))
    read_at = db.Column(db.DateTime(timezone=True))
    email_sent_at = db.Column(db.DateTime(timezone=True))
    # Evita repetir la misma notificación (el recordatorio de 24 h corre cada hora).
    dedupe_key = db.Column(db.String(160), unique=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        db.Index("ix_notifications_user_created", "user_id", "created_at"),
        db.Index("ix_notifications_user_no_leidas", "user_id", postgresql_where=db.text("read_at IS NULL")),
    )

    def to_dict(self):
        def _dt(value):
            if not value:
                return None
            return (value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()

        return {
            "id": str(self.id),
            "type": self.type,
            "title": self.title,
            "body": self.body,
            "course_id": str(self.course_id) if self.course_id else None,
            "entity_type": self.entity_type,
            "entity_id": str(self.entity_id) if self.entity_id else None,
            "event_at": _dt(self.event_at),
            "read": self.read_at is not None,
            "read_at": _dt(self.read_at),
            "created_at": _dt(self.created_at),
        }
