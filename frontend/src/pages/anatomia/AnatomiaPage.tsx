import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, TrendingUp, BookOpen, BarChart2, Clock,
  Bone, Brain, Dumbbell, User, Users, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AnatomyViewer, { type Gender, type Lang } from '../../components/viewer/AnatomyViewer';
import Sidebar from '../../components/shared/Sidebar';

/* ── Types ─────────────────────────────────────────────────── */
type SystemId = 'oseo' | 'nervioso' | 'muscular';

/* ── Systems ───────────────────────────────────────────────── */
const SYSTEMS: Record<SystemId, {
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  color: string;
  name: string;
  subtitle: string;
  desc: string;
  structures: string[];
  casesTotal: number;
  casesDone: number;
  trend: { label: string; score: number }[];
}> = {
  oseo: {
    label: 'Sistema Óseo', Icon: Bone, color: '#00B3F8',
    name: 'Sistema Óseo', subtitle: 'Esqueleto axial y apendicular',
    desc: 'Proporciona soporte estructural, protege los órganos vitales y actúa como reservorio mineral. Incluye 206 huesos en el adulto articulados mediante articulaciones sinoviales, cartilaginosas y fibrosas.',
    structures: ['Huesos largos', 'Articulaciones sinoviales', 'Periostio y endostio', 'Cartílago articular', 'Médula ósea'],
    casesTotal: 5, casesDone: 2,
    trend: [{ label: 'Sesión 1', score: 68 }, { label: 'Sesión 2', score: 79 }, { label: 'Sesión 3', score: 85 }],
  },
  nervioso: {
    label: 'Sistema Nervioso', Icon: Brain, color: '#6366F1',
    name: 'Sistema Nervioso', subtitle: 'Encéfalo, médula espinal y nervios periféricos',
    desc: 'Controla y coordina todas las funciones del organismo. Incluye el SNC (encéfalo y médula espinal) y el SNP (nervios craneales, espinales y sistema autónomo).',
    structures: ['Corteza cerebral', 'Médula espinal', 'Nervios craneales', 'Sistema autónomo', 'Plexos nerviosos'],
    casesTotal: 4, casesDone: 1,
    trend: [{ label: 'Sesión 1', score: 72 }, { label: 'Sesión 2', score: 81 }, { label: 'Sesión 3', score: 88 }],
  },
  muscular: {
    label: 'Sistema Muscular', Icon: Dumbbell, color: '#10B981',
    name: 'Sistema Muscular', subtitle: 'Musculatura esquelética, lisa y cardíaca',
    desc: 'Responsable del movimiento voluntario e involuntario, la postura y la termogénesis. Se divide en músculo esquelético estriado, músculo liso visceral y músculo cardíaco.',
    structures: ['Fibras musculares tipo I y II', 'Tendones y fascias', 'Unión neuromuscular', 'Sarcómero', 'Tejido conectivo'],
    casesTotal: 3, casesDone: 0,
    trend: [],
  },
};

const SYSTEM_IDS: SystemId[] = ['oseo', 'nervioso', 'muscular'];

/* ── Page ───────────────────────────────────────────────────── */
export default function AnatomiaPage() {
  const navigate = useNavigate();
  const [gender,       setGender]       = useState<Gender>('male');
  const [lang,         setLang]         = useState<Lang>('es');
  const [activeSystem, setActiveSystem] = useState<SystemId>('oseo');

  const sys = SYSTEMS[activeSystem];
  const progress = Math.round((sys.casesDone / sys.casesTotal) * 100);

  return (
    <div className="dash-root">

      <Sidebar />

      {/* ══════════════════ Body — 2 columns ══════════════════ */}
      <div className="dash-body dash-body-viewer">

        {/* ── Center: BioDigital iframe + floating controls ── */}
        <main className="dash-center dash-center-viewer">
          <AnatomyViewer gender={gender} lang={lang} />

          {/* Gender pills — top right */}
          <div className="dash-viewer-float dash-viewer-float-tr">
            <button
              className={`dash-gender-pill ${gender === 'male' ? 'dash-gender-pill-on' : ''}`}
              onClick={() => setGender('male')}
            >
              <User size={12} /> Masculino
            </button>
            <button
              className={`dash-gender-pill ${gender === 'female' ? 'dash-gender-pill-on' : ''}`}
              onClick={() => setGender('female')}
            >
              <Users size={12} /> Femenino
            </button>
          </div>

          {/* Language pills — bottom right */}
          <div className="dash-viewer-float dash-viewer-float-br">
            <button
              className={`dash-gender-pill ${lang === 'es' ? 'dash-gender-pill-on' : ''}`}
              onClick={() => setLang('es')}
            >
              🇪🇸 Español
            </button>
            <button
              className={`dash-gender-pill ${lang === 'en' ? 'dash-gender-pill-on' : ''}`}
              onClick={() => setLang('en')}
            >
              🇺🇸 English
            </button>
          </div>
        </main>

        {/* ── Right panel ── */}
        <aside className="dash-right dash-right-viewer">

          {/* System tabs */}
          <div className="dash-sys-tabs">
            {SYSTEM_IDS.map(id => {
              const { Icon, color, label } = SYSTEMS[id];
              const on = activeSystem === id;
              return (
                <button
                  key={id}
                  className={`dash-sys-tab ${on ? 'dash-sys-tab-on' : ''}`}
                  style={{ '--sc': color } as React.CSSProperties}
                  onClick={() => setActiveSystem(id)}
                >
                  <span className="dash-sys-tab-ico" style={{
                    background: on ? color : color + '18',
                    color: on ? '#fff' : color,
                  }}>
                    <Icon size={13} />
                  </span>
                  <span className="dash-sys-tab-label">{label.replace('Sistema ', '')}</span>
                </button>
              );
            })}
          </div>

          {/* Animated content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSystem}
              className="dash-right-content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              {/* Header */}
              <div className="dash-right-head" style={{ paddingTop: 0 }}>
                <div>
                  <p className="dash-right-sys" style={{ color: sys.color }}>{sys.name}</p>
                  <p className="dash-right-updated">{sys.subtitle}</p>
                </div>
                <div className="dash-sys-ico-lg" style={{ background: sys.color + '18', color: sys.color }}>
                  <sys.Icon size={18} />
                </div>
              </div>

              {/* Description */}
              <div className="dash-right-section">
                <div className="dash-section-label"><BookOpen size={13} /> Descripción</div>
                <p className="dash-right-case-desc">{sys.desc}</p>
              </div>

              {/* Structures */}
              <div className="dash-right-section">
                <div className="dash-section-label"><Zap size={13} /> Estructuras clave</div>
                <ul className="dash-struct-list">
                  {sys.structures.map(s => (
                    <li key={s} className="dash-struct-item">
                      <span className="dash-struct-dot" style={{ background: sys.color }} />{s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Progress */}
              <div className="dash-right-section">
                <div className="dash-section-label"><BarChart2 size={13} /> Progreso</div>
                <div className="dash-prog-row">
                  <div className="dash-prog-track">
                    <motion.div
                      className="dash-prog-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' as const, delay: 0.1 }}
                      style={{ background: sys.color }}
                    />
                  </div>
                  <span className="dash-prog-label">{sys.casesDone}/{sys.casesTotal}</span>
                </div>
              </div>

              {/* Trend */}
              {sys.trend.length > 0 ? (
                <div className="dash-right-section">
                  <div className="dash-section-label"><TrendingUp size={13} /> Evolución</div>
                  <div className="dash-score-bar-list">
                    {sys.trend.map(({ label, score }) => (
                      <div key={label} className="dash-score-bar-row">
                        <span className="dash-score-bar-lbl">{label}</span>
                        <div className="dash-score-bar-track">
                          <motion.div
                            className="dash-score-bar-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${score}%` }}
                            transition={{ duration: 0.7, ease: 'easeOut' as const, delay: 0.2 }}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <span className="dash-score-bar-num">{score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="dash-right-section">
                  <div className="dash-no-sessions">
                    <Clock size={18} strokeWidth={1.5} />
                    <p>Sin sesiones aún<br />en este sistema.</p>
                  </div>
                </div>
              )}

              {/* CTAs */}
              <div className="dash-right-ctas">
                <button className="dash-btn-primary" onClick={() => navigate('/simulacion')}>
                  <Play size={14} /> Iniciar simulación
                </button>
                <button className="dash-btn-ghost" onClick={() => navigate('/casos')}>
                  Ver casos del sistema
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </aside>

      </div>
    </div>
  );
}
