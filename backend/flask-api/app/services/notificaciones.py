"""Notificaciones: dentro de la plataforma siempre, y por correo a quien lo
haya activado en sus preferencias.

Se crean DESPUÉS del commit de la acción que las origina (publicar una
tarea, un aviso, calificar) y en su propia transacción: avisar es secundario,
así que si falla se anota en el log y la acción principal queda intacta.

El recordatorio de "cierra en 24 h" no nace de una petición: lo dispara
`recordar_vencimientos()` (comando `flask notificar-vencimientos`, pensado
para correr cada hora). Una clave única por tarea y estudiante evita que se
repita aunque corra muchas veces.
"""
from datetime import datetime, timedelta, timezone

from flask import current_app
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app import db, mailer
from app.models import (
    AssignmentSubmission,
    Course,
    CourseBlock,
    CourseContentItem,
    Notification,
    StudentCourse,
    User,
)

ASSIGNMENT_PUBLISHED = "ASSIGNMENT_PUBLISHED"
ANNOUNCEMENT = "ANNOUNCEMENT"
ASSIGNMENT_GRADED = "ASSIGNMENT_GRADED"
DUE_SOON = "DUE_SOON"

# Las fechas viajan en UTC; en el texto de un correo se escriben en hora de
# Colombia (UTC-5 todo el año, sin horario de verano).
ZONA_COLOMBIA = timezone(timedelta(hours=-5))
VENTANA_RECORDATORIO = timedelta(hours=24)


def fecha_en_colombia(dt) -> str:
    """'27 oct 2026, 11:59 p. m. (hora de Colombia)' para el texto de un correo."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(ZONA_COLOMBIA)
    meses = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
    hora = local.hour % 12 or 12
    sufijo = "a. m." if local.hour < 12 else "p. m."
    return f"{local.day} {meses[local.month - 1]} {local.year}, {hora}:{local.minute:02d} {sufijo} (hora de Colombia)"


def _estudiantes_del_curso(course_id) -> list:
    return [sid for (sid,) in db.session.query(StudentCourse.student_id).filter(StudentCourse.course_id == course_id).all()]


def _crear(user_ids, tipo, titulo, cuerpo=None, course_id=None, entity_type=None, entity_id=None,
           event_at=None, dedupe=None) -> list:
    """Inserta una notificación por usuario (sin commit) y devuelve
    [(id de la notificación, id del usuario)] de las que SÍ se crearon (las
    repetidas por dedupe no cuentan)."""
    user_ids = list(dict.fromkeys(u for u in user_ids if u))
    if not user_ids:
        return []
    filas = [
        {
            "user_id": uid, "type": tipo, "title": titulo[:200], "body": (cuerpo or None) and cuerpo[:500],
            "course_id": course_id, "entity_type": entity_type, "entity_id": entity_id, "event_at": event_at,
            "dedupe_key": dedupe(uid) if dedupe else None,
        }
        for uid in user_ids
    ]
    resultado = db.session.execute(
        pg_insert(Notification.__table__).values(filas)
        .on_conflict_do_nothing(index_elements=["dedupe_key"])
        .returning(Notification.__table__.c.id, Notification.__table__.c.user_id)
    )
    return [(nid, uid) for nid, uid in resultado.all()]


def _enviar_correos(creadas, asunto, texto) -> int:
    """Correo a los usuarios de las notificaciones recién creadas que tengan
    activado recibirlos. Un solo pedido al proveedor para todos; cada uno
    recibe su copia individual."""
    if not creadas:
        return 0
    notificacion_de = {uid: nid for nid, uid in creadas}
    destinatarios = (
        User.query.filter(
            User.id.in_(list(notificacion_de)), User.email_notifications.is_(True), User.activo.is_(True),
        ).all()
    )
    if not destinatarios:
        return 0
    mailer.send_notification_emails([(u.email, u.first_name) for u in destinatarios], asunto, texto)
    Notification.query.filter(Notification.id.in_([notificacion_de[u.id] for u in destinatarios])).update(
        {"email_sent_at": datetime.now(timezone.utc)}, synchronize_session=False,
    )
    return len(destinatarios)


def _notificar(user_ids, tipo, titulo, cuerpo=None, asunto=None, texto_correo=None, **datos) -> int:
    """Crea las notificaciones y manda los correos, en su propia transacción.
    Nunca lanza: devuelve cuántas se crearon (0 si algo falló)."""
    try:
        creados = _crear(user_ids, tipo, titulo, cuerpo, **datos)
        db.session.commit()
    except Exception:  # noqa: BLE001 — avisar nunca tumba la acción que ya se confirmó
        db.session.rollback()
        current_app.logger.warning("No se pudieron crear las notificaciones (%s)", tipo, exc_info=True)
        return 0
    try:
        _enviar_correos(creados, asunto or titulo, texto_correo or cuerpo or titulo)
        db.session.commit()
    except Exception:  # noqa: BLE001 — la notificación in-app ya quedó; el correo es un extra
        db.session.rollback()
        current_app.logger.warning("No se pudieron enviar los correos de notificación (%s)", tipo, exc_info=True)
    return len(creados)


# ─────────────────────────── Eventos ───────────────────────────

def tarea_publicada(course, item) -> int:
    """A todos los estudiantes del curso: el docente publicó una tarea."""
    cierre = f" Cierra el {fecha_en_colombia(item.due_at)}." if item.due_at else ""
    return _notificar(
        _estudiantes_del_curso(course.id), ASSIGNMENT_PUBLISHED,
        f"Nueva tarea: {item.title}", f"En {course.name}.",
        asunto=f"Nueva tarea en {course.name}: {item.title}",
        texto_correo=f"Se publicó la tarea «{item.title}» en el curso {course.name}.{cierre}",
        course_id=course.id, entity_type="assignment", entity_id=item.id, event_at=item.due_at,
    )


def aviso_publicado(course, aviso) -> int:
    """A todos los estudiantes del curso: hay un aviso nuevo."""
    return _notificar(
        _estudiantes_del_curso(course.id), ANNOUNCEMENT,
        f"Nuevo aviso: {aviso.title}", f"En {course.name}.",
        asunto=f"Nuevo aviso en {course.name}: {aviso.title}",
        texto_correo=f"Hay un aviso nuevo en el curso {course.name}: «{aviso.title}». Entra a la plataforma para leerlo.",
        course_id=course.id, entity_type="announcement", entity_id=aviso.id,
    )


def tarea_calificada(course, item, entrega) -> int:
    """Al estudiante: su entrega ya tiene nota."""
    maximo = f" / {float(item.max_score):g}" if item.max_score is not None else ""
    nota = f"{float(entrega.score):g}{maximo}"
    return _notificar(
        [entrega.student_id], ASSIGNMENT_GRADED,
        f"Tarea calificada: {item.title}", f"Tu nota: {nota}. En {course.name}.",
        asunto=f"Calificaron tu tarea «{item.title}»",
        texto_correo=f"Tu entrega de «{item.title}» en el curso {course.name} ya fue calificada. Nota: {nota}.",
        course_id=course.id, entity_type="assignment", entity_id=item.id,
    )


def recordar_vencimientos(ahora=None) -> dict:
    """Recordatorio de "cierra en menos de 24 h" a los estudiantes que todavía
    no entregaron. Se puede correr las veces que haga falta: a cada estudiante
    le llega una sola vez por tarea. Devuelve {tareas, notificaciones}."""
    ahora = ahora or datetime.now(timezone.utc)
    resumen = {"tareas": 0, "notificaciones": 0}

    tareas = (
        db.session.query(CourseContentItem, Course)
        .join(CourseBlock, CourseContentItem.block_id == CourseBlock.id)
        .join(Course, CourseBlock.course_id == Course.id)   # los cursos en la papelera quedan fuera solos
        .filter(
            CourseContentItem.type == "ASSIGNMENT",
            CourseContentItem.due_at > ahora,
            CourseContentItem.due_at <= ahora + VENTANA_RECORDATORIO,
        )
        .all()
    )
    for item, course in tareas:
        ya_entregaron = {
            sid for (sid,) in db.session.query(AssignmentSubmission.student_id)
            .filter(AssignmentSubmission.item_id == item.id, AssignmentSubmission.current_version > 0).all()
        }
        pendientes = [sid for sid in _estudiantes_del_curso(course.id) if sid not in ya_entregaron]
        db.session.commit()   # lo leído no deja una transacción abierta entre tareas
        if not pendientes:
            continue
        resumen["tareas"] += 1
        resumen["notificaciones"] += _notificar(
            pendientes, DUE_SOON,
            f"Cierra pronto: {item.title}", f"Todavía no has entregado. En {course.name}.",
            asunto=f"Mañana cierra la tarea «{item.title}»",
            texto_correo=(
                f"La tarea «{item.title}» del curso {course.name} cierra el {fecha_en_colombia(item.due_at)} "
                "y todavía no registramos tu entrega."
            ),
            course_id=course.id, entity_type="assignment", entity_id=item.id, event_at=item.due_at,
            dedupe=lambda uid, item_id=item.id: f"due:{item_id}:{uid}",
        )
    return resumen
