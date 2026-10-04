import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, UploadCloud, FileText, Loader2 } from 'lucide-react';
import { buildFileAttachment, formatFileSize } from '../../utils/fileUpload';
import type { DocumentFolder } from '../../data/documentosApi';

interface UploadDocumentModalProps {
  folders: DocumentFolder[];
  defaultFolderId?: string | null;
  onClose: () => void;
  onUpload: (file: { name: string; mime_type: string; data: string; size_bytes: number }, folderId: string | null) => Promise<void>;
}

export default function UploadDocumentModal({ folders, defaultFolderId, onClose, onUpload }: UploadDocumentModalProps) {
  const [folderId, setFolderId] = useState<string>(defaultFolderId || '');
  const [picked, setPicked] = useState<{ name: string; mime_type: string; data: string; size_bytes: number } | null>(null);
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      const built = await buildFileAttachment(file);
      setPicked(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setReading(false);
    }
  }

  async function handleConfirm() {
    if (!picked) {
      setError('Elegí un archivo primero.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await onUpload(picked, folderId || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento.');
      setUploading(false);
    }
  }

  return (
    <motion.div
      className="dfm-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="dfm-modal"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="dfm-header">
          <span>Subir documento</span>
          <button type="button" className="dfm-close-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])}
        />

        {!picked ? (
          <button
            type="button"
            className="dfm-dropzone"
            onClick={() => fileInputRef.current?.click()}
            disabled={reading}
          >
            {reading ? <Loader2 size={26} className="dfm-spin" /> : <UploadCloud size={26} />}
            <span>{reading ? 'Leyendo...' : 'Hacé clic para elegir un archivo'}</span>
          </button>
        ) : (
          <div className="dfm-picked-file">
            <FileText size={22} />
            <div>
              <p>{picked.name}</p>
              <span>{formatFileSize(picked.size_bytes)}</span>
            </div>
            <button type="button" onClick={() => setPicked(null)}><X size={14} /></button>
          </div>
        )}

        <label className="dfm-label">Carpeta (opcional)</label>
        <select className="dfm-select" value={folderId} onChange={e => setFolderId(e.target.value)}>
          <option value="">Sin carpeta</option>
          {folders.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        {error && <p className="dfm-error">{error}</p>}

        <button type="button" className="dfm-save-btn" onClick={handleConfirm} disabled={uploading || !picked}>
          {uploading ? 'Subiendo...' : 'Subir documento'}
        </button>
      </motion.div>
    </motion.div>
  );
}
