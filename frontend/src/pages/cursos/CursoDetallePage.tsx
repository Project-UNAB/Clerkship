import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  ArrowLeft, Plus, FolderOpen, FileText, Video, Link as LinkIcon, Type,
  Pencil, Trash2, Loader2, ChevronDown, ChevronRight, ClipboardList, HelpCircle, BarChart3,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import FeedbackFab from '../../components/shared/FeedbackFab';
import { getStoredUser } from '../../data/mainAuth';
import { obtenerCurso } from '../../data/cursosApi';
import type { Course } from '../../data/consultasApi';
import {
  listarBloques, crearBloque, actualizarBloque, borrarBloque, borrarContenido,
  type CourseBlock, type CourseContentItem,
} from '../../data/cursoContenidoApi';
import AgregarContenidoModal from '../../components/cursos/AgregarContenidoModal';
import ContenidoPreviewModal from '../../components/cursos/ContenidoPreviewModal';
import AvisosPanel from '../../components/cursos/AvisosPanel';
import GestionarQuizModal from '../../components/cursos/GestionarQuizModal';
import TomarQuizModal from '../../components/cursos/TomarQuizModal';
import CalificacionesModal from '../../components/cursos/CalificacionesModal';
import EditarCursoModal from '../../components/cursos/EditarCursoModal';
import '../../styles/cursos.css';

const SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a',
    'blockquote', 'code', 'pre', 'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
};

const ICONOS: Record<CourseContentItem['type'], typeof FileText> = {
  DOCUMENT: FileText,
  VIDEO: Video,
  LINK: LinkIcon,
  TEXT: Type,
  ASSIGNMENT: ClipboardList,
  QUIZ: HelpCircle,
};

export default function CursoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const esDocente = getStoredUser()?.role === 'TEACHER';

  const [curso, setCurso] = useState<Course | null>(null);
  const [bloques, setBloques] = useState<CourseBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());

  const [nuevoBloqueAbierto, setNuevoBloqueAbierto] = useState(false);
  const [nuevoBloqueTitulo, setNuevoBloqueTitulo] = useState('');
  const [guardandoBloque, setGuardandoBloque] = useState(false);

  const [renombrandoBloqueId, setRenombrandoBloqueId] = useState<string | null>(null);
  const [renombrarValor, setRenombrarValor] = useState('');

  const [agregarContenidoEnBloque, setAgregarContenidoEnBloque] = useState<string | null>(null);
  const [itemPreview, setItemPreview] = useState<CourseContentItem | null>(null);
  const [quizItem, setQuizItem] = useState<{ item: CourseContentItem; blockId: string } | null>(null);
  const [calificacionesAbierto, setCalificacionesAbierto] = useState(false);
  const [editandoCurso, setEditandoCurso] = useState(false);

  function handleAbrirItem(item: CourseContentItem, blockId: string) {
    if (item.type === 'QUIZ') {
      setQuizItem({ item, blockId });
    } else {
      setItemPreview(item);
    }
  }

  function cargar() {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([obtenerCurso(id), listarBloques(id)])
      .then(([cursoRes, bloquesRes]) => {
        setCurso(cursoRes);
        setBloques(bloquesRes.bloques);
      })
      .catch(err => setError(err?.message || 'No se pudo cargar el curso.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggleColapsado(blockId: string) {
    setColapsados(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  async function handleCrearBloque() {
    if (!id || !nuevoBloqueTitulo.trim()) return;
    setGuardandoBloque(true);
    try {
      await crearBloque(id, nuevoBloqueTitulo.trim());
      setNuevoBloqueTitulo('');
      setNuevoBloqueAbierto(false);
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear el bloque.');
    } finally {
      setGuardandoBloque(false);
    }
  }

  async function handleRenombrarBloque(blockId: string) {
    if (!id || !renombrarValor.trim()) {
      setRenombrandoBloqueId(null);
      return;
    }
    try {
      await actualizarBloque(id, blockId, { title: renombrarValor.trim() });
      setRenombrandoBloqueId(null);
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo renombrar el bloque.');
    }
  }

  async function handleBorrarBloque(blockId: string) {
    if (!id) return;
    if (!window.confirm('¿Borrar este bloque y todo su contenido? Esta acción no se puede deshacer.')) return;
    try {
      await borrarBloque(id, blockId);
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar el bloque.');
    }
  }

  async function handleBorrarContenido(blockId: string, itemId: string) {
    if (!id) return;
    if (!window.confirm('¿Borrar este contenido?')) return;
    try {
      await borrarContenido(id, blockId, itemId);
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar el contenido.');
    }
  }

  return (
    <div className="dash-root">
      <Sidebar />
      <FeedbackFab pestana="inicio" />
      <div className="cur-wrapper">
        <div className="ccv-page">
          <button type="button" className="ccv-back-btn" onClick={() => navigate('/mis-cursos')}>
            <ArrowLeft size={16} /> Volver a mis cursos
          </button>

          {loading && (
            <div className="ccv-center" style={{ padding: 60 }}>
              <Loader2 size={32} className="dfm-spin" />
            </div>
          )}

          {!loading && error && !curso && (
            <div className="ccv-center ccv-error" style={{ padding: 60 }}>
              <p>{error}</p>
            </div>
          )}

          {!loading && curso && (
            <>
              <header className="ccv-page-header">
                <div className="ccv-page-header-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h1>{curso.name}</h1>
                    {curso.description && (
                      <div
                        className="ccv-page-desc ccv-rte-content"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(curso.description, SANITIZE_OPTS) }}
                      />
                    )}
                    <div className="ccv-page-meta">
                      {curso.academic_period && <span>{curso.academic_period}</span>}
                      {!esDocente && curso.teacher_name && <span>Docente: {curso.teacher_name}</span>}
                    </div>
                  </div>
                  <div className="ccv-page-header-actions">
                    {esDocente && (
                      <button type="button" className="ccv-btn-secondary" onClick={() => setEditandoCurso(true)}>
                        <Pencil size={14} /> Editar curso
                      </button>
                    )}
                    <button type="button" className="ccv-btn-secondary" onClick={() => setCalificacionesAbierto(true)}>
                      <BarChart3 size={14} /> {esDocente ? 'Calificaciones' : 'Mis calificaciones'}
                    </button>
                  </div>
                </div>
              </header>

              {error && <p className="ccv-form-error" style={{ marginBottom: 12 }}>{error}</p>}

              {id && <AvisosPanel courseId={id} esDocente={esDocente} />}

              <div className="ccv-blocks-list">
                {bloques.map(bloque => {
                  const colapsado = colapsados.has(bloque.id);
                  return (
                    <div key={bloque.id} className="ccv-block-card">
                      <div className="ccv-block-header">
                        <button type="button" className="ccv-block-toggle" onClick={() => toggleColapsado(bloque.id)}>
                          {colapsado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                          <FolderOpen size={16} />
                          {renombrandoBloqueId === bloque.id ? (
                            <input
                              autoFocus
                              value={renombrarValor}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setRenombrarValor(e.target.value)}
                              onBlur={() => handleRenombrarBloque(bloque.id)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenombrarBloque(bloque.id);
                                if (e.key === 'Escape') setRenombrandoBloqueId(null);
                              }}
                              className="ccv-block-rename-input"
                            />
                          ) : (
                            <span className="ccv-block-title">{bloque.title}</span>
                          )}
                          <span className="ccv-block-count">{bloque.contenido.length}</span>
                        </button>

                        {esDocente && (
                          <div className="ccv-block-actions">
                            <button
                              type="button"
                              title="Renombrar bloque"
                              onClick={() => { setRenombrandoBloqueId(bloque.id); setRenombrarValor(bloque.title); }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button type="button" title="Borrar bloque" className="danger" onClick={() => handleBorrarBloque(bloque.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {bloque.description && !colapsado && (
                        <p className="ccv-block-desc">{bloque.description}</p>
                      )}

                      {!colapsado && (
                        <div className="ccv-items-grid">
                          {bloque.contenido.map(item => {
                            const Icon = ICONOS[item.type];
                            return (
                              <div key={item.id} className="ccv-item-card" onClick={() => handleAbrirItem(item, bloque.id)}>
                                <div className={`ccv-item-icon ccv-item-icon-${item.type.toLowerCase()}`}>
                                  <Icon size={18} />
                                </div>
                                <div className="ccv-item-text">
                                  <span className="ccv-item-title">{item.title}</span>
                                  {item.description && <span className="ccv-item-desc">{item.description}</span>}
                                </div>
                                {esDocente && (
                                  <button
                                    type="button"
                                    className="ccv-item-delete"
                                    title="Borrar"
                                    onClick={e => { e.stopPropagation(); handleBorrarContenido(bloque.id, item.id); }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          {esDocente && (
                            <button
                              type="button"
                              className="ccv-item-add"
                              onClick={() => setAgregarContenidoEnBloque(bloque.id)}
                            >
                              <Plus size={16} /> Agregar contenido
                            </button>
                          )}

                          {!esDocente && bloque.contenido.length === 0 && (
                            <p className="ccv-empty-note">El docente todavía no agregó contenido en este bloque.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {bloques.length === 0 && (
                  <div className="ccv-empty-note" style={{ padding: 24 }}>
                    {esDocente
                      ? 'Todavía no hay bloques. Crea el primero para empezar a organizar el material del curso.'
                      : 'El docente todavía no publicó material para este curso.'}
                  </div>
                )}

                {esDocente && (
                  nuevoBloqueAbierto ? (
                    <div className="ccv-new-block-form">
                      <input
                        autoFocus
                        placeholder="Título del bloque (ej. Semana 1: Dolor abdominal)"
                        value={nuevoBloqueTitulo}
                        onChange={e => setNuevoBloqueTitulo(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCrearBloque(); }}
                      />
                      <button type="button" className="ccv-btn-primary" onClick={handleCrearBloque} disabled={guardandoBloque}>
                        {guardandoBloque ? <Loader2 size={14} className="dfm-spin" /> : 'Crear'}
                      </button>
                      <button type="button" className="ccv-btn-secondary" onClick={() => setNuevoBloqueAbierto(false)}>Cancelar</button>
                    </div>
                  ) : (
                    <button type="button" className="ccv-new-block-btn" onClick={() => setNuevoBloqueAbierto(true)}>
                      <Plus size={16} /> Nuevo bloque
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {agregarContenidoEnBloque && id && (
        <AgregarContenidoModal
          courseId={id}
          blockId={agregarContenidoEnBloque}
          onClose={() => setAgregarContenidoEnBloque(null)}
          onCreated={cargar}
        />
      )}

      {itemPreview && id && (
        <ContenidoPreviewModal courseId={id} item={itemPreview} onClose={() => setItemPreview(null)} />
      )}

      {quizItem && id && (
        esDocente ? (
          <GestionarQuizModal courseId={id} blockId={quizItem.blockId} item={quizItem.item} onClose={() => setQuizItem(null)} />
        ) : (
          <TomarQuizModal courseId={id} blockId={quizItem.blockId} item={quizItem.item} onClose={() => setQuizItem(null)} />
        )
      )}

      {calificacionesAbierto && id && (
        <CalificacionesModal courseId={id} esDocente={esDocente} onClose={() => setCalificacionesAbierto(false)} />
      )}

      {editandoCurso && curso && (
        <EditarCursoModal
          curso={curso}
          onClose={() => setEditandoCurso(false)}
          onSaved={setCurso}
        />
      )}
    </div>
  );
}
