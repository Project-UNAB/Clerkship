"""Un objeto de R2 que hay que borrar y todavía no se pudo confirmar.

Las claves se anotan acá DENTRO de la misma transacción que borra las filas
que las referenciaban; el borrado en R2 se intenta después del commit. Si R2
falla, la fila queda con el error y se reintenta (`flask limpiar-archivos`):
así ningún archivo queda huérfano para siempre por un fallo momentáneo.
Creado por la revisión de Alembic `fase5_rendimiento`."""
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class PendingFileDeletion(db.Model):
    __tablename__ = "pending_file_deletions"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    storage_key = db.Column(db.String(500), nullable=False, unique=True)
    # De dónde salió, para poder auditar: "curso:<id>", "tarea:<id>", "portada"...
    reason = db.Column(db.String(120))
    attempts = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    last_error = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    last_attempt_at = db.Column(db.DateTime(timezone=True))
