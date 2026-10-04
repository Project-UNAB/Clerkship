import { signInWithEmailAndPassword, updatePassword, type User } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Autenticación de los 4 integrantes para el Módulo de Desarrollo.
 * Cada uno tiene una cuenta de Firebase Authentication (correo/contraseña)
 * creada manualmente en la consola — no hay registro self-service, son
 * cuentas fijas mapeadas 1 a 1 con `TEAM_MEMBERS` (ver data/teamData.ts).
 */
const MEMBER_EMAILS: Record<string, string> = {
  'juan-camilo': 'jrojas@clerkship.dev',
  'camilo-bueno': 'cbueno@clerkship.dev',
  'santiago': 'sarias@clerkship.dev',
};

export function memberEmail(memberId: string): string {
  const email = MEMBER_EMAILS[memberId];
  if (!email) throw new Error(`No hay cuenta configurada para "${memberId}".`);
  return email;
}

/** Lookup inverso: dado un correo de Firebase, ¿a qué integrante de TEAM_MEMBERS corresponde? */
export function memberIdForEmail(email: string): string | undefined {
  return Object.entries(MEMBER_EMAILS).find(([, e]) => e === email)?.[0];
}

export async function authenticateMember(memberId: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, memberEmail(memberId), password);
  return credential.user;
}

/**
 * Firebase deja el mismo instante (o casi) en `creationTime` y
 * `lastSignInTime` la primera vez que una cuenta inicia sesión. Lo usamos
 * para detectar "primer ingreso" y forzar el cambio de la contraseña
 * temporal, sin necesitar backend propio ni Admin SDK.
 */
export function isFirstLogin(user: User): boolean {
  const { creationTime, lastSignInTime } = user.metadata;
  if (!creationTime || !lastSignInTime) return false;
  return Math.abs(new Date(lastSignInTime).getTime() - new Date(creationTime).getTime()) < 60_000;
}

export async function setNewPassword(newPassword: string): Promise<void> {
  if (!auth.currentUser) throw new Error('No hay sesión activa.');
  await updatePassword(auth.currentUser, newPassword);
}

/** Validación compartida para el formulario de "nueva contraseña". */
export function validateNewPassword(password1: string, password2: string): string | null {
  if (password1.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  if (password1 !== password2) return 'Las contraseñas no coinciden.';
  return null;
}

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | undefined)?.code;
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Contraseña incorrecta.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
  }
  if (code === 'auth/weak-password') {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Tu sesión expiró. Vuelve a ingresar tu contraseña e intenta de nuevo.';
  }
  return 'No se pudo verificar la identidad. Intenta de nuevo.';
}
