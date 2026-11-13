import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Database, Shield, Scale,
  ChevronDown, CheckSquare, Square, AlertCircle, ArrowRight,
  CheckCircle2
} from 'lucide-react';
import logoUrl from '../../assets/Logo Clerkship.svg';
import DashboardPage from '../dashboard/DashboardPage';
import InteractiveBackgroundCanvas from '../../components/shared/InteractiveBackgroundCanvas';
import ThemeToggleFloating from '../../components/shared/ThemeToggleFloating';
import { recordUserConsent, VERSION_CONSENTIMIENTO } from '../../utils/authConsent';
import { registrarConsentimiento } from '../../data/consentimientoApi';
import { updateStoredUser } from '../../data/mainAuth';
import '../../styles/landing.css';

/* ── Datos ─────────────────────────────────────────────── */
interface ConsentSection {
  Icon: React.ComponentType<{ size?: number }>;
  title: string;
  content?: string;
  list?: string[];
  alert?: string;
}

const sections: ConsentSection[] = [
  {
    Icon: FileText,
    title: 'Propósito del prototipo',
    content:
      'Clerkship es un prototipo académico desarrollado como Proyecto de Grado en Ingeniería de Sistemas. Su objetivo es explorar el uso de tres agentes inteligentes basados en la API de Gemini (generador de casos, paciente virtual y evaluador) con reglas programadas —sin búsqueda vectorial ni entrenamiento de modelos— para apoyar el entrenamiento del razonamiento clínico-diagnóstico en estudiantes de ciencias de la salud, a través de la resolución guiada de casos clínicos simulados y la generación de retroalimentación formativa.\n\nEste sistema NO constituye una herramienta de diagnóstico médico, ni reemplaza la enseñanza clínica formal ni el criterio de un docente. Su uso está restringido al contexto académico del proyecto de investigación.',
  },
  {
    Icon: Database,
    title: 'Datos que se almacenan',
    list: [
      'Correo electrónico institucional (identificación de sesión)',
      'Fecha y hora de cada sesión de simulación completada',
      'Decisiones diagnósticas tomadas durante la simulación',
      'Hipótesis formuladas y pruebas clínicas solicitadas',
      'Puntajes obtenidos por dominio de razonamiento clínico',
      'Retroalimentación generada por el sistema de IA',
    ],
    alert:
      'No se almacenan datos clínicos reales de pacientes. Todos los casos son ficticios y generados por IA. Los datos recopilados serán usados únicamente con fines de evaluación académica del prototipo.',
  },
  {
    Icon: Shield,
    title: 'Sus derechos como titular (Ley 1581/2012)',
    content: 'De conformidad con la Ley 1581 de 2012 de Protección de Datos Personales, usted tiene derecho a:',
    list: [
      'Conocer, actualizar y rectificar sus datos personales en cualquier momento',
      'Solicitar la supresión de sus datos cuando lo estime pertinente',
      'Revocar la autorización otorgada para el tratamiento de sus datos',
      'Acceder de forma gratuita a sus datos que hayan sido objeto de tratamiento',
      'Presentar quejas ante la Superintendencia de Industria y Comercio',
    ],
  },
  {
    Icon: Scale,
    title: 'Marco normativo aplicable',
    content:
      '• Ley 1581 de 2012 - Protección de datos personales en Colombia\n• Decreto 1377 de 2013 - Consentimiento informado para tratamiento de datos\n• Resolución 8430 de 1993 del Min. Salud - Investigación sin riesgo (sin datos clínicos reales)\n• Política de propiedad intelectual de la institución educativa participante en el proyecto',
  },
];

const LOADING_MESSAGES = [
  'Creando tu perfil clínico y espacio de trabajo...',
  'Inicializando agentes de Inteligencia Artificial...',
  'Cargando casos del sistema gastrointestinal...',
  'Configurando motor de retroalimentación formativa...',
  'Optimizando tu panel de control y métricas...',
  '¡Casi listo! Preparando tu primer caso clínico...'
];

/* ══════════════════════════════════════════════════════════
   ConsentPage
══════════════════════════════════════════════════════════ */
export default function ConsentPage() {
  const navigate = useNavigate();
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [accepted, setAccepted] = useState(false);
  const [showError, setShowError] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  // Estados de la transición cinematográfica
  // 'idle' | 'loading' | 'success' | 'crossfade' | 'done'
  const [transitionPhase, setTransitionPhase] = useState<'idle' | 'loading' | 'success' | 'crossfade' | 'done'>('idle');
  const [msgIdx, setMsgIdx] = useState(0);

  // Tiempos configurables de la animación
  const PHRASE_INTERVAL = 1500;  // Cambiar frases cada 1.5s
  const SUCCESS_HOLD    = 1000;  // Permanencia de 1.0s para "¡Creado exitosamente!"
  const CROSSFADE_TIME  = 1800;  // Duración del desvanecimiento cinematográfico prolongado (1.8s)

  function toggleSection(i: number) {
    setOpenIdx(prev => (prev === i ? null : i));
  }

  async function handleAccept() {
    if (!accepted || guardando) {
      if (!accepted) setShowError(true);
      return;
    }
    setErrorServidor(null);
    setGuardando(true);

    try {
      // 1. Guardar en el servidor
      const updatedUser = await registrarConsentimiento(VERSION_CONSENTIMIENTO);

      // 2. Actualizar el usuario en sesión para que los guards de rutas lo reconozcan
      updateStoredUser(updatedUser);

      // 3. Respaldo en localStorage por compatibilidad con sesiones previas
      recordUserConsent(updatedUser.email);

      // 4. Iniciar animación de transición cinematográfica
      setTransitionPhase('loading');

      let step = 0;
      const msgInterval = setInterval(() => {
        step++;
        if (step < LOADING_MESSAGES.length) {
          setMsgIdx(step);
        }
      }, PHRASE_INTERVAL);

      setTimeout(() => {
        clearInterval(msgInterval);
        setTransitionPhase('success');

        setTimeout(() => {
          setTransitionPhase('crossfade');

          setTimeout(() => {
            setTransitionPhase('done');
            navigate('/dashboard', { replace: true });
          }, CROSSFADE_TIME + 50);
        }, SUCCESS_HOLD);
      }, 3000);
    } catch (err: any) {
      setGuardando(false);
      setErrorServidor(
        err?.message || 'No se pudo guardar el consentimiento en el servidor. Intente nuevamente.'
      );
    }
  }

  function handleReject() {
    localStorage.removeItem('clerkship_consent');
    navigate('/', { replace: true });
  }

  return (
    <div className="lp-root proy-web-root cp-shell">
      <ThemeToggleFloating />
      <InteractiveBackgroundCanvas />

      {/* ── Capa Inferior: Dashboard (Pre-cargado 100% en el DOM a opacity: 0 → 1) ── */}
      <div className={`crossfade-dashboard-layer${transitionPhase === 'crossfade' || transitionPhase === 'done' ? ' is-visible' : ''}`}>
        <DashboardPage />
      </div>

      {/* ── Formulario de Consentimiento y Navbar (Ocultos durante la carga) ──────── */}
      {transitionPhase === 'idle' && (
        <>
          {/* Navbar */}
          <nav className="cp-nav">
            <button className="cp-logo" onClick={() => navigate('/')}>
              <img src={logoUrl} alt="Clerkship" />
              Clerkship
            </button>
            <span className="cp-pill">
              <FileText size={12} />
              Consentimiento informado
            </span>
          </nav>

          {/* Cuerpo */}
          <div className="cp-body">
            <motion.div
              className="cp-wrap"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              {/* Header */}
              <div className="cp-header">
                <p className="cp-pretitle">Decreto 1377 de 2013 · Ley 1581 de 2012</p>
                <h1 className="cp-title">Autorización para tratamiento<br />de datos personales</h1>
                <p className="cp-meta">
                  Lea cada sección antes de aceptar. Este documento es requerido para
                  participar en el prototipo de investigación.
                </p>
              </div>

              {/* Acordeón */}
              <div className="cp-sections">
                {sections.map(({ Icon, title, content, list, alert }, i) => (
                  <div key={i} className="cp-section">
                    <button
                      className={`cp-sec-btn${openIdx === i ? ' open' : ''}`}
                      onClick={() => toggleSection(i)}
                      aria-expanded={openIdx === i}
                    >
                      <div className="cp-sec-left">
                        <div className="cp-sec-icon">
                          <Icon size={16} />
                        </div>
                        <span className="cp-sec-label">{title}</span>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`cp-chevron${openIdx === i ? ' open' : ''}`}
                      />
                    </button>

                    <AnimatePresence initial={false}>
                      {openIdx === i && (
                        <motion.div
                          className="cp-sec-body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.26, ease: 'easeInOut' }}
                        >
                          <div className="cp-content">
                            {content && <p className="cp-text">{content}</p>}
                            {list && (
                              <ul className="cp-list">
                                {list.map((item, j) => (
                                  <li key={j} className="cp-list-item">{item}</li>
                                ))}
                              </ul>
                            )}
                            {alert && (
                              <div className="cp-alert">
                                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>{alert}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* Zona de aceptación */}
              <div className="cp-accept">
                <div
                  className="cp-check-row"
                  onClick={() => { setAccepted(v => !v); setShowError(false); setErrorServidor(null); }}
                  role="checkbox"
                  aria-checked={accepted}
                  tabIndex={0}
                  onKeyDown={e => e.key === ' ' && setAccepted(v => !v)}
                >
                  <span className="cp-check-icon">
                    {accepted
                      ? <CheckSquare size={20} style={{ color: 'var(--ink)' }} />
                      : <Square size={20} style={{ color: showError ? '#ef4444' : 'var(--ink3)' }} />
                    }
                  </span>
                  <span className={`cp-check-text${showError && !accepted ? ' error' : ''}`}>
                    He leído y comprendido la información anterior. Autorizo el
                    tratamiento de mis datos personales con los propósitos y
                    condiciones descritos, conforme al Decreto 1377 de 2013 y la
                    Ley 1581 de 2012.
                  </span>
                </div>
                <AnimatePresence>
                  {showError && !accepted && (
                    <motion.p
                      className="cp-check-error"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <AlertCircle size={12} />
                      Debe aceptar los términos para continuar.
                    </motion.p>
                  )}
                  {errorServidor && (
                    <motion.div
                      className="cp-alert"
                      style={{ marginTop: '0.75rem', borderColor: '#ef4444', color: '#ef4444' }}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{errorServidor}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Acciones */}
              <div className="cp-actions">
                <motion.button
                  className="cp-btn-reject"
                  onClick={handleReject}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Rechazar y salir
                </motion.button>
                <motion.button
                  className={`cp-btn-accept${!accepted || guardando ? ' disabled' : ''}`}
                  onClick={handleAccept}
                  // Sin marcar la casilla el botón sigue respondiendo, para mostrar
                  // el aviso "Debe aceptar los términos"; solo se bloquea mientras guarda.
                  disabled={guardando}
                  whileHover={accepted && !guardando ? { scale: 1.02 } : {}}
                  whileTap={accepted && !guardando ? { scale: 0.97 } : {}}
                >
                  {guardando ? 'Guardando...' : (
                    <>
                      Aceptar y continuar
                      <ArrowRight size={15} />
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* ── Capa Superior: Loading Screen (Superpuesta a opacity: 1 → 0) ──────────── */}
      {transitionPhase !== 'idle' && transitionPhase !== 'done' && (
        <div className={`crossfade-loading-layer${transitionPhase === 'crossfade' ? ' is-fading-out' : ''}`}>
          <div className="cp-minimal-content">
            {/* Círculo que se transforma en chulo verde */}
            <div className="cp-minimal-circle-wrap">
              {transitionPhase === 'loading' ? (
                <motion.div
                  key="spinner"
                  className="cp-pure-spinner"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              ) : (
                <motion.div
                  key="check"
                  className="cp-finished-circle"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 16 }}
                >
                  <CheckCircle2 size={36} className="cp-finished-check-svg" />
                </motion.div>
              )}
            </div>

            {/* Frases dinámicas (1.5s) o mensaje de éxito */}
            {transitionPhase === 'loading' ? (
              <div className="cp-minimal-text-wrap">
                <h2 className="cp-minimal-title">
                  Dejando todo listo para que tengas la mejor experiencia...
                </h2>

                <div className="cp-phrase-box">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={msgIdx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                      className="cp-phrase-text"
                    >
                      {LOADING_MESSAGES[msgIdx]}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="cp-minimal-text-wrap"
              >
                <h2 className="cp-minimal-title success">¡Creado exitosamente!</h2>
                <p className="cp-phrase-text success">
                  Tu entorno agéntico de simulación está listo. Entrando al panel de control...
                </p>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
