"""Una pregunta dentro de un CourseContentItem tipo QUIZ. Creado por
backend/database/migrations/2026-10-08d_cuestionarios_de_curso.sql."""
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db

TIPOS_PREGUNTA = ("SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE")


class QuizQuestion(db.Model):
    __tablename__ = "quiz_questions"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    item_id = db.Column(UUID(as_uuid=True), db.ForeignKey("course_content_items.id", ondelete="CASCADE"), nullable=False)
    type = db.Column(db.String(16), nullable=False)
    prompt = db.Column(db.Text, nullable=False)
    points = db.Column(db.Numeric(6, 2), nullable=False, default=1)
    position = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, server_default=func.now())

    def to_dict(self, choices=None, incluir_respuesta_correcta=False):
        d = {
            "id": str(self.id),
            "item_id": str(self.item_id),
            "type": self.type,
            "prompt": self.prompt,
            "points": float(self.points) if self.points is not None else 1.0,
            "position": self.position,
        }
        if choices is not None:
            d["choices"] = [c.to_dict(incluir_respuesta_correcta) for c in choices]
        return d
