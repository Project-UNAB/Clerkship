/**
 * Portada de un curso: cómo se ve cuando NO tiene imagen (color e iniciales
 * que salen del id y del nombre, siempre los mismos para el mismo curso) y
 * las reglas para revisar una imagen antes de subirla. Esa revisión es para
 * avisar rápido; la que vale es la del servidor.
 */

/** Deben coincidir con app/services/portadas.py. */
export const PORTADA_MAX_MB = 2;
export const PORTADA_ANCHO_MINIMO = 400;
export const PORTADA_ALTO_MINIMO = 200;
export const PORTADA_LADO_MAXIMO = 8000;
export const PORTADA_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

/** Tonos con buen contraste para texto blanco encima. */
const TONOS = [205, 222, 245, 262, 285, 325, 345, 12, 28, 160, 175, 190];

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Gradiente determinista: el mismo id de curso da siempre el mismo color. */
export function gradienteDeCurso(id: string): string {
  const h = hash(id);
  const tono = TONOS[h % TONOS.length];
  const giro = 25 + ((h >>> 8) % 30);
  const angulo = 120 + ((h >>> 16) % 60);
  return `linear-gradient(${angulo}deg, hsl(${tono} 62% 42%), hsl(${(tono + giro) % 360} 58% 30%))`;
}

/** "Gastroenterología y Razonamiento Clínico" -> "GR"; "Semiología" -> "SE". */
export function inicialesDeCurso(nombre: string): string {
  const ignoradas = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'para', 'con']);
  const palabras = nombre.trim().split(/\s+/).filter(p => /[\p{L}\p{N}]/u.test(p));
  const utiles = palabras.filter(p => !ignoradas.has(p.toLowerCase()));
  const base = utiles.length > 0 ? utiles : palabras;
  if (base.length === 0) return '?';
  const letras = base.length === 1
    ? Array.from(base[0]).slice(0, 2)
    : [Array.from(base[0])[0], Array.from(base[1])[0]];
  return letras.join('').toUpperCase();
}

function dimensionesDe(file: File): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ ancho: img.naturalWidth, alto: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('no es una imagen'));
    };
    img.src = url;
  });
}

/** Mensaje de error si la imagen no sirve como portada; null si pasa. */
export async function validarPortada(file: File): Promise<string | null> {
  if (!PORTADA_TIPOS.includes(file.type)) {
    return 'La portada tiene que ser una imagen JPG, PNG o WebP.';
  }
  if (file.size > PORTADA_MAX_MB * 1024 * 1024) {
    const pesa = (file.size / (1024 * 1024)).toFixed(1);
    return `La imagen pesa ${pesa} MB y el máximo es ${PORTADA_MAX_MB} MB.`;
  }
  try {
    const { ancho, alto } = await dimensionesDe(file);
    if (ancho < PORTADA_ANCHO_MINIMO || alto < PORTADA_ALTO_MINIMO) {
      return `La imagen es muy pequeña (${ancho}×${alto}). Mínimo ${PORTADA_ANCHO_MINIMO}×${PORTADA_ALTO_MINIMO} píxeles.`;
    }
    if (ancho > PORTADA_LADO_MAXIMO || alto > PORTADA_LADO_MAXIMO) {
      return `La imagen es demasiado grande (${ancho}×${alto}). Máximo ${PORTADA_LADO_MAXIMO} píxeles por lado.`;
    }
  } catch {
    return 'El archivo no se puede leer como imagen.';
  }
  return null;
}
