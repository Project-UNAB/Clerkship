import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Edit3, AlertCircle } from 'lucide-react';
import type { Articulo } from '../../data/articulosApi';
import { IDIOMAS, type IdiomaDocumento } from './idiomas';

interface EditarArticuloModalProps {
  articulo: Articulo;
  esAdmin: boolean;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    authors?: string;
    year?: number;
    pages?: number;
    description?: string;
    idioma?: IdiomaDocumento;
  }) => Promise<void>;
}

export default function EditarArticuloModal({
  articulo,
  esAdmin,
  onClose,
  onSave,
}: EditarArticuloModalProps) {
  const [title, setTitle] = useState(articulo.title);
  const [authors, setAuthors] = useState(articulo.authors || '');
  const [year, setYear] = useState(articulo.year ? String(articulo.year) : '');
  const [pages, setPages] = useState(articulo.pages ? String(articulo.pages) : '');
  const [description, setDescription] = useState(articulo.description || '');
  const [idioma, setIdioma] = useState<IdiomaDocumento | ''>(articulo.idioma ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) {
      setError('El título es requerido.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        authors: authors.trim() || undefined,
        year: year ? parseInt(year, 10) : undefined,
        pages: pages ? parseInt(pages, 10) : undefined,
        description: description.trim() || undefined,
        idioma: idioma || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el recurso.');
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
        style={{ maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="dfm-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Edit3 size={17} color="#0284C7" />
            <span style={{ fontWeight: 700 }}>Editar recurso</span>
          </div>
          <button type="button" className="dfm-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {!esAdmin && articulo.estado === 'APROBADO' && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              padding: '10px 12px',
              borderRadius: 8,
              background: '#FEF3C7',
              color: '#92400E',
              fontSize: '0.8rem',
              marginTop: 10,
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Al editar este recurso publicado, volverá al estado <strong>En revisión</strong> hasta que un administrador lo apruebe nuevamente.
            </span>
          </div>
        )}

        <label className="dfm-label">Título del recurso *</label>
        <input
          type="text"
          className="dfm-input"
          value={title}
          onChange={e => { setTitle(e.target.value); if (error) setError(null); }}
          maxLength={255}
          placeholder="Título del libro o guía"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
          <div>
            <label className="dfm-label">Autores</label>
            <input
              type="text"
              className="dfm-input"
              value={authors}
              onChange={e => setAuthors(e.target.value)}
              maxLength={500}
              placeholder="Dr. Autor, Dra. Coautora"
            />
          </div>
          <div>
            <label className="dfm-label">Año</label>
            <input
              type="number"
              className="dfm-input"
              value={year}
              onChange={e => setYear(e.target.value)}
              placeholder="Ej. 2024"
              min={1800}
              max={2100}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label className="dfm-label">Número de páginas</label>
            <input
              type="number"
              className="dfm-input"
              value={pages}
              onChange={e => setPages(e.target.value)}
              placeholder="Ej. 32"
              min={1}
              max={10000}
            />
          </div>
          <div>
            <label className="dfm-label">Idioma</label>
            <select className="dfm-input" value={idioma} onChange={e => setIdioma(e.target.value as IdiomaDocumento | '')}>
              <option value="" disabled>Sin indicar</option>
              {IDIOMAS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </div>
        </div>

        <label className="dfm-label">Descripción</label>
        <textarea
          className="dfm-input"
          style={{ minHeight: '75px', resize: 'vertical' }}
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={2000}
          placeholder="Resumen o descripción del documento..."
        />

        {error && (
          <p className="dfm-error" style={{ color: '#ef4444', marginTop: 8, fontSize: '0.85rem' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            className="dfm-btn-cancel"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border, #E2E8F0)',
              background: 'transparent',
              color: 'var(--ink)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="dfm-save-btn"
            style={{ padding: '8px 16px', margin: 0 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
