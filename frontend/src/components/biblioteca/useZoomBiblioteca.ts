import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../data/apiClient';

/** Zoom de los libros de la biblioteca, en porcentaje. */
export const ZOOM_MIN = 60;
export const ZOOM_MAX = 200;
/** Zoom con el que se abre la biblioteca si el usuario nunca lo cambió. */
export const ZOOM_PREDETERMINADO = 130;
const PASO = 10;
/** Se guarda en el servidor un momento después del último cambio, no en cada clic. */
const ESPERA_GUARDADO = 600;

const acotar = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z / PASO) * PASO));
const claveLocal = (userId: string) => `clerkship_bib_zoom_${userId}`;

function leerLocal(userId?: string): number | null {
  if (!userId) return null;
  try {
    const v = Number(localStorage.getItem(claveLocal(userId)));
    return Number.isFinite(v) && v > 0 ? acotar(v) : null;
  } catch {
    return null;
  }
}

/** El zoom se guarda en la cuenta del usuario (PATCH /api/usuarios/me), así se
 * mantiene en cualquier dispositivo. Una copia local evita el salto al abrir la
 * página mientras llega el valor del servidor. */
export function useZoomBiblioteca(userId?: string) {
  const [zoom, setZoom] = useState<number>(() => leerLocal(userId) ?? ZOOM_PREDETERMINADO);
  const temporizador = useRef<number | undefined>(undefined);
  const tocado = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let vigente = true;
    apiFetch<{ biblioteca_zoom?: number }>('/api/auth/me')
      .then(u => {
        // Si el usuario ya cambió el zoom mientras cargaba, gana su elección.
        if (!vigente || tocado.current || !u?.biblioteca_zoom) return;
        const z = acotar(u.biblioteca_zoom);
        setZoom(z);
        try { localStorage.setItem(claveLocal(userId), String(z)); } catch { /* sin almacenamiento local */ }
      })
      .catch(() => undefined);
    return () => { vigente = false; };
  }, [userId]);

  const cambiar = useCallback((siguiente: (z: number) => number) => {
    tocado.current = true;
    setZoom(actual => {
      const z = acotar(siguiente(actual));
      if (userId) {
        try { localStorage.setItem(claveLocal(userId), String(z)); } catch { /* sin almacenamiento local */ }
        window.clearTimeout(temporizador.current);
        temporizador.current = window.setTimeout(() => {
          apiFetch('/api/usuarios/me', { method: 'PATCH', body: JSON.stringify({ biblioteca_zoom: z }) }).catch(() => undefined);
        }, ESPERA_GUARDADO);
      }
      return z;
    });
  }, [userId]);

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  return {
    zoom,
    acercar: () => cambiar(z => z + PASO),
    alejar: () => cambiar(z => z - PASO),
    restablecer: () => cambiar(() => ZOOM_PREDETERMINADO),
  };
}
