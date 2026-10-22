/**
 * Cliente del backend real para datos de cuenta del usuario (/api/usuarios)
 * que no encajan en mainAuth.ts (login/registro) ni en currentUser.ts
 * (perfil ya cacheado localmente).
 */
import { apiFetch, descargarArchivo } from './apiClient';
import { getStoredUser, updateStoredUser, type MainUser } from './mainAuth';

export interface StorageUsage {
  used_bytes: number;
  limit_bytes: number;
  breakdown: {
    documentos: number;
  };
}

export function getStorageUsage(): Promise<StorageUsage> {
  return apiFetch('/api/usuarios/uso-almacenamiento');
}

/* ── Perfil (página /perfil) ─────────────────────────────────────── */

export interface PerfilUsuario extends MainUser {
  email_notifications?: boolean;
  biblioteca_zoom?: number;
  created_at: string | null;
  estudiante: { codigo: string; semestre: number | null } | null;
  docente: { departamento: string | null } | null;
}

export interface CambiosPerfil {
  first_name?: string;
  last_name?: string;
  semestre?: number;
  departamento?: string;
  biblioteca_zoom?: number;
}

export function obtenerPerfil(): Promise<PerfilUsuario> {
  return apiFetch('/api/usuarios/me/perfil');
}

/** Guarda los cambios y refresca el usuario guardado (nombre del menú lateral). */
export async function actualizarPerfil(cambios: CambiosPerfil): Promise<PerfilUsuario> {
  const perfil = await apiFetch<PerfilUsuario>('/api/usuarios/me', { method: 'PATCH', body: JSON.stringify(cambios) });
  const guardado = getStoredUser();
  if (guardado) updateStoredUser({ ...guardado, first_name: perfil.first_name, last_name: perfil.last_name });
  return perfil;
}

export function cambiarContrasena(actual: string, nueva: string): Promise<{ message: string }> {
  return apiFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: actual, new_password: nueva }),
  });
}

/** Cierra la sesión en todos los dispositivos, este incluido. */
export function cerrarTodasLasSesiones(): Promise<{ message: string }> {
  return apiFetch('/api/auth/logout-all', { method: 'POST' });
}

/** Descarga la copia de los datos personales (mis-datos-clerkship.json). */
export function descargarMisDatos(): Promise<void> {
  return descargarArchivo('/api/usuarios/me/exportar', 'mis-datos-clerkship.json');
}
