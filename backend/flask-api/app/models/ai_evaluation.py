<<<<<<< HEAD
=======
from datetime import timezone

>>>>>>> main
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class AiEvaluation(db.Model):
    __tablename__ = "ai_evaluations"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    consultation_id = db.Column(UUID(as_uuid=True), db.ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False, unique=True)
    final_score = db.Column(db.Numeric(5, 2), nullable=True)
    feedback_summary = db.Column(db.Text, nullable=True)
    execution_time_seconds = db.Column(db.Numeric(10, 2), nullable=True)
    created_at = db.Column(db.DateTime, server_default=func.now())

    # Relación 1:1 con Consultation
    consultation = db.relationship("Consultation", backref=db.backref("ai_evaluation", uselist=False))

    def to_dict(self):
        return {
            "id": str(self.id),
            "consultation_id": str(self.consultation_id),
            "final_score": float(self.final_score) if self.final_score is not None else None,
            "feedback_summary": self.feedback_summary,
            "execution_time_seconds": float(self.execution_time_seconds) if self.execution_time_seconds is not None else None,
<<<<<<< HEAD
            "created_at": self.created_at.isoformat() if self.created_at else None,
=======
            # Naive pero en UTC — marcarla explicita para que el navegador la convierta bien.
            "created_at": self.created_at.replace(tzinfo=timezone.utc).isoformat() if self.created_at else None,
>>>>>>> main
        }

