from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class Consultation(db.Model):
    __tablename__ = "consultations"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    student_id = db.Column(UUID(as_uuid=True), db.ForeignKey("students.user_id", ondelete="CASCADE"), nullable=False)
    course_id = db.Column(UUID(as_uuid=True), db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    specialty = db.Column(db.String(100), nullable=False)
    difficulty = db.Column(db.String(20), nullable=False)  # EASY, MEDIUM, HARD
    subtema = db.Column(db.String(150), nullable=True)  # ej. "Colelitiasis / colecistitis aguda" — ver services/simulador/adaptativo.py
    status = db.Column(db.String(20), nullable=False, default="IN_PROGRESS")  # IN_PROGRESS, COMPLETED, ABANDONED
    started_at = db.Column(db.DateTime, server_default=func.now())
    finished_at = db.Column(db.DateTime, nullable=True)
    score = db.Column(db.Numeric(5, 2), nullable=True)

    # Relaciones
    student = db.relationship("Student", backref=db.backref("consultations", lazy=True))
    course = db.relationship("Course", backref=db.backref("consultations", lazy=True))

    def to_dict(self):
        return {
            "id": str(self.id),
            "student_id": str(self.student_id),
            "course_id": str(self.course_id),
            "title": self.title,
            "specialty": self.specialty,
            "difficulty": self.difficulty,
            "subtema": self.subtema,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "score": float(self.score) if self.score is not None else None,
        }

