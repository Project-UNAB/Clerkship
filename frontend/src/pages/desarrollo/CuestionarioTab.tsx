import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Sparkles,
  PlusCircle,
  Bot,
  BrainCircuit,
  Server,
  Layout,
  Save,
  ChevronDown,
  Check,
  ShieldCheck,
  X,
  KeyRound,
  Pencil,
  UserCheck,
} from 'lucide-react';
import { TEAM_MEMBERS } from '../../data/teamData';
import type { TeamMember } from '../../data/teamData';
import { getPlaceholderCategoriesForMember } from '../../data/techPlaceholders';
import {
  readCuestionarioAnswers,
  saveCuestionarioAnswers,
  isMemberRegistered,
  markMemberRegistered,
} from '../../data/cuestionarioStore';
import {
  authenticateMember,
  authErrorMessage,
  isFirstLogin,
  setNewPassword,
  validateNewPassword,
} from '../../data/devAuth';
import PasswordInput from '../../components/shared/PasswordInput';
import NewPasswordFields from '../../components/shared/NewPasswordFields';

interface FormData {
  descripcion: string;
  placeholderAnswers: Record<string, string>;
  customOtro: string;
}

const EMPTY_FORM: FormData = {
  descripcion: '',
  placeholderAnswers: {},
  customOtro: '',
};

export default function CuestionarioTab() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [justSaved, setJustSaved] = useState(false);
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
  const [customEntryKey, setCustomEntryKey] = useState<string | null>(null);
  const [customEntryDraft, setCustomEntryDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Identifica si el perfil está registrando el cuestionario por PRIMERA VEZ
  const [isFirstTime, setIsFirstTime] = useState(false);

  // Modal de inicio de sesión de perfil
  const [pendingMember, setPendingMember] = useState<TeamMember | null>(null);
  const [authPhase, setAuthPhase] = useState<'password' | 'newPassword' | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [newPassword1, setNewPassword1] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Modal / Formulario para cambio de contraseña desde el Resumen (cuando YA están registrados)
  const [showChangePwdModal, setShowChangePwdModal] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew1, setPwdNew1] = useState('');
  const [pwdNew2, setPwdNew2] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const proceedAfterLogin = async (member: TeamMember) => {
    setSelectedMember(member);

    const registered = await isMemberRegistered(member.id);
    const saved = await readCuestionarioAnswers();
    const placeholderCategories = getPlaceholderCategoriesForMember(member.id);
    const initialAnswers: Record<string, string> = {};
    placeholderCategories.forEach((cat) => {
      cat.placeholders.forEach((ph) => {
        initialAnswers[ph.key] = saved[ph.key] || ph.defaultTech;
      });
    });

    setFormData({
      descripcion: saved[`${member.id}_descripcion`] || '',
      placeholderAnswers: initialAnswers,
      customOtro: saved[`${member.id}_customOtro`] || '',
    });
    setOpenDropdownKey(null);
    setCustomEntryKey(null);
    closeLoginModal();

    if (registered) {
      setIsFirstTime(false);
      setCurrentStep(4); // Ya registrado -> Muestra resumen con opciones de Editar y Cambiar Contraseña
    } else {
      setIsFirstTime(true);
      setCurrentStep(2); // Primera vez -> Formulario de tecnologías
    }
  };

  const handleCardClick = (member: TeamMember) => {
    setPendingMember(member);
    setAuthPhase('password');
    setLoginPassword('');
    setNewPassword1('');
    setNewPassword2('');
    setAuthError('');
  };

  const closeLoginModal = () => {
    setPendingMember(null);
    setAuthPhase(null);
    setLoginPassword('');
    setNewPassword1('');
    setNewPassword2('');
    setAuthError('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingMember) return;
    if (!loginPassword) {
      setAuthError('Ingresa tu contraseña.');
      return;
    }

    setAuthError('');
    setAuthSubmitting(true);
    try {
      const user = await authenticateMember(pendingMember.id, loginPassword);
      if (isFirstLogin(user)) {
        setAuthPhase('newPassword');
      } else {
        await proceedAfterLogin(pendingMember);
      }
    } catch (err) {
      setAuthError(authErrorMessage(err));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingMember) return;
    const validationError = validateNewPassword(newPassword1, newPassword2);
    if (validationError) {
      setAuthError(validationError);
      return;
    }

    setAuthError('');
    setAuthSubmitting(true);
    try {
      await setNewPassword(newPassword1);
      await proceedAfterLogin(pendingMember);
    } catch (err) {
      setAuthError(authErrorMessage(err));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePlaceholderChange = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      placeholderAnswers: { ...prev.placeholderAnswers, [key]: value },
    }));
    setOpenDropdownKey(null);
    setCustomEntryKey(null);
  };

  const openCustomEntry = (key: string, prefill: string) => {
    setCustomEntryDraft(prefill);
    setCustomEntryKey(key);
    setOpenDropdownKey(null);
  };

  const commitCustomEntry = (key: string) => {
    const value = customEntryDraft.trim();
    if (value) handlePlaceholderChange(key, value);
    setCustomEntryKey(null);
  };

  // Guardar Selección de Tecnologías (Paso 2)
  const handleTechSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep !== 2 || !selectedMember) return;

    setSaveError('');
    setSaving(true);
    try {
      const patch: Record<string, string> = {
        ...formData.placeholderAnswers,
      };
      if (formData.customOtro) {
        patch[`${selectedMember.id}_customOtro`] = formData.customOtro;
      }
      if (formData.descripcion) {
        patch[`${selectedMember.id}_descripcion`] = formData.descripcion;
      }

      await saveCuestionarioAnswers(patch);
      setJustSaved(true);

      if (isFirstTime) {
        // Primera vez: Ir a Paso 3 (Cambiar Contraseña antes de la confirmación)
        setCurrentStep(3);
      } else {
        // Ya registrado: Ir a Paso 4 (Resumen)
        await markMemberRegistered(selectedMember.id);
        setCurrentStep(4);
      }
    } catch {
      setSaveError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Guardar Contraseña en PRIMERA VEZ (Paso 3) -> Pide SOLO contraseña nueva
  const handleFirstTimePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;

    const validationError = validateNewPassword(newPassword1, newPassword2);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setSaveError('');
    setSaving(true);
    try {
      await setNewPassword(newPassword1);
      await markMemberRegistered(selectedMember.id);
      setIsFirstTime(false);
      setCurrentStep(4); // Pasar al Resumen Exitoso (Paso 4)
    } catch (err) {
      setSaveError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Guardar Cambio de Contraseña cuando YA REGISTRARON (Modal) -> PIDE CONTRASEÑA ACTUAL Y LUEGO NUEVA
  const handleSubsequentPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;

    if (!pwdCurrent) {
      setPwdError('Ingresa tu contraseña actual.');
      return;
    }
    const validationError = validateNewPassword(pwdNew1, pwdNew2);
    if (validationError) {
      setPwdError(validationError);
      return;
    }

    setPwdError('');
    setPwdSuccess('');
    setPwdSubmitting(true);
    try {
      // 1. Verificar contraseña actual autenticando al usuario
      await authenticateMember(selectedMember.id, pwdCurrent);
      // 2. Establecer la nueva contraseña
      await setNewPassword(pwdNew1);
      setPwdSuccess('¡Contraseña actualizada exitosamente!');
      setTimeout(() => {
        setShowChangePwdModal(false);
        setPwdCurrent('');
        setPwdNew1('');
        setPwdNew2('');
        setPwdSuccess('');
      }, 1600);
    } catch (err) {
      setPwdError(authErrorMessage(err));
    } finally {
      setPwdSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedMember(null);
    setCurrentStep(1);
    setJustSaved(false);
    setOpenDropdownKey(null);
    setSaveError('');
    setFormData(EMPTY_FORM);
  };

  const categoriesToDisplay = selectedMember ? getPlaceholderCategoriesForMember(selectedMember.id) : [];

  return (
    <div className="cuestionario-wizard-wrapper">
      {/* ── Step Content Animation ────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {/* ════════════════════════════════════════════════════════════
            PASO 1: SELECCIÓN DE PERFIL
            ════════════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="netflix-profile-section"
          >
            <h2 className="netflix-title">¿Quién está registrando?</h2>
            <p className="netflix-subtitle">
              Selecciona la mente detrás del proyecto para gestionar tus opciones técnicas.
            </p>

            <div className="netflix-profiles-grid">
              {TEAM_MEMBERS.map((m) => {
                const isSelected = selectedMember?.id === m.id;
                return (
                  <motion.div
                    key={m.id}
                    className={`netflix-profile-card ${isSelected ? 'selected' : ''}`}
                    whileHover={{ scale: 1.08, y: -6 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleCardClick(m)}
                  >
                    <div
                      className="netflix-avatar-wrapper"
                      style={{
                        borderColor: m.color,
                        boxShadow: `0 8px 30px ${m.color}35`,
                      }}
                    >
                      <img
                        src={m.avatarUrl}
                        alt={m.name}
                        className="netflix-avatar-img"
                      />
                    </div>

                    <h3 className="netflix-profile-name">{m.name}</h3>

                    <div
                      className="netflix-profile-role"
                      style={{
                        color: m.color,
                        borderColor: `${m.color}40`,
                        background: `${m.color}15`,
                      }}
                    >
                      {m.role.split('·')[0].trim()}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════
            PASO 2: SELECCIÓN DE TECNOLOGÍAS Y HERRAMIENTAS
            ════════════════════════════════════════════════════════════ */}
        {currentStep === 2 && selectedMember && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="form-step-container"
          >
            <div className="form-step-header">
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#FFF' }}>
                  Tecnologías y Herramientas
                </h3>
                <p style={{ fontSize: '13px', color: '#9CA3AF', margin: '4px 0 0 0' }}>
                  Selecciona qué estás usando o vas a usar en cada frente de tu área.
                </p>
              </div>

              {/* Active Profile Pill */}
              <div className="active-profile-pill">
                <img
                  src={selectedMember.avatarUrl}
                  alt={selectedMember.name}
                  className="active-profile-avatar"
                  style={{ borderColor: selectedMember.color }}
                />
                <div>
                  <div className="active-profile-name">{selectedMember.name}</div>
                  <span style={{ fontSize: '11px', color: selectedMember.color }}>
                    {selectedMember.initials}
                  </span>
                </div>
                <button
                  type="button"
                  className="change-profile-btn"
                  onClick={() => setCurrentStep(1)}
                >
                  Cambiar
                </button>
              </div>
            </div>

            <form onSubmit={handleTechSubmit}>
              {/* ── Tecnologías atadas al Cronograma ─── */}
              <div style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '0 0 14px 0' }}>
                  Cada selección llena el espacio en blanco correspondiente en el Cronograma de tu categoría.
                </p>

                {categoriesToDisplay.map((cat) => (
                  <div key={cat.catId} className="form-category-block">
                    <h4 className="category-header-title">
                      {cat.iconName === 'Bot' && <Bot size={18} style={{ color: selectedMember.color }} />}
                      {cat.iconName === 'BrainCircuit' && <BrainCircuit size={18} style={{ color: selectedMember.color }} />}
                      {cat.iconName === 'Server' && <Server size={18} style={{ color: selectedMember.color }} />}
                      {cat.iconName === 'Layout' && <Layout size={18} style={{ color: selectedMember.color }} />}
                      <span>{cat.title}</span>
                    </h4>
                    <div className="tech-placeholder-grid">
                      {cat.placeholders.map((ph) => {
                        const currentValue = formData.placeholderAnswers[ph.key] ?? ph.defaultTech;
                        const isUndefined = currentValue === '';
                        const isCustomValue = !isUndefined && !ph.options.includes(currentValue);
                        const displayValue = isUndefined ? 'Sin definir' : currentValue;
                        const isOpen = openDropdownKey === ph.key;
                        const isCustomEntryOpen = customEntryKey === ph.key;
                        const wrapOpen = isOpen || isCustomEntryOpen;

                        return (
                          <div className="form-group" key={ph.key}>
                            <label className="form-label">{ph.label}</label>
                            <div className={`crono-dd-wrap tech-select-wrap ${wrapOpen ? 'dd-open' : ''}`}>
                              <button
                                type="button"
                                className={`crono-dd-trigger tech-select-trigger ${isUndefined ? 'tech-select-undefined' : ''}`}
                                onClick={() => {
                                  if (isCustomEntryOpen) { setCustomEntryKey(null); return; }
                                  setOpenDropdownKey(isOpen ? null : ph.key);
                                }}
                              >
                                <span className="crono-dd-text">{displayValue}</span>
                                <ChevronDown size={14} className={`crono-dd-chevron ${wrapOpen ? 'open' : ''}`} />
                              </button>

                              <AnimatePresence>
                                {isOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                    transition={{ duration: 0.18 }}
                                    className="crono-dd-menu tech-select-menu"
                                  >
                                    {ph.options.map((opt) => (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => handlePlaceholderChange(ph.key, opt)}
                                        className={`crono-dd-item ${opt === currentValue ? 'active' : ''}`}
                                      >
                                        <span className="crono-dd-item-label">{opt}</span>
                                        {opt === currentValue && <Check size={14} className="crono-dd-check" />}
                                      </button>
                                    ))}

                                    <button
                                      type="button"
                                      onClick={() => handlePlaceholderChange(ph.key, '')}
                                      className={`crono-dd-item tech-undefined-item ${isUndefined ? 'active' : ''}`}
                                    >
                                      <span className="crono-dd-item-label">Sin definir</span>
                                      {isUndefined && <Check size={14} className="crono-dd-check" />}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => openCustomEntry(ph.key, isCustomValue ? currentValue : '')}
                                      className={`crono-dd-item tech-other-item ${isCustomValue ? 'active' : ''}`}
                                    >
                                      <span className="crono-dd-item-label">
                                        Otro{isCustomValue ? `: ${currentValue}` : ''}
                                      </span>
                                      {isCustomValue && <Check size={14} className="crono-dd-check" />}
                                    </button>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              <AnimatePresence>
                                {isCustomEntryOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                    transition={{ duration: 0.18 }}
                                    className="crono-dd-menu tech-select-menu tech-select-custom-panel"
                                  >
                                    <input
                                      type="text"
                                      autoFocus
                                      className="tech-select-custom-input"
                                      placeholder="Escribe la tecnología / herramienta..."
                                      value={customEntryDraft}
                                      onChange={(e) => setCustomEntryDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); commitCustomEntry(ph.key); }
                                        if (e.key === 'Escape') { setCustomEntryKey(null); }
                                      }}
                                    />
                                    <div className="tech-select-custom-actions">
                                      <button
                                        type="button"
                                        className="tech-select-custom-btn cancel"
                                        onClick={() => setCustomEntryKey(null)}
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        className="tech-select-custom-btn save"
                                        onClick={() => commitCustomEntry(ph.key)}
                                      >
                                        Guardar
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* ── Otros (Personalizados) ──────────────────────────── */}
                <div className="form-category-block">
                  <h4 className="category-header-title">
                    <PlusCircle size={17} style={{ color: selectedMember.color }} /> Otros (Especificar adicionales)
                  </h4>
                  <p style={{ fontSize: '12.5px', color: '#9CA3AF', margin: '0 0 10px 0' }}>
                    Si usaste otras herramientas, modelos o componentes que no están en la lista, agrégalos aquí:
                  </p>
                  <input
                    type="text"
                    className="checkbox-custom-input"
                    placeholder="Ej. Docker, Redis, PyTorch 2.0, LangChain..."
                    value={formData.customOtro}
                    onChange={(e) => handleInputChange('customOtro', e.target.value)}
                  />
                </div>

                {/* ── Notas Adicionales (Opcional) ────────────────────── */}
                <div className="form-category-block">
                  <h4 className="category-header-title">
                    <Sparkles size={17} style={{ color: selectedMember.color }} /> Notas Adicionales (Opcional)
                  </h4>
                  <textarea
                    className="form-textarea"
                    placeholder="Observaciones sobre por qué elegiste estas tecnologías, dudas, etc..."
                    value={formData.descripcion}
                    onChange={(e) => handleInputChange('descripcion', e.target.value)}
                  />
                </div>
              </div>

              {saveError && (
                <p style={{ color: '#F87171', fontSize: '12.5px', fontWeight: 600, margin: '0 0 16px 0' }}>
                  {saveError}
                </p>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCurrentStep(1)}
                  disabled={saving}
                >
                  <ArrowLeft size={16} /> Volver a Perfiles
                </button>

                <button type="submit" className="btn-primary" disabled={saving}>
                  <Save size={16} /> {saving ? 'Guardando...' : isFirstTime ? 'Siguiente: Cambiar Contraseña →' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════
            PASO 3: CAMBIAR CONTRASEÑA EN PRIMERA VEZ (SOLO PIDE NUEVA CONTRASEÑA)
            ════════════════════════════════════════════════════════════ */}
        {currentStep === 3 && selectedMember && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="form-step-container"
            style={{ maxWidth: '580px', margin: '0 auto' }}
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: `${selectedMember.color}18`,
                  border: `2px solid ${selectedMember.color}`,
                  color: selectedMember.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px auto',
                }}
              >
                <KeyRound size={28} />
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#FFF', margin: '0 0 6px 0' }}>
                Configura tu Contraseña
              </h3>
              <p style={{ fontSize: '13.5px', color: '#9CA3AF', margin: 0 }}>
                Es tu primer registro. Crea tu contraseña personal para acceder de aquí en adelante.
              </p>
            </div>

            <form onSubmit={handleFirstTimePasswordSubmit}>
              <NewPasswordFields
                password1={newPassword1}
                onPassword1Change={setNewPassword1}
                password2={newPassword2}
                onPassword2Change={setNewPassword2}
              />

              {saveError && (
                <p style={{ color: '#F87171', fontSize: '12.5px', fontWeight: 600, margin: '14px 0 0 0' }}>
                  {saveError}
                </p>
              )}

              <div className="form-actions" style={{ marginTop: 24 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCurrentStep(2)}
                  disabled={saving}
                >
                  <ArrowLeft size={16} /> Volver a Tecnologías
                </button>

                <button type="submit" className="btn-primary" disabled={saving}>
                  <ShieldCheck size={16} /> {saving ? 'Guardando...' : 'Guardar y Finalizar Registro'}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════
            PASO 4: CONFIRMACIÓN Y RESUMEN (OPCIONES ESCOGIDAS + EDITAR + CAMBIAR CONTRASEÑA)
            ════════════════════════════════════════════════════════════ */}
        {currentStep === 4 && selectedMember && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="form-step-container"
            style={{ textAlign: 'center', padding: '40px 28px' }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '2px solid #10B981',
                color: '#34D399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px auto',
              }}
            >
              <UserCheck size={36} />
            </div>

            <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#FFF', margin: '0 0 6px 0' }}>
              Cuestionario Registrado
            </h3>
            <p style={{ fontSize: '14px', color: '#9CA3AF', maxWidth: '520px', margin: '0 auto 20px auto' }}>
              Opciones técnicas guardadas para el perfil de{' '}
              <strong style={{ color: selectedMember.color }}>{selectedMember.name}</strong>.
            </p>

            {justSaved && (
              <p style={{ fontSize: '12.5px', color: '#34D399', maxWidth: '520px', margin: '0 auto 24px auto', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <Save size={13} /> Sincronizado en tiempo real con el Cronograma.
              </p>
            )}

            {/* Summary Box */}
            <div
              style={{
                background: 'rgba(11, 15, 25, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '16px',
                padding: '22px 24px',
                maxWidth: '680px',
                margin: '0 auto 28px auto',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Sparkles size={18} style={{ color: selectedMember.color }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#FFF' }}>
                  Tus Opciones Seleccionadas:
                </span>
              </div>

              {formData.descripcion && (
                <p style={{ fontSize: '13.5px', color: '#D1D5DB', margin: '0 0 16px 0', lineHeight: '1.5' }}>
                  {formData.descripcion}
                </p>
              )}

              {/* Selected Techs Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {Object.entries(formData.placeholderAnswers).map(([key, val]) => (
                  <span
                    key={key}
                    style={{
                      background: val ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                      border: val ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid rgba(239, 68, 68, 0.25)',
                      color: val ? '#60A5FA' : '#FCA5A5',
                      padding: '4px 12px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                    }}
                  >
                    {val || 'Sin definir'}
                  </span>
                ))}
                {formData.customOtro && (
                  <span
                    style={{
                      background: `${selectedMember.color}20`,
                      border: `1px solid ${selectedMember.color}40`,
                      color: selectedMember.color,
                      padding: '4px 12px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                    }}
                  >
                    + {formData.customOtro}
                  </span>
                )}
              </div>
            </div>

            {/* Acciones principales cuando ya está registrado */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentStep(2)}
                style={{ gap: 6 }}
              >
                <Pencil size={15} /> Editar Selección
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowChangePwdModal(true);
                  setPwdCurrent('');
                  setPwdNew1('');
                  setPwdNew2('');
                  setPwdError('');
                  setPwdSuccess('');
                }}
                style={{ gap: 6, borderColor: selectedMember.color, color: selectedMember.color }}
              >
                <KeyRound size={15} /> Cambiar Contraseña
              </button>

              <button
                type="button"
                className="btn-primary"
                onClick={handleReset}
                style={{ gap: 6 }}
              >
                <ArrowLeft size={15} /> Cambiar de Perfil
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal 1: Login inicial por perfil (contraseña) ── */}
      <AnimatePresence>
        {pendingMember && authPhase && (
          <div className="crono-verify-overlay" onClick={closeLoginModal}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="crono-verify-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="crono-verify-header">
                <div className="crono-verify-header-title">
                  <ShieldCheck size={18} style={{ color: pendingMember.color }} />
                  <span>
                    {authPhase === 'password'
                      ? `Hola, ${pendingMember.name.split(' ')[0]}`
                      : 'Crea tu propia contraseña'}
                  </span>
                </div>
                <button type="button" className="crono-gcal-close" onClick={closeLoginModal}>
                  <X size={16} />
                </button>
              </div>

              {authPhase === 'password' && (
                <form onSubmit={handleLoginSubmit}>
                  <p className="crono-verify-subtitle">Ingresa tu contraseña para ingresar a tu cuestionario.</p>
                  <div className="crono-verify-field">
                    <label className="crono-verify-label">Contraseña</label>
                    <PasswordInput
                      autoFocus
                      placeholder="••••••••"
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={setLoginPassword}
                    />
                  </div>

                  {authError && <p className="crono-verify-form-error">{authError}</p>}

                  <div className="crono-verify-actions">
                    <button type="button" className="crono-cal-nav-btn" onClick={closeLoginModal} disabled={authSubmitting}>
                      Cancelar
                    </button>
                    <button type="submit" className="crono-verify-confirm-btn" disabled={authSubmitting}>
                      <ShieldCheck size={15} /> {authSubmitting ? 'Verificando...' : 'Ingresar'}
                    </button>
                  </div>
                </form>
              )}

              {authPhase === 'newPassword' && (
                <form onSubmit={handleNewPasswordSubmit}>
                  <p className="crono-verify-subtitle">
                    Es tu primer ingreso: la contraseña que usaste era temporal. Crea una propia
                    (mínimo 6 caracteres) para seguir usándola de aquí en adelante.
                  </p>
                  <NewPasswordFields
                    password1={newPassword1}
                    onPassword1Change={setNewPassword1}
                    password2={newPassword2}
                    onPassword2Change={setNewPassword2}
                  />

                  {authError && <p className="crono-verify-form-error">{authError}</p>}

                  <div className="crono-verify-actions">
                    <button type="button" className="crono-cal-nav-btn" onClick={closeLoginModal} disabled={authSubmitting}>
                      Cancelar
                    </button>
                    <button type="submit" className="crono-verify-confirm-btn" disabled={authSubmitting}>
                      <ShieldCheck size={15} /> {authSubmitting ? 'Guardando...' : 'Guardar Contraseña y Continuar'}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal 2: Cambiar Contraseña cuando YA están registrados (Pide Contraseña Actual + Nueva Contraseña) ── */}
      <AnimatePresence>
        {showChangePwdModal && selectedMember && (
          <div className="crono-verify-overlay" onClick={() => setShowChangePwdModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="crono-verify-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="crono-verify-header">
                <div className="crono-verify-header-title">
                  <KeyRound size={18} style={{ color: selectedMember.color }} />
                  <span>Cambiar Contraseña — {selectedMember.name.split(' ')[0]}</span>
                </div>
                <button type="button" className="crono-gcal-close" onClick={() => setShowChangePwdModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubsequentPasswordSubmit}>
                <p className="crono-verify-subtitle">
                  Para actualizar tu contraseña, ingresa tu contraseña actual seguida de la nueva contraseña.
                </p>

                {/* 1. Contraseña Actual */}
                <div className="crono-verify-field" style={{ marginBottom: 14 }}>
                  <label className="crono-verify-label">Contraseña Actual</label>
                  <PasswordInput
                    autoFocus
                    placeholder="Ingresa tu contraseña actual"
                    value={pwdCurrent}
                    onChange={setPwdCurrent}
                  />
                </div>

                {/* 2 y 3. Nueva Contraseña y Confirmación */}
                <NewPasswordFields
                  password1={pwdNew1}
                  onPassword1Change={setPwdNew1}
                  password2={pwdNew2}
                  onPassword2Change={setPwdNew2}
                />

                {pwdError && <p className="crono-verify-form-error">{pwdError}</p>}
                {pwdSuccess && <p style={{ color: '#34D399', fontSize: '13px', fontWeight: 600, marginTop: 10, textAlign: 'center' }}>{pwdSuccess}</p>}

                <div className="crono-verify-actions">
                  <button type="button" className="crono-cal-nav-btn" onClick={() => setShowChangePwdModal(false)} disabled={pwdSubmitting}>
                    Cancelar
                  </button>
                  <button type="submit" className="crono-verify-confirm-btn" disabled={pwdSubmitting}>
                    <ShieldCheck size={15} /> {pwdSubmitting ? 'Actualizando...' : 'Actualizar Contraseña'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
