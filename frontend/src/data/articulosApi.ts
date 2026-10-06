/**
 * Biblioteca real (/api/articulos). Reemplaza los datos de muestra que
 * tenía BibliotecaPage.tsx — lee la tabla `articles` de Supabase, la misma
 * donde se guardan los PDF publicados desde el Dashboard y desde el panel
 * de administrador ("Publicar en biblioteca").
 */
import { apiFetch } from './apiClient';

export type ArticleType = 'LIBRO' | 'GUIA' | 'ENSAYO' | 'PROTOCOLO' | 'CASO';
export type ShelfStatus = 'NEXT' | 'FINISHED';

export interface Articulo {
  id: string;
  type: ArticleType;
  title: string;
  authors: string | null;
  category: string | null;
  specialty: string | null;
  source: string | null;
  year: number | null;
  pages: number | null;
  description: string | null;
  url: string;
  created_by: string | null;
  tags: string[];
  tiene_pdf: boolean;
}

export function listarArticulos(params: { type?: string; specialty?: string; q?: string; tag?: string } = {}): Promise<Articulo[]> {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.specialty) qs.set('specialty', params.specialty);
  if (params.q) qs.set('q', params.q);
  if (params.tag) qs.set('tag', params.tag);
  const s = qs.toString();
  return apiFetch(`/api/articulos${s ? `?${s}` : ''}`);
}

export interface ItemEstante {
  id: string;
  article_id: string;
  status: ShelfStatus;
}

export function obtenerEstante(): Promise<ItemEstante[]> {
  return apiFetch('/api/articulos/estante');
}

export function guardarEnEstante(articleId: string, status: ShelfStatus): Promise<ItemEstante> {
  return apiFetch(`/api/articulos/${articleId}/estante`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export function quitarDeEstante(articleId: string): Promise<{ message: string }> {
  return apiFetch(`/api/articulos/${articleId}/estante`, { method: 'DELETE' });
}

/** Solo para artículos con tiene_pdf: true (publicados desde R2). */
export function descargarArticulo(articleId: string): Promise<{ url: string }> {
  return apiFetch(`/api/almacenamiento/biblioteca/${articleId}/descarga`);
}
