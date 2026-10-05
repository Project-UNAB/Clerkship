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
  const [abierto, setAbierto] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respondidas = formulario.preguntas.filter(p => respuestas[p.key] !== undefined).length;
  const completo = respondidas === formulario.preguntas.length;

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
    }
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!completo) return;
    setEnviando(true);
    setError(null);
    try {
      await enviarFeedback(pestana, respuestas, comentario);
      setEnviado(true);
    } catch {
      setError('No se pudo enviar. Intenta de nuevo en un momento.');
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
        <div className="fb-overlay" role="dialog" aria-modal="true" aria-labelledby="fb-title">
          <div className="fb-modal">
            <div className="fb-head">
              <div>
                <h2 id="fb-title" className="fb-title">{formulario.titulo}</h2>
                <p className="fb-desc">{formulario.descripcion}</p>
              </div>
              <button type="button" className="fb-close" onClick={cerrar} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            {enviado ? (
              <div className="fb-done">
                <CheckCircle size={40} />
                <p>¡Gracias! Tu respuesta ya quedó registrada.</p>
                <button type="button" className="fb-submit" onClick={cerrar}>Cerrar</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="fb-form" noValidate>
                {formulario.preguntas.map(p => (
                  <fieldset key={p.key} className="fb-question">
                    <legend>{p.label}</legend>
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

                <p className="fb-progreso">
                  {respondidas} de {formulario.preguntas.length} preguntas respondidas
                </p>
                <button type="submit" className="fb-submit" disabled={!completo || enviando}>
                  {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
