/**
 * Banco de preguntas y toma de intentos de un cuestionario (CourseContentItem
 * tipo QUIZ). Opción única, opción múltiple o verdadero/falso, calificación
 * automática (todo o nada por pregunta).
 */
import { apiFetch } from './apiClient';

export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';

export interface QuizChoice {
  id: string;
  question_id: string;
  text: string;
  position: number;
  is_correct?: boolean;
}

export interface QuizQuestion {
  id: string;
  item_id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  position: number;
  choices: QuizChoice[];
}

export interface QuizAttemptAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_choice_ids: string[];
  is_correct: boolean | null;
}

export interface QuizAttempt {
  id: string;
  item_id: string;
  student_id: string;
  student_name?: string | null;
  attempt_number: number;
  started_at: string | null;
  submitted_at: string | null;
  completed: boolean;
  score: number | null;
  max_score: number | null;
  time_limit_minutes?: number | null;
  preguntas?: (QuizQuestion & { tu_respuesta: QuizAttemptAnswer | null })[];
}

function base(courseId: string, blockId: string, itemId: string) {
  return `/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}`;
}

// ── Banco de preguntas (docente) ──

export function listarPreguntas(courseId: string, blockId: string, itemId: string): Promise<{ preguntas: QuizQuestion[] }> {
  return apiFetch(`${base(courseId, blockId, itemId)}/preguntas`);
}

export interface CrearPreguntaPayload {
  type: QuestionType;
  prompt: string;
  points?: number;
  choices: { text: string; is_correct?: boolean }[];
}

export function crearPregunta(courseId: string, blockId: string, itemId: string, payload: CrearPreguntaPayload): Promise<QuizQuestion> {
  return apiFetch(`${base(courseId, blockId, itemId)}/preguntas`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function actualizarPregunta(
  courseId: string, blockId: string, itemId: string, questionId: string,
  updates: Partial<CrearPreguntaPayload> & { position?: number },
): Promise<QuizQuestion> {
  return apiFetch(`${base(courseId, blockId, itemId)}/preguntas/${questionId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function borrarPregunta(courseId: string, blockId: string, itemId: string, questionId: string): Promise<{ ok: boolean }> {
  return apiFetch(`${base(courseId, blockId, itemId)}/preguntas/${questionId}`, { method: 'DELETE' });
}

// ── Intentos (estudiante) ──

export function iniciarIntento(courseId: string, blockId: string, itemId: string): Promise<QuizAttempt> {
  return apiFetch(`${base(courseId, blockId, itemId)}/intentos`, { method: 'POST' });
}

export function listarIntentos(courseId: string, blockId: string, itemId: string): Promise<{ intentos: QuizAttempt[] }> {
  return apiFetch(`${base(courseId, blockId, itemId)}/intentos`);
}

export function obtenerIntento(courseId: string, blockId: string, itemId: string, attemptId: string): Promise<QuizAttempt> {
  return apiFetch(`${base(courseId, blockId, itemId)}/intentos/${attemptId}`);
}

export function responderIntento(
  courseId: string, blockId: string, itemId: string, attemptId: string,
  answers: { question_id: string; selected_choice_ids: string[] }[],
): Promise<QuizAttempt> {
  return apiFetch(`${base(courseId, blockId, itemId)}/intentos/${attemptId}/responder`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}
