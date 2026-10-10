import { useEffect, useState } from 'react';
import { Megaphone, Pin, Plus, Pencil, Trash2, MessageCircle, Loader2 } from 'lucide-react';
import { listarAvisos, borrarAviso, type CourseAnnouncement } from '../../data/cursoAvisosApi';
import CrearAvisoModal from './CrearAvisoModal';
import AvisoDetalleModal from './AvisoDetalleModal';
import { formatFecha as formatFechaColombia } from '../../utils/fechas';

interface Props {
  courseId: string;
  esDocente: boolean;
}

function formatFecha(iso: string | null) {
  if (!iso) return '';
  return formatFechaColombia(iso);
}

export default function AvisosPanel({ courseId, esDocente }: Props) {
  const [avisos, setAvisos] = useState<CourseAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colapsado, setColapsado] = useState(false);

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<CourseAnnouncement | null>(null);
  const [viendo, setViendo] = useState<CourseAnnouncement | null>(null);

  function cargar() {
    setLoading(true);
    listarAvisos(courseId)
      .then(res => setAvisos(res.avisos))
      .catch(err => setError(err?.message || 'No se pudieron cargar los avisos.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function handleBorrar(e: React.MouseEvent, avisoId: string) {
    e.stopPropagation();
    if (!window.confirm('¿Borrar este aviso y sus comentarios?')) return;
    try {
      await borrarAviso(courseId, avisoId);
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar el aviso.');
    }
  }

  if (loading) {
    return (
      <div className="ccv-avisos-panel">
        <Loader2 size={20} className="dfm-spin" />
      </div>
    );
  }

  return (
    <div className="ccv-avisos-panel">
      <button type="button" className="ccv-avisos-header" onClick={() => setColapsado(v => !v)}>
        <Megaphone size={16} />
        <span>Avisos</span>
        <span className="ccv-block-count">{avisos.length}</span>
      </button>

      {!colapsado && (
        <>
          {error && <p className="ccv-form-error">{error}</p>}

          {avisos.length === 0 && (
            <p className="ccv-empty-note">
              {esDocente ? 'Todavía no has publicado ningún aviso.' : 'El docente todavía no ha publicado avisos.'}
            </p>
          )}

          <div className="ccv-avisos-list">
            {avisos.map(aviso => (
              <div key={aviso.id} className="ccv-aviso-card" onClick={() => setViendo(aviso)}>
                {aviso.pinned && <Pin size={13} className="ccv-aviso-pin" />}
                <div className="ccv-aviso-card-main">
                  <span className="ccv-aviso-card-title">{aviso.title}</span>
                  <span className="ccv-aviso-card-meta">
                    {aviso.author_name} · {formatFecha(aviso.created_at)} · <MessageCircle size={11} /> {aviso.comment_count}
                  </span>
                </div>
                {esDocente && (
                  <div className="ccv-block-actions" onClick={e => e.stopPropagation()}>
                    <button type="button" title="Editar" onClick={() => setEditando(aviso)}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" title="Borrar" className="danger" onClick={e => handleBorrar(e, aviso.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {esDocente && (
            <button type="button" className="ccv-new-block-btn" onClick={() => setFormAbierto(true)}>
              <Plus size={16} /> Nuevo aviso
            </button>
          )}
        </>
      )}

      {formAbierto && (
        <CrearAvisoModal courseId={courseId} onClose={() => setFormAbierto(false)} onSaved={cargar} />
      )}
      {editando && (
        <CrearAvisoModal courseId={courseId} aviso={editando} onClose={() => setEditando(null)} onSaved={cargar} />
      )}
      {viendo && (
        <AvisoDetalleModal courseId={courseId} aviso={viendo} onClose={() => setViendo(null)} />
      )}
    </div>
  );
}
