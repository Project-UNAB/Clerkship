/**
 * Clerkship · Módulo de Autenticación y Consentimiento Informado por Cuenta
 *
 * Administra la sesión del usuario activo y el estado de aceptación
 * del consentimiento informado de manera PERMANENTE Y ÚNICA POR CUENTA.
 */

export function getActiveUserEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('clerkship_user_email') || null;
}

export function setActiveUser(email: string) {
  if (typeof window === 'undefined') return;
  const normalized = email.toLowerCase().trim();
  localStorage.setItem('clerkship_user_email', normalized);
  localStorage.setItem('clerkship_auth', 'true');
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  const hasAuthToken = localStorage.getItem('clerkship_auth') === 'true';
  const hasUser = Boolean(getActiveUserEmail());
  return hasAuthToken && hasUser;
}

export function hasUserAcceptedConsent(email?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const targetEmail = (email || getActiveUserEmail())?.toLowerCase().trim();

  if (!targetEmail) {
    // Si no hay correo registrado todavía, cae a la clave heredada si existe
    return localStorage.getItem('clerkship_consent') === 'accepted';
  }

  const userConsentKey = `clerkship_consent_${targetEmail}`;
  return localStorage.getItem(userConsentKey) === 'accepted';
}

export function recordUserConsent(email?: string | null) {
  if (typeof window === 'undefined') return;
  const targetEmail = (email || getActiveUserEmail())?.toLowerCase().trim();

  if (targetEmail) {
    const userConsentKey = `clerkship_consent_${targetEmail}`;
    localStorage.setItem(userConsentKey, 'accepted');
  }

  // Clave global por compatibilidad
  localStorage.setItem('clerkship_consent', 'accepted');
}

export function logoutUserSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('clerkship_auth');
  localStorage.removeItem('clerkship_user_email');
  // También los tokens de mainAuth.ts (mismas claves literales, sin
  // importar ese módulo para evitar un ciclo) — de lo contrario un logout
  // dejaba el access_token/refresh_token sueltos y viceversa, ver
  // clearMainAuthSession() en mainAuth.ts.
  localStorage.removeItem('clerkship_access_token');
  localStorage.removeItem('clerkship_refresh_token');
  localStorage.removeItem('clerkship_backend_user');
  // NOTA: clerkship_consent_<email> NO se elimina para que el consentimiento
  // sea requerido ÚNICAMENTE UNA SOLA VEZ POR CUENTA.
}
