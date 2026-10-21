/**
 * Biblioteca real (/api/articulos). Reemplaza los datos de muestra que
 * tenía BibliotecaPage.tsx — lee la tabla `articles` de Supabase, la misma
 * donde se guardan los PDF publicados desde el Dashboard y desde el panel
 * de administrador ("Publicar en biblioteca").
 */
import { apiFetch } from './apiClient';

export type ArticleType = 'LIBRO' | 'GUIA' | 'ENSAYO' | 'PROTOCOLO' | 'CASO';
export type ShelfStatus = 'NEXT' | 'FINISHED';
export type EstadoArticulo = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

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
  /** Idioma del documento ('es' o 'en'); null si no se indicó. */
  idioma?: 'es' | 'en' | null;
  description: string | null;
  url: string;
  created_by: string | null;
  publicado_por?: string | null;
  estado?: EstadoArticulo;
  motivo_rechazo?: string | null;
  revisado_por?: string | null;
  revisado_en?: string | null;
  created_at?: string | null;
  tags: string[];
  tiene_pdf: boolean;
  pdf_url?: string | null;
  /** Miniatura (240×360) y portada completa (600×900); null si el libro no tiene portada. */
  portada_url?: string | null;
  portada_full_url?: string | null;
}

export interface PaginatedArticulos {
  articulos: Articulo[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export function listarArticulos(params?: { type?: string; specialty?: string; q?: string; tag?: string }): Promise<Articulo[]>;
export function listarArticulos(params: { type?: string; specialty?: string; q?: string; tag?: string; page: number; per_page?: number }): Promise<PaginatedArticulos>;
export function listarArticulos(params: any = {}): Promise<any> {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.specialty) qs.set('specialty', params.specialty);
  if (params.q) qs.set('q', params.q);
  if (params.tag) qs.set('tag', params.tag);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.per_page !== undefined) qs.set('per_page', String(params.per_page));
  const s = qs.toString();
  return apiFetch(`/api/articulos${s ? `?${s}` : ''}`);
}

export interface EditarArticuloPayload {
  title?: string;
  authors?: string;
  year?: number;
  pages?: number;
  description?: string;
  idioma?: 'es' | 'en';
}

export function editarArticulo(id: string, payload: EditarArticuloPayload): Promise<Articulo> {
  return apiFetch(`/api/articulos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function retirarArticulo(id: string): Promise<{ message: string }> {
  return apiFetch(`/api/articulos/${id}`, {
    method: 'DELETE',
  });
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

/** Lista los artículos en el panel de administrador filtrando opcionalmente por estado. */
export function listarArticulosAdmin(estado?: EstadoArticulo): Promise<{ articulos: Articulo[] }> {
  const qs = estado ? `?estado=${encodeURIComponent(estado)}` : '';
  return apiFetch(`/api/admin/biblioteca${qs}`);
}

/** Aprueba un artículo en revisión o rechazado (solo ADMIN). */
export function aprobarArticulo(articleId: string): Promise<Articulo> {
  return apiFetch(`/api/admin/biblioteca/${articleId}/aprobar`, {
    method: 'POST',
  });
}

/** Rechaza un artículo indicando el motivo (1-500 caracteres, solo ADMIN). */
export function rechazarArticulo(articleId: string, motivo: string): Promise<Articulo> {
  return apiFetch(`/api/admin/biblioteca/${articleId}/rechazar`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });
}

/** Pone la portada del libro (autor o ADMIN). El backend la recorta a 2:3 vertical
 * con el encuadre elegido (0 a 1; 0.5 = centro). */
export function subirPortadaArticulo(
  articleId: string,
  portada: { file: File; focusX: number; focusY: number },
): Promise<Articulo> {
  const form = new FormData();
  form.append('cover', portada.file);
  form.append('focus_x', String(portada.focusX));
  form.append('focus_y', String(portada.focusY));
  return apiFetch(`/api/articulos/${articleId}/portada`, { method: 'POST', body: form });
}

/** Un trazo dibujado en una página. Coordenadas de 0 a 1 respecto de la página
 * y grosor como fracción de su ancho: se ve igual a cualquier tamaño y zoom. */
export interface TrazoAnotacion {
  herramienta: 'lapiz' | 'resaltador';
  color: string;
  grosor: number;
  puntos: [number, number][];
}

/** Lo que el usuario subrayó o dibujó en el libro (solo lo suyo), por número de página. */
export function obtenerAnotaciones(articleId: string): Promise<{ paginas: Record<string, TrazoAnotacion[]> }> {
  return apiFetch(`/api/articulos/${articleId}/anotaciones`);
}

/** Reemplaza los trazos del usuario en una página; con una lista vacía la limpia. */
export function guardarAnotacionesPagina(
  articleId: string,
  pagina: number,
  trazos: TrazoAnotacion[],
  keepalive = false,
): Promise<{ pagina: number; trazos: number }> {
  return apiFetch(`/api/articulos/${articleId}/anotaciones/${pagina}`, {
    method: 'PUT',
    body: JSON.stringify({ trazos }),
    keepalive,
  });
}

/** Colores de las notas (los mismos que acepta el backend). */
export type ColorNota = '#FACC15' | '#4ADE80' | '#60A5FA' | '#F472B6' | '#FB923C';

/** Zona de la página, relativa (0 a 1) y con origen arriba a la izquierda. */
export interface ZonaNota { x: number; y: number; w: number; h: number }

/** Nota o comentario privado del usuario sobre una zona de una página. */
export interface NotaLibro {
  id: string;
  pagina: number;
  rect: ZonaNota;
  cita: string | null;
  texto: string;
  color: ColorNota;
  creada_en: string | null;
  editada_en: string | null;
}

export function listarNotas(articleId: string): Promise<{ notas: NotaLibro[] }> {
  return apiFetch(`/api/articulos/${articleId}/notas`);
}

export function crearNota(
  articleId: string,
  nota: { pagina: number; rect: ZonaNota; cita?: string | null; texto: string; color?: ColorNota },
): Promise<NotaLibro> {
  return apiFetch(`/api/articulos/${articleId}/notas`, { method: 'POST', body: JSON.stringify(nota) });
}

export function editarNota(articleId: string, notaId: string, cambios: { texto?: string; color?: ColorNota }): Promise<NotaLibro> {
  return apiFetch(`/api/articulos/${articleId}/notas/${notaId}`, { method: 'PATCH', body: JSON.stringify(cambios) });
}

export function borrarNota(articleId: string, notaId: string): Promise<{ mensaje: string }> {
  return apiFetch(`/api/articulos/${articleId}/notas/${notaId}`, { method: 'DELETE' });
}

/** Ids de los recursos que el usuario marcó como favoritos. */
export function listarFavoritos(): Promise<{ favoritos: string[] }> {
  return apiFetch('/api/articulos/favoritos');
}

export function marcarFavorito(articleId: string): Promise<{ article_id: string; favorito: boolean }> {
  return apiFetch(`/api/articulos/${articleId}/favorito`, { method: 'PUT' });
}

export function quitarFavorito(articleId: string): Promise<{ article_id: string; favorito: boolean }> {
  return apiFetch(`/api/articulos/${articleId}/favorito`, { method: 'DELETE' });
}

/** Copia el PDF del recurso a «Mi nube» del usuario (dentro de R2; cuenta para su cuota). */
export function guardarEnMiNube(articleId: string): Promise<{ archivo: { id: string; nombre: string; size_bytes: number } }> {
  return apiFetch(`/api/almacenamiento/biblioteca/${articleId}/guardar`, { method: 'POST' });
}
