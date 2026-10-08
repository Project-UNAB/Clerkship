/** Convierte un link de YouTube/Vimeo "normal" en la URL embebible de
 * iframe. Si no reconoce el formato, devuelve null (el link se muestra
 * como enlace externo normal en vez de intentar embeberlo roto). */
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      const shorts = u.pathname.match(/^\/shorts\/([^/]+)/);
      if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
      const embed = u.pathname.match(/^\/embed\/([^/]+)/);
      if (embed) return url;
      return null;
    }
    if (host === 'youtu.be') {
      const id = u.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.replace('/', '');
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === 'player.vimeo.com') {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}
