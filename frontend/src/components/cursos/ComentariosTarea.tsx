import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import {
  borrarComentarioTarea, comentarTarea, listarComentariosTarea, type ComentarioTarea,
} from '../../data/cursoContenidoApi';
import { claveDeDia, formatFechaHoraCorta, formatHora } from '../../utils/fechas';

interface Props {
  courseId: string;
  blockId: string;
  itemId: string;
  /** Docente: el estudiante del hilo. Estudiante: se omite (es su propio hilo). */
  estudianteId?: string;
  esDocente: boolean;
  /** Avisa cuántos comentarios hay (para el contador de la lista del docente). */
  onCambio?: (total: number) => void;
}

function cuando(iso: string | null) {
  if (!iso) return '';
  return claveDeDia(iso) === claveDeDia(new Date()) ? formatHora(iso) : formatFechaHoraCorta(iso);
}

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}

/** Conversación privada de una tarea entre el docente y un estudiante. */
export default function ComentariosTarea({ courseId, blockId, itemId, estudianteId, esDocente, onCambio }: Props) {
  const sinMovimiento = useReducedMotion();
  const [comentarios, setComentarios] = useState<ComentarioTarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const avisar = useRef(onCambio);
  avisar.current = onCambio;

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    listarComentariosTarea(courseId, blockId, itemId, estudianteId)
      .then(r => { if (vigente) setComentarios(r.comentarios); })
      .catch(err => { if (vigente) setError(err?.message || 'No se pudieron cargar los comentarios.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [courseId, blockId, itemId, estudianteId]);

  // La conversación arranca abajo, en lo más reciente. El total se avisa solo
  // cuando ya cargó (antes de eso «0» no significa que no haya comentarios).
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (!cargando) avisar.current?.(comentarios.length);
  }, [comentarios.length, cargando]);

  async function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const { comentario } = await comentarTarea(courseId, blockId, itemId, cuerpo, esDocente ? estudianteId : undefined);
      setComentarios(c => [...c, comentario]);
      setTexto('');
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar el comentario.');
    } finally {
      setEnviando(false);
    }
  }

  async function borrar(c: ComentarioTarea) {
    if (!window.confirm('¿Borrar este comentario?')) return;
    try {
      await borrarComentarioTarea(courseId, blockId, itemId, c.id);
      setComentarios(lista => lista.filter(x => x.id !== c.id));
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar el comentario.');
    }
  }

  return (
    <div className="av-hilo">
      <div className="av-hilo-lista" ref={lista} aria-live="polite">
        {cargando && <div className="av-hilo-vacio"><Loader2 size={18} className="dfm-spin" /></div>}
        {!cargando && comentarios.length === 0 && (
          <div className="av-hilo-vacio">
            <MessageSquare size={20} />
            <span>{esDocente
              ? 'Todavía no hay comentarios con este estudiante.'
              : 'Escribe aquí tus dudas sobre la tarea. Solo las ve el docente.'}</span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {comentarios.map(c => (
            <motion.div
              key={c.id}
              className={`av-msg${c.es_mio ? ' is-mio' : ''}`}
              initial={{ opacity: 0, y: sinMovimiento ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: sinMovimiento ? 0 : 0.18 }}
            >
              {!c.es_mio && <span className="av-msg-avatar" aria-hidden="true">{iniciales(c.author_name)}</span>}
              <div className="av-msg-burbuja">
                <span className="av-msg-cabeza">
                  <strong>{c.es_mio ? 'Tú' : c.author_name}</strong>
                  {c.author_role === 'TEACHER' && !c.es_mio && <span className="av-msg-rol">Docente</span>}
                  <time>{cuando(c.created_at)}</time>
                </span>
                <p>{c.body}</p>
              </div>
              {(c.es_mio || esDocente) && (
                <button type="button" className="av-msg-borrar" onClick={() => borrar(c)} aria-label="Borrar comentario" title="Borrar">
                  <Trash2 size={13} />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {error && <p className="av-error" role="alert">{error}</p>}
      <div className="av-hilo-form">
        <textarea
          rows={1}
          maxLength={2000}
          value={texto}
          placeholder={esDocente ? 'Escribe un comentario para el estudiante…' : 'Escribe un comentario para el docente…'}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          aria-label="Comentario"
        />
        <button type="button" className="av-btn is-principal is-icono" onClick={enviar} disabled={enviando || !texto.trim()} aria-label="Enviar comentario">
          {enviando ? <Loader2 size={16} className="dfm-spin" /> : <Send size={16} />}
        </button>
      </div>
      <span className="av-hilo-ayuda">Enter envía · Shift + Enter hace un salto de línea</span>
    </div>
  );
}
