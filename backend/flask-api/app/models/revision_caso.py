"""Revisión de un caso clínico simulado por un profesional de la salud.

El administrador asigna consultas COMPLETADAS a expertos invitados
(ValidacionInvitacion). El experto ve el caso anonimizado, la conversación y la
evaluación automática, califica cada criterio de 1 a 4 y da su propio puntaje
(0 a 100) para medir la concordancia con el evaluador automático.
Creada por 2026-10-26_revision_casos.sql."""
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app import db

ESTADOS_REVISION = ("PENDIENTE", "EN_CURSO", "ENVIADA")


class RevisionCaso(db.Model):
    __tablename__ = "validacion_revisiones_caso"
    __table_args__ = (db.UniqueConstraint("invitacion_id", "consultation_id", name="uq_revision_caso_experto"),)

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    invitacion_id = db.Column(UUID(as_uuid=True), db.ForeignKey("validacion_invitaciones.id", ondelete="CASCADE"), nullable=False)
    consultation_id = db.Column(UUID(as_uuid=True), db.ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False)
    respuestas = db.Column(JSONB, nullable=False, server_default="{}")     # {criterio: 1..4}
    observaciones = db.Column(JSONB, nullable=False, server_default="{}")  # {criterio | "_general": texto}
    puntaje_experto = db.Column(db.SmallInteger)                           # 0 a 100
    estado = db.Column(db.String(20), nullable=False, server_default="PENDIENTE")
    enviada_at = db.Column(db.DateTime(timezone=True))
    asignada_por = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "invitacion_id": str(self.invitacion_id),
            "consultation_id": str(self.consultation_id),
            "respuestas": self.respuestas or {},
            "observaciones": self.observaciones or {},
            "puntaje_experto": self.puntaje_experto,
            "estado": self.estado,
            "enviada_at": self.enviada_at.isoformat() if self.enviada_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
