import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, BookUp } from 'lucide-react';
import type { DocumentSummary } from '../../data/documentosApi';

interface PublicarEnBibliotecaModalProps {
  doc: DocumentSummary;
  onClose: () => void;
  onPublish: (titulo: string) => Promise<void>;
}

/** Publica un PDF de la Carpeta de Documentos (ya en R2) como recurso de la
 *  biblioteca. Reutiliza las mismas clases "dfm-*" que el resto de modales
 *  del Dashboard para que se vea igual. */
export default function PublicarEnBibliotecaModal({ doc, onClose, onPublish }: PublicarEnBibliotecaModalProps) {
  const [titulo, setTitulo] = useState(doc.name.replace(/\.pdf$/i, ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!titulo.trim()) {
      setError('Ponele un título al recurso.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onPublish(titulo.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar en la biblioteca.');
      setSaving(false);
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
          <span>Publicar en la biblioteca</span>
          <button type="button" className="dfm-close-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="dfm-preview">
          <BookUp size={36} color="#0284C7" strokeWidth={1.5} />
        </div>

        <p className="dfm-label" style={{ fontWeight: 400 }}>
          Se publica <strong>{doc.name}</strong>. Cualquier estudiante va a poder verlo en Biblioteca.
        </p>

        <label className="dfm-label">Título del recurso</label>
        <input
          type="text"
          className="dfm-input"
          value={titulo}
          onChange={e => { setTitulo(e.target.value); if (error) setError(null); }}
          autoFocus
          maxLength={255}
        />

        {error && <p className="dfm-error">{error}</p>}

        <button type="button" className="dfm-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Publicando...' : 'Publicar'}
        </button>
      </motion.div>
    </motion.div>
  );
}
