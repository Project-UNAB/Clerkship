import { useEffect, useState } from 'react';
import { X, Plus, Trash2, Pencil, Loader2, CheckCircle2, Circle } from 'lucide-react';
import type { CourseContentItem } from '../../data/cursoContenidoApi';
import {
  listarPreguntas, crearPregunta, actualizarPregunta, borrarPregunta, listarIntentos,
  type QuizQuestion, type QuizAttempt, type QuestionType,
} from '../../data/cursoQuizApi';

interface Props {
  courseId: string;
  blockId: string;
  item: CourseContentItem;
  onClose: () => void;
}

const TIPOS_PREGUNTA: { value: QuestionType; label: string }[] = [
  { value: 'SINGLE_CHOICE', label: 'Opción única' },
  { value: 'MULTIPLE_CHOICE', label: 'Opción múltiple' },
  { value: 'TRUE_FALSE', label: 'Verdadero / Falso' },
];

function formatFecha(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function GestionarQuizModal({ courseId, blockId, item, onClose }: Props) {
  const [tab, setTab] = useState<'preguntas' | 'intentos'>('preguntas');
  const [preguntas, setPreguntas] = useState<QuizQuestion[]>([]);
  const [intentos, setIntentos] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tipoPregunta, setTipoPregunta] = useState<QuestionType>('SINGLE_CHOICE');
  const [prompt, setPrompt] = useState('');
  const [points, setPoints] = useState('1');
  const [choices, setChoices] = useState<{ text: string; is_correct: boolean }[]>([
    { text: '', is_correct: false },
    { text: '', is_correct: false },
  ]);
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    setLoading(true);
    Promise.all([listarPreguntas(courseId, blockId, item.id), listarIntentos(courseId, blockId, item.id)])
      .then(([p, i]) => { setPreguntas(p.preguntas); setIntentos(i.intentos); })
      .catch(err => setError(err?.message || 'No se pudo cargar el cuestionario.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  function resetForm() {
    setEditandoId(null);
    setTipoPregunta('SINGLE_CHOICE');
    setPrompt('');
    setPoints('1');
    setChoices([{ text: '', is_correct: false }, { text: '', is_correct: false }]);
    setFormAbierto(false);
  }

  function abrirEdicion(p: QuizQuestion) {
    setEditandoId(p.id);
    setTipoPregunta(p.type);
    setPrompt(p.prompt);
    setPoints(String(p.points));
    setChoices(p.choices.map(c => ({ text: c.text, is_correct: !!c.is_correct })));
    setFormAbierto(true);
  }

  function abrirNuevaPregunta() {
    setEditandoId(null);
    setTipoPregunta('SINGLE_CHOICE');
    setPrompt('');
    setPoints('1');
    setChoices([{ text: '', is_correct: false }, { text: '', is_correct: false }]);
    setFormAbierto(true);
  }

  function cambiarTipoPregunta(tipo: QuestionType) {
    setTipoPregunta(tipo);
    if (tipo === 'TRUE_FALSE') {
      setChoices([{ text: 'Verdadero', is_correct: true }, { text: 'Falso', is_correct: false }]);
    } else if (choices.length < 2) {
      setChoices([{ text: '', is_correct: false }, { text: '', is_correct: false }]);
    }
  }

  function toggleCorrecta(idx: number) {
    setChoices(prev => prev.map((c, i) => {
      if (tipoPregunta === 'MULTIPLE_CHOICE') {
        return i === idx ? { ...c, is_correct: !c.is_correct } : c;
      }
      return { ...c, is_correct: i === idx };
    }));
  }

  async function handleGuardarPregunta() {
    if (!prompt.trim()) { setError('Escribe el enunciado.'); return; }
    const validas = choices.filter(c => c.text.trim());
    if (validas.length < 2) { setError('Agrega al menos 2 opciones.'); return; }
    if (!validas.some(c => c.is_correct)) { setError('Marca al menos una opción correcta.'); return; }

    setGuardando(true);
    setError(null);
    try {
      const payload = { type: tipoPregunta, prompt: prompt.trim(), points: Number(points) || 1, choices: validas };
      if (editandoId) {
        await actualizarPregunta(courseId, blockId, item.id, editandoId, payload);
      } else {
        await crearPregunta(courseId, blockId, item.id, payload);
      }
      resetForm();
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la pregunta.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleBorrarPregunta(questionId: string) {
    if (!window.confirm('¿Borrar esta pregunta?')) return;
    try {
      await borrarPregunta(courseId, blockId, item.id, questionId);
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar la pregunta.');
    }
  }

  const totalPuntos = preguntas.reduce((sum, p) => sum + p.points, 0);

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal ccv-modal-form-wide" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>{item.title}</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-quiz-tabs">
          <button type="button" className={tab === 'preguntas' ? 'is-active' : ''} onClick={() => setTab('preguntas')}>
            Preguntas ({preguntas.length}, {totalPuntos} pts)
          </button>
          <button type="button" className={tab === 'intentos' ? 'is-active' : ''} onClick={() => setTab('intentos')}>
            Intentos de estudiantes ({intentos.length})
          </button>
        </div>

        <div className="ccv-modal-body" style={{ padding: '14px 18px' }}>
          {loading && <Loader2 size={20} className="dfm-spin" />}
          {error && <p className="ccv-form-error">{error}</p>}

          {!loading && tab === 'preguntas' && (
            <>
              {preguntas.map((p, idx) => (
                <div key={p.id} className="ccv-quiz-question-row">
                  <div className="ccv-quiz-question-main">
                    <span className="ccv-quiz-question-num">{idx + 1}.</span>
                    <div>
                      <p className="ccv-quiz-question-prompt">{p.prompt}</p>
                      <span className="ccv-quiz-question-meta">{TIPOS_PREGUNTA.find(t => t.value === p.type)?.label} · {p.points} pts</span>
                    </div>
                  </div>
                  <div className="ccv-block-actions">
                    <button type="button" title="Editar" onClick={() => abrirEdicion(p)}><Pencil size={13} /></button>
                    <button type="button" title="Borrar" className="danger" onClick={() => handleBorrarPregunta(p.id)}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}

              {preguntas.length === 0 && !formAbierto && (
                <p className="ccv-empty-note">Todavía no hay preguntas.</p>
              )}

              {formAbierto ? (
                <div className="ccv-quiz-form">
                  <div className="ccv-form-row">
                    <label className="ccv-form-label">
                      Tipo
                      <select value={tipoPregunta} onChange={e => cambiarTipoPregunta(e.target.value as QuestionType)} disabled={!!editandoId}>
                        {TIPOS_PREGUNTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </label>
                    <label className="ccv-form-label">
                      Puntos
                      <input type="number" min={0.5} step={0.5} value={points} onChange={e => setPoints(e.target.value)} />
                    </label>
                  </div>

                  <label className="ccv-form-label">
                    Enunciado
                    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} placeholder="Escribe la pregunta..." />
                  </label>

                  <div className="ccv-quiz-choices-editor">
                    {choices.map((c, idx) => (
                      <div key={idx} className="ccv-quiz-choice-row">
                        <button type="button" onClick={() => toggleCorrecta(idx)} title={c.is_correct ? 'Correcta' : 'Marcar como correcta'}>
                          {c.is_correct ? <CheckCircle2 size={18} color="#10b981" /> : <Circle size={18} />}
                        </button>
                        <input
                          type="text"
                          value={c.text}
                          onChange={e => setChoices(prev => prev.map((x, i) => i === idx ? { ...x, text: e.target.value } : x))}
                          placeholder={`Opción ${idx + 1}`}
                          disabled={tipoPregunta === 'TRUE_FALSE'}
                        />
                        {choices.length > 2 && tipoPregunta !== 'TRUE_FALSE' && (
                          <button type="button" onClick={() => setChoices(prev => prev.filter((_, i) => i !== idx))} title="Quitar">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {tipoPregunta !== 'TRUE_FALSE' && (
                      <button type="button" className="ccv-btn-secondary" onClick={() => setChoices(prev => [...prev, { text: '', is_correct: false }])}>
                        <Plus size={13} /> Opción
                      </button>
                    )}
                  </div>

                  <div className="ccv-modal-actions" style={{ padding: '10px 0 0' }}>
                    <button type="button" className="ccv-btn-secondary" onClick={resetForm} disabled={guardando}>Cancelar</button>
                    <button type="button" className="ccv-btn-primary" onClick={handleGuardarPregunta} disabled={guardando}>
                      {guardando ? <Loader2 size={14} className="dfm-spin" /> : null} {editandoId ? 'Guardar' : 'Agregar pregunta'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="ccv-new-block-btn" onClick={abrirNuevaPregunta}>
                  <Plus size={16} /> Nueva pregunta
                </button>
              )}
            </>
          )}

          {!loading && tab === 'intentos' && (
            intentos.length === 0 ? (
              <p className="ccv-empty-note">Todavía no hay intentos de estudiantes.</p>
            ) : (
              <div className="ccv-tabla-wrap">
                <table className="ccv-quiz-tabla">
                  <thead><tr><th>Estudiante</th><th>Intento</th><th>Entregado</th><th>Puntaje</th></tr></thead>
                  <tbody>
                    {intentos.map(a => (
                      <tr key={a.id}>
                        <td>{a.student_name}</td>
                        <td>#{a.attempt_number}</td>
                        <td>{a.completed ? formatFecha(a.submitted_at) : 'En progreso'}</td>
                        <td>{a.completed ? `${a.score} / ${a.max_score}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
