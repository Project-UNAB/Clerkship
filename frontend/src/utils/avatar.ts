/**
 * Avatar "real" generado (no iniciales en un círculo de color).
 *
 * Hoy no hay ningún campo en `users` (Postgres) para guardar una foto de
 * perfil subida de verdad, ni un servicio de almacenamiento de archivos
 * conectado (haría falta algo como Supabase Storage). Mientras eso no
 * exista, se genera un avatar único y consistente por persona con DiceBear,
 * a partir de un "seed" estable (su correo) — mismo patrón ya usado en
 * utils/currentUser.ts para el usuario logueado.
 */
export function generatedAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0284C7`;
}
