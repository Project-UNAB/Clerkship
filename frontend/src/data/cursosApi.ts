/**
 * Gestión de cursos para docentes: crear, ver el roster de un curso y
 * borrarlo. Listar/matricularse ya vive en consultasApi.ts (lo necesita
 * también el flujo de simulación del estudiante) — acá solo lo que falta.
 */
import { apiFetch, todasLasPaginas, type Paginacion } from './apiClient';
import type { Course, EnrollmentMode } from './consultasApi';

export function obtenerCurso(courseId: string): Promise<Course> {
  return apiFetch(`/api/cursos/${courseId}`);
}

/** Imagen de portada a subir, con el encuadre que eligió el docente (0 a 1; 0.5 = centro). */
export interface PortadaNueva {
  file: File;
  focusX: number;
  focusY: number;
}

/** Con portada el curso viaja como multipart (campo "cover"); sin ella, como JSON. */
function cuerpoDeCurso(campos: Record<string, string | undefined>, portada?: PortadaNueva | null): BodyInit {
  if (!portada) return JSON.stringify(campos);
  const form = new FormData();
  Object.entries(campos).forEach(([clave, valor]) => {
    if (valor !== undefined) form.append(clave, valor);
  });
  form.append('cover', portada.file);
  form.append('focus_x', String(portada.focusX));
  form.append('focus_y', String(portada.focusY));
  return form;
}

export function crearCurso(
  payload: { name: string; description?: string; academic_period?: string },
  portada?: PortadaNueva | null,
): Promise<Course> {
  return apiFetch('/api/cursos', {
    method: 'POST',
    body: cuerpoDeCurso(payload, portada),
  });
}

/** Quita la portada: el curso vuelve a mostrarse con su color e iniciales. */
export function quitarPortadaCurso(courseId: string): Promise<Course> {
  return apiFetch(`/api/cursos/${courseId}/cover`, { method: 'DELETE' });
}

/** Manda el curso a la papelera: no se borra nada y se puede restaurar. */
export function borrarCurso(courseId: string): Promise<{ ok: boolean; deleted_at: string; restorable: boolean }> {
  return apiFetch(`/api/cursos/${courseId}`, { method: 'DELETE' });
}

/** Cursos que el docente mandó a la papelera. */
export function listarPapeleraCursos(): Promise<{ cursos: Course[] } & Paginacion> {
  return todasLasPaginas(
    (page, perPage) => apiFetch<{ cursos: Course[] } & Paginacion>(`/api/cursos/papelera?page=${page}&per_page=${perPage}`),
    'cursos',
  );
}

export function restaurarCurso(courseId: string): Promise<Course> {
  return apiFetch(`/api/cursos/${courseId}/restaurar`, { method: 'POST' });
}

/** Borra para siempre un curso de la papelera. Falla (409) si tiene simulaciones clínicas. */
export function borrarCursoDefinitivamente(
  courseId: string,
): Promise<{ ok: boolean; files_deleted: number; files_pending: number }> {
  return apiFetch(`/api/cursos/${courseId}/permanente`, { method: 'DELETE' });
}

/** El docente dueño edita nombre, descripción (HTML), período o portada de su curso. */
export function actualizarCurso(
  courseId: string,
  updates: { name?: string; description?: string; academic_period?: string },
  portada?: PortadaNueva | null,
): Promise<Course> {
  return apiFetch(`/api/cursos/${courseId}`, {
    method: 'PATCH',
    body: cuerpoDeCurso(updates, portada),
  });
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

export type RosterPagina = { estudiantes: EstudianteDeCurso[] } & Paginacion;

/** Una página del roster. */
export function listarEstudiantesDeCursoPagina(courseId: string, page = 1, perPage = 20): Promise<RosterPagina> {
  return apiFetch(`/api/cursos/${courseId}/estudiantes?page=${page}&per_page=${perPage}`);
}

/** El roster completo (recorre las páginas). */
export function listarEstudiantesDeCurso(courseId: string): Promise<RosterPagina> {
  return todasLasPaginas((page, perPage) => listarEstudiantesDeCursoPagina(courseId, page, perPage), 'estudiantes');
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

/* ── Matrícula: modo, código y solicitudes ─────────────────────────── */

/** Configuración de matrícula del curso — solo la recibe el docente dueño. */
export interface MatriculaConfig {
  course_id: string;
  enrollment_mode: EnrollmentMode;
  /** null = código desactivado. */
  enrollment_code: string | null;
  pending_requests: number;
}

export interface SolicitudMatricula {
  id: string;
  course_id: string;
  student_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string | null;
  resolved_at: string | null;
  student_name?: string | null;
  student_email?: string | null;
  course_name?: string | null;
}

export function obtenerMatricula(courseId: string): Promise<MatriculaConfig> {
  return apiFetch(`/api/cursos/${courseId}/matricula`);
}

export function actualizarModoMatricula(courseId: string, modo: EnrollmentMode): Promise<MatriculaConfig> {
  return apiFetch(`/api/cursos/${courseId}/matricula`, {
    method: 'PATCH',
    body: JSON.stringify({ enrollment_mode: modo }),
  });
}

/** El código anterior deja de servir de inmediato. */
export function regenerarCodigoMatricula(courseId: string): Promise<MatriculaConfig> {
  return apiFetch(`/api/cursos/${courseId}/matricula/codigo`, { method: 'POST' });
}

export function desactivarCodigoMatricula(courseId: string): Promise<MatriculaConfig> {
  return apiFetch(`/api/cursos/${courseId}/matricula/codigo`, { method: 'DELETE' });
}

export function listarSolicitudesDeCurso(courseId: string): Promise<{ solicitudes: SolicitudMatricula[] }> {
  return apiFetch(`/api/cursos/${courseId}/solicitudes`);
}

export function resolverSolicitud(courseId: string, solicitudId: string, aprobar: boolean): Promise<SolicitudMatricula> {
  return apiFetch(`/api/cursos/${courseId}/solicitudes/${solicitudId}/${aprobar ? 'aprobar' : 'rechazar'}`, { method: 'POST' });
}

/** Solicitudes del estudiante que siguen pendientes o fueron rechazadas. */
export function misSolicitudes(): Promise<{ solicitudes: SolicitudMatricula[] }> {
  return apiFetch('/api/cursos/mis-solicitudes');
}

/** El propio estudiante se sale de un curso en el que está matriculado. */
export function salirDeCurso(courseId: string): Promise<{ message: string }> {
  return apiFetch(`/api/cursos/${courseId}/matricular`, { method: 'DELETE' });
}

export interface FechaItem {
  item_id: string;
  course_id: string;
  course_name: string;
  title: string;
  type: 'ASSIGNMENT' | 'QUIZ';
  due_at: string | null;
  open_at: string | null;
}

/** Todas las Tareas y Cuestionarios con due_at de los cursos del usuario. */
export function misFechas(): Promise<{ fechas: FechaItem[] }> {
  return apiFetch('/api/cursos/mis-fechas');
}
