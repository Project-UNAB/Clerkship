"""
Mock implementations of ClinicAI UNAB AI Agents.

These classes provide deterministic, clinically grounded responses conforming to
<<<<<<< HEAD
the Pydantic contracts. In the future, these can be replaced or augmented by
`OpenAIAgentProvider` or `GeminiAgentProvider` without touching routes.
=======
the Pydantic contracts. Sirven de fallback automático para `GeminiCaseGeneratorAgent`
/ `GeminiVirtualPatientAgent` / `GeminiClinicalEvaluatorAgent` (ver gemini_agents.py)
cuando no hay GEMINI_API_KEY configurada o falla la llamada real.
>>>>>>> main
"""

from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional

from app.schemas.agentes import (
    CognitiveBias,
    DomainScores,
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
    get_case_as_response,
    get_case_by_id,
)


class MockCaseGeneratorAgent(BaseCaseGeneratorAgent):
    """
    Agente 1: Generador / Presentador de Casos Clínicos (Mock).
    Selects or generates structured gastrointestinal clinical vignettes.
    """

    def generate_case(self, request: GenerateCaseRequest) -> GeneratedCaseResponse:
        """Generate or select a clinical case vignette matching request criteria."""
        selected_case_id = "CASE-GI-001"

        # 1. Match by condition keyword if provided
        if request.condition:
            cond_lower = request.condition.lower()
            for cid, cdata in CLINICAL_CASES_DATA.items():
                if (
                    cond_lower in cdata.get("condition", "").lower()
                    or cond_lower in cdata.get("title", "").lower()
                ):
                    selected_case_id = cid
                    break
        # 2. Match by difficulty if specified
        elif request.difficulty:
            diff_upper = request.difficulty.upper()
            for cid, cdata in CLINICAL_CASES_DATA.items():
                if cdata.get("difficulty") == diff_upper:
                    selected_case_id = cid
                    break

        return get_case_as_response(selected_case_id, include_ground_truth=True)


class MockVirtualPatientAgent(BaseVirtualPatientAgent):
    """
    Agente 2: Paciente Virtual Estandarizado (Mock).
    Simulates patient responses in Colombian/Latin American colloquial Spanish
    with realistic emotional states and clinical fidelity.
    """

    def respond_to_student(self, request: PatientChatRequest) -> PatientChatResponse:
        """Synthesize a natural patient reply based on the student's question."""
        case_id = request.case_id or "CASE-GI-001"
        case_data = get_case_by_id(case_id)
        dialogue_patterns = case_data.get("dialogue_patterns", {})
        query = (request.message or "").lower().strip()

        # Intent patterns with priority: more specific queries first
        patterns_map = [
            # 1. Intensidad / escala numérica
            (["intensidad", "escala", "1 al 10", "uno al diez", "del 1 al 10", "cuánto", "cuanto", "tan fuerte"], "intensidad"),
            # 2. Inicio / tiempo / cronología
            (["cuándo", "cuando", "hace cuanto", "hace cuánto", "tiempo", "inicio", "comenzo", "comenzó", "empezo", "empezó", "duracion", "duración", "horas", "días", "dias"], "comienzo"),
            # 3. Vómito / náuseas
            (["vómit", "vomit", "náusea", "nausea", "arcada", "baba"], "vomito"),
            # 4. Fiebre / temperatura
            (["fiebre", "temperatura", "escalofrío", "escalofrio", "calentura", "termómetro", "termometro"], "fiebre"),
            # 5. Medicamentos y analgésicos
            (["medicamento", "medicamentos", "pastilla", "remedio", "ibuprofeno", "acetaminofen", "acetaminofén", "naproxeno", "buscapina"], "medicamentos"),
            (["protector", "gastroprotector", "omeprazol", "esomeprazol"], "protector"),
            # 6. Alergias
            (["alergia", "alergias", "alérgico", "alergico", "alérgica", "alergica", "penicilina"], "alergias"),
            # 7. Desencadenantes / comidas / alcohol
            (["comió", "comio", "comida", "alimento", "grasa", "hamburguesa", "lechona", "chatarra", "cena", "almorzó", "almorzo"], "comida"),
            (["alcohol", "cerveza", "trago", "licor", "bebida"], "alcohol"),
            # 8. Factores atenuantes / alivio postural
            (["calma", "alivia", "mejora", "posición", "posicion", r"\bacostad\w*", r"\bsentad\w*"], "alivio"),
            # 9. Factores agravantes / tos
            (["tos", "toser", "caminar", "moverse", "movimiento", "respirar"], "tos"),
            # 10. Sangrado / heces
            (["sangr", "melena", "alquitran", "alquitrán"], "sangrado"),
            (["popó", "popo", "heces", "deposición", "deposicion", "diarrea"], "deposiciones"),
            # 11. Ojos / ictericia
            (["ojos", "amarill", "ictericia", "piel"], "ojos"),
            # 12. Orina
            (["orina", "chichí", "chichi", "ardor al orinar", "micción", "miccion"], "orina"),
            # 13. Regla / ginecología
            (["regla", "período", "periodo", "menstrua", "embarazo", "embarazada", "fur"], "regla"),
            # 14. Antecedentes / cirugías
            (["enfermedad", "sufre", "cirugía", "cirugia", "operad", "vesícula", "vesicula", "cálculo", "calculo", "piedra", "tensión", "tension", "hipertens"], "antecedentes"),
            # 15. Hijos
            (["hijo", "hijos", "parto", "gesta"], "hijos"),
            # 16. Dolor general (ubicación, irradiación, carácter)
            (["duele", "dolor", "dónde", "donde", "ubicación", "ubicacion", "siente", "tipo", "irradi", "espalda", "pecho", "punzada", "arponazo", "quema", "arder"], "dolor"),
        ]

        matched_reply: Optional[str] = None
        for keywords, pattern_key in patterns_map:
            for kw in keywords:
                if kw.startswith(r"\b"):
                    if re.search(kw, query):
                        matched_reply = dialogue_patterns.get(pattern_key)
                        break
                elif kw in query:
                    matched_reply = dialogue_patterns.get(pattern_key)
                    break
            if matched_reply:
                break

        if not matched_reply:
            # Fallback based on demographics and clinical status
            demographics = case_data.get("demographics", {})
            age = demographics.get("age", 40)
            if age < 30:
                matched_reply = (
                    "Ay doctor/doctora, disculpe, es que con este malestar y el dolor casi no me concentro... "
                    "¿Me podría decir otra vez la pregunta por favor?"
                )
            else:
                matched_reply = (
                    "Doctor, qué pena con usted pero me siento bastante indispuesto y con mucho dolor. "
                    "¿Podría repetirme la pregunta con calma?"
                )

        # Emotional states by case
        emotional_states_by_case = {
            "CASE-GI-001": "ansioso y adolorido",
            "CASE-GI-002": "quejumbrosa y asustada",
            "CASE-GI-003": "somnoliento y angustiado",
            "CASE-GI-004": "intranquila y febril",
        }

        # Pain scale reported
        pain_by_case = {
            "CASE-GI-001": 9,
            "CASE-GI-002": 8,
            "CASE-GI-003": 5,
            "CASE-GI-004": 9,
        }

        return PatientChatResponse(
            reply=matched_reply,
            emotional_state=emotional_states_by_case.get(case_id, "ansioso"),
            pain_scale_reported=pain_by_case.get(case_id, 8),
            timestamp=datetime.now(timezone.utc).isoformat(),
            provider_used="Mock (Modo Local)",
            model_used="deterministic-mock",
            is_mock=True,
            error_details=None,
        )


class MockClinicalEvaluatorAgent(BaseClinicalEvaluatorAgent):
    """
    Agente 3: Tutor Evaluador de Razonamiento Clínico (Mock).
    Analyzes student reasoning across clinical domains, calculates objective scores,
    and applies Dual Process Theory to detect cognitive biases.
    """

    def evaluate_session(self, request: EvaluateSessionRequest) -> EvaluationResultResponse:
        """Perform formative evaluation and cognitive bias analysis."""
        case_id = request.case_id or "CASE-GI-001"
        case_data = get_case_by_id(case_id)
        ground_truth = case_data.get("ground_truth", {})

        key_diagnostic_tests: List[str] = ground_truth.get("key_diagnostic_tests", [])
        acceptable_differentials: List[str] = ground_truth.get("acceptable_differentials", [])
        definitive_diagnosis: str = ground_truth.get("definitive_diagnosis", "")

        # -------------------------------------------------------------
        # 1. Evaluate Anamnesis Domain (0 - 100)
        # -------------------------------------------------------------
        # Evaluate student message volume and coverage of clinical interrogatories
        student_messages = [
            m.get("content", "") or m.get("message", "")
            for m in request.chat_history
            if m.get("sender") in ("user", "student", "doctor") or m.get("role") in ("user", "student")
        ]
        total_student_turns = max(len(student_messages), 1 if request.chat_history else 0)

        anamnesis_score = 50.0
        if total_student_turns >= 6:
            anamnesis_score = 92.0
        elif total_student_turns >= 4:
            anamnesis_score = 80.0
        elif total_student_turns >= 2:
            anamnesis_score = 65.0
        else:
            anamnesis_score = 40.0

        # Check for presence of essential anamnesis keywords
        all_text = " ".join(student_messages).lower()
        bonus = 0.0
        for kw in ["dolor", "tiempo", "cuando", "vomit", "fiebre", "medicamento", "antecedente", "alergia"]:
            if kw in all_text:
                bonus += 2.0
        anamnesis_score = min(100.0, anamnesis_score + bonus)

        # -------------------------------------------------------------
        # 2. Evaluate Diagnostic Tests Domain (0 - 100)
        # -------------------------------------------------------------
        # Match student's requested tests against key diagnostic tests
        student_tests = [t.lower() for t in request.requested_tests]
        matched_tests = []
        for key_test in key_diagnostic_tests:
            key_test_lower = key_test.lower()
            # Extract main tokens (e.g. lipasa, amilasa, ecografia, hemograma, tac, endoscopia, eda)
            tokens = re.findall(r"\w{4,}", key_test_lower)
            for st in student_tests:
                if any(tok in st for tok in tokens if tok not in ("completo", "perfil", "sérica", "abdominal")):
                    matched_tests.append(key_test)
                    break

        tests_matched_count = len(set(matched_tests))
        total_key_tests = max(len(key_diagnostic_tests), 1)
        test_ratio = tests_matched_count / total_key_tests

        if test_ratio >= 0.7:
            diagnostic_tests_score = 95.0
        elif test_ratio >= 0.5:
            diagnostic_tests_score = 82.0
        elif test_ratio >= 0.3:
            diagnostic_tests_score = 70.0
        elif test_ratio > 0:
            diagnostic_tests_score = 55.0
        else:
            diagnostic_tests_score = 35.0

        # -------------------------------------------------------------
        # 3. Evaluate Differential Hypotheses Domain (0 - 100)
        # -------------------------------------------------------------
        student_differentials = [d.lower() for d in request.differential_diagnoses]
        matched_diffs = []
        for acc_diff in acceptable_differentials:
            acc_tokens = re.findall(r"\w{4,}", acc_diff.lower())
            for sd in student_differentials:
                if any(tok in sd for tok in acc_tokens if tok not in ("aguda", "agudo", "simple", "derecho")):
                    matched_diffs.append(acc_diff)
                    break

        diffs_matched_count = len(set(matched_diffs))
        if diffs_matched_count >= 3:
            differentials_score = 95.0
        elif diffs_matched_count >= 2:
            differentials_score = 85.0
        elif diffs_matched_count >= 1:
            differentials_score = 70.0
        elif len(request.differential_diagnoses) > 0:
            differentials_score = 55.0
        else:
            differentials_score = 30.0

        # -------------------------------------------------------------
        # 4. Evaluate Final Diagnosis Domain (0 - 100)
        # -------------------------------------------------------------
        student_final = request.final_diagnosis.lower().strip()
        definitive_lower = definitive_diagnosis.lower()

        # Core diagnosis matching keywords
        core_keywords_by_case = {
            "CASE-GI-001": ["pancreatitis"],
            "CASE-GI-002": ["apendicitis"],
            "CASE-GI-003": ["hemorragia", "sangrado", "ulcera", "digestiva"],
            "CASE-GI-004": ["colecistitis"],
        }
        required_kws = core_keywords_by_case.get(case_id, ["pancreatitis"])
        if any(kw in student_final for kw in required_kws):
            # Check secondary precision (e.g., biliar/litiásica, aguda, etc.)
            if any(sec in student_final for sec in ["agud", "biliar", "litias", "supurad", "aine", "peptic"]):
                final_diag_score = 96.0
            else:
                final_diag_score = 85.0
        elif any(diff in student_final for diff in [d.lower() for d in acceptable_differentials]):
            final_diag_score = 60.0
        else:
            final_diag_score = 35.0

        # -------------------------------------------------------------
        # 5. Detect Cognitive Biases (Dual Process Theory)
        # -------------------------------------------------------------
        biases: List[CognitiveBias] = []

        # Bias 1: Anchoring (Anclaje)
        anchoring_detected = False
        anchoring_explanation = "El estudiante demostró apertura analítica considerando diagnósticos diferenciales alternativos."
        if len(request.differential_diagnoses) == 0:
            anchoring_detected = True
            anchoring_explanation = (
                "Se detectó sesgo de anclaje: el estudiante se fijó en la primera impresión clínica "
                "sin formular diagnósticos diferenciales formales para contrastar posibilidades diagnósticas."
            )
        biases.append(
            CognitiveBias(
                bias_name="Sesgo de Anclaje",
                detected=anchoring_detected,
                explanation=anchoring_explanation,
            )
        )

        # Bias 2: Premature Closure (Cierre Prematuro)
        premature_closure_detected = False
        premature_explanation = "El proceso diagnóstico contó con suficiente exploración clínica y apoyo paraclínico."
        if total_student_turns < 3 or len(request.requested_tests) < 2:
            premature_closure_detected = True
            premature_explanation = (
                "Se detectó cierre prematuro del caso: se emitió un diagnóstico definitivo sin haber profundizado "
                "en la anamnesis o habiendo ordenado una cantidad insuficiente de paraclínicos confirmatorios."
            )
        biases.append(
            CognitiveBias(
                bias_name="Cierre Prematuro",
                detected=premature_closure_detected,
                explanation=premature_explanation,
            )
        )

        # Bias 3: Confirmation Bias (Sesgo de Confirmación)
        confirmation_detected = False
        confirmation_explanation = "Las pruebas solicitadas permitieron evaluar y descartar hipótesis concurrentes."
        if len(request.requested_tests) == 1 and final_diag_score < 80:
            confirmation_detected = True
            confirmation_explanation = (
                "Se observó sesgo de confirmación: se solicitaron exámenes únicamente orientados a ratificar "
                "una única sospecha preconcebida, omitiendo paraclínicos para descartar diagnósticos alternativos graves."
            )
        biases.append(
            CognitiveBias(
                bias_name="Sesgo de Confirmación",
                detected=confirmation_detected,
                explanation=confirmation_explanation,
            )
        )

        # -------------------------------------------------------------
        # 6. Global Score & Feedback Generation
        # -------------------------------------------------------------
        # Weighted formula: 30% Anamnesis, 25% Tests, 20% Differentials, 25% Final Diagnosis
        final_score = round(
            (0.30 * anamnesis_score)
            + (0.25 * diagnostic_tests_score)
            + (0.20 * differentials_score)
            + (0.25 * final_diag_score),
            1,
        )

        domain_scores = DomainScores(
            anamnesis=round(anamnesis_score, 1),
            diagnostic_tests=round(diagnostic_tests_score, 1),
            differential_hypotheses=round(differentials_score, 1),
            final_diagnosis=round(final_diag_score, 1),
        )

        strengths: List[str] = []
        if anamnesis_score >= 80:
            strengths.append("Interrogatorio clínico metódico y orientado a los síntomas cardinales.")
        if diagnostic_tests_score >= 80:
            strengths.append("Excelente selección de paraclínicos e imágenes diagnósticas alineados con guías de práctica clínica.")
        if final_diag_score >= 85:
            strengths.append("Acierto certero en el diagnóstico definitivo de referencia.")
        if not strengths:
            strengths.append("Mantuvo una interacción respetuosa y formuló una propuesta diagnóstica estructurada.")

        areas_for_improvement: List[str] = []
        if anamnesis_score < 80:
            areas_for_improvement.append("Profundizar en antecedentes farmacológicos, alergias y cronología detallada del dolor.")
        if diagnostic_tests_score < 80:
            areas_for_improvement.append("Solicitar los paraclínicos de referencia esenciales para confirmar el cuadro antes de concluir.")
        if differentials_score < 80:
            areas_for_improvement.append("Plantear al menos 2-3 diagnósticos diferenciales plausibles de acuerdo con el síndrome abdominal.")
        if any(b.detected for b in biases):
            areas_for_improvement.append("Monitorear sesgos cognitivos identificados mediante metacognición clínica (Sistema 2 analítico).")

        feedback_summary = (
            f"El desempeño global del estudiante alcanzó un puntaje de {final_score}/100. "
            f"El diagnóstico propuesto fue '{request.final_diagnosis}', comparado con el estándar de oro "
            f"'{definitive_diagnosis}'. Se destaca su capacidad analítica y se sugiere continuar fortaleciendo "
            f"el descarte metódico de diagnósticos diferenciales y la pertinencia paraclínica."
        )

        return EvaluationResultResponse(
            consultation_id=request.consultation_id,
            final_score=final_score,
            domain_scores=domain_scores,
            detected_biases=biases,
            feedback_summary=feedback_summary,
            strengths=strengths,
            areas_for_improvement=areas_for_improvement,
            comparison_with_ground_truth={
                "definitive_diagnosis_ground_truth": definitive_diagnosis,
                "student_diagnosis": request.final_diagnosis,
                "key_tests_required": key_diagnostic_tests,
                "key_tests_matched": list(set(matched_tests)),
                "acceptable_differentials": acceptable_differentials,
                "clinical_summary": ground_truth.get("clinical_summary", ""),
            },
            provider_used="Mock (Modo Local)",
            model_used="deterministic-mock",
            is_mock=True,
            error_details=None,
        )
