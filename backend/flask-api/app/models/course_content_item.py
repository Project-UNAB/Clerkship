"""Un elemento de material dentro de un bloque de curso: documento (en R2),
video (enlace externo a YouTube/Vimeo), enlace externo o nota de texto.
Creado por backend/database/migrations/2026-10-08_contenido_de_cursos.sql."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db

TIPOS_CONTENIDO = ("DOCUMENT", "VIDEO", "LINK", "TEXT")


class CourseContentItem(db.Model):
    __tablename__ = "course_content_items"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    block_id = db.Column(UUID(as_uuid=True), db.ForeignKey("course_blocks.id", ondelete="CASCADE"), nullable=False)
    type = db.Column(db.String(12), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    position = db.Column(db.Integer, nullable=False, default=0)
    file_id = db.Column(UUID(as_uuid=True), db.ForeignKey("user_files.id", ondelete="SET NULL"))
    video_url = db.Column(db.String(500))
    link_url = db.Column(db.String(500))
    text_content = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())
    updated_at = db.Column(db.DateTime, server_default=func.now())

    def to_dict(self, archivo=None):
        created = self.created_at.replace(tzinfo=timezone.utc).isoformat() if self.created_at else None
        d = {
            "id": str(self.id),
            "block_id": str(self.block_id),
            "type": self.type,
            "title": self.title,
            "description": self.description,
            "position": self.position,
            "video_url": self.video_url,
            "link_url": self.link_url,
            "text_content": self.text_content,
            "created_at": created,
        }
        if self.type == "DOCUMENT":
            d["file"] = {
                "id": str(self.file_id) if self.file_id else None,
                "nombre": archivo.nombre if archivo else None,
                "mime_type": archivo.mime_type if archivo else None,
                "size_bytes": archivo.size_bytes if archivo else None,
            } if (self.file_id and archivo) else None
        return d
