/**
 * Gestión de cursos para docentes: crear, ver el roster de un curso y
 * borrarlo. Listar/matricularse ya vive en consultasApi.ts (lo necesita
 * también el flujo de simulación del estudiante) — acá solo lo que falta.
 */
import { apiFetch } from './apiClient';
import type { Course } from './consultasApi';

export function crearCurso(payload: { name: string; description?: string; academic_period?: string }): Promise<Course> {
  return apiFetch('/api/cursos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function borrarCurso(courseId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/cursos/${courseId}`, { method: 'DELETE' });
}

export interface EstudianteDeCurso {
  user_id: string;
  nombre: string;
  email: string;
  student_code: string;
  enrolled_at: string | null;
  casos_completados: number;
  casos_en_progreso: number;
}

export function listarEstudiantesDeCurso(courseId: string): Promise<{ estudiantes: EstudianteDeCurso[] }> {
  return apiFetch(`/api/cursos/${courseId}/estudiantes`);
}

export function agregarEstudianteACurso(courseId: string, email: string): Promise<EstudianteDeCurso> {
  return apiFetch(`/api/cursos/${courseId}/estudiantes`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function quitarEstudianteDeCurso(courseId: string, userId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/cursos/${courseId}/estudiantes/${userId}`, { method: 'DELETE' });
}

/** El propio estudiante se sale de un curso en el que está matriculado. */
export function salirDeCurso(courseId: string): Promise<{ message: string }> {
  return apiFetch(`/api/cursos/${courseId}/matricular`, { method: 'DELETE' });
}
