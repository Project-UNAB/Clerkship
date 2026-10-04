import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch, GitCommit, GitMerge, ExternalLink, Loader2, Tag, X, Check, ChevronDown, AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { CATEGORIES, CRONOGRAMA_DATA } from '../../data/cronogramaActivities';
import type { CategoryId } from '../../data/cronogramaActivities';
import { subscribeEvidenceMap, saveEvidence, removeEvidence } from '../../data/repoEvidence';
import type { RepoEvidence } from '../../data/repoEvidence';
import { fetchBranches, fetchCommits, githubFetchErrorMessage } from '../../data/githubApi';
import type { GitHubBranch, GitHubCommit } from '../../data/githubApi';
import { REPOS, repoUrl } from '../../data/repos';
import type { RepoConfig } from '../../data/repos';
import { authenticateMember, authErrorMessage, isFirstLogin, setNewPassword, validateNewPassword } from '../../data/devAuth';
import { TEAM_MEMBERS } from '../../data/teamData';
import DevAuthFields from '../../components/shared/DevAuthFields';
import NewPasswordFields from '../../components/shared/NewPasswordFields';

interface Milestone {
  key: string; // `${catId}-${actId}`, mismo formato que itemKey en CronogramaTab
  catId: CategoryId;
  label: string;
  color: string;
}

const MILESTONE_TYPES = new Set(['avance', 'integrado', 'candidata', 'final']);

const MILESTONES: Milestone[] = CATEGORIES.flatMap((cat: { id: CategoryId; label: string; color: string }) =>
  (CRONOGRAMA_DATA[cat.id] || [])
    .filter((act) => act.type && MILESTONE_TYPES.has(act.type))
    .map((act) => ({
      key: `${cat.id}-${act.id}`,
      catId: cat.id,
      label: `${cat.label} — ${act.dateLabel}: ${act.title}`,
      color: cat.color,
    }))
);

type PendingAction =
  | { type: 'tag'; commit: GitHubCommit; milestone: Milestone }
  | { type: 'untag'; key: string; label: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function RepositorioTab() {
  const [selectedRepo, setSelectedRepo] = useState<RepoConfig>(REPOS[0]);
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);

  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [branchesStatus, setBranchesStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [branchesError, setBranchesError] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('main');
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [commitsStatus, setCommitsStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [commitsError, setCommitsError] = useState('');

  const [taggingSha, setTaggingSha] = useState<string | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<Record<string, RepoEvidence>>({});

  // ── Acción pendiente de autenticación (etiquetar o quitar evidencia) ──
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionMemberId, setActionMemberId] = useState('');
  const [actionPassword, setActionPassword] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionAuthPhase, setActionAuthPhase] = useState<'login' | 'newPassword'>('login');
  const [actionNewPassword1, setActionNewPassword1] = useState('');
  const [actionNewPassword2, setActionNewPassword2] = useState('');

  useEffect(() => subscribeEvidenceMap(setEvidenceMap), []);

  // Carga las ramas cada vez que cambia el repositorio seleccionado
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-repo-change loading flag, guarded by `cancelled`
    setBranchesStatus('loading');
    setTaggingSha(null);
    fetchBranches(selectedRepo)
      .then((data) => {
        if (cancelled) return;
        setBranches(data);
        setBranchesStatus('ok');
        if (data.length > 0) {
          const preferred = data.find((b) => b.name === 'main' || b.name === 'master') || data[0];
          setSelectedBranch(preferred.name);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setBranchesStatus('error');
        setBranchesError(githubFetchErrorMessage(err));
      });
    return () => { cancelled = true; };
  }, [selectedRepo]);

  useEffect(() => {
    if (!selectedBranch) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-branch-change loading flag, guarded by `cancelled`
    setCommitsStatus('loading');
    fetchCommits(selectedRepo, selectedBranch, 40)
      .then((data) => {
        if (cancelled) return;
        setCommits(data);
        setCommitsStatus('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        setCommitsStatus('error');
        setCommitsError(githubFetchErrorMessage(err));
      });
    return () => { cancelled = true; };
  }, [selectedRepo, selectedBranch]);

  const findEvidenceForSha = (sha: string) => {
    for (const [key, ev] of Object.entries(evidenceMap)) {
      if (ev.sha === sha) return { key, evidence: ev };
    }
    return null;
  };

  const toggleTagPicker = (sha: string) => {
    setTaggingSha((prev) => (prev === sha ? null : sha));
  };

  const closePendingAction = () => {
    setPendingAction(null);
    setActionMemberId('');
    setActionPassword('');
    setActionError('');
    setActionAuthPhase('login');
    setActionNewPassword1('');
    setActionNewPassword2('');
  };

  const performPendingWrite = async () => {
    if (!pendingAction) return;
    const member = TEAM_MEMBERS.find((m) => m.id === actionMemberId);

    if (pendingAction.type === 'tag') {
      const { commit, milestone } = pendingAction;
      await saveEvidence(milestone.key, {
        repoId: selectedRepo.id,
        sha: commit.sha,
        shortSha: commit.sha.slice(0, 7),
        branch: selectedBranch,
        message: commit.commit.message.split('\n')[0],
        htmlUrl: commit.html_url,
        author: commit.commit.author.name,
        date: commit.commit.author.date,
        milestoneLabel: milestone.label,
        registeredBy: member?.name || actionMemberId,
        taggedAt: new Date().toISOString(),
      });
      setTaggingSha(null);
    } else {
      await removeEvidence(pendingAction.key);
    }

    closePendingAction();
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;

    // ── Fase 2: ya autenticado, solo falta fijar la contraseña propia ──
    if (actionAuthPhase === 'newPassword') {
      const validationError = validateNewPassword(actionNewPassword1, actionNewPassword2);
      if (validationError) {
        setActionError(validationError);
        return;
      }
      setActionError('');
      setActionSubmitting(true);
      try {
        await setNewPassword(actionNewPassword1);
        await performPendingWrite();
      } catch (err) {
        setActionError(authErrorMessage(err));
      } finally {
        setActionSubmitting(false);
      }
      return;
    }

    // ── Fase 1: identificar quién registra el cambio ──
    if (!actionMemberId) {
      setActionError('Selecciona quién registra esto.');
      return;
    }
    if (!actionPassword) {
      setActionError('Ingresa tu contraseña.');
      return;
    }

    setActionError('');
    setActionSubmitting(true);
    try {
      const user = await authenticateMember(actionMemberId, actionPassword);
      if (isFirstLogin(user)) {
        // Primera vez que esta cuenta inicia sesión: la contraseña era temporal.
        setActionAuthPhase('newPassword');
        return;
      }
      await performPendingWrite();
    } catch (err) {
      setActionError(authErrorMessage(err));
    } finally {
      setActionSubmitting(false);
    }
  };

  // Cualquier hito puede etiquetarse con un commit de cualquiera de los repos —
  // no se restringe por categoría, para poder corregir manualmente si hace falta.

  return (
    <div className="repo-wrapper">
      {/* ── Toolbar: selector de repo + link + selector de rama ───── */}
      <div className="repo-toolbar">
        <div className={`crono-dd-wrap repo-branch-wrap ${repoDropdownOpen ? 'dd-open' : ''}`}>
          <button
            type="button"
            className="crono-dd-trigger"
            onClick={() => setRepoDropdownOpen((o) => !o)}
          >
            <GitBranch size={14} />
            <span className="crono-dd-text">{selectedRepo.label}</span>
            <ChevronDown size={14} className={`crono-dd-chevron ${repoDropdownOpen ? 'open' : ''}`} />
          </button>

          <AnimatePresence>
            {repoDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="crono-dd-menu tech-select-menu"
              >
                <div className="crono-dd-header">REPOSITORIOS</div>
                {REPOS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setSelectedRepo(r); setRepoDropdownOpen(false); }}
                    className={`crono-dd-item ${r.id === selectedRepo.id ? 'active' : ''}`}
                  >
                    <span className="crono-dd-item-label">{r.label}</span>
                    {r.id === selectedRepo.id && <Check size={14} className="crono-dd-check" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <a href={repoUrl(selectedRepo)} target="_blank" rel="noopener noreferrer" className="repo-link">
          <span>{selectedRepo.owner}/{selectedRepo.name}</span>
          <ExternalLink size={13} />
        </a>

        <div className={`crono-dd-wrap repo-branch-wrap ${branchDropdownOpen ? 'dd-open' : ''}`}>
          <button
            type="button"
            className="crono-dd-trigger"
            onClick={() => setBranchDropdownOpen((o) => !o)}
            disabled={branchesStatus !== 'ok'}
          >
            <GitBranch size={14} />
            <span className="crono-dd-text">
              {branchesStatus === 'loading' ? 'Cargando ramas...' : selectedBranch}
            </span>
            <ChevronDown size={14} className={`crono-dd-chevron ${branchDropdownOpen ? 'open' : ''}`} />
          </button>

          <AnimatePresence>
            {branchDropdownOpen && branchesStatus === 'ok' && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="crono-dd-menu tech-select-menu"
              >
                <div className="crono-dd-header">{branches.length} RAMAS</div>
                {branches.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => { setSelectedBranch(b.name); setBranchDropdownOpen(false); }}
                    className={`crono-dd-item ${b.name === selectedBranch ? 'active' : ''}`}
                  >
                    <span className="crono-dd-item-label">{b.name}</span>
                    {b.name === selectedBranch && <Check size={14} className="crono-dd-check" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Estados de carga / error ──────────────────────────────── */}
      {branchesStatus === 'error' && (
        <div className="repo-error-box"><AlertTriangle size={16} /> <span>{branchesError}</span></div>
      )}

      {branchesStatus === 'ok' && commitsStatus === 'loading' && (
        <div className="repo-loading-box"><Loader2 size={18} className="repo-spin" /> Cargando historial de commits...</div>
      )}

      {commitsStatus === 'error' && (
        <div className="repo-error-box"><AlertTriangle size={16} /> <span>{commitsError}</span></div>
      )}

      {/* ── Línea de tiempo de commits (árbol simplificado) ───────── */}
      {commitsStatus === 'ok' && (
        <div className="repo-timeline">
          {commits.map((commit) => {
            const isMerge = commit.parents.length > 1;
            const shortSha = commit.sha.slice(0, 7);
            const message = commit.commit.message.split('\n')[0];
            const evidenceEntry = findEvidenceForSha(commit.sha);
            const isTagging = taggingSha === commit.sha;

            return (
              <div key={commit.sha} className={`repo-commit-row ${isMerge ? 'is-merge' : ''}`}>
                <div className="repo-commit-line-col">
                  <div className={`repo-commit-dot ${isMerge ? 'merge' : ''}`}>
                    {isMerge ? <GitMerge size={13} /> : <GitCommit size={13} />}
                  </div>
                  <div className="repo-commit-line" />
                </div>

                <div className="repo-commit-card">
                  <div className="repo-commit-top">
                    <a href={commit.html_url} target="_blank" rel="noopener noreferrer" className="repo-commit-sha">
                      {shortSha}
                    </a>
                    {isMerge && <span className="repo-merge-tag">Merge</span>}
                    <span className="repo-commit-date">{formatDate(commit.commit.author.date)}</span>
                  </div>

                  <p className="repo-commit-message">{message}</p>

                  {isMerge && (
                    <p className="repo-parents">
                      Uniendo: {commit.parents.map((p) => p.sha.slice(0, 7)).join(' + ')}
                    </p>
                  )}

                  <div className="repo-commit-bottom">
                    <span className="repo-commit-author">{commit.commit.author.name}</span>

                    <div className={`crono-dd-wrap repo-tag-wrap ${isTagging ? 'dd-open' : ''}`}>
                      <button type="button" className="repo-tag-btn" onClick={() => toggleTagPicker(commit.sha)}>
                        <Tag size={12} /> Marcar como evidencia
                      </button>

                      <AnimatePresence>
                        {isTagging && (
                          <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.98 }}
                            transition={{ duration: 0.18 }}
                            className="crono-dd-menu tech-select-menu repo-milestone-menu"
                          >
                            <div className="crono-dd-header">¿A QUÉ ENTREGA CORRESPONDE?</div>
                            {MILESTONES.map((m) => (
                              <button
                                key={m.key}
                                type="button"
                                onClick={() => setPendingAction({ type: 'tag', commit, milestone: m })}
                                className="crono-dd-item"
                              >
                                <span className="crono-dd-color-dot" style={{ backgroundColor: m.color }} />
                                <span className="crono-dd-item-label">{m.label}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {evidenceEntry && (
                    <div className="repo-evidence-tag">
                      <Tag size={11} />
                      <span>
                        Evidencia de: {evidenceEntry.evidence.milestoneLabel}
                        {evidenceEntry.evidence.registeredBy ? ` · registrado por ${evidenceEntry.evidence.registeredBy}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingAction({ type: 'untag', key: evidenceEntry.key, label: evidenceEntry.evidence.milestoneLabel })}
                        className="repo-untag-btn"
                        title="Quitar evidencia"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {commits.length === 0 && (
            <p className="repo-empty-msg">Esta rama no tiene commits para mostrar.</p>
          )}
        </div>
      )}

      {/* ── Modal de autenticación para etiquetar / quitar evidencia ── */}
      <AnimatePresence>
        {pendingAction && (
          <div className="crono-verify-overlay" onClick={closePendingAction}>
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
                  <ShieldCheck size={18} style={{ color: pendingAction.type === 'tag' ? '#10B981' : '#64748B' }} />
                  <span>
                    {actionAuthPhase === 'newPassword'
                      ? 'Crea tu propia contraseña'
                      : pendingAction.type === 'tag' ? 'Confirmar Evidencia' : 'Quitar Evidencia'}
                  </span>
                </div>
                <button type="button" className="crono-gcal-close" onClick={closePendingAction}>
                  <X size={16} />
                </button>
              </div>

              <p className="crono-verify-subtitle">
                {pendingAction.type === 'tag'
                  ? `${pendingAction.commit.sha.slice(0, 7)} → ${pendingAction.milestone.label}`
                  : pendingAction.label}
              </p>

              {actionAuthPhase === 'newPassword' ? (
                <>
                  <p className="crono-verify-subtitle">
                    Es tu primer ingreso: la contraseña que usaste era temporal. Crea una propia
                    (mínimo 6 caracteres) para seguir usándola de aquí en adelante.
                  </p>
                  <NewPasswordFields
                    password1={actionNewPassword1}
                    onPassword1Change={setActionNewPassword1}
                    password2={actionNewPassword2}
                    onPassword2Change={setActionNewPassword2}
                  />
                </>
              ) : (
                <DevAuthFields
                  memberId={actionMemberId}
                  onMemberChange={setActionMemberId}
                  password={actionPassword}
                  onPasswordChange={setActionPassword}
                />
              )}

              {actionError && <p className="crono-verify-form-error">{actionError}</p>}

              <div className="crono-verify-actions">
                <button type="button" className="crono-cal-nav-btn" onClick={closePendingAction} disabled={actionSubmitting}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="crono-verify-confirm-btn"
                  onClick={handleConfirmAction}
                  disabled={actionSubmitting}
                >
                  <ShieldCheck size={15} />
                  {actionAuthPhase === 'newPassword'
                    ? (actionSubmitting ? 'Guardando...' : 'Guardar Contraseña y Continuar')
                    : actionSubmitting
                      ? 'Verificando...'
                      : pendingAction.type === 'tag' ? 'Confirmar Evidencia' : 'Confirmar y Quitar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
