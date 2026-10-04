"""
AI Agents Service Package for ClinicAI UNAB.

Provides singleton factory accessors for:
- Agente 1: Case Generator / Presenter (Google Gemini / Mock)
<<<<<<< HEAD
- Agente 2: Virtual Patient Simulator (ChatGPT / OpenAI / Mock)
- Agente 3: Clinical Reasoning Evaluator (Google Gemini / Mock)
=======
- Agente 2: Virtual Patient Simulator (Google Gemini / Mock)
- Agente 3: Clinical Reasoning Evaluator (Google Gemini / Mock)

Los 3 agentes están adoptados de jrojas710/simulador-clinico-gastro (antes un
workflow n8n, un único proveedor Gemini) — portados a clases Python nativas
en gemini_agents.py, con persistencia real en Postgres/Mongo en vez del
diseño original sin estado. Proveedor principal: Gemini; si está saturado se usa
OpenRouter (openrouter_fallback.py) como respaldo antes de caer al mock.
>>>>>>> main
"""

import os
from app.services.agents.base import (
    BaseCaseGeneratorAgent,
    BaseClinicalEvaluatorAgent,
    BaseVirtualPatientAgent,
)
from app.services.agents.gemini_agents import (
    GeminiCaseGeneratorAgent,
    GeminiClinicalEvaluatorAgent,
<<<<<<< HEAD
=======
    GeminiVirtualPatientAgent,
>>>>>>> main
)
from app.services.agents.mock_agents import (
    MockCaseGeneratorAgent,
    MockClinicalEvaluatorAgent,
    MockVirtualPatientAgent,
)
<<<<<<< HEAD
from app.services.agents.openai_agents import (
    OpenAIVirtualPatientAgent,
)
=======
>>>>>>> main

# Singletons for mock agents
_mock_case_generator = MockCaseGeneratorAgent()
_mock_virtual_patient = MockVirtualPatientAgent()
_mock_clinical_evaluator = MockClinicalEvaluatorAgent()

# Singletons for real LLM agents (with built-in fallback to mock)
_gemini_case_generator = GeminiCaseGeneratorAgent()
<<<<<<< HEAD
_openai_virtual_patient = OpenAIVirtualPatientAgent()
=======
_gemini_virtual_patient = GeminiVirtualPatientAgent()
>>>>>>> main
_gemini_clinical_evaluator = GeminiClinicalEvaluatorAgent()


def get_case_generator_agent() -> BaseCaseGeneratorAgent:
    """
    Returns an instance of Case Generator Agent (Agente 1).
<<<<<<< HEAD
    Uses Google Gemini when AI_AGENT_PROVIDER is 'hybrid' or 'gemini',
    falling back to Mock if unconfigured or on error.
    """
    provider = os.getenv("AI_AGENT_PROVIDER", "hybrid").lower()
    if provider in ("hybrid", "gemini"):
        return _gemini_case_generator
    return _mock_case_generator
=======
    Uses Google Gemini unless AI_AGENT_PROVIDER='mock', que fuerza el
    determinista (sin gastar cuota ni requerir credenciales).
    """
    provider = os.getenv("AI_AGENT_PROVIDER", "gemini").lower()
    if provider == "mock":
        return _mock_case_generator
    return _gemini_case_generator
>>>>>>> main


def get_virtual_patient_agent() -> BaseVirtualPatientAgent:
    """
<<<<<<< HEAD
    Returns an instance of Virtual Patient Agent (Agente 2).
    Uses ChatGPT / OpenAI when AI_AGENT_PROVIDER is 'hybrid' or 'openai',
    falling back to Mock if unconfigured or on error.
    """
    provider = os.getenv("AI_AGENT_PROVIDER", "hybrid").lower()
    if provider in ("hybrid", "openai"):
        return _openai_virtual_patient
    return _mock_virtual_patient
=======
    Returns an instance of Virtual Patient Agent (Agente 2), con guardrail
    anti-fuga de diagnóstico. Uses Google Gemini unless AI_AGENT_PROVIDER='mock'.
    """
    provider = os.getenv("AI_AGENT_PROVIDER", "gemini").lower()
    if provider == "mock":
        return _mock_virtual_patient
    return _gemini_virtual_patient
>>>>>>> main


def get_clinical_evaluator_agent() -> BaseClinicalEvaluatorAgent:
    """
    Returns an instance of Clinical Evaluator Agent (Agente 3).
<<<<<<< HEAD
    Uses Google Gemini when AI_AGENT_PROVIDER is 'hybrid' or 'gemini',
    falling back to Mock if unconfigured or on error.
    """
    provider = os.getenv("AI_AGENT_PROVIDER", "hybrid").lower()
    if provider in ("hybrid", "gemini"):
        return _gemini_clinical_evaluator
    return _mock_clinical_evaluator
=======
    Uses Google Gemini unless AI_AGENT_PROVIDER='mock'.
    """
    provider = os.getenv("AI_AGENT_PROVIDER", "gemini").lower()
    if provider == "mock":
        return _mock_clinical_evaluator
    return _gemini_clinical_evaluator
>>>>>>> main


__all__ = [
    "BaseCaseGeneratorAgent",
    "BaseVirtualPatientAgent",
    "BaseClinicalEvaluatorAgent",
    "MockCaseGeneratorAgent",
    "MockVirtualPatientAgent",
    "MockClinicalEvaluatorAgent",
    "GeminiCaseGeneratorAgent",
<<<<<<< HEAD
    "GeminiClinicalEvaluatorAgent",
    "OpenAIVirtualPatientAgent",
=======
    "GeminiVirtualPatientAgent",
    "GeminiClinicalEvaluatorAgent",
>>>>>>> main
    "get_case_generator_agent",
    "get_virtual_patient_agent",
    "get_clinical_evaluator_agent",
]
