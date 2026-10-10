/**
 * Foro de avisos de un curso — el docente publica anuncios (puede fijarlos
 * arriba), cualquier matriculado puede comentarlos. Equivalente al foro
 * "Avisos" que Moodle crea por defecto en todo curso.
 */
import { apiFetch, todasLasPaginas, type Paginacion } from './apiClient';

export interface CourseAnnouncement {
  id: string;
  course_id: string;
  author_id: string;
  author_name: string | null;
  title: string;
  body: string;
  pinned: boolean;
  comment_count: number;
  created_at: string | null;
}

export interface AnnouncementComment {
  id: string;
  announcement_id: string;
  author_id: string;
  author_name: string | null;
  author_role: string | null;
  content: string;
  created_at: string | null;
}

export type AvisosPagina = { avisos: CourseAnnouncement[] } & Paginacion;

/** Una página de avisos (fijados primero, luego los más recientes). */
export function listarAvisosPagina(courseId: string, page = 1, perPage = 20): Promise<AvisosPagina> {
  return apiFetch(`/api/cursos/${courseId}/avisos?page=${page}&per_page=${perPage}`);
}

/** Todos los avisos del curso (recorre las páginas). */
export function listarAvisos(courseId: string): Promise<AvisosPagina> {
  return todasLasPaginas((page, perPage) => listarAvisosPagina(courseId, page, perPage), 'avisos');
}

export function crearAviso(
  courseId: string,
  payload: { title: string; body: string; pinned?: boolean },
): Promise<CourseAnnouncement> {
  return apiFetch(`/api/cursos/${courseId}/avisos`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function actualizarAviso(
  courseId: string,
  announcementId: string,
  updates: { title?: string; body?: string; pinned?: boolean },
): Promise<CourseAnnouncement> {
  return apiFetch(`/api/cursos/${courseId}/avisos/${announcementId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function borrarAviso(courseId: string, announcementId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/cursos/${courseId}/avisos/${announcementId}`, { method: 'DELETE' });
}

export function listarComentarios(courseId: string, announcementId: string): Promise<{ comentarios: AnnouncementComment[] }> {
  return apiFetch(`/api/cursos/${courseId}/avisos/${announcementId}/comentarios`);
}

export function crearComentario(courseId: string, announcementId: string, content: string): Promise<AnnouncementComment> {
  return apiFetch(`/api/cursos/${courseId}/avisos/${announcementId}/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function borrarComentario(courseId: string, announcementId: string, commentId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/cursos/${courseId}/avisos/${announcementId}/comentarios/${commentId}`, { method: 'DELETE' });
}
