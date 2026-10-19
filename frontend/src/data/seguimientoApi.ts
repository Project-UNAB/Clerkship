/**
 * Cliente HTTP del seguimiento docente en el simulador clínico (/api/seguimiento/*).
 */
import { apiFetch, type Paginacion } from './apiClient';
import type { Course, Difficulty } from './consultasApi';

export interface DimensionResumen {
  dimension: string;
  etiqueta: string;
  promedio: number;
}

export interface DesgloseDimension {
  dimension: string;
  etiqueta: string;
  puntaje: number;
}

export interface PromedioSubtema {
  subtema: string;
  promedio: number;
  consultas: number;
}

export interface EstudianteSeguimiento {
  student_id: string;
  nombre: string;
  email: string;
  consultas_completadas: number;
  promedio: number | null;
  ultimo_puntaje: number | null;
  fecha_ultima_consulta: string | null;
  dimension_debil: DimensionResumen | null;
}

export interface ResumenCursoSeguimiento {
  promedio_general: number | null;
  total_consultas: number;
  promedio_por_subtema: PromedioSubtema[];
}

export interface SeguimientoCursoRespuesta extends Paginacion {
  course_id: string;
  curso_titulo: string;
  resumen: ResumenCursoSeguimiento;
  estudiantes: EstudianteSeguimiento[];
}

export interface PuntoEvolucion {
  consultation_id: string;
  fecha: string | null;
  puntaje: number;
  subtema: string | null;
  dificultad: Difficulty;
}

export interface ConsultaEstudianteDetalle {
  consultation_id: string;
  fecha: string | null;
  subtema: string | null;
  dificultad: Difficulty;
  puntaje: number | null;
  desglose: DesgloseDimension[];
}

export interface SeguimientoEstudianteRespuesta {
  course_id: string;
  estudiante: {
    student_id: string;
    nombre: string;
    email: string;
    consultas_completadas: number;
    promedio: number | null;
    dimension_debil: DimensionResumen | null;
    dimensiones: DimensionResumen[];
  };
  evolucion: PuntoEvolucion[];
  consultas: ConsultaEstudianteDetalle[];
}

/** Cursos que dicta el docente autenticado. */
export async function listarCursosDocente(): Promise<Course[]> {
  const res = await apiFetch<{ cursos: Course[] } | Course[]>('/api/cursos/mios?per_page=100');
  return Array.isArray(res) ? res : res.cursos || [];
}

/** Seguimiento general de un curso con sus estudiantes paginados. */
export function obtenerSeguimientoCurso(
  courseId: string,
  page = 1,
  perPage = 25,
): Promise<SeguimientoCursoRespuesta> {
  return apiFetch<SeguimientoCursoRespuesta>(
    `/api/seguimiento/cursos/${courseId}?page=${page}&per_page=${perPage}`,
  );
}

/** Evolución e historial de consultas completadas de un estudiante en el curso. */
export function obtenerSeguimientoEstudiante(
  courseId: string,
  studentId: string,
): Promise<SeguimientoEstudianteRespuesta> {
  return apiFetch<SeguimientoEstudianteRespuesta>(
    `/api/seguimiento/cursos/${courseId}/estudiantes/${studentId}`,
  );
}
