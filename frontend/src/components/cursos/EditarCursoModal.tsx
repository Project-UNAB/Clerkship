import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { actualizarCurso } from '../../data/cursosApi';
import type { Course } from '../../data/consultasApi';
import RichTextEditor from './RichTextEditor';

interface Props {
  curso: Course;
  onClose: () => void;
  onSaved: (curso: Course) => void;
}

export default function EditarCursoModal({ curso, onClose, onSaved }: Props) {
  const [name, setName] = useState(curso.name);
  const [periodo, setPeriodo] = useState(curso.academic_period || '');
  const [description, setDescription] = useState(curso.description || '<p></p>');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    if (!name.trim()) {
      setError('Ponle un nombre al curso.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const actualizado = await actualizarCurso(curso.id, {
        name: name.trim(),
        description,
        academic_period: periodo.trim(),
      });
      onSaved(actualizado);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el curso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal ccv-modal-form ccv-modal-form-wide" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>Editar curso</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-form-body">
          <div className="ccv-form-row">
            <label className="ccv-form-label">
              Nombre
              <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={150} />
            </label>
            <label className="ccv-form-label">
              Período académico
              <input type="text" value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="2026-2" maxLength={20} />
            </label>
          </div>

          <label className="ccv-form-label">
            Descripción / bienvenida del curso
            <RichTextEditor content={description} onChange={setDescription} placeholder="Escribe una bienvenida, el cronograma, los objetivos..." />
          </label>

          {error && <p className="ccv-form-error">{error}</p>}
        </div>

        <div className="ccv-modal-actions">
          <button type="button" className="ccv-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="ccv-btn-primary" onClick={handleGuardar} disabled={saving}>
            {saving ? <Loader2 size={14} className="dfm-spin" /> : null} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
