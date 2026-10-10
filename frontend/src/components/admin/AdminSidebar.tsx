import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Users,
  Bot,
  BookOpen,
  MessageSquare,
  HelpCircle,
  ShieldCheck,
  ArrowLeftRight,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronsUpDown,
} from 'lucide-react';
import logoUrl from '../../assets/Logo Clerkship.svg';
import { getInitialTheme, triggerThemeToggle, type ThemeMode } from '../../utils/themeHelper';

export type AdminTab = 'resumen' | 'usuarios' | 'comunidad' | 'biblioteca' | 'feedback' | 'validacion' | 'tokens';

interface AdminSidebarProps {
  currentTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  userEmail: string;
  onLogout: () => void;
}

interface NavItem {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  group: 'principal' | 'contenido' | 'auditoria';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: BarChart3, group: 'principal' },
  { id: 'usuarios', label: 'Usuarios', icon: Users, group: 'principal' },
  { id: 'tokens', label: 'Tokens de agentes', icon: Bot, group: 'principal' },
  { id: 'biblioteca', label: 'Biblioteca', icon: BookOpen, group: 'contenido' },
  { id: 'comunidad', label: 'Comunidad', icon: MessageSquare, group: 'contenido' },
  { id: 'feedback', label: 'Retroalimentación', icon: HelpCircle, group: 'auditoria' },
  { id: 'validacion', label: 'Validación expertos', icon: ShieldCheck, group: 'auditoria' },
];

export default function AdminSidebar({
  currentTab,
  onTabChange,
  userEmail,
  onLogout,
}: AdminSidebarProps) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('clerkship_admin_sb_collapsed') === 'true';
  });

  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<ThemeMode>;
      if (customEvent.detail) setTheme(customEvent.detail);
    };
    window.addEventListener('clerkship-theme-change', handleThemeChange);
    return () => window.removeEventListener('clerkship-theme-change', handleThemeChange);
  }, []);

  function toggleCollapse() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('clerkship_admin_sb_collapsed', String(next));
      return next;
    });
  }

  function handleThemeClick() {
    const next = triggerThemeToggle(theme);
    setTheme(next);
  }

  return (
    <aside className={`adm-mac-sidebar ${collapsed ? 'is-collapsed' : 'is-expanded'}`}>
      {/* ── 1. Controles Superiores estilo macOS (Puntos Rojo, Amarillo y Verde) ── */}
      <div className="adm-mac-top-bar">
        <div className="adm-mac-dots">
          <span className="adm-mac-dot red" title="Cerrar" />
          <span className="adm-mac-dot yellow" title="Minimizar" />
          <span className="adm-mac-dot green" title="Maximizar" />
        </div>

        {!collapsed && (
          <button
            type="button"
            className="adm-collapse-btn"
            onClick={toggleCollapse}
            title="Colapsar menú lateral"
            aria-label="Colapsar menú lateral"
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {/* ── 2. Encabezado de Marca: Logo Clerkship + Título ── */}
      <div className="adm-brand-header">
        <div className="adm-brand-logo-box" title="Clerkship — Plataforma de Simulación">
          <img src={logoUrl} alt="Logo Clerkship" className="adm-brand-logo-img" />
        </div>

        {!collapsed && (
          <div className="adm-brand-text-box">
            <div className="adm-brand-titles">
              <span className="adm-brand-title">Clerkship</span>
              <span className="adm-brand-subtitle">clerk-ship.online</span>
            </div>
            <button
              type="button"
              className="adm-brand-toggle-chevron"
              onClick={toggleCollapse}
              title="Alternar vista de barra lateral"
            >
              <ChevronsUpDown size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── 3. Botón de Conmutación Rápida (Switch) ── */}
      {!collapsed ? (
        <button
          type="button"
          className="adm-switch-view-btn"
          onClick={() => navigate('/dashboard')}
          title="Ir al simulador clínico de estudiantes y docentes"
        >
          <ArrowLeftRight size={14} className="adm-switch-icon" />
          <span>Volver al simulador</span>
        </button>
      ) : (
        <button
          type="button"
          className="adm-switch-view-icon-only"
          onClick={() => navigate('/dashboard')}
          title="Volver al simulador"
        >
          <ArrowLeftRight size={16} />
        </button>
      )}

      {/* ── 4. Navegación Principal con Iconos Reales y Nombres Exactos ── */}
      <nav className="adm-nav-menu">
        {/* Grupo Principal */}
        <div className="adm-nav-group">
          {!collapsed && <span className="adm-nav-group-title">Plataforma</span>}
          {NAV_ITEMS.filter(it => it.group === 'principal').map(it => {
            const Icon = it.icon;
            const isActive = currentTab === it.id;
            return (
              <button
                key={it.id}
                type="button"
                className={`adm-nav-item-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => onTabChange(it.id)}
                title={collapsed ? it.label : undefined}
              >
                <Icon size={18} strokeWidth={isActive ? 2.3 : 1.9} className="adm-nav-icon" />
                {!collapsed && <span className="adm-nav-item-label">{it.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Grupo de Recursos y Contenido */}
        <div className="adm-nav-group">
          {!collapsed && <span className="adm-nav-group-title">Contenido</span>}
          {NAV_ITEMS.filter(it => it.group === 'contenido').map(it => {
            const Icon = it.icon;
            const isActive = currentTab === it.id;
            return (
              <button
                key={it.id}
                type="button"
                className={`adm-nav-item-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => onTabChange(it.id)}
                title={collapsed ? it.label : undefined}
              >
                <Icon size={18} strokeWidth={isActive ? 2.3 : 1.9} className="adm-nav-icon" />
                {!collapsed && <span className="adm-nav-item-label">{it.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Grupo de Calidad y Validación */}
        <div className="adm-nav-group">
          {!collapsed && <span className="adm-nav-group-title">Evaluación</span>}
          {NAV_ITEMS.filter(it => it.group === 'auditoria').map(it => {
            const Icon = it.icon;
            const isActive = currentTab === it.id;
            return (
              <button
                key={it.id}
                type="button"
                className={`adm-nav-item-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => onTabChange(it.id)}
                title={collapsed ? it.label : undefined}
              >
                <Icon size={18} strokeWidth={isActive ? 2.3 : 1.9} className="adm-nav-icon" />
                {!collapsed && <span className="adm-nav-item-label">{it.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── 5. Pie del Sidebar: Tema, Perfil, Salir y Expandir ── */}
      <div className="adm-mac-footer">
        {/* Toggle de Modo Claro / Oscuro */}
        <button
          type="button"
          className="adm-footer-action-btn"
          onClick={handleThemeClick}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {theme === 'dark' ? (
            <Sun size={17} className="adm-footer-icon" />
          ) : (
            <Moon size={17} className="adm-footer-icon" />
          )}
          {!collapsed && (
            <span className="adm-footer-label">
              {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            </span>
          )}
        </button>

        {/* Cerrar Sesión */}
        <button
          type="button"
          className="adm-footer-action-btn logout"
          onClick={onLogout}
          title="Cerrar sesión de administrador"
        >
          <LogOut size={17} className="adm-footer-icon" />
          {!collapsed && <span className="adm-footer-label">Cerrar sesión</span>}
        </button>

        {/* Botón para expandir cuando está colapsado */}
        {collapsed && (
          <button
            type="button"
            className="adm-footer-action-btn expand"
            onClick={toggleCollapse}
            title="Expandir barra lateral"
          >
            <PanelLeftOpen size={17} className="adm-footer-icon" />
          </button>
        )}

        {/* Correo del usuario admin cuando está expandido */}
        {!collapsed && (
          <div className="adm-footer-user-info" title={userEmail}>
            <div className="adm-user-dot-online" />
            <span className="adm-user-email-text">{userEmail}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
