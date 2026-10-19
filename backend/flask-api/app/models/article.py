from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db

ARTICLE_TYPES = ("LIBRO", "GUIA", "ENSAYO", "PROTOCOLO", "CASO")
ARTICLE_STATES = ("PENDIENTE", "APROBADO", "RECHAZADO")
# Idioma del documento (filtro de la biblioteca). NULL = sin indicar.
ARTICLE_LANGUAGES = ("es", "en")


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
    # Moderación de recursos: PENDIENTE | APROBADO | RECHAZADO.
    estado = db.Column(db.String(15), nullable=False, default="APROBADO", server_default="APROBADO")
    revisado_por = db.Column(UUID(as_uuid=True))
    revisado_en = db.Column(db.DateTime(timezone=True))
    motivo_rechazo = db.Column(db.String(500))
    # Clave en R2 de la portada vertical (2:3); la miniatura vive al lado con
    # sufijo _thumb. NULL = el libro se muestra con el color de su tipo.
    portada_key = db.Column(db.String(500))
    language = db.Column(db.String(2))
    created_at = db.Column(db.DateTime, server_default=func.now())
    updated_at = db.Column(db.DateTime, server_default=func.now())

    def es_autor(self, user_id) -> bool:
        """Lo creó (POST /api/articulos) o lo publicó desde su almacenamiento."""
        return user_id is not None and str(user_id) in (str(self.created_by), str(self.publicado_por))

    def visible_para(self, user_id, rol) -> bool:
        """Regla única de la moderación: lo APROBADO lo ve cualquiera con
        sesión; lo PENDIENTE o RECHAZADO, solo su autor y el ADMIN."""
        return self.estado == "APROBADO" or rol == "ADMIN" or self.es_autor(user_id)

    def detalle_de_revision_para(self, user_id, rol) -> bool:
        """El motivo del rechazo y quién revisó: solo para el autor y el ADMIN."""
        return rol == "ADMIN" or self.es_autor(user_id)

    def _urls_de_portada(self):
        """(miniatura, portada completa), o (None, None) si no hay portada o R2
        no está disponible. La clave de R2 nunca sale."""
        if not self.portada_key:
            return None, None
        from app import storage
        from app.services.portadas import clave_miniatura

        try:
            return storage.url_imagen(clave_miniatura(self.portada_key)), storage.url_imagen(self.portada_key)
        except Exception:  # noqa: BLE001 — sin R2 el libro se muestra igual, con su color
            return None, None

    def to_dict(self, tags=None, incluir_motivo=True):
        autor_id = self.created_by or self.publicado_por
        portada_url, portada_full_url = self._urls_de_portada()
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
            "idioma": self.language,
            "description": self.description,
            "url": self.url,
            "created_by": str(autor_id) if autor_id else None,
            "publicado_por": str(self.publicado_por) if self.publicado_por else None,
            "estado": self.estado,
            "motivo_rechazo": self.motivo_rechazo if incluir_motivo else None,
            # Quién revisó (un administrador) solo lo ven el autor y el administrador.
            "revisado_por": str(self.revisado_por) if self.revisado_por and incluir_motivo else None,
            "revisado_en": self.revisado_en.isoformat() if self.revisado_en else None,
            "tags": tags or [],
            # Miniatura para la tarjeta del estante y portada completa (2:3).
            "portada_url": portada_url,
            "portada_full_url": portada_full_url,
            # No se expone archivo_key (clave interna de R2) — solo si hay
            # algo para descargar, vía GET /api/almacenamiento/biblioteca/<id>/descarga.
            "tiene_pdf": bool(self.archivo_key or (self.url and self.url.endswith(".pdf"))),
            "pdf_url": (
                self.url
                if (self.url and (self.url.endswith(".pdf") or self.url.startswith("/docs/")))
                else (f"/api/almacenamiento/biblioteca/{self.id}/descarga" if self.archivo_key else None)
            ),
        }
