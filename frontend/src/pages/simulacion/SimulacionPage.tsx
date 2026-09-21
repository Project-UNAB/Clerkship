import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle, Send, ChevronRight, Info, ArrowLeft, Stethoscope,
  Loader2, AlertTriangle, TrendingUp, Award, XCircle, User, Activity,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import logoUrl from '../../assets/Logo Clerkship.svg';
import {
  ensureCourseId, createConsultation, retryUntilGemini, getConsultation,
  sendMessage as sendPatientMessage, finishConsultation,
  type PublicCase, type EvaluationResult, type Difficulty,
} from '../../data/consultasApi';

/* ═══════════════════════════════════════════════════════════
   Simulación clínica — una sola pantalla, 100% con los agentes reales:
   Agente 1 genera el caso al crear la consulta, Agente 2 (paciente
   virtual, con guardrail anti-fuga de diagnóstico) conversa, y Agente 3
   evalúa al finalizar. Todo se guarda en Postgres/Mongo (aparece en Historial).
   ═══════════════════════════════════════════════════════════ */

interface ChatMsg { role: 'student' | 'patient'; text: string; ts: number; }
type Phase = 'interview' | 'diagnosis' | 'result';

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function splitLines(text: string): string[] {
  return text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
}

/* ── Panel derecho: ficha del caso (solo lo que el estudiante puede ver) ── */
function CaseSheet({ c }: { c: PublicCase }) {
  const v = c.vital_signs;
  return (
    <aside className="sim-hc-panel">
      <div className="sim-hc-header">
        <h2 className="sim-hc-title">Ficha del paciente</h2>
      </div>
      <div className="sim-hc-sections">
        <div className="sim-hc-section">
          <div className="sim-hc-sec-head">
            <span className="sim-hc-sec-num-title"><User size={13} /> Paciente</span>
          </div>
          <div className="sim-hc-sec-body">
            <p>{c.demographics.gender === 'M' ? 'Masculino' : 'Femenino'}, {c.demographics.age} años · {c.demographics.occupation}</p>
          </div>
        </div>

        <div className="sim-hc-section">
          <div className="sim-hc-sec-head">
            <span className="sim-hc-sec-num-title"><Activity size={13} /> Signos vitales</span>
          </div>
          <ul className="sim-hc-sec-body">
            <li><strong>TA:</strong> {v.blood_pressure} mmHg</li>
            <li><strong>FC:</strong> {v.heart_rate} lpm</li>
            <li><strong>FR:</strong> {v.respiratory_rate} rpm</li>
            <li><strong>Temp:</strong> {v.temperature} °C</li>
            <li><strong>SpO₂:</strong> {v.oxygen_saturation} %</li>
          </ul>
        </div>

        {Object.keys(c.physical_exam || {}).length > 0 && (
          <div className="sim-hc-section">
            <div className="sim-hc-sec-head">
              <span className="sim-hc-sec-num-title"><Stethoscope size={13} /> Examen físico</span>
            </div>
            <ul className="sim-hc-sec-body">
              {Object.entries(c.physical_exam).map(([k, val]) => (
                <li key={k}><strong>{k.replace(/_/g, ' ')}:</strong> {val}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="sim-input-tip" style={{ padding: '0 4px' }}>
          Los antecedentes y la historia del cuadro los obtenés preguntándole al paciente.
        </p>
      </div>
    </aside>
  );
}

/* ── Entrevista (chat con el Agente 2) ── */
function Interview({
  messages, onSend, onFinish, sending,
}: {
  messages: ChatMsg[]; onSend: (t: string) => void; onFinish: () => void; sending: boolean;
}) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const send = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    onSend(text);
  };

  return (
    <div className="sim-chat-col">
      <div className="sim-agent-header">
        <div className="sim-agent-logo-wrap"><img src={logoUrl} alt="Paciente" /></div>
        <div>
          <span className="sim-agent-name">Paciente virtual</span>
          <span className="sim-agent-online"><span className="sim-agent-dot" /> en línea</span>
        </div>
      </div>

      <div className="sim-chat-messages">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            className={`sim-bubble-wrap${m.role === 'student' ? ' sim-bubble-wrap-student' : ''}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
          >
            {m.role === 'patient' && <div className="sim-bubble-avatar"><img src={logoUrl} alt="" /></div>}
            <div>
              <div className={`sim-bubble sim-bubble-${m.role}`}>{m.text}</div>
              <div className="sim-bubble-meta">{fmtTime(m.ts)}</div>
            </div>
          </motion.div>
        ))}
        {sending && (
          <div className="sim-bubble-wrap">
            <div className="sim-bubble-avatar"><img src={logoUrl} alt="" /></div>
            <div className="sim-bubble sim-bubble-patient">
              <div className="sim-typing-dots"><span /><span /><span /></div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sim-input-area">
        <div className="sim-input-row">
          <input
            className="sim-input-field"
            placeholder="Hacé una pregunta al paciente..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            disabled={sending}
          />
          <button className="sim-input-send" onClick={send} disabled={!input.trim() || sending}>
            <Send size={15} />
          </button>
        </div>
      </div>

      <div className="sim-chat-footer">
        <button className="sim-btn-next sim-btn-next-sm" onClick={onFinish}>
          Terminar entrevista y emitir diagnóstico <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

/* ── Diagnóstico final (dispara al Agente 3) ── */
function DiagnosisForm({
  onSubmit, onBack, submitting, error,
}: {
  onSubmit: (dx: string, differentials: string[], tests: string[]) => void;
  onBack: () => void; submitting: boolean; error: string | null;
}) {
  const [dx, setDx] = useState('');
  const [diff, setDiff] = useState('');
  const [tests, setTests] = useState('');
  const ready = dx.trim().length > 0;

  return (
    <div className="sim-stage-body">
      <div className="sim-stage-header">
        <p className="sim-stage-eyebrow">Cierre de la consulta</p>
        <h2 className="sim-stage-title">Diagnóstico y evaluación</h2>
        <p className="sim-stage-desc">El agente evaluador compara tu razonamiento contra la rúbrica del caso.</p>
      </div>
      <div className="sim-final-form">
        <div className="sim-final-field">
          <label className="sim-final-label">Diagnóstico principal *</label>
          <input className="sim-final-input" placeholder="Ej: Pancreatitis aguda de origen biliar"
            value={dx} onChange={e => setDx(e.target.value)} />
        </div>
        <div className="sim-final-field">
          <label className="sim-final-label">Diagnósticos diferenciales (uno por línea)</label>
          <textarea className="sim-final-ta" rows={3} value={diff} onChange={e => setDiff(e.target.value)} />
        </div>
        <div className="sim-final-field">
          <label className="sim-final-label">Exámenes que solicitarías (uno por línea)</label>
          <textarea className="sim-final-ta" rows={3} value={tests} onChange={e => setTests(e.target.value)} />
        </div>
      </div>
      {error && <p className="sim-footer-hint sim-error-text">{error}</p>}
      <div className="sim-stage-footer">
        <button className="sim-btn-ghost-sm" onClick={onBack} disabled={submitting}>
          <ArrowLeft size={14} /> Volver a la entrevista
        </button>
        <button className="sim-btn-submit" disabled={!ready || submitting}
          onClick={() => onSubmit(dx.trim(), splitLines(diff), splitLines(tests))}>
          {submitting
            ? <><Loader2 size={16} className="sim-spin" /> Evaluando...</>
            : <><CheckCircle size={16} /> Enviar y recibir retroalimentación</>}
        </button>
      </div>
    </div>
  );
}

/* ── Resultado (Agente 3) ── */
function ResultView({ evaluation, onHistory, onNew }: {
  evaluation: EvaluationResult; onHistory: () => void; onNew: () => void;
}) {
  const domains: [string, number][] = [
    ['Anamnesis', evaluation.domain_scores.anamnesis],
    ['Exámenes solicitados', evaluation.domain_scores.diagnostic_tests],
    ['Hipótesis diferenciales', evaluation.domain_scores.differential_hypotheses],
    ['Diagnóstico final', evaluation.domain_scores.final_diagnosis],
  ];
  return (
    <div className="sim-stage-body">
      <div className="sim-stage-header">
        <p className="sim-stage-eyebrow">Retroalimentación · Agente evaluador</p>
        <h2 className="sim-stage-title">
          Puntaje final: {evaluation.final_score.toFixed(0)} / 100
          {evaluation.is_mock && <span className="sim-eval-mock-badge"> (modo demo, sin IA real)</span>}
        </h2>
      </div>

      <div className="sim-eval-domains">
        {domains.map(([label, val]) => (
          <div key={label} className="sim-eval-domain">
            <span className="sim-eval-domain-label">{label}</span>
            <div className="sim-eval-domain-track">
              <div className="sim-eval-domain-fill" style={{ width: `${Math.max(0, Math.min(100, val))}%` }} />
            </div>
            <span className="sim-eval-domain-val">{val.toFixed(0)}</span>
          </div>
        ))}
      </div>

      <div className="sim-eval-feedback">
        <p className="sim-eval-feedback-title"><Info size={14} /> Retroalimentación</p>
        <p className="sim-eval-feedback-text">{evaluation.feedback_summary}</p>
      </div>

      <div className="sim-eval-cols">
        <div className="sim-eval-col">
          <p className="sim-eval-col-title"><TrendingUp size={14} /> Fortalezas</p>
          <ul className="sim-eval-list">{evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div className="sim-eval-col">
          <p className="sim-eval-col-title"><Award size={14} /> Áreas de mejora</p>
          <ul className="sim-eval-list">{evaluation.areas_for_improvement.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>

      {evaluation.detected_biases.length > 0 && (
        <div className="sim-eval-biases">
          <p className="sim-eval-col-title"><AlertTriangle size={14} /> Sesgos cognitivos evaluados</p>
          {evaluation.detected_biases.map((b, i) => (
            <div key={i} className={`sim-eval-bias${b.detected ? ' sim-eval-bias-active' : ''}`}>
              {b.detected ? <AlertTriangle size={13} /> : <XCircle size={13} />}
              <div>
                <strong>{b.bias_name}</strong>
                {b.explanation && <p>{b.explanation}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sim-stage-footer">
        <button className="sim-btn-ghost-sm" onClick={onNew}>Nuevo caso</button>
        <button className="sim-btn-submit" onClick={onHistory}>
          Ver historial <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Página
   /simulacion            → crea un caso nuevo (query ?dificultad=&subtema=)
   /simulacion/:id        → retoma una consulta en curso
   ═══════════════════════════════════════════════════════════ */
export default function SimulacionPage() {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();

  const [phase, setPhase] = useState<Phase>('interview');
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [caseDetails, setCaseDetails] = useState<PublicCase | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0); // >0 = esperando a que Gemini responda

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let detail;
        if (routeId) {
          detail = await getConsultation(routeId);
          if (detail.status === 'COMPLETED') { navigate('/historial', { replace: true }); return; }
        } else {
          const params = new URLSearchParams(window.location.search);
          const difficulty = (params.get('dificultad') as Difficulty) || 'MEDIUM';
          const subtema = params.get('subtema') || undefined;
          const courseId = await ensureCourseId();
          detail = await retryUntilGemini(
            () => createConsultation({ course_id: courseId, difficulty, condition: subtema }),
            setRetryAttempt, () => cancelled,
          );
        }
        if (cancelled) return;
        setConsultationId(detail.id);
        setCaseDetails((detail.case_details as PublicCase) || null);
        setMessages((detail.chat_history || []).map(m => ({
          role: m.sender === 'STUDENT' ? 'student' : 'patient',
          text: m.content,
          ts: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
        })));
        if (!routeId) navigate(`/simulacion/${detail.id}`, { replace: true });
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo iniciar la consulta.');
      } finally {
        if (!cancelled) { setLoading(false); setRetryAttempt(0); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const handleSend = useCallback(async (text: string) => {
    if (!consultationId) return;
    setMessages(m => [...m, { role: 'student', text, ts: Date.now() }]);
    setSending(true);
    try {
      const res = await retryUntilGemini(
        () => sendPatientMessage(consultationId, text), setRetryAttempt,
      );
      setRetryAttempt(0);
      setMessages(m => [...m, {
        role: 'patient', text: res.reply.content,
        ts: res.reply.timestamp ? new Date(res.reply.timestamp).getTime() : Date.now(),
      }]);
    } catch (err) {
      setMessages(m => [...m, {
        role: 'patient',
        text: `(No se pudo obtener respuesta: ${err instanceof Error ? err.message : 'error'})`,
        ts: Date.now(),
      }]);
    } finally {
      setSending(false);
      setRetryAttempt(0);
    }
  }, [consultationId]);

  const handleSubmit = useCallback(async (dx: string, differentials: string[], tests: string[]) => {
    if (!consultationId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await retryUntilGemini(() => finishConsultation(consultationId, {
        final_diagnosis: dx, differential_diagnoses: differentials, requested_tests: tests,
      }), setRetryAttempt);
      setRetryAttempt(0);
      setEvaluation(res.evaluation);
      setPhase('result');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo evaluar la consulta.');
    } finally {
      setSubmitting(false);
      setRetryAttempt(0);
    }
  }, [consultationId]);

  if (loading) {
    return (
      <div className="sim-root sim-loading-root">
        <div className="sim-loading-box">
          <Loader2 size={28} className="sim-spin" />
          <p>El agente generador está preparando tu caso clínico...</p>
        </div>
        {retryAttempt > 0 && (
          <div className="sim-toast" role="status">
            <Loader2 size={14} className="sim-spin" />
            <span>Gemini está ocupado, reintentando… ({retryAttempt})</span>
          </div>
        )}
      </div>
    );
  }

  if (loadError || !consultationId || !caseDetails) {
    return (
      <div className="sim-root sim-loading-root">
        <div className="sim-loading-box sim-error-box">
          <AlertTriangle size={28} />
          <p>{loadError || 'No se pudo iniciar la consulta.'}</p>
          <button className="sim-btn-next sim-btn-next-sm" onClick={() => navigate('/casos')}>
            Volver a Casos clínicos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sim-root">
      <header className="sim-topbar">
        <div className="sim-tb-left">
          <img src={logoUrl} alt="Clerkship" className="sim-tb-logo" />
          <button className="sim-tb-back" onClick={() => navigate('/casos')}>
            <ArrowLeft size={14} /> Casos clínicos
          </button>
        </div>
        <div className="sim-tb-center">
          <span className="sim-tb-case-ico"><Stethoscope size={16} /></span>
          <span className="sim-tb-case-title">{caseDetails.title}</span>
        </div>
        <div className="sim-tb-right" />
      </header>

      {retryAttempt > 0 && (
        <div className="sim-toast" role="status">
          <Loader2 size={14} className="sim-spin" />
          <span>Gemini está ocupado, reintentando… ({retryAttempt})</span>
        </div>
      )}

      {phase === 'interview' && (
        <div className="sim-2col">
          <Interview messages={messages} onSend={handleSend} onFinish={() => setPhase('diagnosis')} sending={sending} />
          <CaseSheet c={caseDetails} />
        </div>
      )}

      {phase === 'diagnosis' && (
        <div className="sim-body-full">
          <DiagnosisForm onSubmit={handleSubmit} onBack={() => setPhase('interview')}
            submitting={submitting} error={submitError} />
        </div>
      )}

      {phase === 'result' && evaluation && (
        <div className="sim-body-full">
          <ResultView evaluation={evaluation} onHistory={() => navigate('/historial')} onNew={() => navigate('/casos')} />
        </div>
      )}
    </div>
  );
}
