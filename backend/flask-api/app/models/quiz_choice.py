"""Una opción de respuesta de una QuizQuestion. `is_correct` solo se expone
al docente dueño, o al estudiante después de haber entregado su intento —
nunca mientras está respondiendo (ver app/routes/curso_quiz.py). Creado por
backend/database/migrations/2026-10-08d_cuestionarios_de_curso.sql."""
from sqlalchemy.dialects.postgresql import UUID

from app import db


class QuizChoice(db.Model):
    __tablename__ = "quiz_choices"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    question_id = db.Column(UUID(as_uuid=True), db.ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False)
    text = db.Column(db.String(500), nullable=False)
    is_correct = db.Column(db.Boolean, nullable=False, default=False)
    position = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self, incluir_respuesta_correcta=False):
        d = {
            "id": str(self.id),
            "question_id": str(self.question_id),
            "text": self.text,
            "position": self.position,
        }
        if incluir_respuesta_correcta:
            d["is_correct"] = bool(self.is_correct)
        return d
