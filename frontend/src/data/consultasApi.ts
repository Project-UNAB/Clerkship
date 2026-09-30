/**
 * Cliente del backend de simulación clínica (backend/flask-api — Agentes IA /
 * Consultas / Historial), que corre APARTE de pruebas/back/flask-api (Auth /
 * Dashboard / Documentos), en su propio puerto (5001 por defecto — ver
 * app.py). Ambos backends hablan contra la MISMA Supabase/Mongo y comparten
 * el mismo JWT_SECRET_KEY, así que el access_token que ya entrega el login
 * (mainAuth.ts) sirve tal cual acá — no hace falta un segundo login.
 *
 * "Consultas" = una sesión de simulación clínica de principio a fin, con el
 * simulador de gastroenterología adoptado de jrojas710/proyectodegrado2 (ver
 * backend/flask-api/app/services/simulador/): crear_consulta genera el caso
 * (Agente Generador, con selección adaptativa de subtema/dificultad y RAG),
 * enviar_mensaje habla con el paciente virtual (Agente Paciente, con
 * guardrails), explorar hace una maniobra de examen físico o pide un
 * paraclínico (determinista, sin IA), finalizar_consulta evalúa la sesión
 * (Agente Evaluador — el puntaje lo calcula el backend con una fórmula
 * ponderada, nunca el modelo) y deja la nota real en Historial.
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

export type RetryableError = Error & { retryable?: boolean };

/** Reintenta fn mientras el backend diga que ningún proveedor de IA respondió
 *  (503), con espera creciente, hasta que responda o isCancelled() sea true. */
export async function retryUntilGemini<T>(
  fn: () => Promise<T>,
  onRetry: (attempt: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = (err as RetryableError).retryable || err instanceof TypeError;
      if (!retryable || isCancelled()) throw err;
      onRetry(attempt);
      await new Promise(r => setTimeout(r, Math.min(2000 + attempt * 1000, 8000)));
      if (isCancelled()) throw err;
    }
  }
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
    const err = new Error(data?.message || data?.error || 'No se pudo conectar con el servidor de simulación clínica.') as RetryableError;
    // 503 = ningún proveedor de IA respondió (el backend no guardó nada): se puede reintentar sin riesgo.
    err.retryable = res.status === 503;
    throw err;
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
  /** Área clínica puntual del caso (ej. "Colelitiasis / colecistitis aguda").
   *  null mientras la consulta está IN_PROGRESS — no se revela el área
   *  diagnóstica antes de que el estudiante cierre el caso. */
  subtema: string | null;
  status: ConsultationStatus;
  started_at: string | null;
  finished_at: string | null;
  score: number | null;
}

export interface ChatMessage {
  sender: 'STUDENT' | 'PATIENT' | 'SYSTEM';
  content: string;
  timestamp: string | null;
  /** true si este mensaje es la reacción del paciente a una maniobra de
   *  examen físico (contenido "[Exploracion fisica: ...]") — no se debe
   *  mostrar como pregunta normal del estudiante en el chat. */
  es_exploracion?: boolean;
}

/** Un ítem del catálogo cerrado de exploración clínica (13 maniobras de
 *  examen físico + 16 paraclínicos) — ver docs/ARQUITECTURA.md del repo
 *  jrojas710/proyectodegrado2. */
export interface CatalogoItem {
  clave: string;
  etiqueta: string;
  grupo: string;
}

export interface CatalogoExploracion {
  examen_fisico: CatalogoItem[];
  paraclinicos: CatalogoItem[];
}

/** Datos administrativos del paciente — como la cabecera de una historia
 *  clínica real (no son diagnóstico, por eso se muestran de entrada). */
export interface DatosPaciente {
  nombre: string;
  edad: number | null;
  sexo: 'M' | 'F' | null;
  ocupacion: string | null;
  peso_kg: number | null;
  documento?: string | null;
  telefono?: string | null;
  tipo_sangre?: string | null;
}

/** Identidad pre-generada (GET /api/consultas/ficha-previa), determinista y
 *  sin IA — se muestra de inmediato mientras el Agente Generador arma el
 *  resto del caso (eso sí tarda, llama a Gemini), y se reenvía en
 *  `createConsultation` para que el caso completo sea sobre esta misma
 *  persona, no sobre otra inventada aparte. `ocupacion` no viene: esa la
 *  elige el generador para que sea coherente con la enfermedad del caso. */
export interface IdentidadPaciente {
  nombre: string;
  edad: number;
  sexo: 'M' | 'F';
  documento: string;
  telefono: string;
  tipo_sangre: string;
  peso_kg: number;
  ocupacion?: string;
}

export function getFichaPrevia(): Promise<IdentidadPaciente> {
  return apiFetch('/api/consultas/ficha-previa');
}

/** Caso clínico — versión pública. Nunca incluye el diagnóstico real, la
 *  rúbrica, los antecedentes ni los síntomas: eso se revela solo
 *  conversando con el paciente virtual (o, el diagnóstico, al finalizar). */
export interface CaseDetails {
  id_caso: string;
  dificultad: Difficulty;
  paciente: DatosPaciente;
  estado_emocional_inicial: string;
  presentacion_inicial: string;
  catalogo_exploracion: CatalogoExploracion;
}

export interface ConsultationDetail extends Consultation {
  /** true si el caso/turno lo generó el modo demo (ningún proveedor de IA respondió) */
  is_mock?: boolean;
  chat_history: ChatMessage[];
  case_details: CaseDetails | Record<string, never>;
  /** Presente solo cuando status === 'COMPLETED' (GET de una consulta ya cerrada). */
  evaluation?: EvaluationResult;
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
  /** Subtema forzado (ej. "Colelitiasis / colecistitis aguda"); si se omite,
   *  el backend elige uno por selección adaptativa (rotación / refuerzo de
   *  áreas débiles según el desempeño histórico del estudiante). */
  condition?: string;
  /** La identidad que ya trajo getFichaPrevia() — para que el caso se arme
   *  sobre esta misma persona en vez de que el generador invente otra. */
  identidad_paciente?: IdentidadPaciente;
}): Promise<ConsultationDetail> {
  return apiFetch('/api/consultas', { method: 'POST', body: JSON.stringify(payload) });
}

export function getConsultation(id: string): Promise<ConsultationDetail> {
  return apiFetch(`/api/consultas/${id}`);
}

/** Renombra una consulta propia (cualquier estado). */
export function renameConsultation(id: string, title: string): Promise<Consultation> {
  return apiFetch(`/api/consultas/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
}

/** Solo se puede eliminar una consulta IN_PROGRESS — una vez completada
 *  queda en el historial académico y el backend rechaza el borrado. */
export function deleteConsultation(id: string): Promise<{ message: string }> {
  return apiFetch(`/api/consultas/${id}`, { method: 'DELETE' });
}

export interface SendMessageResult {
  sent: ChatMessage;
  reply: ChatMessage;
  estado_emocional: string | null;
  consulta_terminada: boolean;
  guardrail_activado: boolean;
  guardrails: string[];
  is_mock: boolean;
}

export function sendMessage(id: string, content: string): Promise<SendMessageResult> {
  return apiFetch(`/api/consultas/${id}/mensajes`, { method: 'POST', body: JSON.stringify({ content }) });
}

export type TipoExploracion = 'examen_fisico' | 'paraclinico';

export interface ExplorarResult {
  tipo: TipoExploracion;
  clave: string;
  etiqueta: string;
  resultado: string;
  /** Segundos "de laboratorio" sugeridos antes de mostrar el resultado (0 para examen físico). */
  demora_segundos: number;
  /** true en maniobras con contacto físico (palpación, Murphy, tacto rectal, etc.):
   *  el cliente debe seguir con un POST a /mensajes usando `mensaje_para_paciente`
   *  como contenido, SIN mostrarlo como burbuja normal del estudiante, para que
   *  el paciente reaccione en personaje. */
  requiere_reaccion_paciente: boolean;
  mensaje_para_paciente: string | null;
}

/** Maniobra de examen físico o solicitud de paraclínico — determinista, no
 *  llama a ningún modelo, responde en milisegundos. Clave/tipo inválido -> 400. */
export function explorar(id: string, tipo: TipoExploracion, clave: string): Promise<ExplorarResult> {
  return apiFetch(`/api/consultas/${id}/explorar`, { method: 'POST', body: JSON.stringify({ tipo, clave }) });
}

export interface EvaluationDimension {
  dimension: 'anamnesis' | 'hallazgos' | 'exploracion' | 'razonamiento' | 'comunicacion';
  etiqueta: string;
  /** Peso de la dimensión en el puntaje global, en porcentaje (30/20/15/25/10). */
  peso: number;
  /** Puntaje de la dimensión, 0-100. */
  puntaje: number;
}

/** Evaluación completa del Agente Evaluador — el LLM solo clasifica
 *  (qué preguntas cubrió, concordancia del diagnóstico, etc.), el
 *  `puntaje_global`/`desglose` los calcula siempre el backend con una
 *  fórmula ponderada auditable (ver docs/ARQUITECTURA.md). */
export interface EvaluationResult {
  puntaje_global: number;
  desglose: EvaluationDimension[];
  preguntas_clave_cubiertas: string[];
  preguntas_clave_omitidas: string[];
  hallazgos_indagados_correctamente: string[];
  hallazgos_no_indagados: string[];
  concordancia_hipotesis: 'alta' | 'media' | 'baja' | 'nula';
  comentario_hipotesis: string;
  diferenciales_pertinentes: string[];
  diferenciales_faltantes: string[];
  calidad_plan: 'adecuado' | 'parcial' | 'inadecuado' | 'ausente';
  comentario_plan: string;
  comunicacion: 'excelente' | 'adecuada' | 'mejorable' | 'deficiente';
  comentario_comunicacion: string;
  fortalezas: string[];
  aspectos_a_mejorar: string[];
  retroalimentacion_formativa: string;
  exploracion: {
    pertinentes_realizados: string[];
    pertinentes_omitidos: string[];
    paraclinicos_no_pertinentes: string[];
  };
  /** El único momento en que se revela el diagnóstico real y el subtema. */
  revelacion: {
    diagnostico_real: string;
    subtema: string;
    dificultad: string;
    diferenciales_esperados: string[];
  };
  duracion_segundos: number | null;
}

export function finishConsultation(id: string, payload: {
  final_diagnosis: string;
  differential_diagnoses?: string[];
  treatment_plan?: string;
  /** Notas libres tomadas durante la consulta (opcional, máx. 2000 caracteres). */
  notes?: string;
  /** Duración total de la consulta en segundos — se muestra en el informe final. */
  duration_seconds?: number;
}): Promise<{ message: string; consultation: Consultation; evaluation: EvaluationResult; is_mock: boolean }> {
  return apiFetch(`/api/consultas/${id}/finalizar`, { method: 'PATCH', body: JSON.stringify(payload) });
}

/* ── Historial ──────────────────────────────────────────────────────── */

export function listHistorial(params?: { course_id?: string }): Promise<Consultation[]> {
  const qs = params?.course_id ? `?course_id=${params.course_id}` : '';
  return apiFetch(`/api/historial${qs}`);
}

export interface RetroalimentacionResponse {
  consultation: Consultation;
  evaluation: {
    final_score: number;
    feedback_summary: string | null;
    execution_time_seconds: number | null;
    created_at?: string | null;
    /** La evaluación completa (desglose, revelación, etc.) — ver EvaluationResult.
     *  Puede faltar en consultas viejas evaluadas antes de esta integración. */
    detailed_rubric?: EvaluationResult;
  };
  /** La conversación completa con el paciente — la consulta ya está
   *  completada acá, así que mostrarla entera no revela nada que el
   *  estudiante no supiera ya. */
  chat_history: ChatMessage[];
}

export function getRetroalimentacion(consultationId: string): Promise<RetroalimentacionResponse> {
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

/** Sugerencia de refuerzo (banner de Historial): el subtema más débil del
 *  estudiante (misma fuente que la selección adaptativa, nunca se
 *  contradicen) y su dimensión más floja. Exige 3+ casos evaluados en un
 *  mismo subtema — si no hay suficiente historial, `disponible` es false. */
export interface Recomendacion {
  disponible: boolean;
  motivo?: string;
  subtema?: string;
  promedio?: number;
  dimension_debil?: { dimension: string; etiqueta: string; promedio: number } | null;
}

export function getRecomendacion(): Promise<Recomendacion> {
  return apiFetch('/api/historial/recomendacion');
}

/* ── Helpers de la simulación ───────────────────────────────────────── */

/** Mismos 8 subtemas de gastroenterología que usa el Agente Generador en el
 *  backend (app/services/simulador/catalogo.py) — la comparación ahí es sin
 *  distinguir mayúsculas ni tildes, así que estos acentos son solo para la UI. */
export const GASTRO_SUBTEMAS = [
  'Enfermedad por reflujo gastroesofágico (ERGE)',
  'Gastritis y enfermedad ulcerosa péptica',
  'Síndrome de intestino irritable (SII)',
  'Enfermedad inflamatoria intestinal (Crohn / Colitis ulcerosa)',
  'Pancreatitis aguda',
  'Hepatitis / hepatopatía',
  'Hemorragia digestiva alta o baja',
  'Colelitiasis / colecistitis aguda',
] as const;

/** crear_consulta exige un course_id en el que el estudiante esté matriculado:
 *  busca uno de Gastroenterología (o el primero) y matricula si hace falta. */
export async function ensureCourseId(): Promise<string> {
  const mine = await listMyCourses();
  const mineMatch = mine.find(c => c.name.toLowerCase().includes('gastro')) || mine[0];
  if (mineMatch) return mineMatch.id;

  const all = await listAllCourses();
  const candidate = all.find(c => c.name.toLowerCase().includes('gastro')) || all[0];
  if (!candidate) {
    throw new Error('No hay ningún curso creado todavía — pedile a un docente que cree uno.');
  }
  await enrollInCourse(candidate.id);
  return candidate.id;
}
