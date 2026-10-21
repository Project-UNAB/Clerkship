/**
 * Formularios de «Opinión» (1 a 5), uno por pestaña. Cada pestaña tiene su
 * propio endpoint (/api/feedback/<pestana>) y su propia tabla en Supabase.
 * El usuario sale de la sesión: no se escribe ningún ID. Cada usuario tiene una
 * respuesta por pestaña; si vuelve a enviar, se actualiza.
 */
import { apiFetch } from './apiClient';

export type PestanaFeedback = 'inicio' | 'casos' | 'historial' | 'biblioteca';

export interface MiOpinion {
  respuestas: Record<string, number>;
  comentario: string | null;
  fecha: string | null;
}

export function enviarFeedback(
  pestana: PestanaFeedback,
  respuestas: Record<string, number>,
  comentario: string,
): Promise<{ ok: boolean; message: string; actualizada?: boolean }> {
  return apiFetch(`/api/feedback/${pestana}`, {
    method: 'POST',
    body: JSON.stringify({ ...respuestas, comentario: comentario.trim() || null }),
  });
}

/** Lo que el usuario ya respondió en esa pestaña (null si todavía no). */
export function obtenerMiOpinion(pestana: PestanaFeedback): Promise<{ respuesta: MiOpinion | null }> {
  return apiFetch(`/api/feedback/${pestana}/mia`);
}
