"""Escrituras de varios pasos: o quedan todas o no queda ninguna."""
from contextlib import contextmanager

from app import db


@contextmanager
def transaccion():
    """Confirma al salir del bloque y deshace todo si algo falla adentro (o
    en el propio commit). Ojo: un `return` dentro del bloque también confirma,
    así que las validaciones que cortan con error van ANTES de escribir."""
    try:
        yield db.session
        db.session.commit()
    except BaseException:
        db.session.rollback()
        raise
