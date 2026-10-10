/**
 * Material de un curso: bloques (temas, funcionan como carpetas) con
 * contenido adentro — documentos (R2), videos (enlace externo), enlaces y
 * notas de texto. Solo el docente dueño puede crear/editar/borrar.
 */
import { apiFetch, todasLasPaginas, type Paginacion } from './apiClient';

export type ContentType = 'DOCUMENT' | 'VIDEO' | 'LINK' | 'TEXT' | 'ASSIGNMENT' | 'QUIZ';

export interface CourseContentFile {
  id: string | null;
  nombre: string | null;
  mime_type: string | null;
  size_bytes: number | null;
}

export interface CourseContentItem {
  id: string;
  block_id: string;
  type: ContentType;
  title: string;
  description: string | null;
  position: number;
  video_url: string | null;
  link_url: string | null;
  text_content: string | null;
  file: CourseContentFile | null;
  created_at: string | null;
  // ASSIGNMENT
  open_at?: string | null;
  due_at?: string | null;
  max_score?: number | null;
  allow_late?: boolean;
  late_until?: string | null;
  /** Tal como lo configuró el docente ([] / null = valores por defecto). */
  allowed_extensions?: string[];
  max_file_size_mb?: number | null;
  max_files?: number;
  /** Rúbrica de la tarea; vacía = se califica con una nota única. */
  rubric?: CriterioRubrica[];
  reglas?: ReglasTarea;
  // QUIZ (open_at/due_at de arriba se reutilizan como ventana de disponibilidad)
  time_limit_minutes?: number | null;
  max_attempts?: number | null;
  grade_policy?: GradePolicy;
}

/** Qué nota queda en un cuestionario cuando hay varios intentos entregados. */
export type GradePolicy = 'BEST' | 'LAST' | 'AVERAGE' | 'FIRST';

export const GRADE_POLICY_LABELS: Record<GradePolicy, string> = {
  BEST: 'El mejor intento',
  LAST: 'El último intento',
  AVERAGE: 'El promedio de los intentos',
  FIRST: 'El primer intento',
};

export interface CourseBlock {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
  created_at: string | null;
  contenido: CourseContentItem[];
}

export function listarBloques(courseId: string): Promise<{ bloques: CourseBlock[] }> {
  return apiFetch(`/api/cursos/${courseId}/bloques`);
}

export function crearBloque(courseId: string, title: string, description?: string): Promise<CourseBlock> {
  return apiFetch(`/api/cursos/${courseId}/bloques`, {
    method: 'POST',
    body: JSON.stringify({ title, description: description || null }),
  });
}

export function actualizarBloque(
  courseId: string,
  blockId: string,
  updates: { title?: string; description?: string | null; position?: number },
): Promise<CourseBlock> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function borrarBloque(courseId: string, blockId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}`, { method: 'DELETE' });
}

export interface CrearContenidoPayload {
  type: ContentType;
  title: string;
  description?: string;
  // DOCUMENT
  name?: string;
  mime_type?: string;
  file_base64?: string;
  // VIDEO
  video_url?: string;
  // LINK
  link_url?: string;
  // TEXT
  text_content?: string;
  // ASSIGNMENT
  open_at?: string;
  due_at?: string;
  max_score?: number;
  allow_late?: boolean;
  late_until?: string;
  allowed_extensions?: string[];
  max_file_size_mb?: number;
  max_files?: number;
  rubric?: CriterioRubrica[];
  // QUIZ
  time_limit_minutes?: number;
  max_attempts?: number;
  grade_policy?: GradePolicy;
}

export function crearContenido(courseId: string, blockId: string, payload: CrearContenidoPayload): Promise<CourseContentItem> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function actualizarContenido(
  courseId: string,
  blockId: string,
  itemId: string,
  updates: Partial<Pick<CrearContenidoPayload, 'title' | 'description' | 'video_url' | 'link_url' | 'text_content'>> & { position?: number },
): Promise<CourseContentItem> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function borrarContenido(courseId: string, blockId: string, itemId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}`, { method: 'DELETE' });
}

export interface ContenidoArchivo {
  document: {
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
    data: string;
  };
}

export function obtenerArchivoContenido(courseId: string, blockId: string, itemId: string): Promise<ContenidoArchivo> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/archivo`);
}

export interface ContenidoVistaPrevia {
  mime_type: 'application/pdf';
  data: string;
  converted: boolean;
}

export function obtenerVistaPreviaContenido(courseId: string, blockId: string, itemId: string): Promise<ContenidoVistaPrevia> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/vista-previa`);
}

// ─────────────────────────── Tareas (ASSIGNMENT) ───────────────────────────

/** Un criterio de la rúbrica de una tarea. */
export interface CriterioRubrica {
  /** Lo asigna el servidor; al editar se envía para conservar el criterio. */
  id?: string;
  title: string;
  description?: string | null;
  max_points: number;
}

/** La nota de un criterio en una entrega ya calificada. */
export interface NotaDeCriterio {
  criterion_id: string;
  title: string;
  max_points: number;
  points: number;
  comment: string | null;
}

export type EstadoVentana = 'NOT_OPEN' | 'OPEN' | 'LATE' | 'CLOSED';

/** Reglas que de verdad se aplican al entregar (valores por defecto y topes
 * del servidor incluidos) y en qué punto de la ventana está la tarea. */
export interface ReglasTarea {
  allowed_extensions: string[];
  max_file_size_mb: number;
  max_files: number;
  max_total_mb: number;
  open_at: string | null;
  due_at: string | null;
  allow_late: boolean;
  late_until: string | null;
  status: EstadoVentana;
  accepts_submissions: boolean;
  seconds_until_open: number | null;
  seconds_until_due: number | null;
  seconds_until_late_close: number | null;
  server_now: string;
}

export interface ArchivoEntregado {
  id: string;
  version: number;
  position: number;
  nombre: string;
  mime_type: string | null;
  size_bytes: number | null;
  is_late: boolean;
  uploaded_at: string | null;
}

export interface EntregaTarea {
  id: string;
  item_id: string;
  student_id: string;
  student_name: string | null;
  version: number;
  files: ArchivoEntregado[];
  history: { version: number; uploaded_at: string | null; is_late: boolean; files: ArchivoEntregado[] }[];
  submitted_at: string | null;
  is_late: boolean;
  score: number | null;
  feedback: string | null;
  /** Nota por criterio cuando la tarea tiene rúbrica. */
  rubric_scores?: NotaDeCriterio[] | null;
  graded_at: string | null;
  /** Con fecha: el docente la mandó a la papelera. */
  deleted_at?: string | null;
}

export interface OpcionesTarea {
  supported_extensions: string[];
  default_extensions: string[];
  max_file_size_mb: number;
  max_files: number;
  max_total_mb: number;
}

/** Lo que el docente configura de una tarea. null borra el valor (vuelve al de por defecto). */
export interface ConfigTarea {
  title?: string;
  description?: string;
  max_score?: number;
  open_at?: string | null;
  due_at?: string | null;
  allow_late?: boolean;
  late_until?: string | null;
  allowed_extensions?: string[];
  max_file_size_mb?: number | null;
  max_files?: number;
  /** [] quita la rúbrica. */
  rubric?: CriterioRubrica[];
}

export function opcionesTarea(): Promise<OpcionesTarea> {
  return apiFetch('/api/cursos/opciones-tarea');
}

export function obtenerContenido(
  courseId: string, blockId: string, itemId: string,
): Promise<CourseContentItem & { mi_entrega?: EntregaTarea | null }> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}`);
}

export function actualizarTarea(courseId: string, blockId: string, itemId: string, config: ConfigTarea): Promise<CourseContentItem> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}

export function miEntrega(
  courseId: string, blockId: string, itemId: string,
): Promise<{ entrega: EntregaTarea | null; reglas: ReglasTarea }> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/entregas/mia`);
}

export function entregarTarea(
  courseId: string, blockId: string, itemId: string, files: { name: string; file_base64: string }[],
): Promise<EntregaTarea & { reglas: ReglasTarea }> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/entregas`, {
    method: 'POST',
    body: JSON.stringify({ files }),
  });
}

export type EntregasPagina = { entregas: EntregaTarea[]; reglas: ReglasTarea } & Paginacion;

/** Todas las entregas de la tarea (recorre las páginas). Con `eliminadas`,
 * las que el docente mandó a la papelera en vez de las vigentes. */
export function listarEntregas(
  courseId: string, blockId: string, itemId: string, eliminadas = false,
): Promise<EntregasPagina> {
  const base = `/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/entregas`;
  return todasLasPaginas(
    (page, perPage) => apiFetch<EntregasPagina>(`${base}?page=${page}&per_page=${perPage}${eliminadas ? '&eliminadas=1' : ''}`),
    'entregas',
  );
}

/** Manda una entrega a la papelera: conserva archivos, versiones y nota, y se puede restaurar. */
export function eliminarEntrega(
  courseId: string, blockId: string, itemId: string, submissionId: string,
): Promise<{ ok: boolean; deleted_at: string }> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/entregas/${submissionId}`, { method: 'DELETE' });
}

export function restaurarEntrega(
  courseId: string, blockId: string, itemId: string, submissionId: string,
): Promise<EntregaTarea> {
  return apiFetch(
    `/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/entregas/${submissionId}/restaurar`, { method: 'POST' },
  );
}

/** Califica una entrega: con `score` (nota única) o con `criteria` (los
 * puntos de cada criterio de la rúbrica; la nota es la suma). */
export function calificarEntrega(
  courseId: string, blockId: string, itemId: string, submissionId: string,
  nota: { score?: number; criteria?: { criterion_id: string; points: number; comment?: string }[] },
  feedback?: string,
): Promise<EntregaTarea> {
  return apiFetch(`/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/entregas/${submissionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...nota, feedback: feedback || null }),
  });
}

/** Enlace firmado de vida corta para bajar un archivo entregado. */
export function enlaceArchivoEntrega(
  courseId: string, blockId: string, itemId: string, submissionId: string, fileId: string,
): Promise<{ url: string; name: string; expires_in: number }> {
  return apiFetch(
    `/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/entregas/${submissionId}/archivos/${fileId}/descarga`,
  );
}
