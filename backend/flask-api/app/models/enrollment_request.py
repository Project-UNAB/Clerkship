"""Solicitud de matrícula a un curso en modo APPROVAL: el estudiante la crea
y el docente dueño la aprueba o la rechaza. Una fila por estudiante por curso
(volver a solicitar después de un rechazo reutiliza la misma fila)."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db

ESTADOS_SOLICITUD = ("PENDING", "APPROVED", "REJECTED")


class EnrollmentRequest(db.Model):
    __tablename__ = "enrollment_requests"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    course_id = db.Column(UUID(as_uuid=True), db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    student_id = db.Column(UUID(as_uuid=True), db.ForeignKey("students.user_id", ondelete="CASCADE"), nullable=False)
    status = db.Column(
        db.Enum(*ESTADOS_SOLICITUD, name="enrollment_request_status", create_type=False),
        nullable=False,
        default="PENDING",
        server_default="PENDING",
    )
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    resolved_at = db.Column(db.DateTime(timezone=True))
    resolved_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        db.UniqueConstraint("course_id", "student_id", name="uq_enrollment_requests_course_student"),
        db.Index("ix_enrollment_requests_course_status", "course_id", "status"),
        db.Index("ix_enrollment_requests_student_id", "student_id"),
    )

    def to_dict(self, estudiante=None, curso=None):
        def _dt(value):
            if not value:
                return None
            return (value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()

        d = {
            "id": str(self.id),
            "course_id": str(self.course_id),
            "student_id": str(self.student_id),
            "status": self.status,
            "created_at": _dt(self.created_at),
            "resolved_at": _dt(self.resolved_at),
        }
        if estudiante is not None:
            d["student_name"] = f"{estudiante.first_name} {estudiante.last_name}"
            d["student_email"] = estudiante.email
        if curso is not None:
            d["course_name"] = curso.name
        return d
