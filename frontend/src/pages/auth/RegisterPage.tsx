import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Lock, Eye, EyeOff, User, Hash, GraduationCap, Stethoscope,
  AlertCircle, ArrowLeft, ArrowRight,
} from 'lucide-react';
import logoUrl from '../../assets/Logo Clerkship.svg';
import InteractiveBackgroundCanvas from '../../components/shared/InteractiveBackgroundCanvas';
import ThemeToggleFloating from '../../components/shared/ThemeToggleFloating';
import { setActiveUser, hasUserAcceptedConsent } from '../../utils/authConsent';
import { registerUser, mainAuthErrorMessage } from '../../data/mainAuth';
import VerifyEmailStep from '../../components/auth/VerifyEmailStep';
import AvatarPickerStep from '../../components/auth/AvatarPickerStep';
import '../../styles/landing.css';
import '../../styles/auth.css';

/* ── Tipos ─────────────────────────────────────────────── */
type Role = 'STUDENT' | 'TEACHER';

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: Role;
  studentCode: string;
}
interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  studentCode?: string;
  general?: string;
}

/* ── Validación ────────────────────────────────────────── */
function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!form.firstName.trim())
    errors.firstName = 'El nombre es requerido.';
  if (!form.lastName.trim())
    errors.lastName = 'El apellido es requerido.';
  if (!form.email.trim())
    errors.email = 'El correo es requerido.';
  else if (!emailRx.test(form.email))
    errors.email = 'Ingresa un correo electrónico válido.';
  if (!form.password)
    errors.password = 'La contraseña es requerida.';
  else if (form.password.length < 8)
    errors.password = 'Mínimo 8 caracteres.';
  if (form.role === 'STUDENT') {
    const code = form.studentCode.trim();
    if (!code)
      errors.studentCode = 'Tu código de estudiante es requerido.';
    else if (!/^U00/i.test(code))
      errors.studentCode = 'El código debe empezar con "U00" (ej. U00123456).';
  }
  return errors;
}

/* ══════════════════════════════════════════════════════════
   RegisterPage
══════════════════════════════════════════════════════════ */
export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'STUDENT',
    studentCode: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  /* form: datos básicos → verify: confirmar correo (obligatorio, el backend
     no deja loguear sin esto) → avatar: elegir/crear con DiceBear → success:
     la animación de salida de siempre hacia /dashboard o /consent. */
  const [step, setStep] = useState<'form' | 'verify' | 'avatar' | 'success'>('form');

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors])
      setErrors(prev => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setLoading(true);
    setErrors({});

    try {
      await registerUser({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        ...(form.role === 'STUDENT' ? { student_code: form.studentCode.trim() } : {}),
      });
      setActiveUser(form.email);
      setStep('verify');
    } catch (err) {
      setErrors({ general: mainAuthErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  function handleExitComplete() {
    const hasConsent = hasUserAcceptedConsent(form.email);
    setTimeout(() => {
      if (hasConsent) {
        sessionStorage.setItem('clerkship_show_welcome', 'true');
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/consent', { replace: true });
      }
    }, 2600);
  }

  return (
    <div className="lp-root proy-web-root auth-page-root">
      <ThemeToggleFloating />
      {/* Fondo interactivo animado con puntos conectados (mismo del Home) */}
      <InteractiveBackgroundCanvas />

      {/* ── Cuerpo centrado ─────────────────────────────────────── */}
      <div className="auth-body">
        <AnimatePresence onExitComplete={handleExitComplete}>
          {step !== 'success' && (
            <motion.div
              className="auth-card auth-card-glass"
              key="register-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.88,
                y: -32,
                filter: 'blur(12px)',
                transition: { duration: 0.55, ease: [0.4, 0, 1, 1] },
              }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Logo centrado */}
              <Link to="/" className="auth-logo-center">
                <img src={logoUrl} alt="Clerkship" />
                Clerkship
              </Link>

              <AnimatePresence mode="wait">
                {step === 'verify' ? (
                  <motion.div
                    key="step-verify"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.25 }}
                  >
                    <VerifyEmailStep email={form.email} onVerified={() => setStep('avatar')} />
                  </motion.div>
                ) : step === 'avatar' ? (
                  <motion.div
                    key="step-avatar"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.25 }}
                  >
                    <AvatarPickerStep defaultSeed={form.email} onDone={() => setStep('success')} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="step-form"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.25 }}
                  >

              {/* Cabecera */}
              <div className="auth-card-head">
                <h1 className="auth-title">Crear Cuenta</h1>
                <p className="auth-subtitle">
                  Regístrate para empezar a utilizar el prototipo.
                </p>
              </div>

              {/* Formulario */}
              <form onSubmit={handleSubmit} className="auth-form" noValidate>

                {/* Rol */}
                <div className="auth-field">
                  <label className="auth-label">Soy</label>
                  <div className="auth-role-group">
                    <button
                      type="button"
                      className={`auth-role-btn ${form.role === 'STUDENT' ? 'active' : ''}`}
                      onClick={() => patch('role', 'STUDENT')}
                    >
                      <GraduationCap size={16} /> Estudiante
                    </button>
                    <button
                      type="button"
                      className={`auth-role-btn ${form.role === 'TEACHER' ? 'active' : ''}`}
                      onClick={() => patch('role', 'TEACHER')}
                    >
                      <Stethoscope size={16} /> Docente
                    </button>
                  </div>
                </div>

                {/* Nombre + Apellido */}
                <div className="auth-field-row">
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="auth-first-name">Nombre</label>
                    <div className={`auth-input-wrap${errors.firstName ? ' has-error' : ''}`}>
                      <User size={18} className="auth-input-icon" />
                      <input
                        id="auth-first-name"
                        type="text"
                        className="auth-input"
                        placeholder="Ana"
                        value={form.firstName}
                        onChange={e => patch('firstName', e.target.value)}
                        autoComplete="given-name"
                        autoFocus
                      />
                    </div>
                    <AnimatePresence>
                      {errors.firstName && (
                        <motion.p className="auth-field-error"
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        >
                          <AlertCircle size={14} />{errors.firstName}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label" htmlFor="auth-last-name">Apellido</label>
                    <div className={`auth-input-wrap${errors.lastName ? ' has-error' : ''}`}>
                      <User size={18} className="auth-input-icon" />
                      <input
                        id="auth-last-name"
                        type="text"
                        className="auth-input"
                        placeholder="Gómez"
                        value={form.lastName}
                        onChange={e => patch('lastName', e.target.value)}
                        autoComplete="family-name"
                      />
                    </div>
                    <AnimatePresence>
                      {errors.lastName && (
                        <motion.p className="auth-field-error"
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        >
                          <AlertCircle size={14} />{errors.lastName}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Código de estudiante (solo si role === STUDENT) */}
                <AnimatePresence>
                  {form.role === 'STUDENT' && (
                    <motion.div
                      className="auth-field"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="auth-label" htmlFor="auth-student-code">Código de estudiante</label>
                      <div className={`auth-input-wrap${errors.studentCode ? ' has-error' : ''}`}>
                        <Hash size={18} className="auth-input-icon" />
                        <input
                          id="auth-student-code"
                          type="text"
                          className="auth-input"
                          placeholder="Ej. U00123456"
                          value={form.studentCode}
                          onChange={e => patch('studentCode', e.target.value)}
                        />
                      </div>
                      <AnimatePresence>
                        {errors.studentCode && (
                          <motion.p className="auth-field-error"
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          >
                            <AlertCircle size={14} />{errors.studentCode}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className="auth-field">
                  <label className="auth-label" htmlFor="auth-email">
                    Correo institucional
                  </label>
                  <div className={`auth-input-wrap${errors.email ? ' has-error' : ''}`}>
                    <Mail size={18} className="auth-input-icon" />
                    <input
                      id="auth-email"
                      type="email"
                      className="auth-input"
                      placeholder="correo@institucion.edu.co"
                      value={form.email}
                      onChange={e => patch('email', e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <AnimatePresence>
                    {errors.email && (
                      <motion.p className="auth-field-error"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      >
                        <AlertCircle size={14} />{errors.email}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Contraseña */}
                <div className="auth-field">
                  <label className="auth-label" htmlFor="auth-password">
                    Contraseña
                  </label>
                  <div className={`auth-input-wrap${errors.password ? ' has-error' : ''}`}>
                    <Lock size={18} className="auth-input-icon" />
                    <input
                      id="auth-password"
                      type={showPass ? 'text' : 'password'}
                      className="auth-input"
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => patch('password', e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="auth-eye-btn"
                      onClick={() => setShowPass(v => !v)}
                      aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <AnimatePresence>
                    {errors.password && (
                      <motion.p className="auth-field-error"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      >
                        <AlertCircle size={14} />{errors.password}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Error general */}
                <AnimatePresence>
                  {errors.general && (
                    <motion.div
                      className="auth-general-error"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <AlertCircle size={18} />
                      {errors.general}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <motion.button
                  type="submit"
                  className="auth-submit"
                  disabled={loading}
                  whileTap={loading ? {} : { scale: 0.98 }}
                >
                  {loading ? (
                    <span className="auth-spinner" />
                  ) : (
                    <>
                      Crear cuenta <ArrowRight size={18} />
                    </>
                  )}
                </motion.button>
              </form>

              {/* Link a login */}
              <div style={{ marginBottom: 24, textAlign: 'center', fontSize: '0.9rem', color: 'var(--ink2)' }}>
                ¿Ya tienes cuenta?{' '}
                <Link to="/login" style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>
                  Inicia sesión
                </Link>
              </div>

              {/* Aviso de IA */}
              <div className="auth-ai-notice">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} color="var(--ink3)" />
                <p>
                  Este prototipo utiliza{' '}
                  <strong>Inteligencia Artificial generativa</strong>. Las respuestas
                  son producidas automáticamente y no constituyen diagnóstico médico.
                </p>
              </div>

              <Link to="/" className="auth-back-link">
                <ArrowLeft size={16} /> Volver al inicio
              </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
