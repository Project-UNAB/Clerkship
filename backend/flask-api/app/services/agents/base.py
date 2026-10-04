"""
Abstract base classes (interfaces) for ClinicAI UNAB AI Agents.

<<<<<<< HEAD
This architecture decouples route handlers and business logic from specific
AI providers (Mock, OpenAI/ChatGPT, Google Gemini, Anthropic, etc.), enabling
seamless transitions to paid LLM APIs when API keys are configured.
=======
This architecture decouples route handlers and business logic from the
concrete provider (Mock / Google Gemini), enabling a seamless transition
to real LLM calls once GEMINI_API_KEY is configured.
>>>>>>> main
"""

from abc import ABC, abstractmethod
from app.schemas.agentes import (
    EvaluateSessionRequest,
    EvaluationResultResponse,
    GenerateCaseRequest,
    GeneratedCaseResponse,
    PatientChatRequest,
    PatientChatResponse,
)


class BaseCaseGeneratorAgent(ABC):
    """
    Agente 1: Generador / Presentador de Casos Clínicos.
    Produces structured clinical vignettes with patient profile, chief complaint,
    history, vital signs, physical examination, and reference ground truth.
    """

    @abstractmethod
    def generate_case(self, request: GenerateCaseRequest) -> GeneratedCaseResponse:
        """Generates or presents a complete clinical case vignette."""
        pass


class BaseVirtualPatientAgent(ABC):
    """
    Agente 2: Paciente Virtual Estandarizado.
    Simulates real-time clinical dialogue during medical interrogation (anamnesis),
    responding in character with appropriate affect, colloquial expressions,
    and clinical consistency.
    """

    @abstractmethod
    def respond_to_student(self, request: PatientChatRequest) -> PatientChatResponse:
        """Produces a conversational patient response given the student's question and history."""
        pass


class BaseClinicalEvaluatorAgent(ABC):
    """
    Agente 3: Tutor Evaluador de Razonamiento Clínico.
    Analyzes session dialogue, diagnostic tests ordered, differential diagnoses,
    and final diagnosis against Ground Truth and dual-process cognitive frameworks.
    """

    @abstractmethod
    def evaluate_session(self, request: EvaluateSessionRequest) -> EvaluationResultResponse:
        """Evaluates student performance across reasoning domains and flags cognitive biases."""
        pass

