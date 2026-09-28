"""
Espejo opcional hacia el Supabase del repo original (jrojas710/proyectodegrado2,
el que usaba el workflow de n8n) — replica `casos_generados` y `sesiones_evaluadas`
alli ADEMAS de guardarlos en nuestra propia base (Postgres/Mongo), para que quien
mire ese Supabase vea actividad real de la app, no solo las pruebas sueltas del
repo clonado.

No es la fuente de verdad: la seleccion adaptativa y el RAG de nuestro backend
siguen leyendo de NUESTRA base (ver adaptativo.py, rag.py). Esto es solo una
escritura de espejo, best-effort — si el Supabase externo no responde o no
esta configurado, no bloquea ni rompe el flujo real de la app.
"""

import logging
import os

import requests

logger = logging.getLogger(__name__)


def _configurado():
    return bool(os.getenv("SUPABASE_EXTERNO_URL", "").strip() and os.getenv("SUPABASE_EXTERNO_KEY", "").strip())


def _headers():
    key = os.getenv("SUPABASE_EXTERNO_KEY", "").strip()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _post(tabla: str, fila: dict):
    if not _configurado():
        return
    url = os.getenv("SUPABASE_EXTERNO_URL", "").rstrip("/") + f"/rest/v1/{tabla}"
    try:
        res = requests.post(url, headers=_headers(), json=fila, timeout=8)
        if res.status_code >= 300:
            logger.warning("Espejo Supabase externo: %s respondio %s: %s", tabla, res.status_code, res.text[:300])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Espejo Supabase externo: no se pudo escribir en %s (%s)", tabla, exc)


def registrar_caso_generado(subtema: str, dificultad: str):
    """Espejo de casos_generados — mismo esquema que docs/BASE_DE_DATOS.md del
    repo original (columnas: subtema, dificultad)."""
    _post("casos_generados", {"subtema": subtema, "dificultad": dificultad})


def registrar_sesion_evaluada(evaluacion: dict, num_turnos: int, num_acciones_clinicas: int):
    """Espejo de sesiones_evaluadas — mismas columnas que el original."""
    revelacion = evaluacion.get("revelacion") or {}
    _post("sesiones_evaluadas", {
        "subtema": revelacion.get("subtema"),
        "dificultad": revelacion.get("dificultad"),
        "puntaje_global": evaluacion.get("puntaje_global"),
        "puntaje_desglose": evaluacion.get("desglose"),
        "concordancia_hipotesis": evaluacion.get("concordancia_hipotesis"),
        "comunicacion": evaluacion.get("comunicacion"),
        "preguntas_clave_omitidas": evaluacion.get("preguntas_clave_omitidas"),
        "hallazgos_no_indagados": evaluacion.get("hallazgos_no_indagados"),
        "num_turnos": num_turnos,
        "num_acciones_clinicas": num_acciones_clinicas,
        "duracion_segundos": evaluacion.get("duracion_segundos"),
    })
