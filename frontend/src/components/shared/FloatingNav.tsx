import { useNavigate, useLocation } from 'react-router-dom';
import { DASH_NAV } from '../../data/dashNav';
import ProfileBubble from './ProfileBubble';

export default function FloatingNav() {
  const navigate     = useNavigate();
  const { pathname } = useLocation();
  const activeId     = DASH_NAV.find(t => t.route === pathname)?.id ?? 'overview';

  return (
    <>
      {/* ── Profile bubble — top right ── */}
      <ProfileBubble />

      {/* ── Navigation pill — bottom center ── */}
      <nav className="fnav">
        {DASH_NAV.map(({ id, label, Icon, route }) => {
          const on = id === activeId;
          return (
            <button
              key={id}
              className={`fnav-item${on ? ' fnav-item-on' : ''}`}
              aria-label={label}
              onClick={() => route && navigate(route)}
            >
              <span className="fnav-ico">
                <Icon size={19} strokeWidth={on ? 2.2 : 1.65} />
              </span>
              {on && <span className="fnav-lbl">{label}</span>}
            </button>
          );
        })}
      </nav>
    </>
  );
}
