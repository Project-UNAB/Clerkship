"""Registro de auditoría: quién cambió qué, cuándo y desde dónde, en las
acciones que afectan notas, matrículas o la existencia de un curso. Solo se
agregan filas; ninguna ruta las edita ni las borra. Creado por la revisión de
Alembic `fase6_seguridad`."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app import db


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    # Quién lo hizo. SET NULL: borrar la cuenta no borra el rastro.
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    action = db.Column(db.String(60), nullable=False)
    entity_type = db.Column(db.String(40), nullable=False)
    entity_id = db.Column(db.String(64))
    old_value = db.Column(JSONB)
    new_value = db.Column(JSONB)
    ip = db.Column(db.String(45))
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        db.Index("ix_audit_logs_entity", "entity_type", "entity_id", "created_at"),
        db.Index("ix_audit_logs_user_created", "user_id", "created_at"),
        db.Index("ix_audit_logs_created", "created_at"),
    )

    def to_dict(self, usuario=None):
        creado = self.created_at
        if creado is not None:
            creado = (creado.astimezone(timezone.utc) if creado.tzinfo else creado.replace(tzinfo=timezone.utc)).isoformat()
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "user_name": f"{usuario.first_name} {usuario.last_name}" if usuario else None,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "ip": self.ip,
            "created_at": creado,
        }
