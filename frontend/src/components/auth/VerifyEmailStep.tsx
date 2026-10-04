import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, AlertCircle, ArrowRight, RotateCw } from 'lucide-react';
import { verifyEmailCode, resendVerificationCode, mainAuthErrorMessage } from '../../data/mainAuth';

const RESEND_COOLDOWN_SECONDS = 30;

interface VerifyEmailStepProps {
  email: string;
  onVerified: () => void;
}

/**
 * Pantalla de "Confirmá tu correo" del registro — pide el código de 6
 * dígitos que se manda por Mailgun (o se imprime en la consola del backend
 * en modo simulado, mientras el dominio no esté verificado ahí, ver
 * app/mailer.py). Sin este paso no se puede seguir: el backend no deja
 * pasar el login de una cuenta sin verificar.
 */
export default function VerifyEmailStep({ email, onVerified }: VerifyEmailStepProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [justResent, setJustResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError('El código tiene 6 dígitos.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await verifyEmailCode(code);
      onVerified();
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    setJustResent(false);
    try {
      await resendVerificationCode();
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setJustResent(true);
      setTimeout(() => setJustResent(false), 4000);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <div className="auth-verify-icon">
        <Mail size={26} />
      </div>

      <div className="auth-card-head">
        <h1 className="auth-title">Confirmá tu correo</h1>
        <p className="auth-subtitle">
          Te mandamos un código de 6 dígitos a <strong>{email}</strong>. Vence en 10 minutos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-verify-code">Código de verificación</label>
          <input
            id="auth-verify-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="auth-code-input"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={e => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              if (error) setError(null);
            }}
            autoFocus
          />
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              className="auth-general-error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <AlertCircle size={18} />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          className="auth-submit"
          disabled={loading || code.length !== 6}
          whileTap={loading ? {} : { scale: 0.98 }}
        >
          {loading ? <span className="auth-spinner" /> : <>Verificar <ArrowRight size={18} /></>}
        </motion.button>
      </form>

      <div className="auth-resend-row">
        {justResent && <span className="auth-resend-ok">Código reenviado.</span>}
        <button
          type="button"
          className="auth-resend-btn"
          onClick={handleResend}
          disabled={resending || cooldown > 0}
        >
          <RotateCw size={14} className={resending ? 'auth-spin' : ''} />
          {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'}
        </button>
      </div>
    </>
  );
}
