/**
 * Cliente de /api/almacenamiento — archivos del usuario en Cloudflare R2
 * (5 GB por usuario) y publicación de PDF en la biblioteca.
 *
 * La subida es directa al bucket: el backend solo firma la URL de PUT.
 */
import { apiFetch } from './apiClient';

export const TIPOS_PERMITIDOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
];

/** Máximo por archivo: 2 GB (la subida va directo a R2, no pasa por el backend). */
export const MAX_FILE_BYTES = 2 * 1024 ** 3;
export const QUOTA_BYTES = 5 * 1024 ** 3;

/** Por qué no se puede subir el archivo, o null si se puede (tipo y tamaño). */
export function problemaDeArchivo(file: File): string | null {
  const tipo = file.type || 'application/octet-stream';
  if (!TIPOS_PERMITIDOS.includes(tipo)) {
    return `"${file.name}" no es de un tipo permitido (PDF, Office, imágenes, texto, video o audio).`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" supera el máximo de 2 GB por archivo.`;
  }
  return null;
}

export interface ArchivoR2 {
  id: string;
  carpeta_id: string | null;
  nombre: string;
  mime_type: string;
  size_bytes: number;
  estado: 'PENDIENTE' | 'LISTO';
  created_at: string | null;
}

export interface UsoAlmacenamiento {
  usado_bytes: number;
  limite_bytes: number;
}

export function obtenerUso(): Promise<UsoAlmacenamiento> {
  return apiFetch('/api/almacenamiento/uso');
}

export function listarArchivos(carpetaId?: string | null): Promise<{ archivos: ArchivoR2[] }> {
  const qs = carpetaId ? `?carpeta_id=${encodeURIComponent(carpetaId)}` : '';
  return apiFetch(`/api/almacenamiento/archivos${qs}`);
}

interface IniciarSubidaResponse {
  id: string;
  upload_url: string;
  headers: Record<string, string>;
}

function iniciarSubida(payload: { nombre: string; mime_type: string; size_bytes: number; carpeta_id?: string | null }) {
  return apiFetch<IniciarSubidaResponse>('/api/almacenamiento/subidas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function confirmarSubida(id: string): Promise<{ archivo: ArchivoR2 }> {
  return apiFetch(`/api/almacenamiento/subidas/${id}/confirmar`, { method: 'POST' });
}

/**
 * Sube un archivo completo: pide la URL firmada, lo manda directo a R2 y
 * confirma. El PUT va directo al bucket, no pasa por nuestro backend.
 */
export async function subirArchivo(
  file: File,
  carpetaId: string | null,
  alProgresar?: (fraccion: number) => void,
): Promise<ArchivoR2> {
  const { id, upload_url, headers } = await iniciarSubida({
    nombre: file.name,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    carpeta_id: carpetaId,
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', upload_url);
    Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, String(v)));
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) alProgresar?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error('No se pudo subir el archivo a Cloudflare R2.')));
    xhr.onerror = () => reject(new Error('Se cortó la conexión mientras se subía el archivo.'));
    xhr.send(file);
  });
  alProgresar?.(1);

  const { archivo } = await confirmarSubida(id);
  return archivo;
}

export function actualizarArchivo(
  id: string,
  updates: { nombre?: string; carpeta_id?: string | null },
): Promise<{ archivo: ArchivoR2 }> {
  return apiFetch(`/api/almacenamiento/archivos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function borrarArchivo(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/almacenamiento/archivos/${id}`, { method: 'DELETE' });
}

export function descargarArchivo(id: string): Promise<{ url: string }> {
  return apiFetch(`/api/almacenamiento/archivos/${id}/descarga`);
}

export interface PublicarPayload {
  titulo?: string;
  descripcion?: string;
  specialty?: string;
  autores?: string;
  ano?: number;
  paginas?: number;
  tipo?: 'LIBRO' | 'GUIA' | 'ENSAYO' | 'PROTOCOLO' | 'CASO';
  idioma?: 'es' | 'en';
}

export function publicarEnBiblioteca(id: string, payload: PublicarPayload): Promise<{ article: import('./articulosApi').Articulo }> {
  return apiFetch(`/api/almacenamiento/archivos/${id}/publicar`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
