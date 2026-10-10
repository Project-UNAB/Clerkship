/**
 * Libro de calificaciones: junta en una sola vista las notas de todas las
 * Tareas y Cuestionarios de un curso.
 */
import { apiFetch, descargarArchivo, todasLasPaginas, type Paginacion } from './apiClient';

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

/** Una página del libro: se pagina por estudiante; las columnas (items) vienen siempre completas. */
export function obtenerCalificacionesPagina(
  courseId: string, page = 1, perPage = 20,
): Promise<LibroCalificaciones & Paginacion> {
  return apiFetch(`/api/cursos/${courseId}/calificaciones?page=${page}&per_page=${perPage}`);
}

/** El libro completo (recorre las páginas de estudiantes). */
export function obtenerCalificaciones(courseId: string): Promise<LibroCalificaciones & Paginacion> {
  return todasLasPaginas((page, perPage) => obtenerCalificacionesPagina(courseId, page, perPage), 'estudiantes');
}

/** Descarga el libro completo del curso (todos los estudiantes) en CSV o XLSX. Solo el docente dueño. */
export function exportarCalificaciones(courseId: string, formato: 'csv' | 'xlsx'): Promise<void> {
  return descargarArchivo(`/api/cursos/${courseId}/calificaciones/exportar?formato=${formato}`, `calificaciones.${formato}`);
}

export function obtenerMisCalificaciones(courseId: string): Promise<MisCalificaciones> {
  return apiFetch(`/api/cursos/${courseId}/calificaciones/mias`);
}
