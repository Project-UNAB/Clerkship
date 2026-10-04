import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, CheckCircle, Loader2, Stethoscope, Clock, MoreVertical, Pencil, Trash2, Square, CheckSquare, X } from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import {
  listConsultations, renameConsultation, deleteConsultation, GASTRO_SUBTEMAS,
  type Consultation, type Difficulty,
} from '../../data/consultasApi';
import { mainAuthErrorMessage } from '../../data/mainAuth';

type DifficultyChoice = Difficulty | 'AUTO';

const DIFFICULTIES: { id: DifficultyChoice; label: string }[] = [
  { id: 'AUTO', label: 'Automática' },
  { id: 'EASY', label: 'Básico' },
  { id: 'MEDIUM', label: 'Intermedio' },
  { id: 'HARD', label: 'Avanzado' },
];

/** Solo para mostrar (distinto del selector de arriba, que incluye "Automática"). */
const DIFFICULTY_LABEL: Record<Difficulty, string> = { EASY: 'Básico', MEDIUM: 'Intermedio', HARD: 'Avanzado' };

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtHora(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

/** "hace 5 min" / "hace 2 h" — para que se sienta el tiempo transcurrido sin tener que hacer la cuenta. */
function fmtHaceTiempo(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

/** El backend compara subtemas sin distinguir tildes; el link "Reforzar" del
 *  Historial manda el subtema tal como lo devuelve el backend (sin tildes),
 *  así que hay que emparejarlo contra la lista acentuada de la UI. */
function normalizarSinTildes(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function matchSubtema(param: string | null): string {
  if (!param) return '';
  const norm = normalizarSinTildes(param);
  return GASTRO_SUBTEMAS.find(s => normalizarSinTildes(s) === norm) || '';
}

/* Casos clínicos: todos los casos los genera en vivo el agente generador —
 * acá solo se elige (o no) subtema y dificultad, y se ven las consultas del usuario. */
export default function CasosPage() {
  const navigate = useNavigate();
  const initialParams = new URLSearchParams(window.location.search);
  const [difficulty, setDifficulty] = useState<DifficultyChoice>(
    (initialParams.get('dificultad') as Difficulty) || 'AUTO',
  );
  const [subtema, setSubtema] = useState(() => matchSubtema(initialParams.get('subtema')));
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    listConsultations()
      .then(list => { if (!cancelled) setConsultations(list); })
      .catch(err => { if (!cancelled) setError(mainAuthErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    }
    if (menuFor) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuFor]);

  const inProgress = consultations.filter(c => c.status === 'IN_PROGRESS');
  const completed = consultations.filter(c => c.status === 'COMPLETED');

  function startRename(c: Consultation) {
    setRenamingId(c.id);
    setRenameValue(c.title);
    setMenuFor(null);
  }

  async function confirmRename(c: Consultation) {
    const nuevo = renameValue.trim();
    setRenamingId(null);
    if (!nuevo || nuevo === c.title) return;
    setBusyId(c.id);
    try {
      const updated = await renameConsultation(c.id, nuevo);
      setConsultations(prev => prev.map(x => (x.id === c.id ? { ...x, title: updated.title } : x)));
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(c: Consultation) {
    setMenuFor(null);
    setBusyId(c.id);
    try {
      await deleteConsultation(c.id);
      setConsultations(prev => prev.filter(x => x.id !== c.id));
      setSelected(prev => { const next = new Set(prev); next.delete(c.id); return next; });
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllInProgress() {
    setSelected(prev => (prev.size === inProgress.length ? new Set() : new Set(inProgress.map(c => c.id))));
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    setError(null);
    try {
      const resultados = await Promise.allSettled(ids.map(id => deleteConsultation(id)));
      const eliminados = new Set(ids.filter((_, i) => resultados[i].status === 'fulfilled'));
      const fallidos = resultados.filter(r => r.status === 'rejected').length;
      setConsultations(prev => prev.filter(x => !eliminados.has(x.id)));
      setSelected(new Set());
      if (fallidos > 0) {
        setError(`No se pudieron eliminar ${fallidos} de ${ids.length} casos seleccionados. Probá de nuevo.`);
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  function startNew() {
    const qs = new URLSearchParams();
    // Sin "dificultad" en la URL = automática: el backend la ajusta según tu
    // desempeño histórico en el subtema (selección adaptativa).
    if (difficulty !== 'AUTO') qs.set('dificultad', difficulty);
    if (subtema) qs.set('subtema', subtema);
    const suffix = qs.toString();
    navigate(`/simulacion${suffix ? `?${suffix}` : ''}`);
  }

  return (
    <div className="dash-root">
      <Sidebar />
      <div className="casos-page-wrapper">
        <div className="casos-pg-header">
          <div className="casos-pg-title-box">
            <h1>Casos clínicos de Gastroenterología</h1>
            <p>Cada caso lo genera un agente de IA al momento: entrevistás a un paciente virtual y un agente evaluador califica tu razonamiento.</p>
          </div>
        </div>

        <div className="casos-pg-section">
          <h2 className="casos-pg-section-title">Nuevo caso</h2>
          <div className="casos-mod-card" style={{ maxWidth: 560 }}>
            <label className="dfm-label">Subtema</label>
            <select className="dfm-input" value={subtema} onChange={e => setSubtema(e.target.value)}>
              <option value="">Aleatorio</option>
              {GASTRO_SUBTEMAS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <label className="dfm-label" style={{ marginTop: 12 }}>Dificultad</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {DIFFICULTIES.map(d => (
                <button
                  key={d.id}
                  type="button"
                  className={`shdoc-method-btn${difficulty === d.id ? ' active' : ''}`}
                  onClick={() => setDifficulty(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <button className="casos-mod-start-btn" style={{ marginTop: 16 }} onClick={startNew}>
              <Play size={14} /> Generar caso e iniciar
            </button>
          </div>
        </div>

        {error && <p className="dfm-error">{error}</p>}
        {loading && <div className="bib2-loading"><Loader2 size={22} className="dfm-spin" /></div>}

        {!loading && inProgress.length > 0 && (
          <div className="casos-pg-section">
            <div className="casos-pg-section-headrow">
              <h2 className="casos-pg-section-title">En progreso</h2>
              <button type="button" className="casos-select-all-btn" onClick={toggleSelectAllInProgress}>
                {selected.size === inProgress.length ? <CheckSquare size={14} /> : <Square size={14} />}
                {selected.size === inProgress.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>

            {selected.size > 0 && (
              <div className="casos-bulk-bar">
                <span>{selected.size} seleccionado{selected.size > 1 ? 's' : ''}</span>
                <div className="casos-bulk-bar-actions">
                  <button type="button" className="casos-bulk-cancel-btn" onClick={() => setSelected(new Set())} disabled={bulkDeleting}>
                    <X size={13} /> Cancelar
                  </button>
                  <button type="button" className="casos-bulk-delete-btn" onClick={handleBulkDelete} disabled={bulkDeleting}>
                    {bulkDeleting ? <Loader2 size={13} className="dfm-spin" /> : <Trash2 size={13} />}
                    Eliminar {selected.size > 1 ? 'seleccionados' : 'seleccionado'}
                  </button>
                </div>
              </div>
            )}

            <div className="casos-mod-grid">
              {inProgress.map(c => (
                <div key={c.id} className={`casos-mod-card${selected.has(c.id) ? ' casos-mod-card-selected' : ''}`}>
                  <div className="casos-mod-card-top">
                    <div className="casos-mod-card-top-left">
                      <button
                        type="button"
                        className="casos-card-select-btn"
                        onClick={() => toggleSelect(c.id)}
                        aria-label={selected.has(c.id) ? 'Deseleccionar' : 'Seleccionar'}
                      >
                        {selected.has(c.id) ? <CheckSquare size={17} /> : <Square size={17} />}
                      </button>
                      <div className="casos-mod-card-status" data-status="en_progreso" style={{ background: '#FFF7E6', color: '#F59E0B' }}>
                        <Play size={12} /> En progreso
                      </div>
                    </div>
                    <div className="casos-card-menu-wrap" ref={menuFor === c.id ? menuRef : undefined}>
                      <button
                        type="button"
                        className="casos-card-menu-btn"
                        onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                        aria-label="Opciones del caso"
                        disabled={busyId === c.id}
                      >
                        {busyId === c.id ? <Loader2 size={15} className="dfm-spin" /> : <MoreVertical size={15} />}
                      </button>
                      {menuFor === c.id && (
                        <div className="bib2-file-menu">
                          <button type="button" onClick={() => startRename(c)}><Pencil size={13} /> Renombrar</button>
                          <button type="button" className="danger" onClick={() => handleDelete(c)}><Trash2 size={13} /> Eliminar</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {renamingId === c.id ? (
                    <input
                      className="casos-card-rename-input"
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => confirmRename(c)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmRename(c); if (e.key === 'Escape') setRenamingId(null); }}
                    />
                  ) : (
                    <h3 className="casos-mod-card-title">{c.title}</h3>
                  )}

                  <div className="casos-mod-card-tags">
                    <span className="casos-mod-card-tag">{DIFFICULTY_LABEL[c.difficulty]}</span>
                  </div>
                  <p className="casos-mod-card-scenario">
                    <Clock size={12} /> Iniciado {fmtDate(c.started_at)} · {fmtHora(c.started_at)} ({fmtHaceTiempo(c.started_at)})
                  </p>
                  <button className="casos-mod-start-btn" onClick={() => navigate(`/simulacion/${c.id}`)}>
                    <Play size={14} /> Continuar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && completed.length > 0 && (
          <div className="casos-pg-section">
            <h2 className="casos-pg-section-title">Completados</h2>
            <div className="casos-mod-grid">
              {completed.map(c => (
                <div key={c.id} className="casos-mod-card">
                  <div className="casos-mod-card-top">
                    <div className="casos-mod-card-status" data-status="completado" style={{ background: '#E6F6EC', color: '#10B981' }}>
                      <CheckCircle size={12} /> Completado
                    </div>
                    {c.score !== null && <div className="casos-mod-card-score">{Math.round(c.score)} pts</div>}
                  </div>
                  <h3 className="casos-mod-card-title">{c.title}</h3>
                  {/* Subtema visible solo aca (ya completado) — mientras esta
                      en curso arruinaria el ejercicio de anamnesis. */}
                  {c.subtema && <p className="casos-mod-card-subtema">{c.subtema}</p>}
                  <p className="casos-mod-card-scenario"><Stethoscope size={12} /> {fmtDate(c.finished_at)}</p>
                  <button className="casos-mod-start-btn done" onClick={() => navigate('/historial')}>
                    <CheckCircle size={14} /> Ver en historial
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && consultations.length === 0 && !error && (
          <p className="bib2-empty-note">Todavía no tenés consultas — generá tu primer caso arriba.</p>
        )}
      </div>
    </div>
  );
}
