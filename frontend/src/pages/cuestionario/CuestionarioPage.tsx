import InteractiveBackgroundCanvas from '../../components/shared/InteractiveBackgroundCanvas';
import CuestionarioTab from '../desarrollo/CuestionarioTab';
import '../../styles/landing.css';
import '../../styles/desarrollo.css';

export default function CuestionarioPage() {
  return (
    <div
      className="lp-root"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#0B0F19',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <InteractiveBackgroundCanvas />

      {/* Contenido Principal Centrado en Pantalla Completa (SIN HEADER) */}
      <main
        className="cuestionario-page-main"
        style={{
          width: '100%',
          maxWidth: '1200px',
          padding: '40px 24px',
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CuestionarioTab />
      </main>
    </div>
  );
}
