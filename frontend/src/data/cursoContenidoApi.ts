/**
 * Material de un curso: bloques (temas, funcionan como carpetas) con
 * contenido adentro — documentos (R2), videos (enlace externo), enlaces y
 * notas de texto. Solo el docente dueño puede crear/editar/borrar.
 */
import { apiFetch } from './apiClient';

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
  // QUIZ (open_at/due_at de arriba se reutilizan como ventana de disponibilidad)
  time_limit_minutes?: number | null;
  max_attempts?: number | null;
}

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
  // QUIZ
  time_limit_minutes?: number;
  max_attempts?: number;
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
