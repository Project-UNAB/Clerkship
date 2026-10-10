"""Lista de revocación de JWT: un token (por su jti) que ya no vale aunque
no haya vencido — el del logout. Las revocaciones "de todas las sesiones de
un usuario" (cambio de rol, de contraseña, desactivación) no pasan por acá:
usan users.tokens_valid_after. Creado por la revisión de Alembic
`fase6_seguridad`."""
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class RevokedToken(db.Model):
    __tablename__ = "revoked_tokens"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    jti = db.Column(db.String(64), nullable=False, unique=True)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"))
    token_type = db.Column(db.String(10), nullable=False)  # access | refresh
    reason = db.Column(db.String(40))
    # Cuándo vencía el token: pasada esa fecha la fila ya no hace falta.
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        db.Index("ix_revoked_tokens_expires", "expires_at"),
    )
