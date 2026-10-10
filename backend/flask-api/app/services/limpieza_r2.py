"""Borrado de archivos en R2 con reintentos.

Flujo de un borrado que arrastra archivos (un curso, una tarea...):

    limpieza_r2.encolar(claves, "curso:<id>")   # misma transacción que el DELETE
    db.session.commit()
    limpieza_r2.procesar(claves)                # después del commit

Si el commit falla, las claves no quedan anotadas y los archivos siguen ahí
(siguen referenciados). Si R2 falla, quedan anotadas y `procesar()` (o
`flask limpiar-archivos`) las vuelve a intentar más tarde.
"""
from datetime import datetime, timezone

from flask import current_app
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app import db, storage
from app.models import PendingFileDeletion

MAX_INTENTOS = 10


def encolar(claves, motivo=None) -> list:
    """Anota las claves como pendientes de borrar, en la transacción en curso
    (no hace commit). Devuelve las claves anotadas, sin repetidos ni vacíos."""
    unicas = list(dict.fromkeys(c for c in claves if c))
    if unicas:
        db.session.execute(
            pg_insert(PendingFileDeletion.__table__)
            .values([{"storage_key": c, "reason": (motivo or "")[:120] or None} for c in unicas])
            .on_conflict_do_nothing(index_elements=["storage_key"])
        )
    return unicas


def procesar(claves=None, limite=200) -> dict:
    """Intenta borrar de R2 los pendientes (solo `claves`, o los más viejos
    hasta `limite`). Lo que se borra sale de la tabla; lo que falla queda con
    el error para el próximo intento. Nunca lanza: devuelve el resumen."""
    resumen = {"borrados": 0, "fallidos": 0}
    try:
        query = PendingFileDeletion.query.filter(PendingFileDeletion.attempts < MAX_INTENTOS)
        if claves is not None:
            claves = [c for c in claves if c]
            if not claves:
                return resumen
            query = query.filter(PendingFileDeletion.storage_key.in_(claves))
        pendientes = query.order_by(PendingFileDeletion.created_at.asc()).limit(limite).all()

        for pendiente in pendientes:
            try:
                storage.borrar(pendiente.storage_key)  # en R2 borrar algo que ya no existe no es error
            except Exception as err:  # noqa: BLE001 — se anota y se reintenta después
                pendiente.attempts = (pendiente.attempts or 0) + 1
                pendiente.last_error = str(err)[:500]
                pendiente.last_attempt_at = datetime.now(timezone.utc)
                resumen["fallidos"] += 1
            else:
                db.session.delete(pendiente)
                resumen["borrados"] += 1
        db.session.commit()
    except Exception:  # noqa: BLE001 — la limpieza nunca tumba la petición que la disparó
        db.session.rollback()
        current_app.logger.warning("No se pudo procesar la limpieza de archivos en R2", exc_info=True)
    return resumen


def borrar_o_encolar(clave, motivo=None) -> None:
    """Borra un objeto ya. Si R2 falla, lo deja anotado para reintentar en vez
    de perderle la pista. Para llamarse DESPUÉS del commit que dejó el objeto
    sin referencias."""
    if not clave:
        return
    try:
        storage.borrar(clave)
        return
    except Exception:  # noqa: BLE001
        current_app.logger.warning("No se pudo borrar de R2 el objeto %s; queda pendiente", clave, exc_info=True)
    try:
        encolar([clave], motivo)
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.warning("Tampoco se pudo anotar %s como pendiente de borrar", clave, exc_info=True)
