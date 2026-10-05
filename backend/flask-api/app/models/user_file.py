"""Archivos del usuario guardados en Cloudflare R2 (5 GB por usuario).
Creado por backend/database/migrations/2026-10-05e_archivos_r2.sql."""
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db

ESTADOS_ARCHIVO = ("PENDIENTE", "LISTO")


class UserFile(db.Model):
    __tablename__ = "user_files"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    owner_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    nombre = db.Column(db.String(255), nullable=False)
    storage_key = db.Column(db.String(500), nullable=False, unique=True)
    mime_type = db.Column(db.String(100), nullable=False)
    size_bytes = db.Column(db.BigInteger, nullable=False)
    estado = db.Column(db.String(12), nullable=False, default="PENDIENTE")
    created_at = db.Column(db.DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": str(self.id),
            "nombre": self.nombre,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            "estado": self.estado,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
