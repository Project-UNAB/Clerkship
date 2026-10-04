import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings, LogOut, ChevronRight } from 'lucide-react';

const MENU_ITEMS = [
  {
    icon: User,
    label: 'Mi perfil',
    sub: 'Santiago Arias',
    action: 'profile',
  },
  {
    icon: Settings,
    label: 'Configuración',
    sub: 'Cuenta y preferencias',
    action: 'settings',
  },
] as const;

export default function ProfileBubble() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleAction = (action: string) => {
    setOpen(false);
    if (action === 'logout') {
      localStorage.removeItem('clerkship_consent');
      navigate('/');
    }
  };

  return (
    <div className="pb-wrap" ref={ref}>
      {/* Dropdown */}
      {open && (
        <div className="pb-menu">
          {/* Profile header */}
          <div className="pb-menu-head">
            <div className="pb-menu-avatar">SA</div>
            <div className="pb-menu-user">
              <span className="pb-menu-name">Santiago Arias</span>
              <span className="pb-menu-role">Estudiante de Medicina</span>
            </div>
          </div>

          <div className="pb-menu-divider" />

          {/* Items */}
          {MENU_ITEMS.map(({ icon: Icon, label, sub, action }) => (
            <button
              key={action}
              className="pb-menu-item"
              onClick={() => handleAction(action)}
            >
              <span className="pb-menu-item-ico">
                <Icon size={15} strokeWidth={1.8} />
              </span>
              <span className="pb-menu-item-text">
                <span className="pb-menu-item-label">{label}</span>
                <span className="pb-menu-item-sub">{sub}</span>
              </span>
              <ChevronRight size={13} className="pb-menu-item-arrow" />
            </button>
          ))}

          <div className="pb-menu-divider" />

          {/* Logout */}
          <button
            className="pb-menu-item pb-menu-item-danger"
            onClick={() => handleAction('logout')}
          >
            <span className="pb-menu-item-ico">
              <LogOut size={15} strokeWidth={1.8} />
            </span>
            <span className="pb-menu-item-text">
              <span className="pb-menu-item-label">Cerrar sesión</span>
            </span>
          </button>
        </div>
      )}

      {/* Trigger button */}
      <button
        className={`pb-btn${open ? ' pb-btn-open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-label="Menú de perfil"
      >
        <User size={18} strokeWidth={1.8} />
      </button>
    </div>
  );
}
