"""La respuesta de un estudiante a una pregunta dentro de un QuizAttempt.
`selected_choice_ids` es un array nativo de Postgres (sin tabla intermedia:
alcanza para esto). Creado por
backend/database/migrations/2026-10-08d_cuestionarios_de_curso.sql."""
from sqlalchemy.dialects.postgresql import ARRAY, UUID

from app import db


class QuizAnswer(db.Model):
    __tablename__ = "quiz_answers"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    attempt_id = db.Column(UUID(as_uuid=True), db.ForeignKey("quiz_attempts.id", ondelete="CASCADE"), nullable=False)
    question_id = db.Column(UUID(as_uuid=True), db.ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False)
    selected_choice_ids = db.Column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list)
    is_correct = db.Column(db.Boolean)

    __table_args__ = (
        # Nombre que Postgres le dio al UNIQUE sin nombre de 2026-10-08d.
        db.UniqueConstraint("attempt_id", "question_id", name="quiz_answers_attempt_id_question_id_key"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "attempt_id": str(self.attempt_id),
            "question_id": str(self.question_id),
            "selected_choice_ids": [str(cid) for cid in (self.selected_choice_ids or [])],
            "is_correct": self.is_correct,
        }
