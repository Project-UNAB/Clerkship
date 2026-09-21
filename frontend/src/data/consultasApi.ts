/**
 * Cliente del backend de simulación clínica (backend/flask-api — Agentes IA /
 * Consultas / Historial), que corre APARTE de pruebas/back/flask-api (Auth /
 * Dashboard / Documentos), en su propio puerto (5001 por defecto — ver
 * app.py). Ambos backends hablan contra la MISMA Supabase/Mongo y comparten
 * el mismo JWT_SECRET_KEY, así que el access_token que ya entrega el login
 * (mainAuth.ts) sirve tal cual acá — no hace falta un segundo login.
 *
 * "Consultas" = una sesión de simulación clínica de principio a fin:
 * crear_consulta llama al Agente 1 (genera el caso), enviar_mensaje habla
 * con el Agente 2 (paciente virtual), finalizar_consulta llama al Agente 3
 * (evaluador) y deja la nota real en Historial.
 */
import { getAccessToken, refreshAccessToken, clearMainAuthSession } from './mainAuth';

const SIMULACION_API_BASE_URL = import.meta.env.VITE_SIMULACION_API_BASE_URL || 'http://localhost:5001';

function buildHeaders(token: string | null, extra?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

let refreshInFlight: Promise<string> | null = null;
function refreshAccessTokenOnce(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token = getAccessToken();
  let res = await fetch(`${SIMULACION_API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(token, options.headers),
  });

  if (res.status === 401 && token) {
    try {
      token = await refreshAccessTokenOnce();
      res = await fetch(`${SIMULACION_API_BASE_URL}${path}`, {
        ...options,
        headers: buildHeaders(token, options.headers),
      });
    } catch {
      clearMainAuthSession();
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    }
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // backend/flask-api manda {error, message, status_code} — message trae el detalle real.
    throw new Error(data?.message || data?.error || 'No se pudo conectar con el servidor de simulación clínica.');
  }
  return data as T;
}

/* ── Cursos (necesario para poder crear una consulta) ─────────────── */

export interface Course {
  id: string;
  name: string;
  description: string | null;
  academic_period: string | null;
  teacher_id: string;
}

export function listMyCourses(): Promise<Course[]> {
  return apiFetch('/api/cursos/mios');
}

export function listAllCourses(): Promise<Course[]> {
  return apiFetch('/api/cursos');
}

export function enrollInCourse(courseId: string): Promise<{ message: string }> {
  return apiFetch(`/api/cursos/${courseId}/matricular`, { method: 'POST' });
}

/* ── Consultas (simulación clínica) ────────────────────────────────── */

export type ConsultationStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface Consultation {
  id: string;
  student_id: string;
  course_id: string;
  title: string;
  specialty: string;
  difficulty: Difficulty;
  status: ConsultationStatus;
  started_at: string | null;
  finished_at: string | null;
  score: number | null;
}

export interface ChatMessage {
  sender: 'STUDENT' | 'PATIENT' | 'SYSTEM';
  content: string;
  timestamp: string | null;
}

/** Caso clínico — versión pública (nunca trae ground_truth). */
export interface PublicCase {
  case_id: string;
  title: string;
  specialty: string;
  difficulty: string;
  demographics: { age: number; gender: 'M' | 'F'; occupation: string };
  chief_complaint: string;
  present_illness: string;
  medical_history: Record<string, string>;
  vital_signs: {
    blood_pressure: string;
    heart_rate: number;
    respiratory_rate: number;
    temperature: number;
    oxygen_saturation: number;
  };
  physical_exam: Record<string, string>;
}

export interface ConsultationDetail extends Consultation {
  chat_history: ChatMessage[];
  case_details: PublicCase | Record<string, never>;
}

export function listConsultations(params?: { status?: ConsultationStatus; course_id?: string }): Promise<Consultation[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.course_id) qs.set('course_id', params.course_id);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/api/consultas${suffix}`);
}

export function createConsultation(payload: {
  course_id: string;
  title?: string;
  specialty?: string;
  difficulty?: Difficulty;
  condition?: string;
}): Promise<ConsultationDetail> {
  return apiFetch('/api/consultas', { method: 'POST', body: JSON.stringify(payload) });
}

export function getConsultation(id: string): Promise<ConsultationDetail> {
  return apiFetch(`/api/consultas/${id}`);
}

export function sendMessage(id: string, content: string): Promise<{
  sent: ChatMessage;
  reply: ChatMessage;
  guardrail_activado: boolean;
}> {
  return apiFetch(`/api/consultas/${id}/mensajes`, { method: 'POST', body: JSON.stringify({ content }) });
}

export interface DomainScores {
  anamnesis: number;
  diagnostic_tests: number;
  differential_hypotheses: number;
  final_diagnosis: number;
}

export interface CognitiveBias {
  bias_name: string;
  detected: boolean;
  explanation: string | null;
}

export interface EvaluationResult {
  consultation_id: string | null;
  final_score: number;
  domain_scores: DomainScores;
  detected_biases: CognitiveBias[];
  feedback_summary: string;
  strengths: string[];
  areas_for_improvement: string[];
  comparison_with_ground_truth: Record<string, unknown>;
  is_mock: boolean;
}

export function finishConsultation(id: string, payload: {
  final_diagnosis: string;
  differential_diagnoses?: string[];
  requested_tests?: string[];
}): Promise<{ message: string; consultation: Consultation; evaluation: EvaluationResult }> {
  return apiFetch(`/api/consultas/${id}/finalizar`, { method: 'PATCH', body: JSON.stringify(payload) });
}

/* ── Historial ──────────────────────────────────────────────────────── */

export function listHistorial(params?: { course_id?: string }): Promise<Consultation[]> {
  const qs = params?.course_id ? `?course_id=${params.course_id}` : '';
  return apiFetch(`/api/historial${qs}`);
}

export function getRetroalimentacion(consultationId: string): Promise<{
  consultation: Consultation;
  evaluation: EvaluationResult & { feedback_summary: string; created_at?: string | null };
}> {
  return apiFetch(`/api/historial/${consultationId}/retroalimentacion`);
}

export interface Estadisticas {
  total_simulaciones: number;
  completadas: number;
  en_progreso: number;
  promedio_score: number;
  puntaje_maximo: number;
  puntaje_minimo: number;
  por_especialidad: Record<string, number>;
}

export function getEstadisticas(): Promise<Estadisticas> {
  return apiFetch('/api/historial/estadisticas');
}
