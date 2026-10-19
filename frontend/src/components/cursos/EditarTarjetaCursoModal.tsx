import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { actualizarCurso, quitarPortadaCurso, type PortadaNueva } from '../../data/cursosApi';
import type { Course } from '../../data/consultasApi';
import PortadaPicker from './PortadaPicker';

interface Props {
  curso: Course;
  /** Nombre y período tal como están en pantalla (pueden estar a medio editar). */
  nombre: string;
  periodo: string;
  onClose: () => void;
  onSaved: (curso: Course) => void;
}

const MAX_TEXTO = 280;

/** Edita cómo se ve el curso en "Mis cursos": la imagen y el texto corto de
 * la tarjeta. Ese texto es propio de la tarjeta; no es la descripción que se
 * lee dentro del curso. */
export default function EditarTarjetaCursoModal({ curso, nombre, periodo, onClose, onSaved }: Props) {
  const [texto, setTexto] = useState(curso.card_summary || '');
  const [portada, setPortada] = useState<PortadaNueva | null>(null);
  // La portada guardada puede quitarse sin cerrar el modal.
  const [urlPortada, setUrlPortada] = useState(curso.cover_full_url || curso.cover_url || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    setSaving(true);
    setError(null);
    try {
      const actualizado = await actualizarCurso(curso.id, { card_summary: texto.trim() }, portada);
      onSaved(actualizado);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la tarjeta.');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuitarPortada() {
    if (!window.confirm('¿Quitar la imagen de la tarjeta de este curso?')) return;
    setSaving(true);
    setError(null);
    try {
      const actualizado = await quitarPortadaCurso(curso.id);
      setUrlPortada(null);
      onSaved(actualizado);
    } catch (err: any) {
      setError(err?.message || 'No se pudo quitar la imagen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal ccv-modal-form" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>Tarjeta del curso</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-form-body">
          <p className="ccv-form-hint">
            Así se ve el curso en la lista de "Mis cursos". El texto de la tarjeta es aparte del contenido del curso.
          </p>

          {/* La imagen y el texto se ven como en la tarjeta real mientras se editan. */}
          <div className="cdt-tarjeta">
            <PortadaPicker
              courseId={curso.id}
              courseName={nombre || curso.name}
              urlActual={urlPortada}
              value={portada}
              onChange={setPortada}
              onQuitarActual={handleQuitarPortada}
              disabled={saving}
            />
            <div className="cdt-cuerpo" aria-label="Vista previa de la tarjeta">
              <span className="mc-card-category">{periodo.trim() || 'CURSO CLÍNICO'}</span>
              <p className="cdt-titulo">{nombre.trim() || curso.name}</p>
              <p className={`mc-card-resumen ${texto.trim() ? '' : 'is-vacio'}`}>
                {texto.trim() || 'Sin texto en la tarjeta.'}
              </p>
            </div>
          </div>

          <label className="ccv-form-label">
            Texto de la tarjeta
            <textarea
              rows={3}
              value={texto}
              maxLength={MAX_TEXTO}
              onChange={e => setTexto(e.target.value)}
              placeholder="Una o dos frases que inviten a entrar al curso."
            />
            <span className="ccv-form-hint cdt-contador">{texto.length}/{MAX_TEXTO}</span>
          </label>

          {error && <p className="ccv-form-error" role="alert">{error}</p>}
        </div>

        <div className="ccv-modal-actions">
          <button type="button" className="ccv-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="ccv-btn-primary" onClick={handleGuardar} disabled={saving}>
            {saving ? <Loader2 size={14} className="dfm-spin" /> : null} Guardar tarjeta
          </button>
        </div>
      </div>
    </div>
  );
}
