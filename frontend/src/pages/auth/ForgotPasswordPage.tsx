import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Lock, Mail, KeyRound } from 'lucide-react';
import logoUrl from '../../assets/Logo Clerkship.svg';
import InteractiveBackgroundCanvas from '../../components/shared/InteractiveBackgroundCanvas';
import ThemeToggleFloating from '../../components/shared/ThemeToggleFloating';
import { requestPasswordReset, resetPassword, mainAuthErrorMessage } from '../../data/mainAuth';
import '../../styles/landing.css';
import '../../styles/auth.css';

type Step = 'email' | 'code' | 'done';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RX.test(email.trim())) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setInfo('Si el correo está registrado, te enviamos un código de 6 dígitos.');
      setStep('code');
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError('El código tiene 6 dígitos.');
      return;
    }
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase(), code.trim(), newPassword);
      setStep('done');
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lp-root proy-web-root auth-page-root">
      <ThemeToggleFloating />
      <InteractiveBackgroundCanvas />

      <div className="auth-body">
        <div className="auth-card auth-card-glass">
          <Link to="/" className="auth-logo-center">
            <img src={logoUrl} alt="Clerkship" />
            Clerkship
          </Link>

          {step === 'done' ? (
            <div className="auth-card-head">
              <CheckCircle size={40} />
              <h1 className="auth-title">Contraseña actualizada</h1>
              <p className="auth-subtitle">Ya puedes iniciar sesión con tu nueva contraseña.</p>
              <Link to="/login" className="auth-submit">
                Ir a iniciar sesión <ArrowRight size={18} />
              </Link>
            </div>
          ) : step === 'email' ? (
            <>
              <div className="auth-card-head">
                <h1 className="auth-title">Recuperar contraseña</h1>
                <p className="auth-subtitle">Escribe tu correo y te enviaremos un código para cambiarla.</p>
              </div>
              <form onSubmit={handleSendCode} className="auth-form" noValidate>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="fp-email">Correo electrónico</label>
                  <div className="auth-input-wrap">
                    <Mail size={18} className="auth-input-icon" />
                    <input id="fp-email" type="email" className="auth-input" autoComplete="email"
                      value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>
                {error && <div className="auth-general-error"><AlertCircle size={18} />{error}</div>}
                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Enviando…' : 'Enviar código'} <ArrowRight size={18} />
                </button>
              </form>
              <div className="auth-footer-links">
                <Link to="/login" className="auth-back"><ArrowLeft size={16} /> Volver a iniciar sesión</Link>
              </div>
            </>
          ) : (
            <>
              <div className="auth-card-head">
                <h1 className="auth-title">Escribe el código</h1>
                {info && <p className="auth-subtitle">{info}</p>}
              </div>
              <form onSubmit={handleReset} className="auth-form" noValidate>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="fp-code">Código de 6 dígitos</label>
                  <div className="auth-input-wrap">
                    <KeyRound size={18} className="auth-input-icon" />
                    <input id="fp-code" inputMode="numeric" maxLength={6} className="auth-input"
                      value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="fp-new">Nueva contraseña</label>
                  <div className="auth-input-wrap">
                    <Lock size={18} className="auth-input-icon" />
                    <input id="fp-new" type="password" className="auth-input" autoComplete="new-password"
                      value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="fp-confirm">Confirmar contraseña</label>
                  <div className="auth-input-wrap">
                    <Lock size={18} className="auth-input-icon" />
                    <input id="fp-confirm" type="password" className="auth-input" autoComplete="new-password"
                      value={confirm} onChange={e => setConfirm(e.target.value)} />
                  </div>
                </div>
                {error && <div className="auth-general-error"><AlertCircle size={18} />{error}</div>}
                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Guardando…' : 'Cambiar contraseña'} <ArrowRight size={18} />
                </button>
              </form>
              <div className="auth-footer-links">
                <button type="button" className="auth-back" onClick={() => { setStep('email'); setError(null); }}>
                  <ArrowLeft size={16} /> Reenviar o cambiar correo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
