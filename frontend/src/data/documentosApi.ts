/**
 * Cliente del backend real para Carpetas y Documentos del Dashboard
 * (/api/documentos). La carpeta (nombre, color) vive en Postgres; el
 * archivo real (bytes + metadata) vive en Mongo, como base64 — no hay
 * bucket de almacenamiento conectado todavía.
 */
import { apiFetch } from './apiClient';

export interface DocumentFolder {
  id: string;
  parent_folder_id: string | null;
  name: string;
  color: string;
  file_count: number;
  total_size_bytes: number;
  subfolder_count: number;
  created_at: string | null;
}

export interface DocumentSummary {
  id: string;
  folder_id: string | null;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string | null;
}

export interface DocumentDetail extends DocumentSummary {
  data: string;
}

export function listFolders(): Promise<{ folders: DocumentFolder[] }> {
  return apiFetch('/api/documentos/carpetas');
}

export function createFolder(
  name: string,
  color: string,
  parentFolderId?: string | null,
): Promise<{ folder: DocumentFolder }> {
  return apiFetch('/api/documentos/carpetas', {
    method: 'POST',
    body: JSON.stringify({ name, color, parent_folder_id: parentFolderId || null }),
  });
}

export function updateFolder(
  id: string,
  updates: { name?: string; color?: string; parent_folder_id?: string | null },
): Promise<{ folder: DocumentFolder }> {
  return apiFetch(`/api/documentos/carpetas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function deleteFolder(id: string): Promise<{ ok: boolean; documents_deleted: number }> {
  return apiFetch(`/api/documentos/carpetas/${id}`, { method: 'DELETE' });
}

export function listDocuments(folderId?: string, limit?: number): Promise<{ documents: DocumentSummary[] }> {
  const params = new URLSearchParams();
  if (folderId) params.set('folder_id', folderId);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return apiFetch(`/api/documentos/documentos${qs ? `?${qs}` : ''}`);
}

export function getDocument(id: string): Promise<{ document: DocumentDetail }> {
  return apiFetch(`/api/documentos/documentos/${id}`);
}

export interface UploadDocumentPayload {
  name: string;
  mime_type: string;
  data: string;
  size_bytes?: number;
  folder_id?: string | null;
}

export function uploadDocument(payload: UploadDocumentPayload): Promise<{ document: DocumentSummary }> {
  return apiFetch('/api/documentos/documentos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateDocument(
  id: string,
  updates: { name?: string; folder_id?: string | null },
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/documentos/documentos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function deleteDocument(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/documentos/documentos/${id}`, { method: 'DELETE' });
}
