/**
 * Notificaciones dentro de la plataforma: nueva tarea, nuevo aviso, tarea
 * calificada y fecha límite próxima. Llegan siempre; por correo solo si el
 * usuario lo activa en sus preferencias.
 */
import { apiFetch, type Paginacion } from './apiClient';

export type TipoNotificacion = 'ASSIGNMENT_PUBLISHED' | 'ANNOUNCEMENT' | 'ASSIGNMENT_GRADED' | 'DUE_SOON';

export interface Notificacion {
  id: string;
  type: TipoNotificacion;
  title: string;
  body: string | null;
  course_id: string | null;
  entity_type: 'assignment' | 'announcement' | null;
  entity_id: string | null;
  /** Una fecha en UTC ligada al aviso (p. ej. el cierre de la tarea). */
  event_at: string | null;
  read: boolean;
  created_at: string | null;
}

export type NotificacionesPagina = { notificaciones: Notificacion[]; no_leidas: number } & Paginacion;

export function listarNotificaciones(page = 1, perPage = 20): Promise<NotificacionesPagina> {
  return apiFetch(`/api/notificaciones?page=${page}&per_page=${perPage}`);
}

export function contarNoLeidas(): Promise<{ no_leidas: number }> {
  return apiFetch('/api/notificaciones/no-leidas');
}

export function marcarLeida(id: string): Promise<Notificacion> {
  return apiFetch(`/api/notificaciones/${id}/leer`, { method: 'POST' });
}

export function marcarTodasLeidas(): Promise<{ marcadas: number; no_leidas: number }> {
  return apiFetch('/api/notificaciones/leer-todas', { method: 'POST' });
}

export function obtenerPreferencias(): Promise<{ email: boolean }> {
  return apiFetch('/api/notificaciones/preferencias');
}

/** Activa o desactiva recibir las notificaciones también por correo. */
export function actualizarPreferencias(email: boolean): Promise<{ email: boolean }> {
  return apiFetch('/api/notificaciones/preferencias', { method: 'PATCH', body: JSON.stringify({ email }) });
}
