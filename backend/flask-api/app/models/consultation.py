from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class Consultation(db.Model):
    __tablename__ = "consultations"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    student_id = db.Column(UUID(as_uuid=True), db.ForeignKey("students.user_id", ondelete="CASCADE"), nullable=False)
    # RESTRICT a propósito: un curso con simulaciones clínicas no se puede
    # borrar definitivamente (las sesiones son historial del estudiante).
    course_id = db.Column(UUID(as_uuid=True), db.ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False)
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
    # passive_deletes="all": al borrar un curso el ORM no intenta dejar estas
    # filas sin curso (course_id es NOT NULL); decide la llave foránea de la
    # base, que es RESTRICT.
    course = db.relationship("Course", backref=db.backref("consultations", lazy=True, passive_deletes="all"))

    def to_dict(self):
        # Columnas naive pero siempre en UTC (server_default=func.now()) —
        # sin marcar tzinfo, isoformat() no lleva "+00:00" y el navegador
        # interpreta la hora como si ya fuera local (bug: una consulta hecha
        # a las 9pm en Colombia aparecía como "2:00 a.m." — 5 horas de más).
        started = self.started_at.replace(tzinfo=timezone.utc).isoformat() if self.started_at else None
        finished = self.finished_at.replace(tzinfo=timezone.utc).isoformat() if self.finished_at else None
        return {
            "id": str(self.id),
            "student_id": str(self.student_id),
            "course_id": str(self.course_id),
            "title": self.title,
            "specialty": self.specialty,
            "difficulty": self.difficulty,
            "subtema": self.subtema,
            "status": self.status,
            "started_at": started,
            "finished_at": finished,
            "score": float(self.score) if self.score is not None else None,
        }

