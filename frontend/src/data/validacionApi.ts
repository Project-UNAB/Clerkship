/**
 * Envío de la validación por expertos. Ruta pública: no requiere sesión.
 */
import { apiFetch } from './apiClient';
import type { PestanaValidacion } from './validacionForms';

export interface DatosExperto {
  nombre_experto: string;
  id_experto: string;
  profesion: string;
  anos_experiencia: number;
  especialidad: string;
}

export function enviarValidacion(
  pestana: PestanaValidacion,
  experto: DatosExperto,
  calificaciones: Record<string, number>,
  comentario: string,
): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`/api/validacion/${pestana}`, {
    method: 'POST',
    body: JSON.stringify({
      ...experto,
      especialidad: experto.especialidad.trim() || null,
      ...calificaciones,
      comentario: comentario.trim() || null,
    }),
  });
}
