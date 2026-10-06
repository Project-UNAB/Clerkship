from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db

ARTICLE_TYPES = ("LIBRO", "GUIA", "ENSAYO", "PROTOCOLO", "CASO")


class Article(db.Model):
    __tablename__ = "articles"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    type = db.Column(db.Enum(*ARTICLE_TYPES, name="article_type", create_type=False), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    authors = db.Column(db.Text)
    category = db.Column(db.String(100))
    specialty = db.Column(db.String(100))
    source = db.Column(db.String(255))
    year = db.Column(db.SmallInteger)
    pages = db.Column(db.SmallInteger)
    description = db.Column(db.Text)
    url = db.Column(db.Text, nullable=False)
    created_by = db.Column(UUID(as_uuid=True), db.ForeignKey("teachers.user_id", ondelete="SET NULL"))
    # PDF publicado desde el almacenamiento del usuario (clave en R2) y quién lo publicó.
    archivo_key = db.Column(db.Text)
    publicado_por = db.Column(UUID(as_uuid=True))
    created_at = db.Column(db.DateTime, server_default=func.now())
    updated_at = db.Column(db.DateTime, server_default=func.now())

    def to_dict(self, tags=None):
        return {
            "id": str(self.id),
            "type": self.type,
            "title": self.title,
            "authors": self.authors,
            "category": self.category,
            "specialty": self.specialty,
            "source": self.source,
            "year": self.year,
            "pages": self.pages,
            "description": self.description,
            "url": self.url,
            "created_by": str(self.created_by) if self.created_by else None,
            "tags": tags or [],
            # No se expone archivo_key (clave interna de R2) — solo si hay
            # algo para descargar, vía GET /api/almacenamiento/biblioteca/<id>/descarga.
            "tiene_pdf": bool(self.archivo_key),
        }
