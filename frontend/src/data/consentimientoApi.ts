/**
 * Cliente API para el registro y consulta de consentimiento informado en el servidor
 * (Ley 1581 de 2012).
 */
import { apiFetch } from './apiClient';
import type { MainUser } from './mainAuth';

export async function registrarConsentimiento(version: string): Promise<MainUser> {
  return apiFetch<MainUser>('/api/usuarios/consentimiento', {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}
