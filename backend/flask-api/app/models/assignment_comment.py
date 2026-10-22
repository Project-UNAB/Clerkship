"""Comentarios privados de una tarea entre el docente y un estudiante.

Cada (tarea, estudiante) es un hilo: lo ven solo ese estudiante y el docente
dueño del curso. No depende de que haya entrega, así el estudiante puede
preguntar antes de entregar. Creado por 2026-10-28_comentarios_tareas.sql."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class AssignmentComment(db.Model):
    __tablename__ = "assignment_comments"
    __table_args__ = (db.Index("ix_assignment_comments_hilo", "item_id", "student_id", "created_at"),)

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    item_id = db.Column(UUID(as_uuid=True), db.ForeignKey("course_content_items.id", ondelete="CASCADE"), nullable=False)
    # Dueño del hilo: el estudiante de la conversación (aunque escriba el docente).
    student_id = db.Column(UUID(as_uuid=True), db.ForeignKey("students.user_id", ondelete="CASCADE"), nullable=False)
    author_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    def to_dict(self, autor=None, yo=None) -> dict:
        creado = self.created_at
        if creado is not None and creado.tzinfo is None:
            creado = creado.replace(tzinfo=timezone.utc)
        nombre = f"{autor.first_name} {autor.last_name}".strip() if autor else None
        return {
            "id": str(self.id),
            "student_id": str(self.student_id),
            "author_id": str(self.author_id),
            "author_name": nombre or (autor.username if autor else "Usuario"),
            "author_role": autor.role if autor else None,
            "author_avatar": getattr(autor, "avatar_svg", None) if autor else None,
            "body": self.body,
            "created_at": creado.isoformat() if creado else None,
            "es_mio": yo is not None and str(self.author_id) == str(yo),
        }
