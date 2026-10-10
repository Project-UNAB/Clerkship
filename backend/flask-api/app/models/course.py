from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db
from app.models.soft_delete import SoftDeleteMixin


MODOS_MATRICULA = ("OPEN", "CODE", "APPROVAL")


class Course(SoftDeleteMixin, db.Model):
    __tablename__ = "courses"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    teacher_id = db.Column(UUID(as_uuid=True), db.ForeignKey("teachers.user_id", ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    academic_period = db.Column(db.String(50))
    # Cómo entra un estudiante por su cuenta: OPEN (cualquiera), CODE (con el
    # código del curso) o APPROVAL (solicitud que aprueba el docente).
    enrollment_mode = db.Column(
        db.Enum(*MODOS_MATRICULA, name="enrollment_mode", create_type=False),
        nullable=False,
        default="CODE",
        server_default="CODE",
    )
    # NULL = código desactivado (en modo CODE nadie se matricula solo).
    enrollment_code = db.Column(db.String(16), unique=True)
    # Clave en R2 de la portada (1200x600). La miniatura está al lado, con
    # sufijo _thumb (ver app/services/portadas.py). NULL = sin portada.
    cover_image_key = db.Column(db.String(500))
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    def _urls_de_portada(self):
        """(miniatura, portada completa), o (None, None) si no hay portada o
        el almacenamiento no está disponible. La clave de R2 nunca sale."""
        if not self.cover_image_key:
            return None, None
        from app import storage
        from app.services.portadas import clave_miniatura

        try:
            return storage.url_imagen(clave_miniatura(self.cover_image_key)), storage.url_imagen(self.cover_image_key)
        except Exception:  # noqa: BLE001 — sin R2 el curso se muestra igual, sin imagen
            return None, None

    def to_dict(self):
        cover_url, cover_full_url = self._urls_de_portada()
        return {
            # Miniatura (400x200) para la card y portada completa (1200x600);
            # null si el curso no tiene portada.
            "cover_url": cover_url,
            "cover_full_url": cover_full_url,
            "id": str(self.id),
            "teacher_id": str(self.teacher_id),
            "name": self.name,
            "description": self.description,
            "academic_period": self.academic_period,
            # El código de matrícula NUNCA va acá: este dict lo ve cualquier
            # usuario autenticado. Solo sale por GET /cursos/<id>/matricula.
            "enrollment_mode": self.enrollment_mode or "CODE",
            # Con fecha: el curso está en la papelera del docente.
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }
