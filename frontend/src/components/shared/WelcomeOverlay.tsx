import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCurrentUser } from '../../utils/currentUser';

interface WelcomeOverlayProps {
  onComplete: () => void;
}

export default function WelcomeOverlay({ onComplete }: WelcomeOverlayProps) {
  const [phase, setPhase] = useState<'logo' | 'text' | 'fadeout'>('logo');
  const [msgIdx, setMsgIdx] = useState(0);

  const currentUser = useCurrentUser();
  // Nombre + primer apellido/segundo nombre (ej. "Santiago Steven"), no el
  // nombre completo con apellidos ni nada derivado del correo.
  const formattedName = currentUser?.name
    ? currentUser.name.trim().split(/\s+/).slice(0, 2).join(' ')
    : 'Doctor(a)';

  const WELCOME_PHRASES = [
    `Hola de vuelta, ¿cómo te ha ido hoy?`,
    `Cargando tu perfil clínico y preferencias...`,
    `¡Todo listo! Entrando al panel de control...`
  ];

  useEffect(() => {
    // 1. A los 750ms el logo vectorial concluye su entrada fluida y comienza la animación del texto
    const t1 = setTimeout(() => {
      setPhase('text');
    }, 750);

    // 2. Transición suave progresiva de las frases inferiores cada 1400ms
    let t2: ReturnType<typeof setInterval>;
    const tPhraseDelay = setTimeout(() => {
      t2 = setInterval(() => {
        setMsgIdx(prev => {
          if (prev < WELCOME_PHRASES.length - 1) return prev + 1;
          return prev;
        });
      }, 1400);
    }, 750);

    // 3. A los 4400ms se activa el desvanecimiento ultra-suave crossfade
    const t3 = setTimeout(() => {
      setPhase('fadeout');
    }, 4400);

    // 4. A los 5800ms concluye la transición cinematográfica y se entra 100% al Dashboard
    const t4 = setTimeout(() => {
      if (t2) clearInterval(t2);
      onComplete();
    }, 5800);

    return () => {
      clearTimeout(t1);
      clearTimeout(tPhraseDelay);
      if (t2) clearInterval(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  return (
    <div className={`welcome-overlay-layer${phase === 'fadeout' ? ' is-fading-out' : ''}`}>
      <div className="welcome-overlay-content">

        {/* ── Logo Vectorial Clerkship (Animación líquida y suave vector por vector) ── */}
        <motion.div
          className="welcome-logo-container"
          animate={phase !== 'logo' ? { y: -24 } : { y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg
            width="96"
            height="96"
            viewBox="0 0 600 600"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="welcome-svg-logo"
          >
            {/* Vector 1 — Arco Interno */}
            <motion.path
              d="M281 162.706C213.776 171.963 162 229.639 162 299.408C162 369.177 213.776 426.852 281 436.109V395.565C235.97 386.718 202 347.031 202 299.408C202 251.785 235.97 212.097 281 203.25V162.706Z"
              fill="currentColor"
              initial={{ opacity: 0, scale: 0.7, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Vector 2 — Arco Externo */}
            <motion.path
              d="M281 0C124.167 9.80161 0 140.105 0 299.408C0 458.712 124.167 589.014 281 598.815V558.723C146.277 548.992 40 436.612 40 299.408C40 162.204 146.277 49.8229 281 40.0928V0Z"
              fill="currentColor"
              initial={{ opacity: 0, scale: 0.7, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Vector 3 — Arco Intermedio */}
            <motion.path
              d="M281 81.7217C168.946 91.3515 81 185.359 81 299.908C81 414.457 168.946 508.464 281 518.094V477.908C191.074 468.42 121 392.349 121 299.908C121 207.467 191.074 131.395 281 121.907V81.7217Z"
              fill="currentColor"
              initial={{ opacity: 0, scale: 0.7, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Vector 4 — Barra Vertical 1 */}
            <motion.path
              d="M381 10.4707C361.456 5.20365 350.513 3.2851 331 0.990432V599.408H381V10.4707Z"
              fill="currentColor"
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: 0.55, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Vector 5 — Barra Vertical 2 */}
            <motion.path
              d="M490 67.2329C471.749 52.3211 460.342 45.7459 440 34.0101V599.408H490V67.2329Z"
              fill="currentColor"
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: 0.55, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Vector 6 — Barra Vertical 3 */}
            <motion.path
              d="M600 299.408C597.743 227.434 581.5 182.408 550 133.518V599.408H600V299.408Z"
              fill="currentColor"
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: 0.55, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
        </motion.div>

        {/* ── Mensajes de Bienvenida Personalizados con Entrada Ultra-Suave (Fade + Blur + Motion) ── */}
        <AnimatePresence>
          {phase !== 'logo' && (
            <motion.div
              className="welcome-text-container"
              initial={{ opacity: 0, y: 22, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="welcome-title">
                ¡Bienvenido de nuevo, <span className="welcome-name-highlight">{formattedName}</span>!
              </h2>

              <div className="welcome-phrase-box">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={msgIdx}
                    initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    className="welcome-phrase-text"
                  >
                    {WELCOME_PHRASES[msgIdx]}
                  </motion.p>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
