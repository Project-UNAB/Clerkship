/**
 * Cliente HTTP centralizado para hablar con flask-api ya autenticado.
 *
 * Por qué existe: cada módulo (Chats, y pronto Biblioteca/Cursos) necesita
 * mandar el access_token en cada pedido — pero ese token expira (60 min por
 * defecto). Sin esto, cada 401 por token vencido se le mostraba tal cual al
 * usuario ("no autorizado") en vez de renovarlo solo con el refresh_token.
 * apiFetch() intenta renovar UNA vez automáticamente antes de rendirse.
 */
import { getAccessToken, refreshAccessToken, clearMainAuthSession } from './mainAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function buildHeaders(token: string | null, extra?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

/**
 * El poll de Chats manda varios pedidos en paralelo (mensajes + typing, cada
 * ~1s). Si el access_token venció, los dos reciben 401 casi al mismo tiempo
 * — sin esto, cada uno pedía su propio token nuevo por separado (2 llamadas
 * a /refresh redundantes). Esta promesa compartida hace que, si ya hay una
 * renovación en curso, los demás pedidos que también recibieron 401 esperen
 * ESA MISMA renovación en vez de disparar la suya.
 */
let refreshInFlight: Promise<string> | null = null;

function refreshAccessTokenOnce(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token = getAccessToken();
  let res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(token, options.headers),
  });

  if (res.status === 401 && token) {
    // El access_token venció — se intenta renovar (compartido si ya hay una
    // renovación en curso) y se reintenta el pedido una sola vez.
    try {
      token = await refreshAccessTokenOnce();
      res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: buildHeaders(token, options.headers),
      });
    } catch {
      clearMainAuthSession();
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    }
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || 'No se pudo conectar con el servidor.');
  }
  return data as T;
}
