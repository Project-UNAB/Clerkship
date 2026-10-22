import { useState, useRef, useEffect, useMemo, type MouseEvent as MouseEventReact, type FocusEvent as FocusEventReact } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { signOut } from 'firebase/auth';
import {
  ChevronDown,
  Settings,
  LogOut,
  User,
  Sun,
  Moon,
  Menu,
  X,
  GraduationCap,
  LayoutGrid,
  Briefcase,
  Clock,
  Library,
  ChevronRight,
  ShieldCheck,
  Palette,
  Mail,
  Zap,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { auth } from '../../data/firebase';
import { getInitialTheme, triggerThemeToggle, type ThemeMode } from '../../utils/themeHelper';
import { logoutUserSession } from '../../utils/authConsent';
import { useCurrentUser } from '../../utils/currentUser';
import { getStoredUser, logoutMainSession } from '../../data/mainAuth';
import { listConsultations, listMyCourses } from '../../data/consultasApi';
import logoUrl from '../../assets/Logo Clerkship.svg';
import NotificacionesCampana from './NotificacionesCampana';
import { useReducirMovimiento } from '../../utils/preferencias';
import { actualizarPreferencias, obtenerPreferencias } from '../../data/notificacionesApi';
import '../../styles/sidebar.css';

/* ── Tipos ─────────────────────────────────────────────────── */
interface TreeChild {
  label: string;
  route: string;
  badge?: number | string;
  badgeType?: 'orange' | 'green' | 'blue';
}

interface TreeSection {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  route: string;
  children?: TreeChild[];
}

/* ── Utilidades ────────────────────────────────────────────── */
function getActiveSectionId(pathname: string): string {
  if (pathname.startsWith('/casos')) return 'casos';
  if (pathname.startsWith('/historial')) return 'historial';
  if (pathname.startsWith('/perfil')) return 'perfil';
  if (pathname.startsWith('/biblioteca')) return 'biblioteca';
  if (pathname.startsWith('/seguimiento')) return 'seguimiento';
  if (pathname.startsWith('/mis-cursos') || pathname.startsWith('/explorar')) return 'mis-cursos';
  return 'overview';
}

function isChildActive(childRoute: string, pathname: string, searchParams: URLSearchParams): boolean {
  const [baseRoute, query] = childRoute.split('?');
  const childParams = new URLSearchParams(query || '');

  const isBaseMatch =
    (baseRoute === '/dashboard' && (pathname === '/dashboard' || pathname === '/')) ||
    (baseRoute === '/seguimiento' && pathname.startsWith('/seguimiento')) ||
    pathname === baseRoute;

  if (!isBaseMatch) return false;

  if (query) {
    for (const [key, value] of childParams.entries()) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  }

  if (baseRoute === '/casos') return !searchParams.get('tab') && !searchParams.get('nuevo');
  if (baseRoute === '/biblioteca') return !searchParams.get('modulo');
  if (baseRoute === '/historial') return !searchParams.get('tab');
  return true;
}

/** Grupos del menú, en orden. Las secciones que no existan para el rol se omiten. */
const GRUPOS: { titulo: string; ids: string[] }[] = [
  { titulo: 'General', ids: ['overview', 'casos', 'historial'] },
  { titulo: 'Aprendizaje', ids: ['biblioteca', 'mis-cursos', 'seguimiento'] },
];

const ANCHO_ABIERTO = 264;
const ANCHO_CERRADO = 72;
const STORAGE_KEY = 'clerkship_sb_expanded';

/* ════════════════════════════════════════════════════════════
   Barra lateral: se abre y se cierra (escritorio) y es un cajón
   deslizable en pantallas de hasta 1024 px.
   ════════════════════════════════════════════════════════════ */
export default function Sidebar() {
  const navigate       = useNavigate();
  const { pathname }   = useLocation();
  const [searchParams] = useSearchParams();
  const currentUser    = useCurrentUser();
  const sinMovimiento  = useReducedMotion();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isExpanded, setIsExpandedRaw] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [tip, setTip] = useState<{ texto: string; x: number; y: number } | null>(null);

  // Preferencias reales del menú de configuración (las mismas de Perfil).
  const [reducirMovimiento, setReducirMovimiento] = useReducirMovimiento();
  const [avisosPorCorreo, setAvisosPorCorreo] = useState<boolean | null>(null);
  const [guardandoCorreo, setGuardandoCorreo] = useState(false);

  useEffect(() => {
    if (!settingsOpen || avisosPorCorreo !== null) return;
    obtenerPreferencias().then(p => setAvisosPorCorreo(p.email)).catch(() => { /* sin red: se reintenta al abrir */ });
  }, [settingsOpen, avisosPorCorreo]);

  async function cambiarAvisosPorCorreo() {
    if (avisosPorCorreo === null || guardandoCorreo) return;
    setGuardandoCorreo(true);
    try {
      setAvisosPorCorreo((await actualizarPreferencias(!avisosPorCorreo)).email);
    } catch {
      /* se queda como estaba */
    } finally {
      setGuardandoCorreo(false);
    }
  }

  // Métricas reales para los contadores (en curso, completados, cursos)
  const [counts, setCounts] = useState({ inProgress: 0, completed: 0, courses: 0 });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listConsultations(), listMyCourses()]).then(([consultasRes, cursosRes]) => {
      if (cancelled) return;
      let inProgress = 0;
      let completed = 0;
      let courses = 0;
      if (consultasRes.status === 'fulfilled' && Array.isArray(consultasRes.value)) {
        inProgress = consultasRes.value.filter(c => c.status === 'IN_PROGRESS').length;
        completed = consultasRes.value.filter(c => c.status === 'COMPLETED').length;
      }
      if (cursosRes.status === 'fulfilled' && Array.isArray(cursosRes.value)) courses = cursosRes.value.length;
      setCounts({ inProgress, completed, courses });
    });
    return () => { cancelled = true; };
  }, [pathname]);

  // Secciones abiertas tipo acordeón
  const currentSectionId = getActiveSectionId(pathname);
  const [activeId, setActiveId] = useState(currentSectionId);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => ({ [currentSectionId]: true }));

  // Al cambiar de ruta: se cierra el cajón y se abre la sección de la ruta.
  useEffect(() => {
    setMobileOpen(false);
    const secId = getActiveSectionId(pathname);
    setActiveId(secId);
    setExpandedSections(prev => ({ ...prev, [secId]: true }));
  }, [pathname]);

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEv = e as CustomEvent<ThemeMode>;
      if (customEv.detail) setTheme(customEv.detail);
    };
    window.addEventListener('clerkship-theme-change', handleThemeChange);
    return () => window.removeEventListener('clerkship-theme-change', handleThemeChange);
  }, []);

  // El cajón móvil bloquea el desplazamiento de la página y se cierra con Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [mobileOpen]);

  /* Cerrar los menús emergentes al hacer clic fuera o con Escape */
  useEffect(() => {
    if (!profileOpen && !settingsOpen) return;
    setTip(null);
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setProfileOpen(false); setSettingsOpen(false); } };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', onKey); };
  }, [profileOpen, settingsOpen]);

  function handleToggleTheme() {
    setTheme(triggerThemeToggle(theme));
  }

  function setIsExpanded(value: boolean | ((prev: boolean) => boolean)) {
    setTip(null);
    setIsExpandedRaw(prev => {
      const next = typeof value === 'function' ? value(prev) : value;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* sin almacenamiento local */ }
      return next;
    });
  }

  async function handleLogout() {
    logoutUserSession();
    // Revoca los tokens en el servidor además de limpiar el navegador.
    logoutMainSession();
    try {
      await signOut(auth);
    } catch {
      // Sin sesión de Firebase activa
    }
    navigate('/', { replace: true });
  }

  const esDocente = getStoredUser()?.role === 'TEACHER';

  // Secciones reales del sistema
  const treeSections: TreeSection[] = useMemo(() => [
    {
      id: 'overview', label: 'Dashboard', Icon: LayoutGrid, route: '/dashboard',
      children: [
        { label: 'Vista general', route: '/dashboard' },
        { label: 'Documentos clínicos', route: '/dashboard' },
      ],
    },
    {
      id: 'casos', label: 'Casos clínicos', Icon: Briefcase, route: '/casos',
      children: [
        { label: 'Todos los casos', route: '/casos' },
        { label: 'En curso', route: '/casos?tab=IN_PROGRESS', badge: counts.inProgress > 0 ? counts.inProgress : undefined, badgeType: 'orange' },
        { label: 'Completados', route: '/casos?tab=COMPLETED', badge: counts.completed > 0 ? counts.completed : undefined, badgeType: 'green' },
        { label: 'Nuevo caso', route: '/casos?nuevo=1' },
      ],
    },
    {
      id: 'historial', label: 'Historial', Icon: Clock, route: '/historial',
      children: [
        { label: 'Sesiones clínicas', route: '/historial' },
        { label: 'Evaluaciones de IA', route: '/historial' },
      ],
    },
    {
      id: 'biblioteca', label: 'Biblioteca', Icon: Library, route: '/biblioteca',
      children: [
        { label: 'Todos los recursos', route: '/biblioteca' },
        { label: 'Guías clínicas', route: '/biblioteca?modulo=guias' },
      ],
    },
    {
      id: 'mis-cursos', label: 'Mis cursos', Icon: GraduationCap, route: '/mis-cursos',
      children: [
        { label: 'Cursos matriculados', route: '/mis-cursos', badge: counts.courses > 0 ? counts.courses : undefined, badgeType: 'blue' },
        { label: 'Explorar catálogo', route: '/explorar' },
      ],
    },
    ...(esDocente
      ? [{ id: 'seguimiento', label: 'Seguimiento', Icon: BarChart3, route: '/seguimiento', children: [{ label: 'Simulador por curso', route: '/seguimiento' }] }]
      : []),
  ], [counts, esDocente]);

  const grupos = useMemo(() => GRUPOS
    .map(g => ({ titulo: g.titulo, secciones: g.ids.map(id => treeSections.find(s => s.id === id)).filter(Boolean) as TreeSection[] }))
    .filter(g => g.secciones.length), [treeSections]);

  /** Clic en una sección: abierta, despliega o pliega su submenú y navega;
   *  cerrada (solo iconos), solo navega. */
  function alPulsarSeccion(section: TreeSection, conSubmenu: boolean) {
    if (conSubmenu && section.children?.length) {
      setExpandedSections(prev => ({ ...prev, [section.id]: section.id === activeId ? !prev[section.id] : true }));
    }
    setActiveId(section.id);
    if (section.route !== pathname) navigate(section.route);
  }

  // Globo con el nombre de la sección cuando la barra está cerrada.
  const mostrarTip = (texto: string) => (e: MouseEventReact<HTMLElement> | FocusEventReact<HTMLElement>) => {
    if (isExpanded || profileOpen || settingsOpen) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ texto, x: r.right + 12, y: r.top + r.height / 2 });
  };
  const ocultarTip = () => setTip(null);
  const tipEn = (texto: string) => (el: HTMLElement | null) => {
    if (!el || isExpanded || profileOpen || settingsOpen) { setTip(null); return; }
    const r = el.getBoundingClientRect();
    setTip({ texto, x: r.right + 12, y: r.top + r.height / 2 });
  };

  const transicion = sinMovimiento ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 36 };
  const inicial = (currentUser?.name || 'U').trim().charAt(0).toUpperCase();
  const avatar = (clase: string) => (currentUser?.avatarUrl
    ? <img src={currentUser.avatarUrl} alt="" className={clase} />
    : <span className={`${clase} nv-avatar-letra`}>{inicial}</span>);

  /** Menú de secciones. `cajon` = el del celular (siempre con textos y submenús). */
  function renderNav(cajon: boolean) {
    const abierto = cajon || isExpanded;
    return grupos.map((grupo, gi) => (
      <div key={grupo.titulo} className="nv-grupo">
        {abierto
          ? <span className="nv-grupo-titulo">{grupo.titulo}</span>
          : gi > 0 && <span className="nv-grupo-linea" aria-hidden="true" />}
        <ul className="nv-lista">
          {grupo.secciones.map(section => {
            const conHijos = !!section.children?.length;
            const desplegada = abierto && conHijos && !!expandedSections[section.id];
            const activa = activeId === section.id;
            const hijoActivo = section.children?.findIndex(c => isChildActive(c.route, pathname, searchParams)) ?? -1;
            return (
              <li key={section.id} className={`nv-seccion${activa ? ' is-activa' : ''}`}>
                <button
                  type="button"
                  className={`nv-item${activa ? ' is-activo' : ''}`}
                  aria-current={activa ? 'page' : undefined}
                  aria-expanded={conHijos && abierto ? desplegada : undefined}
                  aria-label={abierto ? undefined : section.label}
                  onClick={() => alPulsarSeccion(section, abierto)}
                  onMouseEnter={mostrarTip(section.label)}
                  onMouseLeave={ocultarTip}
                  onFocus={mostrarTip(section.label)}
                  onBlur={ocultarTip}
                >
                  {activa && (
                    <motion.span layoutId={cajon ? 'nv-activo-cajon' : 'nv-activo'} className="nv-item-fondo" transition={transicion} />
                  )}
                  <span className="nv-item-icono"><section.Icon size={18} strokeWidth={activa ? 2.2 : 1.8} /></span>
                  {abierto && <span className="nv-item-txt">{section.label}</span>}
                  {abierto && conHijos && (
                    <motion.span className="nv-chevron" animate={{ rotate: desplegada ? 180 : 0 }} transition={{ duration: sinMovimiento ? 0 : 0.22 }}>
                      <ChevronDown size={15} strokeWidth={2} />
                    </motion.span>
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {desplegada && (
                    <motion.ul
                      key="sub"
                      className="nv-sub"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1, transition: { duration: sinMovimiento ? 0 : 0.26, ease: [0.22, 1, 0.36, 1], staggerChildren: sinMovimiento ? 0 : 0.035 } }}
                      exit={{ height: 0, opacity: 0, transition: { duration: sinMovimiento ? 0 : 0.2, ease: 'easeInOut' } }}
                    >
                      {section.children!.map((child, i) => {
                        const activo = i === hijoActivo;
                        return (
                          <motion.li
                            key={child.label}
                            variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
                            initial="hidden"
                            animate="show"
                            transition={{ duration: sinMovimiento ? 0 : 0.2, delay: sinMovimiento ? 0 : 0.04 + i * 0.035 }}
                          >
                            <button
                              type="button"
                              className={`nv-sub-item${activo ? ' is-activo' : ''}`}
                              aria-current={activo ? 'page' : undefined}
                              onClick={() => { navigate(child.route); if (cajon) setMobileOpen(false); }}
                            >
                              {activo && <motion.span layoutId={cajon ? 'nv-marca-cajon' : 'nv-marca'} className="nv-sub-marca" transition={transicion} />}
                              <span className="nv-sub-txt">{child.label}</span>
                              {child.badge !== undefined && <span className={`nv-contador is-${child.badgeType || 'orange'}`}>{child.badge}</span>}
                            </button>
                          </motion.li>
                        );
                      })}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
    ));
  }

  /** Ir a una pestaña del perfil cerrando los menús. */
  function irAPerfil(pestana = 'cuenta') {
    setSettingsOpen(false);
    setProfileOpen(false);
    navigate(`/perfil/${pestana}`);
  }

  /** Preferencias rápidas del menú de configuración; el resto, en Perfil. */
  function renderAjustes() {
    return (
      <div className="nv-ajustes">
        <div className="nv-ajustes-grupo">
          <span className="nv-ajustes-titulo">Notificaciones</span>
          <button type="button" className="nv-ajuste" role="switch" aria-checked={!!avisosPorCorreo}
            disabled={avisosPorCorreo === null || guardandoCorreo} onClick={cambiarAvisosPorCorreo}>
            <span><Mail size={14} /> Avisos por correo</span><span className={`nv-interruptor${avisosPorCorreo ? ' is-on' : ''}`} />
          </button>
        </div>
        <div className="nv-ajustes-grupo">
          <span className="nv-ajustes-titulo">Accesibilidad</span>
          <button type="button" className="nv-ajuste" role="switch" aria-checked={reducirMovimiento} onClick={() => setReducirMovimiento(!reducirMovimiento)}>
            <span><Zap size={14} /> Reducir movimiento</span><span className={`nv-interruptor${reducirMovimiento ? ' is-on' : ''}`} />
          </button>
        </div>
        <div className="nv-ajustes-grupo">
          <span className="nv-ajustes-titulo">Cuenta</span>
          <button type="button" className="nv-ajuste" onClick={() => irAPerfil('seguridad')}>
            <span><ShieldCheck size={14} /> Contraseña y sesiones</span><ChevronRight size={14} />
          </button>
          <button type="button" className="nv-ajuste" onClick={() => irAPerfil('apariencia')}>
            <span><Palette size={14} /> Todas las preferencias</span><ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  const animacionPop = {
    initial: { opacity: 0, y: 6, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 6, scale: 0.97 },
    transition: { duration: sinMovimiento ? 0 : 0.16, ease: 'easeOut' as const },
  };

  /** Interruptor claro / oscuro con la pastilla que se desliza. */
  const interruptorTema = (
    <div className="nv-tema" role="radiogroup" aria-label="Tema de la pantalla">
      {(['light', 'dark'] as const).map(t => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} aria-label={t === 'light' ? 'Modo claro' : 'Modo oscuro'}
          className={theme === t ? 'is-activo' : ''} onClick={() => { if (theme !== t) handleToggleTheme(); }}>
          {theme === t && <motion.span layoutId="nv-tema-pastilla" className="nv-tema-pastilla" transition={transicion} />}
          {t === 'light' ? <Sun size={14} /> : <Moon size={14} />}
          <span>{t === 'light' ? 'Claro' : 'Oscuro'}</span>
        </button>
      ))}
    </div>
  );

  const botonAjustes = (
    <div className="nv-ancla" ref={settingsRef}>
      <button type="button" className={`nv-icono${settingsOpen ? ' is-activo' : ''}`} aria-label="Configuración" aria-expanded={settingsOpen}
        onClick={() => { setProfileOpen(false); setSettingsOpen(v => !v); }}
        onMouseEnter={mostrarTip('Configuración')} onMouseLeave={ocultarTip}>
        <Settings size={17} strokeWidth={1.8} />
      </button>
      <AnimatePresence>
        {settingsOpen && (
          <motion.div className="nv-pop" role="dialog" aria-label="Configuración" {...animacionPop}>
            <p className="nv-pop-titulo">Configuración</p>
            {renderAjustes()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <>
      {/* ── Barra superior del celular (hasta 1024 px) ── */}
      <header className="nv-barra-movil">
        <button type="button" className="nv-marca" onClick={() => navigate('/dashboard')}>
          <img src={logoUrl} alt="Clerkship" className="nv-logo" />
          <span className="nv-marca-txt">Clerkship</span>
        </button>
        <NotificacionesCampana className="nv-campana" />
        <button type="button" className="nv-icono" onClick={() => setMobileOpen(true)} aria-label="Abrir el menú">
          <Menu size={20} />
        </button>
      </header>

      {/* ── Cajón del celular ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="nv-velo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: sinMovimiento ? 0 : 0.2 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="nv-cajon"
              role="dialog"
              aria-modal="true"
              aria-label="Menú"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={sinMovimiento ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="nv-cabeza">
                <button type="button" className="nv-marca" onClick={() => { navigate('/dashboard'); setMobileOpen(false); }}>
                  <img src={logoUrl} alt="Clerkship" className="nv-logo" />
                  <span className="nv-marca-txt">Clerkship</span>
                </button>
                <button type="button" className="nv-icono" onClick={() => setMobileOpen(false)} aria-label="Cerrar el menú">
                  <X size={18} />
                </button>
              </div>
              <nav className="nv-cuerpo" aria-label="Secciones">{renderNav(true)}</nav>
              <div className="nv-pie">
                {interruptorTema}
                <div className="nv-usuario">
                  {avatar('nv-avatar')}
                  <div className="nv-usuario-txt">
                    <strong>{currentUser?.name || 'Estudiante'}</strong>
                    <span>{currentUser?.role || 'Clínico'}</span>
                  </div>
                  <button type="button" className="nv-icono is-peligro" onClick={handleLogout} aria-label="Cerrar sesión">
                    <LogOut size={16} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Escritorio ── */}
      <motion.aside
        className={`nv ${isExpanded ? 'is-abierta' : 'is-cerrada'}`}
        initial={false}
        animate={{ width: isExpanded ? ANCHO_ABIERTO : ANCHO_CERRADO }}
        transition={sinMovimiento ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 34, mass: 0.8 }}
        onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button, a, input, select')) setIsExpanded(prev => !prev); }}
        aria-label="Barra lateral"
      >
        <div className="nv-cabeza">
          <button type="button" className="nv-marca" onClick={() => navigate('/dashboard')} aria-label="Ir al inicio"
            onMouseEnter={mostrarTip('Clerkship')} onMouseLeave={ocultarTip}>
            <img src={logoUrl} alt="Clerkship" className="nv-logo" />
            {isExpanded && <span className="nv-marca-txt">Clerkship</span>}
          </button>
          {isExpanded && (
            <div className="nv-cabeza-acciones">
              <button type="button" className="nv-icono" onClick={() => setIsExpanded(false)} aria-label="Cerrar la barra lateral" title="Cerrar la barra lateral">
                <PanelLeftClose size={17} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </div>

        {!isExpanded && (
          <div className="nv-cerrada-acciones">
            <button type="button" className="nv-icono" onClick={() => setIsExpanded(true)} aria-label="Abrir la barra lateral"
              onMouseEnter={mostrarTip('Abrir la barra lateral')} onMouseLeave={ocultarTip}>
              <PanelLeftOpen size={17} strokeWidth={1.8} />
            </button>
          </div>
        )}

        <nav className="nv-cuerpo" aria-label="Secciones">
          <NotificacionesCampana variante={isExpanded ? 'fila' : 'fila-compacta'} onHover={tipEn('Notificaciones')} />
          {renderNav(false)}
        </nav>

        <div className="nv-pie">
          {isExpanded ? (
            <>
              <div className="nv-pie-fila">
                {interruptorTema}
                {botonAjustes}
              </div>
              <div className="nv-usuario">
                <button type="button" className="nv-usuario-btn" onClick={() => irAPerfil()} title="Ver perfil">
                  {avatar('nv-avatar')}
                  <span className="nv-usuario-txt">
                    <strong>{currentUser?.name || 'Estudiante'}</strong>
                    <span>{currentUser?.role || 'Clínico'}</span>
                  </span>
                </button>
                <button type="button" className="nv-icono is-peligro" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
                  <LogOut size={16} strokeWidth={1.8} />
                </button>
              </div>
            </>
          ) : (
            <div className="nv-pie-columna">
              <button type="button" className="nv-icono" onClick={handleToggleTheme}
                aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                onMouseEnter={mostrarTip(theme === 'dark' ? 'Modo claro' : 'Modo oscuro')} onMouseLeave={ocultarTip}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={theme} className="nv-icono-tema"
                    initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: sinMovimiento ? 0 : 0.18 }}>
                    {theme === 'dark' ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
                  </motion.span>
                </AnimatePresence>
              </button>
              {botonAjustes}
              <div className="nv-ancla" ref={profileRef}>
                <button type="button" className={`nv-avatar-btn${profileOpen ? ' is-activo' : ''}`} aria-label="Mi cuenta" aria-expanded={profileOpen}
                  onClick={() => { setSettingsOpen(false); setProfileOpen(v => !v); }}
                  onMouseEnter={mostrarTip(currentUser?.name || 'Mi cuenta')} onMouseLeave={ocultarTip}>
                  {avatar('nv-avatar')}
                </button>
                <AnimatePresence>
                  {profileOpen && (
                    <motion.div className="nv-pop is-cuenta" role="menu" {...animacionPop}>
                      <div className="nv-usuario is-plano">
                        {avatar('nv-avatar')}
                        <span className="nv-usuario-txt">
                          <strong>{currentUser?.name || 'Invitado'}</strong>
                          <span>{currentUser?.role || 'Sin sesión activa'}</span>
                        </span>
                      </div>
                      <div className="nv-pop-linea" />
                      <button type="button" role="menuitem" className="nv-pop-item" onClick={() => irAPerfil()}>
                        <User size={15} strokeWidth={1.8} /> Mi perfil
                      </button>
                      <button type="button" role="menuitem" className="nv-pop-item" onClick={() => { setProfileOpen(false); setSettingsOpen(true); }}>
                        <Settings size={15} strokeWidth={1.8} /> Configuración
                      </button>
                      <div className="nv-pop-linea" />
                      <button type="button" role="menuitem" className="nv-pop-item is-peligro" onClick={handleLogout}>
                        <LogOut size={15} strokeWidth={1.8} /> Cerrar sesión
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </motion.aside>

      {/* Globo con el nombre de cada icono cuando la barra está cerrada */}
      {createPortal(
        <AnimatePresence>
          {tip && !isExpanded && (
            <motion.div
              key={tip.texto}
              className="nv-tip"
              style={{ left: tip.x, top: tip.y }}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: sinMovimiento ? 0 : 0.12 }}
            >
              {tip.texto}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
