/**
 * Subida real de archivos para Chats (imágenes, PDFs, documentos).
 *
 * Mismo patrón ya usado para las notas de voz: no hay bucket de
 * almacenamiento conectado (Supabase Storage u otro), así que el archivo se
 * manda como base64 dentro del mensaje mismo, que Mongo guarda tal cual.
 * Para que eso siga siendo viable, las imágenes se comprimen/redimensionan
 * en el navegador ANTES de mandarlas — igual que el audio se graba liviano
 * desde el origen en vez de comprimirlo después.
 */

/** Debe coincidir con MAX_FILE_BASE64_CHARS en chats.py. */
export const MAX_FILE_BASE64_CHARS = 10 * 1024 * 1024;

export interface FileAttachmentData {
  name: string;
  mime_type: string;
  size_bytes: number;
  /** Base64 sin el prefijo "data:...;base64,". */
  data: string;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] || '';
}

export async function readFileAsBase64(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  return dataUrlToBase64(dataUrl);
}

export function base64ByteLength(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Redimensiona/comprime una imagen usando <canvas>, para que pese poco antes
 * de guardarla como base64. No toca imágenes que ya son pequeñas.
 */
async function compressImage(file: File, maxDimension = 1600, quality = 0.75): Promise<FileAttachmentData> {
  const dataUrl = await readFileAsDataUrl(file);

  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });
  img.src = dataUrl;
  await loaded;

  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Si por lo que sea no hay canvas disponible, se manda la original tal cual.
    return {
      name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      data: dataUrlToBase64(dataUrl),
    };
  }
  ctx.drawImage(img, 0, 0, width, height);

  const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrlToBase64(compressedDataUrl);

  return {
    name: file.name,
    mime_type: 'image/jpeg',
    size_bytes: base64ByteLength(base64),
    data: base64,
  };
}

async function readFileAsIs(file: File): Promise<FileAttachmentData> {
  const dataUrl = await readFileAsDataUrl(file);
  const base64 = dataUrlToBase64(dataUrl);
  return {
    name: file.name,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: base64ByteLength(base64),
    data: base64,
  };
}

/**
 * Arma el `file_attachment` real para mandar en un mensaje: comprime si es
 * imagen, lee tal cual si no. Tira un Error con mensaje en español si el
 * archivo (ya codificado) supera el límite que también valida el backend.
 */
export async function buildFileAttachment(file: File): Promise<FileAttachmentData> {
  // El GIF se manda tal cual, sin pasar por <canvas> — dibujarlo en un canvas
  // solo captura el frame actual y lo aplana a JPEG estático, perdiendo la
  // animación por completo.
  const isCompressibleImage = file.type.startsWith('image/') && file.type !== 'image/gif';

  const attachment = isCompressibleImage ? await compressImage(file) : await readFileAsIs(file);

  if (attachment.data.length > MAX_FILE_BASE64_CHARS) {
    throw new Error('El archivo es demasiado pesado (máximo ~7 MB).');
  }

  return attachment;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
