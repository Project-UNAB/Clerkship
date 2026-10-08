/**
 * Libro de calificaciones: junta en una sola vista las notas de todas las
 * Tareas y Cuestionarios de un curso.
 */
import { apiFetch } from './apiClient';

export interface CalificacionItem {
  id: string;
  block_id: string;
  type: 'ASSIGNMENT' | 'QUIZ';
  title: string;
  max_score: number | null;
}

export interface Calificacion {
  score: number | null;
  status: 'graded' | 'submitted';
}

export interface FilaEstudiante {
  student_id: string;
  nombre: string;
  student_code: string;
  calificaciones: Record<string, Calificacion>;
  promedio: number | null;
}

export interface LibroCalificaciones {
  items: CalificacionItem[];
  estudiantes: FilaEstudiante[];
}

export interface MisCalificaciones {
  items: CalificacionItem[];
  calificaciones: Record<string, Calificacion>;
  promedio: number | null;
}

export function obtenerCalificaciones(courseId: string): Promise<LibroCalificaciones> {
  return apiFetch(`/api/cursos/${courseId}/calificaciones`);
}

export function obtenerMisCalificaciones(courseId: string): Promise<MisCalificaciones> {
  return apiFetch(`/api/cursos/${courseId}/calificaciones/mias`);
}
