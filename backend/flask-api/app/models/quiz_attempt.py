"""Un intento de un estudiante sobre un CourseContentItem tipo QUIZ. Creado
por backend/database/migrations/2026-10-08d_cuestionarios_de_curso.sql."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class QuizAttempt(db.Model):
    __tablename__ = "quiz_attempts"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    item_id = db.Column(UUID(as_uuid=True), db.ForeignKey("course_content_items.id", ondelete="CASCADE"), nullable=False)
    student_id = db.Column(UUID(as_uuid=True), db.ForeignKey("students.user_id", ondelete="CASCADE"), nullable=False)
    attempt_number = db.Column(db.Integer, nullable=False, default=1)
    started_at = db.Column(db.DateTime, server_default=func.now())
    submitted_at = db.Column(db.DateTime)
    score = db.Column(db.Numeric(6, 2))
    max_score = db.Column(db.Numeric(6, 2))

    def to_dict(self, student=None):
        def _dt(value):
            return value.replace(tzinfo=timezone.utc).isoformat() if value else None

        return {
            "id": str(self.id),
            "item_id": str(self.item_id),
            "student_id": str(self.student_id),
            "student_name": f"{student.first_name} {student.last_name}" if student else None,
            "attempt_number": self.attempt_number,
            "started_at": _dt(self.started_at),
            "submitted_at": _dt(self.submitted_at),
            "completed": self.submitted_at is not None,
            "score": float(self.score) if self.score is not None else None,
            "max_score": float(self.max_score) if self.max_score is not None else None,
        }
