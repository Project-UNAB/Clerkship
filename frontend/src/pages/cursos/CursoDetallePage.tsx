import { Fragment, useCallback, useEffect, useRef, useState, useMemo, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import DOMPurify from 'dompurify';
import {
  ArrowLeft, ArrowRight, Plus, FileText, Video, Link as LinkIcon, Type,
  Pencil, Trash2, Loader2, ClipboardList, HelpCircle,
  BarChart3, Search, X, Clock, BookOpen, ArrowUpRight, ChevronDown, MoreHorizontal,
  Users, MessagesSquare, Check, Image as ImageIcon, Mail, ExternalLink, Palette, Layers, GripVertical,
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
import { listarAvisosPagina } from '../../data/cursoAvisosApi';
import GestionarQuizModal from '../../components/cursos/GestionarQuizModal';
import TomarQuizModal from '../../components/cursos/TomarQuizModal';
import GestionarTareaModal from '../../components/cursos/GestionarTareaModal';
import EntregarTareaModal from '../../components/cursos/EntregarTareaModal';
import CalificacionesModal from '../../components/cursos/CalificacionesModal';
import EditarTarjetaCursoModal from '../../components/cursos/EditarTarjetaCursoModal';
import RichTextEditor from '../../components/cursos/RichTextEditor';
import MiembrosCursoModal from '../../components/cursos/MiembrosCursoModal';
import AccesosDirectosModal from '../../components/cursos/AccesosDirectosModal';
import PortadaCurso from '../../components/cursos/PortadaCurso';
import { colorDeModulo, iconoDeModulo } from '../../components/cursos/estiloModulo';
import SelectorEstiloModulo from '../../components/cursos/SelectorEstiloModulo';
import { formatFileSize } from '../../utils/fileUpload';
import { faltaPara, formatFechaHoraCorta } from '../../utils/fechas';
import '../../styles/cursos.css';
import '../../styles/cursoDetalle.css';

const SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a',
    'blockquote', 'code', 'pre', 'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'value'],
};

type TipoContenido = CourseContentItem['type'];

/** Cómo se muestra cada tipo de recurso: nombre, icono y la acción que abre. */
const TIPOS: Record<TipoContenido, {
  label: string; plural: string; icon: typeof FileText; accion: string; accionDocente?: string;
}> = {
  DOCUMENT: { label: 'Documento', plural: 'Documentos', icon: FileText, accion: 'Abrir' },
  VIDEO: { label: 'Video', plural: 'Videos', icon: Video, accion: 'Ver' },
  LINK: { label: 'Enlace', plural: 'Enlaces', icon: LinkIcon, accion: 'Abrir' },
  TEXT: { label: 'Lectura', plural: 'Lecturas', icon: Type, accion: 'Leer' },
  ASSIGNMENT: { label: 'Tarea', plural: 'Tareas', icon: ClipboardList, accion: 'Entregar', accionDocente: 'Gestionar' },
  QUIZ: { label: 'Cuestionario', plural: 'Cuestionarios', icon: HelpCircle, accion: 'Responder', accionDocente: 'Gestionar' },
};
const ORDEN_TIPOS: TipoContenido[] = ['DOCUMENT', 'ASSIGNMENT', 'QUIZ', 'VIDEO', 'LINK', 'TEXT'];

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

function Avatar({ nombre, avatar, className }: { nombre: string; avatar?: string | null; className: string }) {
  const src = srcDeAvatar(avatar);
  return src
    ? <img className={className} src={src} alt="" />
    : <span className={`${className} cd-avatar-txt`} aria-hidden="true">{iniciales(nombre)}</span>;
}

export default function CursoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const esDocente = getStoredUser()?.role === 'TEACHER';
  const sinMovimiento = useReducedMotion();

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
  // Menú «⋯» con las acciones menos usadas del módulo abierto.
  const [menuModulo, setMenuModulo] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Búsqueda y filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | TipoContenido>('ALL');

  // Modales y formulario
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

  // Avisos: se abren desde el encabezado; el número es el total publicado.
  const [avisosAbierto, setAvisosAbierto] = useState(false);
  const [totalAvisos, setTotalAvisos] = useState<number | null>(null);

  function contarAvisos() {
    if (!id) return;
    listarAvisosPagina(id, 1, 1)
      .then(res => setTotalAvisos(res.total ?? res.avisos.length))
      .catch(() => setTotalAvisos(null));
  }

  function cerrarAvisos() {
    setAvisosAbierto(false);
    contarAvisos();          // pudo publicarse o borrarse alguno mientras estaba abierto
  }

  function handleAbrirItem(item: CourseContentItem, blockId: string) {
    if (item.type === 'QUIZ') setQuizItem({ item, blockId });
    else if (item.type === 'ASSIGNMENT') setTareaItem({ item, blockId });
    else setItemPreview(item);
  }

  function cargar() {
    if (!id) return;
    setLoading(prev => prev && !curso);
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
    setLoading(true);
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

  // El menú «⋯» se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!menuModulo) return;
    const fuera = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuModulo(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuModulo(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [menuModulo]);

  function toggleAbierto(blockId: string) {
    setAbiertoId(previo => (previo === blockId ? null : blockId));
    setPersonalizando(false);
    setMenuModulo(false);
    setRenombrandoBloqueId(null);
  }

  // Al desplegar un módulo, su contenido queda a la vista.
  useEffect(() => {
    if (!abiertoId) return;
    const t = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ block: 'nearest', behavior: sinMovimiento ? 'auto' : 'smooth' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [abiertoId, sinMovimiento]);

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
      setError(err?.message || 'No se pudo crear el módulo.');
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
      setError(err?.message || 'No se pudo renombrar el módulo.');
    }
  }

  async function handleBorrarBloque(blockId: string) {
    if (!id) return;
    if (!window.confirm('¿Borrar este módulo y todo su contenido? Esta acción no se puede deshacer.')) return;
    try {
      await borrarBloque(id, blockId);
      setAbiertoId(null);
      cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar el módulo.');
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

  // Cuántos recursos hay de cada tipo, en todo el curso
  const stats = useMemo(() => {
    const porTipo = Object.fromEntries(ORDEN_TIPOS.map(t => [t, 0])) as Record<TipoContenido, number>;
    bloques.forEach(b => b.contenido.forEach(it => { porTipo[it.type] += 1; }));
    return { totalBlocks: bloques.length, totalItems: Object.values(porTipo).reduce((a, b) => a + b, 0), porTipo };
  }, [bloques]);

  // Filtro y búsqueda en vivo
  const puedeOrdenar = esDocente && !searchQuery.trim() && activeFilter === 'ALL';

  const filteredBloques = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query && activeFilter === 'ALL') return bloques;
    return bloques
      .map(b => ({
        ...b,
        contenido: b.contenido.filter(item => {
          if (activeFilter !== 'ALL' && item.type !== activeFilter) return false;
          if (!query) return true;
          return item.title?.toLowerCase().includes(query)
            || item.description?.toLowerCase().includes(query)
            || item.file?.nombre?.toLowerCase().includes(query);
        }),
      }))
      .filter(b => b.contenido.length > 0);
  }, [bloques, searchQuery, activeFilter]);

  const totalFilteredItems = useMemo(() => filteredBloques.reduce((acc, b) => acc + b.contenido.length, 0), [filteredBloques]);
  const filtrando = !!searchQuery.trim() || activeFilter !== 'ALL';

  // Al buscar o filtrar, el primer módulo con resultados queda abierto.
  useEffect(() => {
    if (!filtrando) return;
    if (!filteredBloques.some(b => b.id === abiertoId)) setAbiertoId(filteredBloques[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrando, filteredBloques]);

  const transicion = sinMovimiento ? { duration: 0 } : { type: 'spring' as const, stiffness: 380, damping: 34 };
  const aparecer = (i = 0) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: sinMovimiento ? 0 : 0.32, delay: sinMovimiento ? 0 : i * 0.05, ease: [0.22, 1, 0.36, 1] as const },
  });

  function renderItem(item: CourseContentItem, blockId: string, i: number) {
    const tipo = TIPOS[item.type];
    const Icon = tipo.icon;
    const cerrado = item.due_at ? faltaPara(item.due_at) === 'ya cerró' : false;
    const mia = item.mi_entrega;
    const accion = esDocente && tipo.accionDocente ? tipo.accionDocente
      : item.type === 'ASSIGNMENT' && mia ? 'Ver entrega' : tipo.accion;
    const formato = item.type === 'DOCUMENT' ? (item.file?.nombre?.split('.').pop() || '').toUpperCase().slice(0, 4) : '';
    // Estado de la tarea en la tarjeta: lo del estudiante o el avance de calificación del docente.
    let estadoTarea: { txt: string; clase: string } | null = null;
    if (item.type === 'ASSIGNMENT') {
      if (esDocente && item.entregas) {
        const { total, calificadas } = item.entregas;
        estadoTarea = total === 0 ? { txt: 'Sin entregas', clase: 'is-gris' }
          : calificadas < total ? { txt: `${total - calificadas} por calificar · ${total} ${plural(total, 'entrega', 'entregas')}`, clase: 'is-azul' }
            : { txt: `${total} ${plural(total, 'entrega calificada', 'entregas calificadas')}`, clase: 'is-verde' };
      } else if (!esDocente) {
        estadoTarea = mia
          ? mia.calificada
            ? { txt: `Calificada · ${mia.score}${item.max_score != null ? ` / ${item.max_score}` : ''}`, clase: 'is-verde' }
            : { txt: mia.is_late ? 'Entregada tarde' : 'Entregada', clase: mia.is_late ? 'is-ambar' : 'is-azul' }
          : item.reglas?.status === 'LATE' ? { txt: 'Atrasada · aún puedes entregar', clase: 'is-ambar' }
            : item.reglas?.status === 'CLOSED' || (!item.reglas && cerrado) ? { txt: 'No entregada', clase: 'is-rojo' }
              : item.reglas?.status === 'NOT_OPEN' ? { txt: 'Aún no abre', clase: 'is-gris' }
                : { txt: 'Pendiente', clase: 'is-ambar' };
      }
    }
    return (
      <motion.div
        key={item.id}
        className={`cd-item is-${item.type.toLowerCase()}`}
        role="button"
        tabIndex={0}
        onClick={() => handleAbrirItem(item, blockId)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAbrirItem(item, blockId); } }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: sinMovimiento ? 0 : 0.25, delay: sinMovimiento ? 0 : 0.06 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="cd-item-icono" aria-hidden="true"><Icon size={18} /></span>
        <span className="cd-item-cuerpo">
          <span className="cd-item-meta">
            <span className="cd-item-tipo">{tipo.label}</span>
            {formato && <span className="cd-item-dato is-formato">{formato}</span>}
            {item.file?.size_bytes ? <span className="cd-item-dato">{formatFileSize(item.file.size_bytes)}</span> : null}
            {item.type === 'ASSIGNMENT' && item.max_score ? <span className="cd-item-dato">{item.max_score} pts</span> : null}
            {item.type === 'QUIZ' && item.time_limit_minutes ? <span className="cd-item-dato">{item.time_limit_minutes} min</span> : null}
          </span>
          <span className="cd-item-titulo">{item.title}</span>
          {item.description && <span className="cd-item-desc">{item.description}</span>}
          {(item.due_at || estadoTarea) && (
            <span className="cd-item-pie">
              {estadoTarea && <span className={`cd-item-estado ${estadoTarea.clase}`}>{estadoTarea.txt}</span>}
              {item.due_at && !(mia && !esDocente) && (
                <span className={`cd-item-vence${cerrado ? ' is-cerrada' : ''}`}>
                  <Clock size={12} />
                  {cerrado ? 'Cerró' : 'Vence'} {formatFechaHoraCorta(item.due_at)}{!cerrado && ` · ${faltaPara(item.due_at)}`}
                </span>
              )}
            </span>
          )}
        </span>
        <span className="cd-item-accion">{accion} <ArrowUpRight size={14} /></span>
        {esDocente && (
          <button
            type="button"
            className="cd-item-borrar"
            title="Borrar recurso"
            aria-label={`Borrar ${item.title}`}
            onClick={e => { e.stopPropagation(); handleBorrarContenido(blockId, item.id); }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </motion.div>
    );
  }

  const pendientes = curso?.pending_assignments ?? 0;

  return (
    <div className="dash-root">
      <Sidebar />
      <FeedbackFab pestana="inicio" />

      <main className="ccv-page-container cd-pagina">
        <div className={`cd-contenido ${editando ? 'is-editando' : ''}`}>
          {/* Cargando: esqueleto de la página */}
          {loading && (
            <div className="cd-esqueleto" aria-busy="true" aria-label="Cargando el curso">
              <div className="cd-esq-portada" />
              <div className="cd-esq-fila"><i /><i /><i /></div>
              <div className="cd-esq-tarjetas"><i /><i /><i /></div>
            </div>
          )}

          {!loading && error && !curso && (
            <div className="cd-vacio">
              <p>{error}</p>
              <button type="button" className="cd-btn is-principal" onClick={cargar}>Reintentar</button>
            </div>
          )}

          {!loading && curso && (
            <>
              {/* ══ Portada y encabezado ══ */}
              <motion.header className="cd-hero" {...aparecer(0)}>
                <div className="cd-hero-portada">
                  <PortadaCurso id={curso.id} name={curso.name} url={curso.cover_full_url || curso.cover_url} className="cd-hero-img" />
                  <div className="cd-hero-velo" />
                  <div className="cd-hero-barra">
                    <button type="button" className="cd-hero-btn" onClick={() => navigate('/mis-cursos')}>
                      <ArrowLeft size={15} /> Mis cursos
                    </button>
                    <div className="cd-hero-acciones">
                      <button type="button" className="cd-hero-btn is-icono" title="Avisos y comunicados"
                        aria-label={`Avisos y comunicados${totalAvisos ? `: ${totalAvisos}` : ''}`} onClick={() => setAvisosAbierto(true)}>
                        <MessagesSquare size={17} />
                        <span className="cd-hero-btn-txt">Avisos</span>
                        {totalAvisos !== null && totalAvisos > 0 && <span className="cd-globo">{totalAvisos > 99 ? '99+' : totalAvisos}</span>}
                      </button>
                      <button type="button" className="cd-hero-btn is-icono" onClick={() => setCalificacionesAbierto(true)}
                        aria-label={esDocente ? 'Calificaciones' : 'Mis calificaciones'} title={esDocente ? 'Calificaciones' : 'Mis calificaciones'}>
                        <BarChart3 size={17} />
                        <span className="cd-hero-btn-txt">{esDocente ? 'Calificaciones' : 'Mis notas'}</span>
                      </button>
                      {esDocente && !editando && (
                        <button type="button" className="cd-hero-btn is-claro" onClick={empezarEdicion}>
                          <Pencil size={14} /> Editar curso
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="cd-hero-cuerpo">
                  {borrador ? (
                    <div className="cd-titulo-fila">
                      <input className="cd-titulo cd-titulo-input" aria-label="Nombre del curso" placeholder="Nombre del curso"
                        maxLength={150} value={borrador.name} onChange={e => setBorrador({ ...borrador, name: e.target.value })} />
                      <input className="cd-periodo cd-periodo-input" aria-label="Período académico" placeholder="Período" maxLength={20}
                        size={Math.max(7, borrador.periodo.length + 1)} value={borrador.periodo}
                        onChange={e => setBorrador({ ...borrador, periodo: e.target.value })} />
                    </div>
                  ) : (
                    <div className="cd-titulo-fila">
                      <h1 className="cd-titulo">{curso.name}</h1>
                      {curso.academic_period && <span className="cd-periodo">{curso.academic_period}</span>}
                    </div>
                  )}
                  {editando && <span className="cd-editando"><Pencil size={13} /> Editando el curso: escribe directamente en la página y guarda abajo.</span>}

                  <div className="cd-hero-datos">
                    {curso.teacher_name && (
                      <span className="cd-hero-docente">
                        <Avatar nombre={curso.teacher_name} avatar={curso.teacher_avatar} className="cd-avatar is-mini" />
                        {curso.teacher_name}
                      </span>
                    )}
                    <span className="cd-dato"><Layers size={14} /> {stats.totalBlocks} {plural(stats.totalBlocks, 'módulo', 'módulos')}</span>
                    <span className="cd-dato"><BookOpen size={14} /> {stats.totalItems} {plural(stats.totalItems, 'recurso', 'recursos')}</span>
                    {curso.student_count !== undefined && (
                      <span className="cd-dato"><Users size={14} /> {curso.student_count} {plural(curso.student_count, 'estudiante', 'estudiantes')}</span>
                    )}
                    {pendientes > 0 && (
                      <span className="cd-dato is-alerta"><Clock size={14} /> {pendientes} {plural(pendientes, 'tarea pendiente', 'tareas pendientes')}</span>
                    )}
                    {curso.next_due_title && curso.next_due_at && (
                      <span className="cd-dato is-alerta" title={curso.next_due_title}><Clock size={14} /> Próxima entrega {faltaPara(curso.next_due_at)}</span>
                    )}
                  </div>
                </div>
              </motion.header>

              <AnimatePresence>
                {error && (
                  <motion.p className="cd-error" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    {error}
                    <button type="button" onClick={() => setError(null)} aria-label="Cerrar"><X size={14} /></button>
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="cd-layout">
                <div className="cd-principal">
                  {/* ── Sobre el curso ── */}
                  <motion.section className="cd-tarjeta cd-sobre" aria-label="Información del curso" {...aparecer(1)}>
                    <h2 className="cd-h2">Sobre el curso</h2>
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
                      <div className="cd-sobre-texto">
                        <div className="ccv-rte-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(curso.description, SANITIZE_OPTS) }} />
                      </div>
                    ) : (
                      <p className="cd-muted">
                        {esDocente
                          ? 'Este curso todavía no tiene descripción. Puedes escribirla con «Editar curso».'
                          : 'El docente todavía no ha escrito la descripción de este curso.'}
                      </p>
                    )}
                  </motion.section>

                  {/* ── Módulos ── */}
                  <motion.section className="cd-modulos" aria-label="Módulos del curso" {...aparecer(2)}>
                    <div className="cd-modulos-cab">
                      <div>
                        <h2 className="cd-h2">Módulos</h2>
                        <p className="cd-sub">
                          {stats.totalBlocks === 0
                            ? 'Aún no hay módulos'
                            : `${stats.totalBlocks} ${plural(stats.totalBlocks, 'módulo', 'módulos')} · ${stats.totalItems} ${plural(stats.totalItems, 'recurso', 'recursos')}`}
                        </p>
                      </div>
                      {esDocente && !nuevoBloqueAbierto && (
                        <button type="button" className="cd-btn is-principal" onClick={() => setNuevoBloqueAbierto(true)}>
                          <Plus size={15} /> Nuevo módulo
                        </button>
                      )}
                    </div>

                    <AnimatePresence initial={false}>
                      {nuevoBloqueAbierto && esDocente && (
                        <motion.div className="cd-nuevo" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: sinMovimiento ? 0 : 0.22 }}>
                          <div className="cd-nuevo-dentro">
                            <SelectorEstiloModulo icon={nuevoBloqueEstilo.icon} color={nuevoBloqueEstilo.color}
                              onChange={e => setNuevoBloqueEstilo(previo => ({ ...previo, ...e }))} disabled={guardandoBloque} />
                            <div className="cd-nuevo-fila">
                              <input autoFocus className="cd-input" placeholder="Título del nuevo módulo…" value={nuevoBloqueTitulo}
                                onChange={e => setNuevoBloqueTitulo(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleCrearBloque();
                                  if (e.key === 'Escape') setNuevoBloqueAbierto(false);
                                }} />
                              <button type="button" className="cd-btn" onClick={() => { setNuevoBloqueAbierto(false); setNuevoBloqueEstilo({}); }}>Cancelar</button>
                              <button type="button" className="cd-btn is-principal" onClick={handleCrearBloque} disabled={guardandoBloque || !nuevoBloqueTitulo.trim()}>
                                {guardandoBloque ? <Loader2 size={14} className="dfm-spin" /> : <Check size={14} />} Crear
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {stats.totalItems > 0 && (
                      <div className="cd-herramientas">
                        <label className="cd-buscar">
                          <Search size={15} />
                          <input type="search" placeholder="Buscar en el contenido del curso…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                          {searchQuery && (
                            <button type="button" onClick={() => setSearchQuery('')} aria-label="Limpiar búsqueda"><X size={14} /></button>
                          )}
                        </label>
                        <div className="cd-filtros" role="tablist" aria-label="Filtrar por tipo">
                          {(['ALL', ...ORDEN_TIPOS] as const).filter(t => t === 'ALL' || stats.porTipo[t] > 0).map(t => {
                            const Icono = t === 'ALL' ? null : TIPOS[t].icon;
                            const cuenta = t === 'ALL' ? stats.totalItems : stats.porTipo[t];
                            return (
                              <button key={t} type="button" role="tab" aria-selected={activeFilter === t}
                                className={`cd-filtro${activeFilter === t ? ' is-activo' : ''}`} onClick={() => setActiveFilter(t)}>
                                {activeFilter === t && <motion.span layoutId="cd-filtro-pastilla" className="cd-filtro-pastilla" transition={transicion} />}
                                {Icono && <Icono size={13} />}
                                <span>{t === 'ALL' ? 'Todo' : TIPOS[t].plural}</span>
                                <span className="cd-filtro-n">{cuenta}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {filtrando && totalFilteredItems === 0 && (
                      <div className="cd-vacio is-suave">
                        <Search size={24} />
                        <strong>Ningún contenido coincide con la búsqueda.</strong>
                        <button type="button" className="cd-btn" onClick={() => { setSearchQuery(''); setActiveFilter('ALL'); }}>Quitar filtros</button>
                      </div>
                    )}

                    {puedeOrdenar && bloques.length > 1 && (
                      <p className="cd-ayuda"><GripVertical size={14} /> Arrastra las tarjetas para cambiar el orden de los módulos.</p>
                    )}

                    <ol className={`cd-mods${filteredBloques.some(b => b.id === abiertoId) ? ' has-abierto' : ''}`}>
                      {filteredBloques.map((bloque, idx) => {
                        const numero = bloques.findIndex(b => b.id === bloque.id) + 1;
                        const abierto = abiertoId === bloque.id;
                        const posicion = numero - 1;
                        const IconoModulo = iconoDeModulo(bloque.icon);
                        // El color elegido tiñe la tarjeta y su panel a través de una variable CSS.
                        const estiloModulo = { '--mod-c': colorDeModulo(bloque.color) } as CSSProperties;
                        const tiposDelModulo = ORDEN_TIPOS.map(t => ({ t, n: bloque.contenido.filter(it => it.type === t).length })).filter(x => x.n);
                        return (
                          <Fragment key={bloque.id}>
                            <li
                              className={`cd-mod${abierto ? ' is-abierto' : ''}${puedeOrdenar ? ' is-ordenable' : ''}${arrastrandoId === bloque.id ? ' is-arrastrando' : ''}${destinoId === bloque.id && arrastrandoId !== bloque.id ? ' is-destino' : ''}`}
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
                              <motion.button
                                layoutId={`mod-${bloque.id}`}
                                layout="position"
                                type="button"
                                className="cd-mod-btn"
                                aria-expanded={abierto}
                                aria-controls={abierto ? 'cd-mod-panel' : undefined}
                                onClick={() => toggleAbierto(bloque.id)}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: sinMovimiento ? 0 : 0.3, delay: sinMovimiento ? 0 : 0.12 + idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
                              >
                                <span className="cd-mod-arriba">
                                  <span className="cd-mod-icono" aria-hidden="true"><IconoModulo size={20} /></span>
                                  <span className="cd-mod-num">Módulo {numero}</span>
                                  {puedeOrdenar && <GripVertical size={16} className="cd-mod-asa" aria-hidden="true" />}
                                </span>
                                <span className="cd-mod-titulo">{bloque.title}</span>
                                <span className="cd-mod-abajo">
                                  <span className="cd-mod-tipos">
                                    {tiposDelModulo.length === 0
                                      ? <span className="cd-mod-vacio">Sin contenido</span>
                                      : tiposDelModulo.map(({ t, n }) => {
                                        const Icono = TIPOS[t].icon;
                                        return <span key={t} className={`cd-mod-tipo is-${t.toLowerCase()}`} title={`${n} ${plural(n, TIPOS[t].label.toLowerCase(), TIPOS[t].plural.toLowerCase())}`}><Icono size={12} />{n}</span>;
                                      })}
                                  </span>
                                  <motion.span className="cd-mod-chevron" animate={{ rotate: abierto ? 180 : 0 }} transition={{ duration: sinMovimiento ? 0 : 0.22 }}>
                                    <ChevronDown size={16} />
                                  </motion.span>
                                </span>
                              </motion.button>
                            </li>

                            {/* Contenido del módulo: ocupa todo el ancho, debajo de la fila de su tarjeta */}
                            <AnimatePresence initial={false}>
                              {abierto && (
                                <motion.li
                                  key={`panel-${bloque.id}`}
                                  className="cd-panel"
                                  id="cd-mod-panel"
                                  ref={panelRef}
                                  style={estiloModulo}
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: sinMovimiento ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                                >
                                  <div className="cd-panel-dentro">
                                    <div className="cd-panel-cab">
                                      <span className="cd-mod-icono is-grande" aria-hidden="true"><IconoModulo size={22} /></span>
                                      <div className="cd-panel-titulos">
                                        <span className="cd-mod-num">Módulo {numero}</span>
                                        {renombrandoBloqueId === bloque.id ? (
                                          <input
                                            autoFocus
                                            className="cd-input cd-renombrar"
                                            aria-label="Nombre del módulo"
                                            value={renombrarValor}
                                            onChange={e => setRenombrarValor(e.target.value)}
                                            onBlur={() => handleRenombrarBloque(bloque.id)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') handleRenombrarBloque(bloque.id);
                                              if (e.key === 'Escape') setRenombrandoBloqueId(null);
                                            }}
                                          />
                                        ) : (
                                          <h3 className="cd-panel-titulo">{bloque.title}</h3>
                                        )}
                                      </div>
                                      <button type="button" className="cd-icono" title="Cerrar módulo" aria-label={`Cerrar ${bloque.title}`} onClick={() => setAbiertoId(null)}>
                                        <X size={18} />
                                      </button>
                                    </div>

                                    {(esDocente || bloque.description) && (
                                      <div className="cd-panel-barra">
                                        {bloque.description && <p className="cd-panel-desc">{bloque.description}</p>}
                                        {esDocente && renombrandoBloqueId !== bloque.id && (
                                          <div className="cd-panel-acciones">
                                            <button type="button" className="cd-btn is-principal is-chico" onClick={() => setAgregarContenidoEnBloque(bloque.id)}>
                                              <Plus size={14} /> Agregar contenido
                                            </button>
                                            <button type="button" className={`cd-btn is-chico${personalizando ? ' is-activo' : ''}`} aria-expanded={personalizando}
                                              onClick={() => setPersonalizando(v => !v)}>
                                              <Palette size={14} /> Icono y color
                                            </button>
                                            <div className="cd-menu-ancla" ref={menuRef}>
                                              <button type="button" className={`cd-icono is-borde${menuModulo ? ' is-activo' : ''}`} aria-label="Más acciones del módulo"
                                                aria-expanded={menuModulo} onClick={() => setMenuModulo(v => !v)}>
                                                <MoreHorizontal size={17} />
                                              </button>
                                              <AnimatePresence>
                                                {menuModulo && (
                                                  <motion.div className="cd-menu" role="menu"
                                                    initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                                    transition={{ duration: sinMovimiento ? 0 : 0.14 }}>
                                                    <button type="button" role="menuitem" onClick={() => { setMenuModulo(false); setRenombrandoBloqueId(bloque.id); setRenombrarValor(bloque.title); }}>
                                                      <Pencil size={14} /> Renombrar
                                                    </button>
                                                    {puedeOrdenar && (
                                                      <>
                                                        <button type="button" role="menuitem" disabled={posicion <= 0} onClick={() => { setMenuModulo(false); correrBloque(bloque.id, -1); }}>
                                                          <ArrowLeft size={14} /> Mover antes
                                                        </button>
                                                        <button type="button" role="menuitem" disabled={posicion >= bloques.length - 1} onClick={() => { setMenuModulo(false); correrBloque(bloque.id, 1); }}>
                                                          <ArrowRight size={14} /> Mover después
                                                        </button>
                                                      </>
                                                    )}
                                                    <span className="cd-menu-linea" />
                                                    <button type="button" role="menuitem" className="is-peligro" onClick={() => { setMenuModulo(false); handleBorrarBloque(bloque.id); }}>
                                                      <Trash2 size={14} /> Eliminar módulo
                                                    </button>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <AnimatePresence initial={false}>
                                      {esDocente && personalizando && (
                                        <motion.div className="cd-personalizar" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                          transition={{ duration: sinMovimiento ? 0 : 0.2 }}>
                                          <SelectorEstiloModulo icon={bloque.icon} color={bloque.color} onChange={estilo => handleEstiloBloque(bloque.id, estilo)} />
                                        </motion.div>
                                      )}
                                    </AnimatePresence>

                                    {bloque.contenido.length > 0 ? (
                                      <div className="cd-items">
                                        {bloque.contenido.map((item, i) => renderItem(item, bloque.id, i))}
                                      </div>
                                    ) : (
                                      <div className="cd-vacio is-suave">
                                        <BookOpen size={24} />
                                        <strong>{esDocente ? 'Este módulo todavía no tiene contenido.' : 'El docente todavía no agregó contenido en este módulo.'}</strong>
                                        {esDocente && (
                                          <button type="button" className="cd-btn is-principal" onClick={() => setAgregarContenidoEnBloque(bloque.id)}>
                                            <Plus size={14} /> Agregar el primero
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </motion.li>
                              )}
                            </AnimatePresence>
                          </Fragment>
                        );
                      })}
                    </ol>

                    {bloques.length === 0 && (
                      <div className="cd-vacio">
                        <span className="cd-vacio-icono"><Layers size={26} /></span>
                        <strong>{esDocente ? 'Todavía no hay módulos' : 'Aún no hay material'}</strong>
                        <p>{esDocente
                          ? 'Organiza el curso en módulos (por tema o por semana) y agrega en cada uno documentos, videos, tareas y cuestionarios.'
                          : 'El docente todavía no ha publicado material para este curso.'}</p>
                        {esDocente && !nuevoBloqueAbierto && (
                          <button type="button" className="cd-btn is-principal" onClick={() => setNuevoBloqueAbierto(true)}><Plus size={15} /> Crear el primer módulo</button>
                        )}
                      </div>
                    )}
                  </motion.section>
                </div>

                {/* ── Columna lateral ── */}
                <aside className="cd-lateral" aria-label="Docente y accesos del curso">
                  <motion.section className="cd-tarjeta" {...aparecer(2)}>
                    <h2 className="cd-h3">Docente</h2>
                    {curso.teacher_name ? (
                      <div className="cd-docente">
                        <Avatar nombre={curso.teacher_name} avatar={curso.teacher_avatar} className="cd-avatar" />
                        <div className="cd-docente-datos">
                          <strong>{curso.teacher_name}</strong>
                          <span>Docente del curso</span>
                        </div>
                      </div>
                    ) : (
                      <p className="cd-muted">No se pudo cargar la información del docente.</p>
                    )}
                    {curso.teacher_email && (
                      <a className="cd-enlace-fila" href={`mailto:${curso.teacher_email}`} title="Escribir al docente">
                        <Mail size={15} /> <span>{curso.teacher_email}</span>
                      </a>
                    )}
                  </motion.section>

                  <motion.section className="cd-tarjeta" {...aparecer(3)}>
                    <h2 className="cd-h3">Accesos directos</h2>
                    <div className="cd-accesos">
                      <button type="button" className="cd-acceso" onClick={() => setMiembrosAbierto(true)}>
                        <span className="cd-acceso-icono"><Users size={15} /></span>
                        <span className="cd-acceso-txt">Miembros del curso</span>
                        {curso.student_count !== undefined && <span className="cd-acceso-n">{curso.student_count}</span>}
                      </button>
                      {(curso.shortcuts ?? []).filter(a => /^https?:\/\//i.test(a.url)).map((a, i) => (
                        <a key={`${a.url}-${i}`} className="cd-acceso" href={a.url} target="_blank" rel="noopener noreferrer" title={a.url}>
                          <span className="cd-acceso-icono"><ExternalLink size={15} /></span>
                          <span className="cd-acceso-txt">{a.label}</span>
                          <ArrowUpRight size={14} className="cd-acceso-flecha" />
                        </a>
                      ))}
                      {esDocente && (
                        <button type="button" className="cd-acceso is-editar" onClick={() => setAccesosAbierto(true)}>
                          <span className="cd-acceso-icono">{(curso.shortcuts ?? []).length > 0 ? <Pencil size={14} /> : <Plus size={15} />}</span>
                          <span className="cd-acceso-txt">{(curso.shortcuts ?? []).length > 0 ? 'Editar accesos' : 'Agregar acceso directo'}</span>
                        </button>
                      )}
                    </div>
                  </motion.section>

                  {stats.totalItems > 0 && (
                    <motion.section className="cd-tarjeta" {...aparecer(4)}>
                      <h2 className="cd-h3">Contenido del curso</h2>
                      <ul className="cd-resumen">
                        {ORDEN_TIPOS.filter(t => stats.porTipo[t] > 0).map(t => {
                          const Icono = TIPOS[t].icon;
                          const n = stats.porTipo[t];
                          return (
                            <li key={t}>
                              <button type="button" className={`cd-resumen-fila is-${t.toLowerCase()}${activeFilter === t ? ' is-activo' : ''}`}
                                onClick={() => setActiveFilter(f => (f === t ? 'ALL' : t))} title={`Ver solo ${TIPOS[t].plural.toLowerCase()}`}>
                                <span className="cd-resumen-icono"><Icono size={14} /></span>
                                <span>{plural(n, TIPOS[t].label, TIPOS[t].plural)}</span>
                                <strong>{n}</strong>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </motion.section>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ══ Avisos y comunicados (panel lateral) ══ */}
      <AnimatePresence>
        {avisosAbierto && id && (
          <motion.div className="cd-cajon-velo" onClick={cerrarAvisos}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: sinMovimiento ? 0 : 0.2 }}>
            <motion.aside
              className="cd-cajon"
              role="dialog"
              aria-modal="true"
              aria-label="Avisos y comunicados"
              onClick={e => e.stopPropagation()}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={sinMovimiento ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 36 }}
            >
              <div className="cd-cajon-cab">
                <h2 className="cd-h2">Avisos y comunicados</h2>
                <button type="button" className="cd-icono" onClick={cerrarAvisos} title="Cerrar" aria-label="Cerrar avisos"><X size={18} /></button>
              </div>
              <div className="cd-cajon-cuerpo">
                <AvisosPanel courseId={id} esDocente={esDocente} />
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Modales del curso ══ */}
      {agregarContenidoEnBloque && id && (
        <AgregarContenidoModal courseId={id} blockId={agregarContenidoEnBloque} onClose={() => setAgregarContenidoEnBloque(null)} onCreated={cargar} />
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

      {tareaItem && id && (
        esDocente ? (
          <GestionarTareaModal courseId={id} blockId={tareaItem.blockId} item={tareaItem.item} onClose={() => setTareaItem(null)} onSaved={cargar} />
        ) : (
          <EntregarTareaModal courseId={id} blockId={tareaItem.blockId} item={tareaItem.item} onClose={() => setTareaItem(null)} />
        )
      )}

      {calificacionesAbierto && id && (
        <CalificacionesModal courseId={id} esDocente={esDocente} onClose={() => setCalificacionesAbierto(false)} />
      )}

      {miembrosAbierto && id && (
        <MiembrosCursoModal courseId={id} onClose={() => setMiembrosAbierto(false)} />
      )}

      {accesosAbierto && curso && (
        <AccesosDirectosModal curso={curso} onClose={() => setAccesosAbierto(false)}
          onSaved={actualizado => setCurso(previo => ({ ...previo, ...actualizado }))} />
      )}

      {tarjetaAbierta && curso && (
        <EditarTarjetaCursoModal curso={curso} nombre={borrador?.name ?? curso.name} periodo={borrador?.periodo ?? (curso.academic_period || '')}
          onClose={() => setTarjetaAbierta(false)} onSaved={actualizado => setCurso(previo => ({ ...previo, ...actualizado }))} />
      )}
    </div>
  );
}
