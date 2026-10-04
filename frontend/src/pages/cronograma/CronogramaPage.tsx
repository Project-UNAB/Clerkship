import InteractiveBackgroundCanvas from '../../components/shared/InteractiveBackgroundCanvas';
import HeaderNav from '../../components/shared/HeaderNav';
import CronogramaTab from '../desarrollo/CronogramaTab';
import '../../styles/landing.css';
import '../../styles/desarrollo.css';

export default function CronogramaPage() {
  return (
    <div
      className="lp-root proy-web-root crono-page-root"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <InteractiveBackgroundCanvas />

      {/* Header Nav */}
      <HeaderNav activeTab="cronograma" />

      {/* Contenido Principal — 100% Responsivo Estilo App Móvil */}
      <main className="crono-page-main">
        <div className="crono-page-container">
          <CronogramaTab />
        </div>
      </main>
    </div>
  );
}
