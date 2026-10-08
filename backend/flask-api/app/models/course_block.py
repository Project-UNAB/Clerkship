"""Bloques de material dentro de un curso — funcionan como carpetas que el
docente organiza por tema (ej. "Semana 1", "Dolor abdominal"). Creado por
backend/database/migrations/2026-10-08_contenido_de_cursos.sql."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class CourseBlock(db.Model):
    __tablename__ = "course_blocks"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    course_id = db.Column(UUID(as_uuid=True), db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    position = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, server_default=func.now())
    updated_at = db.Column(db.DateTime, server_default=func.now())

    def to_dict(self):
        created = self.created_at.replace(tzinfo=timezone.utc).isoformat() if self.created_at else None
        return {
            "id": str(self.id),
            "course_id": str(self.course_id),
            "title": self.title,
            "description": self.description,
            "position": self.position,
            "created_at": created,
        }
