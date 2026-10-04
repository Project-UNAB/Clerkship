"""
Comprehensive test suite for ClinicAI UNAB AI Agents.

Validates:
1. Agente 1 (Case Generator): Structured vignettes, conditions, difficulties, and Ground Truth.
2. Agente 2 (Virtual Patient): Colloquial dialogue, intent matching, emotional states, and pain scale.
3. Agente 3 (Clinical Evaluator): Domain scoring (0-100), Dual-Process theory, and Cognitive Biases.
4. Endpoints HTTP API: Status codes, Pydantic validation, RBAC/JWT, and integration with simulation flow.
"""

from flask_jwt_extended import create_access_token
import pytest

from app.schemas.agentes import (
    EvaluateSessionRequest,
    EvaluationResultResponse,
    GenerateCaseRequest,
    GeneratedCaseResponse,
    PatientChatRequest,
    PatientChatResponse,
)
from app.services.agents import (
    get_case_generator_agent,
    get_clinical_evaluator_agent,
    get_virtual_patient_agent,
)


@pytest.fixture
def auth_headers(app):
    """Fixture providing valid JWT headers for authenticated requests."""
    with app.app_context():
        token = create_access_token(
            identity="55555555-5555-5555-5555-555555555555",
            additional_claims={"role": "STUDENT"},
        )
    return {"Authorization": f"Bearer {token}"}


# =============================================================================
# 1. UNIT TESTS: Agente 1 (Generador de Casos Clínicos)
# =============================================================================

def test_case_generator_default():
    """Generates the default gastrointestinal case with complete structure."""
    agent = get_case_generator_agent()
    response = agent.generate_case(GenerateCaseRequest())

    assert isinstance(response, GeneratedCaseResponse)
    assert response.case_id == "CASE-GI-001"
    assert "Pancreatitis" in response.title or "Pancreatitis" in response.ground_truth.definitive_diagnosis
    assert response.specialty == "Gastroenterología"
    assert response.demographics.gender in ("M", "F")
    assert response.demographics.age > 0
    assert response.vital_signs.heart_rate > 0
    assert response.vital_signs.blood_pressure != ""
    assert response.chief_complaint != ""
    assert response.present_illness != ""
    assert response.physical_exam != {}
    assert response.ground_truth is not None
    assert len(response.ground_truth.key_diagnostic_tests) > 0
    assert len(response.ground_truth.acceptable_differentials) > 0


def test_case_generator_by_condition():
    """Generates specific cases by filtering by medical condition."""
    agent = get_case_generator_agent()

    # Case 2: Apendicitis
    case_appendicitis = agent.generate_case(GenerateCaseRequest(condition="Apendicitis"))
    assert case_appendicitis.case_id == "CASE-GI-002"
    assert "Apendicitis" in case_appendicitis.ground_truth.definitive_diagnosis

    # Case 3: Hemorragia / Sangrado
    case_bleeding = agent.generate_case(GenerateCaseRequest(condition="Hemorragia"))
    assert case_bleeding.case_id == "CASE-GI-003"
    assert "Hemorragia" in case_bleeding.ground_truth.definitive_diagnosis

    # Case 4: Colecistitis
    case_cholecystitis = agent.generate_case(GenerateCaseRequest(condition="Colecistitis"))
    assert case_cholecystitis.case_id == "CASE-GI-004"
    assert "Colecistitis" in case_cholecystitis.ground_truth.definitive_diagnosis


def test_case_generator_by_difficulty():
    """Generates cases filtered by difficulty rating."""
    agent = get_case_generator_agent()

    easy_case = agent.generate_case(GenerateCaseRequest(difficulty="EASY"))
    assert easy_case.difficulty == "EASY"
    assert easy_case.case_id == "CASE-GI-002"

    hard_case = agent.generate_case(GenerateCaseRequest(difficulty="HARD"))
    assert hard_case.difficulty == "HARD"
    assert hard_case.case_id == "CASE-GI-003"


# =============================================================================
# 2. UNIT TESTS: Agente 2 (Paciente Virtual Estandarizado)
# =============================================================================

def test_virtual_patient_pain_inquiry():
    """Responds realistically to student interrogations regarding pain location and characteristics."""
    agent = get_virtual_patient_agent()
    req = PatientChatRequest(
        case_id="CASE-GI-001",
        message="¿En qué parte siente el dolor y hacia dónde se le corre?",
    )
    res = agent.respond_to_student(req)

    assert isinstance(res, PatientChatResponse)
    assert "boca del estómago" in res.reply.lower() or "espalda" in res.reply.lower()
    assert res.emotional_state != ""
    assert res.pain_scale_reported == 9


def test_virtual_patient_intensity_and_onset():
    """Responds accurately to questions about pain intensity and timing."""
    agent = get_virtual_patient_agent()

    # Intensity
    res_intensity = agent.respond_to_student(
        PatientChatRequest(case_id="CASE-GI-001", message="¿En una escala del 1 al 10 cuánto le duele?")
    )
    assert "9" in res_intensity.reply

    # Onset
    res_onset = agent.respond_to_student(
        PatientChatRequest(case_id="CASE-GI-001", message="¿Cuándo y a qué hora comenzó el dolor?")
    )
    assert "horas" in res_onset.reply.lower() or "ayer" in res_onset.reply.lower() or "noche" in res_onset.reply.lower()


def test_virtual_patient_associated_symptoms():
    """Responds to queries about vomiting, fever, medications, and meals."""
    agent = get_virtual_patient_agent()

    # Vomit
    res_vomit = agent.respond_to_student(
        PatientChatRequest(case_id="CASE-GI-001", message="¿Ha presentado vómito o náuseas?")
    )
    assert "vomit" in res_vomit.reply.lower()

    # Medication
    res_meds = agent.respond_to_student(
        PatientChatRequest(case_id="CASE-GI-001", message="¿Tomó algún medicamento para calmarse?")
    )
    assert "ibuprofeno" in res_meds.reply.lower() or "pastilla" in res_meds.reply.lower()


def test_virtual_patient_fallback():
    """Returns courteous colloquial fallback for unrecognizable or ambiguous questions."""
    agent = get_virtual_patient_agent()
    req = PatientChatRequest(
        case_id="CASE-GI-001",
        message="¿Qué piensa usted sobre la teoría de cuerdas en física cuántica?",
    )
    res = agent.respond_to_student(req)

    assert isinstance(res, PatientChatResponse)
    assert "pena" in res.reply.lower() or "dolor" in res.reply.lower() or "pregunta" in res.reply.lower()


# =============================================================================
# 3. UNIT TESTS: Agente 3 (Tutor Evaluador de Razonamiento Clínico)
# =============================================================================

def test_evaluator_high_performance():
    """Evaluates a thorough simulation with appropriate anamnesis, tests, and correct diagnosis."""
    agent = get_clinical_evaluator_agent()
    req = EvaluateSessionRequest(
        consultation_id="c1",
        case_id="CASE-GI-001",
        chat_history=[
            {"sender": "doctor", "message": "¿Dónde le duele y desde cuándo?"},
            {"sender": "patient", "message": "En la boca del estómago desde anoche."},
            {"sender": "doctor", "message": "¿Ha tenido vómitos o fiebre?"},
            {"sender": "patient", "message": "Sí, 5 vómitos."},
            {"sender": "doctor", "message": "¿Qué comió antes del dolor?"},
            {"sender": "patient", "message": "Frituras con cerveza."},
            {"sender": "doctor", "message": "¿Sufre de alguna enfermedad o antecedentes?"},
            {"sender": "patient", "message": "Tengo cálculos en la vesícula."},
            {"sender": "doctor", "message": "¿Toma algún medicamento o tiene alergias?"},
            {"sender": "patient", "message": "Tomé ibuprofeno."},
        ],
        requested_tests=[
            "Lipasa sérica",
            "Amilasa sérica",
            "Ecografía hepatobiliar",
            "Hemograma completo",
            "Perfil hepático",
        ],
        differential_diagnoses=[
            "Colecistitis aguda",
            "Úlcera péptica perforada",
            "Coledocolitiasis",
        ],
        final_diagnosis="Pancreatitis aguda litiásica",
    )
    res = agent.evaluate_session(req)

    assert isinstance(res, EvaluationResultResponse)
    assert res.final_score >= 80.0
    assert res.domain_scores.anamnesis >= 80.0
    assert res.domain_scores.diagnostic_tests >= 80.0
    assert res.domain_scores.differential_hypotheses >= 80.0
    assert res.domain_scores.final_diagnosis >= 85.0

    # Cognitive biases should not be detected in high-performing reasoning
    detected_bias_names = [b.bias_name for b in res.detected_biases if b.detected]
    assert len(detected_bias_names) == 0
    assert len(res.strengths) > 0


def test_evaluator_cognitive_biases_detected():
    """Detects anchoring and premature closure when differential diagnoses and tests are omitted."""
    agent = get_clinical_evaluator_agent()
    req = EvaluateSessionRequest(
        consultation_id="c2",
        case_id="CASE-GI-001",
        # Very brief anamnesis (1 question)
        chat_history=[
            {"sender": "doctor", "message": "¿Dónde le duele?"},
            {"sender": "patient", "message": "En el estómago."},
        ],
        # Only 1 test requested
        requested_tests=["Ecografía"],
        # No differentials presented -> Triggers Anchoring Bias
        differential_diagnoses=[],
        final_diagnosis="Gastritis aguda",
    )
    res = agent.evaluate_session(req)

    assert isinstance(res, EvaluationResultResponse)
    assert res.final_score < 65.0

    # Anchoring Bias must be detected
    anchoring = next((b for b in res.detected_biases if b.bias_name == "Sesgo de Anclaje"), None)
    assert anchoring is not None
    assert anchoring.detected is True

    # Premature Closure must be detected
    closure = next((b for b in res.detected_biases if b.bias_name == "Cierre Prematuro"), None)
    assert closure is not None
    assert closure.detected is True


# =============================================================================
# 4. HTTP INTEGRATION TESTS: Endpoints /api/agentes/*
# =============================================================================

def test_endpoint_generar_caso(client, auth_headers):
    """POST /api/agentes/caso returns 200 with complete vignette."""
    res = client.post(
        "/api/agentes/caso",
        headers=auth_headers,
        json={"specialty": "Gastroenterología", "difficulty": "MEDIUM"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["case_id"] == "CASE-GI-001"
    assert "vital_signs" in data
    assert "demographics" in data
    assert "ground_truth" in data


def test_endpoint_paciente_chat(client, auth_headers):
    """POST /api/agentes/paciente/chat returns 200 with colloquial response."""
    res = client.post(
        "/api/agentes/paciente/chat",
        headers=auth_headers,
        json={"case_id": "CASE-GI-001", "message": "¿Dónde siente el dolor doctor?"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "reply" in data
    assert "emotional_state" in data
    assert "timestamp" in data


def test_endpoint_evaluar_sesion(client, auth_headers):
    """POST /api/agentes/evaluar returns 200 with quantitative rubric and biases."""
    res = client.post(
        "/api/agentes/evaluar",
        headers=auth_headers,
        json={
            "case_id": "CASE-GI-001",
            "chat_history": [
                {"sender": "doctor", "message": "¿Desde cuándo le duele?"},
                {"sender": "patient", "message": "Desde anoche."},
                {"sender": "doctor", "message": "¿Tiene vómitos?"},
                {"sender": "patient", "message": "Sí, muchos."},
            ],
            "requested_tests": ["Lipasa", "Ecografía"],
            "differential_diagnoses": ["Colecistitis"],
            "final_diagnosis": "Pancreatitis aguda",
        },
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "final_score" in data
    assert "domain_scores" in data
    assert "detected_biases" in data
    assert "feedback_summary" in data


def test_endpoint_agentes_unauthorized(client):
    """Endpoints require valid JWT Bearer authentication."""
    res_caso = client.post("/api/agentes/caso", json={})
    assert res_caso.status_code == 401

    res_chat = client.post("/api/agentes/paciente/chat", json={"message": "Hola"})
    assert res_chat.status_code == 401

    res_eval = client.post("/api/agentes/evaluar", json={"final_diagnosis": "Apendicitis"})
    assert res_eval.status_code == 401


def test_endpoint_agentes_validation_errors(client, auth_headers):
    """Endpoints fail with 400 Bad Request when mandatory fields are missing or invalid."""
    # Chat requires non-empty message
    res_chat = client.post("/api/agentes/paciente/chat", headers=auth_headers, json={"message": ""})
    assert res_chat.status_code == 400
    assert "details" in res_chat.get_json()

    # Evaluation requires final_diagnosis
    res_eval = client.post("/api/agentes/evaluar", headers=auth_headers, json={})
    assert res_eval.status_code == 400
    assert "details" in res_eval.get_json()


# =============================================================================
<<<<<<< HEAD
# 5. REAL LLM ADAPTERS & RESILIENCE TESTS (Gemini & OpenAI / ChatGPT)
=======
# 5. REAL LLM ADAPTERS & RESILIENCE TESTS (Gemini)
>>>>>>> main
# =============================================================================

from unittest.mock import MagicMock
import json
from app.services.agents.gemini_agents import (
    GeminiCaseGeneratorAgent,
    GeminiClinicalEvaluatorAgent,
)
<<<<<<< HEAD
from app.services.agents.openai_agents import (
    OpenAIVirtualPatientAgent,
)
=======
>>>>>>> main


def test_gemini_case_generator_fallback_without_key():
    """Gemini Case Generator safely falls back to Mock when no API key is provided."""
    agent = GeminiCaseGeneratorAgent(api_key="")
    response = agent.generate_case(GenerateCaseRequest(specialty="Gastroenterología"))
    assert isinstance(response, GeneratedCaseResponse)
    assert response.case_id == "CASE-GI-001"


def test_gemini_case_generator_with_mocked_gemini_client():
    """Gemini Case Generator parses structured output from Gemini model."""
    agent = GeminiCaseGeneratorAgent(api_key="fake-key-for-test")
    mock_client = MagicMock()
    mock_case_payload = {
        "case_id": "CASE-GI-999",
        "title": "Caso Simulado Gemini",
        "specialty": "Gastroenterología",
        "difficulty": "HARD",
        "demographics": {"age": 50, "gender": "F", "occupation": "Docente"},
        "chief_complaint": "Dolor severo",
        "present_illness": "Dolor abdominal de 24 horas",
        "medical_history": {"pathological": "Gastritis"},
        "vital_signs": {
            "blood_pressure": "120/80",
            "heart_rate": 88,
            "respiratory_rate": 18,
            "temperature": 37.2,
            "oxygen_saturation": 98,
        },
        "physical_exam": {"abdomen": "Dolor en epigastrio"},
        "ground_truth": {
            "definitive_diagnosis": "Úlcera gástrica",
            "key_diagnostic_tests": ["Endoscopia"],
            "acceptable_differentials": ["Gastritis aguda"],
            "clinical_summary": "Caso de úlcera",
        },
    }
    mock_response = MagicMock()
    mock_response.text = json.dumps(mock_case_payload)
    mock_client.models.generate_content.return_value = mock_response
    agent._client = mock_client

    result = agent.generate_case(GenerateCaseRequest(specialty="Gastroenterología"))
    assert result.case_id == "CASE-GI-999"
    assert result.title == "Caso Simulado Gemini"
    assert result.ground_truth.definitive_diagnosis == "Úlcera gástrica"


def test_gemini_case_generator_fallback_on_exception():
    """Gemini Case Generator gracefully falls back to Mock on API error."""
    agent = GeminiCaseGeneratorAgent(api_key="fake-key-for-test")
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = RuntimeError("Rate limit 429 exceeded")
    agent._client = mock_client

    result = agent.generate_case(GenerateCaseRequest(specialty="Gastroenterología"))
    assert isinstance(result, GeneratedCaseResponse)
    assert result.case_id == "CASE-GI-001"


<<<<<<< HEAD
def test_openai_virtual_patient_fallback_without_key():
    """OpenAI Virtual Patient safely falls back to Mock when no API key is provided."""
    agent = OpenAIVirtualPatientAgent(api_key="")
    response = agent.respond_to_student(PatientChatRequest(message="¿Dónde le duele?"))
    assert isinstance(response, PatientChatResponse)
    assert len(response.reply) > 0


def test_openai_virtual_patient_with_mocked_openai_client():
    """OpenAI Virtual Patient parses chat completion output from ChatGPT."""
    agent = OpenAIVirtualPatientAgent(api_key="fake-openai-key")
    mock_client = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps({
        "reply": "Doctor, me duele intensamente en la boca del estómago y me da náuseas.",
        "pain_scale_reported": 9,
        "emotional_state": "angustiado",
    })
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    mock_client.chat.completions.create.return_value = mock_completion
    agent._client = mock_client

    result = agent.respond_to_student(PatientChatRequest(message="¿Qué siente?"))
    assert "boca del estómago" in result.reply
    assert result.pain_scale_reported == 9
    assert result.emotional_state == "angustiado"


def test_openai_virtual_patient_fallback_on_exception():
    """OpenAI Virtual Patient gracefully falls back to Mock on API error."""
    agent = OpenAIVirtualPatientAgent(api_key="fake-openai-key")
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RuntimeError("OpenAI quota exceeded")
    agent._client = mock_client

    result = agent.respond_to_student(PatientChatRequest(message="¿Tiene fiebre?"))
    assert isinstance(result, PatientChatResponse)
    assert len(result.reply) > 0


=======
>>>>>>> main
def test_gemini_clinical_evaluator_fallback_without_key():
    """Gemini Evaluator safely falls back to Mock when no API key is provided."""
    agent = GeminiClinicalEvaluatorAgent(api_key="")
    response = agent.evaluate_session(
        EvaluateSessionRequest(
            case_id="CASE-GI-001",
            final_diagnosis="Pancreatitis aguda litiásica",
        )
    )
    assert isinstance(response, EvaluationResultResponse)
    assert response.final_score > 0


def test_gemini_clinical_evaluator_fallback_on_exception():
    """Gemini Evaluator gracefully falls back to Mock on API error."""
    agent = GeminiClinicalEvaluatorAgent(api_key="fake-key-for-test")
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = RuntimeError("Gemini server error 503")
    agent._client = mock_client

    result = agent.evaluate_session(
        EvaluateSessionRequest(
            case_id="CASE-GI-001",
            final_diagnosis="Pancreatitis aguda",
        )
    )
    assert isinstance(result, EvaluationResultResponse)
    assert result.final_score > 0

