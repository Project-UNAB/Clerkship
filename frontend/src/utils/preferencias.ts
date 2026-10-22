import { useEffect, useState } from 'react';

/**
 * Preferencias de interfaz que se guardan en este navegador (no en la
 * cuenta): hoy, «Reducir movimiento». Se aplican a toda la plataforma con la
 * clase `reducir-movimiento` en <html> (CSS) y con <MotionConfig> (framer-motion).
 */
const CLAVE_MOVIMIENTO = 'clerkship_reducir_movimiento';
const EVENTO = 'clerkship-preferencias';

export function leerReducirMovimiento(): boolean {
  try {
    return localStorage.getItem(CLAVE_MOVIMIENTO) === '1';
  } catch {
    return false;
  }
}

function aplicar(activo: boolean) {
  document.documentElement.classList.toggle('reducir-movimiento', activo);
}

export function guardarReducirMovimiento(activo: boolean) {
  try {
    localStorage.setItem(CLAVE_MOVIMIENTO, activo ? '1' : '0');
  } catch {
    /* sin almacenamiento local: vale solo para esta visita */
  }
  aplicar(activo);
  window.dispatchEvent(new CustomEvent(EVENTO));
}

/** Estado reactivo de «Reducir movimiento» (se entera de los cambios en otras pestañas). */
export function useReducirMovimiento(): [boolean, (activo: boolean) => void] {
  const [activo, setActivo] = useState(leerReducirMovimiento);

  useEffect(() => {
    const sincronizar = () => setActivo(leerReducirMovimiento());
    window.addEventListener(EVENTO, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(EVENTO, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, []);

  useEffect(() => { aplicar(activo); }, [activo]);

  return [activo, guardarReducirMovimiento];
}
