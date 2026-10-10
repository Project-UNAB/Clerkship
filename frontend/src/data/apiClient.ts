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

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function buildHeaders(token: string | null, extra?: HeadersInit, body?: BodyInit | null): HeadersInit {
  // Con FormData (subida de archivos) el navegador pone el Content-Type con
  // su boundary: si se fuerza a mano, el servidor no puede leer el formulario.
  const esFormulario = typeof FormData !== 'undefined' && body instanceof FormData;
  return {
    ...(esFormulario ? {} : { 'Content-Type': 'application/json' }),
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

/** Error de una respuesta no exitosa: conserva el código HTTP y el cuerpo. */
export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token = getAccessToken();
  let res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(token, options.headers, options.body),
  });

  if (res.status === 401 && token) {
    // El access_token venció — se intenta renovar (compartido si ya hay una
    // renovación en curso) y se reintenta el pedido una sola vez.
    try {
      token = await refreshAccessTokenOnce();
      res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: buildHeaders(token, options.headers, options.body),
      });
    } catch {
      clearMainAuthSession();
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    }
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // El backend responde {error: "Conflict", message: "detalle para la persona"}:
    // se muestra el detalle, y el título solo si no vino detalle.
    throw new ApiError(data?.message || data?.error || 'No se pudo conectar con el servidor.', res.status, data);
  }
  return data as T;
}

/**
 * Descarga un archivo de la API con la sesión del usuario (un enlace <a>
 * normal no puede mandar el token) y lo guarda con el nombre que propone el
 * servidor en Content-Disposition.
 */
export async function descargarArchivo(path: string, nombrePorDefecto: string): Promise<void> {
  const pedir = (token: string | null) => fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  let res = await pedir(getAccessToken());
  if (res.status === 401) {
    try {
      res = await pedir(await refreshAccessTokenOnce());
    } catch {
      clearMainAuthSession();
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.message || data?.error || 'No se pudo descargar el archivo.', res.status, data);
  }

  const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || nombrePorDefecto;
  const url = URL.createObjectURL(await res.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

/** Lo que acompaña a toda lista paginada del backend. */
export interface Paginacion {
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

/** Tamaño de página que piden las pantallas que muestran la lista completa
 * (el máximo que acepta el backend). */
export const PER_PAGE_MAXIMO = 100;

/**
 * Recorre todas las páginas de un listado y devuelve la primera respuesta con
 * la lista completa en `clave`. Para pantallas que todavía muestran todo de
 * una vez: cada pedido sigue siendo de tamaño acotado.
 */
export async function todasLasPaginas<T extends Paginacion, K extends keyof T>(
  pedir: (page: number, perPage: number) => Promise<T>,
  clave: K,
): Promise<T> {
  const primera = await pedir(1, PER_PAGE_MAXIMO);
  const filas = [...(primera[clave] as unknown as unknown[])];
  // Tope de seguridad: 50 páginas de 100 filas.
  const paginas = Math.min(primera.pages || 1, 50);
  for (let page = 2; page <= paginas; page++) {
    const siguiente = await pedir(page, PER_PAGE_MAXIMO);
    filas.push(...(siguiente[clave] as unknown as unknown[]));
  }
  return { ...primera, [clave]: filas, page: 1, pages: 1, per_page: filas.length };
}
