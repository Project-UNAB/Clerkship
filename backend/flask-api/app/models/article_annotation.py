from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app import db


class ArticleAnnotation(db.Model):
    """Lo que un usuario dibujó o subrayó en una página de un libro de la
    biblioteca. Es privado: cada usuario ve solo lo suyo. Una fila por página
    con trazos; una página sin trazos no tiene fila."""

    __tablename__ = "article_annotations"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    article_id = db.Column(UUID(as_uuid=True), db.ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True)
    # Número de página del PDF, desde 1.
    page = db.Column(db.Integer, primary_key=True)
    # Lista de trazos con coordenadas relativas a la página (0 a 1), para que
    # se vean igual a cualquier tamaño y zoom (ver app/schemas/anotaciones.py).
    strokes = db.Column(JSONB, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
