"""Entrega de un estudiante a una tarea (CourseContentItem tipo ASSIGNMENT).
Una fila por estudiante por tarea. Los archivos viven en submission_files:
cada vez que el estudiante vuelve a entregar sube `current_version` y se
guardan los archivos de esa versión; los de las anteriores quedan como
historial. Creado por backend/database/migrations/2026-10-08b_tareas_de_curso.sql,
versionado por la revisión de Alembic `fase3_tareas`."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app import db
from app.models.soft_delete import SoftDeleteMixin


class AssignmentSubmission(SoftDeleteMixin, db.Model):
    __tablename__ = "assignment_submissions"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    item_id = db.Column(UUID(as_uuid=True), db.ForeignKey("course_content_items.id", ondelete="CASCADE"), nullable=False)
    student_id = db.Column(UUID(as_uuid=True), db.ForeignKey("students.user_id", ondelete="CASCADE"), nullable=False)
    # Anterior a submission_files (un solo archivo, en user_files). Ya no se
    # escribe; se conserva la columna para no perder referencias viejas.
    file_id = db.Column(UUID(as_uuid=True), db.ForeignKey("user_files.id", ondelete="SET NULL"))
    # Versión vigente de la entrega. 0 = fila recién creada, todavía sin archivos.
    current_version = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    submitted_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    is_late = db.Column(db.Boolean, nullable=False, default=False)
    score = db.Column(db.Numeric(6, 2))
    feedback = db.Column(db.Text)
    # Nota por criterio cuando la tarea tiene rúbrica: [{"criterion_id",
    # "title", "max_points", "points", "comment"}]. Guarda título y máximo de
    # cada criterio tal como eran al calificar, por si la rúbrica cambia después.
    rubric_scores = db.Column(JSONB)
    graded_at = db.Column(db.DateTime(timezone=True))
    graded_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        # Nombre que Postgres le dio al UNIQUE sin nombre de 2026-10-08b.
        db.UniqueConstraint("item_id", "student_id", name="assignment_submissions_item_id_student_id_key"),
        db.Index("ix_assignment_submissions_item_student", "item_id", "student_id"),
    )

    def to_dict(self, archivos=None, estudiante=None):
        """`archivos`: todos los SubmissionFile de la entrega (cualquier
        versión). Se separan en los de la versión vigente y el historial."""
        def _dt(value):
            if not value:
                return None
            return (value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()

        version = self.current_version or 0
        por_version = {}
        for archivo in archivos or []:
            por_version.setdefault(archivo.version, []).append(archivo)
        for lista in por_version.values():
            lista.sort(key=lambda a: a.position or 0)
        vigentes = por_version.get(version, [])

        return {
            "id": str(self.id),
            "item_id": str(self.item_id),
            "student_id": str(self.student_id),
            "student_name": f"{estudiante.first_name} {estudiante.last_name}" if estudiante else None,
            "version": version,
            "files": [a.to_dict() for a in vigentes],
            # Versiones anteriores, de la más reciente a la más vieja.
            "history": [
                {
                    "version": v,
                    "uploaded_at": por_version[v][0].to_dict()["uploaded_at"],
                    "is_late": bool(por_version[v][0].is_late),
                    "files": [a.to_dict() for a in por_version[v]],
                }
                for v in sorted(por_version, reverse=True) if v != version
            ],
            "submitted_at": _dt(self.submitted_at),
            "is_late": bool(self.is_late),
            "score": float(self.score) if self.score is not None else None,
            "feedback": self.feedback,
            "rubric_scores": list(self.rubric_scores) if self.rubric_scores else None,
            # Con fecha: el docente la mandó a la papelera (se puede restaurar).
            "deleted_at": _dt(self.deleted_at),
            "graded_at": _dt(self.graded_at),
        }
