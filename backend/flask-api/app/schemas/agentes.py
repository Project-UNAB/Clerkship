"""
Request and Response schemas for ClinicAI UNAB AI Agents (Case Generator, Virtual Patient, Clinical Evaluator).
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import Field
from app.schemas.base import BaseSchema


# ---------------------------------------------------------
# Agente 1: Generador / Presentador de Caso Clínico
# ---------------------------------------------------------

class PatientDemographics(BaseSchema):
    """Demographic profile of the simulated clinical patient."""

    age: int = Field(..., description="Edad del paciente en años")
    gender: Literal["M", "F"] = Field(..., description="Género del paciente")
    occupation: str = Field(..., description="Ocupación o profesión")


class VitalSigns(BaseSchema):
    """Baseline vital signs of the patient."""

    blood_pressure: str = Field(..., description="Presión arterial en mmHg (ej. 120/80)")
    heart_rate: int = Field(..., description="Frecuencia cardíaca en lpm")
    respiratory_rate: int = Field(..., description="Frecuencia respiratoria en rpm")
    temperature: float = Field(..., description="Temperatura corporal en °C")
    oxygen_saturation: int = Field(..., description="Saturación de oxígeno SpO2 %")


class GroundTruth(BaseSchema):
    """Hidden reference standard used later by the evaluator agent."""

    definitive_diagnosis: str = Field(..., description="Diagnóstico definitivo de referencia")
    key_diagnostic_tests: List[str] = Field(default_factory=list, description="Paraclínicos indispensables para confirmación")
    acceptable_differentials: List[str] = Field(default_factory=list, description="Diagnósticos diferenciales pertinentes")
    clinical_summary: str = Field(..., description="Fisiopatología y resumen del cuadro clínico")


class GenerateCaseRequest(BaseSchema):
    """Payload to request the generation or presentation of a clinical case."""

    course_id: Optional[str] = Field(None, description="ID del curso asociado")
    specialty: Optional[str] = Field("Gastroenterología", description="Especialidad clínica")
    difficulty: Optional[Literal["EASY", "MEDIUM", "HARD"]] = Field("MEDIUM", description="Nivel de dificultad")
    condition: Optional[str] = Field(None, description="Patología específica sugerida opcional")


class GeneratedCaseResponse(BaseSchema):
    """Full clinical case vignette produced by Agent 1."""

    case_id: str
    title: str
    specialty: str
    difficulty: str
    demographics: PatientDemographics
    chief_complaint: str
    present_illness: str
    medical_history: Dict[str, Any] = Field(default_factory=dict)
    vital_signs: VitalSigns
    physical_exam: Dict[str, str] = Field(default_factory=dict)
    ground_truth: Optional[GroundTruth] = None
    provider_used: Optional[str] = Field(default="Google Gemini", description="Proveedor de IA utilizado o Mock")
    model_used: Optional[str] = Field(default=None, description="Modelo de lenguaje utilizado")
    is_mock: bool = Field(default=False, description="Indica si la respuesta fue provista por el fallback Mock")
    error_details: Optional[str] = Field(default=None, description="Detalle del error técnico si se activó fallback")
    latency_ms: Optional[float] = Field(default=None, description="Latencia en milisegundos de la llamada")


# ---------------------------------------------------------
# Agente 2: Paciente Virtual Estandarizado
# ---------------------------------------------------------

class PatientChatRequest(BaseSchema):
    """Payload to interrogate the simulated patient during anamnesis."""

    consultation_id: Optional[str] = Field(None, description="ID de la consulta en curso")
    case_id: Optional[str] = Field(None, description="ID del caso clínico asignado (dataset estático de fallback)")
    case_context: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Caso clínico completo (dict de GeneratedCaseResponse, incluye ground_truth) generado "
            "dinámicamente por el Agente 1 para ESTA consulta puntual. Cuando viene presente, tiene "
            "prioridad sobre el dataset estático de `case_id` — así el paciente virtual y el guardrail "
            "de fuga de diagnóstico responden sobre el caso real de la sesión, no uno genérico."
        ),
    )
    message: str = Field(..., min_length=1, max_length=1500, description="Pregunta del estudiante médico")
    chat_history: Optional[List[Dict[str, str]]] = Field(default_factory=list, description="Historial previo de mensajes")


class PatientChatResponse(BaseSchema):
    """Colloquial and clinically consistent reply from Agent 2."""

    reply: str
    emotional_state: str = Field("ansioso", description="Estado emocional del paciente virtual")
    pain_scale_reported: Optional[int] = Field(None, description="Intensidad de dolor percibida en escala 1-10")
    consultation_id: Optional[str] = None
    timestamp: str
    guardrail_activado: bool = Field(
        default=False,
        description="true si el modelo intento revelar el diagnostico real y el guardrail determinista lo interceptó.",
    )
    provider_used: Optional[str] = Field(default="Google Gemini", description="Proveedor de IA utilizado o Mock")
    model_used: Optional[str] = Field(default=None, description="Modelo de lenguaje utilizado")
    is_mock: bool = Field(default=False, description="Indica si la respuesta fue provista por el fallback Mock")
    error_details: Optional[str] = Field(default=None, description="Detalle del error técnico si se activó fallback")
    latency_ms: Optional[float] = Field(default=None, description="Latencia en milisegundos de la llamada")


# ---------------------------------------------------------
# Agente 3: Tutor Evaluador de Razonamiento Clínico
# ---------------------------------------------------------

class CognitiveBias(BaseSchema):
    """Assessment of cognitive biases according to dual-process theory."""

    bias_name: str = Field(..., description="Nombre del sesgo (ej. Anclaje, Cierre Prematuro, Confirmación)")
    detected: bool = Field(..., description="Indica si el sesgo fue observado en el razonamiento")
    explanation: Optional[str] = Field(None, description="Evidencia o justificación de la decisión del estudiante")


class DomainScores(BaseSchema):
    """Quantitative performance breakdown across clinical reasoning domains (0 - 100)."""

    anamnesis: float = Field(..., description="Calidad y completitud del interrogatorio clínico")
    diagnostic_tests: float = Field(..., description="Pertinencia y costo-efectividad de exámenes solicitados")
    differential_hypotheses: float = Field(..., description="Pertinencia de hipótesis planteadas")
    final_diagnosis: float = Field(..., description="Acierto y argumentación del diagnóstico final")


class EvaluateSessionRequest(BaseSchema):
    """Payload to trigger the post-simulation evaluation by Agent 3."""

    consultation_id: Optional[str] = Field(None, description="ID de la consulta")
    case_id: Optional[str] = Field(None, description="ID del caso clínico evaluado (dataset estático de fallback)")
    case_context: Optional[Dict[str, Any]] = Field(
        None,
        description="Caso clínico completo (incluye ground_truth) generado para ESTA consulta — tiene prioridad sobre case_id.",
    )
    chat_history: List[Dict[str, str]] = Field(default_factory=list, description="Transcripción completa del diálogo")
    requested_tests: List[str] = Field(default_factory=list, description="Lista de exámenes de laboratorio o imágenes solicitados")
    differential_diagnoses: List[str] = Field(default_factory=list, description="Diagnósticos diferenciales planteados")
    final_diagnosis: str = Field(..., min_length=1, description="Diagnóstico definitivo propuesto por el estudiante")


class EvaluationResultResponse(BaseSchema):
    """Formative evaluation rubric and cognitive feedback from Agent 3."""

    consultation_id: Optional[str] = None
    final_score: float = Field(..., description="Puntaje global consolidado (0 - 100)")
    domain_scores: DomainScores
    detected_biases: List[CognitiveBias] = Field(default_factory=list)
    feedback_summary: str
    strengths: List[str] = Field(default_factory=list)
    areas_for_improvement: List[str] = Field(default_factory=list)
    comparison_with_ground_truth: Dict[str, Any] = Field(default_factory=dict)
    provider_used: Optional[str] = Field(default="Google Gemini", description="Proveedor de IA utilizado o Mock")
    model_used: Optional[str] = Field(default=None, description="Modelo de lenguaje utilizado")
    is_mock: bool = Field(default=False, description="Indica si la respuesta fue provista por el fallback Mock")
    error_details: Optional[str] = Field(default=None, description="Detalle del error técnico si se activó fallback")
    latency_ms: Optional[float] = Field(default=None, description="Latencia en milisegundos de la llamada")

