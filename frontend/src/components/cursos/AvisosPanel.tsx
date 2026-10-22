import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Megaphone, Pin, Plus, Pencil, Trash2, MessageCircle, Loader2, ChevronDown, Send } from 'lucide-react';
import {
  listarAvisosPagina, borrarAviso, listarComentarios, crearComentario, borrarComentario,
  type CourseAnnouncement, type AnnouncementComment,
} from '../../data/cursoAvisosApi';
import { getStoredUser } from '../../data/mainAuth';
import { claveDeDia, formatFechaHoraCorta, formatHora } from '../../utils/fechas';
import CrearAvisoModal from './CrearAvisoModal';
import '../../styles/aulaVistas.css';

const SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a',
    'blockquote', 'code', 'pre', 'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'value'],
};
const POR_PAGINA = 20;

interface Props {
  courseId: string;
  esDocente: boolean;
}

function cuando(iso: string | null) {
  if (!iso) return '';
  return claveDeDia(iso) === claveDeDia(new Date()) ? `Hoy, ${formatHora(iso)}` : formatFechaHoraCorta(iso);
}

/** El texto del aviso sin etiquetas, para el resumen de la tarjeta. */
function resumen(html: string) {
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(html, SANITIZE_OPTS), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function iniciales(nombre: string | null) {
  return (nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}

/** Comentarios de un aviso: se piden solo al abrirlo. */
function ComentariosAviso({ courseId, aviso, onCuenta }: { courseId: string; aviso: CourseAnnouncement; onCuenta: (n: number) => void }) {
  const usuario = getStoredUser();
  const esDocente = usuario?.role === 'TEACHER';
  const [comentarios, setComentarios] = useState<AnnouncementComment[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avisar = useRef(onCuenta);
  avisar.current = onCuenta;

  // El contador de la tarjeta sigue a los comentarios cargados.
  useEffect(() => {
    if (!cargando) avisar.current(comentarios.length);
  }, [cargando, comentarios.length]);

  useEffect(() => {
    let vigente = true;
    listarComentarios(courseId, aviso.id)
      .then(r => { if (vigente) setComentarios(r.comentarios); })
      .catch(err => { if (vigente) setError(err?.message || 'No se pudieron cargar los comentarios.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [courseId, aviso.id]);

  async function enviar() {
    const contenido = texto.trim();
    if (!contenido || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const nuevo = await crearComentario(courseId, aviso.id, contenido);
      setComentarios(c => [...c, nuevo as AnnouncementComment]);
      setTexto('');
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar el comentario.');
    } finally {
      setEnviando(false);
    }
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Borrar este comentario?')) return;
    try {
      await borrarComentario(courseId, aviso.id, id);
      setComentarios(c => c.filter(x => x.id !== id));
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar el comentario.');
    }
  }

  return (
    <div className="av-aviso-coms">
      <span className="av-aviso-coms-titulo"><MessageCircle size={14} /> Comentarios {comentarios.length > 0 && `(${comentarios.length})`}</span>
      {cargando && <Loader2 size={16} className="dfm-spin" />}
      {!cargando && comentarios.length === 0 && <span className="av-aviso-coms-vacio">Sé el primero en comentar.</span>}
      {comentarios.map(c => (
        <div key={c.id} className="av-aviso-com">
          <span className="av-msg-avatar" aria-hidden="true">{iniciales(c.author_name)}</span>
          <div className="av-aviso-com-cuerpo">
            <span className="av-msg-cabeza">
              <strong>{c.author_name}</strong>
              {c.author_role === 'TEACHER' && <span className="av-msg-rol">Docente</span>}
              <time>{cuando(c.created_at)}</time>
            </span>
            <p>{c.content}</p>
          </div>
          {(c.author_id === usuario?.id || esDocente) && (
            <button type="button" className="av-msg-borrar" onClick={() => borrar(c.id)} aria-label="Borrar comentario"><Trash2 size={13} /></button>
          )}
        </div>
      ))}
      {error && <p className="av-error">{error}</p>}
      <div className="av-hilo-form">
        <textarea rows={1} maxLength={2000} value={texto} placeholder="Escribe un comentario…" aria-label="Comentario"
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
        <button type="button" className="av-btn is-principal is-icono" onClick={enviar} disabled={enviando || !texto.trim()} aria-label="Enviar comentario">
          {enviando ? <Loader2 size={16} className="dfm-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

interface TarjetaProps {
  courseId: string;
  aviso: CourseAnnouncement;
  abierto: boolean;
  esDocente: boolean;
  onAlternar: (id: string) => void;
  onEditar: (a: CourseAnnouncement) => void;
  onBorrar: (id: string) => void;
  onCuenta: (id: string, n: number) => void;
}

/** Un aviso: resumen y, al abrirlo, el texto completo y sus comentarios. */
const TarjetaAviso = memo(function TarjetaAviso({ courseId, aviso, abierto, esDocente, onAlternar, onEditar, onBorrar, onCuenta }: TarjetaProps) {
  const sinMovimiento = useReducedMotion();
  const extracto = useMemo(() => resumen(aviso.body || ''), [aviso.body]);
  const html = useMemo(() => (abierto ? DOMPurify.sanitize(aviso.body || '', SANITIZE_OPTS) : ''), [abierto, aviso.body]);
  return (
    <article className={`av-aviso${abierto ? ' is-abierto' : ''}${aviso.pinned ? ' is-fijado' : ''}`}>
      <button type="button" className="av-aviso-cab" onClick={() => onAlternar(aviso.id)} aria-expanded={abierto}>
        <span className="av-msg-avatar is-grande" aria-hidden="true">{iniciales(aviso.author_name)}</span>
        <span className="av-aviso-txt">
          <span className="av-aviso-meta">
            {aviso.pinned && <span className="av-fijado"><Pin size={11} /> Fijado</span>}
            <span>{aviso.author_name}</span>
            <span>·</span>
            <time>{cuando(aviso.created_at)}</time>
          </span>
          <strong className="av-aviso-titulo">{aviso.title}</strong>
          {!abierto && extracto && <span className="av-aviso-extracto">{extracto}</span>}
          {!abierto && <span className="av-aviso-pie"><MessageCircle size={13} /> {aviso.comment_count} {aviso.comment_count === 1 ? 'comentario' : 'comentarios'}</span>}
        </span>
        <span className={`av-aviso-chevron${abierto ? ' is-girado' : ''}`}><ChevronDown size={17} /></span>
      </button>
      {esDocente && (
        <div className="av-aviso-acciones">
          <button type="button" onClick={() => onEditar(aviso)} aria-label="Editar aviso" title="Editar"><Pencil size={14} /></button>
          <button type="button" className="is-peligro" onClick={() => onBorrar(aviso.id)} aria-label="Borrar aviso" title="Borrar"><Trash2 size={14} /></button>
        </div>
      )}
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            className="av-aviso-detalle"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: sinMovimiento ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="av-aviso-cuerpo ccv-rte-content" dangerouslySetInnerHTML={{ __html: html }} />
            <ComentariosAviso courseId={courseId} aviso={aviso} onCuenta={n => onCuenta(aviso.id, n)} />
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
});

/** Avisos y comunicados del curso: fijados primero; cada aviso se abre en el
 * mismo panel (texto completo y comentarios, que se piden solo al abrirlo). */
export default function AvisosPanel({ courseId, esDocente }: Props) {
  const [avisos, setAvisos] = useState<CourseAnnouncement[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [masCargando, setMasCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<CourseAnnouncement | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    listarAvisosPagina(courseId, 1, POR_PAGINA)
      .then(res => { setAvisos(res.avisos); setTotal(res.total ?? res.avisos.length); setPagina(1); })
      .catch(err => setError(err?.message || 'No se pudieron cargar los avisos.'))
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function verMas() {
    setMasCargando(true);
    try {
      const res = await listarAvisosPagina(courseId, pagina + 1, POR_PAGINA);
      setAvisos(a => [...a, ...res.avisos.filter(n => !a.some(x => x.id === n.id))]);
      setPagina(p => p + 1);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar más avisos.');
    } finally {
      setMasCargando(false);
    }
  }

  const alternar = useCallback((id: string) => setAbiertoId(a => (a === id ? null : id)), []);
  const borrar = useCallback(async (id: string) => {
    if (!window.confirm('¿Borrar este aviso y sus comentarios?')) return;
    try {
      await borrarAviso(courseId, id);
      setAvisos(a => a.filter(x => x.id !== id));
      setTotal(t => Math.max(0, t - 1));
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar el aviso.');
    }
  }, [courseId]);
  const contar = useCallback((id: string, n: number) => {
    setAvisos(a => a.map(x => (x.id === id && x.comment_count !== n ? { ...x, comment_count: n } : x)));
  }, []);

  return (
    <div className="av-avisos">
      {esDocente && (
        <button type="button" className="av-btn is-principal is-ancho" onClick={() => setFormAbierto(true)}>
          <Plus size={16} /> Publicar un aviso
        </button>
      )}

      {loading && (
        <div className="av-avisos-esqueleto" aria-busy="true">
          {[0, 1, 2].map(i => <div key={i}><span /><p><i /><i /><i /></p></div>)}
        </div>
      )}
      {error && <p className="av-error">{error}</p>}

      {!loading && avisos.length === 0 && !error && (
        <div className="av-vacio is-grande">
          <Megaphone size={28} />
          <strong>Sin avisos todavía</strong>
          <span>{esDocente ? 'Publica el primero para comunicar fechas, cambios o recordatorios.' : 'Cuando el docente publique algo, aparecerá aquí.'}</span>
        </div>
      )}

      {!loading && avisos.map(aviso => (
        <TarjetaAviso key={aviso.id} courseId={courseId} aviso={aviso} abierto={abiertoId === aviso.id} esDocente={esDocente}
          onAlternar={alternar} onEditar={setEditando} onBorrar={borrar} onCuenta={contar} />
      ))}

      {!loading && avisos.length < total && (
        <button type="button" className="av-btn is-ancho" onClick={verMas} disabled={masCargando}>
          {masCargando ? <Loader2 size={15} className="dfm-spin" /> : null} Ver avisos anteriores ({total - avisos.length})
        </button>
      )}

      {formAbierto && <CrearAvisoModal courseId={courseId} onClose={() => setFormAbierto(false)} onSaved={cargar} />}
      {editando && <CrearAvisoModal courseId={courseId} aviso={editando} onClose={() => setEditando(null)} onSaved={cargar} />}
    </div>
  );
}
