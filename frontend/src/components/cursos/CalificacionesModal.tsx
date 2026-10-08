import { useEffect, useState } from 'react';
import { X, Loader2, ClipboardList, HelpCircle } from 'lucide-react';
import {
  obtenerCalificaciones, obtenerMisCalificaciones,
  type LibroCalificaciones, type MisCalificaciones,
} from '../../data/cursoCalificacionesApi';

interface Props {
  courseId: string;
  esDocente: boolean;
  onClose: () => void;
}

function celdaTexto(score: number | null | undefined, maxScore: number | null | undefined, status?: string) {
  if (score === null || score === undefined) {
    return status === 'submitted' ? 'Sin calificar' : '—';
  }
  return maxScore !== null && maxScore !== undefined ? `${score} / ${maxScore}` : `${score}`;
}

export default function CalificacionesModal({ courseId, esDocente, onClose }: Props) {
  const [libro, setLibro] = useState<LibroCalificaciones | null>(null);
  const [mias, setMias] = useState<MisCalificaciones | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const promesa = esDocente ? obtenerCalificaciones(courseId) : obtenerMisCalificaciones(courseId);
    promesa
      .then(res => { if (esDocente) setLibro(res as LibroCalificaciones); else setMias(res as MisCalificaciones); })
      .catch(err => setError(err?.message || 'No se pudieron cargar las calificaciones.'))
      .finally(() => setLoading(false));
  }, [courseId, esDocente]);

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal ccv-modal-form-wide" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>Calificaciones</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-modal-body" style={{ padding: '14px 18px' }}>
          {loading && <Loader2 size={20} className="dfm-spin" />}
          {error && <p className="ccv-form-error">{error}</p>}

          {!loading && esDocente && libro && (
            libro.items.length === 0 ? (
              <p className="ccv-empty-note">Este curso todavía no tiene tareas ni cuestionarios calificables.</p>
            ) : (
              <div className="ccv-tabla-wrap">
                <table className="ccv-quiz-tabla ccv-grade-table">
                  <thead>
                    <tr>
                      <th>Estudiante</th>
                      {libro.items.map(it => (
                        <th key={it.id} title={it.title}>
                          <div className="ccv-grade-col-head">
                            {it.type === 'ASSIGNMENT' ? <ClipboardList size={12} /> : <HelpCircle size={12} />}
                            <span>{it.title}</span>
                          </div>
                        </th>
                      ))}
                      <th>Promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {libro.estudiantes.map(fila => (
                      <tr key={fila.student_id}>
                        <td>{fila.nombre}</td>
                        {libro.items.map(it => {
                          const c = fila.calificaciones[it.id];
                          return <td key={it.id}>{celdaTexto(c?.score, it.max_score, c?.status)}</td>;
                        })}
                        <td><strong>{fila.promedio !== null ? `${fila.promedio}%` : '—'}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {!loading && !esDocente && mias && (
            mias.items.length === 0 ? (
              <p className="ccv-empty-note">Este curso todavía no tiene tareas ni cuestionarios calificables.</p>
            ) : (
              <>
                <div className="ccv-tabla-wrap">
                  <table className="ccv-quiz-tabla">
                    <thead><tr><th>Actividad</th><th>Nota</th></tr></thead>
                    <tbody>
                      {mias.items.map(it => {
                        const c = mias.calificaciones[it.id];
                        return (
                          <tr key={it.id}>
                            <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {it.type === 'ASSIGNMENT' ? <ClipboardList size={13} /> : <HelpCircle size={13} />}
                              {it.title}
                            </td>
                            <td>{celdaTexto(c?.score, it.max_score, c?.status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p style={{ marginTop: 14, fontSize: 13, fontWeight: 700 }}>
                  Promedio general: {mias.promedio !== null ? `${mias.promedio}%` : '—'}
                </p>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
