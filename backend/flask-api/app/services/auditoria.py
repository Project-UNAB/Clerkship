"""Registro de auditoría de las acciones sensibles.

    auditoria.registrar("GRADE_CHANGE", "submission", entrega.id,
                        old={"score": 7}, new={"score": 9})
    db.session.commit()

La fila se agrega a la transacción en curso: queda guardada si y solo si el
cambio que describe queda guardado. Si el cambio se deshace, el registro
también.
"""
import uuid
from datetime import date, datetime
from decimal import Decimal

from flask import has_request_context, request
from flask_jwt_extended import get_jwt_identity

from app import db
from app.models import AuditLog

# Acciones que se registran.
GRADE_CHANGE = "GRADE_CHANGE"                      # calificar o cambiar una nota
SUBMISSION_DELETE = "SUBMISSION_DELETE"
SUBMISSION_RESTORE = "SUBMISSION_RESTORE"
STUDENT_ENROLL = "STUDENT_ENROLL"                  # matricular (por el docente, por código o por aprobación)
STUDENT_REMOVE = "STUDENT_REMOVE"                  # expulsar, o salirse
ENROLLMENT_REQUEST_REJECT = "ENROLLMENT_REQUEST_REJECT"
COURSE_DELETE = "COURSE_DELETE"                    # a la papelera
COURSE_RESTORE = "COURSE_RESTORE"
COURSE_PURGE = "COURSE_PURGE"                      # borrado definitivo
ENROLLMENT_CODE_CHANGE = "ENROLLMENT_CODE_CHANGE"
ENROLLMENT_MODE_CHANGE = "ENROLLMENT_MODE_CHANGE"
GRADE_POLICY_CHANGE = "GRADE_POLICY_CHANGE"
GRADEBOOK_EXPORT = "GRADEBOOK_EXPORT"              # el docente descargó el libro de calificaciones
USER_ROLE_CHANGE = "USER_ROLE_CHANGE"
USER_ACTIVE_CHANGE = "USER_ACTIVE_CHANGE"


def _serializable(valor):
    """Deja el valor listo para guardarse como JSON."""
    if valor is None or isinstance(valor, (bool, int, float, str)):
        return valor
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, uuid.UUID):
        return str(valor)
    if isinstance(valor, dict):
        return {str(k): _serializable(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple, set)):
        return [_serializable(v) for v in valor]
    return str(valor)


def enmascarar_codigo(codigo):
    """Un código de matrícula es un secreto: en el registro solo quedan sus
    dos últimos caracteres, suficiente para saber cuál era sin poder usarlo."""
    if not codigo:
        return None
    return "•" * max(0, len(codigo) - 2) + codigo[-2:]


def _ip():
    if not has_request_context():
        return None
    # Con TRUST_PROXY=1, ProxyFix ya dejó acá la IP real del cliente.
    return (request.remote_addr or "")[:45] or None


def _usuario_actual():
    if not has_request_context():
        return None
    try:
        return uuid.UUID(str(get_jwt_identity()))
    except Exception:  # noqa: BLE001 — sin sesión, o identidad que no es un UUID
        return None


def registrar(action, entity_type, entity_id, old=None, new=None, user_id=None):
    """Agrega el registro a la transacción en curso (no hace commit).
    `user_id`: quién lo hizo; por defecto, el usuario del JWT de la petición."""
    fila = AuditLog(
        user_id=user_id if user_id is not None else _usuario_actual(),
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id)[:64] if entity_id is not None else None,
        old_value=_serializable(old),
        new_value=_serializable(new),
        ip=_ip(),
    )
    db.session.add(fila)
    return fila
