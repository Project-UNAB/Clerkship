import { useEffect, useState } from 'react';
import { MAIN_AUTH_CHANGED_EVENT, getStoredUser, type MainUser } from '../data/mainAuth';
import { generatedAvatarUrl } from './avatar';

export interface CurrentUserInfo {
  id: string;
  email: string | null;
  name: string;
  initials: string;
  role: string;
  color: string;
  avatarUrl: string;
}

const ROLE_LABELS: Record<MainUser['role'], string> = {
  STUDENT: 'Estudiante de Medicina',
  TEACHER: 'Docente · Preceptor',
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

/** Convierte el SVG guardado (texto real, ver auth.py /avatar) en un data
 *  URI usable directo en <img src>, sin tener que tocar cada lugar que ya
 *  usa avatarUrl como string. Si el usuario todavía no eligió avatar (cuenta
 *  vieja, o se lo saltó), cae al DiceBear-por-seed de siempre. */
function resolveAvatarUrl(user: MainUser): string {
  if (user.avatar_svg) {
    return `data:image/svg+xml,${encodeURIComponent(user.avatar_svg)}`;
  }
  return generatedAvatarUrl(user.email);
}

function buildUserInfo(user: MainUser | null): CurrentUserInfo | null {
  if (!user) return null;

  const name = `${user.first_name} ${user.last_name}`.trim();
  return {
    id: user.id,
    email: user.email,
    name,
    initials: initialsFrom(name),
    role: ROLE_LABELS[user.role] || 'Cuenta Clerkship',
    color: '#0284C7',
    avatarUrl: resolveAvatarUrl(user),
  };
}

/** Usuario autenticado contra el backend real (Flask/Supabase), reactivo a login/logout. */
export function useCurrentUser(): CurrentUserInfo | null {
  const [info, setInfo] = useState<CurrentUserInfo | null>(() => buildUserInfo(getStoredUser()));

  useEffect(() => {
    const sync = () => setInfo(buildUserInfo(getStoredUser()));
    window.addEventListener(MAIN_AUTH_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(MAIN_AUTH_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return info;
}
