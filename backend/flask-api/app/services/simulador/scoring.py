"""
Calculo de puntaje ponderado — puerto literal de CODE_PARSEAR_EVALUACION en
scripts/generar_workflow.py. El LLM evaluador solo CLASIFICA (que preguntas
cubrio, concordancia del diagnostico, etc.); el puntaje siempre lo calcula
este modulo con una formula fija y auditable, nunca el modelo.
"""

from app.services.simulador.catalogo import CATALOGO_EXAMEN_FISICO, CATALOGO_PARACLINICOS

PESOS = {"anamnesis": 0.30, "hallazgos": 0.20, "exploracion": 0.15, "razonamiento": 0.25, "comunicacion": 0.10}

ETIQUETAS = {
    "anamnesis": "Anamnesis",
    "hallazgos": "Hallazgos clave",
    "exploracion": "Examen físico y paraclínicos",
    "razonamiento": "Razonamiento clínico",
    "comunicacion": "Comunicación",
}

MAPA_CONCORDANCIA = {"alta": 1, "media": 0.66, "baja": 0.33, "nula": 0}
MAPA_PLAN = {"adecuado": 1, "parcial": 0.5, "inadecuado": 0.15, "ausente": 0}
MAPA_COMUNICACION = {"excelente": 1, "adecuada": 0.75, "mejorable": 0.4, "deficiente": 0.1}


def _lista(x):
    if not isinstance(x, list):
        return []
    return [str(v).strip() for v in x if str(v).strip()]


def validar_evaluacion(ev: dict) -> list:
    """Campos invalidos/faltantes de la clasificacion del LLM evaluador; vacia si es correcta."""
    errores = []
    if not isinstance(ev.get("preguntas_clave_cubiertas"), list):
        errores.append("preguntas_clave_cubiertas")
    if not isinstance(ev.get("preguntas_clave_omitidas"), list):
        errores.append("preguntas_clave_omitidas")
    if not isinstance(ev.get("hallazgos_indagados_correctamente"), list):
        errores.append("hallazgos_indagados_correctamente")
    if not isinstance(ev.get("hallazgos_no_indagados"), list):
        errores.append("hallazgos_no_indagados")
    if ev.get("concordancia_hipotesis") not in MAPA_CONCORDANCIA:
        errores.append("concordancia_hipotesis")
    if ev.get("calidad_plan") not in MAPA_PLAN:
        errores.append("calidad_plan")
    if ev.get("comunicacion") not in MAPA_COMUNICACION:
        errores.append("comunicacion")
    if not (isinstance(ev.get("retroalimentacion_formativa"), str) and ev["retroalimentacion_formativa"]):
        errores.append("retroalimentacion_formativa")
    return errores


def _proporcion(a: int, b: int) -> float:
    total = a + b
    return a / total if total > 0 else 0


def evaluar_exploracion(caso: dict, acciones: list) -> dict:
    """Puntaje de examen fisico/paraclinicos — NO viene del LLM, se calcula
    contra acciones_clinicas (lo que el estudiante realmente pidio/hizo) vs
    rubrica_evaluacion.examenes_pertinentes del caso."""
    pertinentes = _lista((caso.get("rubrica_evaluacion") or {}).get("examenes_pertinentes"))
    realizadas = {a.get("clave") for a in (acciones or []) if a and a.get("clave")}

    def etiqueta(clave):
        d = CATALOGO_EXAMEN_FISICO.get(clave) or CATALOGO_PARACLINICOS.get(clave)
        return d["etiqueta"] if d else clave

    hechos = [c for c in pertinentes if c in realizadas]
    omitidos = [c for c in pertinentes if c not in realizadas]
    paraclinicos_no_pertinentes = [
        a.get("clave") for a in (acciones or [])
        if a and a.get("tipo") == "paraclinico" and a.get("clave") in CATALOGO_PARACLINICOS
        and a.get("clave") not in pertinentes
    ]
    unicos_no_pertinentes = list(dict.fromkeys(paraclinicos_no_pertinentes))

    cobertura = (len(hechos) / len(pertinentes)) if pertinentes else 1
    exceso = max(0, len(unicos_no_pertinentes) - 2)
    factor = max(0.6, 1 - 0.1 * exceso)

    return {
        "puntaje": cobertura * factor,
        "detalle": {
            "pertinentes_realizados": [etiqueta(c) for c in hechos],
            "pertinentes_omitidos": [etiqueta(c) for c in omitidos],
            "paraclinicos_no_pertinentes": [etiqueta(c) for c in unicos_no_pertinentes],
        },
    }


def calcular_puntaje(ev: dict, caso: dict, acciones: list, duracion_segundos) -> dict:
    """Muta y completa `ev` con puntaje_global, desglose, exploracion y
    revelacion — replica exacta de la formula del original (ver
    docs/ARQUITECTURA.md del repo clonado)."""
    for campo in (
        "preguntas_clave_cubiertas", "preguntas_clave_omitidas", "hallazgos_indagados_correctamente",
        "hallazgos_no_indagados", "diferenciales_pertinentes", "diferenciales_faltantes",
        "fortalezas", "aspectos_a_mejorar",
    ):
        ev[campo] = _lista(ev.get(campo))

    exploracion = evaluar_exploracion(caso, acciones)

    componentes = {
        "anamnesis": _proporcion(len(ev["preguntas_clave_cubiertas"]), len(ev["preguntas_clave_omitidas"])),
        "hallazgos": _proporcion(len(ev["hallazgos_indagados_correctamente"]), len(ev["hallazgos_no_indagados"])),
        "exploracion": exploracion["puntaje"],
        "razonamiento": (
            MAPA_CONCORDANCIA[ev["concordancia_hipotesis"]] * 0.60
            + _proporcion(len(ev["diferenciales_pertinentes"]), len(ev["diferenciales_faltantes"])) * 0.25
            + MAPA_PLAN[ev["calidad_plan"]] * 0.15
        ),
        "comunicacion": MAPA_COMUNICACION[ev["comunicacion"]],
    }

    # Sin rubrica de hallazgos el componente no penaliza.
    rubrica_hallazgos = _lista((caso.get("rubrica_evaluacion") or {}).get("hallazgos_que_debia_indagar"))
    if not rubrica_hallazgos and not ev["hallazgos_indagados_correctamente"] and not ev["hallazgos_no_indagados"]:
        componentes["hallazgos"] = 1

    total = 0.0
    desglose = []
    for dim, peso in PESOS.items():
        valor = max(0.0, min(1.0, componentes[dim]))
        total += valor * peso
        desglose.append({
            "dimension": dim,
            "etiqueta": ETIQUETAS[dim],
            "peso": round(peso * 100),
            "puntaje": round(valor * 100),
        })

    ev["puntaje_global"] = round(total * 100)
    ev["desglose"] = desglose
    ev["exploracion"] = exploracion["detalle"]
    ev["revelacion"] = {
        "diagnostico_real": caso.get("diagnostico_real"),
        "subtema": caso.get("subtema"),
        "dificultad": caso.get("dificultad_asignada"),
        "diferenciales_esperados": _lista((caso.get("rubrica_evaluacion") or {}).get("diagnosticos_diferenciales_esperados")),
    }
    ev["duracion_segundos"] = round(duracion_segundos) if isinstance(duracion_segundos, (int, float)) else None
    return ev
