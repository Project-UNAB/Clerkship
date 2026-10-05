import { useEffect, useState, type FormEvent } from 'react';
import { MessageSquarePlus, X, CheckCircle, AlertCircle } from 'lucide-react';
import { enviarFeedback, type PestanaFeedback } from '../../data/feedbackApi';
import { FORMULARIOS_FEEDBACK } from '../../data/feedbackForms';
import '../../styles/feedback.css';

interface Props {
  pestana: PestanaFeedback;
}

/** Botón flotante en la esquina inferior derecha de cada pestaña. Abre el
 *  formulario de esa pestaña, que guarda en su propia tabla. */
export default function FeedbackFab({ pestana }: Props) {
  const formulario = FORMULARIOS_FEEDBACK[pestana];
  const total = formulario.preguntas.length;
  const [abierto, setAbierto] = useState(false);
  const [idUsuario, setIdUsuario] = useState('');
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respondidas = formulario.preguntas.filter(p => respuestas[p.key] !== undefined).length;
  const idValido = idUsuario.trim().length >= 2;
  const completo = idValido && respondidas === total;
  const porcentaje = Math.round((respondidas / total) * 100);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    if (enviado) {
      setEnviado(false);
      setRespuestas({});
      setComentario('');
      setIdUsuario('');
    }
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!completo) return;
    setEnviando(true);
    setError(null);
    try {
      await enviarFeedback(pestana, idUsuario.trim(), respuestas, comentario);
      setEnviado(true);
    } catch {
      setError('No se pudo enviar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="fb-fab"
        onClick={() => setAbierto(true)}
        aria-label={formulario.titulo}
      >
        <MessageSquarePlus size={18} />
        <span>Opinión</span>
      </button>

      {abierto && (
        <div className="fb-overlay" role="dialog" aria-modal="true" aria-labelledby="fb-title" onMouseDown={e => { if (e.target === e.currentTarget) cerrar(); }}>
          <div className="fb-modal">
            <header className="fb-head">
              <div>
                <span className="fb-kicker">Retroalimentación</span>
                <h2 id="fb-title" className="fb-title">{formulario.titulo}</h2>
                <p className="fb-desc">{formulario.descripcion}</p>
              </div>
              <button type="button" className="fb-close" onClick={cerrar} aria-label="Cerrar">
                <X size={18} />
              </button>
            </header>

            {enviado ? (
              <div className="fb-done">
                <CheckCircle size={44} />
                <h3>¡Gracias!</h3>
                <p>Tu respuesta quedó registrada.</p>
                <button type="button" className="fb-submit" onClick={cerrar}>Cerrar</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="fb-form" noValidate>
                <div className="fb-id">
                  <label className="fb-label" htmlFor="fb-id">ID del usuario *</label>
                  <input
                    id="fb-id"
                    className="fb-input"
                    value={idUsuario}
                    maxLength={60}
                    placeholder="Escribe tu ID"
                    autoComplete="off"
                    onChange={e => setIdUsuario(e.target.value)}
                  />
                  {idUsuario.length > 0 && !idValido && (
                    <span className="fb-hint">Debe tener al menos 2 caracteres.</span>
                  )}
                </div>

                <div className="fb-progress" aria-label={`${respondidas} de ${total} preguntas respondidas`}>
                  <div className="fb-progress-bar" style={{ width: `${porcentaje}%` }} />
                  <span>{respondidas} de {total}</span>
                </div>

                <div className="fb-grid">
                  {formulario.preguntas.map((p, i) => (
                    <fieldset key={p.key} className="fb-question">
                      <legend><span className="fb-num">{i + 1}</span>{p.label}</legend>
                      <div className="fb-scale">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            type="button"
                            className={`fb-score ${respuestas[p.key] === n ? 'is-selected' : ''}`}
                            aria-pressed={respuestas[p.key] === n}
                            onClick={() => setRespuestas(prev => ({ ...prev, [p.key]: n }))}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>

                <label className="fb-label" htmlFor="fb-comentario">Comentario (opcional)</label>
                <textarea
                  id="fb-comentario"
                  className="fb-textarea"
                  rows={3}
                  maxLength={1000}
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                />

                {error && <div className="fb-error"><AlertCircle size={16} />{error}</div>}

                <div className="fb-actions">
                  <button type="submit" className="fb-submit" disabled={!completo || enviando}>
                    {enviando ? 'Enviando…' : 'Enviar respuestas'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
