"""Comentario a un aviso de curso. Texto plano (sin HTML) — el frontend lo
renderiza como texto normal, sin dangerouslySetInnerHTML, así que no hace
falta sanitizar HTML acá como en los avisos o las notas de bloque. Creado
por backend/database/migrations/2026-10-08c_avisos_de_curso.sql."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class CourseAnnouncementComment(db.Model):
    __tablename__ = "course_announcement_comments"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    announcement_id = db.Column(UUID(as_uuid=True), db.ForeignKey("course_announcements.id", ondelete="CASCADE"), nullable=False)
    author_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    def to_dict(self, author=None):
        created = (
            (self.created_at.astimezone(timezone.utc) if self.created_at.tzinfo else self.created_at.replace(tzinfo=timezone.utc)).isoformat()
            if self.created_at
            else None
        )
        return {
            "id": str(self.id),
            "announcement_id": str(self.announcement_id),
            "author_id": str(self.author_id),
            "author_name": f"{author.first_name} {author.last_name}" if author else None,
            "author_role": author.role if author else None,
            "content": self.content,
            "created_at": created,
        }
