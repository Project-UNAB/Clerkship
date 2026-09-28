import { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Clock, Info,
  ChevronRight, ChevronDown, Download, BarChart2,
  Check, AlertCircle, Target, Star, ClipboardCheck, Loader2, X, TrendingUp, Award, Eye,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import {
  listHistorial, getEstadisticas, getRetroalimentacion,
  type Consultation, type Estadisticas, type EvaluationResult, type RetroalimentacionResponse,
} from '../../data/consultasApi';
import { mainAuthErrorMessage } from '../../data/mainAuth';

/* ── Custom Select Component ───────────────────────────── */
function CustomSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="hist-custom-select-wrap" ref={ref}>
      <button
        type="button"
        className={`hist-custom-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span>{value}</span>
        <ChevronDown size={14} className={`hist-select-arrow${open ? ' rotated' : ''}`} />
      </button>
      {open && (
        <div className="hist-custom-select-menu">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`hist-custom-select-item${opt === value ? ' active' : ''}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              <span>{opt}</span>
              {opt === value && <Check size={14} className="hist-select-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Difficulty helpers (el backend maneja EASY/MEDIUM/HARD) ─── */
function difficultyToNum(d: string): 1 | 2 | 3 {
  if (d === 'EASY') return 1;
  if (d === 'HARD') return 3;
  return 2;
}

const SPECIALTIES = ['Todos', 'Gastroenterología'];
const STATUS_OPTIONS = ['Todos', 'Completados', 'En progreso'];
const DIFF_OPTIONS = ['Todos', 'Básico', 'Intermedio', 'Avanzado'];
const DATE_OPTIONS = ['Últimos 3 meses', 'Último mes', 'Este año'];

function fmtDate(iso: string) {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleDateString('es-CO', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Básico', 2: 'Intermedio', 3: 'Avanzado' };
const DIFFICULTY_COLOR: Record<number, { bg: string; color: string }> = {
  1: { bg: '#E6F6EC', color: '#10B981' },
  2: { bg: '#FFF7E6', color: '#F59E0B' },
  3: { bg: '#FEE2E2', color: '#EF4444' },
};

const SPEC_COLORS: Record<string, { bg: string; color: string }> = {
  'Gastroenterología': { bg: '#FFE4E6', color: '#E11D48' },
};

// SVG Icono Estómago
const StomachIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6c0-2.2-1.8-4-4-4s-4 1.8-4 4c0 1.1-.9 2-2 2H6c-1.1 0-2 .9-2 2v2c0 3.3 2.7 6 6 6h4c2.2 0 4-1.8 4-4V6z"/>
    <path d="M12 18v2c0 1.1.9 2 2 2h4"/>
  </svg>
);

/* ── Session row ────────────────────────────────────────── */
function SessionRow({ s, delay, onVerDetalle }: { s: Consultation; delay: number; onVerDetalle: (id: string) => void }) {
  const difficulty = difficultyToNum(s.difficulty);
  const dc = DIFFICULTY_COLOR[difficulty];
  const spC = SPEC_COLORS[s.specialty] || SPEC_COLORS['Gastroenterología'];
  const score = s.score ?? 0;
  const isCorrect = score >= 70;
  const finished = s.finished_at || s.started_at || new Date().toISOString();
  const timeStr = new Date(finished).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  return (
    <motion.div
      className="hist-table-row"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: 'easeOut' as const }}
    >
      <div className="hist-td hist-td-caso">
        <div className="hist-td-icon" style={{ background: spC.bg, color: spC.color }}>
          <StomachIcon />
        </div>
        <span className="hist-td-title">{s.title}</span>
      </div>

      <div className="hist-td hist-td-mod">
        <span className="hist-td-tag" data-spec={s.specialty} style={{ color: spC.color, background: spC.bg }}>
          {s.specialty}
        </span>
      </div>

      <div className="hist-td hist-td-diff">
        <span className="hist-td-tag" data-diff={difficulty} style={{ color: dc.color, background: dc.bg }}>
          {DIFFICULTY_LABEL[difficulty]}
        </span>
      </div>

      <div className="hist-td hist-td-date">
        <span>{fmtDate(finished)}</span>
        <span className="hist-td-time-sub">{timeStr}</span>
      </div>

      <div className="hist-td hist-td-time">
        {s.status === 'IN_PROGRESS' ? 'En curso' : '—'}
      </div>

      <div className="hist-td hist-td-acc">
        <span className="hist-acc-val">{score}%</span>
        <div className="hist-acc-track">
          <motion.div
            className="hist-acc-fill"
            style={{
              width: `${score}%`,
              background: isCorrect ? '#10B981' : '#F59E0B'
            }}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.6, delay: delay + 0.1 }}
          />
        </div>
      </div>

      <div className="hist-td hist-td-res">
        {s.status !== 'COMPLETED' ? (
          <div className="hist-res-badge hist-res-warn">
            <Clock size={14} strokeWidth={2.5} /> En progreso
          </div>
        ) : isCorrect ? (
          <div className="hist-res-badge hist-res-ok">
            <Check size={14} strokeWidth={3} /> Correcto
          </div>
        ) : (
          <div className="hist-res-badge hist-res-warn">
            <AlertCircle size={14} strokeWidth={2.5} /> Parcial
          </div>
        )}
      </div>

      <div className="hist-td hist-td-act">
        <button
          className="hist-act-btn-text"
          onClick={() => onVerDetalle(s.id)}
          disabled={s.status !== 'COMPLETED'}
        >
          Ver detalle
        </button>
        <button className="hist-act-btn-icon" onClick={() => onVerDetalle(s.id)} disabled={s.status !== 'COMPLETED'}>
          <BarChart2 size={16} />
        </button>
      </div>
    </motion.div>
  );
}

/* ── Desglose completo de la evaluación (EvaluationResult, cuando viene detailed_rubric) ── */
function EvaluationBreakdown({ ev }: { ev: EvaluationResult }) {
  return (
    <>
      <h2 className="sim-stage-title">Puntaje: {ev.puntaje_global.toFixed(0)} / 100</h2>

      <div className="sim-eval-domains">
        {ev.desglose.map(d => (
          <div key={d.dimension} className="sim-eval-domain">
            <span className="sim-eval-domain-label">
              {d.etiqueta}<em className="sim-eval-domain-weight">({d.peso}%)</em>
            </span>
            <div className="sim-eval-domain-track">
              <div className="sim-eval-domain-fill" style={{ width: `${Math.max(0, Math.min(100, d.puntaje))}%` }} />
            </div>
            <span className="sim-eval-domain-val">{d.puntaje.toFixed(0)}</span>
          </div>
        ))}
      </div>

      <div className="sim-eval-feedback">
        <p className="sim-eval-feedback-title"><Info size={14} /> Retroalimentación</p>
        <p className="sim-eval-feedback-text">{ev.retroalimentacion_formativa}</p>
      </div>

      <div className="sim-eval-cols">
        <div className="sim-eval-col">
          <p className="sim-eval-col-title"><TrendingUp size={14} /> Fortalezas</p>
          <ul className="sim-eval-list">{ev.fortalezas.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div className="sim-eval-col">
          <p className="sim-eval-col-title"><Award size={14} /> Áreas de mejora</p>
          <ul className="sim-eval-list">{ev.aspectos_a_mejorar.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>

      <div className="sim-eval-reveal">
        <p className="sim-eval-reveal-title"><Eye size={14} /> Diagnóstico real revelado</p>
        <p className="sim-eval-reveal-dx">{ev.revelacion.diagnostico_real}</p>
        <p className="sim-eval-reveal-sub">{ev.revelacion.subtema} · dificultad {ev.revelacion.dificultad}</p>
        {ev.revelacion.diferenciales_esperados.length > 0 && (
          <div className="sim-eval-reveal-diff">
            <span>Diferenciales esperados:</span>
            <ul className="sim-eval-list">
              {ev.revelacion.diferenciales_esperados.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Modal de retroalimentación real (Agente 3) ────────────── */
function RetroalimentacionModal({ consultationId, onClose }: { consultationId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RetroalimentacionResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRetroalimentacion(consultationId)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(mainAuthErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [consultationId]);

  const rubric = data?.evaluation.detailed_rubric;

  return (
    <div className="hist-modal-backdrop" onClick={onClose}>
      <motion.div
        className="hist-modal"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <button className="hist-modal-close" onClick={onClose}><X size={16} /></button>

        {loading && <div className="hist-modal-loading"><Loader2 size={24} className="sim-spin" /></div>}
        {error && <p className="sim-error-text">{error}</p>}

        {data && (
          <>
            <p className="sim-eval-mock-badge">{data.consultation.title}</p>
            {rubric ? (
              <EvaluationBreakdown ev={rubric} />
            ) : (
              <>
                <h2 className="sim-stage-title">Puntaje: {data.evaluation.final_score.toFixed(0)} / 100</h2>
                <div className="sim-eval-feedback">
                  <p className="sim-eval-feedback-title"><Info size={14} /> Retroalimentación</p>
                  <p className="sim-eval-feedback-text">
                    {data.evaluation.feedback_summary || 'No hay retroalimentación detallada disponible para esta consulta.'}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────── */
export default function HistorialPage() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [specFilter, setSpecFilter] = useState('Todos');
  const [diffFilter, setDiffFilter] = useState('Todos');
  const [dateFilter, setDateFilter] = useState('Últimos 3 meses');

  const [sessions, setSessions] = useState<Consultation[]>([]);
  const [stats, setStats] = useState<Estadisticas | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listHistorial(), getEstadisticas()])
      .then(([hist, est]) => {
        if (cancelled) return;
        setSessions(hist);
        setStats(est);
      })
      .catch(err => { if (!cancelled) setLoadError(mainAuthErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => sessions.filter(s => {
    const q = query.toLowerCase();
    const matchQ    = !q || s.title.toLowerCase().includes(q) || s.specialty.toLowerCase().includes(q);
    const matchSpec = specFilter === 'Todos' || s.specialty === specFilter;
    const matchStatus = statusFilter === 'Todos'
      || (statusFilter === 'Completados' ? s.status === 'COMPLETED' : s.status === 'IN_PROGRESS');
    const matchDiff = diffFilter === 'Todos' || DIFFICULTY_LABEL[difficultyToNum(s.difficulty)] === diffFilter;
    return matchQ && matchSpec && matchStatus && matchDiff;
  }), [sessions, query, specFilter, statusFilter, diffFilter]);

  const displayed = filtered.slice(0, 6);

  return (
    <div className="dash-root">
      <Sidebar />

      <div className="hist-page-wrapper">
        
        {/* ── Header ── */}
        <div className="hist-pg-header">
          <div className="hist-pg-title-box">
            <h1>Historial de casos clínicos</h1>
            <p>Revisa tu desempeño y métricas de simulación en los casos gastroenterológicos completados.</p>
          </div>
          
          <div className="hist-pg-stats">
            <div className="hist-pg-stat-card">
              <div className="hist-pg-stat-icon" data-stat-type="emerald">
                <ClipboardCheck size={20} />
              </div>
              <div className="hist-pg-stat-info">
                <span className="hist-pg-stat-lbl">Casos completados</span>
                <span className="hist-pg-stat-val">{stats ? stats.completadas : '—'}</span>
              </div>
            </div>

            <div className="hist-pg-stat-card">
              <div className="hist-pg-stat-icon" data-stat-type="sky">
                <Target size={20} />
              </div>
              <div className="hist-pg-stat-info">
                <span className="hist-pg-stat-lbl">Puntaje promedio</span>
                <span className="hist-pg-stat-val">{stats ? `${Math.round(stats.promedio_score)}%` : '—'}</span>
              </div>
            </div>

            <div className="hist-pg-stat-card">
              <div className="hist-pg-stat-icon" data-stat-type="indigo">
                <Clock size={20} />
              </div>
              <div className="hist-pg-stat-info">
                <span className="hist-pg-stat-lbl">En progreso</span>
                <span className="hist-pg-stat-val">{stats ? stats.en_progreso : '—'}</span>
              </div>
            </div>

            <div className="hist-pg-stat-card">
              <div className="hist-pg-stat-icon" data-stat-type="emerald">
                <Star size={20} />
              </div>
              <div className="hist-pg-stat-info">
                <span className="hist-pg-stat-lbl">Mejor puntaje</span>
                <span className="hist-pg-stat-val">{stats ? `${Math.round(stats.puntaje_maximo)}%` : '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {loadError && <p className="sim-error-text" style={{ margin: '0 0 12px' }}>{loadError}</p>}

        {/* ── Custom Filters ── */}
        <div className="hist-pg-filters">
          <div className="hist-filter-group">
            <div className="hist-filter-item">
              <label>Estado</label>
              <CustomSelect
                value={statusFilter}
                options={STATUS_OPTIONS}
                onChange={setStatusFilter}
              />
            </div>
            <div className="hist-filter-item">
              <label>Módulo</label>
              <CustomSelect
                value={specFilter}
                options={SPECIALTIES}
                onChange={setSpecFilter}
              />
            </div>
            <div className="hist-filter-item">
              <label>Dificultad</label>
              <CustomSelect
                value={diffFilter}
                options={DIFF_OPTIONS}
                onChange={setDiffFilter}
              />
            </div>
            <div className="hist-filter-item">
              <label>Fecha</label>
              <CustomSelect
                value={dateFilter}
                options={DATE_OPTIONS}
                onChange={setDateFilter}
              />
            </div>
          </div>
          
          <div className="hist-filter-actions">
            <div className="hist-search-box">
              <Search size={16} className="hist-search-icon" />
              <input 
                type="text" 
                placeholder="Buscar caso..." 
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <button className="hist-export-btn">
              <Download size={16} /> Exportar
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="hist-table-container">
          <div className="hist-table-header">
            <div className="hist-th hist-th-caso">Caso</div>
            <div className="hist-th hist-th-mod">Módulo</div>
            <div className="hist-th hist-th-diff">Dificultad</div>
            <div className="hist-th hist-th-date">Fecha de finalización</div>
            <div className="hist-th hist-th-time">Tiempo empleado</div>
            <div className="hist-th hist-th-acc">Accuracy</div>
            <div className="hist-th hist-th-res">Resultado</div>
            <div className="hist-th hist-th-act">Acciones</div>
          </div>
          
          <div className="hist-table-body">
            {loading ? (
              <div className="hist-empty-state"><Loader2 size={22} className="sim-spin" /></div>
            ) : displayed.length > 0 ? (
              displayed.map((s, i) => <SessionRow key={s.id} s={s} delay={i * 0.05} onVerDetalle={setDetalleId} />)
            ) : (
              <div className="hist-empty-state">
                <p>Todavía no completaste ninguna simulación clínica — andá a "Casos" para empezar una.</p>
              </div>
            )}
          </div>
        </div>

        {detalleId && (
          <RetroalimentacionModal consultationId={detalleId} onClose={() => setDetalleId(null)} />
        )}

        {/* ── Pagination ── */}
        <div className="hist-pagination-bar">
          <span className="hist-page-info">Mostrando {displayed.length} de {filtered.length} casos</span>
          <div className="hist-page-controls">
            <button className="hist-page-btn hist-page-btn-icon"><ChevronRight size={16} style={{transform: 'rotate(180deg)'}} /></button>
            <button className="hist-page-btn hist-page-btn-active">1</button>
            <button className="hist-page-btn">2</button>
            <button className="hist-page-btn hist-page-btn-icon"><ChevronRight size={16} /></button>
          </div>
        </div>

        {/* ── Footer Banner ── */}
        <div className="hist-footer-banner">
          <div className="hist-fb-left">
            <div className="hist-fb-icon"><Info size={20} /></div>
            <div className="hist-fb-text">
              <h4>¿Quieres mejorar tu desempeño?</h4>
              <p>Revisa los casos gastroenterológicos con resultado parcial para identificar oportunidades de mejora.</p>
            </div>
          </div>
          <button className="hist-fb-btn">
            Ver recomendaciones <ChevronRight size={16} />
          </button>
        </div>

      </div>
    </div>
  );
}
