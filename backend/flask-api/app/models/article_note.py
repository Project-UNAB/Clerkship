import uuid

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app import db


class ArticleNote(db.Model):
    """Nota o comentario de un usuario sobre una zona de una página de un libro
    de la biblioteca (un párrafo, parte del texto o un recuadro). Es privada:
    cada usuario ve solo las suyas."""

    __tablename__ = "article_notes"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    article_id = db.Column(UUID(as_uuid=True), db.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False)
    # Número de página del PDF, desde 1.
    page = db.Column(db.Integer, nullable=False)
    # Zona marcada, relativa a la página (0 a 1): {"x", "y", "w", "h"}.
    rect = db.Column(JSONB, nullable=False)
    # Texto del PDF que quedó dentro de la zona (puede faltar si es una imagen).
    quote = db.Column(db.Text)
    body = db.Column(db.Text, nullable=False, default="")
    color = db.Column(db.String(7), nullable=False, default="#FACC15")
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "id": str(self.id),
            "pagina": self.page,
            "rect": self.rect,
            "cita": self.quote,
            "texto": self.body,
            "color": self.color,
            "creada_en": self.created_at.isoformat() if self.created_at else None,
            "editada_en": self.updated_at.isoformat() if self.updated_at else None,
        }
