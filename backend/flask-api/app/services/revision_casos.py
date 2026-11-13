"""Revisión de casos clínicos simulados por expertos.

- `vista_caso`: lo que ve el experto de una consulta completada, anonimizada:
  sin datos del estudiante (su nombre se reemplaza también dentro de la
  conversación) ni identificadores del paciente virtual.
- `concordancia`: acuerdo entre el puntaje del evaluador automático y el del
  experto (0 a 100): diferencia media, límites de acuerdo de Bland-Altman,
  error absoluto medio, correlación de Pearson y proporción a ±10 puntos.

Son funciones puras: reciben la consulta y el documento de Mongo ya leídos.
"""
import re
from math import sqrt

from app.services.simulador.catalogo import CATALOGO_EXAMEN_FISICO, CATALOGO_PARACLINICOS

# Criterios que califica el experto (1 a 4), en el orden del formulario.
CRITERIOS_CASO = [
    "coherencia_clinica", "realismo_paciente", "calidad_paraclinicos", "pertinencia_formativa", "dificultad_adecuada",
    "precision_evaluacion", "justicia_puntaje", "utilidad_retroalimentacion",
]

ESTUDIANTE = "[Estudiante]"


def _lista(x) -> list[str]:
    return [str(v) for v in x if str(v).strip()] if isinstance(x, list) else []


def _sin_nombres(texto: str, nombres: list[str]) -> str:
    for n in nombres:
        texto = re.sub(rf"\b{re.escape(n)}\b", ESTUDIANTE, texto, flags=re.IGNORECASE)
    return texto


def nombres_a_ocultar(*valores) -> list[str]:
    """Nombre, apellidos y usuario del estudiante (cada palabra de 3 letras o más)."""
    partes = set()
    for v in valores:
        for p in re.split(r"[\s._@-]+", v or ""):
            if len(p) >= 3:
                partes.add(p)
    return sorted(partes, key=len, reverse=True)


def _hallazgos(catalogo: dict, valores: dict, alterados: dict) -> list[dict]:
    return [{"clave": k, "etiqueta": catalogo.get(k, {}).get("etiqueta", k.replace("_", " ").capitalize()),
             "resultado": str(v), "alterado": k in (alterados or {})}
            for k, v in (valores or {}).items() if str(v).strip()]


def vista_caso(consultation, doc: dict, ocultar: list[str] | None = None) -> dict:
    """Caso completo para revisión, sin datos que identifiquen al estudiante."""
    ocultar = ocultar or []
    caso = doc.get("case") or {}
    paciente = caso.get("datos_paciente") or {}
    evaluacion = doc.get("ai_evaluation")
    respuesta = doc.get("respuesta_estudiante")

    conversacion = []
    for m in doc.get("chat_history") or []:
        quien = {"STUDENT": "ESTUDIANTE", "PATIENT": "PACIENTE"}.get(m.get("sender"), "SISTEMA")
        texto = str(m.get("content") or "")
        conversacion.append({
            "quien": quien,
            "texto": _sin_nombres(texto, ocultar) if quien == "ESTUDIANTE" else texto,
            "exploracion": bool(m.get("es_exploracion")) or texto.startswith("[Exploracion fisica:"),
            "hora": m.get("timestamp"),
        })

    acciones = []
    for a in doc.get("acciones_clinicas") or []:
        catalogo = CATALOGO_PARACLINICOS if a.get("tipo") == "paraclinico" else CATALOGO_EXAMEN_FISICO
        acciones.append({"tipo": a.get("tipo"), "etiqueta": catalogo.get(a.get("clave"), {}).get("etiqueta", a.get("clave")),
                         "hora": a.get("timestamp")})

    return {
        "consultation_id": str(consultation.id),
        "subtema": caso.get("subtema") or consultation.subtema,
        "dificultad": consultation.difficulty,
        "especialidad": consultation.specialty,
        "finalizada_at": consultation.finished_at.isoformat() if consultation.finished_at else None,
        "puntaje_ia": float(consultation.score) if consultation.score is not None else None,
        "paciente": {k: paciente.get(k) for k in ("edad", "sexo", "ocupacion", "peso_kg")},
        "presentacion_inicial": caso.get("presentacion_inicial"),
        "personalidad_paciente": caso.get("personalidad_paciente"),
        "estado_emocional_inicial": caso.get("estado_emocional_inicial"),
        "antecedentes": _lista(caso.get("antecedentes")),
        "sintomas_principales": _lista(caso.get("sintomas_principales")),
        "signos_vitales": caso.get("signos_vitales") or {},
        "examen_fisico": _hallazgos(CATALOGO_EXAMEN_FISICO, caso.get("examen_fisico"), caso.get("examen_fisico_alterado")),
        "paraclinicos": _hallazgos(CATALOGO_PARACLINICOS, caso.get("paraclinicos"), caso.get("paraclinicos_alterados")),
        "hallazgos_ocultos": _lista(caso.get("hallazgos_ocultos")),
        "diagnostico_real": caso.get("diagnostico_real"),
        "rubrica": {k: _lista(v) for k, v in (caso.get("rubrica_evaluacion") or {}).items()},
        "conversacion": conversacion,
        "acciones": acciones,
        "respuesta_estudiante": {
            "hipotesis": _sin_nombres(str(respuesta.get("hipotesis") or ""), ocultar),
            "diferenciales": _lista(respuesta.get("diferenciales")),
            "plan": _sin_nombres(str(respuesta.get("plan") or ""), ocultar),
        } if isinstance(respuesta, dict) else None,
        "evaluacion": evaluacion if isinstance(evaluacion, dict) else None,
    }


def _r(x, d=2):
    return None if x is None else round(x, d)


def concordancia(pares: list[tuple[float, float]]) -> dict:
    """pares: [(puntaje IA, puntaje experto)]. Diferencia = experto − IA."""
    pares = [(float(a), float(b)) for a, b in pares if a is not None and b is not None]
    n = len(pares)
    vacio = {"n": n, "diferencia_media": None, "de": None, "limite_inferior": None, "limite_superior": None,
             "error_absoluto_medio": None, "pearson": None, "dentro_10": None}
    if n == 0:
        return vacio
    difs = [b - a for a, b in pares]
    media = sum(difs) / n
    de = sqrt(sum((d - media) ** 2 for d in difs) / (n - 1)) if n > 1 else None
    pearson = None
    if n >= 3:
        ma = sum(a for a, _ in pares) / n
        mb = sum(b for _, b in pares) / n
        sa = sqrt(sum((a - ma) ** 2 for a, _ in pares))
        sb = sqrt(sum((b - mb) ** 2 for _, b in pares))
        if sa > 0 and sb > 0:
            pearson = sum((a - ma) * (b - mb) for a, b in pares) / (sa * sb)
    return {
        **vacio,
        "diferencia_media": _r(media),
        "de": _r(de),
        "limite_inferior": _r(media - 1.96 * de) if de is not None else None,
        "limite_superior": _r(media + 1.96 * de) if de is not None else None,
        "error_absoluto_medio": _r(sum(abs(d) for d in difs) / n),
        "pearson": _r(pearson, 3),
        "dentro_10": _r(sum(1 for d in difs if abs(d) <= 10) / n, 3),
    }
