"""Informe de una consulta compartido con otros usuarios y las notas que se
dejan sobre él. Creado por alembic/versions/20261113_informes_y_casos.py."""
from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


def _iso(valor):
    if not valor:
        return None
    return (valor.astimezone(timezone.utc) if valor.tzinfo else valor.replace(tzinfo=timezone.utc)).isoformat()


class ConsultationShare(db.Model):
    """Un usuario que puede ver el informe: porque el dueño se lo compartió
    (DIRECTO) o porque abrió el enlace de la consulta (ENLACE)."""
    __tablename__ = "consultation_shares"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    consultation_id = db.Column(UUID(as_uuid=True), db.ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    shared_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    via = db.Column(db.String(10), nullable=False, default="DIRECTO")
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    __table_args__ = (db.UniqueConstraint("consultation_id", "user_id", name="uq_consultation_shares"),)


class ConsultationComment(db.Model):
    """Nota sobre el informe. `section` dice a qué parte se refiere
    (general, anamnesis, diagnostico, evaluacion, conversacion...)."""
    __tablename__ = "consultation_comments"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    consultation_id = db.Column(UUID(as_uuid=True), db.ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False)
    author_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    section = db.Column(db.String(40), nullable=False, default="general")
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    def to_dict(self, autor=None):
        return {
            "id": str(self.id),
            "consultation_id": str(self.consultation_id),
            "author_id": str(self.author_id),
            "autor": None if autor is None else {
                "nombre": f"{autor.first_name} {autor.last_name}".strip(),
                "role": autor.role,
            },
            "section": self.section,
            "body": self.body,
            "created_at": _iso(self.created_at),
        }
