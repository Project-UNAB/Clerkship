import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Users, Trash2, X, GraduationCap, UserPlus, BookOpen,
  ChevronRight, ChevronLeft, ChevronDown, FileText,
  Search, MoreHorizontal, Calculator, PenTool, Star, LogOut, ClipboardList, Clock
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import FeedbackFab from '../../components/shared/FeedbackFab';
import { listMyCourses, type Course } from '../../data/consultasApi';
import {
  crearCurso, borrarCurso, listarEstudiantesDeCurso,
  agregarEstudianteACurso, quitarEstudianteDeCurso, salirDeCurso, misFechas,
  type EstudianteDeCurso, type FechaItem, type PortadaNueva,
} from '../../data/cursosApi';
import PortadaCurso from '../../components/cursos/PortadaCurso';
import PortadaPicker from '../../components/cursos/PortadaPicker';
import PapeleraCursosModal from '../../components/cursos/PapeleraCursosModal';
import { comoFechaDeColombia, faltaPara, formatFechaHoraCorta } from '../../utils/fechas';
import { mainAuthErrorMessage, getStoredUser } from '../../data/mainAuth';
import RichTextEditor from '../../components/cursos/RichTextEditor';
import MatriculaPanel from '../../components/cursos/MatriculaPanel';
import UnirseACursoModal from '../../components/cursos/UnirseACursoModal';
import '../../styles/cursos.css';

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function CursosPage() {
  const navigate = useNavigate();
  const esDocente = getStoredUser()?.role === 'TEACHER';
  const [cursos, setCursos] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saliendoId, setSaliendoId] = useState<string | null>(null);
  const [unirseAbierto, setUnirseAbierto] = useState(false);

  const [fechasReales, setFechasReales] = useState<FechaItem[]>([]);

  // Pestaña activa para docentes
  const [docenteTab, setDocenteTab] = useState<'dashboard' | 'roster'>('dashboard');

  // Estados del nuevo diseño "My Classes"
  // "Hoy" y los días del calendario son los de Colombia, no los del navegador.
  const today = useMemo(() => comoFechaDeColombia(), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [taskTab, setTaskTab] = useState<'foro' | 'todo' | 'miembros'>('foro');
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});
  const [calMonthDate, setCalMonthDate] = useState(() => comoFechaDeColombia()); // Fecha actual real
  const [selectedDate, setSelectedDate] = useState(() => comoFechaDeColombia()); // Día seleccionado real (hoy por defecto)

  // Cursos destacados y menú de opciones de 3 puntos
  const [destacados, setDestacados] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('clerkship_cursos_destacados') || '{}');
    } catch {
      return {};
    }
  });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    function handleClickOutside() {
      setOpenMenuId(null);
    }
    if (openMenuId) {
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId]);

  function toggleDestacar(courseId: string) {
    setDestacados(prev => {
      const next = { ...prev, [courseId]: !prev[courseId] };
      localStorage.setItem('clerkship_cursos_destacados', JSON.stringify(next));
      return next;
    });
  }

  // Estado para el carrusel horizontal y despliegue hacia abajo
  const [expandedGrid, setExpandedGrid] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  function handleCarouselScroll() {
    if (!carouselRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }

  function scrollCarousel(direction: 'left' | 'right') {
    if (!carouselRef.current) return;
    const cardStep = carouselRef.current.clientWidth * 0.85;
    carouselRef.current.scrollBy({
      left: direction === 'left' ? -cardStep : cardStep,
      behavior: 'smooth',
    });
  }

  function handleToggleExpand() {
    if (expandedGrid) {
      setIsCollapsing(true);
      setTimeout(() => {
        setExpandedGrid(false);
        setIsCollapsing(false);
        if (carouselRef.current) {
          carouselRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        }
      }, 480);
    } else {
      setExpandedGrid(true);
    }
  }

  // Roster y curso seleccionado para docentes
  const [seleccionado, setSeleccionado] = useState<Course | null>(null);
  const [estudiantes, setEstudiantes] = useState<EstudianteDeCurso[]>([]);
  const [cargandoRoster, setCargandoRoster] = useState(false);

  // Modal de crear curso
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('<p></p>');
  const [periodo, setPeriodo] = useState('');
  const [portadaNueva, setPortadaNueva] = useState<PortadaNueva | null>(null);
  const [papeleraAbierta, setPapeleraAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // Agregar estudiante por correo
  const [correoNuevo, setCorreoNuevo] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [errorRoster, setErrorRoster] = useState<string | null>(null);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);

  function cargarCursos() {
    setLoading(true);
    setError(null);
    listMyCourses()
      .then(setCursos)
      .catch(err => setError(mainAuthErrorMessage(err)))
      .finally(() => setLoading(false));
  }
  useEffect(cargarCursos, []);

  useEffect(() => {
    misFechas()
      .then(res => setFechasReales(res.fechas))
      .catch(() => {});
  }, []);

  async function handleSalir(curso: Course) {
    if (!window.confirm(`¿Salir del curso "${curso.name}"? Tus sesiones ya hechas no se borran.`)) return;
    setSaliendoId(curso.id);
    try {
      await salirDeCurso(curso.id);
      setCursos(prev => prev.filter(c => c.id !== curso.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo salir del curso.');
    } finally {
      setSaliendoId(null);
    }
  }

  function verRoster(curso: Course) {
    setSeleccionado(curso);
    setErrorRoster(null);
    setCargandoRoster(true);
    listarEstudiantesDeCurso(curso.id)
      .then(r => setEstudiantes(r.estudiantes))
      .catch(err => setError(mainAuthErrorMessage(err)))
      .finally(() => setCargandoRoster(false));
  }

  async function handleAgregarEstudiante(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionado) return;
    const correo = correoNuevo.trim().toLowerCase();
    if (!correo) {
      setErrorRoster('Escribe el correo del estudiante.');
      return;
    }
    setAgregando(true);
    setErrorRoster(null);
    try {
      const nuevo = await agregarEstudianteACurso(seleccionado.id, correo);
      setEstudiantes(prev => [nuevo, ...prev]);
      setCorreoNuevo('');
    } catch (err) {
      setErrorRoster(err instanceof Error ? err.message : 'No se pudo agregar al estudiante.');
    } finally {
      setAgregando(false);
    }
  }

  async function handleQuitarEstudiante(estudiante: EstudianteDeCurso) {
    if (!seleccionado) return;
    if (!window.confirm(`¿Quitar a ${estudiante.nombre} de este curso? Sus sesiones ya hechas no se borran.`)) return;
    setQuitandoId(estudiante.user_id);
    try {
      await quitarEstudianteDeCurso(seleccionado.id, estudiante.user_id);
      setEstudiantes(prev => prev.filter(e => e.user_id !== estudiante.user_id));
    } catch (err) {
      setErrorRoster(err instanceof Error ? err.message : 'No se pudo quitar al estudiante.');
    } finally {
      setQuitandoId(null);
    }
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorModal('Ponle un nombre al curso.');
      return;
    }
    setGuardando(true);
    setErrorModal(null);
    try {
      const descripcionVacia = !descripcion.replace(/<[^>]*>/g, '').trim();
      const curso = await crearCurso({
        name: nombre.trim(),
        description: descripcionVacia ? undefined : descripcion,
        academic_period: periodo.trim() || undefined,
      }, portadaNueva);
      setCursos(prev => [curso, ...prev]);
      setModalAbierto(false);
      setNombre(''); setDescripcion('<p></p>'); setPeriodo(''); setPortadaNueva(null);
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : 'No se pudo crear el curso.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleBorrar(curso: Course) {
    if (!window.confirm(`¿Mover "${curso.name}" a la papelera? Los estudiantes dejan de verlo; lo puedes restaurar cuando quieras.`)) return;
    try {
      await borrarCurso(curso.id);
      setCursos(prev => prev.filter(c => c.id !== curso.id));
      if (seleccionado?.id === curso.id) setSeleccionado(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar el curso.');
    }
  }

  /* ── Tarjetas de cursos (Datos 100% reales de la base de datos) ── */
  const cardsToShow = useMemo(() => {
    return cursos.map(realCourse => ({
      id: realCourse.id,
      realCourse,
      title: realCourse.name,
      category: realCourse.academic_period || 'CURSO CLÍNICO',
      period: realCourse.academic_period || '',
      subtitle: realCourse.teacher_name
        ? `Docente: ${realCourse.teacher_name}`
        : realCourse.description
        ? realCourse.description.replace(/<[^>]+>/g, '').trim().slice(0, 70)
        : esDocente
        ? 'Administrar contenido del curso'
        : 'Ver contenido del curso',
      imageUrl: realCourse.cover_url || null,
    }));
  }, [cursos, esDocente]);

  /* ── Tareas de hoy (Actividades y evaluaciones reales de los cursos) ── */
  interface TaskItem {
    id: string;
    type: 'Tarea' | 'Cuestionario';
    title: string;
    category: string;
    teacher: string;
    color: 'teal' | 'yellow' | 'purple';
    icon: React.ReactNode;
    actionType: 'add' | 'done';
    courseId?: string;
  }

  const allTasks: TaskItem[] = useMemo(() => {
    return fechasReales.map((f, idx) => {
      const isAssignment = f.type === 'ASSIGNMENT';
      const fechaCorta = f.due_at ? formatFechaHoraCorta(f.due_at) : null;
      return {
        id: `real-${f.item_id}`,
        type: isAssignment ? 'Tarea' : 'Cuestionario',
        title: f.title,
        category: f.course_name,
        teacher: fechaCorta ? `Vence: ${fechaCorta}` : 'Sin fecha límite',
        color: (isAssignment ? (idx % 2 === 0 ? 'teal' : 'purple') : 'yellow') as 'teal' | 'yellow' | 'purple',
        icon: isAssignment ? <FileText size={18} strokeWidth={2} /> : <Calculator size={18} strokeWidth={2} />,
        actionType: isAssignment ? 'add' : 'done',
        courseId: f.course_id,
      };
    });
  }, [fechasReales]);


  const filteredTasks = useMemo(() => {
    return allTasks.filter(t => {
      if (taskTab === 'todo' && t.type !== 'Tarea') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.teacher.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allTasks, taskTab, searchQuery]);

  function toggleTaskDone(id: string) {
    setCompletedTasks(prev => ({ ...prev, [id]: !prev[id] }));
  }

  /* ── Mapeo de entregas reales para marcarlas en el calendario ── */
  const realDueDatesSet = useMemo(() => {
    const set = new Set<string>();
    fechasReales.forEach(f => {
      if (f.due_at) {
        // El día en que cae el cierre, en hora de Colombia.
        const d = comoFechaDeColombia(f.due_at);
        const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        set.add(k);
      }
    });
    return set;
  }, [fechasReales]);

  /* ── Calendario interactivo en tiempo real ── */
  const calDays = useMemo(() => {
    const year = calMonthDate.getFullYear();
    const month = calMonthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // En JavaScript: getDay() -> 0: Domingo, 1: Lunes, ..., 6: Sábado
    // Ajuste para que Lunes sea la primera columna (0) y Domingo la última (6):
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;

    const days: {
      dayNum: number;
      month: number;
      year: number;
      isCurrentMonth: boolean;
      dateStr: string;
      dateKey: string;
    }[] = [];

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const prevMonthIdx = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthLastDay - i;
      days.push({
        dayNum: dNum,
        month: prevMonthIdx,
        year: prevYear,
        isCurrentMonth: false,
        dateStr: `prev-${dNum}`,
        dateKey: `${prevYear}-${prevMonthIdx + 1}-${dNum}`,
      });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({
        dayNum: d,
        month,
        year,
        isCurrentMonth: true,
        dateStr: `${year}-${month + 1}-${d}`,
        dateKey: `${year}-${month + 1}-${d}`,
      });
    }

    const nextMonthIdx = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const remaining = (7 - (days.length % 7)) % 7;

    for (let d = 1; d <= remaining; d++) {
      days.push({
        dayNum: d,
        month: nextMonthIdx,
        year: nextYear,
        isCurrentMonth: false,
        dateStr: `next-${d}`,
        dateKey: `${nextYear}-${nextMonthIdx + 1}-${d}`,
      });
    }

    return days;
  }, [calMonthDate]);

  function prevMonth() {
    setCalMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCalMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  function goToToday() {
    const n = comoFechaDeColombia();
    setCalMonthDate(new Date(n.getFullYear(), n.getMonth(), 1));
    setSelectedDate(n);
  }

  /* ── Próximos eventos (vinculados a fechas reales de la fecha actual) ── */
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const futureReal = fechasReales
      .filter(f => f.due_at && new Date(f.due_at) >= now)
      .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

    return futureReal.slice(0, 5).map((f, i) => {
      const d = comoFechaDeColombia(f.due_at!);
      return {
        id: f.item_id,
        title: f.title,
        desc: `${f.type === 'ASSIGNMENT' ? 'Tarea' : 'Cuestionario'} en ${f.course_name}`,
        date: `${d.getDate()} ${MESES_ABR[d.getMonth()]}`,
        duration: f.due_at ? faltaPara(f.due_at) : 'Próximamente',
        iconType: (f.type === 'ASSIGNMENT' ? 'purple' : 'yellow') as 'purple' | 'yellow',
        isSolid: i === 0,
        dateObj: d,
        courseId: f.course_id,
      };
    });
  }, [fechasReales]);


  // Si el docente prefiere gestionar el roster tradicional:
  if (esDocente && docenteTab === 'roster') {
    return (
      <div className="dash-root">
        <Sidebar />
        <FeedbackFab pestana="inicio" />
        <div className="cur-wrapper">
          <header className="cur-header">
            <div>
              <h1 className="cur-title"><GraduationCap size={22} /> Mis cursos</h1>
              <p className="cur-subtitle">Crea cursos para tus estudiantes y revisa quién se ha matriculado.</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="cur-btn" style={{ background: '#64748B' }} onClick={() => setDocenteTab('dashboard')}>
                Ver Cronograma y Progreso
              </button>
              <button type="button" className="cur-btn" style={{ background: '#64748B' }} onClick={() => setPapeleraAbierta(true)}>
                <Trash2 size={16} /> Papelera
              </button>
              <button type="button" className="cur-btn" onClick={() => setModalAbierto(true)}>
                <Plus size={16} /> Nuevo curso
              </button>
            </div>
          </header>

          {error && <p className="cur-error">{error}</p>}

          <div className="cur-layout">
            <div className="cur-lista">
              {loading ? (
                <p className="cur-vacio">Cargando…</p>
              ) : cursos.length === 0 ? (
                <p className="cur-vacio">Todavía no creaste ningún curso.</p>
              ) : (
                cursos.map(c => (
                  <div key={c.id} className={`cur-card ${seleccionado?.id === c.id ? 'is-active' : ''}`} onClick={() => verRoster(c)}>
                    <div>
                      <p className="cur-card-nombre">{c.name}</p>
                      <p className="cur-card-sub">{c.academic_period || 'Sin período'}</p>
                    </div>
                    <div className="cur-card-btns">
                      <button type="button" className="cur-icon-btn" title="Ver y administrar contenido" onClick={e => { e.stopPropagation(); navigate(`/mis-cursos/${c.id}`); }}>
                        <BookOpen size={14} />
                      </button>
                      <button type="button" className="cur-icon-btn" title="Borrar curso" onClick={e => { e.stopPropagation(); handleBorrar(c); }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="cur-roster">
              {!seleccionado ? (
                <p className="cur-vacio">Elegí un curso para ver sus estudiantes.</p>
              ) : (
                <>
                  <h2 className="cur-roster-titulo"><Users size={16} /> {seleccionado.name}</h2>
                  <MatriculaPanel courseId={seleccionado.id} onEstudianteAprobado={() => verRoster(seleccionado)} />
                  <form className="cur-agregar" onSubmit={handleAgregarEstudiante}>
                    <input
                      type="email"
                      className="cur-input"
                      placeholder="correo@del-estudiante.com"
                      value={correoNuevo}
                      onChange={e => setCorreoNuevo(e.target.value)}
                    />
                    <button type="submit" className="cur-btn cur-btn-sm" disabled={agregando}>
                      <UserPlus size={14} /> {agregando ? 'Agregando…' : 'Agregar'}
                    </button>
                  </form>
                  <p className="cur-card-sub">El estudiante tiene que haberse registrado antes — esto no crea la cuenta.</p>
                  {errorRoster && <p className="cur-error">{errorRoster}</p>}

                  {cargandoRoster ? (
                    <p className="cur-vacio">Cargando…</p>
                  ) : estudiantes.length === 0 ? (
                    <p className="cur-vacio">Todavía no hay estudiantes matriculados.</p>
                  ) : (
                    <div className="cur-tabla-wrap">
                      <table className="cur-tabla">
                        <thead><tr><th>Nombre</th><th>Correo</th><th>Código</th><th>Completados</th><th>En progreso</th><th></th></tr></thead>
                        <tbody>
                          {estudiantes.map(e => (
                            <tr key={e.user_id}>
                              <td>{e.nombre}</td>
                              <td>{e.email}</td>
                              <td>{e.student_code}</td>
                              <td>{e.casos_completados}</td>
                              <td>{e.casos_en_progreso}</td>
                              <td>
                                <button type="button" className="cur-icon-btn" title="Quitar del curso" disabled={quitandoId === e.user_id} onClick={() => handleQuitarEstudiante(e)}>
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Vista principal: Tarjetas, Calendario y Progreso ── */
  return (
    <div className="dash-root">
      <Sidebar />
      <FeedbackFab pestana="inicio" />

      <main className="mc-page">
        <div className="mc-container">
          <div className="mc-layout">
            {/* ── Columna Izquierda: Contenido Principal ── */}
            <div className="mc-main-content">
              {/* Fila del encabezado: Título y acciones docentes */}
              <div className="mc-header-row">
                <h1 className="mc-title">
                  Mis Cursos <span className="mc-dot-accent">.</span>
                </h1>

                {esDocente && (
                  <div className="mc-teacher-actions">
                    <div className="mc-teacher-tabs">
                      <button
                        type="button"
                        className={`mc-teacher-tab-btn ${docenteTab === 'dashboard' ? 'is-active' : ''}`}
                        onClick={() => setDocenteTab('dashboard')}
                      >
                        Panel
                      </button>
                      <button
                        type="button"
                        className={`mc-teacher-tab-btn ${docenteTab === 'roster' ? 'is-active' : ''}`}
                        onClick={() => setDocenteTab('roster')}
                      >
                        Estudiantes
                      </button>
                    </div>
                    <button
                      type="button"
                      className="mc-teacher-tab-btn"
                      title="Cursos eliminados"
                      onClick={() => setPapeleraAbierta(true)}
                    >
                      <Trash2 size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      Papelera
                    </button>
                    <button
                      type="button"
                      className="mc-btn-orange"
                      onClick={() => setModalAbierto(true)}
                    >
                      <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      Nuevo curso
                    </button>
                  </div>
                )}
                {!esDocente && (
                  <button type="button" className="mc-btn-orange" onClick={() => setUnirseAbierto(true)}>
                    <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Unirme a un curso
                  </button>
                )}
              </div>

              {error && <p className="cur-error">{error}</p>}

              {/* Contenedor de cursos: Carrusel horizontal (>3) o Cuadrícula expandida */}
              <section className="mc-courses-wrapper">
                {!expandedGrid && cardsToShow.length > 3 && (
                  <div className="mc-courses-head-bar">
                    <span className="mc-carousel-hint">
                      {cardsToShow.length} cursos disponibles
                    </span>
                    <div className="mc-carousel-nav-arrows">
                      <button
                        type="button"
                        className="mc-carousel-nav-btn"
                        onClick={() => scrollCarousel('left')}
                        disabled={!canScrollLeft}
                        aria-label="Cursos anteriores"
                        title="Ver cursos anteriores"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        className="mc-carousel-nav-btn"
                        onClick={() => scrollCarousel('right')}
                        disabled={!canScrollRight}
                        aria-label="Cursos siguientes"
                        title="Ver siguientes cursos"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {loading ? (
                  <div className="mc-empty-courses">
                    <p style={{ margin: 0, color: 'var(--ink3)' }}>Cargando cursos...</p>
                  </div>
                ) : cardsToShow.length === 0 ? (
                  <div className="mc-empty-courses">
                    <GraduationCap size={44} className="mc-empty-courses-icon" />
                    <h3 className="mc-empty-courses-title">
                      {esDocente ? 'No tienes cursos creados' : 'No estás matriculado en ningún curso'}
                    </h3>
                    <p className="mc-empty-courses-desc">
                      {esDocente
                        ? 'Crea tu primer curso para organizar bloques temáticos, subir materiales clínicos y asignar tareas.'
                        : 'Únete a un curso mediante el código facilitado por tu docente para ver sus materiales y tareas.'}
                    </p>
                    {esDocente ? (
                      <button type="button" className="mc-btn-orange" onClick={() => setModalAbierto(true)}>
                        <Plus size={15} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Crear nuevo curso
                      </button>
                    ) : (
                      <button type="button" className="mc-btn-orange" onClick={() => setUnirseAbierto(true)}>
                        <Plus size={15} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Unirme a un curso
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    ref={carouselRef}
                    onScroll={handleCarouselScroll}
                    className={
                      expandedGrid
                        ? `mc-cards-grid-expanded ${isCollapsing ? 'is-collapsing' : ''}`
                        : cardsToShow.length > 3
                        ? 'mc-cards-carousel-track'
                        : 'mc-cards-grid'
                    }
                  >
                    {cardsToShow.map(card => {
                      const isDestacado = !!destacados[card.id];
                      return (
                        <div
                          key={card.id}
                          className={`mc-course-card ${isDestacado ? 'is-destacado' : ''}`}
                          onClick={() => {
                            navigate(`/mis-cursos/${card.realCourse.id}`);
                          }}
                          title={`Abrir ${card.title}`}
                        >
                          {/* Imagen superior (puesta por el docente o con portada clínica) */}
                          <div className="mc-card-img-wrap">
                            <PortadaCurso
                              id={card.realCourse.id}
                              name={card.title}
                              url={card.imageUrl}
                              className="mc-card-img"
                            />
                            {isDestacado && (
                              <span className="mc-card-star-badge" title="Curso destacado">
                                <Star size={14} fill="#F59E0B" color="#F59E0B" />
                              </span>
                            )}
                          </div>

                          {/* Cuerpo inferior con categoría, nombre y menú de 3 puntos */}
                          <div className="mc-card-body">
                            {card.category && (
                              <span className="mc-card-category">{card.category}</span>
                            )}

                            <div className="mc-card-title-row">
                              <h3 className="mc-card-title" title={card.title}>
                                {card.title}
                              </h3>

                              {/* Menú de 3 puntos: Destacar curso y Salirse/Eliminar */}
                              <div className="mc-card-menu-wrap" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="mc-card-dots-btn"
                                  title="Opciones del curso"
                                  onClick={() => setOpenMenuId(openMenuId === card.id ? null : card.id)}
                                >
                                  <MoreHorizontal size={18} />
                                </button>

                                {openMenuId === card.id && (
                                  <div className="mc-card-dropdown-menu">
                                    <button
                                      type="button"
                                      className="mc-card-dropdown-item"
                                      onClick={() => {
                                        toggleDestacar(card.id);
                                        setOpenMenuId(null);
                                      }}
                                    >
                                      <Star
                                        size={15}
                                        color={isDestacado ? '#F59E0B' : 'currentColor'}
                                        fill={isDestacado ? '#F59E0B' : 'none'}
                                      />
                                      <span>{isDestacado ? 'Quitar de destacados' : 'Destacar curso'}</span>
                                    </button>

                                    <button
                                      type="button"
                                      className="mc-card-dropdown-item is-danger"
                                      disabled={saliendoId === card.realCourse.id}
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        if (esDocente) {
                                          handleBorrar(card.realCourse);
                                        } else {
                                          handleSalir(card.realCourse);
                                        }
                                      }}
                                    >
                                      <LogOut size={15} />
                                      <span>{esDocente ? 'Eliminar curso' : (saliendoId === card.realCourse.id ? 'Saliendo…' : 'Salirse del curso')}</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {!esDocente ? (
                              <div className="mc-card-indicadores">
                                <span className={`mc-card-pendientes ${card.realCourse.pending_assignments ? 'has-pendientes' : ''}`}>
                                  <ClipboardList size={13} />
                                  {card.realCourse.pending_assignments
                                    ? `${card.realCourse.pending_assignments} ${card.realCourse.pending_assignments === 1 ? 'tarea pendiente' : 'tareas pendientes'}`
                                    : 'Sin tareas pendientes'}
                                </span>
                                {card.realCourse.next_due_at && (
                                  <span
                                    className="mc-card-proxima"
                                    title={card.realCourse.next_due_title ? `Próxima entrega: ${card.realCourse.next_due_title}` : undefined}
                                  >
                                    <Clock size={13} />
                                    Cierra {formatFechaHoraCorta(card.realCourse.next_due_at)} · {faltaPara(card.realCourse.next_due_at)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="mc-card-subtitle">
                                {card.subtitle}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Opción en la parte de abajo: Ver todos los cursos / Ver menos */}
                {cardsToShow.length > 3 && (
                  <div className="mc-expand-toggle-row">
                    <button
                      type="button"
                      className="mc-expand-toggle-btn"
                      onClick={handleToggleExpand}
                      title={expandedGrid ? 'Mostrar vista en carrusel' : 'Mostrar todos los cursos'}
                    >
                      <span>{expandedGrid ? 'Ver menos' : 'Ver todos los cursos'}</span>
                      <ChevronDown
                        size={16}
                        className={`mc-expand-chevron-icon ${expandedGrid && !isCollapsing ? 'is-rotated' : ''}`}
                      />
                    </button>
                  </div>
                )}
              </section>

              {/* Sección de Tareas de Hoy */}
              <section className="mc-tasks-section">
                <div className="mc-section-header">
                  <h2 className="mc-section-title">
                    Tareas de Hoy <span className="mc-dot-accent">.</span>
                  </h2>
                </div>

                {/* Sub-pestañas: Foro | Por hacer | Miembros */}
                <div className="mc-tabs-row">
                  <button
                    type="button"
                    className={`mc-tab-btn ${taskTab === 'foro' ? 'is-active' : ''}`}
                    onClick={() => setTaskTab('foro')}
                  >
                    Foro
                  </button>
                  <button
                    type="button"
                    className={`mc-tab-btn ${taskTab === 'todo' ? 'is-active' : ''}`}
                    onClick={() => setTaskTab('todo')}
                  >
                    Por hacer
                  </button>
                  <button
                    type="button"
                    className={`mc-tab-btn ${taskTab === 'miembros' ? 'is-active' : ''}`}
                    onClick={() => setTaskTab('miembros')}
                  >
                    Miembros
                  </button>
                </div>

                {/* Lista de filas de tareas */}
                <div className="mc-tasks-list">
                  {filteredTasks.length === 0 ? (
                    <div className="mc-empty-tasks">
                      <FileText size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)' }}>
                        No hay actividades ni tareas pendientes
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--ink3)' }}>
                        Las tareas y cuestionarios con fecha límite de tus cursos aparecerán aquí.
                      </p>
                    </div>
                  ) : (
                    filteredTasks.map(task => {
                      const isDone = !!completedTasks[task.id];
                      return (
                        <div key={task.id} className="mc-task-row">
                          <div className="mc-task-left">
                            <div className={`mc-task-icon-box mc-task-icon-${task.color}`}>
                              {task.icon}
                            </div>
                            <div className="mc-task-details">
                              <div className="mc-task-title-line">
                                <h4
                                  className="mc-task-title"
                                  style={{
                                    textDecoration: isDone ? 'line-through' : 'none',
                                    opacity: isDone ? 0.65 : 1,
                                  }}
                                >
                                  {task.title}
                                </h4>
                                <span className="mc-task-tag">• {task.type}</span>
                              </div>
                              <p className="mc-task-sub">
                                {task.category} . {task.teacher}
                              </p>
                            </div>
                          </div>

                          <div className="mc-task-actions">
                            <button
                              type="button"
                              className="mc-task-more-btn"
                              title="Más opciones"
                              onClick={() => {
                                if (task.courseId) navigate(`/mis-cursos/${task.courseId}`);
                              }}
                            >
                              <MoreHorizontal size={18} />
                            </button>

                            {task.actionType === 'add' ? (
                              <button
                                type="button"
                                className="mc-btn-orange"
                                onClick={() => {
                                  if (task.courseId) navigate(`/mis-cursos/${task.courseId}`);
                                }}
                              >
                                + Agregar o Crear
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={`mc-btn-done-soft ${isDone ? 'is-done' : ''}`}
                                onClick={() => toggleTaskDone(task.id)}
                              >
                                {isDone ? 'Listo ✓' : 'Marcar como listo'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>

            {/* ── Columna Derecha: Panel Lateral ── */}
            <aside className="mc-sidebar-panel">
              {/* Barra de búsqueda y Perfil de Usuario */}
              <div className="mc-search-profile-bar">
                <div className="mc-search-input-wrap">
                  <Search size={16} className="mc-search-icon" />
                  <input
                    type="text"
                    className="mc-search-input"
                    placeholder="Buscar cualquier cosa..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Widget del Calendario */}
              <div className="mc-cal-widget">
                <div className="mc-cal-header">
                  <span className="mc-cal-title">
                    {MESES_ES[calMonthDate.getMonth()]} {calMonthDate.getFullYear()}
                  </span>
                  <div className="mc-cal-arrows">
                    <button
                      type="button"
                      className="mc-cal-today-pill"
                      onClick={goToToday}
                      title="Ir a hoy"
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      className="mc-cal-arrow-btn"
                      onClick={prevMonth}
                      title="Mes anterior"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      className="mc-cal-arrow-btn"
                      onClick={nextMonth}
                      title="Mes siguiente"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>

                <div className="mc-cal-grid">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                    <div key={d} className="mc-cal-weekday">{d}</div>
                  ))}

                  {calDays.map((day, idx) => {
                    const isToday =
                      day.isCurrentMonth &&
                      day.year === today.getFullYear() &&
                      day.month === today.getMonth() &&
                      day.dayNum === today.getDate();

                    const isSelected =
                      day.year === selectedDate.getFullYear() &&
                      day.month === selectedDate.getMonth() &&
                      day.dayNum === selectedDate.getDate();

                    const hasIndicator = realDueDatesSet.has(day.dateKey);

                    let cellClasses = 'mc-cal-day-cell';
                    if (!day.isCurrentMonth) cellClasses += ' is-outside';
                    if (isToday) cellClasses += ' is-today';
                    if (isSelected) cellClasses += ' is-selected';

                    return (
                      <div
                        key={day.dateStr + idx}
                        className={cellClasses}
                        onClick={() => {
                          setSelectedDate(new Date(day.year, day.month, day.dayNum));
                          if (!day.isCurrentMonth) {
                            setCalMonthDate(new Date(day.year, day.month, 1));
                          }
                        }}
                        title={
                          isToday
                            ? `Hoy (${day.dayNum} de ${MESES_ES[day.month]})`
                            : `${day.dayNum} de ${MESES_ES[day.month]} de ${day.year}`
                        }
                      >
                        <span>{day.dayNum}</span>
                        {hasIndicator && <span className="mc-cal-dot-indicator" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Widget de Próximos */}
              <div className="mc-upcoming-widget">
                <h3 className="mc-upcoming-title">
                  Próximos <span className="mc-dot-accent">.</span>
                </h3>

                {upcomingEvents.length === 0 ? (
                  <div className="mc-empty-timeline">
                    <Clock size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Sin actividades próximas</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', opacity: 0.85 }}>
                      No hay entregas pendientes registradas.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mc-timeline">
                      {upcomingEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="mc-timeline-item"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setSelectedDate(ev.dateObj);
                            setCalMonthDate(new Date(ev.dateObj.getFullYear(), ev.dateObj.getMonth(), 1));
                          }}
                          title="Ver fecha en el calendario"
                        >
                          <span className={`mc-tl-marker ${ev.isSolid ? 'is-solid' : 'is-ring'}`} />
                          <div className="mc-tl-content">
                            <h4 className="mc-tl-header">{ev.title}</h4>
                            <p className="mc-tl-sub">{ev.desc}</p>
                          </div>
                          <div className="mc-tl-meta">
                            <div className="mc-tl-text-meta">
                              <p className="mc-tl-date">{ev.date}</p>
                              <p className="mc-tl-dur">{ev.duration}</p>
                            </div>
                            <div className={`mc-tl-icon-badge mc-tl-icon-${ev.iconType}`}>
                              {ev.iconType === 'purple' ? <PenTool size={16} /> : <BookOpen size={16} />}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <span
                      className="mc-view-all-link"
                      role="button"
                      tabIndex={0}
                    >
                      Ver todos los próximos
                      <ChevronRight size={15} />
                    </span>
                  </>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>

      {unirseAbierto && (
        <UnirseACursoModal
          misCursosIds={cursos.map(c => c.id)}
          onClose={() => setUnirseAbierto(false)}
          onMatriculado={cargarCursos}
        />
      )}

      {/* Modal para crear nuevo curso (docentes) */}
      {papeleraAbierta && (
        <PapeleraCursosModal
          onClose={() => setPapeleraAbierta(false)}
          onRestaurado={curso => setCursos(prev => [curso, ...prev.filter(c => c.id !== curso.id)])}
        />
      )}

      {modalAbierto && (
        <div className="cur-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModalAbierto(false); }}>
          <form className="cur-modal" onSubmit={handleCrear}>
            <div className="cur-modal-head">
              <span>Nuevo curso</span>
              <button type="button" onClick={() => setModalAbierto(false)}><X size={16} /></button>
            </div>
            <label className="cur-label">Nombre *</label>
            <input className="cur-input" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus maxLength={150} />
            <label className="cur-label">Imagen de portada (opcional)</label>
            <PortadaPicker
              courseId={nombre.trim() || 'curso-nuevo'}
              courseName={nombre}
              value={portadaNueva}
              onChange={setPortadaNueva}
              disabled={guardando}
            />
            <label className="cur-label">Descripción (opcional)</label>
            <RichTextEditor content={descripcion} onChange={setDescripcion} placeholder="Bienvenida, objetivos, cronograma..." />
            <label className="cur-label">Período académico (opcional)</label>
            <input className="cur-input" placeholder="2026-2" value={periodo} onChange={e => setPeriodo(e.target.value)} maxLength={20} />
            {errorModal && <p className="cur-error">{errorModal}</p>}
            <button type="submit" className="cur-btn" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear curso'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
