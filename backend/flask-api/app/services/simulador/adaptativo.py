"""
Seleccion adaptativa de subtema y dificultad — puerto de
CODE_ANALIZAR_HISTORIAL en scripts/generar_workflow.py, con una diferencia
deliberada: el original (demo n8n sin cuentas) miraba el historial GLOBAL de
Supabase; aca, con usuarios reales, se mira el historial POR ESTUDIANTE
(Postgres: consultations + ai_evaluations) — la formula es identica, solo
cambia el alcance de la consulta, que tiene mas sentido para una plataforma
multiusuario real.

Nunca bloquea la generacion del caso: si Postgres falla o el estudiante no
tiene historial, cae a seleccion aleatoria / dificultad intermedia, igual que
el original con continueOnFail en las lecturas a Supabase.
"""

import logging
import random

from app.models import AiEvaluation, Consultation
from app.services.simulador.catalogo import SUBTEMAS, normalizar_dificultad, normalizar_subtema

logger = logging.getLogger(__name__)

_MIN_SESIONES_PARA_PROMEDIO = 3
_UMBRAL_AREA_DEBIL = 60
_UMBRAL_DIFICULTAD_BAJA = 50
_UMBRAL_DIFICULTAD_ALTA = 85


def _promedios_por_subtema(student_id) -> dict:
    """Ultimas 40 sesiones evaluadas del estudiante -> {subtema: (suma, n)}."""
    filas = (
        Consultation.query
        .join(AiEvaluation, AiEvaluation.consultation_id == Consultation.id)
        .filter(Consultation.student_id == student_id, AiEvaluation.final_score.isnot(None))
        .order_by(AiEvaluation.created_at.desc())
        .limit(40)
        .with_entities(Consultation.subtema, AiEvaluation.final_score)
        .all()
    )
    promedios = {}
    for subtema, score in filas:
        if not subtema or score is None:
            continue
        suma, n = promedios.get(subtema, (0.0, 0))
        promedios[subtema] = (suma + float(score), n + 1)
    return promedios


def _recientes(student_id) -> list:
    """Subtema de las ultimas 10 consultas creadas por el estudiante."""
    filas = (
        Consultation.query
        .filter(Consultation.student_id == student_id)
        .order_by(Consultation.started_at.desc())
        .limit(10)
        .with_entities(Consultation.subtema)
        .all()
    )
    return [s for (s,) in filas if s]


def elegir_subtema_y_dificultad(student_id, subtema_pedido=None, dificultad_pedida=None) -> dict:
    """Devuelve {subtema, dificultad, criterio_subtema, criterio_dificultad}.
    Lo que el usuario elija explicitamente siempre tiene prioridad."""
    subtema_forzado = normalizar_subtema(subtema_pedido)
    dificultad_forzada = normalizar_dificultad(dificultad_pedida)

    try:
        promedios = _promedios_por_subtema(student_id)
        recientes = _recientes(student_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Seleccion adaptativa: no se pudo leer el historial (%s); se usa aleatorio.", exc)
        promedios, recientes = {}, []

    def promedio_de(subtema):
        suma, n = promedios.get(subtema, (0.0, 0))
        return (suma / n) if n >= _MIN_SESIONES_PARA_PROMEDIO else None

    if subtema_forzado:
        subtema = subtema_forzado
        criterio_subtema = "elegido_por_usuario"
    else:
        no_recientes = [s for s in SUBTEMAS if s not in recientes[:3]]
        candidatos = no_recientes if no_recientes else SUBTEMAS
        debiles = [s for s in candidatos if (promedio_de(s) is not None and promedio_de(s) < _UMBRAL_AREA_DEBIL)]
        if debiles and random.random() < 0.5:
            subtema = random.choice(debiles)
            criterio_subtema = "refuerzo_area_debil"
        else:
            subtema = random.choice(candidatos)
            criterio_subtema = "rotacion_sin_repetir"

    if dificultad_forzada:
        dificultad = dificultad_forzada
        criterio_dificultad = "elegida_por_usuario"
    else:
        promedio = promedio_de(subtema)
        if promedio is None:
            dificultad = "intermedio"
            criterio_dificultad = "sin_historial_suficiente"
        else:
            if promedio < _UMBRAL_DIFICULTAD_BAJA:
                dificultad = "facil"
            elif promedio > _UMBRAL_DIFICULTAD_ALTA:
                dificultad = "dificil"
            else:
                dificultad = "intermedio"
            criterio_dificultad = "ajuste_por_desempeno"

    return {
        "subtema": subtema,
        "dificultad": dificultad,
        "criterio_subtema": criterio_subtema,
        "criterio_dificultad": criterio_dificultad,
    }
