import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { crearAviso, actualizarAviso, type CourseAnnouncement } from '../../data/cursoAvisosApi';
import RichTextEditor from './RichTextEditor';

interface Props {
  courseId: string;
  aviso?: CourseAnnouncement | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function CrearAvisoModal({ courseId, aviso, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(aviso?.title || '');
  const [body, setBody] = useState(aviso?.body || '<p></p>');
  const [pinned, setPinned] = useState(aviso?.pinned || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) {
      setError('Ponle un título.');
      return;
    }
    const textoPlano = body.replace(/<[^>]*>/g, '').trim();
    if (!textoPlano) {
      setError('Escribe el contenido del aviso.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (aviso) {
        await actualizarAviso(courseId, aviso.id, { title: title.trim(), body, pinned });
      } else {
        await crearAviso(courseId, { title: title.trim(), body, pinned });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el aviso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal ccv-modal-form ccv-modal-form-wide" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>{aviso ? 'Editar aviso' : 'Nuevo aviso'}</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-form-body">
          <label className="ccv-form-label">
            Título
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Entrega 1 ya está abierta" />
          </label>

          <label className="ccv-form-label">
            Contenido
            <RichTextEditor content={body} onChange={setBody} placeholder="Escribe el anuncio para tus estudiantes..." />
          </label>

          <label className="ccv-checkbox-label">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
            Fijar arriba de los demás avisos
          </label>

          {error && <p className="ccv-form-error">{error}</p>}
        </div>

        <div className="ccv-modal-actions">
          <button type="button" className="ccv-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="ccv-btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 size={14} className="dfm-spin" /> : null} {aviso ? 'Guardar' : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
