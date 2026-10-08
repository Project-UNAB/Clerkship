"""Entrega de un estudiante a una tarea (CourseContentItem tipo ASSIGNMENT).
Una fila por estudiante por tarea — volver a entregar actualiza la misma
fila (no se guarda historial de versiones). Creado por
backend/database/migrations/2026-10-08b_tareas_de_curso.sql."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class AssignmentSubmission(db.Model):
    __tablename__ = "assignment_submissions"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    item_id = db.Column(UUID(as_uuid=True), db.ForeignKey("course_content_items.id", ondelete="CASCADE"), nullable=False)
    student_id = db.Column(UUID(as_uuid=True), db.ForeignKey("students.user_id", ondelete="CASCADE"), nullable=False)
    file_id = db.Column(UUID(as_uuid=True), db.ForeignKey("user_files.id", ondelete="SET NULL"))
    submitted_at = db.Column(db.DateTime, server_default=func.now())
    is_late = db.Column(db.Boolean, nullable=False, default=False)
    score = db.Column(db.Numeric(6, 2))
    feedback = db.Column(db.Text)
    graded_at = db.Column(db.DateTime)
    graded_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))

    def to_dict(self, archivo=None, estudiante=None):
        def _dt(value):
            return value.replace(tzinfo=timezone.utc).isoformat() if value else None

        return {
            "id": str(self.id),
            "item_id": str(self.item_id),
            "student_id": str(self.student_id),
            "student_name": f"{estudiante.first_name} {estudiante.last_name}" if estudiante else None,
            "file": {
                "id": str(self.file_id),
                "nombre": archivo.nombre if archivo else None,
                "mime_type": archivo.mime_type if archivo else None,
                "size_bytes": archivo.size_bytes if archivo else None,
            } if self.file_id else None,
            "submitted_at": _dt(self.submitted_at),
            "is_late": bool(self.is_late),
            "score": float(self.score) if self.score is not None else None,
            "feedback": self.feedback,
            "graded_at": _dt(self.graded_at),
        }
