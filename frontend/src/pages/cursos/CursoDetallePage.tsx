import { Fragment, useCallback, useEffect, useRef, useState, useMemo, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  ArrowLeft, ArrowRight, Plus, FileText, Video, Link as LinkIcon, Type,
  Pencil, Trash2, Loader2, ClipboardList, HelpCircle,
  BarChart3, Search, X, Clock, BookOpen, ArrowUpRight,
  Users, MessagesSquare, Check, Image as ImageIcon, Mail, ExternalLink, Palette,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import FeedbackFab from '../../components/shared/FeedbackFab';
import { getStoredUser } from '../../data/mainAuth';
import { actualizarCurso, obtenerCurso } from '../../data/cursosApi';
import type { Course } from '../../data/consultasApi';
import {
  listarBloques, crearBloque, actualizarBloque, borrarBloque, borrarContenido, reordenarBloques,
  type CourseBlock, type CourseContentItem,
} from '../../data/cursoContenidoApi';
import AgregarContenidoModal from '../../components/cursos/AgregarContenidoModal';
import ContenidoPreviewModal from '../../components/cursos/ContenidoPreviewModal';
import AvisosPanel from '../../components/cursos/AvisosPanel';
import { listarAvisos } from '../../data/cursoAvisosApi';
import GestionarQuizModal from '../../components/cursos/GestionarQuizModal';
import TomarQuizModal from '../../components/cursos/TomarQuizModal';
import GestionarTareaModal from '../../components/cursos/GestionarTareaModal';
import EntregarTareaModal from '../../components/cursos/EntregarTareaModal';
import CalificacionesModal from '../../components/cursos/CalificacionesModal';
import EditarTarjetaCursoModal from '../../components/cursos/EditarTarjetaCursoModal';
import RichTextEditor from '../../components/cursos/RichTextEditor';
import MiembrosCursoModal from '../../components/cursos/MiembrosCursoModal';
import AccesosDirectosModal from '../../components/cursos/AccesosDirectosModal';
import { colorDeModulo, iconoDeModulo } from '../../components/cursos/estiloModulo';
import SelectorEstiloModulo from '../../components/cursos/SelectorEstiloModulo';
import { formatFileSize } from '../../utils/fileUpload';
import { faltaPara, formatFechaHoraCorta } from '../../utils/fechas';
import '../../styles/cursos.css';

const SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a',
    'blockquote', 'code', 'pre', 'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'value'],
};

const TYPE_CONFIG: Record<
  CourseContentItem['type'],
  { label: string; tag: string; iconClass: string; icon: typeof FileText }
> = {
  DOCUMENT: { label: 'Documento', tag: 'Doc Clínico', iconClass: 'ccv-item-icon-document', icon: FileText },
  VIDEO: { label: 'Video', tag: 'Video Clase', iconClass: 'ccv-item-icon-video', icon: Video },
  LINK: { label: 'Enlace', tag: 'Recurso Web', iconClass: 'ccv-item-icon-link', icon: LinkIcon },
  TEXT: { label: 'Nota', tag: 'Lectura', iconClass: 'ccv-item-icon-text', icon: Type },
  ASSIGNMENT: { label: 'Tarea', tag: 'Evaluación', iconClass: 'ccv-item-icon-assignment', icon: ClipboardList },
  QUIZ: { label: 'Cuestionario', tag: 'Quiz / Caso', iconClass: 'ccv-item-icon-quiz', icon: HelpCircle },
};

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

/** El avatar se guarda como SVG, como data URI o como URL: siempre se muestra en un <img>. */
function srcDeAvatar(avatar?: string | null): string | null {
  if (!avatar) return null;
  const valor = avatar.trim();
  if (valor.startsWith('<svg')) return `data:image/svg+xml;utf8,${encodeURIComponent(valor)}`;
  return valor;
}

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase() ?? '').join('');
}

export default function CursoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const esDocente = getStoredUser()?.role === 'TEACHER';

  const [curso, setCurso] = useState<Course | null>(null);
  const [bloques, setBloques] = useState<CourseBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Módulo desplegado: uno solo a la vez; su contenido se abre debajo de la
  // fila de tarjetas en la que está. Al entrar al curso no hay ninguno abierto.
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const panelRef = useRef<HTMLLIElement>(null);
  // Selector de icono y color de la tarjeta del módulo abierto (docente).
  const [personalizando, setPersonalizando] = useState(false);

  // Búsqueda y Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | CourseContentItem['type']>('ALL');

  // Estados de Modales y Formulario
  const [nuevoBloqueAbierto, setNuevoBloqueAbierto] = useState(false);
  const [nuevoBloqueTitulo, setNuevoBloqueTitulo] = useState('');
  const [nuevoBloqueEstilo, setNuevoBloqueEstilo] = useState<{ icon?: string; color?: string }>({});
  // Módulo que el docente está arrastrando y el módulo sobre el que va a caer.
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [guardandoBloque, setGuardandoBloque] = useState(false);

  const [renombrandoBloqueId, setRenombrandoBloqueId] = useState<string | null>(null);
  const [renombrarValor, setRenombrarValor] = useState('');

  const [agregarContenidoEnBloque, setAgregarContenidoEnBloque] = useState<string | null>(null);
  const [itemPreview, setItemPreview] = useState<CourseContentItem | null>(null);
  const [quizItem, setQuizItem] = useState<{ item: CourseContentItem; blockId: string } | null>(null);
  const [tareaItem, setTareaItem] = useState<{ item: CourseContentItem; blockId: string } | null>(null);
  const [calificacionesAbierto, setCalificacionesAbierto] = useState(false);
  const [miembrosAbierto, setMiembrosAbierto] = useState(false);
  const [accesosAbierto, setAccesosAbierto] = useState(false);
  // Edición del curso sobre la propia página: mientras hay borrador, el
  // título, el período y la información se escriben donde se muestran.
  const [borrador, setBorrador] = useState<{ name: string; periodo: string; description: string } | null>(null);
  const [guardandoCurso, setGuardandoCurso] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const [tarjetaAbierta, setTarjetaAbierta] = useState(false);
  const editando = borrador !== null;
  const hayCambios = !!borrador && !!curso && (
    borrador.name !== curso.name
    || borrador.periodo !== (curso.academic_period || '')
    || borrador.description !== (curso.description || '')
  );

  // Avisa antes de cerrar o recargar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayCambios]);

  const cambiarDescripcion = useCallback((html: string) => {
    setBorrador(b => (b ? { ...b, description: html } : b));
  }, []);

  function empezarEdicion() {
    if (!curso) return;
    setErrorEdicion(null);
    setBorrador({ name: curso.name, periodo: curso.academic_period || '', description: curso.description || '' });
  }

  function cancelarEdicion() {
    if (hayCambios && !window.confirm('¿Descartar los cambios sin guardar?')) return;
    setErrorEdicion(null);
    setBorrador(null);
  }

  async function guardarEdicion() {
    if (!borrador || !curso) return;
    if (!borrador.name.trim()) {
      setErrorEdicion('Ponle un nombre al curso.');
      return;
    }
    setGuardandoCurso(true);
    setErrorEdicion(null);
    try {
      const actualizado = await actualizarCurso(curso.id, {
        name: borrador.name.trim(),
        description: borrador.description,
        academic_period: borrador.periodo.trim(),
      });
      setCurso(previo => ({ ...previo, ...actualizado }));
      setBorrador(null);
    } catch (err: any) {
      setErrorEdicion(err?.message || 'No se pudo guardar el curso.');
    } finally {
      setGuardandoCurso(false);
    }
  }
  // Avisos: se abren desde el icono del encabezado; el número es el total publicado.
  const [avisosAbierto, setAvisosAbierto] = useState(false);
  const [totalAvisos, setTotalAvisos] = useState<number | null>(null);

  function contarAvisos() {
    if (!id) return;
    listarAvisos(id)
      .then(res => setTotalAvisos(res.total ?? res.avisos.length))
      .catch(() => setTotalAvisos(null));
  }

  function cerrarAvisos() {
    setAvisosAbierto(false);
    contarAvisos();          // pudo publicarse o borrarse alguno mientras estaba abierto
  }

  function handleAbrirItem(item: CourseContentItem, blockId: string) {
    if (item.type === 'QUIZ') {
      setQuizItem({ item, blockId });
    } else if (item.type === 'ASSIGNMENT') {
      setTareaItem({ item, blockId });
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
    contarAvisos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!avisosAbierto) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarAvisos(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avisosAbierto]);

  function toggleAbierto(blockId: string) {
    setAbiertoId(previo => (previo === blockId ? null : blockId));
    setPersonalizando(false);
  }

  // Al desplegar un módulo, su contenido queda a la vista.
  useEffect(() => {
    if (!abiertoId) return;
    const sinAnimacion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: sinAnimacion ? 'auto' : 'smooth' });
  }, [abiertoId]);

  async function handleCrearBloque() {
    if (!id || !nuevoBloqueTitulo.trim()) return;
    setGuardandoBloque(true);
    try {
      await crearBloque(id, nuevoBloqueTitulo.trim(), nuevoBloqueEstilo);
      setNuevoBloqueTitulo('');
      setNuevoBloqueEstilo({});
      setNuevoBloqueAbierto(false);
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear el bloque.');
    } finally {
      setGuardandoBloque(false);
    }
  }

  /** Mueve el módulo `blockId` a la posición de `antesDeId` (o al final si
   * es null) y guarda el orden completo. Se ve al instante; si el servidor
   * lo rechaza, se recarga el orden guardado. */
  async function moverBloque(blockId: string, antesDeId: string | null) {
    if (!id || blockId === antesDeId) return;
    const sinMover = bloques.filter(b => b.id !== blockId);
    const movido = bloques.find(b => b.id === blockId);
    if (!movido) return;
    const indice = antesDeId ? sinMover.findIndex(b => b.id === antesDeId) : sinMover.length;
    const nuevo = [...sinMover.slice(0, indice), movido, ...sinMover.slice(indice)];
    if (nuevo.every((b, i) => b.id === bloques[i].id)) return;
    setBloques(nuevo);
    try {
      await reordenarBloques(id, nuevo.map(b => b.id));
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el nuevo orden de los módulos.');
      cargar();
    }
  }

  /** Alternativa al arrastre (teclado y pantallas táctiles): un lugar antes o después. */
  function correrBloque(blockId: string, paso: -1 | 1) {
    const i = bloques.findIndex(b => b.id === blockId);
    const j = i + paso;
    if (i < 0 || j < 0 || j >= bloques.length) return;
    // Mover hacia adelante = quedar antes del módulo que estaba dos lugares después.
    moverBloque(blockId, paso === -1 ? bloques[j].id : (bloques[j + 1]?.id ?? null));
  }

  /** Cambia el icono o el color de la tarjeta de un módulo. Se ve al
   * instante; si el servidor lo rechaza, vuelve a lo que estaba guardado. */
  async function handleEstiloBloque(blockId: string, estilo: { icon?: string; color?: string }) {
    if (!id) return;
    setBloques(lista => lista.map(b => (b.id === blockId ? { ...b, ...estilo } : b)));
    try {
      await actualizarBloque(id, blockId, estilo);
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar el aspecto del módulo.');
      cargar();
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

  // Métricas y Contadores globales del curso
  const stats = useMemo(() => {
    let docs = 0;
    let videos = 0;
    let links = 0;
    let texts = 0;
    let assignments = 0;
    let quizzes = 0;

    bloques.forEach(b => {
      b.contenido.forEach(it => {
        if (it.type === 'DOCUMENT') docs++;
        else if (it.type === 'VIDEO') videos++;
        else if (it.type === 'LINK') links++;
        else if (it.type === 'TEXT') texts++;
        else if (it.type === 'ASSIGNMENT') assignments++;
        else if (it.type === 'QUIZ') quizzes++;
      });
    });

    const totalItems = docs + videos + links + texts + assignments + quizzes;
    return {
      totalBlocks: bloques.length,
      totalItems,
      docs,
      videos,
      links,
      texts,
      assignments,
      quizzes,
    };
  }, [bloques]);

  // Filtro y Búsqueda en vivo
  const puedeOrdenar = esDocente && !searchQuery.trim() && activeFilter === 'ALL';

  const filteredBloques = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query && activeFilter === 'ALL') {
      return bloques;
    }

    return bloques
      .map(b => {
        const matchingItems = b.contenido.filter(item => {
          if (activeFilter !== 'ALL' && item.type !== activeFilter) return false;
          if (!query) return true;
          const matchTitle = item.title?.toLowerCase().includes(query);
          const matchDesc = item.description?.toLowerCase().includes(query);
          const matchFile = item.file?.nombre?.toLowerCase().includes(query);
          return matchTitle || matchDesc || matchFile;
        });

        return {
          ...b,
          contenido: matchingItems,
        };
      })
      .filter(b => (query || activeFilter !== 'ALL' ? b.contenido.length > 0 : true));
  }, [bloques, searchQuery, activeFilter]);

  const totalFilteredItems = useMemo(() => {
    return filteredBloques.reduce((acc, b) => acc + b.contenido.length, 0);
  }, [filteredBloques]);

  function renderItemCard(item: CourseContentItem, blockId: string) {
    const config = TYPE_CONFIG[item.type];
    const Icon = config.icon;

    return (
      <div
        key={item.id}
        className="ccv-item-card"
        onClick={() => handleAbrirItem(item, blockId)}
      >
        <div className={`ccv-item-icon ${config.iconClass}`}>
          <Icon size={18} />
        </div>

        <div className="ccv-item-text">
          <div className="ccv-item-badge-row">
            <span className="ccv-item-tag">{config.tag}</span>
            {item.file?.size_bytes && (
              <span className="ccv-item-meta-pill">
                {formatFileSize(item.file.size_bytes)}
              </span>
            )}
            {item.type === 'ASSIGNMENT' && item.max_score && (
              <span className="ccv-item-meta-pill">
                {item.max_score} pts
              </span>
            )}
            {item.type === 'QUIZ' && item.time_limit_minutes && (
              <span className="ccv-item-meta-pill">
                {item.time_limit_minutes} min
              </span>
            )}
          </div>

          <span className="ccv-item-title">{item.title}</span>

          {item.description && (
            <span className="ccv-item-desc">{item.description}</span>
          )}

          {item.due_at && (
            <span className="ccv-item-due">
              <Clock size={11} />
              Vence {faltaPara(item.due_at)} ({formatFechaHoraCorta(item.due_at)})
            </span>
          )}
        </div>

        <ArrowUpRight size={16} className="ccv-item-arrow" />

        {esDocente && (
          <button
            type="button"
            className="ccv-item-delete"
            title="Borrar recurso"
            onClick={e => {
              e.stopPropagation();
              handleBorrarContenido(blockId, item.id);
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="dash-root">
      <Sidebar />
      <FeedbackFab pestana="inicio" />

      {/* Contenedor principal con SCROLL VERTICAL FLUIDO y márgenes optimizados */}
      <main className="ccv-page-container">
        <div className={`ccv-inner-content cdl-wide ${editando ? 'is-editando' : ''}`}>
          {/* Estado de Carga */}
          {loading && (
            <div className="ccv-center" style={{ padding: 80, textAlign: 'center' }}>
              <Loader2 size={36} className="dfm-spin" color="#0284C7" style={{ margin: '0 auto' }} />
              <p style={{ marginTop: 12, fontSize: 14, color: 'var(--ink3, #64748B)', fontWeight: 600 }}>
                Cargando aula clínica y recursos...
              </p>
            </div>
          )}

          {/* Estado de Error */}
          {!loading && error && !curso && (
            <div className="ccv-center ccv-error" style={{ padding: 60, textAlign: 'center' }}>
              <p>{error}</p>
              <button
                type="button"
                className="ccv-btn-primary"
                style={{ marginTop: 12 }}
                onClick={cargar}
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && curso && (
            <>
              {/* ══ Encabezado: volver, título y acciones ══ */}
              <div className="cdl-top">
                <button type="button" className="cdl-back" onClick={() => navigate('/mis-cursos')}>
                  <ArrowLeft size={15} /> Volver
                </button>
                <div className="cdl-top-actions">
                  {esDocente && !editando && (
                    <button type="button" className="ccv-btn-pill-action" onClick={empezarEdicion}>
                      <Pencil size={13} /> Editar curso
                    </button>
                  )}
                  {editando && <span className="cdl-editando-aviso"><Pencil size={13} /> Editando el curso</span>}
                  <button
                    type="button"
                    className="cdl-icon-btn"
                    title="Avisos y comunicados"
                    aria-label={`Avisos y comunicados${totalAvisos ? `: ${totalAvisos}` : ''}`}
                    onClick={() => setAvisosAbierto(true)}
                  >
                    <MessagesSquare size={19} />
                    {totalAvisos !== null && totalAvisos > 0 && (
                      <span className="cdl-icon-badge">{totalAvisos > 99 ? '99+' : totalAvisos}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="cdl-icon-btn"
                    title={esDocente ? 'Calificaciones' : 'Mis calificaciones'}
                    aria-label={esDocente ? 'Calificaciones' : 'Mis calificaciones'}
                    onClick={() => setCalificacionesAbierto(true)}
                  >
                    <BarChart3 size={19} />
                  </button>
                </div>
              </div>

              {borrador ? (
                <div className="cdl-title-row">
                  <input
                    className="cdl-title cdl-title-input"
                    aria-label="Nombre del curso"
                    placeholder="Nombre del curso"
                    maxLength={150}
                    value={borrador.name}
                    onChange={e => setBorrador({ ...borrador, name: e.target.value })}
                  />
                  <input
                    className="cdl-badge cdl-badge-input"
                    aria-label="Período académico"
                    placeholder="Período"
                    maxLength={20}
                    size={Math.max(7, borrador.periodo.length + 1)}
                    value={borrador.periodo}
                    onChange={e => setBorrador({ ...borrador, periodo: e.target.value })}
                  />
                </div>
              ) : (
                <div className="cdl-title-row">
                  <h1 className="cdl-title">{curso.name}</h1>
                  {curso.academic_period && <span className="cdl-badge">{curso.academic_period}</span>}
                </div>
              )}

              {((curso.pending_assignments ?? 0) > 0 || (curso.next_due_title && curso.next_due_at)) && (
                <div className="cdl-alertas">
                  {(curso.pending_assignments ?? 0) > 0 && (
                    <span className="cdl-alerta">
                      <Clock size={14} />
                      {curso.pending_assignments} {plural(curso.pending_assignments ?? 0, 'tarea pendiente', 'tareas pendientes')}
                    </span>
                  )}
                  {curso.next_due_title && curso.next_due_at && (
                    <span className="cdl-alerta" title={curso.next_due_title}>
                      <Clock size={14} /> Próxima entrega {faltaPara(curso.next_due_at)}
                    </span>
                  )}
                </div>
              )}

              {error && <p className="cdl-error">{error}</p>}

              <div className="cdl-grid">
                {/* ── Sobre este curso ── */}
                <section className="cdl-area-about" aria-label="Información del curso">
                  {borrador ? (
                    <RichTextEditor
                      variante="pagina"
                      content={curso.description || ''}
                      onChange={cambiarDescripcion}
                      placeholder="Escribe aquí la información del curso: bienvenida, objetivos, cronograma…"
                      acciones={
                        <>
                          {errorEdicion && <span className="cdl-editbar-error" role="alert">{errorEdicion}</span>}
                          <button type="button" className="ccv-btn-secondary cdl-editbar-btn" onClick={() => setTarjetaAbierta(true)} disabled={guardandoCurso}>
                            <ImageIcon size={14} /> Tarjeta del curso
                          </button>
                          <button type="button" className="ccv-btn-secondary cdl-editbar-btn" onClick={cancelarEdicion} disabled={guardandoCurso}>
                            <X size={14} /> Cancelar
                          </button>
                          <button type="button" className="ccv-btn-primary" onClick={guardarEdicion} disabled={guardandoCurso}>
                            {guardandoCurso ? <Loader2 size={14} className="dfm-spin" /> : <Check size={14} />} Guardar
                          </button>
                        </>
                      }
                    />
                  ) : curso.description ? (
                    <div
                      className="cdl-text ccv-rte-content"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(curso.description, SANITIZE_OPTS) }}
                    />
                  ) : (
                    <p className="cdl-text cdl-muted">
                      {esDocente
                        ? 'Este curso todavía no tiene descripción. Puedes escribirla con "Editar curso".'
                        : 'El docente todavía no ha escrito la descripción de este curso.'}
                    </p>
                  )}
                </section>

                {/* ── Sobre el docente ── */}
                <section className="cdl-area-teacher" aria-label="Docente y accesos del curso">
                  {curso.teacher_name ? (
                    <div className="cdl-teacher">
                      {srcDeAvatar(curso.teacher_avatar) ? (
                        <img className="cdl-teacher-avatar" src={srcDeAvatar(curso.teacher_avatar) as string} alt="" />
                      ) : (
                        <div className="cdl-teacher-avatar cdl-teacher-avatar-txt" aria-hidden="true">
                          {iniciales(curso.teacher_name)}
                        </div>
                      )}
                      <div className="cdl-teacher-datos">
                        <p className="cdl-teacher-name">{curso.teacher_name}</p>
                        <p className="cdl-teacher-role">Docente del curso</p>
                        {curso.teacher_email && (
                          <a className="cdl-teacher-mail" href={`mailto:${curso.teacher_email}`} title="Escribir al docente">
                            <Mail size={14} /> {curso.teacher_email}
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="cdl-text cdl-muted">No se pudo cargar la información del docente.</p>
                  )}

                {/* Accesos directos: los miembros y los enlaces que puso el docente */}
                <div className="cdl-accesos">
                  <button type="button" className="cdl-acceso" onClick={() => setMiembrosAbierto(true)}>
                    <Users size={15} /> Miembros del curso
                    {curso.student_count !== undefined && <span className="cdl-acceso-n">{curso.student_count}</span>}
                  </button>
                  {(curso.shortcuts ?? []).filter(a => /^https?:\/\//i.test(a.url)).map((a, i) => (
                    <a key={`${a.url}-${i}`} className="cdl-acceso" href={a.url} target="_blank" rel="noopener noreferrer" title={a.url}>
                      <ExternalLink size={14} /> {a.label}
                    </a>
                  ))}
                  {esDocente && (
                    <button type="button" className="cdl-acceso cdl-acceso-editar" onClick={() => setAccesosAbierto(true)}>
                      {(curso.shortcuts ?? []).length > 0
                        ? <><Pencil size={13} /> Editar accesos</>
                        : <><Plus size={14} /> Agregar acceso directo</>}
                    </button>
                  )}
                </div>
                </section>

                {/* ── Módulos del curso (acordeón) ── */}
                <section className="cdl-area-modules">
                  <div className="cdl-modules-head">
                    <h2 className="cdl-h2">Módulos del curso</h2>
                    {esDocente && !nuevoBloqueAbierto && (
                      <button type="button" className="ccv-btn-pill-create" onClick={() => setNuevoBloqueAbierto(true)}>
                        <Plus size={14} /> Nuevo módulo
                      </button>
                    )}
                  </div>

                  {nuevoBloqueAbierto && esDocente && (
                    <div className="ccv-inline-new-module">
                      <SelectorEstiloModulo
                        icon={nuevoBloqueEstilo.icon}
                        color={nuevoBloqueEstilo.color}
                        onChange={e => setNuevoBloqueEstilo(previo => ({ ...previo, ...e }))}
                        disabled={guardandoBloque}
                      />
                      <input
                        autoFocus
                        placeholder="Título del nuevo módulo..."
                        value={nuevoBloqueTitulo}
                        onChange={e => setNuevoBloqueTitulo(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCrearBloque();
                          if (e.key === 'Escape') setNuevoBloqueAbierto(false);
                        }}
                      />
                      <button type="button" className="ccv-btn-primary" onClick={handleCrearBloque} disabled={guardandoBloque}>
                        {guardandoBloque ? <Loader2 size={13} className="dfm-spin" /> : 'Crear'}
                      </button>
                      <button type="button" className="ccv-btn-secondary" onClick={() => { setNuevoBloqueAbierto(false); setNuevoBloqueEstilo({}); }}>
                        Cancelar
                      </button>
                    </div>
                  )}

                  {stats.totalItems > 0 && (
                    <div className="cdl-tools">
                      <div className="ccv-search-box">
                        <Search size={15} color="#94A3B8" />
                        <input
                          type="text"
                          placeholder="Buscar en el contenido del curso..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                          <button type="button" className="ccv-search-clear" onClick={() => setSearchQuery('')} title="Limpiar búsqueda">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <div className="ccv-filter-chips">
                        {([
                          ['ALL', 'Todos', stats.totalItems, null],
                          ['DOCUMENT', 'Documentos', stats.docs, FileText],
                          ['ASSIGNMENT', 'Tareas', stats.assignments, ClipboardList],
                          ['QUIZ', 'Cuestionarios', stats.quizzes, HelpCircle],
                          ['VIDEO', 'Videos', stats.videos, Video],
                          ['LINK', 'Enlaces', stats.links, LinkIcon],
                          ['TEXT', 'Notas', stats.texts, Type],
                        ] as const).filter(([tipo, , cuenta]) => tipo === 'ALL' || cuenta > 0).map(([tipo, etiqueta, cuenta, Icono]) => (
                          <button
                            key={tipo}
                            type="button"
                            className={`ccv-filter-chip ${activeFilter === tipo ? 'is-active' : ''}`}
                            onClick={() => setActiveFilter(tipo)}
                          >
                            {Icono && <Icono size={12} />}
                            <span>{etiqueta}</span>
                            <span className="ccv-filter-count">{cuenta}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(searchQuery || activeFilter !== 'ALL') && totalFilteredItems === 0 && (
                    <div className="ccv-empty-note" style={{ textAlign: 'center', padding: '24px 16px' }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Ningún contenido coincide con la búsqueda.</p>
                      <button
                        type="button"
                        className="ccv-btn-pill-action"
                        style={{ marginTop: 10 }}
                        onClick={() => { setSearchQuery(''); setActiveFilter('ALL'); }}
                      >
                        Quitar filtros
                      </button>
                    </div>
                  )}

                  {puedeOrdenar && bloques.length > 1 && (
                    <p className="cdl-mods-ayuda">Arrastra las tarjetas para cambiar el orden de los módulos.</p>
                  )}
                  <ol className={`cdl-mods ${filteredBloques.some(b => b.id === abiertoId) ? 'has-open' : ''}`}>
                    {filteredBloques.map(bloque => {
                      const numero = bloques.findIndex(b => b.id === bloque.id) + 1;
                      const abierto = abiertoId === bloque.id;
                      const posicion = bloques.findIndex(b => b.id === bloque.id);
                      const IconoModulo = iconoDeModulo(bloque.icon);
                      // El color elegido tiñe la tarjeta y su panel a través de una variable CSS.
                      const estiloModulo = { '--mod-c': colorDeModulo(bloque.color) } as CSSProperties;
                      return (
                        <Fragment key={bloque.id}>
                          {/* Tarjeta del módulo */}
                          <li
                            className={`cdl-mod ${abierto ? 'is-open' : ''} ${puedeOrdenar ? 'is-ordenable' : ''} ${arrastrandoId === bloque.id ? 'is-arrastrando' : ''} ${destinoId === bloque.id && arrastrandoId !== bloque.id ? 'is-destino' : ''}`}
                            style={estiloModulo}
                            draggable={puedeOrdenar}
                            onDragStart={e => {
                              if (!puedeOrdenar) return;
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', bloque.id);
                              setArrastrandoId(bloque.id);
                            }}
                            onDragOver={e => {
                              if (!arrastrandoId) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (destinoId !== bloque.id) setDestinoId(bloque.id);
                            }}
                            onDrop={e => {
                              e.preventDefault();
                              if (!arrastrandoId) return;
                              // Hacia adelante cae después del destino; hacia atrás, antes.
                              const desde = bloques.findIndex(b => b.id === arrastrandoId);
                              const hasta = bloques.findIndex(b => b.id === bloque.id);
                              moverBloque(arrastrandoId, desde < hasta ? (bloques[hasta + 1]?.id ?? null) : bloque.id);
                              setArrastrandoId(null);
                              setDestinoId(null);
                            }}
                            onDragEnd={() => { setArrastrandoId(null); setDestinoId(null); }}
                          >
                            <button
                              type="button"
                              className="cdl-mod-btn"
                              aria-expanded={abierto}
                              aria-controls={abierto ? 'cdl-mod-panel' : undefined}
                              onClick={() => toggleAbierto(bloque.id)}
                            >
                              <span className="cdl-mod-icono" aria-hidden="true"><IconoModulo size={20} /></span>
                              <span className="cdl-mod-orden">Módulo {numero}</span>
                              <span className="cdl-mod-title">{bloque.title}</span>
                              <span className="cdl-mod-count">
                                {bloque.contenido.length === 0
                                  ? 'Sin contenido'
                                  : `${bloque.contenido.length} ${plural(bloque.contenido.length, 'recurso', 'recursos')}`}
                              </span>
                            </button>
                          </li>

                          {/* Contenido del módulo: ocupa todo el ancho, debajo de la fila de su tarjeta */}
                          {abierto && (
                            <li className="cdl-mod-panel" id="cdl-mod-panel" ref={panelRef} style={estiloModulo}>
                              <div className="cdl-mod-panel-head">
                                {renombrandoBloqueId === bloque.id ? (
                                  <div className="ccv-sc-rename-box">
                                    <input
                                      autoFocus
                                      aria-label="Nombre del módulo"
                                      value={renombrarValor}
                                      onChange={e => setRenombrarValor(e.target.value)}
                                      onBlur={() => handleRenombrarBloque(bloque.id)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleRenombrarBloque(bloque.id);
                                        if (e.key === 'Escape') setRenombrandoBloqueId(null);
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <h3 className="cdl-mod-panel-title">{bloque.title}</h3>
                                )}
                                <button
                                  type="button"
                                  className="cdl-icon-btn cdl-mod-close"
                                  title="Cerrar módulo"
                                  aria-label={`Cerrar ${bloque.title}`}
                                  onClick={() => setAbiertoId(null)}
                                >
                                  <X size={18} />
                                </button>
                              </div>

                              <div className="cdl-mod-panel-meta">
                                {(Object.keys(TYPE_CONFIG) as CourseContentItem['type'][]).map(tipo => {
                                  const cuenta = bloque.contenido.filter(it => it.type === tipo).length;
                                  if (cuenta === 0) return null;
                                  const Icono = TYPE_CONFIG[tipo].icon;
                                  return (
                                    <span key={tipo} className="cdl-acc-chip">
                                      <Icono size={11} /> {cuenta} {TYPE_CONFIG[tipo].label}
                                    </span>
                                  );
                                })}
                                {esDocente && renombrandoBloqueId !== bloque.id && (
                                  <div className="cdl-acc-actions">
                                    <button type="button" className="cdl-acc-action" onClick={() => setAgregarContenidoEnBloque(bloque.id)}>
                                      <Plus size={13} /> Agregar contenido
                                    </button>
                                    <button
                                      type="button"
                                      className="cdl-acc-action"
                                      onClick={() => { setRenombrandoBloqueId(bloque.id); setRenombrarValor(bloque.title); }}
                                    >
                                      <Pencil size={12} /> Renombrar
                                    </button>
                                    <button
                                      type="button"
                                      className={`cdl-acc-action ${personalizando ? 'is-active' : ''}`}
                                      aria-expanded={personalizando}
                                      onClick={() => setPersonalizando(v => !v)}
                                    >
                                      <Palette size={12} /> Icono y color
                                    </button>
                                    {puedeOrdenar && (
                                      <>
                                        <button type="button" className="cdl-acc-action" disabled={posicion <= 0} onClick={() => correrBloque(bloque.id, -1)} title="Mover un lugar antes">
                                          <ArrowLeft size={12} /> Mover antes
                                        </button>
                                        <button type="button" className="cdl-acc-action" disabled={posicion >= bloques.length - 1} onClick={() => correrBloque(bloque.id, 1)} title="Mover un lugar después">
                                          <ArrowRight size={12} /> Mover después
                                        </button>
                                      </>
                                    )}
                                    <button type="button" className="cdl-acc-action danger" onClick={() => handleBorrarBloque(bloque.id)}>
                                      <Trash2 size={12} /> Eliminar
                                    </button>
                                  </div>
                                )}
                              </div>

                              {esDocente && personalizando && (
                                <SelectorEstiloModulo
                                  icon={bloque.icon}
                                  color={bloque.color}
                                  onChange={estilo => handleEstiloBloque(bloque.id, estilo)}
                                />
                              )}

                              {bloque.description && <p className="cdl-acc-desc">{bloque.description}</p>}

                              <div className="cdl-items">
                                {bloque.contenido.map(item => renderItemCard(item, bloque.id))}
                              </div>

                              {bloque.contenido.length === 0 && (
                                <p className="cdl-acc-desc cdl-muted">
                                  {esDocente
                                    ? 'Este módulo todavía no tiene contenido.'
                                    : 'El docente todavía no agregó contenido en este módulo.'}
                                </p>
                              )}
                            </li>
                          )}
                        </Fragment>
                      );
                    })}
                  </ol>

                  {bloques.length === 0 && (
                    <div className="ccv-empty-note" style={{ padding: 28, textAlign: 'center' }}>
                      <BookOpen size={32} color="#94A3B8" style={{ margin: '0 auto 8px' }} />
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
                        {esDocente
                          ? 'Todavía no hay módulos. Crea el primero con "Nuevo módulo".'
                          : 'El docente todavía no ha publicado material para este curso.'}
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ══ Avisos y comunicados (panel lateral) ══ */}
      {avisosAbierto && id && (
        <div className="cdl-drawer-backdrop" onClick={cerrarAvisos}>
          <aside
            className="cdl-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Avisos y comunicados"
            onClick={e => e.stopPropagation()}
          >
            <div className="cdl-drawer-head">
              <h2 className="cdl-h2">Avisos y comunicados</h2>
              <button type="button" className="cdl-icon-btn" onClick={cerrarAvisos} title="Cerrar" aria-label="Cerrar avisos">
                <X size={18} />
              </button>
            </div>
            <div className="cdl-drawer-body">
              <AvisosPanel courseId={id} esDocente={esDocente} />
            </div>
          </aside>
        </div>
      )}

      {/* ══ Modales del Curso ══ */}
      {agregarContenidoEnBloque && id && (
        <AgregarContenidoModal
          courseId={id}
          blockId={agregarContenidoEnBloque}
          onClose={() => setAgregarContenidoEnBloque(null)}
          onCreated={cargar}
        />
      )}

      {itemPreview && id && (
        <ContenidoPreviewModal
          courseId={id}
          item={itemPreview}
          onClose={() => setItemPreview(null)}
        />
      )}

      {quizItem && id && (
        esDocente ? (
          <GestionarQuizModal
            courseId={id}
            blockId={quizItem.blockId}
            item={quizItem.item}
            onClose={() => setQuizItem(null)}
          />
        ) : (
          <TomarQuizModal
            courseId={id}
            blockId={quizItem.blockId}
            item={quizItem.item}
            onClose={() => setQuizItem(null)}
          />
        )
      )}

      {tareaItem && id && (
        esDocente ? (
          <GestionarTareaModal
            courseId={id}
            blockId={tareaItem.blockId}
            item={tareaItem.item}
            onClose={() => setTareaItem(null)}
            onSaved={cargar}
          />
        ) : (
          <EntregarTareaModal
            courseId={id}
            blockId={tareaItem.blockId}
            item={tareaItem.item}
            onClose={() => setTareaItem(null)}
          />
        )
      )}

      {calificacionesAbierto && id && (
        <CalificacionesModal
          courseId={id}
          esDocente={esDocente}
          onClose={() => setCalificacionesAbierto(false)}
        />
      )}

      {miembrosAbierto && id && (
        <MiembrosCursoModal courseId={id} onClose={() => setMiembrosAbierto(false)} />
      )}

      {accesosAbierto && curso && (
        <AccesosDirectosModal
          curso={curso}
          onClose={() => setAccesosAbierto(false)}
          onSaved={actualizado => setCurso(previo => ({ ...previo, ...actualizado }))}
        />
      )}

      {tarjetaAbierta && curso && (
        <EditarTarjetaCursoModal
          curso={curso}
          nombre={borrador?.name ?? curso.name}
          periodo={borrador?.periodo ?? (curso.academic_period || '')}
          onClose={() => setTarjetaAbierta(false)}
          onSaved={actualizado => setCurso(previo => ({ ...previo, ...actualizado }))}
        />
      )}
    </div>
  );
}
