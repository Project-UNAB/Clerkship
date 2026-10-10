"""Vigencia de los JWT más allá de su fecha de vencimiento.

Cada petición autenticada pasa por `token_revocado`, que mira la BASE, no
solo lo que dice el token. Un token deja de servir de inmediato si:

- se revocó a mano (logout): su jti está en revoked_tokens;
- se emitió antes de users.tokens_valid_after: el corte que se mueve al
  cambiar el rol, la contraseña o al cerrar todas las sesiones;
- la cuenta ya no existe o fue desactivada;
- es un access token cuyo rol ya no es el que el usuario tiene en la base.

Así el rol y el estado de la cuenta se validan contra la base en todas las
acciones, y un token robado o viejo no sobrevive a esos cambios.
"""
import uuid
from datetime import datetime, timezone

from flask import current_app
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app import db
from app.models import RevokedToken, User


def _instante(dt) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _usuario_del_token(payload):
    try:
        return User.query.get(uuid.UUID(str(payload.get("sub"))))
    except (ValueError, TypeError):
        return None


def token_revocado(payload) -> bool:
    """True si el token ya no debe aceptarse. Si la base no responde también
    devuelve True: ante la duda, no se deja pasar."""
    try:
        jti = payload.get("jti")
        if not jti or RevokedToken.query.filter_by(jti=jti).first() is not None:
            return True

        usuario = _usuario_del_token(payload)
        if usuario is None or not usuario.activo:
            return True

        corte = usuario.tokens_valid_after
        if corte is not None and int(payload.get("iat", 0)) < _instante(corte):
            return True

        # El rol del access token tiene que ser el rol ACTUAL en la base.
        if payload.get("type") == "access" and payload.get("role") != usuario.role:
            return True
        return False
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.error("No se pudo comprobar la vigencia del token", exc_info=True)
        return True


def revocar_token(payload, motivo="logout") -> None:
    """Anota el jti del token como revocado, en la transacción en curso (no
    hace commit). Revocar dos veces el mismo token no es un error."""
    jti = payload.get("jti")
    if not jti:
        return
    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        user_id = None
    vence = datetime.fromtimestamp(int(payload.get("exp", 0)), tz=timezone.utc)
    db.session.execute(
        pg_insert(RevokedToken.__table__)
        .values(jti=jti, user_id=user_id, token_type=payload.get("type") or "access", reason=motivo[:40], expires_at=vence)
        .on_conflict_do_nothing(index_elements=["jti"])
    )


def invalidar_sesiones_de(usuario) -> None:
    """Deja sin efecto TODOS los tokens que el usuario tenga emitidos (access
    y refresh): tiene que volver a iniciar sesión. En la transacción en curso."""
    usuario.tokens_valid_after = datetime.now(timezone.utc)


def limpiar_vencidos() -> int:
    """Borra de la lista de revocación los tokens que ya vencieron solos."""
    borrados = RevokedToken.query.filter(RevokedToken.expires_at < datetime.now(timezone.utc)).delete(synchronize_session=False)
    db.session.commit()
    return borrados
