import { useEffect, useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle, Circle, CheckSquare, Square } from 'lucide-react';
import type { CourseContentItem } from '../../data/cursoContenidoApi';
import {
  iniciarIntento, listarIntentos, obtenerIntento, responderIntento,
  type QuizAttempt,
} from '../../data/cursoQuizApi';

interface Props {
  courseId: string;
  blockId: string;
  item: CourseContentItem;
  onClose: () => void;
}

function formatFecha(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type Vista = 'lista' | 'respondiendo' | 'resultado';

export default function TomarQuizModal({ courseId, blockId, item, onClose }: Props) {
  const [vista, setVista] = useState<Vista>('lista');
  const [intentosPrevios, setIntentosPrevios] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [intentoActual, setIntentoActual] = useState<QuizAttempt | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, Set<string>>>({});
  const [enviando, setEnviando] = useState(false);

  const [revision, setRevision] = useState<QuizAttempt | null>(null);

  function cargarIntentos() {
    setLoading(true);
    listarIntentos(courseId, blockId, item.id)
      .then(res => setIntentosPrevios(res.intentos))
      .catch(err => setError(err?.message || 'No se pudo cargar el cuestionario.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargarIntentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function handleComenzar() {
    setError(null);
    try {
      const intento = await iniciarIntento(courseId, blockId, item.id);
      setIntentoActual(intento);
      setRespuestas({});
      setVista('respondiendo');
    } catch (err: any) {
      setError(err?.message || 'No se pudo iniciar el intento.');
    }
  }

  function toggleOpcion(preguntaId: string, opcionId: string, tipo: string) {
    setRespuestas(prev => {
      const next = { ...prev };
      const actual = new Set(next[preguntaId] || []);
      if (tipo === 'MULTIPLE_CHOICE') {
        if (actual.has(opcionId)) actual.delete(opcionId);
        else actual.add(opcionId);
      } else {
        actual.clear();
        actual.add(opcionId);
      }
      next[preguntaId] = actual;
      return next;
    });
  }

  async function handleEntregar() {
    if (!intentoActual) return;
    setEnviando(true);
    setError(null);
    try {
      const answers = (intentoActual.preguntas || []).map(p => ({
        question_id: p.id,
        selected_choice_ids: Array.from(respuestas[p.id] || []),
      }));
      await responderIntento(courseId, blockId, item.id, intentoActual.id, answers);
      const detalle = await obtenerIntento(courseId, blockId, item.id, intentoActual.id);
      setRevision(detalle);
      setVista('resultado');
      cargarIntentos();
    } catch (err: any) {
      setError(err?.message || 'No se pudo entregar el intento.');
    } finally {
      setEnviando(false);
    }
  }

  async function handleVerResultado(attemptId: string) {
    try {
      const detalle = await obtenerIntento(courseId, blockId, item.id, attemptId);
      setRevision(detalle);
      setVista('resultado');
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar el resultado.');
    }
  }

  const intentosCompletados = intentosPrevios.filter(a => a.completed);
  const puedeIntentar = !item.max_attempts || intentosPrevios.length < item.max_attempts;

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal ccv-modal-form-wide" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>{item.title}</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-modal-body" style={{ padding: '14px 18px' }}>
          {loading && <Loader2 size={20} className="dfm-spin" />}
          {error && <p className="ccv-form-error">{error}</p>}

          {!loading && vista === 'lista' && (
            <>
              {item.description && <p className="ccv-modal-desc" style={{ padding: 0, marginBottom: 12 }}>{item.description}</p>}

              <div className="ccv-aviso-meta" style={{ padding: 0, marginBottom: 12 }}>
                {item.time_limit_minutes && <span>Duración: {item.time_limit_minutes} min</span>}
                {item.max_attempts && <span>Intentos: {intentosPrevios.length} / {item.max_attempts}</span>}
                {item.due_at && <span>Cierra: {formatFecha(item.due_at)}</span>}
              </div>

              {intentosCompletados.length > 0 && (
                <div className="ccv-tabla-wrap" style={{ marginBottom: 14 }}>
                  <table className="ccv-quiz-tabla">
                    <thead><tr><th>Intento</th><th>Entregado</th><th>Puntaje</th><th></th></tr></thead>
                    <tbody>
                      {intentosCompletados.map(a => (
                        <tr key={a.id}>
                          <td>#{a.attempt_number}</td>
                          <td>{formatFecha(a.submitted_at)}</td>
                          <td>{a.score} / {a.max_score}</td>
                          <td><button type="button" className="ccv-btn-secondary" onClick={() => handleVerResultado(a.id)}>Ver</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {puedeIntentar ? (
                <button type="button" className="ccv-btn-primary" onClick={handleComenzar}>Comenzar intento</button>
              ) : (
                <p className="ccv-empty-note">Ya usaste todos tus intentos para este cuestionario.</p>
              )}
            </>
          )}

          {vista === 'respondiendo' && intentoActual && (
            <>
              {(intentoActual.preguntas || []).map((p, idx) => (
                <div key={p.id} className="ccv-quiz-question-row" style={{ cursor: 'default' }}>
                  <div className="ccv-quiz-question-main" style={{ width: '100%' }}>
                    <span className="ccv-quiz-question-num">{idx + 1}.</span>
                    <div style={{ flex: 1 }}>
                      <p className="ccv-quiz-question-prompt">{p.prompt} <span className="ccv-quiz-question-meta">({p.points} pts)</span></p>
                      <div className="ccv-quiz-answer-options">
                        {p.choices.map(c => {
                          const seleccionada = respuestas[p.id]?.has(c.id) || false;
                          const Icon = p.type === 'MULTIPLE_CHOICE' ? (seleccionada ? CheckSquare : Square) : (seleccionada ? CheckCircle2 : Circle);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={`ccv-quiz-option-btn ${seleccionada ? 'is-selected' : ''}`}
                              onClick={() => toggleOpcion(p.id, c.id, p.type)}
                            >
                              <Icon size={16} />
                              <span>{c.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="ccv-modal-actions" style={{ padding: '14px 0 0' }}>
                <button type="button" className="ccv-btn-primary" onClick={handleEntregar} disabled={enviando}>
                  {enviando ? <Loader2 size={14} className="dfm-spin" /> : null} Entregar
                </button>
              </div>
            </>
          )}

          {vista === 'resultado' && revision && (
            <>
              <div className="ccv-quiz-score-banner">
                <span className="ccv-quiz-score-num">{revision.score} / {revision.max_score}</span>
                <span>puntos</span>
              </div>

              {(revision.preguntas || []).map((p: any, idx: number) => {
                const tuRespuesta: string[] = p.tu_respuesta?.selected_choice_ids || [];
                const acerto = p.tu_respuesta?.is_correct;
                return (
                  <div key={p.id} className="ccv-quiz-question-row" style={{ cursor: 'default' }}>
                    <div className="ccv-quiz-question-main" style={{ width: '100%' }}>
                      <span className="ccv-quiz-question-num">{idx + 1}.</span>
                      <div style={{ flex: 1 }}>
                        <p className="ccv-quiz-question-prompt">
                          {p.prompt}{' '}
                          {acerto ? <CheckCircle2 size={14} color="#10b981" style={{ verticalAlign: 'middle' }} /> : <XCircle size={14} color="#ef4444" style={{ verticalAlign: 'middle' }} />}
                        </p>
                        <div className="ccv-quiz-answer-options">
                          {p.choices.map((c: any) => {
                            const fueSeleccionada = tuRespuesta.includes(c.id);
                            let clase = '';
                            if (c.is_correct) clase = 'is-correct';
                            else if (fueSeleccionada) clase = 'is-wrong';
                            return (
                              <div key={c.id} className={`ccv-quiz-option-btn ccv-quiz-option-review ${clase} ${fueSeleccionada ? 'was-selected' : ''}`}>
                                {fueSeleccionada ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                                <span>{c.text}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="ccv-modal-actions" style={{ padding: '14px 0 0' }}>
                <button type="button" className="ccv-btn-secondary" onClick={() => setVista('lista')}>Volver</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
