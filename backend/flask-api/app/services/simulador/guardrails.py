"""
Guardrails deterministas — puerto literal de validarCaso, validarSignosVitales,
soloClavesDelCatalogo, el guardrail de saludo (CODE_PARSEAR_CASO), el guardrail
de fuga de diagnostico y el de ruptura de personaje (CODE_EXTRAER_PACIENTE) en
scripts/generar_workflow.py del repo jrojas710/proyectodegrado2.

Todo lo que debe ser confiable lo decide este modulo, no el LLM: el modelo
puede ser manipulado (jailbreak del estudiante, variabilidad del modelo) para
intentar revelar el diagnostico o romper personaje — estas funciones lo
interceptan despues, sobre el texto ya generado.
"""

import random
import re

from app.services.simulador.catalogo import (
    CATALOGO_EXAMEN_FISICO,
    CATALOGO_PARACLINICOS,
    ESTADOS_EMOCIONALES,
    normalizar,
)

# ---------------------------------------------------------------------------
# Validacion del caso generado (Agente 1)
# ---------------------------------------------------------------------------

def validar_caso(caso: dict) -> list:
    """Devuelve la lista de campos invalidos/faltantes; vacia si el caso es correcto."""
    errores = []
    dp = caso.get("datos_paciente") or {}
    sv = caso.get("signos_vitales") or {}
    rub = caso.get("rubrica_evaluacion") or {}

    def lista_no_vacia(x):
        return isinstance(x, list) and len(x) > 0

    if not (isinstance(caso.get("subtema"), str) and caso["subtema"]):
        errores.append("subtema")
    edad = dp.get("edad")
    if not (isinstance(edad, (int, float)) and not isinstance(edad, bool) and 0 < edad < 110):
        errores.append("datos_paciente.edad")
    if not (isinstance(dp.get("sexo"), str) and dp.get("sexo")):
        errores.append("datos_paciente.sexo")
    if not (isinstance(dp.get("ocupacion"), str) and dp.get("ocupacion")):
        errores.append("datos_paciente.ocupacion")
    if not lista_no_vacia(caso.get("antecedentes")):
        errores.append("antecedentes")
    if not lista_no_vacia(caso.get("sintomas_principales")):
        errores.append("sintomas_principales")
    if not (sv.get("TA") and sv.get("FC") and sv.get("FR") and sv.get("temp")):
        errores.append("signos_vitales")
    if not isinstance(caso.get("hallazgos_ocultos"), list):
        errores.append("hallazgos_ocultos")
    if not (isinstance(caso.get("diagnostico_real"), str) and caso["diagnostico_real"]):
        errores.append("diagnostico_real")
    if not (isinstance(caso.get("personalidad_paciente"), str) and caso["personalidad_paciente"]):
        errores.append("personalidad_paciente")
    if not (isinstance(caso.get("presentacion_inicial"), str) and caso["presentacion_inicial"]):
        errores.append("presentacion_inicial")
    if not lista_no_vacia(rub.get("preguntas_clave_anamnesis")):
        errores.append("rubrica_evaluacion.preguntas_clave_anamnesis")
    if not isinstance(rub.get("hallazgos_que_debia_indagar"), list):
        errores.append("rubrica_evaluacion.hallazgos_que_debia_indagar")
    if not isinstance(rub.get("diagnosticos_diferenciales_esperados"), list):
        errores.append("rubrica_evaluacion.diagnosticos_diferenciales_esperados")
    return errores


def validar_signos_vitales(sv: dict) -> list:
    """No bloquea el caso — solo genera avisos de auditoria si un valor esta
    fuera de rango fisiologicamente posible."""
    avisos = []
    sv = sv or {}

    def numero(s):
        m = re.search(r"(\d+(?:[.,]\d+)?)", str(s or ""))
        return float(m.group(1).replace(",", ".")) if m else None

    def rango(nombre, valor, minimo, maximo, original):
        if valor is not None and (valor < minimo or valor > maximo):
            avisos.append(f"{nombre} fuera de rango fisiologico: {original}")

    rango("FC", numero(sv.get("FC")), 30, 220, sv.get("FC"))
    rango("FR", numero(sv.get("FR")), 6, 60, sv.get("FR"))
    rango("Temperatura", numero(sv.get("temp")), 33, 43, sv.get("temp"))
    rango("TA sistolica", numero(sv.get("TA")), 50, 260, sv.get("TA"))
    if sv.get("SatO2"):
        rango("SatO2", numero(sv.get("SatO2")), 50, 100, sv.get("SatO2"))
    return avisos


def solo_claves_del_catalogo(objeto: dict, catalogo: dict, excluir: list, avisos: list, etiqueta_aviso: str) -> dict:
    """Descarta silenciosamente (con aviso) cualquier clave inventada fuera del
    catalogo cerrado — guardrail anti-alucinacion de claves."""
    limpio = {}
    if not isinstance(objeto, dict):
        return limpio
    for clave, valor in objeto.items():
        if clave in catalogo and clave not in excluir and isinstance(valor, str) and valor.strip():
            limpio[clave] = valor.strip()
        else:
            avisos.append(f"{etiqueta_aviso} descartado por no estar en el catalogo: {clave}")
    return limpio


LEXICO_SINTOMAS = [
    "dolor", "duele", "ardor", "arde", "vomit", "nause", "diarre", "sangr", "fiebre", "agriera",
    "llenura", "hinchad", "inflamad", "estren", "amarill", "colico", "punzada", "retorcijon",
    "acidez", "reflujo", "mareo", "heces", "popo", "deposici", "barriga", "estomago", "gastritis",
]

SALUDOS_GENERICOS = [
    "Buenos dias, doctor. Con permiso.",
    "Buenas tardes, doctora. ¿Puedo seguir?",
    "Hola, buenas, doctor. ¿Me siento aqui?",
    "Buenos dias. Gracias por atenderme.",
]

NOMBRES = {
    "F": ["Maria Fernanda Ortiz", "Luz Marina Rueda", "Diana Carolina Pardo", "Gloria Esperanza Suarez", "Andrea Milena Castro"],
    "M": ["Jorge Enrique Diaz", "Carlos Andres Mejia", "Luis Alberto Rincon", "Jhon Fredy Barrera", "Hernando Villamizar"],
}


def guardrail_saludo(presentacion_inicial: str, sintomas_principales: list) -> tuple:
    """El saludo inicial no puede adelantar sintomas, aunque el modelo lo haga.
    Devuelve (presentacion_final, se_activo)."""
    saludo_norm = normalizar(presentacion_inicial)
    sintomas_norm = [normalizar(s) for s in (sintomas_principales or []) if len(normalizar(s)) > 4]
    adelanta = any(t in saludo_norm for t in LEXICO_SINTOMAS) or any(s in saludo_norm for s in sintomas_norm)
    if adelanta or len(presentacion_inicial or "") > 160:
        return random.choice(SALUDOS_GENERICOS), True
    return presentacion_inicial, False


def asignar_nombre_si_falta(nombre, sexo: str) -> tuple:
    """Devuelve (nombre_final, se_asigno)."""
    if isinstance(nombre, str) and len(nombre.strip()) >= 3:
        return nombre, False
    lista = NOMBRES.get(sexo, NOMBRES["M"])
    return random.choice(lista), True


def estado_emocional_valido(valor):
    return valor if valor in ESTADOS_EMOCIONALES else "preocupado"


# ---------------------------------------------------------------------------
# Guardrails del paciente virtual (Agente 2)
# ---------------------------------------------------------------------------

SUFIJOS_DIAGNOSTICOS = re.compile(r"(itis|osis|iasis|patia|oma)$")
PALABRAS_GENERICAS = {
    "enfermedad", "sindrome", "aguda", "agudo", "cronica", "cronico", "secundaria", "secundario",
    "digestiva", "superior", "inferior", "complicada", "asociada", "sintomas",
}
_SEPARADORES_DIAGNOSTICO = re.compile(r"[/,;()]| y | o | secundari[ao] a | por ", re.IGNORECASE)

RUPTURA_PERSONAJE = [
    "modelo de lenguaje", "inteligencia artificial", "soy una ia", "soy un ia", "como ia", "asistente virtual",
    "no soy un paciente real", "soy un programa", "simulacion", "language model", "as an ai",
]

_MENSAJE_GUARDRAIL_DIAGNOSTICO = "*se encoge de hombros* Eso no sabria decirle, doctor. Para eso vine, para que usted me diga."
_MENSAJE_GUARDRAIL_PERSONAJE = "*lo mira confundido* Perdon, doctor, no le entendi bien. ¿Me repite?"


def _escapar_regex(s: str) -> str:
    return re.escape(s)


def terminos_diagnosticos(diagnostico) -> list:
    if not diagnostico:
        return []
    frases = [
        normalizar(t).strip()
        for t in _SEPARADORES_DIAGNOSTICO.split(str(diagnostico))
    ]
    frases = [t for t in frases if len(t) > 3 and t not in PALABRAS_GENERICAS]
    palabras = [
        p for p in re.split(r"[^a-z0-9]+", normalizar(diagnostico))
        if len(p) >= 7 and SUFIJOS_DIAGNOSTICOS.search(p)
    ]
    vistos = []
    for t in frases + palabras:
        if t not in vistos:
            vistos.append(t)
    return vistos


def filtra_diagnostico(mensaje: str, diagnostico) -> bool:
    texto = normalizar(mensaje)
    for t in terminos_diagnosticos(diagnostico):
        if re.search(r"(^|[^a-z0-9])" + _escapar_regex(t) + r"($|[^a-z0-9])", texto):
            return True
    return False


def rompe_personaje(mensaje: str) -> bool:
    texto = normalizar(mensaje)
    return any(frase in texto for frase in RUPTURA_PERSONAJE)


def aplicar_guardrails_paciente(mensaje: str, diagnostico_real) -> tuple:
    """Aplica ambos guardrails en orden (igual que el original: si los dos
    matchean en el mismo turno, el de ruptura de personaje pisa el mensaje del
    de fuga de diagnostico). Devuelve (mensaje_final, lista_guardrails_activados)."""
    guardrails = []
    if filtra_diagnostico(mensaje, diagnostico_real):
        guardrails.append("fuga_diagnostico")
        mensaje = _MENSAJE_GUARDRAIL_DIAGNOSTICO
    if rompe_personaje(mensaje):
        guardrails.append("ruptura_personaje")
        mensaje = _MENSAJE_GUARDRAIL_PERSONAJE
    return mensaje, guardrails


__all__ = [
    "validar_caso",
    "validar_signos_vitales",
    "solo_claves_del_catalogo",
    "guardrail_saludo",
    "asignar_nombre_si_falta",
    "estado_emocional_valido",
    "terminos_diagnosticos",
    "filtra_diagnostico",
    "rompe_personaje",
    "aplicar_guardrails_paciente",
    "LEXICO_SINTOMAS",
    "SALUDOS_GENERICOS",
    "NOMBRES",
    "RUPTURA_PERSONAJE",
]
