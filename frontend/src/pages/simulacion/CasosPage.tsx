import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Loader2, MoreVertical, Pencil, Trash2, Square, CheckSquare, X,
  ArrowUpRight, ArrowRight, Sparkles, Activity, CheckCircle2, Clock,
  BarChart3, ChevronDown, Check, Search, Stethoscope, Maximize2, Minimize2, Award,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import FeedbackFab from '../../components/shared/FeedbackFab';
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

/** "hace 5 min" / "hace 2 h" — para que se sienta el tiempo transcurrido sin tener que hacer la cuenta. */
function fmtHaceTiempo(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

/** Calcula la duración real en minutos entre inicio y fin de una consulta. */
function getDuracionMin(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;
  return Math.max(1, Math.round((end - start) / 60000));
}

/** Calcula el tiempo transcurrido de una consulta activa en progreso. */
function getTiempoEnSesion(startedAt: string | null): { valor: number; unidad: string; compact: string } {
  if (!startedAt) return { valor: 0, unidad: 'min en sesión', compact: '0m' };
  const ms = Date.now() - new Date(startedAt).getTime();
  const min = Math.max(1, Math.floor(ms / 60000));
  if (min < 60) return { valor: min, unidad: 'min en sesión', compact: `${min}m` };
  const horas = Math.floor(min / 60);
  return { valor: horas, unidad: horas === 1 ? 'hora en sesión' : 'horas en sesión', compact: `${horas}h` };
}

function normalizarSinTildes(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function matchSubtema(param: string | null): string {
  if (!param) return '';
  const norm = normalizarSinTildes(param);
  return GASTRO_SUBTEMAS.find(s => normalizarSinTildes(s) === norm) || '';
}

/** Genera un avatar humano determinista y único para cada paciente según el ID del caso */
function getPatientAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,c9f2c7`;
}

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

  // Dropdown propio de subtema clínico
  const [subtemaOpen, setSubtemaOpen] = useState(false);
  const [subtemaSearch, setSubtemaSearch] = useState('');
  const subtemaDropdownRef = useRef<HTMLDivElement>(null);

  // Filtros de navegación rápida
  const [filterTab, setFilterTab] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED'>(() => {
    const t = initialParams.get('tab');
    if (t === 'IN_PROGRESS' || t === 'COMPLETED') return t;
    return 'ALL';
  });
  const [filterDifficulty, setFilterDifficulty] = useState<'ALL' | Difficulty>('ALL');
  const [expandedRendimiento, setExpandedRendimiento] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('tab');
    if (t === 'IN_PROGRESS' || t === 'COMPLETED') {
      setFilterTab(t);
    } else if (!t) {
      setFilterTab('ALL');
    }
    if (p.get('nuevo') === '1') {
      setTimeout(() => {
        const el = document.querySelector('.casos-hero-card');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [window.location.search]);

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
      if (subtemaDropdownRef.current && !subtemaDropdownRef.current.contains(e.target as Node)) {
        setSubtemaOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const inProgress = consultations.filter(c => c.status === 'IN_PROGRESS');
  const completed = consultations.filter(c => c.status === 'COMPLETED');
  const totalCasos = consultations.length;
  const pctCompletados = totalCasos > 0 ? Math.round((completed.length / totalCasos) * 100) : 0;

  // Estadísticas explícitas y detalladas para la card de Rendimiento
  const totalScore = completed.reduce((sum, c) => sum + (c.score || 0), 0);
  const avgScore = completed.length > 0 ? Math.round(totalScore / completed.length) : 0;
  const aprobados = completed.filter(c => (c.score || 0) >= 70).length;
  const porReforzar = completed.filter(c => (c.score || 0) < 70).length;
  const tasaAprobacion = completed.length > 0 ? Math.round((aprobados / completed.length) * 100) : 0;
  const duraciones = completed.map(c => getDuracionMin(c.started_at, c.finished_at)).filter((d): d is number => d !== null);
  const totalMinutos = duraciones.reduce((sum, d) => sum + d, 0);
  const avgMinutos = duraciones.length > 0 ? Math.round(totalMinutos / duraciones.length) : 0;
  const facilon = completed.filter(c => c.difficulty === 'EASY').length;
  const intermedio = completed.filter(c => c.difficulty === 'MEDIUM').length;
  const avanzado = completed.filter(c => c.difficulty === 'HARD').length;

  // Filtrado reactivo de consultas
  const filteredConsultations = consultations.filter(c => {
    if (filterTab === 'IN_PROGRESS' && c.status !== 'IN_PROGRESS') return false;
    if (filterTab === 'COMPLETED' && c.status !== 'COMPLETED') return false;
    if (filterDifficulty !== 'ALL' && c.difficulty !== filterDifficulty) return false;
    return true;
  });
  // Separadas para poder mostrar "en progreso" y "completados" en bloques
  // distintos (con un separador entre ambos) cuando el filtro es "Todos".
  const filteredInProgress = filteredConsultations.filter(c => c.status === 'IN_PROGRESS');
  const filteredCompleted = filteredConsultations.filter(c => c.status === 'COMPLETED');

  const filteredSubtemas = GASTRO_SUBTEMAS.filter(s =>
    normalizarSinTildes(s).includes(normalizarSinTildes(subtemaSearch))
  );

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
        setError(`No se pudieron eliminar ${fallidos} de ${ids.length} casos seleccionados. Intenta nuevamente.`);
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  function startNew() {
    const qs = new URLSearchParams();
    if (difficulty !== 'AUTO') qs.set('dificultad', difficulty);
    if (subtema) qs.set('subtema', subtema);
    const suffix = qs.toString();
    navigate(`/simulacion${suffix ? `?${suffix}` : ''}`);
  }

  return (
    <div className="dash-root">
      <Sidebar />
      <FeedbackFab pestana="casos" />
      <div className="casos-page-wrapper">
        {error && <p className="dfm-error" style={{ marginBottom: 16 }}>{error}</p>}

        <div className="casos-dashboard-layout">
          {/* ════════ COLUMNA PRINCIPAL (Izquierda) ════════ */}
          <div className="casos-main-col">
            {/* 1. Hero Card: Generador de Nuevo Caso (versión compacta) */}
            <div className="casos-hero-card">
              <div className="casos-hero-content">
                <div className="casos-hero-text-block">
                  <h2 className="casos-hero-title">Genera tu nuevo caso clínico</h2>
                  <p className="casos-hero-desc">
                    Entrevista a un paciente virtual generado al instante según tus necesidades clínicas y recibe retroalimentación experta paso a paso.
                  </p>
                </div>

                <div className="casos-hero-form">
                  <div className="casos-hero-field" ref={subtemaDropdownRef}>
                    <label className="casos-hero-label">Subtema clínico</label>
                    <div className="casos-subtema-custom-wrap">
                      <button
                        type="button"
                        className={`casos-subtema-trigger-btn${subtemaOpen ? ' open' : ''}`}
                        onClick={() => setSubtemaOpen(prev => !prev)}
                        aria-expanded={subtemaOpen}
                        aria-haspopup="listbox"
                      >
                        <div className="casos-subtema-trigger-left">
                          <Stethoscope size={15} className="casos-subtema-trigger-icon" />
                          <span className="casos-subtema-trigger-text">
                            {subtema || 'Aleatorio (Recomendado)'}
                          </span>
                        </div>
                        <ChevronDown size={14} className="casos-subtema-trigger-chevron" />
                      </button>

                      {subtemaOpen && (
                        <div className="casos-subtema-dropdown-menu" role="listbox">
                          <div className="casos-subtema-search-box">
                            <Search size={14} color="var(--ink3, #94A3B8)" />
                            <input
                              type="text"
                              className="casos-subtema-search-input"
                              placeholder="Buscar subtema clínico..."
                              value={subtemaSearch}
                              onChange={e => setSubtemaSearch(e.target.value)}
                              autoFocus
                              onClick={e => e.stopPropagation()}
                            />
                            {subtemaSearch && (
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)' }}
                                onClick={(e) => { e.stopPropagation(); setSubtemaSearch(''); }}
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>

                          <div className="casos-subtema-options-list">
                            {/* Opción adaptativa / aleatoria */}
                            {(!subtemaSearch || normalizarSinTildes('aleatorio recomendado').includes(normalizarSinTildes(subtemaSearch))) && (
                              <button
                                type="button"
                                className={`casos-subtema-opt-item${subtema === '' ? ' active' : ''}`}
                                onClick={() => {
                                  setSubtema('');
                                  setSubtemaOpen(false);
                                  setSubtemaSearch('');
                                }}
                              >
                                <div className="casos-subtema-opt-main">
                                  <Sparkles size={14} style={{ color: '#0284C7', flexShrink: 0 }} />
                                  <div className="casos-subtema-opt-text-wrap">
                                    <span className="casos-subtema-opt-label">Aleatorio (Recomendado)</span>
                                    <span className="casos-subtema-opt-hint">Selección adaptativa inteligente</span>
                                  </div>
                                </div>
                                {subtema === '' && <Check size={14} className="casos-subtema-opt-check" />}
                              </button>
                            )}

                            {filteredSubtemas.map(s => {
                              const isSelected = subtema === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  className={`casos-subtema-opt-item${isSelected ? ' active' : ''}`}
                                  onClick={() => {
                                    setSubtema(s);
                                    setSubtemaOpen(false);
                                    setSubtemaSearch('');
                                  }}
                                >
                                  <div className="casos-subtema-opt-main">
                                    <span className="casos-subtema-opt-dot" />
                                    <span className="casos-subtema-opt-label">{s}</span>
                                  </div>
                                  {isSelected && <Check size={14} className="casos-subtema-opt-check" />}
                                </button>
                              );
                            })}

                            {filteredSubtemas.length === 0 && subtemaSearch && (
                              <div className="casos-subtema-no-match">
                                No se encontraron subtemas que coincidan
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="casos-hero-field">
                    <label className="casos-hero-label">Dificultad</label>
                    <div className="casos-hero-diff-row">
                      {DIFFICULTIES.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          className={`casos-hero-diff-btn${difficulty === d.id ? ' active' : ''}`}
                          onClick={() => setDifficulty(d.id)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button type="button" className="casos-hero-action-btn" onClick={startNew}>
                    <Play size={14} fill="currentColor" />
                    <span>Iniciar simulación</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Explorador de Casos y Filtros */}
            <div className="casos-explorer-head">
              <div className="casos-explorer-title-box">
                <h3 className="casos-explorer-title">Explorador de Casos</h3>
                <span className="casos-explorer-badge">{filteredConsultations.length} casos</span>
              </div>

              {inProgress.length > 0 && (
                <button
                  type="button"
                  className="casos-select-all-btn"
                  onClick={toggleSelectAllInProgress}
                >
                  {selected.size === inProgress.length ? <CheckSquare size={14} /> : <Square size={14} />}
                  {selected.size === inProgress.length ? 'Deseleccionar en progreso' : 'Seleccionar en progreso'}
                </button>
              )}
            </div>

            {/* Fila de Filtros tipo Píldoras (como en el diseño de referencia) */}
            <div className="casos-filter-pill-row">
              <button
                type="button"
                className={`casos-filter-pill${filterTab === 'ALL' ? ' active' : ''}`}
                onClick={() => setFilterTab('ALL')}
              >
                Todos ({totalCasos})
              </button>
              <button
                type="button"
                className={`casos-filter-pill${filterTab === 'IN_PROGRESS' ? ' active' : ''}`}
                onClick={() => setFilterTab('IN_PROGRESS')}
              >
                En progreso ({inProgress.length})
              </button>
              <button
                type="button"
                className={`casos-filter-pill${filterTab === 'COMPLETED' ? ' active' : ''}`}
                onClick={() => setFilterTab('COMPLETED')}
              >
                Completados ({completed.length})
              </button>

              <span style={{ width: 1, height: 22, background: 'var(--border, #E2E8F0)', margin: '0 4px' }} />

              <button
                type="button"
                className={`casos-filter-pill${filterDifficulty === 'ALL' ? ' active' : ''}`}
                onClick={() => setFilterDifficulty('ALL')}
              >
                Cualquier nivel
              </button>
              <button
                type="button"
                className={`casos-filter-pill${filterDifficulty === 'EASY' ? ' active' : ''}`}
                onClick={() => setFilterDifficulty(prev => prev === 'EASY' ? 'ALL' : 'EASY')}
              >
                Básico
              </button>
              <button
                type="button"
                className={`casos-filter-pill${filterDifficulty === 'MEDIUM' ? ' active' : ''}`}
                onClick={() => setFilterDifficulty(prev => prev === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
              >
                Intermedio
              </button>
              <button
                type="button"
                className={`casos-filter-pill${filterDifficulty === 'HARD' ? ' active' : ''}`}
                onClick={() => setFilterDifficulty(prev => prev === 'HARD' ? 'ALL' : 'HARD')}
              >
                Avanzado
              </button>
            </div>

            {/* Barra de acciones en lote */}
            {selected.size > 0 && (
              <div className="casos-bulk-bar" style={{ marginBottom: 16 }}>
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

            {/* Loader */}
            {loading && (
              <div className="bib2-loading">
                <Loader2 size={24} className="dfm-spin" />
              </div>
            )}

            {/* 3. Grid de Tarjetas (Pillars) — en progreso y completados en
                 bloques separados, con línea divisoria entre ambos cuando
                 el filtro es "Todos". */}
            {!loading && filteredConsultations.length > 0 && (
              <>
                {filteredInProgress.length > 0 && (
                  <div className="casos-pillar-grid">
                    {filteredInProgress.map(c => {
                      const tiempo = getTiempoEnSesion(c.started_at);
                      const isSelected = selected.has(c.id);
                      const selectionMode = selected.size > 0;

                      return (
                        <div
                          key={c.id}
                          className={`casos-pillar-card in-progress${isSelected ? ' selected' : ''}`}
                          onClick={() => {
                            if (renamingId !== c.id) navigate(`/simulacion/${c.id}`);
                          }}
                        >
                          <div className="casos-pillar-top">
                            <div className="casos-pillar-top-left">
                              {selectionMode && (
                                <button
                                  type="button"
                                  className="casos-pillar-select-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelect(c.id);
                                  }}
                                  aria-label={isSelected ? 'Deseleccionar' : 'Seleccionar'}
                                >
                                  {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                </button>
                              )}
                              <div className="casos-pillar-avatar-wrap" title="Paciente virtual">
                                <img
                                  src={getPatientAvatarUrl(c.id)}
                                  alt="Paciente"
                                  className="casos-pillar-avatar-img"
                                  loading="lazy"
                                />
                              </div>
                            </div>

                            <div className="casos-pillar-top-right">
                              <div className="casos-card-menu-wrap" ref={menuFor === c.id ? menuRef : undefined}>
                                <button
                                  type="button"
                                  className="casos-pillar-menu-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuFor(menuFor === c.id ? null : c.id);
                                  }}
                                  aria-label="Opciones del caso"
                                  disabled={busyId === c.id}
                                >
                                  {busyId === c.id ? <Loader2 size={14} className="dfm-spin" /> : <MoreVertical size={14} />}
                                </button>
                                {menuFor === c.id && (
                                  <div className="bib2-file-menu" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" onClick={() => { toggleSelect(c.id); setMenuFor(null); }}>
                                      {isSelected ? <CheckSquare size={13} /> : <Square size={13} />} {isSelected ? 'Deseleccionar' : 'Seleccionar'}
                                    </button>
                                    <button type="button" onClick={() => startRename(c)}><Pencil size={13} /> Renombrar</button>
                                    <button type="button" className="danger" onClick={() => handleDelete(c)}><Trash2 size={13} /> Eliminar</button>
                                  </div>
                                )}
                              </div>

                              <div className="casos-pillar-arrow-btn" title="Continuar simulación">
                                <ArrowUpRight size={16} />
                              </div>
                            </div>
                          </div>

                          <div className="casos-pillar-body">
                            {renamingId === c.id ? (
                              <input
                                className="casos-pillar-rename-input"
                                autoFocus
                                value={renameValue}
                                onClick={(e) => e.stopPropagation()}
                                onChange={e => setRenameValue(e.target.value)}
                                onBlur={() => confirmRename(c)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') confirmRename(c);
                                  if (e.key === 'Escape') setRenamingId(null);
                                }}
                              />
                            ) : (
                              <h3 className="casos-pillar-title">{c.title}</h3>
                            )}
                            <p className="casos-pillar-sub">
                              {c.subtema ? `${c.subtema} · ` : ''}{c.specialty} · Dificultad {DIFFICULTY_LABEL[c.difficulty]}
                            </p>
                          </div>

                          <div className="casos-pillar-stat-row">
                            <div className="casos-pillar-stat-left">
                              <span className="casos-pillar-big-num">{tiempo.valor}</span>
                              <span className="casos-pillar-big-label">{tiempo.unidad}</span>
                            </div>
                            <span className="casos-pillar-pill">En curso</span>
                          </div>

                          <div className="casos-pillar-seg-bar">
                            <div className="casos-seg-fill casos-seg-1" style={{ width: '68%' }} />
                            <div className="casos-seg-fill casos-seg-2" style={{ width: '32%' }} />
                          </div>

                          <div className="casos-pillar-legend-row">
                            <div className="casos-pillar-leg-item">
                              <span className="casos-pillar-leg-label">Iniciado</span>
                              <span className="casos-pillar-leg-val">
                                <span className="casos-pillar-dot dot-1" />
                                {fmtHaceTiempo(c.started_at)}
                              </span>
                            </div>
                            <div className="casos-pillar-leg-item">
                              <span className="casos-pillar-leg-label">Nivel</span>
                              <span className="casos-pillar-leg-val">
                                <span className="casos-pillar-dot dot-2" />
                                {DIFFICULTY_LABEL[c.difficulty]}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filterTab === 'ALL' && filteredInProgress.length > 0 && filteredCompleted.length > 0 && (
                  <div className="casos-group-divider">
                    <span>Completados</span>
                  </div>
                )}

                {filteredCompleted.length > 0 && (
                  <div className="casos-pillar-grid">
                    {filteredCompleted.map(c => {
                      const score = Math.round(c.score || 0);
                      const duracion = getDuracionMin(c.started_at, c.finished_at);
                      const scoreWidth = Math.min(94, Math.max(6, score));
                      const gapWidth = Math.max(6, 100 - score);

                      return (
                        <div
                          key={c.id}
                          className="casos-pillar-card completed"
                          onClick={() => navigate('/historial')}
                        >
                          <div className="casos-pillar-top">
                            <div className="casos-pillar-top-left">
                              <div className="casos-pillar-avatar-wrap" title="Paciente virtual">
                                <img
                                  src={getPatientAvatarUrl(c.id)}
                                  alt="Paciente"
                                  className="casos-pillar-avatar-img"
                                  loading="lazy"
                                />
                              </div>
                            </div>
                            <div className="casos-pillar-top-right">
                              <div className="casos-pillar-arrow-btn" title="Ver en historial">
                                <ArrowRight size={16} />
                              </div>
                            </div>
                          </div>

                          <div className="casos-pillar-body">
                            <h3 className="casos-pillar-title">{c.title}</h3>
                            <p className="casos-pillar-sub">
                              {c.subtema ? `${c.subtema} · ${c.specialty}` : c.specialty}
                            </p>
                          </div>

                          <div className="casos-pillar-stat-row">
                            <div className="casos-pillar-stat-left">
                              <span className="casos-pillar-big-num">{score}</span>
                              <span className="casos-pillar-big-label">Puntaje obtenido</span>
                            </div>
                            <span className={`casos-pillar-pill${score >= 70 ? ' success' : ' warn'}`}>
                              {score}%
                            </span>
                          </div>

                          <div className="casos-pillar-seg-bar">
                            <div className="casos-seg-fill casos-seg-1" style={{ width: `${scoreWidth}%` }} />
                            <div className="casos-seg-fill casos-seg-2" style={{ width: `${gapWidth}%` }} />
                          </div>

                          <div className="casos-pillar-legend-row">
                            <div className="casos-pillar-leg-item">
                              <span className="casos-pillar-leg-label">Duración</span>
                              <span className="casos-pillar-leg-val">
                                <span className="casos-pillar-dot dot-1" />
                                {duracion !== null ? `${duracion} min` : (fmtDate(c.finished_at) || 'Finalizado')}
                              </span>
                            </div>
                            <div className="casos-pillar-leg-item">
                              <span className="casos-pillar-leg-label">Resultado</span>
                              <span className="casos-pillar-leg-val">
                                <span className={`casos-pillar-dot ${score >= 70 ? 'dot-success' : 'dot-warn'}`} />
                                {score >= 70 ? 'Aprobado' : 'Por reforzar'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {!loading && filteredConsultations.length === 0 && (
              <div className="casos-mini-empty" style={{ padding: '40px 16px', background: 'var(--surface, #FFFFFF)', borderRadius: 16 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>No hay casos en este filtro.</p>
                <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--ink3)' }}>
                  Intenta cambiar el filtro o genera un nuevo caso clínico con el asistente de IA arriba.
                </p>
              </div>
            )}
          </div>

          {/* ════════ COLUMNA LATERAL (Derecha - Inspirado en el diseño) ════════ */}
          <aside className="casos-side-col">
            {/* Widget 1: Arc Gauge de Uso / Progreso ("Your Usage") */}
            <div className={`casos-side-card${expandedRendimiento ? ' expanded' : ''}`}>
              <div className="casos-side-card-head">
                <h4 className="casos-side-card-title">
                  <BarChart3 size={17} color="#1976D2" />
                  Tu Rendimiento
                </h4>
                <button
                  type="button"
                  className="casos-rendimiento-expand-btn"
                  onClick={() => setExpandedRendimiento(prev => !prev)}
                  title={expandedRendimiento ? 'Contraer estadísticas' : 'Expandir estadísticas detalladas'}
                  aria-label="Expandir estadísticas"
                >
                  {expandedRendimiento ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  <span>{expandedRendimiento ? 'Menos' : 'Detalles'}</span>
                </button>
              </div>

              <div className="casos-gauge-box">
                <svg className="casos-gauge-svg" viewBox="0 0 200 120">
                  <defs>
                    <linearGradient id="casosGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#0284C7" />
                      <stop offset="100%" stopColor="#1976D2" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 30,105 A 70,70 0 0,1 170,105"
                    className="casos-gauge-track"
                  />
                  <path
                    d="M 30,105 A 70,70 0 0,1 170,105"
                    className="casos-gauge-progress"
                    style={{
                      strokeDasharray: 220,
                      strokeDashoffset: 220 - (220 * (pctCompletados / 100)),
                    }}
                  />
                  <text x="100" y="92" textAnchor="middle" className="casos-gauge-pct-text">
                    {pctCompletados}%
                  </text>
                </svg>

                <div className="casos-gauge-sublabel">
                  {completed.length} completados de {totalCasos} casos totales
                </div>

                {/* Panel de Estadísticas Explícitas Detalladas al expandir */}
                {expandedRendimiento && (
                  <div className="casos-rendimiento-details">
                    <div className="casos-rend-grid">
                      <div className="casos-rend-stat-card">
                        <div className="casos-rend-stat-head">
                          <Award size={13} color="#1976D2" />
                          <span>Promedio</span>
                        </div>
                        <span className="casos-rend-stat-num">{avgScore}%</span>
                        <span className="casos-rend-stat-sub">
                          {completed.length === 0 ? 'Sin casos' : avgScore >= 70 ? 'Nivel Aprobatorio' : 'Por Reforzar'}
                        </span>
                      </div>

                      <div className="casos-rend-stat-card">
                        <div className="casos-rend-stat-head">
                          <Clock size={13} color="#0284C7" />
                          <span>Tiempo medio</span>
                        </div>
                        <span className="casos-rend-stat-num">
                          {avgMinutos > 0 ? `${avgMinutos} min` : '< 5 min'}
                        </span>
                        <span className="casos-rend-stat-sub">
                          {totalMinutos > 0 ? `${totalMinutos} min invertidos` : 'Por sesión'}
                        </span>
                      </div>
                    </div>

                    <div className="casos-rend-bar-wrap">
                      <div className="casos-rend-bar-labels">
                        <span style={{ color: '#10B981' }}>{aprobados} aprobados</span>
                        <span style={{ color: '#F59E0B' }}>{porReforzar} por reforzar</span>
                      </div>
                      <div className="casos-rend-bar-track">
                        <div
                          className="casos-rend-bar-fill-good"
                          style={{ width: `${completed.length > 0 ? Math.max(4, (aprobados / completed.length) * 100) : 0}%` }}
                        />
                        <div
                          className="casos-rend-bar-fill-warn"
                          style={{ width: `${completed.length > 0 ? Math.max(4, (porReforzar / completed.length) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="casos-rend-bar-meta">
                        Tasa de aprobación: <strong>{tasaAprobacion}%</strong> · {inProgress.length} en curso
                      </span>
                    </div>

                    <div className="casos-rend-diff-row">
                      <div className="casos-rend-diff-chip">
                        <span>Básico</span>
                        <span>{facilon}</span>
                      </div>
                      <div className="casos-rend-diff-chip">
                        <span>Intermedio</span>
                        <span>{intermedio}</span>
                      </div>
                      <div className="casos-rend-diff-chip">
                        <span>Avanzado</span>
                        <span>{avanzado}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="casos-gauge-btn-row">
                  <button
                    type="button"
                    className="casos-gauge-outline-btn"
                    onClick={() => navigate('/biblioteca')}
                  >
                    Biblioteca
                  </button>
                  <button
                    type="button"
                    className="casos-gauge-solid-btn"
                    onClick={() => navigate('/historial')}
                  >
                    Historial
                  </button>
                </div>
              </div>
            </div>

            {/* Widget 2: On Progress (En curso) */}
            <div className="casos-side-card">
              <div className="casos-side-card-head">
                <h4 className="casos-side-card-title">
                  <Activity size={17} color="#0284C7" />
                  En Curso ({inProgress.length})
                </h4>
                {inProgress.length > 0 && (
                  <button
                    type="button"
                    className="casos-side-card-link"
                    onClick={() => setFilterTab('IN_PROGRESS')}
                  >
                    Ver todos <ArrowRight size={12} />
                  </button>
                )}
              </div>

              <div className="casos-mini-list">
                {inProgress.slice(0, 3).map((c) => {
                  const tiempo = getTiempoEnSesion(c.started_at);
                  return (
                    <div
                      key={c.id}
                      className="casos-mini-item"
                      onClick={() => navigate(`/simulacion/${c.id}`)}
                      title="Continuar simulación"
                    >
                      <div className="casos-mini-circle progress">
                        {tiempo.compact}
                      </div>
                      <div className="casos-mini-item-info">
                        <span className="casos-mini-item-title">{c.title}</span>
                        <span className="casos-mini-item-meta">
                          <Clock size={11} /> {fmtHaceTiempo(c.started_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {inProgress.length === 0 && (
                  <div className="casos-mini-empty">
                    No tienes simulaciones activas pendientes.
                  </div>
                )}
              </div>
            </div>

            {/* Widget 3: Completed (Completados Recientes) */}
            <div className="casos-side-card">
              <div className="casos-side-card-head">
                <h4 className="casos-side-card-title">
                  <CheckCircle2 size={17} color="#10B981" />
                  Completados ({completed.length})
                </h4>
                {completed.length > 0 && (
                  <button
                    type="button"
                    className="casos-side-card-link"
                    onClick={() => navigate('/historial')}
                  >
                    Historial <ArrowRight size={12} />
                  </button>
                )}
              </div>

              <div className="casos-mini-list">
                {completed.slice(0, 3).map((c) => {
                  const score = Math.round(c.score || 0);
                  return (
                    <div
                      key={c.id}
                      className="casos-mini-item"
                      onClick={() => navigate('/historial')}
                      title="Ver detalles en historial"
                    >
                      <div className="casos-mini-circle done">
                        <CheckCircle2 size={18} />
                      </div>
                      <div className="casos-mini-item-info">
                        <span className="casos-mini-item-title">{c.title}</span>
                        <span className="casos-mini-item-meta">
                          <span>{score}%</span> · {fmtDate(c.finished_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {completed.length === 0 && (
                  <div className="casos-mini-empty">
                    Aún no has completado casos clínicos.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
