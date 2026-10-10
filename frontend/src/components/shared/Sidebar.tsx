import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'firebase/auth';
import {
  ChevronLeft,
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
  Bell,
  Mail,
  Volume2,
  Zap,
  Globe,
} from 'lucide-react';
import { auth } from '../../data/firebase';
import { getInitialTheme, triggerThemeToggle, type ThemeMode } from '../../utils/themeHelper';
import { logoutUserSession } from '../../utils/authConsent';
import { useCurrentUser } from '../../utils/currentUser';
import { logoutMainSession } from '../../data/mainAuth';
import { listConsultations, listMyCourses } from '../../data/consultasApi';
import logoUrl from '../../assets/Logo Clerkship.svg';
import NotificacionesCampana from './NotificacionesCampana';

/* ── Types ─────────────────────────────────────────────────── */
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

/* ── Helpers ────────────────────────────────────────────────── */
function getActiveSectionId(pathname: string): string {
  if (pathname.startsWith('/casos')) return 'casos';
  if (pathname.startsWith('/historial')) return 'historial';
  if (pathname.startsWith('/biblioteca')) return 'biblioteca';
  if (pathname.startsWith('/mis-cursos') || pathname.startsWith('/explorar')) return 'mis-cursos';
  return 'overview';
}

function isChildActive(childRoute: string, pathname: string, searchParams: URLSearchParams): boolean {
  const [baseRoute, query] = childRoute.split('?');
  const childParams = new URLSearchParams(query || '');

  const isBaseMatch =
    (baseRoute === '/dashboard' && (pathname === '/dashboard' || pathname === '/')) ||
    pathname === baseRoute;

  if (!isBaseMatch) return false;

  if (query) {
    for (const [key, value] of childParams.entries()) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  }

  if (baseRoute === '/casos') {
    return !searchParams.get('tab') && !searchParams.get('nuevo');
  }
  if (baseRoute === '/biblioteca') {
    return !searchParams.get('modulo');
  }
  if (baseRoute === '/historial') {
    return !searchParams.get('tab');
  }

  return true;
}

/* ════════════════════════════════════════════════════════════
   Sidebar — Contenedor Único Auto-Expansible
   ════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'clerkship_sb_expanded';

export default function Sidebar() {
  const navigate       = useNavigate();
  const { pathname }   = useLocation();
  const [searchParams] = useSearchParams();
  const currentUser    = useCurrentUser();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isExpanded, setIsExpandedRaw] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  });

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  // Mockup de preferencias — solo UI por ahora (no persisten ni llaman al
  // backend). Sirven para mostrar cómo quedaría el panel de Configuración
  // completo; cada una se conecta de verdad más adelante.
  const [mockLang, setMockLang] = useState<'es' | 'en'>('es');
  const [mockPushNotif, setMockPushNotif] = useState(true);
  const [mockEmailDigest, setMockEmailDigest] = useState(false);
  const [mockReduceMotion, setMockReduceMotion] = useState(false);
  const [mockSounds, setMockSounds] = useState(true);

  // Métricas reales para los badges (en curso, completados, cursos)
  const [counts, setCounts] = useState<{
    inProgress: number;
    completed: number;
    courses: number;
  }>({ inProgress: 0, completed: 0, courses: 0 });

  useEffect(() => {
    let cancelled = false;
    async function loadCounts() {
      try {
        const [consultasRes, cursosRes] = await Promise.allSettled([
          listConsultations(),
          listMyCourses(),
        ]);
        if (cancelled) return;
        let inProg = 0;
        let comp = 0;
        let crs = 0;
        if (consultasRes.status === 'fulfilled' && Array.isArray(consultasRes.value)) {
          inProg = consultasRes.value.filter(c => c.status === 'IN_PROGRESS').length;
          comp = consultasRes.value.filter(c => c.status === 'COMPLETED').length;
        }
        if (cursosRes.status === 'fulfilled' && Array.isArray(cursosRes.value)) {
          crs = cursosRes.value.length;
        }
        setCounts({ inProgress: inProg, completed: comp, courses: crs });
      } catch {
        // Silencioso
      }
    }
    loadCounts();
    return () => { cancelled = true; };
  }, [pathname]);

  // Secciones expandidas tipo árbol
  const currentSectionId = getActiveSectionId(pathname);
  const [activeId, setActiveId] = useState(currentSectionId);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {
      casos: true,
      overview: true,
      historial: false,
      biblioteca: false,
      'mis-cursos': false,
    };
    init[currentSectionId] = true;
    return init;
  });

  // Sincronizar ruta activa y sección correspondiente
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

  function handleToggleTheme() {
    const next = triggerThemeToggle(theme);
    setTheme(next);
  }

  /** Contenido del popover de Configuración. Sin cabecera ni acciones de
   * cuenta (ya están en el menú de perfil, al lado) — solo las
   * preferencias propias, compactas y sin scroll. Son mockup (useState
   * local, no persiste) hasta que se conecten a un endpoint de verdad. */
  function renderSettingsBody() {
    return (
      <div className="sb-settings-card-scroll">
        <div className="sb-settings-section">
          <span className="sb-settings-group-title">Idioma</span>
          <div className="sb-theme-pill-group">
            <button
              type="button"
              className={`sb-theme-pill ${mockLang === 'es' ? 'is-active' : ''}`}
              onClick={() => setMockLang('es')}
            >
              <Globe size={13} /> Español
            </button>
            <button
              type="button"
              className={`sb-theme-pill ${mockLang === 'en' ? 'is-active' : ''}`}
              onClick={() => setMockLang('en')}
            >
              <Globe size={13} /> English
            </button>
          </div>
        </div>

        <div className="sb-settings-divider" />

        <div className="sb-settings-section">
          <span className="sb-settings-group-title">Notificaciones</span>
          <button type="button" className="sb-settings-row" onClick={() => setMockPushNotif(v => !v)}>
            <span className="sb-settings-row-label"><Bell size={14} /> Notificaciones push</span>
            <span className={`sb-switch ${mockPushNotif ? 'is-on' : ''}`} />
          </button>
          <button type="button" className="sb-settings-row" onClick={() => setMockEmailDigest(v => !v)}>
            <span className="sb-settings-row-label"><Mail size={14} /> Resumen semanal</span>
            <span className={`sb-switch ${mockEmailDigest ? 'is-on' : ''}`} />
          </button>
        </div>

        <div className="sb-settings-divider" />

        <div className="sb-settings-section">
          <span className="sb-settings-group-title">Accesibilidad & Interfaz</span>
          <button type="button" className="sb-settings-row" onClick={() => setMockReduceMotion(v => !v)}>
            <span className="sb-settings-row-label"><Zap size={14} /> Reducir movimiento</span>
            <span className={`sb-switch ${mockReduceMotion ? 'is-on' : ''}`} />
          </button>
          <button type="button" className="sb-settings-row" onClick={() => setMockSounds(v => !v)}>
            <span className="sb-settings-row-label"><Volume2 size={14} /> Efectos de sonido</span>
            <span className={`sb-switch ${mockSounds ? 'is-on' : ''}`} />
          </button>
        </div>
      </div>
    );
  }

  function setIsExpanded(value: boolean | ((prev: boolean) => boolean)) {
    setIsExpandedRaw(prev => {
      const next = typeof value === 'function' ? value(prev) : value;
      localStorage.setItem(STORAGE_KEY, String(next));
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

  /* Cerrar dropdowns al hacer clic fuera */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    if (profileOpen || settingsOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen, settingsOpen]);

  // Definición completa de las secciones reales del sistema
  const treeSections: TreeSection[] = useMemo(() => [
    {
      id: 'overview',
      label: 'Dashboard',
      Icon: LayoutGrid,
      route: '/dashboard',
      children: [
        { label: 'Vista general', route: '/dashboard' },
        { label: 'Documentos clínicos', route: '/dashboard' },
      ],
    },
    {
      id: 'casos',
      label: 'Casos clínicos',
      Icon: Briefcase,
      route: '/casos',
      children: [
        { label: 'Todos los casos', route: '/casos' },
        {
          label: 'En curso',
          route: '/casos?tab=IN_PROGRESS',
          badge: counts.inProgress > 0 ? counts.inProgress : undefined,
          badgeType: 'orange',
        },
        {
          label: 'Completados',
          route: '/casos?tab=COMPLETED',
          badge: counts.completed > 0 ? counts.completed : undefined,
          badgeType: 'green',
        },
        { label: 'Nuevo caso', route: '/casos?nuevo=1' },
      ],
    },
    {
      id: 'historial',
      label: 'Historial',
      Icon: Clock,
      route: '/historial',
      children: [
        { label: 'Sesiones clínicas', route: '/historial' },
        { label: 'Evaluaciones de IA', route: '/historial' },
      ],
    },
    {
      id: 'biblioteca',
      label: 'Biblioteca',
      Icon: Library,
      route: '/biblioteca',
      children: [
        { label: 'Todos los recursos', route: '/biblioteca' },
        { label: 'Guías clínicas', route: '/biblioteca?modulo=guias' },
      ],
    },
    {
      id: 'mis-cursos',
      label: 'Mis cursos',
      Icon: GraduationCap,
      route: '/mis-cursos',
      children: [
        {
          label: 'Cursos matriculados',
          route: '/mis-cursos',
          badge: counts.courses > 0 ? counts.courses : undefined,
          badgeType: 'blue',
        },
        { label: 'Explorar catálogo', route: '/explorar' },
      ],
    },
  ], [counts]);

  function handleParentClick(section: TreeSection) {
    if (section.children && section.children.length > 0) {
      setExpandedSections(prev => ({
        ...prev,
        [section.id]: !prev[section.id],
      }));
    }
    setActiveId(section.id);
    if (section.route !== pathname) {
      navigate(section.route);
    }
  }

  return (
    <>
      {/* ── Barra Superior Móvil y Hamburguesa (Pantallas <= 1024px) ── */}
      <header className="sb-mobile-header-bar">
        <div
          className="sb-mobile-brand"
          onClick={() => navigate('/dashboard')}
          role="button"
          tabIndex={0}
        >
          <img src={logoUrl} alt="Clerkship" className="sb-mobile-logo" />
          <span className="sb-mobile-title">Clerkship</span>
        </div>
        <NotificacionesCampana className="noti-campana-movil" />
        <button
          type="button"
          className="sb-mobile-toggle-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú de navegación"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* ── Drawer y Backdrop Móvil ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="sb-mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="sb-mobile-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            >
              <div className="sb-mobile-drawer-header">
                <div
                  className="sb-mobile-brand"
                  onClick={() => {
                    navigate('/dashboard');
                    setMobileOpen(false);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <img src={logoUrl} alt="Clerkship" className="sb-mobile-logo" />
                  <span className="sb-mobile-title">Clerkship</span>
                </div>
                <button
                  type="button"
                  className="sb-mobile-close-btn"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Cerrar menú"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="sb-mobile-drawer-body">
                <nav className="sb-mobile-nav-list">
                  {treeSections.map(({ id, label, Icon, route }) => {
                    const active = (pathname === route) || (route === '/dashboard' && pathname === '/');
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`sb-mobile-nav-item ${active ? 'active' : ''}`}
                        onClick={() => {
                          if (route) navigate(route);
                          setMobileOpen(false);
                        }}
                      >
                        <Icon size={20} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </nav>

                <div className="sb-mobile-user-section">
                  <div className="sb-mobile-divider" />
                  {currentUser && (
                    <div className="sb-mobile-user-row">
                      {currentUser.avatarUrl ? (
                        <img src={currentUser.avatarUrl} alt={currentUser.name} className="sb-mobile-user-avatar" />
                      ) : (
                        <div className="sb-mobile-user-avatar-text">
                          {currentUser.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="sb-mobile-user-info">
                        <p className="sb-mobile-user-name">{currentUser.name}</p>
                        <p className="sb-mobile-user-role">{currentUser.role || 'Estudiante'}</p>
                      </div>
                    </div>
                  )}

                  <div className="sb-mobile-actions-row">
                    <button
                      type="button"
                      className="sb-mobile-action-btn"
                      onClick={handleToggleTheme}
                    >
                      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                      <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</span>
                    </button>

                    <button
                      type="button"
                      className="sb-mobile-action-btn danger"
                      onClick={handleLogout}
                    >
                      <LogOut size={16} />
                      <span>Cerrar sesión</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Desktop: UN SOLO CONTENEDOR AUTO-EXPANSIBLE (Despliegue Físico) ── */}
      <motion.aside
        className={`sb ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
        animate={{ width: isExpanded ? 260 : 68 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
        title={!isExpanded ? 'Doble clic o clic en espacio vacío para desplegar' : undefined}
        onDoubleClick={() => setIsExpanded(prev => !prev)}
        onClick={(e) => {
          // Solo se despliega al hacer clic en el espacio vacío (no sobre botones interactivos)
          if (!isExpanded && !(e.target as HTMLElement).closest('button, a, input, select')) {
            setIsExpanded(true);
          }
        }}
      >
        {/* 1. Cabecera */}
        <div className="sb-head">
          {!isExpanded ? (
            <button
              className="sb-logo-btn"
              onClick={() => {
                navigate('/dashboard');
              }}
              title="Clerkship - Doble clic para desplegar"
            >
              <img src={logoUrl} alt="Clerkship" />
            </button>
          ) : (
            <div className="sb-head-expanded">
              <div
                className="sb-head-brand"
                onClick={() => navigate('/dashboard')}
                role="button"
                tabIndex={0}
              >
                <img src={logoUrl} alt="Clerkship" className="sb-head-logo" />
                <div className="sb-head-titles">
                  <span className="sb-head-name">Clerkship</span>
                  <span className="sb-head-badge">CLÍNICO</span>
                </div>
              </div>
              <NotificacionesCampana />
              <button
                type="button"
                className="sb-collapse-btn"
                onClick={() => setIsExpanded(false)}
                title="Colapsar menú lateral"
                aria-label="Colapsar menú lateral"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          )}
        </div>

        {/* 2. Cuerpo de Navegación Unificado (Sin desvanecimiento, Despliegue Físico) */}
        <div className="sb-body">
          <div className="sb-tree-nav">
            {treeSections.map((section) => {
              const isSecExpanded = !!expandedSections[section.id];
              const hasChildren = !!section.children && section.children.length > 0;
              const isSectionActive = activeId === section.id;

              return (
                <div key={section.id} className="sb-tree-parent">
                  {/* Fila del Padre */}
                  <button
                    type="button"
                    className={`sb-tree-parent-btn${isSectionActive ? ' sb-tree-parent-btn-active' : ''}`}
                    title={!isExpanded ? section.label : undefined}
                    onClick={() => {
                      if (!isExpanded) {
                        // 🔒 En modo colapsado: NO se despliega automáticamente. Solo navega y activa el distintivo!
                        setActiveId(section.id);
                        setExpandedSections(prev => ({ ...prev, [section.id]: true }));
                        if (section.route !== pathname) {
                          navigate(section.route);
                        }
                      } else {
                        // 🔓 En modo extendido: colapsa/expande ramas y navega
                        handleParentClick(section);
                      }
                    }}
                  >
                    <div className="sb-tree-parent-left">
                      <span className="sb-tree-parent-icon">
                        <section.Icon size={19} strokeWidth={isSectionActive ? 2.2 : 1.75} />
                      </span>
                      <span className="sb-tree-parent-label">{section.label}</span>
                    </div>

                    {hasChildren && isExpanded && (
                      <motion.span
                        className="sb-tree-chevron"
                        animate={{ rotate: isSecExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedSections(prev => ({
                            ...prev,
                            [section.id]: !prev[section.id],
                          }));
                        }}
                      >
                        <ChevronDown size={15} strokeWidth={2} />
                      </motion.span>
                    )}
                  </button>

                  {/* Rama con Sub-ítems en Árbol (visible cuando está extendido) */}
                  <AnimatePresence initial={false}>
                    {isExpanded && hasChildren && isSecExpanded && (
                      <motion.div
                        className="sb-tree-branch"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        style={{ overflow: 'hidden' }}
                      >
                        {section.children!.map((child) => {
                          const active = isChildActive(child.route, pathname, searchParams);

                          return (
                            <button
                              key={child.label}
                              type="button"
                              className={`sb-tree-child-btn${active ? ' active' : ''}`}
                              onClick={() => navigate(child.route)}
                            >
                              <span className="sb-tree-child-label">{child.label}</span>
                              {child.badge !== undefined && (
                                <span className={`sb-tree-badge sb-tree-badge-${child.badgeType || 'orange'}`}>
                                  {child.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Pie de Barra */}
        <div className="sb-foot">
          {!isExpanded ? (
            <div className="sb-foot-collapsed">
              {/* Botón directo de tema */}
              <motion.button
                whileTap={{ scale: 0.80, rotate: 180 }}
                whileHover={{ scale: 1.08 }}
                className="sb-icon-btn"
                title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
                onClick={handleToggleTheme}
              >
                {theme === 'dark' ? (
                  <Sun size={19} strokeWidth={1.8} className="sb-sun-icon" />
                ) : (
                  <Moon size={19} strokeWidth={1.8} className="sb-moon-icon" />
                )}
              </motion.button>

              {/* Configuración Popover */}
              <div className="sb-settings-wrap" ref={settingsRef}>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  whileHover={{ scale: 1.08 }}
                  className={`sb-foot-settings-btn${settingsOpen ? ' active' : ''}`}
                  title="Opciones y Configuración"
                  aria-label="Opciones y Configuración"
                  onClick={() => setSettingsOpen(v => !v)}
                >
                  <Settings size={18} strokeWidth={1.8} />
                </motion.button>

                <AnimatePresence>
                  {settingsOpen && (
                    <motion.div
                      className="sb-profile-menu sb-settings-popover"
                      initial={{ opacity: 0, x: -8, scale: 0.96 }}
                      animate={{ opacity: 1, x: 0,  scale: 1    }}
                      exit={{    opacity: 0, x: -8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                    >
                      {renderSettingsBody()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Avatar de Usuario */}
              <div className="sb-profile-wrap" ref={profileRef}>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  whileHover={{ scale: 1.08 }}
                  className={`sb-avatar-btn${profileOpen ? ' sb-avatar-btn-open' : ''}`}
                  onClick={() => setProfileOpen(v => !v)}
                  title={currentUser?.name || 'Perfil'}
                >
                  {currentUser?.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.name} className="sb-avatar-btn-img" />
                  ) : (
                    '··'
                  )}
                </motion.button>

                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      className="sb-profile-menu"
                      initial={{ opacity: 0, x: -8, scale: 0.96 }}
                      animate={{ opacity: 1, x: 0,  scale: 1    }}
                      exit={{    opacity: 0, x: -8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="sb-profile-head">
                        <div className="sb-profile-avatar sb-profile-avatar-img-wrap">
                          {currentUser ? (
                            <img src={currentUser.avatarUrl} alt={currentUser.name} className="sb-profile-avatar-img" />
                          ) : (
                            '··'
                          )}
                        </div>
                        <div>
                          <p className="sb-profile-name">{currentUser?.name || 'Invitado'}</p>
                          <p className="sb-profile-role">{currentUser?.role || 'Sin sesión activa'}</p>
                        </div>
                      </div>
                      <div className="sb-profile-divider" />
                      <button
                        className="sb-profile-item"
                        onClick={() => {
                          setProfileOpen(false);
                          navigate('/dashboard');
                        }}
                      >
                        <User size={14} strokeWidth={1.8} /> Mi perfil
                      </button>
                      <button
                        className="sb-profile-item"
                        onClick={() => {
                          setProfileOpen(false);
                          setSettingsOpen(true);
                        }}
                      >
                        <Settings size={14} strokeWidth={1.8} /> Configuración
                      </button>
                      <button className="sb-profile-item" onClick={handleToggleTheme}>
                        {theme === 'dark' ? <Sun size={14} strokeWidth={1.8} /> : <Moon size={14} strokeWidth={1.8} />}
                        Modo {theme === 'dark' ? 'Claro' : 'Oscuro'}
                      </button>
                      <div className="sb-profile-divider" />
                      <button
                        className="sb-profile-item sb-profile-item-danger"
                        onClick={handleLogout}
                      >
                        <LogOut size={14} strokeWidth={1.8} /> Cerrar sesión
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="sb-foot-expanded">
              <div className="sb-foot-actions">
                <button
                  type="button"
                  className="sb-foot-theme-btn"
                  onClick={handleToggleTheme}
                  title="Alternar modo de pantalla"
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                  <span>Modo {theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
                </button>

                <div className="sb-settings-wrap" ref={settingsRef}>
                  <button
                    type="button"
                    className={`sb-foot-settings-btn${settingsOpen ? ' active' : ''}`}
                    onClick={() => setSettingsOpen(v => !v)}
                    title="Opciones y Configuración"
                    aria-label="Opciones y Configuración"
                  >
                    <Settings size={17} strokeWidth={1.8} />
                  </button>

                  <AnimatePresence>
                    {settingsOpen && (
                      <motion.div
                        className="sb-profile-menu sb-settings-popover"
                        initial={{ opacity: 0, x: -8, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0,  scale: 1    }}
                        exit={{    opacity: 0, x: -8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                      >
                        {renderSettingsBody()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Fila de usuario expandida */}
              <div className="sb-foot-user-row">
                <div
                  className="sb-foot-user-info"
                  onClick={() => navigate('/dashboard')}
                  role="button"
                  tabIndex={0}
                  title="Ver perfil"
                >
                  {currentUser?.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.name} className="sb-foot-avatar-img" />
                  ) : (
                    <div className="sb-foot-avatar-fallback">
                      {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <div className="sb-foot-user-text">
                    <p className="sb-foot-user-name">{currentUser?.name || 'Estudiante'}</p>
                    <p className="sb-foot-user-role">{currentUser?.role || 'Clínico'}</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="sb-foot-logout-btn"
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                >
                  <LogOut size={16} strokeWidth={1.8} />
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}
