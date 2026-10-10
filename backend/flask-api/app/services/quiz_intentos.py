"""Reglas de los intentos de cuestionario que no consultan la base: hasta
cuándo se puede responder un intento y qué nota queda cuando hay varios."""
from datetime import datetime, timedelta, timezone

from app.models.course_content_item import POLITICAS_NOTA  # noqa: F401  (se reexporta)

POLITICA_NOTA_POR_DEFECTO = "BEST"

POLITICAS_ENVIO_TARDIO = ("GRADE_SAVED", "REJECT")


def _utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def calcular_deadline(inicio, time_limit_minutes, due_at):
    """Hasta cuándo se puede responder un intento que arrancó en `inicio`: lo
    que llegue primero entre el tiempo límite y el cierre del cuestionario.
    None si no hay ninguno de los dos."""
    limites = []
    if time_limit_minutes:
        limites.append(_utc(inicio) + timedelta(minutes=int(time_limit_minutes)))
    if due_at is not None:
        limites.append(_utc(due_at))
    return min(limites) if limites else None


def esta_vencido(deadline, ahora, tolerancia_segundos=0) -> bool:
    if deadline is None:
        return False
    return _utc(ahora) > _utc(deadline) + timedelta(seconds=max(0, int(tolerancia_segundos or 0)))


def segundos_restantes(deadline, ahora):
    if deadline is None:
        return None
    return max(0, int((_utc(deadline) - _utc(ahora)).total_seconds()))


def nota_segun_politica(intentos, politica):
    """Nota del cuestionario a partir de los intentos YA entregados de un
    estudiante. BEST: la más alta; LAST / FIRST: la del último / primer
    intento; AVERAGE: el promedio. None si no hay intentos entregados."""
    entregados = [i for i in intentos if i.submitted_at is not None]
    if not entregados:
        return None

    def _orden(intento):
        entregado = intento.submitted_at
        return (
            getattr(intento, "attempt_number", None) or 0,
            _utc(entregado) if isinstance(entregado, datetime) else datetime.min.replace(tzinfo=timezone.utc),
        )

    entregados.sort(key=_orden)
    notas = [float(i.score) if i.score is not None else 0.0 for i in entregados]

    politica = (politica or POLITICA_NOTA_POR_DEFECTO).upper()
    if politica == "LAST":
        return notas[-1]
    if politica == "FIRST":
        return notas[0]
    if politica == "AVERAGE":
        return round(sum(notas) / len(notas), 2)
    return max(notas)
