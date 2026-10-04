"""
Orquestacion de las 4 acciones del simulador — puerto de CODE_PARSEAR_CASO,
CODE_CONTEXTO_PACIENTE + CODE_EXTRAER_PACIENTE, CODE_EXPLORACION y
CODE_PROMPT_EVALUADOR + CODE_PARSEAR_EVALUACION en
scripts/generar_workflow.py del repo jrojas710/proyectodegrado2.

Diferencia deliberada con el original: alli el CLIENTE cargaba
`system_prompt_paciente` y `caso_completo_oculto` (con el diagnostico real
incluido) de ida y vuelta en cada llamada, porque el backend n8n no tenia
persistencia propia. Aca el caso completo vive server-side (Mongo, ver
app/routes/consultas.py) y el cliente nunca lo recibe — solo la version
publica sin `diagnostico_real` ni `rubrica_evaluacion`. El `system_prompt_paciente`
tampoco se guarda: es 100% derivable del caso, se reconstruye en cada turno.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.services.simulador import mock
from app.services.simulador.catalogo import (
    CATALOGO_EXAMEN_FISICO,
    CATALOGO_PARACLINICOS,
    normalizar,
    valor_normal_paraclinico,
)
from app.services.simulador.guardrails import (
    aplicar_guardrails_paciente,
    asignar_nombre_si_falta,
    estado_emocional_valido,
    guardrail_saludo,
    solo_claves_del_catalogo,
    validar_caso,
    validar_signos_vitales,
)
from app.services.simulador.identidad import avatar_url_por_defecto
from app.services.simulador.modelo import llamar_modelo, parsear_json
from app.services.simulador.prompts import (
    construir_prompt_evaluador,
    construir_prompt_generador,
    construir_system_prompt_paciente,
)
from app.services.simulador.rag import obtener_referencias
from app.services.simulador.scoring import calcular_puntaje

logger = logging.getLogger(__name__)

_CATALOGO_EXPLORACION = {
    "examen_fisico": [{"clave": c, "etiqueta": d["etiqueta"], "grupo": d["grupo"]} for c, d in CATALOGO_EXAMEN_FISICO.items()],
    "paraclinicos": [{"clave": c, "etiqueta": d["etiqueta"], "grupo": d["grupo"]} for c, d in CATALOGO_PARACLINICOS.items()],
}


def catalogo_exploracion() -> dict:
    return _CATALOGO_EXPLORACION


# ---------------------------------------------------------------------------
# Agente 1 — Generador de casos
# ---------------------------------------------------------------------------

def generar_caso(subtema: str, dificultad: str, referencias: Optional[list] = None, identidad_forzada: Optional[dict] = None) -> dict:
    """Genera y sanea un caso clinico completo. Devuelve un dict con
    `is_mock` (True si hay que reintentar/usar demo) y, si tuvo exito,
    `caso_completo_oculto` + `system_prompt_paciente` listos para persistir.

    `identidad_forzada` (de GET /api/consultas/ficha-previa) es la identidad
    administrativa que el estudiante ya vio en la pantalla de carga -- se le
    pide al modelo que la use (prompts.py) y, como red de seguridad, se
    sobreescribe nombre/edad/sexo/peso al final por si el modelo la ignora.
    """
    prompt = construir_prompt_generador(subtema, dificultad, referencias or [], identidad_forzada)
    resp = llamar_modelo([prompt, "Genera un caso nuevo siguiendo las reglas. Responde solo con el JSON."], temperature=0.3)

    avisos = []
    caso = None
    error_details = None

    if not resp.es_mock:
        try:
            caso = parsear_json(resp.texto)
        except Exception as exc:  # noqa: BLE001
            error_details = f"El caso clinico devuelto no es JSON valido: {exc}"
        else:
            errores = validar_caso(caso)
            if errores:
                error_details = f"Caso clinico incompleto o con formato incorrecto. Campos invalidos: {', '.join(errores)}"
                caso = None

    if caso is None:
        caso = mock.caso_demo(subtema, dificultad)
        if identidad_forzada:
            caso["datos_paciente"].update({
                "nombre": identidad_forzada["nombre"], "edad": identidad_forzada["edad"],
                "sexo": identidad_forzada["sexo"], "peso_kg": identidad_forzada.get("peso_kg") or caso["datos_paciente"]["peso_kg"],
            })
            for campo in ("documento", "telefono", "tipo_sangre", "ocupacion", "avatar_url"):
                if identidad_forzada.get(campo):
                    caso["datos_paciente"][campo] = identidad_forzada[campo]
        if not caso["datos_paciente"].get("avatar_url"):
            caso["datos_paciente"]["avatar_url"] = avatar_url_por_defecto(
                caso["datos_paciente"]["nombre"], caso["datos_paciente"]["sexo"]
            )
        return _finalizar_caso(
            caso, subtema, dificultad, avisos,
            provider_used="Mock", model_used=None,
            is_mock=True, error_details=error_details or resp.error,
        )

    avisos.extend(validar_signos_vitales(caso.get("signos_vitales")))

    if identidad_forzada:
        sexo = identidad_forzada["sexo"]
        caso["datos_paciente"]["nombre"] = identidad_forzada["nombre"]
        caso["datos_paciente"]["edad"] = identidad_forzada["edad"]
        caso["datos_paciente"]["sexo"] = sexo
        if identidad_forzada.get("peso_kg"):
            caso["datos_paciente"]["peso_kg"] = identidad_forzada["peso_kg"]
    else:
        sexo = "F" if normalizar((caso["datos_paciente"] or {}).get("sexo", "")).startswith("f") else "M"
        caso["datos_paciente"]["sexo"] = sexo
        nombre, se_asigno = asignar_nombre_si_falta(caso["datos_paciente"].get("nombre"), sexo)
        caso["datos_paciente"]["nombre"] = nombre
        if se_asigno:
            avisos.append("Nombre del paciente asignado por el sistema")

    peso = caso["datos_paciente"].get("peso_kg")
    if not isinstance(peso, (int, float)) or isinstance(peso, bool) or not (2 <= peso <= 250):
        edad_dp = caso["datos_paciente"].get("edad")
        edad_dp = edad_dp if isinstance(edad_dp, (int, float)) else 40
        peso = round((60 if sexo == "F" else 70) + max(0, min(edad_dp, 60) - 20) * 0.15, 1)
        avisos.append("Peso del paciente asignado por el sistema (fuera de rango o ausente)")
    caso["datos_paciente"]["peso_kg"] = peso

    # Documento/telefono/tipo de sangre no los escribe el modelo (no afectan
    # la narrativa clinica) -- se pegan tal cual de la identidad pre-generada.
    if identidad_forzada:
        for campo in ("documento", "telefono", "tipo_sangre", "ocupacion", "avatar_url"):
            if identidad_forzada.get(campo):
                caso["datos_paciente"][campo] = identidad_forzada[campo]

    # Respaldo si no vino identidad_forzada (o vino sin avatar_url): igual se
    # arma un avatar humano acorde al sexo, nunca se deja el caso sin avatar.
    if not caso["datos_paciente"].get("avatar_url"):
        caso["datos_paciente"]["avatar_url"] = avatar_url_por_defecto(caso["datos_paciente"]["nombre"], sexo)

    if not isinstance(caso.get("id_caso"), str) or not caso["id_caso"]:
        caso["id_caso"] = "GI-" + uuid.uuid4().hex[:8].upper()

    caso["subtema"] = subtema
    caso["dificultad_asignada"] = dificultad

    caso["examen_fisico_alterado"] = solo_claves_del_catalogo(
        caso.get("examen_fisico_alterado"), CATALOGO_EXAMEN_FISICO, ["signos_vitales"], avisos, "Hallazgo de examen fisico"
    )
    caso["paraclinicos_alterados"] = solo_claves_del_catalogo(
        caso.get("paraclinicos_alterados"), CATALOGO_PARACLINICOS, [], avisos, "Paraclinico"
    )

    caso["examen_fisico"] = {
        clave: caso["examen_fisico_alterado"].get(clave) or d["normal"]
        for clave, d in CATALOGO_EXAMEN_FISICO.items() if clave != "signos_vitales"
    }
    caso["paraclinicos"] = {}
    seed_paraclinicos = caso["datos_paciente"].get("documento") or caso["id_caso"]
    for clave, d in CATALOGO_PARACLINICOS.items():
        if clave == "prueba_embarazo" and sexo == "M":
            normal = "No aplica: paciente de sexo masculino."
        else:
            normal = valor_normal_paraclinico(clave, seed_paraclinicos, sexo)
        caso["paraclinicos"][clave] = caso["paraclinicos_alterados"].get(clave) or normal

    todas_claves = set(CATALOGO_EXAMEN_FISICO) | set(CATALOGO_PARACLINICOS)
    rubrica = caso.setdefault("rubrica_evaluacion", {})
    pertinentes_orig = rubrica.get("examenes_pertinentes") or []
    pertinentes = list(dict.fromkeys(c for c in pertinentes_orig if c in todas_claves))
    if not pertinentes:
        pertinentes = ["signos_vitales", "palpacion_profunda"] + list(caso["paraclinicos_alterados"].keys())[:2]
        avisos.append("examenes_pertinentes vacio o fuera de catalogo; se derivo de los hallazgos alterados")
    rubrica["examenes_pertinentes"] = pertinentes

    caso["estado_emocional_inicial"] = estado_emocional_valido(caso.get("estado_emocional_inicial"))

    return _finalizar_caso(
        caso, subtema, dificultad, avisos,
        provider_used=resp.proveedor, model_used=resp.modelo, is_mock=False, error_details=None,
    )


def _finalizar_caso(caso, subtema, dificultad, avisos, provider_used, model_used, is_mock, error_details) -> dict:
    presentacion, guardrail_saludo_activado = guardrail_saludo(caso["presentacion_inicial"], caso.get("sintomas_principales") or [])
    caso["presentacion_inicial"] = presentacion

    system_prompt_paciente = construir_system_prompt_paciente(caso)

    return {
        "is_mock": is_mock,
        "provider_used": provider_used,
        "model_used": model_used,
        "error_details": error_details,
        "caso_completo_oculto": caso,
        "system_prompt_paciente": system_prompt_paciente,
        "catalogo_exploracion": _CATALOGO_EXPLORACION,
        "id_caso": caso["id_caso"],
        "subtema": subtema,
        "dificultad": dificultad,
        "paciente": {"nombre": caso["datos_paciente"]["nombre"]},
        "estado_emocional_inicial": caso["estado_emocional_inicial"],
        "presentacion_inicial": caso["presentacion_inicial"],
        "meta": {
            "guardrail_saludo_activado": guardrail_saludo_activado,
            "avisos": avisos,
        },
    }


# ---------------------------------------------------------------------------
# Agente 2 — Paciente virtual
# ---------------------------------------------------------------------------

def chat(system_prompt_paciente: str, caso_completo_oculto: dict, historial: list, mensaje_estudiante: str) -> dict:
    """historial: lista de {"role": "user"|"assistant", "content": str}
    (turnos previos, sin incluir el mensaje actual). Devuelve
    respuesta_paciente / estado_emocional / consulta_terminada / guardrails."""
    mensaje_estudiante = (mensaje_estudiante or "").strip()

    turnos_validos = [
        m for m in (historial or [])
        if m and m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str)
    ][-60:]

    texto_historial = "\n".join(
        ("Estudiante: " if m["role"] == "user" else "Paciente: ") + m["content"] for m in turnos_validos
    )
    parte_usuario = (texto_historial + "\n" if texto_historial else "") + f"Estudiante: {mensaje_estudiante}"

    resp = llamar_modelo([system_prompt_paciente, parte_usuario], temperature=0.4)

    if resp.es_mock:
        turno = sum(1 for m in turnos_validos if m["role"] == "user")
        demo = mock.respuesta_demo(turno)
        return {
            "is_mock": True,
            "provider_used": "Mock",
            "model_used": None,
            "error_details": resp.error,
            "respuesta_paciente": demo["mensaje"],
            "estado_emocional": demo["estado_emocional"],
            "consulta_terminada": demo["consulta_terminada"],
            "guardrails": [],
            "formato_valido": True,
        }

    formato_valido = True
    try:
        parsed = parsear_json(resp.texto)
        if not isinstance(parsed.get("mensaje"), str) or not parsed["mensaje"].strip():
            raise ValueError("sin mensaje")
        mensaje = parsed["mensaje"].strip()
        consulta_terminada = parsed.get("consulta_terminada") is True
        estado = normalizar(parsed.get("estado_emocional", "")).strip()
        from app.services.simulador.catalogo import ESTADOS_EMOCIONALES
        estado_emocional = estado if estado in ESTADOS_EMOCIONALES else None
    except Exception:  # noqa: BLE001
        formato_valido = False
        mensaje = (resp.texto or "").strip()
        consulta_terminada = False
        estado_emocional = None

    diagnostico_real = (caso_completo_oculto or {}).get("diagnostico_real")
    mensaje, guardrails = aplicar_guardrails_paciente(mensaje, diagnostico_real)
    if guardrails:
        consulta_terminada = False

    return {
        "is_mock": False,
        "provider_used": resp.proveedor,
        "model_used": resp.modelo,
        "error_details": None,
        "respuesta_paciente": mensaje,
        "estado_emocional": estado_emocional,
        "consulta_terminada": consulta_terminada,
        "guardrails": guardrails,
        "formato_valido": formato_valido,
    }


# ---------------------------------------------------------------------------
# Herramienta de exploracion clinica — determinista, sin llamar al modelo
# ---------------------------------------------------------------------------

class ExploracionInvalida(ValueError):
    pass


def explorar(caso_completo_oculto: dict, tipo: str, clave: str) -> dict:
    if not caso_completo_oculto or not isinstance(caso_completo_oculto, dict):
        raise ExploracionInvalida("Falta el caso clinico de esta consulta.")

    catalogo = CATALOGO_EXAMEN_FISICO if tipo == "examen_fisico" else (CATALOGO_PARACLINICOS if tipo == "paraclinico" else None)
    if catalogo is None:
        raise ExploracionInvalida("El campo tipo debe ser 'examen_fisico' o 'paraclinico'.")

    definicion = catalogo.get(clave)
    if not definicion:
        raise ExploracionInvalida(f"Clave no reconocida para {tipo}: {clave}")

    if clave == "signos_vitales":
        sv = caso_completo_oculto.get("signos_vitales") or {}
        partes = []
        if sv.get("TA"):
            partes.append(f"TA {sv['TA']}")
        if sv.get("FC"):
            partes.append(f"FC {sv['FC']}")
        if sv.get("FR"):
            partes.append(f"FR {sv['FR']}")
        if sv.get("temp"):
            partes.append(f"Temperatura {sv['temp']}")
        if sv.get("SatO2"):
            partes.append(f"SatO2 {sv['SatO2']}")
        resultado = " · ".join(partes)
    elif tipo == "examen_fisico":
        resultado = (caso_completo_oculto.get("examen_fisico") or {}).get(clave) or definicion["normal"]
    else:
        resultado = (caso_completo_oculto.get("paraclinicos") or {}).get(clave) or definicion["normal"]

    requiere_reaccion = definicion.get("contacto") is True
    demora_segundos = (definicion.get("demora") or 4) if tipo == "paraclinico" else 0
    ahora = datetime.now(timezone.utc)
    fecha_hora_toma = ahora.strftime("%d/%m/%Y %I:%M:%S %p")
    fecha_hora_resultado = (ahora + timedelta(seconds=demora_segundos)).strftime("%d/%m/%Y %I:%M:%S %p")

    if tipo == "paraclinico":
        tecnica = definicion.get("tecnica", "Técnica de laboratorio estándar")
        muestra = definicion.get("muestra", "N/A")
    else:
        tecnica = "Toma de signos vitales (monitor multiparámetro)" if clave == "signos_vitales" else "Exploración física directa (inspección/palpación/percusión/auscultación)"
        muestra = None

    return {
        "tipo": tipo,
        "clave": clave,
        "etiqueta": definicion["etiqueta"],
        "resultado": resultado,
        "tecnica": tecnica,
        "muestra": muestra,
        "fecha_hora_toma": fecha_hora_toma,
        "fecha_hora_resultado": fecha_hora_resultado,
        "demora_segundos": demora_segundos,
        "requiere_reaccion_paciente": requiere_reaccion,
        "mensaje_para_paciente": f"[Exploracion fisica: {definicion.get('accion')}]" if requiere_reaccion else None,
    }


# ---------------------------------------------------------------------------
# Agente 3 — Evaluador
# ---------------------------------------------------------------------------

def evaluar(caso_completo_oculto: dict, historial: list, hipotesis: str, diferenciales: list,
            plan: str, notas: str, acciones_clinicas: list, duracion_segundos) -> dict:
    prompt = construir_prompt_evaluador(caso_completo_oculto, historial, hipotesis, diferenciales, plan, notas, acciones_clinicas)
    resp = llamar_modelo([prompt, "Genera la evaluacion en el formato indicado. Responde solo con el JSON."], temperature=0.2)

    if resp.es_mock:
        ev = mock.evaluacion_demo()
        ev = calcular_puntaje(ev, caso_completo_oculto, acciones_clinicas, duracion_segundos)
        return {"is_mock": True, "provider_used": "Mock", "model_used": None, "error_details": resp.error, "evaluacion": ev}

    from app.services.simulador.scoring import validar_evaluacion

    try:
        ev = parsear_json(resp.texto)
        errores = validar_evaluacion(ev)
        if errores:
            raise ValueError(f"Campos invalidos: {', '.join(errores)}")
    except Exception as exc:  # noqa: BLE001
        ev = mock.evaluacion_demo()
        ev = calcular_puntaje(ev, caso_completo_oculto, acciones_clinicas, duracion_segundos)
        return {
            "is_mock": True, "provider_used": "Mock", "model_used": None,
            "error_details": f"La evaluacion devuelta no es utilizable: {exc}", "evaluacion": ev,
        }

    ev = calcular_puntaje(ev, caso_completo_oculto, acciones_clinicas, duracion_segundos)
    return {"is_mock": False, "provider_used": resp.proveedor, "model_used": resp.modelo, "error_details": None, "evaluacion": ev}
