import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { getInitialTheme, setInstantTheme, triggerThemeToggle, type ThemeMode } from '../../utils/themeHelper';
import '../../styles/theme.css';

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/casos',
  '/biblioteca',
  '/simulacion',
  '/historial',
  '/chats',
  '/explorar',
  '/documentacion',
  '/cuestionario',
];

export default function ThemeToggleFloating() {
  const { pathname } = useLocation();
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  // Ocultar botón flotante si estamos en cualquier vista interna del Dashboard
  const isDashboardView = DASHBOARD_ROUTES.some(
    route => pathname === route || pathname.startsWith(route + '/')
  );

  useEffect(() => {
    // Aplicación instantánea inicial sin clase de animación
    setInstantTheme(theme);

    const handleThemeChange = (e: Event) => {
      const customEv = e as CustomEvent<ThemeMode>;
      if (customEv.detail) {
        setTheme(customEv.detail);
      }
    };

    window.addEventListener('clerkship-theme-change', handleThemeChange);
    return () => window.removeEventListener('clerkship-theme-change', handleThemeChange);
  }, []);

  const toggleTheme = () => {
    const next = triggerThemeToggle(theme);
    setTheme(next);
  };

  if (isDashboardView) {
    return null;
  }

  return (
    <button
      type="button"
      className="theme-toggle-floating-btn"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
      aria-label="Cambiar tema claro/oscuro"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {theme === 'dark' ? (
            <Sun size={24} style={{ color: '#FBBF24' }} />
          ) : (
            <Moon size={24} style={{ color: '#4F46E5' }} />
          )}
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
