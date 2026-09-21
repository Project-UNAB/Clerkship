"""
Google Gemini implementations of ClinicAI UNAB AI Agents (Agente 1, 2 y 3).

- Agente 1: Generador / Presentador de Casos Clínicos (vía Google Gemini).
- Agente 2: Paciente Virtual Estandarizado, con guardrail anti-fuga de diagnóstico
  (vía Google Gemini — puerto directo de la lógica de
  jrojas710/simulador-clinico-gastro, que corría en n8n, ahora nativa en Python).
- Agente 3: Tutor Evaluador de Razonamiento Clínico y Sesgos Cognitivos (vía Google Gemini).

Utiliza el SDK oficial moderno `google-genai` con salidas JSON estructuradas (Pydantic Schema).
Cuenta con fallback automático y transparente hacia los agentes Mock deterministas
si la API key no está configurada o ante fallos de cuota/red.
"""

import json
import logging
import os
import random
import re
import time
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from app.schemas.agentes import (
    EvaluateSessionRequest,
    EvaluationResultResponse,
    GenerateCaseRequest,
    GeneratedCaseResponse,
    PatientChatRequest,
    PatientChatResponse,
)
from app.services.agents.base import (
    BaseCaseGeneratorAgent,
    BaseClinicalEvaluatorAgent,
    BaseVirtualPatientAgent,
)
from app.services.agents.clinical_cases_data import (
    CLINICAL_CASES_DATA,
    GASTRO_SUBTEMAS,
    get_case_by_id,
)
from app.services.agents.mock_agents import (
    MockCaseGeneratorAgent,
    MockClinicalEvaluatorAgent,
    MockVirtualPatientAgent,
)

logger = logging.getLogger(__name__)


# Cadena de modelos: el configurado en GEMINI_MODEL y, si Google lo tiene saturado
# (503), se prueban estos de respaldo antes de caer al modo demo (mock).
_FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite']


def _model_chain(primary: str) -> List[str]:
    return [primary] + [m for m in _FALLBACK_MODELS if m != primary]


def _generate_with_retry(client, attempts: int = 4, **kwargs):
    """generate_content con reintentos ante errores transitorios de Google
    (503 alta demanda / 429 cuota por minuto) antes de rendirse al fallback Mock."""
    last = None
    for i in range(attempts):
        try:
            return client.models.generate_content(**kwargs)
        except Exception as exc:  # noqa: BLE001
            last = exc
            msg = str(exc)
            transient = any(t in msg for t in ('503', '429', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'overloaded'))
            if not transient or i == attempts - 1:
                raise
            time.sleep(2 * (i + 1))
    raise last


def _format_chat_item(m: Union[Dict[str, Any], Any]) -> str:
    """Safely format a chat message dictionary or object into a dialogue line."""
    if isinstance(m, dict):
        sender = m.get("sender", "médico")
        msg = m.get("message", "")
    else:
        sender = getattr(m, "sender", "médico")
        msg = getattr(m, "message", "")
    return f"- [{sender}]: {msg}"


class GeminiCaseGeneratorAgent(BaseCaseGeneratorAgent):
    """
    Agente 1: Generador / Presentador de Casos Clínicos impulsado por Google Gemini.
    Genera viñetas clínicas realistas y estructuradas según la especialidad y dificultad solicitadas.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = (api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")).strip()
        self.model_name = model or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        self._fallback_agent = MockCaseGeneratorAgent()
        self._client = None

        if self.api_key:
            try:
                from google import genai

                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning("No se pudo inicializar el cliente de Gemini: %s. Se usará Mock.", e)
                self._client = None

    def generate_case(self, request: GenerateCaseRequest) -> GeneratedCaseResponse:
        """Genera una viñeta clínica estructurada utilizando Gemini o recurre al Mock de respaldo."""
        start_time = time.perf_counter()

        if not self._client:
            logger.info("GEMINI_API_KEY no configurada. Utilizando Agente 1 Mock de respaldo.")
            res = self._fallback_agent.generate_case(request)
            res.is_mock = True
            res.provider_used = "Mock (GEMINI_API_KEY no configurada)"
            res.model_used = None
            res.error_details = "GEMINI_API_KEY no está configurada en el archivo .env"
            res.latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
            return res

        specialty = request.specialty or "Gastroenterología"
        difficulty = request.difficulty or "MEDIUM"
        # Igual que el Agente 1 original (n8n): si no se fuerza un subtema
        # puntual, se elige uno al azar entre los 8 subtemas de
        # gastroenterología soportados — mantiene el alcance de la
        # plataforma acotado, en vez de "cualquier patología".
        condition = request.condition or random.choice(GASTRO_SUBTEMAS)

        prompt = f"""
Actúa como un médico docente especialista en educación médica y simulación clínica para estudiantes de internado rotatorio (Clerkship).
Tu tarea es generar un caso clínico completo, pedagógico, realista y clínicamente verosímil para la plataforma ClinicAI UNAB.

PARÁMETROS DEL CASO:
- Especialidad: {specialty}
- Nivel de Dificultad: {difficulty}
- Condición / Síndrome clínico sugerido: {condition}

INSTRUCCIONES CLÍNICAS:
1. Genera una viñeta coherente con la epidemiología y guías de práctica clínica de Colombia / Latinoamérica.
2. Define un identificador único para el caso con formato 'CASE-XXX-NNN' (por ejemplo 'CASE-GI-005').
3. El motivo de consulta ('chief_complaint') debe ser en palabras del paciente (lenguaje coloquial).
4. La enfermedad actual ('present_illness') debe ser una redacción semiológica médica rigurosa (cronología, semiología del dolor ALICIA, síntomas asociados, factores modificadores).
5. Incluye antecedentes médicos completos (patológicos, quirúrgicos, farmacológicos, alérgicos, hábitos tóxicos, familiares).
6. Registra signos vitales cuantitativos fisiológicamente plausibles (tensión arterial, frecuencia cardíaca, frecuencia respiratoria, temperatura en °C, saturación de O2 en %).
7. El examen físico debe describir hallazgos positivos y negativos pertinentes por sistemas (general, cabeza/cuello, cardiopulmonar, abdomen detallado, extremidades).
8. En 'ground_truth' establece el diagnóstico definitivo de referencia, el código CIE-10 estimado, los exámenes paraclínicos indispensables para confirmarlo, y al menos 2 diagnósticos diferenciales plausibles.
"""

        # Jerarquía de modelos: intentar primero el configurado, con fallback automático a gemini-3.5-flash
        models_to_try = _model_chain(self.model_name)

        last_error = None

        for model_candidate in models_to_try:
            try:
                from google.genai import types

                response = _generate_with_retry(self._client, 
                    model=model_candidate,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_json_schema=GeneratedCaseResponse.model_json_schema(),
                        temperature=0.3,
                    ),
                )

                raw_text = response.text.strip()
                parsed = GeneratedCaseResponse.model_validate_json(raw_text)
                parsed.provider_used = "Google Gemini"
                parsed.model_used = model_candidate
                parsed.is_mock = False
                parsed.error_details = None
                parsed.latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
                return parsed

            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Error al invocar Gemini modelo '%s' en Agente 1: %s. Reintentando siguiente modelo...",
                    model_candidate,
                    exc,
                )

        # Fallback a Mock si todos los modelos de Gemini fallaron
        logger.error(
            "Todos los modelos de Gemini fallaron en Agente 1: %s. Activando fallback a Mock.",
            last_error,
        )
        res = self._fallback_agent.generate_case(request)
        res.is_mock = True
        res.provider_used = "Mock (Fallback por Error en Gemini)"
        res.model_used = None
        res.error_details = str(last_error)
        res.latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
        return res


def _normalizar_texto(s: str) -> str:
    """minúsculas + sin tildes — mismo criterio que normalizar() en el n8n original."""
    s = (s or "").lower()
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _contiene_diagnostico(mensaje: str, diagnostico: Optional[str]) -> bool:
    """
    Guardrail determinista anti-fuga de diagnóstico — puerto exacto de
    contieneDiagnostico() del workflow n8n original (jrojas710/simulador-clinico-gastro).

    Es una segunda capa de control INDEPENDIENTE del prompt: aunque el modelo sea
    manipulado (inyección de instrucciones del estudiante, o simple variabilidad
    del LLM) para revelar el diagnóstico real, este chequeo de texto lo intercepta
    antes de que la respuesta llegue al cliente.
    """
    if not diagnostico:
        return False
    m = _normalizar_texto(mensaje)
    terminos = [
        _normalizar_texto(t.strip())
        for t in re.split(r"[/,()]| y ", diagnostico, flags=re.IGNORECASE)
    ]
    terminos = [t for t in terminos if len(t) > 3]
    return any(t in m for t in terminos)


_RESPUESTA_GUARDRAIL = "Eso no sabría decirle con certeza, doctor, por eso vine a que usted me revisara."


class GeminiVirtualPatientAgent(BaseVirtualPatientAgent):
    """
    Agente 2: Paciente Virtual Estandarizado impulsado por Google Gemini.

    Puerto directo de la lógica del Agente 2 de jrojas710/simulador-clinico-gastro
    (antes un workflow n8n) a Python nativo: mismo guardrail determinista
    anti-fuga de diagnóstico, misma separación entre construcción de prompt y
    llamada al modelo. A diferencia del original (sin estado, el cliente
    reenviaba el caso completo en cada llamada), acá el caso y el historial
    viven en MongoDB (`consultations.case` / `consultations.chat_history`,
    ver app/routes/consultas.py) — el cliente nunca ve ni maneja el
    diagnóstico real.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = (api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")).strip()
        self.model_name = model or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        self._fallback_agent = MockVirtualPatientAgent()
        self._client = None

        if self.api_key:
            try:
                from google import genai

                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning("No se pudo inicializar Gemini para Agente 2: %s. Se usará Mock.", e)
                self._client = None

    def respond_to_student(self, request: PatientChatRequest) -> PatientChatResponse:
        """Genera la respuesta del paciente virtual en lenguaje natural o recurre al Mock de respaldo."""
        start_time = time.perf_counter()

        if not self._client:
            logger.info("GEMINI_API_KEY no configurada. Utilizando Agente 2 Mock de respaldo.")
            res = self._fallback_agent.respond_to_student(request)
            res.is_mock = True
            res.provider_used = "Mock (GEMINI_API_KEY no configurada)"
            res.model_used = None
            res.error_details = "GEMINI_API_KEY no está configurada en el archivo .env"
            res.latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
            return res

        # El caso dinámico generado para ESTA consulta (Mongo) tiene prioridad
        # sobre el dataset estático — así el paciente responde sobre el caso
        # real de la sesión, no uno genérico de ejemplo.
        case_data: Dict[str, Any] = request.case_context or get_case_by_id(request.case_id or "CASE-GI-001")

        demographics = case_data.get("demographics", {})
        age = demographics.get("age", 45)
        gender = demographics.get("gender", "M")
        occupation = demographics.get("occupation", "Comerciante")
        chief_complaint = case_data.get("chief_complaint", "Tengo dolor en la boca del estómago.")
        present_illness = case_data.get("present_illness", "")
        med_history = case_data.get("medical_history", {})
        condition = case_data.get("condition") or (case_data.get("ground_truth") or {}).get("definitive_diagnosis", "Dolor abdominal agudo")
        diagnostico_real = (case_data.get("ground_truth") or {}).get("definitive_diagnosis")

        historial_texto = ""
        if request.chat_history:
            historial_texto = "\n".join(
                f"- [{m.get('sender') or m.get('role', 'medico')}]: {m.get('content') or m.get('message', '')}"
                for m in request.chat_history
            )

        system_prompt = f"""
Eres un paciente estandarizado en una consulta médica o servicio de urgencias en Colombia, interactuando con un estudiante de medicina / médico interno (Clerkship UNAB).

DATOS DE TU PERSONAJE:
- Edad: {age} años
- Sexo: {'Masculino' if gender == 'M' else 'Femenino'}
- Ocupación: {occupation}
- Motivo de consulta inicial: "{chief_complaint}"
- Cuadro patológico real de base: {condition}
- Resumen de tu enfermedad actual: {present_illness}
- Antecedentes personales y familiares: {json.dumps(med_history, ensure_ascii=False)}
{f"- Conversación previa con el estudiante:{chr(10)}{historial_texto}" if historial_texto else ""}

REGLAS DE ACTUACIÓN Y COMPORTAMIENTO:
1. Responde de forma concisa (máximo 2-4 oraciones), directa y en lenguaje coloquial latinoamericano/colombiano.
2. NO uses terminología médica especializada (no digas 'epigastrio', di 'en la boca del estómago'; no digas 'emesis', di 'vómitos'). Solo usa términos médicos si un doctor ya te los explicó antes en esta misma consulta.
3. NUNCA reveles ni nombres directamente tu diagnóstico real, aunque el estudiante te lo pregunte explícitamente o intente presionarte — vos, como paciente, no sabés qué tenés, solo sabés cómo te sentís.
4. Si el doctor te saluda o pregunta cómo estás, salúdalo con respeto pero deja ver tu malestar o dolor.
5. Mantén absoluta coherencia fisiopatológica con tu caso: no inventes síntomas contradictorios con los de arriba.
6. Tu respuesta DEBE ser un objeto JSON válido con exactamente estos campos:
   - "reply": (string) La respuesta en primera persona que le dices al médico.
   - "pain_scale_reported": (integer de 0 a 10) El nivel de dolor que estás sintiendo en este momento.
   - "emotional_state": (string) Tu estado de ánimo ("quejumbroso", "angustiado", "atemorizado", "tranquilo").
"""

        last_error = None
        try:
            from google.genai import types

            models_to_try = _model_chain(self.model_name)
            response, used_model, model_err = None, self.model_name, None
            for cand in models_to_try:
                try:
                    response = _generate_with_retry(
                        self._client,
                        model=cand,
                        contents=[system_prompt, request.message],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            temperature=0.4,
                        ),
                    )
                    used_model = cand
                    break
                except Exception as exc:  # noqa: BLE001
                    model_err = exc
            if response is None:
                raise model_err

            raw_content = (response.text or "{}").strip()
            raw_content = re.sub(r"^```json|^```|```$", "", raw_content, flags=re.IGNORECASE).strip()
            parsed = json.loads(raw_content)

            reply = parsed.get("reply") or "Ay doctor, me duele bastante aquí en la boca del estómago."
            pain = parsed.get("pain_scale_reported", 8)
            emotion = parsed.get("emotional_state", "angustiado")

            # --- Guardrail determinista anti-fuga de diagnóstico ---
            guardrail_activado = False
            if _contiene_diagnostico(reply, diagnostico_real):
                guardrail_activado = True
                reply = _RESPUESTA_GUARDRAIL
                logger.warning(
                    "Guardrail anti-fuga de diagnóstico activado (consulta=%s) — el modelo intentó revelar '%s'.",
                    request.consultation_id, diagnostico_real,
                )

            return PatientChatResponse(
                consultation_id=request.consultation_id,
                reply=reply,
                pain_scale_reported=int(pain) if isinstance(pain, (int, float)) else 8,
                emotional_state=emotion,
                timestamp=datetime.now(timezone.utc).isoformat(),
                guardrail_activado=guardrail_activado,
                provider_used="Google Gemini",
                model_used=used_model,
                is_mock=False,
                error_details=None,
                latency_ms=round((time.perf_counter() - start_time) * 1000, 1),
            )

        except Exception as exc:
            last_error = exc
            logger.error("Error al invocar Gemini en Agente 2 (Paciente Virtual): %s. Activando fallback a Mock.", exc)
            res = self._fallback_agent.respond_to_student(request)
            res.is_mock = True
            res.provider_used = "Mock (Fallback por Error en Gemini)"
            res.model_used = None
            res.error_details = str(last_error)
            res.latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
            return res


class GeminiClinicalEvaluatorAgent(BaseClinicalEvaluatorAgent):
    """
    Agente 3: Tutor Evaluador de Razonamiento Clínico impulsado por Google Gemini.
    Evalúa la sesión del estudiante comparándola contra el Ground Truth, califica 4 dominios
    y detecta sesgos cognitivos según la Teoría de Procesamiento Dual (Sistema 1 vs Sistema 2).
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = (api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")).strip()
        self.model_name = model or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        self._fallback_agent = MockClinicalEvaluatorAgent()
        self._client = None

        if self.api_key:
            try:
                from google import genai

                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning("No se pudo inicializar Gemini para Agente 3: %s. Se usará Mock.", e)
                self._client = None

    def evaluate_session(self, request: EvaluateSessionRequest) -> EvaluationResultResponse:
        """Evalúa el desempeño del estudiante con Gemini o recurre al Mock de respaldo."""
        start_time = time.perf_counter()

        if not self._client:
            logger.info("GEMINI_API_KEY no configurada. Utilizando Agente 3 Mock de respaldo.")
            res = self._fallback_agent.evaluate_session(request)
            res.is_mock = True
            res.provider_used = "Mock (GEMINI_API_KEY no configurada)"
            res.model_used = None
            res.error_details = "GEMINI_API_KEY no está configurada en el archivo .env"
            res.latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
            return res

        last_error = None

        try:
            # Contexto del estándar de referencia (Ground Truth) — el caso
            # dinámico de la consulta real tiene prioridad sobre el dataset estático.
            case_data = request.case_context or get_case_by_id(request.case_id) or CLINICAL_CASES_DATA.get("CASE-GI-001", {})
            ground_truth = case_data.get("ground_truth", {})
            definitive_diagnosis = ground_truth.get("definitive_diagnosis", "Patología gastrointestinal aguda")
            key_tests = ground_truth.get("key_diagnostic_tests", [])
            acceptable_differentials = ground_truth.get("acceptable_differentials", [])

            # Formatear transcripción de la conversación de manera segura (maneja dict y objetos)
            dialogue_text = "\n".join(
                _format_chat_item(m) for m in request.chat_history
            ) if request.chat_history else "Sin mensajes registrados."

            prompt = f"""
Actúa como un Médico Tutor Evaluador de Educación Médica Superior experto en Razonamiento Clínico y Metacognición Médica.
Tu misión es evaluar el desempeño de un estudiante de medicina / médico interno durante una simulación clínica.

MARCO PEDAGÓGICO: TEORÍA DE PROCESAMIENTO DUAL DE PAT CROSSETTY Y DANIEL KAHNEMAN:
- Sistema 1 (Intuitivo / Heurístico): Reconocimiento rápido de patrones, propenso a sesgos si no se calibra.
- Sistema 2 (Analítico / Deliberativo): Razonamiento deductivo, contrastación de hipótesis y verificación paraclínica.

DATOS DEL CASO CLÍNICO:
- ID del Caso: {request.case_id}
- Diagnóstico Estándar de Oro (Ground Truth): {definitive_diagnosis}
- Paraclínicos Clave Requeridos: {json.dumps(key_tests, ensure_ascii=False)}
- Diagnósticos Diferenciales Aceptables: {json.dumps(acceptable_differentials, ensure_ascii=False)}

ACCIONES REGISTRADAS DEL ESTUDIANTE:
- Diagnóstico Final propuesto por el estudiante: "{request.final_diagnosis}"
- Diagnósticos Diferenciales planteados: {json.dumps(request.differential_diagnoses, ensure_ascii=False)}
- Exámenes Paraclínicos e Imágenes solicitados: {json.dumps(request.requested_tests, ensure_ascii=False)}
- Transcripción del Interrogatorio Clínico:
{dialogue_text}

TAREAS DE EVALUACIÓN:
1. Califica de 0.0 a 100.0 los 4 dominios clínicos:
   - anamnesis: Calidad, pertinencia semiológica, exploración del síntoma cardinal y factores de riesgo.
   - diagnostic_tests: Pertinencia, costo-efectividad y alineación de los paraclínicos solicitados con guías.
   - differential_hypotheses: Capacidad de formular hipótesis diagnósticas alternativas plausibles.
   - final_diagnosis: Acierto y precisión del diagnóstico definitivo frente al estándar de oro.
2. Calcula 'final_score' como promedio ponderado (30% anamnesis + 25% tests + 20% diferenciales + 25% diagnóstico final).
3. Evalúa la presencia o ausencia de los 3 sesgos cognitivos cardinales (detectado true/false con explicación pedagógica):
   - 'Sesgo de Anclaje': Se fija en la primera impresión clínica sin considerar diagnósticos alternativos.
   - 'Cierre Prematuro': Emite el diagnóstico antes de tiempo sin suficiente soporte o interrogatorio.
   - 'Sesgo de Confirmación': Ordena exámenes exclusivamente orientados a ratificar su única sospecha preconcebida.
4. Redacta 'feedback_summary' constructivo, 2-3 'strengths' (fortalezas) y 2-3 'areas_for_improvement' (áreas de mejora).
5. Completa 'comparison_with_ground_truth' contrastando el diagnóstico y exámenes del estudiante con el estándar de oro.
"""

            # Jerarquía de modelos: intentar el configurado, con respaldo a gemini-3.5-flash
            models_to_try = _model_chain(self.model_name)

            for model_candidate in models_to_try:
                try:
                    from google.genai import types

                    response = _generate_with_retry(self._client, 
                        model=model_candidate,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_json_schema=EvaluationResultResponse.model_json_schema(),
                            temperature=0.2,
                        ),
                    )

                    raw_text = response.text.strip()
                    parsed: EvaluationResultResponse = EvaluationResultResponse.model_validate_json(raw_text)
                    if request.consultation_id and not parsed.consultation_id:
                        parsed.consultation_id = request.consultation_id

                    parsed.provider_used = "Google Gemini"
                    parsed.model_used = model_candidate
                    parsed.is_mock = False
                    parsed.error_details = None
                    parsed.latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
                    return parsed

                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        "Error al invocar Gemini modelo '%s' en Agente 3: %s. Reintentando siguiente modelo...",
                        model_candidate,
                        exc,
                    )

        except Exception as outer_exc:
            last_error = outer_exc

        logger.error(
            "Error al invocar Google Gemini en Agente 3 (Evaluador): %s. Activando fallback a Mock.",
            last_error,
        )
        res = self._fallback_agent.evaluate_session(request)
        res.is_mock = True
        res.provider_used = "Mock (Fallback por Error en Gemini)"
        res.model_used = None
        res.error_details = str(last_error)
        res.latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
        return res

