import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { X, Send, Trash2, Loader2, MessageCircle } from 'lucide-react';
import {
  listarComentarios, crearComentario, borrarComentario,
  type CourseAnnouncement, type AnnouncementComment,
} from '../../data/cursoAvisosApi';
import { getStoredUser } from '../../data/mainAuth';
import { formatFechaHora } from '../../utils/fechas';

const SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a',
    'blockquote', 'code', 'pre', 'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
};

interface Props {
  courseId: string;
  aviso: CourseAnnouncement;
  onClose: () => void;
}

function formatFecha(iso: string | null) {
  if (!iso) return '';
  return formatFechaHora(iso);
}

export default function AvisoDetalleModal({ courseId, aviso, onClose }: Props) {
  const usuario = getStoredUser();
  const esDocente = usuario?.role === 'TEACHER';

  const [comentarios, setComentarios] = useState<AnnouncementComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setLoading(true);
    listarComentarios(courseId, aviso.id)
      .then(res => setComentarios(res.comentarios))
      .catch(err => setError(err?.message || 'No se pudieron cargar los comentarios.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso.id]);

  async function handleEnviar() {
    if (!nuevoComentario.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      await crearComentario(courseId, aviso.id, nuevoComentario.trim());
      setNuevoComentario('');
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar el comentario.');
    } finally {
      setEnviando(false);
    }
  }

  async function handleBorrar(commentId: string) {
    if (!window.confirm('¿Borrar este comentario?')) return;
    try {
      await borrarComentario(courseId, aviso.id, commentId);
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar el comentario.');
    }
  }

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal ccv-modal-form-wide" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>{aviso.title}</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-aviso-meta">
          {aviso.author_name && <span>{aviso.author_name}</span>}
          {aviso.created_at && <span>{formatFecha(aviso.created_at)}</span>}
        </div>

        <div
          className="ccv-aviso-body ccv-rte-content"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(aviso.body || '', SANITIZE_OPTS) }}
        />

        <div className="ccv-aviso-comments">
          <h4><MessageCircle size={14} /> Comentarios ({comentarios.length})</h4>

          {loading && <Loader2 size={18} className="dfm-spin" />}

          {!loading && comentarios.length === 0 && (
            <p className="ccv-empty-note">Todavía no hay comentarios.</p>
          )}

          {!loading && comentarios.map(c => (
            <div key={c.id} className="ccv-comment-item">
              <div className="ccv-comment-head">
                <span className="ccv-comment-author">
                  {c.author_name}
                  {c.author_role === 'TEACHER' && <span className="ccv-comment-badge">Docente</span>}
                </span>
                <span className="ccv-comment-date">{formatFecha(c.created_at)}</span>
                {(c.author_id === usuario?.id || esDocente) && (
                  <button type="button" className="ccv-comment-delete" onClick={() => handleBorrar(c.id)} title="Borrar">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <p className="ccv-comment-content">{c.content}</p>
            </div>
          ))}

          {error && <p className="ccv-form-error">{error}</p>}

          <div className="ccv-comment-form">
            <input
              type="text"
              value={nuevoComentario}
              onChange={e => setNuevoComentario(e.target.value)}
              placeholder="Escribe un comentario..."
              onKeyDown={e => { if (e.key === 'Enter') handleEnviar(); }}
            />
            <button type="button" className="ccv-btn-primary" onClick={handleEnviar} disabled={enviando || !nuevoComentario.trim()}>
              {enviando ? <Loader2 size={14} className="dfm-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
