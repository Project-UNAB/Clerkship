import { memo, useCallback, useEffect, useState, type FormEvent } from 'react';
import { MessageSquarePlus, X, CheckCircle, AlertCircle } from 'lucide-react';
import { enviarFeedback, type PestanaFeedback } from '../../data/feedbackApi';
import { FORMULARIOS_FEEDBACK, type PreguntaFeedback } from '../../data/feedbackForms';
import '../../styles/feedback.css';

interface Props {
  pestana: PestanaFeedback;
}

interface PreguntaProps {
  numero: number;
  pregunta: PreguntaFeedback;
  valor: number | undefined;
  onElegir: (key: string, valor: number) => void;
}

/** Una pregunta. Está memoizada: al tocar una calificación solo se vuelve a
 *  pintar esa pregunta, no las demás del formulario. */
const Pregunta = memo(function Pregunta({ numero, pregunta, valor, onElegir }: PreguntaProps) {
  return (
    <fieldset className="fb-question">
      <legend><span className="fb-num">{numero}</span>{pregunta.label}</legend>
      <div className="fb-scale">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            className={`fb-score ${valor === n ? 'is-selected' : ''}`}
            aria-pressed={valor === n}
            onClick={() => onElegir(pregunta.key, n)}
          >
            {n}
          </button>
        ))}
      </div>
    </fieldset>
  );
});

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

  const onElegir = useCallback((key: string, valor: number) => {
    setRespuestas(prev => ({ ...prev, [key]: valor }));
  }, []);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setError(null);
    if (enviado) {
      setEnviado(false);
      setRespuestas({});
      setComentario('');
      setIdUsuario('');
    }
  }, [enviado]);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto, cerrar]);

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

                <div className="fb-progress">
                  <div className="fb-progress-bar" style={{ width: `${porcentaje}%` }} />
                  <span>{respondidas} de {total}</span>
                </div>

                <div className="fb-grid">
                  {formulario.preguntas.map((p, i) => (
                    <Pregunta
                      key={p.key}
                      numero={i + 1}
                      pregunta={p}
                      valor={respuestas[p.key]}
                      onElegir={onElegir}
                    />
                  ))}
                </div>

                <label className="fb-label" htmlFor="fb-comentario">Comentario (opcional)</label>
                <textarea
                  id="fb-comentario"
                  className="fb-textarea"
                  rows={6}
                  maxLength={1000}
                  placeholder="Cuéntanos con detalle qué te gustó, qué no y qué cambiarías."
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                />
                <span className="fb-counter">{comentario.length} / 1000</span>

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
