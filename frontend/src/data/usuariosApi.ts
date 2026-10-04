/**
 * Cliente del backend real para datos de cuenta del usuario (/api/usuarios)
 * que no encajan en mainAuth.ts (login/registro) ni en currentUser.ts
 * (perfil ya cacheado localmente).
 */
import { apiFetch } from './apiClient';

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
