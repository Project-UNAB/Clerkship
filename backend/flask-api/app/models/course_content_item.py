"""Un elemento de material dentro de un bloque de curso: documento (en R2),
video (enlace externo a YouTube/Vimeo), enlace externo, nota de texto,
tarea (entrega de archivo calificable, con ventana de apertura/cierre) o
cuestionario (banco de preguntas con calificación automática).
Creado por backend/database/migrations/2026-10-08_contenido_de_cursos.sql,
extendido por 2026-10-08b_tareas_de_curso.sql (ASSIGNMENT) y
2026-10-08d_cuestionarios_de_curso.sql (QUIZ)."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.sql import func

from app import db

TIPOS_CONTENIDO = ("DOCUMENT", "VIDEO", "LINK", "TEXT", "ASSIGNMENT", "QUIZ")
POLITICAS_NOTA = ("BEST", "LAST", "AVERAGE", "FIRST")


class CourseContentItem(db.Model):
    __tablename__ = "course_content_items"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    block_id = db.Column(UUID(as_uuid=True), db.ForeignKey("course_blocks.id", ondelete="CASCADE"), nullable=False)
    type = db.Column(db.String(12), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    position = db.Column(db.Integer, nullable=False, default=0)
    file_id = db.Column(UUID(as_uuid=True), db.ForeignKey("user_files.id", ondelete="SET NULL"))
    video_url = db.Column(db.String(500))
    link_url = db.Column(db.String(500))
    text_content = db.Column(db.Text)
    # Solo ASSIGNMENT: ventana de entrega y calificación.
    open_at = db.Column(db.DateTime(timezone=True))
    due_at = db.Column(db.DateTime(timezone=True))
    max_score = db.Column(db.Numeric(6, 2))
    allow_late = db.Column(db.Boolean, nullable=False, default=False)
    # Solo ASSIGNMENT: hasta cuándo se aceptan tardías (NULL = sin tope) y
    # qué archivos recibe. Lista vacía / NULL = los valores por defecto del
    # servidor (ver app/services/tareas.py).
    late_until = db.Column(db.DateTime(timezone=True))
    allowed_extensions = db.Column(ARRAY(db.String(10)), nullable=False, default=list, server_default="{}")
    max_file_size_mb = db.Column(db.Integer)
    max_files = db.Column(db.Integer, nullable=False, default=1, server_default="1")
    # Solo ASSIGNMENT: rúbrica opcional, [{"id", "title", "description", "max_points"}].
    # Con rúbrica la tarea se califica criterio por criterio y max_score es la
    # suma de sus puntos. NULL / [] = nota única.
    rubric = db.Column(JSONB)
    # Solo QUIZ: duración y reintentos (open_at/due_at arriba se reutilizan
    # como ventana de disponibilidad del cuestionario).
    time_limit_minutes = db.Column(db.Integer)
    max_attempts = db.Column(db.Integer)
    # Solo QUIZ: qué nota queda cuando hay varios intentos entregados.
    grade_policy = db.Column(
        db.Enum(*POLITICAS_NOTA, name="quiz_grade_policy", create_type=False),
        nullable=False,
        default="BEST",
        server_default="BEST",
    )
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        db.Index("ix_course_content_items_due_at", "due_at"),
    )

    def to_dict(self, archivo=None):
        def _dt(value):
            if not value:
                return None
            return (value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()

        created = _dt(self.created_at)

        d = {
            "id": str(self.id),
            "block_id": str(self.block_id),
            "type": self.type,
            "title": self.title,
            "description": self.description,
            "position": self.position,
            "video_url": self.video_url,
            "link_url": self.link_url,
            "text_content": self.text_content,
            "created_at": created,
        }
        if self.type == "DOCUMENT":
            d["file"] = {
                "id": str(self.file_id) if self.file_id else None,
                "nombre": archivo.nombre if archivo else None,
                "mime_type": archivo.mime_type if archivo else None,
                "size_bytes": archivo.size_bytes if archivo else None,
            } if (self.file_id and archivo) else None
        if self.type == "ASSIGNMENT":
            d["open_at"] = _dt(self.open_at)
            d["due_at"] = _dt(self.due_at)
            d["max_score"] = float(self.max_score) if self.max_score is not None else None
            d["allow_late"] = bool(self.allow_late)
            d["late_until"] = _dt(self.late_until)
            # Tal como lo configuró el docente; las reglas ya con valores por
            # defecto y topes del servidor van aparte, en "reglas".
            d["allowed_extensions"] = list(self.allowed_extensions or [])
            d["max_file_size_mb"] = self.max_file_size_mb
            d["max_files"] = self.max_files or 1
            d["rubric"] = list(self.rubric or [])
        if self.type == "QUIZ":
            d["open_at"] = _dt(self.open_at)
            d["due_at"] = _dt(self.due_at)
            d["time_limit_minutes"] = self.time_limit_minutes
            d["max_attempts"] = self.max_attempts
            d["grade_policy"] = self.grade_policy or "BEST"
        return d
