"""
Modo demo determinista (sin llamar a ningun proveedor de IA) — se usa cuando
AI_AGENT_PROVIDER=mock o no hay ninguna API key configurada. Deja recorrer el
flujo completo (crear caso, examinar, pedir paraclinicos, chatear y evaluar)
sin gastar cuota, igual que el modo sin API key del repo original
(README: "Sin Supabase/API key configurado el simulador funciona igual").
"""

import random
from datetime import datetime, timezone

from app.services.simulador.catalogo import CATALOGO_EXAMEN_FISICO, CATALOGO_PARACLINICOS

CASO_DEMO_BASE = {
    "id_caso": "GI-DEMO-001",
    "datos_paciente": {"nombre": "Luz Marina Rueda", "edad": 46, "sexo": "F", "ocupacion": "Modista"},
    "antecedentes": ["Obesidad grado I", "G3P3", "Sin cirugias previas"],
    "sintomas_principales": ["dolor en hipocondrio derecho de 2 dias", "nauseas", "fiebre"],
    "signos_vitales": {"TA": "128/82 mmHg", "FC": "104 lpm", "FR": "20 rpm", "temp": "38.4 C", "SatO2": "96 %"},
    "examen_fisico_alterado": {
        "signo_murphy": "Signo de Murphy positivo con detencion de la inspiracion.",
        "palpacion_profunda": "Dolor intenso a la palpacion profunda en hipocondrio derecho.",
    },
    "paraclinicos_alterados": {
        "hemograma": "Leucocitos 15.800/mm3, neutrofilos 84 %.",
        "ecografia_abdominal": "Vesicula distendida, pared de 5 mm, multiples calculos, Murphy ecografico positivo.",
    },
    "hallazgos_ocultos": ["Episodios previos similares que cedian solos"],
    "diagnostico_real": "Colecistitis aguda litiasica",
    "personalidad_paciente": "Conversadora, preocupada por no poder trabajar.",
    "estado_emocional_inicial": "adolorido",
    "presentacion_inicial": "Buenos dias, doctor. Con permiso.",
    "rubrica_evaluacion": {
        "preguntas_clave_anamnesis": ["Inicio y evolucion del dolor", "Relacion con comidas", "Fiebre", "Irradiacion"],
        "hallazgos_que_debia_indagar": ["Episodios previos", "Fiebre"],
        "diagnosticos_diferenciales_esperados": ["Pancreatitis aguda", "Ulcera peptica", "Hepatitis"],
        "examenes_pertinentes": ["signos_vitales", "signo_murphy", "hemograma", "ecografia_abdominal"],
    },
}

_RESPUESTAS_DEMO = [
    "Pues desde antier me duele aqui arriba a la derecha, doctor.",
    "No, doctor, no he tenido nada parecido antes... bueno, hace tiempo si me daba algo similar pero se me pasaba solo.",
    "Si, tambien he sentido nauseas y como fiebre.",
    "Gracias doctor, que Dios le pague.",
]


def caso_demo(subtema: str, dificultad: str) -> dict:
    caso = {k: (v.copy() if isinstance(v, dict) else list(v) if isinstance(v, list) else v) for k, v in CASO_DEMO_BASE.items()}
    caso["subtema"] = subtema
    caso["dificultad_asignada"] = dificultad

    caso["examen_fisico"] = {
        clave: caso["examen_fisico_alterado"].get(clave, d["normal"])
        for clave, d in CATALOGO_EXAMEN_FISICO.items() if clave != "signos_vitales"
    }
    caso["paraclinicos"] = {
        clave: caso["paraclinicos_alterados"].get(clave, d["normal"])
        for clave, d in CATALOGO_PARACLINICOS.items()
    }
    return caso


def respuesta_demo(turno: int) -> dict:
    mensaje = _RESPUESTAS_DEMO[min(turno, len(_RESPUESTAS_DEMO) - 1)]
    return {
        "mensaje": mensaje,
        "estado_emocional": "adolorido" if turno < len(_RESPUESTAS_DEMO) - 1 else "agradecido",
        "consulta_terminada": turno >= len(_RESPUESTAS_DEMO) - 1,
    }


def evaluacion_demo() -> dict:
    return {
        "preguntas_clave_cubiertas": ["Inicio y evolucion del dolor", "Relacion con comidas"],
        "preguntas_clave_omitidas": ["Fiebre", "Irradiacion"],
        "hallazgos_indagados_correctamente": ["Episodios previos"],
        "hallazgos_no_indagados": ["Fiebre"],
        "concordancia_hipotesis": "alta",
        "comentario_hipotesis": "Diagnostico correcto (modo demo, sin IA real).",
        "diferenciales_pertinentes": ["Pancreatitis aguda"],
        "diferenciales_faltantes": ["Ulcera peptica", "Hepatitis"],
        "calidad_plan": "parcial",
        "comentario_plan": "Falta analgesia (modo demo, sin IA real).",
        "comunicacion": "adecuada",
        "comentario_comunicacion": "Buena presentacion (modo demo, sin IA real).",
        "fortalezas": ["Buen saludo"],
        "aspectos_a_mejorar": ["Preguntar por fiebre"],
        "retroalimentacion_formativa": "Retroalimentacion de ejemplo — configura GEMINI_API_KEY u OPENROUTER_API_KEY para evaluaciones reales.",
    }
