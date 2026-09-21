"""
Clinical simulation and consultation Request and Response schemas for Clerkship API.
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import Field
from app.schemas.base import BaseSchema


class CreateConsultationRequest(BaseSchema):
    """Payload to start a simulated clinical consultation."""

    course_id: str = Field(..., description="ID del curso al cual pertenece la simulación")
    title: Optional[str] = Field(None, max_length=150)
    specialty: Optional[str] = Field("Gastroenterología", max_length=100)
    difficulty: Optional[Literal["EASY", "MEDIUM", "HARD"]] = "MEDIUM"
    condition: Optional[str] = Field(
        None,
        max_length=150,
        description="Subtema clínico especifico a forzar (ej. 'Pancreatitis Aguda'). Si se omite, el Agente 1 elige uno al azar entre los subtemas de gastroenterología soportados.",
    )


class ConsultationResponse(BaseSchema):
    """Clinical consultation summary representation."""

    id: str
    student_id: str
    course_id: str
    title: str
    specialty: str
    difficulty: str
    status: Literal["IN_PROGRESS", "COMPLETED", "ABANDONED"] = "IN_PROGRESS"
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    score: Optional[float] = None


class ChatMessage(BaseSchema):
    """Single message in the virtual clinical dialog."""

    sender: Literal["STUDENT", "PATIENT", "SYSTEM"]
    content: str
    timestamp: Optional[str] = None


class SendMessageRequest(BaseSchema):
    """Payload to send a message / question to the virtual patient."""

    content: str = Field(..., min_length=1, description="Pregunta anamnésica o indicación para el paciente")


class SendMessageResponse(BaseSchema):
    """Response returning the recorded student message and patient reply."""

    sent: ChatMessage
    reply: ChatMessage


class ConsultationDetailResponse(ConsultationResponse):
    """Full consultation detail including chat transcript and clinical case metadata."""

    chat_history: List[ChatMessage] = Field(default_factory=list)
    case_details: Dict[str, Any] = Field(default_factory=dict)


class FinishConsultationRequest(BaseSchema):
    """Payload to conclude a clinical consultation and trigger the Agente 3 evaluator."""

    final_diagnosis: Optional[str] = None
    treatment_plan: Optional[str] = None
    differential_diagnoses: List[str] = Field(default_factory=list, description="Diagnósticos diferenciales planteados por el estudiante")
    requested_tests: List[str] = Field(default_factory=list, description="Paraclínicos/exámenes solicitados durante la consulta")


class FinishConsultationResponse(BaseSchema):
    """Response returned upon consultation closure."""

    message: str = "Consulta finalizada con éxito"
    consultation: ConsultationResponse

