import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import logoUrl from '../../assets/Logo Clerkship.svg';

interface Props {
  children: React.ReactNode;
  /** Label del link "volver" */
  backLabel?: string;
  /** Ruta a la que regresa (default '/') */
  backTo?: string;
}

export default function InnerLayout({
  children,
  backLabel = 'Volver al inicio',
  backTo = '/',
}: Props) {
  const navigate = useNavigate();

  return (
    <div className="auth-shell">
      <nav className="auth-nav">
        <a href="/" className="auth-logo">
          <img src={logoUrl} alt="Clerkship" className="auth-logo-img" />
          Clerkship
        </a>
        <button
          className="auth-back"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => navigate(backTo)}
        >
          <ArrowLeft size={15} />
          {backLabel}
        </button>
      </nav>

      <div className="inner-page">
        {children}
      </div>
    </div>
  );
}
