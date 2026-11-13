/**
 * /informe/enlace/:token — abre un informe compartido por enlace. Con sesión
 * activa el acceso y lleva al informe; sin sesión guarda el destino y manda a
 * iniciar sesión, para volver aquí después.
 */
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Link2 } from 'lucide-react';
import { isAuthenticated } from '../../utils/authConsent';
import { abrirEnlaceInforme, guardarDestinoPendiente } from '../../data/informesApi';
import '../../styles/informe.css';

export default function EnlaceInformePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const autenticado = isAuthenticated();

  useEffect(() => {
    if (!autenticado || !token) return;
    abrirEnlaceInforme(token)
      .then(r => navigate(`/historial/${r.consultation_id}`, { replace: true }))
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo abrir el enlace.'));
  }, [autenticado, token, navigate]);

  if (!autenticado) {
    guardarDestinoPendiente(`/informe/enlace/${token}`);
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="inf-estado" style={{ minHeight: '100vh', flexDirection: 'column' }}>
      {error ? (
        <>
          <Link2 size={28} />
          <p>{error}</p>
          <button type="button" className="inf-btn-sec" onClick={() => navigate('/historial')}>Ir al historial</button>
        </>
      ) : (
        <><Loader2 size={24} className="sim-spin" /> Abriendo el informe compartido...</>
      )}
    </div>
  );
}
