import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, CheckCircle, Send, ChevronRight, Info, ArrowLeft, Stethoscope,
  Loader2, AlertTriangle, TrendingUp, Award, User, Eye, ClipboardList, FileText,
  X, FlaskConical,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import logoUrl from '../../assets/Logo Clerkship.svg';
import {
  ensureCourseId, createConsultation, retryUntilGemini, getConsultation, getFichaPrevia,
  sendMessage as sendPatientMessage, finishConsultation, explorar,
  type CaseDetails, type CatalogoItem, type TipoExploracion,
  type EvaluationResult, type Difficulty, type IdentidadPaciente, type DatosPaciente,
} from '../../data/consultasApi';

/* ═══════════════════════════════════════════════════════════
   Simulación clínica — una sola pantalla, 100% con los agentes reales:
   Agente 1 genera el caso al crear la consulta (selección adaptativa de
   subtema/dificultad), Agente 2 (paciente virtual, con guardrails) conversa,
   `explorar` resuelve maniobras de examen físico / paraclínicos de forma
   determinista (sin IA) y Agente 3 evalúa al finalizar con una fórmula
   ponderada auditable. Todo se guarda en Postgres/Mongo (aparece en Historial).
   ═══════════════════════════════════════════════════════════ */

interface ChatMsg { role: 'student' | 'patient' | 'nota'; text: string; ts: number; }
type Phase = 'interview' | 'diagnosis' | 'result';

interface ExploredEntry {
  tipo: TipoExploracion;
  clave: string;
  etiqueta: string;
  resultado: string;
  tecnica?: string;
  muestra?: string | null;
  fecha_hora_resultado?: string;
  procesando?: boolean;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function splitLines(text: string): string[] {
  return text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
}

function groupByGrupo(items: CatalogoItem[]): [string, CatalogoItem[]][] {
  const map = new Map<string, CatalogoItem[]>();
  for (const it of items) {
    const list = map.get(it.grupo) || [];
    list.push(it);
    map.set(it.grupo, list);
  }
  return Array.from(map.entries());
}

export type ClinicalModule = 'anamnesis' | 'examen_fisico' | 'paraclinicos' | 'completo';

/* ── Tarjeta de resultado tipo "informe de laboratorio" real: nombre de la
   prueba, técnica/muestra (fijas del catálogo, no inventadas por IA) y
   fecha/hora de resultado, igual al formato de un reporte clínico impreso. */
function LabResultCard({ e, procesandoLabel }: { e: ExploredEntry; procesandoLabel: string }) {
  return (
    <div className="sim-sheet-result-card">
      <div className="sim-src-head">
        <span className="sim-src-name">{e.etiqueta}</span>
        {e.tecnica && <span className="sim-src-tecnica">Técnica: {e.tecnica}</span>}
      </div>
      {!e.procesando && (e.fecha_hora_resultado || (e.muestra && e.muestra !== 'N/A')) && (
        <div className="sim-src-meta">
          {e.muestra && e.muestra !== 'N/A' && <span>Muestra: {e.muestra}</span>}
          {e.fecha_hora_resultado && <span>Fecha y hora de resultado: {e.fecha_hora_resultado}</span>}
        </div>
      )}
      <p className="sim-src-val">{e.procesando ? procesandoLabel : e.resultado}</p>
    </div>
  );
}

/* ── Historia Clínica Electrónica Oficial (EHR Formulario Médico Formal) ── */
function HistoriaClinicaEHR({
  c, explored, onExplorar, disabled, messages, activeModule, onSelectModule, onClose,
}: {
  c: CaseDetails;
  explored: Record<string, ExploredEntry>;
  onExplorar: (tipo: TipoExploracion, item: CatalogoItem) => void;
  disabled: boolean;
  messages: ChatMsg[];
  activeModule: ClinicalModule | null;
  onSelectModule: (module: ClinicalModule | null) => void;
  onClose: () => void;
}) {
  const notasHistoria = messages.filter(m => m.role === 'patient');

  const examenItems = c.catalogo_exploracion.examen_fisico;
  const paraclinicoItems = c.catalogo_exploracion.paraclinicos;
  const examenGroups = groupByGrupo(examenItems);
  const paraclinicoGroups = groupByGrupo(paraclinicoItems);

  const doneExamen = Object.values(explored).filter(e => e.tipo === 'examen_fisico');
  const doneParaclinicos = Object.values(explored).filter(e => e.tipo === 'paraclinico');
  const isOpen = activeModule !== null;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const MODULE_META: Record<ClinicalModule, { title: string; subtitle: string }> = {
    anamnesis: {
      title: 'B. ANAMNESIS Y MOTIVO DE CONSULTA',
      subtitle: `Interrogatorio Clínico · Folio N°: HC-${c.paciente.documento || '105661040'}`,
    },
    examen_fisico: {
      title: 'C. EXAMEN FÍSICO DIRIGIDO Y SIGNOS VITALES',
      subtitle: `Exploración Física Determinista · Folio N°: HC-${c.paciente.documento || '105661040'}`,
    },
    paraclinicos: {
      title: 'D. ÓRDENES PARACLÍNICAS Y LABORATORIO',
      subtitle: `Estudios Diagnósticos e Imágenes · Folio N°: HC-${c.paciente.documento || '105661040'}`,
    },
    completo: {
      title: 'E. REGISTRO CONSOLIDADO (EPICRISIS)',
      subtitle: `Consolidado Clínico Global · Folio N°: HC-${c.paciente.documento || '105661040'}`,
    },
  };

  const currentMeta = activeModule ? MODULE_META[activeModule] : MODULE_META.anamnesis;
  const fechaHoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <>
      {/* ── Dock Lateral: Módulos Clínicos Independientes ── */}
      <aside className="sim-ehr-dock" aria-label="Módulos Clínicos Independientes">
        {/* 1. Anamnesis */}
        <button
          type="button"
          className={`sim-ehr-dock-item sim-dock-anam${activeModule === 'anamnesis' ? ' is-active' : ''}`}
          onClick={() => onSelectModule(activeModule === 'anamnesis' ? null : 'anamnesis')}
          title="Abrir Anamnesis y Motivo de Consulta"
        >
          <div className="sim-ehr-dock-icon">
            <ClipboardList size={16} />
          </div>
          <div className="sim-ehr-dock-label-wrap">
            <span className="sim-ehr-dock-title">Anamnesis</span>
            <span className="sim-ehr-dock-sub">Motivo & Cuadro</span>
          </div>
        </button>

        {/* 2. Expediente Completo */}
        <button
          type="button"
          className={`sim-ehr-dock-item sim-dock-comp${activeModule === 'completo' ? ' is-active' : ''}`}
          onClick={() => onSelectModule(activeModule === 'completo' ? null : 'completo')}
          title="Abrir Expediente Consolidado (Epicrisis)"
        >
          <div className="sim-ehr-dock-icon">
            <FileText size={16} />
          </div>
          <div className="sim-ehr-dock-label-wrap">
            <span className="sim-ehr-dock-title">Expediente</span>
            <span className="sim-ehr-dock-sub">Epicrisis Global</span>
          </div>
        </button>
      </aside>

      {/* ── Modal Central: Formulario de Historia Clínica Electrónica Oficial ── */}
      <AnimatePresence>
        {isOpen && activeModule && (
          <div className="sim-ehr-backdrop" onClick={onClose}>
            <motion.div
              className={`sim-ehr-modal sim-ehr-modal-${activeModule}`}
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              {/* Encabezado Formal del Módulo Clínico (estilo formato clínico impreso) */}
              <div className="ehr-modal-header">
                <div className="ehr-header-brand">
                  <img src={logoUrl} alt="Clerkship" className="ehr-logo-img" />
                  <div className="ehr-header-brand-text">
                    <span className="ehr-inst-name">CLÍNICA CLERKSHIP</span>
                    <span className="ehr-inst-tag">Simulación Clínica · Educación Médica</span>
                  </div>
                </div>

                <div className="ehr-header-right">
                  <div className="ehr-header-title-block">
                    <h3 className="ehr-inst-title">HISTORIA CLÍNICA</h3>
                    <span className="ehr-status-pill">
                      <span className="ehr-pulse-dot" /> EN CONSULTA
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ehr-close-btn"
                    onClick={onClose}
                    title="Cerrar módulo (Esc)"
                  >
                    <X size={15} />
                    <span>Cerrar</span>
                    <span className="ehr-esc-key">ESC</span>
                  </button>
                </div>
              </div>

              {/* ── Sección A: Identificación y Filiación del Paciente — SOLO en el Expediente
                   consolidado (es el único "documento" completo tipo hoja clínica impresa;
                   los módulos sueltos de Anamnesis/Examen/Paraclínicos no la repiten) ── */}
              {activeModule === 'completo' && (
              <div className="ehr-patient-section">
                <div className="ehr-section-kicker">A. IDENTIFICACIÓN Y FILIACIÓN DEL PACIENTE</div>
                <div className="ehr-patient-form-grid">
                  <div className="ehr-form-cell ehr-form-cell-wide">
                    <span className="ehr-cell-lbl">Apellidos y Nombres</span>
                    <strong className="ehr-cell-val">{c.paciente.nombre}</strong>
                  </div>
                  <div className="ehr-form-cell">
                    <span className="ehr-cell-lbl">Documento de Identidad</span>
                    <span className="ehr-cell-val">{c.paciente.documento || 'CC 105661040'}</span>
                  </div>
                  <div className="ehr-form-cell">
                    <span className="ehr-cell-lbl">Edad</span>
                    <span className="ehr-cell-val">{c.paciente.edad} años</span>
                  </div>

                  <div className="ehr-form-cell ehr-form-cell-wide">
                    <span className="ehr-cell-lbl">Sexo</span>
                    <div className="ehr-checkbox-row">
                      <span className={`ehr-checkbox-item${c.paciente.sexo === 'M' ? ' checked' : ''}`}>
                        <span className="ehr-checkbox-box">{c.paciente.sexo === 'M' && <Check size={10} strokeWidth={3} />}</span>
                        Masculino
                      </span>
                      <span className={`ehr-checkbox-item${c.paciente.sexo === 'F' ? ' checked' : ''}`}>
                        <span className="ehr-checkbox-box">{c.paciente.sexo === 'F' && <Check size={10} strokeWidth={3} />}</span>
                        Femenino
                      </span>
                    </div>
                  </div>
                  <div className="ehr-form-cell">
                    <span className="ehr-cell-lbl">Ocupación Habitual</span>
                    <span className="ehr-cell-val">{c.paciente.ocupacion || 'Docente universitaria'}</span>
                  </div>
                  <div className="ehr-form-cell">
                    <span className="ehr-cell-lbl">Grupo Sanguíneo y Rh</span>
                    <span className="ehr-cell-val">Tipo {c.paciente.tipo_sangre || 'B+'}</span>
                  </div>

                  <div className="ehr-form-cell">
                    <span className="ehr-cell-lbl">Biometría / Peso</span>
                    <span className="ehr-cell-val">{c.paciente.peso_kg || 62.1} kg</span>
                  </div>
                  <div className="ehr-form-cell">
                    <span className="ehr-cell-lbl">Teléfono de Contacto</span>
                    <span className="ehr-cell-val">{c.paciente.telefono || '311 777 3967'}</span>
                  </div>
                  <div className="ehr-form-cell">
                    <span className="ehr-cell-lbl">Modalidad de Atención</span>
                    <span className="ehr-cell-val">Consulta Externa</span>
                  </div>
                  <div className="ehr-form-cell">
                    <span className="ehr-cell-lbl">Fecha de Consulta</span>
                    <span className="ehr-cell-val">{fechaHoy}</span>
                  </div>
                </div>
              </div>
              )}

              {/* Encabezado del módulo: solo para los accesos rápidos sueltos
                  (Anamnesis/Examen/Paraclínicos) — el Expediente ya queda identificado
                  por la Sección A y no necesita este rótulo adicional */}
              {activeModule !== 'completo' && (
                <>
                  <div className="ehr-section-kicker ehr-section-kicker-module">{currentMeta.title}</div>
                  <p className="ehr-module-subtitle">{currentMeta.subtitle}</p>
                </>
              )}

              {/* Cuerpo del Formulario Clínico Independiente */}
              <div className="ehr-form-body">
                {/* 1. MÓDULO INDEPENDIENTE: ANAMNESIS */}
                {activeModule === 'anamnesis' && (
                    <div className="sim-sheet-page-content">
                      <div className="sim-sheet-card">
                        <div className="sim-sheet-card-head">
                          <Info size={14} />
                          <h4>Motivo de Consulta y Presentación Inicial</h4>
                        </div>
                        <p className="sim-sheet-card-text">{c.presentacion_inicial}</p>
                      </div>

                      <div className="sim-sheet-card">
                        <div className="sim-sheet-card-head">
                          <User size={14} />
                          <h4>Estado Emocional Inicial del Paciente</h4>
                        </div>
                        <p className="sim-sheet-card-text" style={{ textTransform: 'capitalize' }}>
                          {c.estado_emocional_inicial || 'Colaborador y ansioso'}
                        </p>
                      </div>

                      <div className="sim-sheet-card">
                        <div className="sim-sheet-card-head">
                          <ClipboardList size={14} />
                          <h4>Notas Clínicas del Interrogatorio (Respuestas del Paciente)</h4>
                        </div>
                        {notasHistoria.length === 0 ? (
                          <div className="sim-sheet-empty-box">
                            <p>Todavía no has interrogado al paciente.</p>
                            <span>Cierra esta carpeta y dialoga con él en el chat central. A medida que responda, sus declaraciones se transcribirán automáticamente en esta hoja.</span>
                          </div>
                        ) : (
                          <ul className="sim-sheet-notes-list">
                            {notasHistoria.map((m, idx) => (
                              <li key={idx} className="sim-sheet-note-item">
                                <span className="sim-sheet-note-time">{fmtTime(m.ts)}</span>
                                <span className="sim-sheet-note-text">"{m.text}"</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  {/* HOJA 2: Examen Físico */}
                  {activeModule === 'examen_fisico' && (
                    <div className="sim-sheet-page-content">
                      <div className="sim-sheet-section-banner">
                        <div>
                          <h4>Exploración Física Dirigida</h4>
                          <p>Haz clic en cada maniobra para solicitarla al simulador clínico determinista.</p>
                        </div>
                        {doneExamen.length > 0 && (
                          <span className="sim-sheet-progress-pill">{doneExamen.length} exploradas</span>
                        )}
                      </div>

                      <div className="sim-exam-categories-grid">
                        {examenGroups.map(([grupo, items]) => (
                          <div key={grupo} className="sim-sheet-cat-box">
                            <span className="sim-sheet-cat-title">{grupo}</span>
                            <div className="sim-sheet-btn-wrap">
                              {items.map(it => {
                                const key = `examen_fisico:${it.clave}`;
                                const entry = explored[key];
                                const procesando = !!entry?.procesando;
                                const done = !!entry && !procesando;
                                return (
                                  <button
                                    key={it.clave}
                                    type="button"
                                    className={`sim-sheet-exam-btn${done ? ' sim-sheet-exam-btn-done' : ''}`}
                                    disabled={disabled || procesando}
                                    onClick={() => onExplorar('examen_fisico', it)}
                                  >
                                    {procesando ? (
                                      <Loader2 size={12} className="sim-spin" />
                                    ) : done ? (
                                      <CheckCircle size={12} />
                                    ) : null}
                                    <span>{it.etiqueta}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {doneExamen.length > 0 && (
                        <div className="sim-sheet-results-panel">
                          <div className="sim-sheet-card-head">
                            <Stethoscope size={14} />
                            <h4>Hallazgos del Examen Físico</h4>
                          </div>
                          <div className="sim-sheet-results-grid">
                            {doneExamen.map(e => (
                              <LabResultCard key={`res-ef-${e.clave}`} e={e} procesandoLabel="Explorando..." />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* HOJA 3: Paraclínicos */}
                  {activeModule === 'paraclinicos' && (
                    <div className="sim-sheet-page-content">
                      <div className="sim-sheet-section-banner">
                        <div>
                          <h4>Estudios Paraclínicos y Exámenes Complementarios</h4>
                          <p>Ordena los laboratorios, imágenes o trazos diagnósticos necesarios para el caso.</p>
                        </div>
                        {doneParaclinicos.length > 0 && (
                          <span className="sim-sheet-progress-pill">{doneParaclinicos.length} ordenados</span>
                        )}
                      </div>

                      <div className="sim-exam-categories-grid">
                        {paraclinicoGroups.map(([grupo, items]) => (
                          <div key={grupo} className="sim-sheet-cat-box">
                            <span className="sim-sheet-cat-title">{grupo}</span>
                            <div className="sim-sheet-btn-wrap">
                              {items.map(it => {
                                const key = `paraclinico:${it.clave}`;
                                const entry = explored[key];
                                const procesando = !!entry?.procesando;
                                const done = !!entry && !procesando;
                                return (
                                  <button
                                    key={it.clave}
                                    type="button"
                                    className={`sim-sheet-exam-btn${done ? ' sim-sheet-exam-btn-done' : ''}`}
                                    disabled={disabled || procesando}
                                    onClick={() => onExplorar('paraclinico', it)}
                                  >
                                    {procesando ? (
                                      <Loader2 size={12} className="sim-spin" />
                                    ) : done ? (
                                      <CheckCircle size={12} />
                                    ) : null}
                                    <span>{it.etiqueta}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {doneParaclinicos.length > 0 && (
                        <div className="sim-sheet-results-panel">
                          <div className="sim-sheet-card-head">
                            <Award size={14} />
                            <h4>Reportes de Laboratorio e Imágenes</h4>
                          </div>
                          <div className="sim-sheet-results-grid">
                            {doneParaclinicos.map(e => (
                              <LabResultCard key={`res-pc-${e.clave}`} e={e} procesandoLabel="Procesando en laboratorio..." />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* HOJA 4: Expediente Completo — la identificación ya quedó en la Sección A
                      de arriba, así que aquí solo van las secciones B/C/D (sin repetir datos) */}
                  {activeModule === 'completo' && (
                    <div className="sim-sheet-page-content">
                      <div className="sim-sheet-card">
                        <div className="sim-sheet-card-head">
                          <Info size={14} />
                          <h4>B. Anamnesis y Motivo de Consulta</h4>
                        </div>
                        <p className="sim-sheet-card-text"><strong>Motivo:</strong> {c.presentacion_inicial}</p>
                        <p className="sim-sheet-card-text"><strong>Estado emocional:</strong> {c.estado_emocional_inicial || 'Normal'}</p>
                        <h5 style={{ margin: '14px 0 6px', fontSize: '0.8rem', color: 'var(--ink)' }}>Declaraciones del Paciente:</h5>
                        {notasHistoria.length === 0 ? (
                          <p className="sim-sheet-empty-sub">Sin respuestas registradas en el interrogatorio.</p>
                        ) : (
                          <ul className="sim-sheet-notes-list">
                            {notasHistoria.map((m, idx) => (
                              <li key={idx} className="sim-sheet-note-item">
                                <span className="sim-sheet-note-time">{fmtTime(m.ts)}</span>
                                <span className="sim-sheet-note-text">"{m.text}"</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="sim-sheet-card">
                        <div className="sim-sheet-card-head">
                          <Stethoscope size={14} />
                          <h4>C. Examen Físico Dirigido</h4>
                        </div>
                        {doneExamen.length === 0 ? (
                          <p className="sim-sheet-empty-sub">No se han realizado maniobras de exploración física.</p>
                        ) : (
                          <div className="sim-sheet-results-grid">
                            {doneExamen.map(e => (
                              <LabResultCard key={`full-ef-${e.clave}`} e={e} procesandoLabel="Explorando..." />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="sim-sheet-card">
                        <div className="sim-sheet-card-head">
                          <Award size={14} />
                          <h4>D. Órdenes Paraclínicas y Laboratorio</h4>
                        </div>
                        {doneParaclinicos.length === 0 ? (
                          <p className="sim-sheet-empty-sub">No se han ordenado estudios paraclínicos.</p>
                        ) : (
                          <div className="sim-sheet-results-grid">
                            {doneParaclinicos.map(e => (
                              <LabResultCard key={`full-pc-${e.clave}`} e={e} procesandoLabel="Procesando en laboratorio..." />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Entrevista (chat con el Agente 2, centrado en pantalla) ── */
function Interview({
  messages, onSend, onFinish, sending, estadoEmocional, consultaTerminada, paciente,
  onOpenModule, doneExamenCount = 0, doneParaclinicosCount = 0,
}: {
  messages: ChatMsg[]; onSend: (t: string) => void; onFinish: () => void; sending: boolean;
  estadoEmocional: string | null; consultaTerminada: boolean; paciente: DatosPaciente | null;
  onOpenModule?: (module: ClinicalModule) => void;
  doneExamenCount?: number;
  doneParaclinicosCount?: number;
}) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const send = () => {
    const text = input.trim();
    if (!text || sending || consultaTerminada) return;
    setInput('');
    onSend(text);
  };

  return (
    <div className="sim-chat-col sim-chat-col-centered">
      <div className="sim-agent-header">
        <div className="sim-agent-info-group">
          <div className="sim-agent-logo-wrap">
            <img src={paciente?.avatar_url || logoUrl} alt="Paciente" />
          </div>
          <div>
            <span className="sim-agent-name">{paciente?.nombre || 'Paciente virtual'}</span>
            <span className="sim-agent-online">
              {paciente?.edad != null
                ? `${paciente.edad} años${paciente.ocupacion ? ` · ${paciente.ocupacion}` : ''}`
                : <><span className="sim-agent-dot" /> en línea</>}
            </span>
          </div>
          {estadoEmocional && <span className="sim-emo-badge">{estadoEmocional}</span>}
        </div>

        {onOpenModule && (
          <div className="sim-ehr-header-actions-group">
            <button
              type="button"
              className="sim-ehr-header-btn"
              onClick={() => onOpenModule('anamnesis')}
              title="Abrir Anamnesis y Motivo de Consulta"
            >
              <ClipboardList size={13} />
              <span>Anamnesis</span>
            </button>

            <button
              type="button"
              className="sim-ehr-header-btn sim-ehr-header-btn-muted"
              onClick={() => onOpenModule('completo')}
              title="Abrir Expediente Clínico Completo"
            >
              <FileText size={13} />
              <span>Expediente</span>
            </button>
          </div>
        )}
      </div>

      <div className="sim-chat-messages">
        {messages.map((m, i) => m.role === 'nota' ? (
          <div key={i} className="sim-explora-nota">{m.text}</div>
        ) : (
          <motion.div
            key={i}
            className={`sim-bubble-wrap${m.role === 'student' ? ' sim-bubble-wrap-student' : ''}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
          >
            {m.role === 'patient' && <div className="sim-bubble-avatar"><img src={paciente?.avatar_url || logoUrl} alt="" /></div>}
            <div>
              <div className={`sim-bubble sim-bubble-${m.role}`}>{m.text}</div>
              <div className="sim-bubble-meta">{fmtTime(m.ts)}</div>
            </div>
          </motion.div>
        ))}
        {sending && (
          <div className="sim-bubble-wrap">
            <div className="sim-bubble-avatar"><img src={paciente?.avatar_url || logoUrl} alt="" /></div>
            <div className="sim-bubble sim-bubble-patient">
              <div className="sim-typing-dots"><span /><span /><span /></div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {consultaTerminada ? (
        <div className="sim-chat-ended-notice">
          <Info size={15} /> El paciente se despidió — cerrá la consulta con tu diagnóstico.
        </div>
      ) : (
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
      )}

      {/* ── Footer: Examen Físico, Laboratorios y Terminar Consulta ── */}
      <div className="sim-chat-footer">
        {onOpenModule && (
          <div className="sim-footer-actions-left">
            <button
              type="button"
              className="sim-footer-action-btn sim-footer-action-exam"
              onClick={() => onOpenModule('examen_fisico')}
              title="Abrir Examen Físico Dirigido"
            >
              <Stethoscope size={14} />
              <span>Examen Físico</span>
              {doneExamenCount > 0 && (
                <span className="sim-footer-action-badge">{doneExamenCount}</span>
              )}
            </button>

            <button
              type="button"
              className="sim-footer-action-btn sim-footer-action-lab"
              onClick={() => onOpenModule('paraclinicos')}
              title="Abrir Laboratorios y Estudios Paraclínicos"
            >
              <FlaskConical size={14} />
              <span>Laboratorios</span>
              {doneParaclinicosCount > 0 && (
                <span className="sim-footer-action-badge">{doneParaclinicosCount}</span>
              )}
            </button>
          </div>
        )}

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
  onSubmit: (dx: string, differentials: string[], treatmentPlan: string, notes: string) => void;
  onBack: () => void; submitting: boolean; error: string | null;
}) {
  const [dx, setDx] = useState('');
  const [diff, setDiff] = useState('');
  const [plan, setPlan] = useState('');
  const [notes, setNotes] = useState('');
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
          <label className="sim-final-label">Plan de manejo</label>
          <textarea className="sim-final-ta" rows={3} placeholder="Tratamiento, medidas, seguimiento..."
            value={plan} onChange={e => setPlan(e.target.value)} />
        </div>
        <div className="sim-final-field">
          <label className="sim-final-label">Notas adicionales (opcional)</label>
          <textarea className="sim-final-ta" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
      {error && <p className="sim-footer-hint sim-error-text">{error}</p>}
      <div className="sim-stage-footer">
        <button className="sim-btn-ghost-sm" onClick={onBack} disabled={submitting}>
          <ArrowLeft size={14} /> Volver a la entrevista
        </button>
        <button className="sim-btn-submit" disabled={!ready || submitting}
          onClick={() => onSubmit(dx.trim(), splitLines(diff), plan.trim(), notes.trim())}>
          {submitting
            ? <><Loader2 size={16} className="sim-spin" /> Evaluando...</>
            : <><CheckCircle size={16} /> Enviar y recibir retroalimentación</>}
        </button>
      </div>
    </div>
  );
}

/* ── Resultado (Agente 3) ── */
function ResultView({ evaluation, isMock, onHistory, onNew }: {
  evaluation: EvaluationResult; isMock: boolean; onHistory: () => void; onNew: () => void;
}) {
  return (
    <div className="sim-stage-body">
      <div className="sim-stage-header">
        <p className="sim-stage-eyebrow">Retroalimentación · Agente evaluador</p>
        <h2 className="sim-stage-title">
          Puntaje final: {evaluation.puntaje_global.toFixed(0)} / 100
          {isMock && <span className="sim-eval-mock-badge"> (modo demo, sin IA real)</span>}
        </h2>
      </div>

      <div className="sim-eval-domains">
        {evaluation.desglose.map(d => (
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
        <p className="sim-eval-feedback-text">{evaluation.retroalimentacion_formativa}</p>
      </div>

      <div className="sim-eval-cols">
        <div className="sim-eval-col">
          <p className="sim-eval-col-title"><TrendingUp size={14} /> Fortalezas</p>
          <ul className="sim-eval-list">{evaluation.fortalezas.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div className="sim-eval-col">
          <p className="sim-eval-col-title"><Award size={14} /> Áreas de mejora</p>
          <ul className="sim-eval-list">{evaluation.aspectos_a_mejorar.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>

      <div className="sim-eval-reveal">
        <p className="sim-eval-reveal-title"><Eye size={14} /> Diagnóstico real revelado</p>
        <p className="sim-eval-reveal-dx">{evaluation.revelacion.diagnostico_real}</p>
        <p className="sim-eval-reveal-sub">{evaluation.revelacion.subtema} · dificultad {evaluation.revelacion.dificultad}</p>
        {evaluation.revelacion.diferenciales_esperados.length > 0 && (
          <div className="sim-eval-reveal-diff">
            <span>Diferenciales esperados:</span>
            <ul className="sim-eval-list">
              {evaluation.revelacion.diferenciales_esperados.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="sim-stage-footer">
        <button className="sim-btn-ghost-sm" onClick={onNew}>Nuevo caso</button>
        <button className="sim-btn-submit" onClick={onHistory}>
          Ver historial <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}


/* ── Pasos progresivos de la simulación clínica ── */
interface GenerationStep {
  id: string;
  label: string;
}

const GENERATION_STEPS: GenerationStep[] = [
  { id: 'connect', label: 'Iniciando conexión con el sistema médico...' },
  { id: 'patient', label: 'Registrando ficha de admisión del paciente...' },
  { id: 'clinical', label: 'Generando cuadro clínico y antecedentes médicos...' },
  { id: 'exploration', label: 'Configurando examen físico y catálogo de paraclínicos...' },
  { id: 'ready', label: 'Apertura de la sala de consulta médica...' },
];

/* ── Pantalla animada de carga con progreso continuo y ficha previa ── */
function CaseGenerationLoader({
  fichaPrevia,
  loadingStep,
  retryAttempt,
}: {
  fichaPrevia: IdentidadPaciente | null;
  loadingStep: number;
  retryAttempt: number;
}) {
  // Barra de progreso continua de un solo color que se mueve lento y nunca se clava
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    if (loadingStep >= GENERATION_STEPS.length) {
      setProgress(100);
      return;
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev < 32) return prev + 0.8;
        if (prev < 62) return prev + 0.5;
        if (prev < 84) return prev + 0.3;
        if (prev < 94) return prev + 0.1;
        return prev;
      });
    }, 180);

    return () => clearInterval(interval);
  }, [loadingStep]);

  return (
    <motion.div
      key="loader"
      className="sim-root sim-loading-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="sim-loader-wrap">
        <div className="sim-loader-header">
          <h2 className="sim-loader-title">Preparando caso clínico</h2>
          <p className="sim-loader-subtitle">
            Estructurando el paciente virtual y el entorno de consulta médica.
          </p>
        </div>

        {/* Tarjeta dinámica de admisión clínica ("Historia Clínica") */}
        <AnimatePresence mode="wait">
          {fichaPrevia ? (
            <motion.div
              key="patient-card"
              className="sim-patient-admission-card"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                className="sim-pac-top"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.15 }}
              >
                <span className="sim-pac-badge">
                  <FileText size={14} /> Historia Clínica · Admisión
                </span>
              </motion.div>

              <motion.div
                className="sim-pac-name-block"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.85, delay: 0.3 }}
              >
                {fichaPrevia.avatar_url && (
                  <img src={fichaPrevia.avatar_url} alt="" className="sim-pac-avatar" />
                )}
                <div>
                  <span className="sim-pac-label">Paciente</span>
                  <h3 className="sim-pac-name">{fichaPrevia.nombre}</h3>
                </div>
              </motion.div>

              <motion.div
                className="sim-pac-demographics"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.85, delay: 0.5 }}
              >
                <span>{fichaPrevia.edad} años</span>
                <span className="sim-pac-sep">·</span>
                <span>{fichaPrevia.sexo === 'F' ? 'Femenino' : 'Masculino'}</span>
                <span className="sim-pac-sep">·</span>
                <span style={{ fontWeight: 600 }}>{fichaPrevia.ocupacion || (fichaPrevia.sexo === 'F' ? 'Docente universitaria' : 'Docente universitario')}</span>
                <span className="sim-pac-sep">·</span>
                <span>{fichaPrevia.peso_kg} kg</span>
              </motion.div>

              <motion.div
                className="sim-pac-meta"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.85, delay: 0.7 }}
              >
                <span>{fichaPrevia.documento}</span>
                <span className="sim-pac-sep">·</span>
                <span>{fichaPrevia.telefono}</span>
                <span className="sim-pac-sep">·</span>
                <span className="sim-pac-blood-tag">Tipo {fichaPrevia.tipo_sangre}</span>
              </motion.div>
            </motion.div>
          ) : (
            <div
              className="sim-patient-admission-card"
              style={{ opacity: 0.6, borderStyle: 'dashed' }}
            >
              <div className="sim-pac-top">
                <span className="sim-pac-badge">
                  <Loader2 size={13} className="sim-spin" /> Registrando paciente...
                </span>
              </div>
              <div className="sim-pac-name-block">
                <span className="sim-pac-label">Paciente</span>
                <h3 className="sim-pac-name" style={{ color: 'var(--ink3)' }}>Generando perfil demográfico...</h3>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Lista animada de pasos progresivos con iconos reales de lucide-react */}
        {/* Lista animada de pasos progresivos con aparición escalonada */}
        <div className="sim-loader-steps">
          {GENERATION_STEPS.slice(0, Math.min(loadingStep + 2, GENERATION_STEPS.length)).map((step, idx) => {
            const isDone = loadingStep > idx;
            const isActive = loadingStep === idx;
            const isPending = loadingStep < idx;

            return (
              <motion.div
                key={step.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{
                  opacity: isActive ? 1 : isDone ? 0.95 : 0.28,
                  y: 0,
                  scale: isActive ? 1.01 : 1,
                }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                className={`sim-loader-step${isActive ? ' sim-loader-step-active' : ''}${isDone ? ' sim-loader-step-done' : ''}${isPending ? ' sim-loader-step-pending' : ''}`}
              >
                <div className={`sim-loader-step-icon${isDone ? ' sim-loader-step-icon-done' : ''}${isActive ? ' sim-loader-step-icon-active' : ''}${isPending ? ' sim-loader-step-icon-pending' : ''}`}>
                  {isDone ? (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Check size={11} strokeWidth={2.8} />
                    </motion.div>
                  ) : isActive ? (
                    <Loader2 size={11.5} strokeWidth={2.4} className="sim-spin" />
                  ) : (
                    <span className="sim-step-dot" />
                  )}
                </div>

                <div className="sim-loader-step-text">
                  <span className="sim-loader-step-label">{step.label}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Barra de progreso sutil de un solo color con avance continuo */}
        <div className="sim-loader-progress-track">
          <div className="sim-loader-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {retryAttempt > 0 && (
        <div className="sim-toast" role="status">
          <Loader2 size={14} className="sim-spin" />
          <span>Servicio ocupado, reintentando… ({retryAttempt})</span>
        </div>
      )}
    </motion.div>
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
  const [consultationTitle, setConsultationTitle] = useState<string>('');
  const [caseDetails, setCaseDetails] = useState<CaseDetails | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [explored, setExplored] = useState<Record<string, ExploredEntry>>({});
  const [estadoEmocional, setEstadoEmocional] = useState<string | null>(null);
  const [consultaTerminada, setConsultaTerminada] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0); // >0 = esperando a que Gemini responda
  const [activeClinicalModule, setActiveClinicalModule] = useState<ClinicalModule | null>(null);
  // Identidad administrativa (nombre/edad/documento/telefono/tipo de sangre/peso/ocupacion)
  // generada al instante, sin IA — se muestra mientras el Agente Generador
  // arma el resto del caso real (eso sí tarda, llama a Gemini), y viaja como
  // restricción en createConsultation para que sea la misma persona.
  const [fichaPrevia, setFichaPrevia] = useState<IdentidadPaciente | null>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer0: ReturnType<typeof setTimeout> | undefined;
    let timer1: ReturnType<typeof setTimeout> | undefined;
    let timer2: ReturnType<typeof setTimeout> | undefined;
    let timer3: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        let detail;
        if (routeId) {
          setLoadingStep(3);
          detail = await getConsultation(routeId);
          if (detail.status === 'COMPLETED') { navigate('/historial', { replace: true }); return; }
        } else {
          const params = new URLSearchParams(window.location.search);
          // Sin "dificultad" en la URL = automática: la elige el backend
          // según el desempeño histórico del estudiante en el subtema.
          const difficulty = (params.get('dificultad') as Difficulty) || undefined;
          const subtema = params.get('subtema') || undefined;

          // Paso 0: Iniciando conexión...
          setLoadingStep(0);

          const coursePromise = ensureCourseId();
          const fichaPromise = getFichaPrevia();

          // A los 1200ms pasamos a registrar ficha de admisión del paciente
          timer0 = setTimeout(() => {
            if (!cancelled) setLoadingStep(prev => Math.max(prev, 1));
          }, 1200);

          const [courseId, identidad] = await Promise.all([coursePromise, fichaPromise]);
          if (cancelled) return;
          setFichaPrevia(identidad);

          // A los 3400ms activamos paso 2 (Generando cuadro clínico y antecedentes)
          timer1 = setTimeout(() => {
            if (!cancelled) setLoadingStep(prev => Math.max(prev, 2));
          }, 3400);

          // Tiempos más lentos, pausados y relajados mientras Gemini genera el caso
          timer2 = setTimeout(() => {
            if (!cancelled) setLoadingStep(prev => Math.max(prev, 3));
          }, 7400);

          timer3 = setTimeout(() => {
            if (!cancelled) setLoadingStep(prev => Math.max(prev, 4));
          }, 12000);

          detail = await retryUntilGemini(
            () => createConsultation({ course_id: courseId, difficulty, condition: subtema, identidad_paciente: identidad }),
            setRetryAttempt, () => cancelled,
          );
        }
        if (cancelled) return;

        // Marcamos todos los pasos como completados
        setLoadingStep(GENERATION_STEPS.length);

        setConsultationId(detail.id);
        setConsultationTitle(detail.title);
        const cd = detail.case_details as CaseDetails;
        const validCase = cd && typeof cd === 'object' && 'id_caso' in cd ? cd : null;
        setCaseDetails(validCase);
        setEstadoEmocional(validCase?.estado_emocional_inicial || null);
        setMessages((detail.chat_history || []).map(m => ({
          role: m.es_exploracion ? 'nota' as const : (m.sender === 'STUDENT' ? 'student' as const : 'patient' as const),
          text: m.content,
          ts: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
        })));
        if (!routeId) navigate(`/simulacion/${detail.id}`, { replace: true });

        // Pausa suave de 800ms para apreciar que llegó al 100% y se completaron los pasos
        await new Promise(r => setTimeout(r, 800));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo iniciar la consulta.');
      } finally {
        if (!cancelled) {
          clearTimeout(timer0);
          clearTimeout(timer1);
          clearTimeout(timer2);
          clearTimeout(timer3);
          setLoading(false);
          setRetryAttempt(0);
        }
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer0);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
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
      setEstadoEmocional(res.estado_emocional);
      if (res.consulta_terminada) setConsultaTerminada(true);
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

  const handleExplorar = useCallback(async (tipo: TipoExploracion, item: CatalogoItem) => {
    if (!consultationId) return;
    const key = `${tipo}:${item.clave}`;
    setExplored(prev => ({
      ...prev,
      [key]: { tipo, clave: item.clave, etiqueta: item.etiqueta, resultado: '', procesando: true },
    }));
    try {
      const res = await retryUntilGemini(() => explorar(consultationId, tipo, item.clave), setRetryAttempt);
      setRetryAttempt(0);
      const revealDelayMs = Math.min(Math.max(res.demora_segundos, 0) * 1000, 4000);
      const reveal = () => {
        setExplored(prev => ({
          ...prev,
          [key]: {
            tipo, clave: item.clave, etiqueta: res.etiqueta, resultado: res.resultado, procesando: false,
            tecnica: res.tecnica, muestra: res.muestra, fecha_hora_resultado: res.fecha_hora_resultado,
          },
        }));
      };
      if (revealDelayMs > 0) setTimeout(reveal, revealDelayMs); else reveal();

      if (res.requiere_reaccion_paciente && res.mensaje_para_paciente) {
        setMessages(m => [...m, { role: 'nota', text: `🔍 Examinó: ${res.etiqueta}`, ts: Date.now() }]);
        setSending(true);
        try {
          const chatRes = await retryUntilGemini(
            () => sendPatientMessage(consultationId, res.mensaje_para_paciente as string), setRetryAttempt,
          );
          setRetryAttempt(0);
          setEstadoEmocional(chatRes.estado_emocional);
          if (chatRes.consulta_terminada) setConsultaTerminada(true);
          setMessages(m => [...m, {
            role: 'patient', text: chatRes.reply.content,
            ts: chatRes.reply.timestamp ? new Date(chatRes.reply.timestamp).getTime() : Date.now(),
          }]);
        } finally {
          setSending(false);
          setRetryAttempt(0);
        }
      }
    } catch (err) {
      setExplored(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setMessages(m => [...m, {
        role: 'nota',
        text: `No se pudo explorar "${item.etiqueta}": ${err instanceof Error ? err.message : 'error'}`,
        ts: Date.now(),
      }]);
    }
  }, [consultationId]);

  const handleSubmit = useCallback(async (
    dx: string, differentials: string[], treatmentPlan: string, notes: string,
  ) => {
    if (!consultationId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      const res = await retryUntilGemini(() => finishConsultation(consultationId, {
        final_diagnosis: dx,
        differential_diagnoses: differentials,
        treatment_plan: treatmentPlan || undefined,
        notes: notes || undefined,
        duration_seconds: durationSeconds,
      }), setRetryAttempt);
      setRetryAttempt(0);
      setEvaluation(res.evaluation);
      setIsMock(!!res.is_mock);
      setPhase('result');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo evaluar la consulta.');
    } finally {
      setSubmitting(false);
      setRetryAttempt(0);
    }
  }, [consultationId]);

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <CaseGenerationLoader
          key="loader"
          fichaPrevia={fichaPrevia}
          loadingStep={loadingStep}
          retryAttempt={retryAttempt}
        />
      ) : loadError || !consultationId || !caseDetails ? (
        <motion.div
          key="error"
          className="sim-root sim-loading-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="sim-loading-box sim-error-box">
            <AlertTriangle size={28} />
            <p>{loadError || 'No se pudo iniciar la consulta.'}</p>
            <button className="sim-btn-next sim-btn-next-sm" onClick={() => navigate('/casos')}>
              Volver a Casos clínicos
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="simulation"
          className="sim-root"
          initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className="sim-topbar">
            <div className="sim-tb-left">
              <img src={logoUrl} alt="Clerkship" className="sim-tb-logo" />
              <button className="sim-tb-back" onClick={() => navigate('/casos')}>
                <ArrowLeft size={14} /> Casos clínicos
              </button>
            </div>
            <div className="sim-tb-center">
              <span className="sim-tb-case-ico"><Stethoscope size={16} /></span>
              <span className="sim-tb-case-title">{consultationTitle}</span>
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
            <div className="sim-interview-layout">
              <Interview
                messages={messages} onSend={handleSend} onFinish={() => setPhase('diagnosis')} sending={sending}
                estadoEmocional={estadoEmocional} consultaTerminada={consultaTerminada} paciente={caseDetails?.paciente || null}
                onOpenModule={setActiveClinicalModule}
                doneExamenCount={Object.values(explored).filter(e => e.tipo === 'examen_fisico').length}
                doneParaclinicosCount={Object.values(explored).filter(e => e.tipo === 'paraclinico').length}
              />
              {caseDetails && (
                <HistoriaClinicaEHR
                  c={caseDetails} explored={explored} onExplorar={handleExplorar} disabled={sending} messages={messages}
                  activeModule={activeClinicalModule} onSelectModule={setActiveClinicalModule} onClose={() => setActiveClinicalModule(null)}
                />
              )}
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
              <ResultView evaluation={evaluation} isMock={isMock}
                onHistory={() => navigate('/historial')} onNew={() => navigate('/casos')} />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
