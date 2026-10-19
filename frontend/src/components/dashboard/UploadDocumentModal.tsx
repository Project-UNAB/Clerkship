import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, UploadCloud, FileText } from 'lucide-react';
import { formatFileSize } from '../../utils/fileUpload';
import { problemaDeArchivo } from '../../data/almacenamientoApi';
import type { DocumentFolder } from '../../data/documentosApi';

interface UploadDocumentModalProps {
  folders: DocumentFolder[];
  defaultFolderId?: string | null;
  onClose: () => void;
  /** Sube el archivo (directo a R2, hasta 2 GB); `alProgresar` recibe de 0 a 1. */
  onUpload: (file: File, folderId: string | null, alProgresar?: (fraccion: number) => void) => Promise<void>;
}

export default function UploadDocumentModal({ folders, defaultFolderId, onClose, onUpload }: UploadDocumentModalProps) {
  const [folderId, setFolderId] = useState<string>(defaultFolderId || '');
  // El archivo se guarda tal cual: no se lee en memoria (puede pesar 2 GB).
  const [picked, setPicked] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const problema = problemaDeArchivo(file);
    setError(problema);
    setPicked(problema ? null : file);
  }

  async function handleConfirm() {
    if (!picked) {
      setError('Selecciona un archivo primero.');
      return;
    }
    setUploading(true);
    setProgreso(0);
    setError(null);
    try {
      await onUpload(picked, folderId || null, setProgreso);
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
      onClick={uploading ? undefined : onClose}
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
          <button type="button" className="dfm-close-btn" onClick={onClose} disabled={uploading}><X size={16} /></button>
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
          >
            <UploadCloud size={26} />
            <span>Haz clic para seleccionar un archivo (hasta 2 GB)</span>
          </button>
        ) : (
          <div className="dfm-picked-file">
            <FileText size={22} />
            <div>
              <p>{picked.name}</p>
              <span>{formatFileSize(picked.size)}</span>
            </div>
            <button type="button" onClick={() => setPicked(null)} disabled={uploading}><X size={14} /></button>
          </div>
        )}

        <label className="dfm-label">Carpeta (opcional)</label>
        <select className="dfm-select" value={folderId} onChange={e => setFolderId(e.target.value)} disabled={uploading}>
          <option value="">Sin carpeta</option>
          {folders.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        {uploading && (
          <div className="dfm-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progreso * 100)}>
            <div className="dfm-progreso-barra" style={{ width: `${Math.round(progreso * 100)}%` }} />
            <span>{Math.round(progreso * 100)} %</span>
          </div>
        )}

        {error && <p className="dfm-error">{error}</p>}

        <button type="button" className="dfm-save-btn" onClick={handleConfirm} disabled={uploading || !picked}>
          {uploading ? `Subiendo… ${Math.round(progreso * 100)} %` : 'Subir documento'}
        </button>
      </motion.div>
    </motion.div>
  );
}
