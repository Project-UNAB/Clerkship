import { useEffect, useRef, useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle, Circle, CheckSquare, Square, Clock } from 'lucide-react';
import { ApiError } from '../../data/apiClient';
import { GRADE_POLICY_LABELS, type CourseContentItem, type GradePolicy } from '../../data/cursoContenidoApi';
import {
  guardarRespuestas, iniciarIntento, listarIntentos, obtenerIntento, responderIntento,
  type QuizAttempt,
} from '../../data/cursoQuizApi';
import { formatFechaHoraCorta } from '../../utils/fechas';

interface Props {
  courseId: string;
  blockId: string;
  item: CourseContentItem;
  onClose: () => void;
}

function formatFecha(iso: string | null) {
  if (!iso) return '—';
  return formatFechaHoraCorta(iso);
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
  const [aviso, setAviso] = useState<string | null>(null);
  const [nota, setNota] = useState<number | null>(null);
  const [politica, setPolitica] = useState<GradePolicy>(item.grade_policy || 'BEST');

  // Cronómetro: el fin se calcula con los segundos que informa el servidor
  // (no con la hora del navegador, que puede estar corrida). El servidor es
  // quien decide si el envío llegó a tiempo; esto solo avisa y entrega solo.
  const [finLocal, setFinLocal] = useState<number | null>(null);
  const [segundos, setSegundos] = useState<number | null>(null);
  const [guardado, setGuardado] = useState<'guardando' | 'guardado' | 'error' | null>(null);
  const sucioRef = useRef(false);
  const entregandoRef = useRef(false);

  function cargarIntentos() {
    setLoading(true);
    listarIntentos(courseId, blockId, item.id)
      .then(res => {
        setIntentosPrevios(res.intentos);
        setNota(res.nota ?? null);
        if (res.grade_policy) setPolitica(res.grade_policy);
      })
      .catch(err => setError(err?.message || 'No se pudo cargar el cuestionario.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargarIntentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  function respuestasPayload(intento: QuizAttempt, actuales: Record<string, Set<string>>) {
    return (intento.preguntas || []).map(p => ({
      question_id: p.id,
      selected_choice_ids: Array.from(actuales[p.id] || []),
    }));
  }

  async function handleComenzar() {
    setError(null);
    setAviso(null);
    try {
      // Si ya había un intento abierto, el servidor devuelve ese mismo con lo guardado.
      const intento = await iniciarIntento(courseId, blockId, item.id);
      const guardadas: Record<string, Set<string>> = {};
      (intento.preguntas || []).forEach(p => {
        if (p.tu_respuesta) guardadas[p.id] = new Set(p.tu_respuesta.selected_choice_ids);
      });
      sucioRef.current = false;
      entregandoRef.current = false;
      setIntentoActual(intento);
      setRespuestas(guardadas);
      setGuardado(null);
      const restantes = intento.segundos_restantes;
      setFinLocal(restantes == null ? null : Date.now() + restantes * 1000);
      setSegundos(restantes ?? null);
      setVista('respondiendo');
    } catch (err: any) {
      setError(err?.message || 'No se pudo iniciar el intento.');
      cargarIntentos();
    }
  }

  // Cuenta regresiva; al llegar a cero entrega sola.
  useEffect(() => {
    if (vista !== 'respondiendo' || finLocal == null) return;
    const tick = () => {
      const quedan = Math.max(0, Math.round((finLocal - Date.now()) / 1000));
      setSegundos(quedan);
      if (quedan === 0) handleEntregar();
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, finLocal, respuestas]);

  // Guardado automático: lo guardado es lo que se califica si se acaba el tiempo.
  useEffect(() => {
    if (vista !== 'respondiendo' || !intentoActual || !sucioRef.current) return;
    const id = window.setTimeout(() => {
      if (entregandoRef.current) return;
      sucioRef.current = false;
      setGuardado('guardando');
      guardarRespuestas(courseId, blockId, item.id, intentoActual.id, respuestasPayload(intentoActual, respuestas))
        .then(() => setGuardado('guardado'))
        .catch(() => setGuardado('error'));
    }, 1200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respuestas, vista, intentoActual]);

  function toggleOpcion(preguntaId: string, opcionId: string, tipo: string) {
    sucioRef.current = true;
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
    // Un solo envío por intento: el botón y el cronómetro pueden coincidir.
    if (!intentoActual || entregandoRef.current) return;
    entregandoRef.current = true;
    setEnviando(true);
    setError(null);
    try {
      let mensaje: string | null = null;
      try {
        const resultado = await responderIntento(
          courseId, blockId, item.id, intentoActual.id, respuestasPayload(intentoActual, respuestas),
        );
        if (resultado.vencido) {
          mensaje = 'El tiempo se había agotado: se calificó solo lo que alcanzaste a guardar a tiempo.';
        }
      } catch (err: any) {
        // 409: el intento ya estaba cerrado (se envió antes o se venció). No
        // hay nada que reintentar; se muestra cómo quedó.
        if (!(err instanceof ApiError) || err.status !== 409) throw err;
        mensaje = err.message;
      }
      const detalle = await obtenerIntento(courseId, blockId, item.id, intentoActual.id);
      setAviso(mensaje);
      setRevision(detalle);
      setFinLocal(null);
      setVista('resultado');
      cargarIntentos();
    } catch (err: any) {
      entregandoRef.current = false;
      setError(err?.message || 'No se pudo entregar el intento.');
    } finally {
      setEnviando(false);
    }
  }

  async function handleVerResultado(attemptId: string) {
    setAviso(null);
    try {
      const detalle = await obtenerIntento(courseId, blockId, item.id, attemptId);
      setRevision(detalle);
      setVista('resultado');
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar el resultado.');
    }
  }

  const intentosCompletados = intentosPrevios.filter(a => a.completed);
  const intentoAbierto = intentosPrevios.find(a => !a.completed) || null;
  const puedeIntentar = !!intentoAbierto || !item.max_attempts || intentosPrevios.length < item.max_attempts;

  function formatTiempo(total: number) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

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
                          <td>{formatFecha(a.submitted_at)}{a.expired ? ' · por tiempo' : ''}</td>
                          <td>{a.score} / {a.max_score}</td>
                          <td><button type="button" className="ccv-btn-secondary" onClick={() => handleVerResultado(a.id)}>Ver</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {nota != null && (
                <p className="ccv-form-hint" style={{ marginBottom: 12 }}>
                  Tu nota en este cuestionario: <strong>{nota}</strong>
                  {intentosCompletados.length > 1 ? ` (cuenta ${GRADE_POLICY_LABELS[politica].toLowerCase()})` : ''}
                </p>
              )}

              {puedeIntentar ? (
                <button type="button" className="ccv-btn-primary" onClick={handleComenzar}>
                  {intentoAbierto ? 'Continuar intento' : 'Comenzar intento'}
                </button>
              ) : (
                <p className="ccv-empty-note">Ya usaste todos tus intentos para este cuestionario.</p>
              )}
            </>
          )}

          {vista === 'respondiendo' && intentoActual && (
            <>
              <div className="ccv-quiz-timer-bar">
                {segundos != null ? (
                  <span className={`ccv-quiz-timer ${segundos <= 60 ? 'is-urgent' : ''}`}>
                    <Clock size={14} /> {formatTiempo(segundos)}
                  </span>
                ) : <span />}
                <span className="ccv-quiz-autosave">
                  {guardado === 'guardando' && 'Guardando…'}
                  {guardado === 'guardado' && 'Avance guardado'}
                  {guardado === 'error' && 'No se pudo guardar el avance'}
                </span>
              </div>
              {segundos != null && (
                <p className="ccv-form-hint" style={{ marginBottom: 10 }}>
                  Al acabarse el tiempo el cuestionario se entrega solo con lo que tengas marcado.
                </p>
              )}

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
              {aviso && <p className="ccv-form-error" style={{ marginBottom: 10 }}>{aviso}</p>}
              {!aviso && revision.expired && (
                <p className="ccv-form-hint" style={{ marginBottom: 10 }}>Este intento se cerró porque se acabó el tiempo.</p>
              )}
              {revision.respuestas_reveladas === false && (
                <p className="ccv-quiz-question-prompt">
                  Las respuestas correctas se muestran cuando cierre el cuestionario o se te acaben los intentos.
                </p>
              )}

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
