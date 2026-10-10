"""Un archivo de una versión de una entrega (AssignmentSubmission). Cada vez
que el estudiante vuelve a entregar se crea una versión nueva con sus
archivos; las anteriores quedan como historial y nunca se pisan. Creado por
la revisión de Alembic `fase3_tareas`."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class SubmissionFile(db.Model):
    __tablename__ = "submission_files"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    submission_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("assignment_submissions.id", ondelete="CASCADE"), nullable=False,
    )
    version = db.Column(db.Integer, nullable=False)
    # Orden del archivo dentro de su versión (una entrega puede traer varios).
    position = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    # Clave del objeto en R2: uuid + extensión validada, nunca el nombre original.
    file_key = db.Column(db.String(500), nullable=False, unique=True)
    original_name = db.Column(db.String(255), nullable=False)
    mime_type = db.Column(db.String(150))
    size_bytes = db.Column(db.BigInteger)
    is_late = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))
    uploaded_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        db.UniqueConstraint("submission_id", "version", "position", name="uq_submission_files_version_position"),
        db.Index("ix_submission_files_submission_version", "submission_id", "version"),
    )

    # Mismos nombres que UserFile, para reutilizar el armado de la descarga firmada.
    @property
    def storage_key(self):
        return self.file_key

    @property
    def nombre(self):
        return self.original_name

    def to_dict(self):
        subido = self.uploaded_at
        if subido is not None:
            subido = (subido.astimezone(timezone.utc) if subido.tzinfo else subido.replace(tzinfo=timezone.utc)).isoformat()
        return {
            "id": str(self.id),
            "version": self.version,
            "position": self.position,
            "nombre": self.original_name,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            "is_late": bool(self.is_late),
            "uploaded_at": subido,
        }
