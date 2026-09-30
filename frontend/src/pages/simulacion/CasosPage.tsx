import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, CheckCircle, Loader2, Stethoscope, Clock } from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import {
  listConsultations, GASTRO_SUBTEMAS,
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

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
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

  useEffect(() => {
    let cancelled = false;
    listConsultations()
      .then(list => { if (!cancelled) setConsultations(list); })
      .catch(err => { if (!cancelled) setError(mainAuthErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const inProgress = consultations.filter(c => c.status === 'IN_PROGRESS');
  const completed = consultations.filter(c => c.status === 'COMPLETED');

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
            <h2 className="casos-pg-section-title">En progreso</h2>
            <div className="casos-mod-grid">
              {inProgress.map(c => (
                <div key={c.id} className="casos-mod-card">
                  <div className="casos-mod-card-top">
                    <div className="casos-mod-card-status" data-status="en_progreso" style={{ background: '#FFF7E6', color: '#F59E0B' }}>
                      <Play size={12} /> En progreso
                    </div>
                  </div>
                  <h3 className="casos-mod-card-title">{c.title}</h3>
                  <p className="casos-mod-card-scenario"><Clock size={12} /> Iniciado {fmtDate(c.started_at)}</p>
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
