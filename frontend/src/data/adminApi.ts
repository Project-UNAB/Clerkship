/** Cliente de /api/admin — panel de administrador. Todo exige rol ADMIN. */
import { apiFetch } from './apiClient';
import type { DatosExpertoInvitado, EstadoInvitacion, InvitacionExperto, RevisionCaso, VistaCaso } from './validacionApi';
import type { Aplicabilidad, PestanaValidacion } from './validacionForms';

export interface AdminUsuario {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  email_verified: boolean;
  activo: boolean;
  avatar_svg?: string | null;
  mailbox_created?: boolean;
}

export interface Estadisticas {
  usuarios: { total: number; por_rol: Record<string, number>; activos: number; desactivados: number };
  casos_clinicos: { total: number; completados: number; en_progreso: number; ultimos_7_dias: number };
  cursos: number;
  biblioteca: { articulos: number };
  comunidad: { publicaciones: number; comentarios: number };
  retroalimentacion: Record<string, number>;
  validacion_expertos: Record<string, number>;
  almacenamiento: { archivos: number; bytes_usados: number };
}

export function getEstadisticas(): Promise<Estadisticas> {
  return apiFetch('/api/admin/estadisticas');
}

export function listarUsuarios(params: { role?: string; activo?: boolean; q?: string } = {}): Promise<{ usuarios: AdminUsuario[] }> {
  const qs = new URLSearchParams();
  if (params.role) qs.set('role', params.role);
  if (params.activo !== undefined) qs.set('activo', String(params.activo));
  if (params.q) qs.set('q', params.q);
  const s = qs.toString();
  return apiFetch(`/api/admin/usuarios${s ? `?${s}` : ''}`);
}

export function actualizarUsuario(id: string, updates: { role?: string; activo?: boolean }): Promise<{ usuario: AdminUsuario }> {
  return apiFetch(`/api/admin/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export function listarPostsAdmin(): Promise<{ posts: any[] }> {
  return apiFetch('/api/admin/comunidad/posts');
}

export function borrarPostAdmin(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/comunidad/posts/${id}`, { method: 'DELETE' });
}

export function borrarComentarioAdmin(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/comunidad/comentarios/${id}`, { method: 'DELETE' });
}

export function listarBibliotecaAdmin(): Promise<{ articulos: any[] }> {
  return apiFetch('/api/admin/biblioteca');
}

export function borrarArticuloAdmin(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/biblioteca/${id}`, { method: 'DELETE' });
}

export function listarFeedbackAdmin(pestana: string): Promise<{ respuestas: Record<string, any>[] }> {
  return apiFetch(`/api/admin/feedback/${pestana}`);
}

export interface ResumenOpinion {
  pestana: string;
  total: number;
  promedio_general: number | null;
  preguntas: { key: string; promedio: number | null; distribucion: Record<'1' | '2' | '3' | '4' | '5', number>; respuestas: number }[];
  comentarios: { texto: string; usuario: string | null; fecha: string | null }[];
}

/** Resultados de la «Opinión» (1 a 5) de una pestaña, ya calculados en el servidor. */
export function resumenFeedbackAdmin(pestana: string): Promise<ResumenOpinion> {
  return apiFetch(`/api/admin/feedback/${pestana}/resumen`);
}

export function listarValidacionAdmin(pestana: string): Promise<{ respuestas: Record<string, any>[] }> {
  return apiFetch(`/api/admin/validacion/${pestana}`);
}

export type NombreAgente = 'GENERADOR' | 'PACIENTE' | 'EVALUADOR';

export interface UsoAgente {
  llamadas: number;
  llamadas_reales: number;
  llamadas_mock: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latencia_prom_ms: number | null;
}

export interface EstadisticasTokens {
  general: Omit<UsoAgente, 'latencia_prom_ms'>;
  por_agente: Record<NombreAgente, UsoAgente>;
  por_proveedor: Record<string, number>;
  serie_diaria: { fecha: string; GENERADOR: number; PACIENTE: number; EVALUADOR: number; total: number }[];
}

export function getEstadisticasTokens(): Promise<EstadisticasTokens> {
  return apiFetch('/api/admin/tokens');
}

// ── Validación de la plataforma por expertos (invitaciones y resultados) ──

export interface InvitacionAdmin extends Omit<InvitacionExperto, 'casos' | 'faltantes'> {
  id: string;
  token: string;
  abierta_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Casos clínicos asignados y cuántos ya revisó. */
  casos: { asignados: number; enviados: number };
}

export interface NuevaInvitacion {
  nombre?: string | null;
  email?: string | null;
  profesion: string;
  especialidad?: string | null;
  institucion?: string | null;
  /** ID del experto: documento o registro profesional. Obligatorio. */
  registro_profesional: string;
  anos_experiencia?: number | null;
  secciones: PestanaValidacion[];
}

const VALIDACION = '/api/admin/validacion-expertos';

export function listarInvitacionesValidacion(): Promise<{ invitaciones: InvitacionAdmin[]; items_por_seccion: Record<PestanaValidacion, number> }> {
  return apiFetch(`${VALIDACION}/invitaciones`);
}

export function crearInvitacionValidacion(datos: NuevaInvitacion): Promise<{ invitacion: InvitacionAdmin }> {
  return apiFetch(`${VALIDACION}/invitaciones`, { method: 'POST', body: JSON.stringify(datos) });
}

export function actualizarInvitacionValidacion(
  id: string,
  cambios: Partial<NuevaInvitacion> & { accion?: 'revocar' | 'reactivar' | 'reabrir' },
): Promise<{ invitacion: InvitacionAdmin }> {
  return apiFetch(`${VALIDACION}/invitaciones/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) });
}

export function nuevoEnlaceValidacion(id: string): Promise<{ invitacion: InvitacionAdmin }> {
  return apiFetch(`${VALIDACION}/invitaciones/${id}/nuevo-enlace`, { method: 'POST' });
}

export function borrarInvitacionValidacion(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`${VALIDACION}/invitaciones/${id}`, { method: 'DELETE' });
}

export interface ItemValidez {
  key: string;
  n: number;
  media: number | null;
  distribucion: Record<'1' | '2' | '3' | '4', number>;
  v: number | null;
  ic_inferior: number | null;
  ic_superior: number | null;
  i_cvi: number | null;
  kappa: number | null;
}

export interface ExpertoResultado extends DatosExpertoInvitado {
  id: string;
  origen: 'invitacion' | 'formulario';
  estado: EstadoInvitacion;
  secciones: PestanaValidacion[];
  aplicabilidad: Aplicabilidad | null;
  comentario_final: string | null;
  completada_at: string | null;
}

export interface SeccionValidez {
  items: ItemValidez[];
  v_promedio: number | null;
  s_cvi_ave: number | null;
  s_cvi_ua: number | null;
  expertos: number;
  respuestas: { experto: string; valores: Record<string, number>; observaciones: Record<string, string> }[];
  observaciones: Record<string, { experto: string; texto: string }[]>;
}

export interface ResultadosValidacion {
  expertos: ExpertoResultado[];
  secciones: Record<PestanaValidacion, SeccionValidez>;
  global: { v_promedio: number | null; s_cvi_ave: number | null; s_cvi_ua: number | null };
  aplicabilidad: Record<Aplicabilidad, number>;
}

export function resultadosValidacion(): Promise<ResultadosValidacion> {
  return apiFetch(`${VALIDACION}/resultados`);
}

// ── Revisión de casos clínicos por expertos ──

export interface CasoParaRevision {
  consultation_id: string;
  subtema: string | null;
  especialidad: string;
  dificultad: string;
  finalizada_at: string | null;
  puntaje_ia: number | null;
  con_respuesta_estudiante: boolean;
  revisiones: (RevisionCaso & { experto: string | null; experto_estado: EstadoInvitacion | null })[];
}

export interface ExpertoDisponible { id: string; nombre: string; profesion: string; estado: EstadoInvitacion }

export function listarCasosRevision(): Promise<{ casos: CasoParaRevision[]; expertos: ExpertoDisponible[] }> {
  return apiFetch(`${VALIDACION}/casos`);
}

export function verCasoRevision(consultationId: string): Promise<{ caso: VistaCaso }> {
  return apiFetch(`${VALIDACION}/casos/${consultationId}`);
}

export function asignarCaso(consultationId: string, invitaciones: string[]): Promise<{ ok: boolean; asignadas: number }> {
  return apiFetch(`${VALIDACION}/casos/${consultationId}/asignaciones`, { method: 'POST', body: JSON.stringify({ invitaciones }) });
}

export function quitarRevision(revisionId: string): Promise<{ ok: boolean }> {
  return apiFetch(`${VALIDACION}/revisiones/${revisionId}`, { method: 'DELETE' });
}

export interface Concordancia {
  n: number;
  diferencia_media: number | null;
  de: number | null;
  limite_inferior: number | null;
  limite_superior: number | null;
  error_absoluto_medio: number | null;
  pearson: number | null;
  dentro_10: number | null;
}

export interface ResultadosCasos {
  revisiones: number;
  expertos: number;
  criterios: Omit<SeccionValidez, 'respuestas' | 'observaciones'>;
  casos: {
    consultation_id: string;
    subtema: string | null;
    dificultad: string;
    puntaje_ia: number | null;
    revisiones: number;
    puntaje_expertos: number | null;
    v_promedio: number | null;
    medias: Record<string, number | null>;
    expertos: { experto: string; puntaje: number | null; respuestas: Record<string, number> }[];
  }[];
  concordancia: Concordancia;
  pares: { ia: number; experto: number }[];
  observaciones: Record<string, { experto: string; caso: string | null; texto: string }[]>;
}

export function resultadosCasos(): Promise<ResultadosCasos> {
  return apiFetch(`${VALIDACION}/casos/resultados`);
}
