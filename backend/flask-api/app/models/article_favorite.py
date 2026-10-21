from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class ArticleFavorite(db.Model):
    """Recurso de la biblioteca que un usuario marcó como favorito (cualquier rol)."""

    __tablename__ = "article_favorites"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    article_id = db.Column(UUID(as_uuid=True), db.ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
