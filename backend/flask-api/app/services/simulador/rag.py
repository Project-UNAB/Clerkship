"""
Recuperacion de referencias clinicas (RAG) — puerto de CODE_CONSOLIDAR_REFERENCIAS.
Trae hasta 3 fichas curadas de `referencias_clinicas` (Postgres) para el
subtema elegido y las inyecta en el prompt del generador como base factual.
No bloquea la generacion del caso si la tabla esta vacia o Postgres falla.
"""

import logging

from app import db

logger = logging.getLogger(__name__)


def obtener_referencias(subtema: str, limite: int = 3) -> list:
    try:
        filas = db.session.execute(
            db.text("SELECT contenido FROM referencias_clinicas WHERE subtema = :subtema LIMIT :limite"),
            {"subtema": subtema, "limite": limite},
        ).fetchall()
        return [fila[0] for fila in filas]
    except Exception as exc:  # noqa: BLE001
        logger.warning("RAG: no se pudieron leer referencias_clinicas (%s); el caso se genera sin ellas.", exc)
        return []
