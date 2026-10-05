/**
 * Envío de los formularios de retroalimentación. Cada pestaña tiene su propio
 * endpoint (/api/feedback/<pestana>) y su propia tabla en Supabase.
 * El ID del usuario lo escribe quien responde (las cuentas de desarrollo aún
 * no existen en la plataforma).
 */
import { apiFetch } from './apiClient';

export type PestanaFeedback = 'inicio' | 'casos' | 'historial' | 'biblioteca';

export function enviarFeedback(
  pestana: PestanaFeedback,
  idUsuario: string,
  respuestas: Record<string, number>,
  comentario: string,
): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`/api/feedback/${pestana}`, {
    method: 'POST',
    body: JSON.stringify({
      id_usuario: idUsuario,
      ...respuestas,
      comentario: comentario.trim() || null,
    }),
  });
}
