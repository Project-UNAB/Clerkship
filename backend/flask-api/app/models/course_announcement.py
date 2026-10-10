"""Aviso (anuncio) de un curso — el foro de noticias del docente hacia sus
estudiantes, equivalente al foro "Avisos" que trae Moodle por defecto en
todo curso. Creado por
backend/database/migrations/2026-10-08c_avisos_de_curso.sql."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class CourseAnnouncement(db.Model):
    __tablename__ = "course_announcements"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    course_id = db.Column(UUID(as_uuid=True), db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    author_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=False)
    pinned = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    def to_dict(self, author=None, comment_count=0):
        created = (
            (self.created_at.astimezone(timezone.utc) if self.created_at.tzinfo else self.created_at.replace(tzinfo=timezone.utc)).isoformat()
            if self.created_at
            else None
        )
        return {
            "id": str(self.id),
            "course_id": str(self.course_id),
            "author_id": str(self.author_id),
            "author_name": f"{author.first_name} {author.last_name}" if author else None,
            "title": self.title,
            "body": self.body,
            "pinned": bool(self.pinned),
            "comment_count": comment_count,
            "created_at": created,
        }
