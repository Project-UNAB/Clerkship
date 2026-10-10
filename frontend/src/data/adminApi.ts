/** Cliente de /api/admin — panel de administrador. Todo exige rol ADMIN. */
import { apiFetch } from './apiClient';

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
