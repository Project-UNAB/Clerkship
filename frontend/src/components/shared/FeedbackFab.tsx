import { memo, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as KeyboardEventReact } from 'react';
import { MessageSquarePlus, X, CheckCircle2, AlertCircle, ArrowDown, Check } from 'lucide-react';
import { enviarFeedback, obtenerMiOpinion, type PestanaFeedback } from '../../data/feedbackApi';
import { ESCALA_OPINION, FORMULARIOS_FEEDBACK, type PreguntaFeedback } from '../../data/feedbackForms';
import { getStoredUser } from '../../data/mainAuth';
import '../../styles/feedback.css';

interface Props {
  pestana: PestanaFeedback;
}

const claveBorrador = (pestana: string) => `clerkship_opinion_borrador_${getStoredUser()?.id ?? 'anon'}_${pestana}`;

function leerBorrador(pestana: string): { respuestas: Record<string, number>; comentario: string } | null {
  try {
    const t = localStorage.getItem(claveBorrador(pestana));
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

interface PreguntaProps {
  numero: number;
  pregunta: PreguntaFeedback;
  valor: number | undefined;
  onElegir: (key: string, valor: number, desdeTeclado: boolean) => void;
}

/** Una pregunta con su escala. Memoizada: al elegir solo se vuelve a pintar esa. */
const Pregunta = memo(function Pregunta({ numero, pregunta, valor, onElegir }: PreguntaProps) {
  const alTeclear = (e: KeyboardEventReact<HTMLFieldSetElement>) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 5) {
      e.preventDefault();
      onElegir(pregunta.key, n, true);
    }
  };
  return (
    <fieldset className={`op-pregunta${valor ? ' is-respondida' : ''}`} data-pregunta={pregunta.key} tabIndex={-1} onKeyDown={alTeclear}>
      <legend className="op-enunciado">
        <span className="op-num">{valor ? <Check size={13} strokeWidth={3} /> : numero}</span>
        {pregunta.label}
      </legend>
      <div className="op-escala" role="radiogroup" aria-label={pregunta.label}>
        {ESCALA_OPINION.map(op => (
          <button
            key={op.valor}
            type="button"
            role="radio"
            aria-checked={valor === op.valor}
            className={`op-opcion op-v${op.valor}${valor === op.valor ? ' is-elegida' : ''}`}
            onClick={() => onElegir(pregunta.key, op.valor, false)}
          >
            <span className="op-opcion-num">{op.valor}</span>
            <span className="op-opcion-txt">{op.texto}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
});

/** Botón flotante «Opinión» de cada pestaña: abre su formulario (1 a 5). Cada
 * usuario tiene una respuesta por pestaña; al volver a abrir ve lo que ya
 * respondió y puede actualizarlo. Mientras responde, se guarda un borrador. */
export default function FeedbackFab({ pestana }: Props) {
  const formulario = FORMULARIOS_FEEDBACK[pestana];
  const total = formulario.preguntas.length;
  const [abierto, setAbierto] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState('');
  const [fechaAnterior, setFechaAnterior] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ actualizada: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yaRespondio, setYaRespondio] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);

  const respondidas = formulario.preguntas.filter(p => respuestas[p.key] !== undefined).length;
  const completo = respondidas === total;
  const porcentaje = Math.round((respondidas / total) * 100);

  // Al abrir: lo que ya respondió (para actualizarlo) o, si no, el borrador.
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setCargando(true);
    obtenerMiOpinion(pestana)
      .then(({ respuesta }) => {
        if (!vigente) return;
        const borrador = leerBorrador(pestana);
        if (respuesta) {
          setRespuestas({ ...respuesta.respuestas, ...(borrador?.respuestas ?? {}) });
          setComentario(borrador?.comentario ?? respuesta.comentario ?? '');
          setFechaAnterior(respuesta.fecha);
          setYaRespondio(true);
        } else if (borrador) {
          setRespuestas(borrador.respuestas);
          setComentario(borrador.comentario);
        }
      })
      .catch(() => {
        const borrador = leerBorrador(pestana);
        if (vigente && borrador) { setRespuestas(borrador.respuestas); setComentario(borrador.comentario); }
      })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [abierto, pestana]);

  // Si ya respondió antes, el botón lo indica.
  useEffect(() => {
    obtenerMiOpinion(pestana).then(r => setYaRespondio(Boolean(r.respuesta))).catch(() => undefined);
  }, [pestana]);

  // Borrador: si cierra a medias, lo encuentra al volver.
  useEffect(() => {
    if (!abierto || cargando || enviado) return;
    try {
      if (respondidas || comentario) localStorage.setItem(claveBorrador(pestana), JSON.stringify({ respuestas, comentario }));
    } catch { /* sin almacenamiento local */ }
  }, [respuestas, comentario, abierto, cargando, enviado, pestana, respondidas]);

  const irA = useCallback((key: string | undefined) => {
    if (!key) return;
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-pregunta="${key}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  }, []);

  const onElegir = useCallback((key: string, valor: number, desdeTeclado: boolean) => {
    setRespuestas(prev => {
      const sig = { ...prev, [key]: valor };
      // Con el teclado (1 a 5) se pasa sola a la siguiente pregunta sin responder
      // o, si ya están todas, a la que sigue.
      if (desdeTeclado) {
        const lista = formulario.preguntas;
        const actual = lista.findIndex(p => p.key === key);
        const despues = [...lista.slice(actual + 1), ...lista.slice(0, actual)];
        const siguiente = despues.find(p => sig[p.key] === undefined) ?? lista[actual + 1];
        window.setTimeout(() => irA(siguiente?.key), 0);
      }
      return sig;
    });
  }, [formulario.preguntas, irA]);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setError(null);
    if (enviado) {
      setEnviado(null);
      setRespuestas({});
      setComentario('');
      setFechaAnterior(null);
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
    if (!completo) {
      irA(formulario.preguntas.find(p => respuestas[p.key] === undefined)?.key);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await enviarFeedback(pestana, respuestas, comentario);
      try { localStorage.removeItem(claveBorrador(pestana)); } catch { /* sin almacenamiento local */ }
      setEnviado({ actualizada: Boolean(r.actualizada) });
      setYaRespondio(true);
    } catch {
      setError('No se pudo enviar. Revisa tu conexión e intenta de nuevo: tus respuestas siguen aquí.');
    } finally {
      setEnviando(false);
    }
  }

  const promedio = respondidas ? (Object.values(respuestas).reduce((a, b) => a + b, 0) / respondidas) : 0;
  const pendientes = total - respondidas;

  return (
    <>
      <button type="button" className="op-fab" onClick={() => setAbierto(true)} aria-label={formulario.titulo}>
        <MessageSquarePlus size={18} />
        <span>Opinión</span>
        {yaRespondio && <span className="op-fab-check" title="Ya diste tu opinión aquí"><Check size={10} strokeWidth={3.2} /></span>}
      </button>

      {abierto && (
        <div className="op-overlay" role="dialog" aria-modal="true" aria-labelledby="op-titulo"
          onMouseDown={e => { if (e.target === e.currentTarget) cerrar(); }}>
          <div className="op-modal">
            <header className="op-cabecera">
              <div>
                <span className="op-kicker">Tu opinión · de 1 a 5</span>
                <h2 id="op-titulo" className="op-titulo">{formulario.titulo}</h2>
                <p className="op-desc">{formulario.descripcion}</p>
              </div>
              <button type="button" className="op-cerrar" onClick={cerrar} aria-label="Cerrar"><X size={18} /></button>
            </header>

            {enviado ? (
              <div className="op-listo">
                <CheckCircle2 size={48} />
                <h3>¡Gracias!</h3>
                <p>{enviado.actualizada ? 'Actualizamos tu opinión.' : 'Tu opinión quedó registrada.'} Tu promedio en esta sección: <strong>{promedio.toFixed(1).replace('.', ',')} de 5</strong>.</p>
                <button type="button" className="op-enviar" onClick={cerrar}>Cerrar</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="op-form" noValidate>
                {fechaAnterior && (
                  <p className="op-aviso">
                    Ya respondiste el {new Date(fechaAnterior).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}.
                    Cambia lo que quieras y vuelve a enviar para actualizarlo.
                  </p>
                )}

                <div className="op-progreso" aria-live="polite">
                  <div className="op-progreso-barra"><span style={{ width: `${porcentaje}%` }} /></div>
                  <span className="op-progreso-txt">{respondidas} de {total}</span>
                  {pendientes > 0 && respondidas > 0 && (
                    <button type="button" className="op-ir-pendiente"
                      onClick={() => irA(formulario.preguntas.find(p => respuestas[p.key] === undefined)?.key)}>
                      <ArrowDown size={13} /> Ir a la pendiente
                    </button>
                  )}
                </div>
                <p className="op-ayuda">Elige una opción en cada pregunta. Con el teclado: enfoca una pregunta y pulsa del 1 al 5.</p>

                <div className="op-lista" ref={listaRef} aria-busy={cargando}>
                  {formulario.preguntas.map((p, i) => (
                    <Pregunta key={p.key} numero={i + 1} pregunta={p} valor={respuestas[p.key]} onElegir={onElegir} />
                  ))}
                </div>

                <label className="op-label" htmlFor="op-comentario">¿Algo más que quieras contarnos? <span>(opcional)</span></label>
                <textarea
                  id="op-comentario"
                  className="op-textarea"
                  rows={4}
                  maxLength={1000}
                  placeholder="Qué te gustó, qué no y qué cambiarías."
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                />
                <span className="op-contador">{comentario.length} / 1000</span>

                {error && <div className="op-error" role="alert"><AlertCircle size={16} />{error}</div>}

                <div className="op-pie">
                  <span className="op-pie-estado">
                    {completo ? 'Todo listo para enviar.' : `Faltan ${pendientes} ${pendientes === 1 ? 'pregunta' : 'preguntas'}.`}
                  </span>
                  <button type="submit" className="op-enviar" disabled={enviando || cargando}>
                    {enviando ? 'Enviando…' : fechaAnterior ? 'Actualizar mi opinión' : 'Enviar opinión'}
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
