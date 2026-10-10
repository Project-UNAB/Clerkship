import { useEffect, useState } from 'react';
import { X, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { borrarCursoDefinitivamente, listarPapeleraCursos, restaurarCurso } from '../../data/cursosApi';
import type { Course } from '../../data/consultasApi';
import PortadaCurso from './PortadaCurso';
import { formatFecha as formatFechaColombia } from '../../utils/fechas';

interface Props {
  onClose: () => void;
  /** Un curso volvió de la papelera: la página lo agrega de nuevo a la lista. */
  onRestaurado: (curso: Course) => void;
}

function formatFecha(iso: string | null | undefined) {
  if (!iso) return '';
  return formatFechaColombia(iso);
}

/** Papelera del docente: cursos eliminados que se pueden restaurar tal como
 * estaban, o borrar para siempre. */
export default function PapeleraCursosModal({ onClose, onRestaurado }: Props) {
  const [cursos, setCursos] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    listarPapeleraCursos()
      .then(res => setCursos(res.cursos))
      .catch(err => setError(err?.message || 'No se pudo cargar la papelera.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleRestaurar(curso: Course) {
    setOcupado(curso.id);
    setError(null);
    try {
      const restaurado = await restaurarCurso(curso.id);
      setCursos(prev => prev.filter(c => c.id !== curso.id));
      onRestaurado(restaurado);
    } catch (err: any) {
      setError(err?.message || 'No se pudo restaurar el curso.');
    } finally {
      setOcupado(null);
    }
  }

  async function handleBorrarParaSiempre(curso: Course) {
    const aviso = `¿Borrar "${curso.name}" para siempre?\n\n`
      + 'Se pierden sus bloques, material, tareas, entregas, cuestionarios, notas y avisos. Esto no se puede deshacer.';
    if (!window.confirm(aviso)) return;
    setOcupado(curso.id);
    setError(null);
    try {
      await borrarCursoDefinitivamente(curso.id);
      setCursos(prev => prev.filter(c => c.id !== curso.id));
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar el curso.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal ccv-modal-form-wide" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>Papelera de cursos</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-modal-body ccv-tarea-body">
          <p className="ccv-form-hint">
            Un curso en la papelera no lo ven los estudiantes, pero conserva todo. Restáuralo para dejarlo como estaba.
          </p>
          {loading && <Loader2 size={20} className="dfm-spin" />}
          {!loading && cursos.length === 0 && <p className="ccv-empty-note" style={{ margin: 0 }}>La papelera está vacía.</p>}

          {cursos.map(curso => (
            <div key={curso.id} className="cur-papelera-fila">
              <div className="cur-papelera-portada">
                <PortadaCurso id={curso.id} name={curso.name} url={curso.cover_url} />
              </div>
              <div className="cur-papelera-texto">
                <strong>{curso.name}</strong>
                <span>
                  {curso.academic_period ? `${curso.academic_period} · ` : ''}Eliminado el {formatFecha(curso.deleted_at)}
                </span>
              </div>
              <div className="cur-papelera-acciones">
                <button type="button" className="ccv-btn-secondary" onClick={() => handleRestaurar(curso)} disabled={ocupado === curso.id}>
                  {ocupado === curso.id ? <Loader2 size={14} className="dfm-spin" /> : <RotateCcw size={14} />} Restaurar
                </button>
                <button
                  type="button" className="ccv-link-btn cur-portada-quitar"
                  onClick={() => handleBorrarParaSiempre(curso)} disabled={ocupado === curso.id}
                >
                  <Trash2 size={12} /> Borrar para siempre
                </button>
              </div>
            </div>
          ))}

          {error && <p className="ccv-form-error" role="alert">{error}</p>}
        </div>

        <div className="ccv-modal-actions">
          <button type="button" className="ccv-btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
