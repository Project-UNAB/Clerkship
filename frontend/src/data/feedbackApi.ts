/**
 * Envío de los formularios de retroalimentación. Cada pestaña tiene su propio
 * endpoint (/api/feedback/<pestana>) y su propia tabla en Supabase.
 */
import { apiFetch } from './apiClient';

export type PestanaFeedback = 'inicio' | 'casos' | 'historial' | 'biblioteca';

export function enviarFeedback(
  pestana: PestanaFeedback,
  respuestas: Record<string, number>,
  comentario: string,
): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`/api/feedback/${pestana}`, {
    method: 'POST',
    body: JSON.stringify({ ...respuestas, comentario: comentario.trim() || null }),
  });
}
