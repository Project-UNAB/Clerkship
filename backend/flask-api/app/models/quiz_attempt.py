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
    started_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    submitted_at = db.Column(db.DateTime(timezone=True))
    score = db.Column(db.Numeric(6, 2))
    max_score = db.Column(db.Numeric(6, 2))
    # Hasta cuándo se puede responder: se fija al iniciar (tiempo límite y/o
    # cierre del cuestionario) para que no cambie si el docente edita el quiz
    # con el intento en curso. NULL = sin límite.
    deadline_at = db.Column(db.DateTime(timezone=True))
    # True si se cerró por tiempo y no por un envío a tiempo del estudiante.
    expired = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))

    __table_args__ = (
        db.UniqueConstraint("item_id", "student_id", "attempt_number", name="uq_quiz_attempts_item_student_number"),
        # Un solo intento abierto por estudiante por cuestionario.
        db.Index(
            "uq_quiz_attempts_un_abierto",
            "item_id",
            "student_id",
            unique=True,
            postgresql_where=db.text("submitted_at IS NULL"),
        ),
    )

    def to_dict(self, student=None):
        def _dt(value):
            if not value:
                return None
            return (value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()

        return {
            "id": str(self.id),
            "item_id": str(self.item_id),
            "student_id": str(self.student_id),
            "student_name": f"{student.first_name} {student.last_name}" if student else None,
            "attempt_number": self.attempt_number,
            "started_at": _dt(self.started_at),
            "submitted_at": _dt(self.submitted_at),
            "deadline_at": _dt(self.deadline_at),
            "completed": self.submitted_at is not None,
            "expired": bool(self.expired),
            "score": float(self.score) if self.score is not None else None,
            "max_score": float(self.max_score) if self.max_score is not None else None,
        }
