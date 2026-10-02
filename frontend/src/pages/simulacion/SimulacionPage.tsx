import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type ReactElement, type CSSProperties, type ForwardRefExoticComponent, type RefAttributes,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, CheckCircle, Send, ChevronRight, ChevronLeft, Info, ArrowLeft, Stethoscope,
  Loader2, AlertTriangle, TrendingUp, Award, User, Eye, ClipboardList, FileText,
  X, FlaskConical, Sparkles, Shuffle, FolderOpen,
} from 'lucide-react';
import HTMLFlipBookRaw from 'react-pageflip';
import { useNavigate, useParams } from 'react-router-dom';
import logoUrl from '../../assets/Logo Clerkship.svg';

/* El tipado de react-pageflip exige TODAS las propiedades de configuracion
   como requeridas (defecto de la libreria, no del componente real: a nivel
   de ejecucion las rellena internamente la clase PageFlip). Se relaja aqui
   una sola vez a un set de props realmente opcionales, en vez de pelear con
   el tipo original en cada uso. */
const HTMLFlipBook = HTMLFlipBookRaw as unknown as ForwardRefExoticComponent<{
  width: number; height: number;
  size?: 'fixed' | 'stretch';
  minWidth?: number; maxWidth?: number; minHeight?: number; maxHeight?: number;
  showCover?: boolean;
  usePortrait?: boolean;
  autoSize?: boolean;
  drawShadow?: boolean;
  maxShadowOpacity?: number;
  mobileScrollSupport?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & RefAttributes<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void } }>>;
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

/* ── Banco de preguntas de anamnesis sugeridas (semiología general, no
   atadas a ningún caso ni diagnóstico — no filtran nada del caso oculto) ── */
const BANCO_PREGUNTAS_SUGERIDAS = [
  '¿Desde cuándo tiene las molestias?',
  '¿Cómo describiría el dolor (punzante, cólico, ardor, pesadez)?',
  '¿El dolor se irradia hacia algún lado?',
  '¿Qué lo alivia o qué lo empeora?',
  '¿Ha tenido fiebre?',
  '¿Ha tenido náuseas o vómito?',
  '¿Cómo han sido sus deposiciones últimamente?',
  '¿Toma algún medicamento actualmente?',
  '¿Tiene alguna enfermedad o cirugía previa?',
  '¿Ha perdido peso sin proponérselo?',
  '¿Fuma o consume alcohol?',
  '¿Alguien en su familia ha tenido algo parecido?',
  '¿La molestia tiene relación con las comidas?',
  '¿En qué parte del abdomen le duele exactamente?',
];

function elegirSugerencias(n: number): string[] {
  const copia = [...BANCO_PREGUNTAS_SUGERIDAS];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
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

/* ── Agrupa los paraclínicos ya solicitados por su departamento real de
   laboratorio (Química, Hematología, Inmunología/Serología, Uroanálisis,
   Coprología, Imágenes, Procedimientos), en el mismo orden que el
   catálogo, para armar una "hoja" independiente por grupo. */
function agruparPorDepartamento(
  done: ExploredEntry[], catalogo: CatalogoItem[],
): [string, ExploredEntry[]][] {
  const grupos = groupByGrupo(catalogo);
  return grupos
    .map(([grupo, items]): [string, ExploredEntry[]] => {
      const claves = new Set(items.map(it => it.clave));
      return [grupo, done.filter(e => claves.has(e.clave))];
    })
    .filter(([, items]) => items.length > 0);
}

/* ── Hoja de resultados por departamento, igual a un reporte de
   laboratorio real (orden de servicio, identificación del paciente y
   titulo del departamento en mayúsculas), con el logo de Clerkship. ── */
function LabDepartmentSheet({ grupo, items, paciente, folio }: {
  grupo: string;
  items: ExploredEntry[];
  paciente: DatosPaciente;
  folio: string;
}) {
  return (
    <div className="sim-lab-sheet">
      <div className="sim-lab-sheet-header">
        <img src={logoUrl} alt="Clerkship" className="sim-lab-sheet-logo" />
        <div className="sim-lab-sheet-header-info">
          <div className="sim-lab-sheet-orden">
            <span className="sim-lab-sheet-orden-lbl">Orden de Servicio</span>
            <strong>{folio}</strong>
          </div>
          <div className="sim-lab-sheet-header-grid">
            <span><strong>Paciente:</strong> {paciente.nombre}</span>
            <span><strong>Sexo:</strong> {paciente.sexo === 'F' ? 'Femenino' : 'Masculino'}</span>
            <span><strong>Edad:</strong> {paciente.edad} años</span>
            <span><strong>Identificación:</strong> {paciente.documento || 'N/A'}</span>
            <span><strong>Teléfono:</strong> {paciente.telefono || 'N/A'}</span>
            <span><strong>Cliente:</strong> Clerkship · Simulación Clínica</span>
          </div>
        </div>
      </div>
      <div className="sim-lab-sheet-title">{grupo}</div>
      <div className="sim-lab-sheet-body">
        {items.map(e => (
          <LabResultCard key={`${grupo}-${e.clave}`} e={e} procesandoLabel="Procesando en laboratorio..." />
        ))}
      </div>
    </div>
  );
}

/* ── Carpeta de Documentos: historia clínica completa en formato "revista",
   con animación real de pasar hoja (react-pageflip), tamaño carta y la
   misma estructura del reporte de laboratorio real (logo Clerkship, orden
   de servicio, identificación del paciente, una hoja por departamento). ── */
function DocumentsFlipbook({ c, explored, messages, onClose }: {
  c: CaseDetails;
  explored: Record<string, ExploredEntry>;
  messages: ChatMsg[];
  onClose: () => void;
}) {
  const bookRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void } } | null>(null);
  const notasHistoria = messages.filter(m => m.role === 'patient');
  const doneExamen = Object.values(explored).filter(e => e.tipo === 'examen_fisico');
  const doneParaclinicos = Object.values(explored).filter(e => e.tipo === 'paraclinico');
  const departamentos = agruparPorDepartamento(doneParaclinicos, c.catalogo_exploracion.paraclinicos);
  const folio = `HC-${c.paciente.documento || '105661040'}`;
  const fechaHoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // react-pageflip clona cada hijo directo con React.cloneElement SIN filtrar
  // antes los "false"/"null" que deja un `{cond && <div/>}` (a diferencia de
  // como React los ignora al renderizar normal) — por eso las páginas del
  // libro se arman acá como un array ya 100% filtrado, nunca como JSX
  // condicional directo dentro de <HTMLFlipBook>, o truena con
  // "argument must be a React element".
  const paginas: ReactElement[] = [
    <div className="sim-doc-page sim-doc-cover" key="portada">
      <img src={logoUrl} alt="Clerkship" className="sim-doc-cover-logo" />
      <h2>Historia Clínica</h2>
      <p className="sim-doc-cover-name">{c.paciente.nombre}</p>
      <p className="sim-doc-cover-meta">Folio {folio} · {fechaHoy}</p>
    </div>,

    <div className="sim-doc-page" key="identificacion">
      <h3 className="sim-doc-page-title">A. Identificación y Filiación del Paciente</h3>
      <div className="ehr-patient-form-grid sim-doc-id-grid">
        <div className="ehr-form-cell ehr-form-cell-wide">
          <span className="ehr-cell-lbl">Apellidos y Nombres</span>
          <strong className="ehr-cell-val">{c.paciente.nombre}</strong>
        </div>
        <div className="ehr-form-cell">
          <span className="ehr-cell-lbl">Documento de Identidad</span>
          <span className="ehr-cell-val">{c.paciente.documento || 'N/A'}</span>
        </div>
        <div className="ehr-form-cell">
          <span className="ehr-cell-lbl">Edad</span>
          <span className="ehr-cell-val">{c.paciente.edad} años</span>
        </div>
        <div className="ehr-form-cell">
          <span className="ehr-cell-lbl">Sexo</span>
          <span className="ehr-cell-val">{c.paciente.sexo === 'F' ? 'Femenino' : 'Masculino'}</span>
        </div>
        <div className="ehr-form-cell">
          <span className="ehr-cell-lbl">Ocupación</span>
          <span className="ehr-cell-val">{c.paciente.ocupacion || 'N/A'}</span>
        </div>
        <div className="ehr-form-cell">
          <span className="ehr-cell-lbl">Grupo Sanguíneo y Rh</span>
          <span className="ehr-cell-val">Tipo {c.paciente.tipo_sangre || 'N/A'}</span>
        </div>
        <div className="ehr-form-cell">
          <span className="ehr-cell-lbl">Biometría / Peso</span>
          <span className="ehr-cell-val">{c.paciente.peso_kg || 'N/A'} kg</span>
        </div>
        <div className="ehr-form-cell">
          <span className="ehr-cell-lbl">Teléfono</span>
          <span className="ehr-cell-val">{c.paciente.telefono || 'N/A'}</span>
        </div>
      </div>
    </div>,

    <div className="sim-doc-page" key="anamnesis">
      <h3 className="sim-doc-page-title">B. Anamnesis y Motivo de Consulta</h3>
      <p className="sim-sheet-card-text"><strong>Motivo:</strong> {c.presentacion_inicial}</p>
      <p className="sim-sheet-card-text"><strong>Estado emocional:</strong> {c.estado_emocional_inicial || 'Normal'}</p>
      {notasHistoria.length > 0 && (
        <>
          <h4 className="sim-doc-sub-title">Declaraciones del Paciente</h4>
          <ul className="sim-sheet-notes-list">
            {notasHistoria.map((m, idx) => (
              <li key={idx} className="sim-sheet-note-item">
                <span className="sim-sheet-note-time">{fmtTime(m.ts)}</span>
                <span className="sim-sheet-note-text">"{m.text}"</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>,
  ];

  if (doneExamen.length > 0) {
    paginas.push(
      <div className="sim-doc-page" key="examen-fisico">
        <h3 className="sim-doc-page-title">C. Examen Físico Dirigido</h3>
        {doneExamen.map(e => (
          <LabResultCard key={e.clave} e={e} procesandoLabel="Explorando..." />
        ))}
      </div>,
    );
  }

  for (const [grupo, items] of departamentos) {
    paginas.push(
      <div className="sim-doc-page sim-doc-page-lab" key={grupo}>
        <LabDepartmentSheet grupo={grupo} items={items} paciente={c.paciente} folio={folio} />
      </div>,
    );
  }

  return (
    <div className="sim-docs-backdrop">
      <div className="sim-docs-modal">
        <div className="sim-docs-modal-head">
          <span className="sim-docs-modal-title"><FolderOpen size={15} /> Carpeta de Documentos · {c.paciente.nombre}</span>
          <div className="sim-docs-modal-actions">
            <button type="button" onClick={() => bookRef.current?.pageFlip().flipPrev()} title="Página anterior">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => bookRef.current?.pageFlip().flipNext()} title="Página siguiente">
              <ChevronRight size={16} />
            </button>
            <button type="button" className="sim-docs-close" onClick={onClose} title="Cerrar (Esc)">
              <X size={15} /> <span>Cerrar</span>
            </button>
          </div>
        </div>

        <div className="sim-docs-book-wrap">
          <HTMLFlipBook
            ref={bookRef}
            width={680}
            height={880}
            size="stretch"
            minWidth={550} maxWidth={850} minHeight={712} maxHeight={1100}
            showCover
            usePortrait={false}
            autoSize={false}
            drawShadow
            maxShadowOpacity={0.35}
            mobileScrollSupport
            className="sim-docs-flipbook"
          >
            {paginas}
          </HTMLFlipBook>
        </div>
      </div>
    </div>
  );
}

/* ── Dock Lateral Izquierdo: Examen Físico y Laboratorios ── */
function HistoriaClinicaEHRDockLeft({
  activeModule,
  onSelectModule,
  doneExamenCount = 0,
  doneParaclinicosCount = 0,
}: {
  activeModule: 'examen_fisico' | 'paraclinicos' | null;
  onSelectModule: (module: 'examen_fisico' | 'paraclinicos' | null) => void;
  doneExamenCount?: number;
  doneParaclinicosCount?: number;
}) {
  return (
    <aside className="sim-ehr-dock sim-ehr-dock-left" aria-label="Módulos Clínicos de Exploración">
      {/* 1. Examen Físico */}
      <button
        type="button"
        className={`sim-ehr-dock-item sim-dock-exam${activeModule === 'examen_fisico' ? ' is-active' : ''}`}
        onClick={() => onSelectModule(activeModule === 'examen_fisico' ? null : 'examen_fisico')}
        title="Abrir Examen Físico Dirigido"
      >
        <div className="sim-ehr-dock-icon">
          <Stethoscope size={16} />
        </div>
        <div className="sim-ehr-dock-label-wrap">
          <span className="sim-ehr-dock-title">Examen Físico</span>
          <span className="sim-ehr-dock-sub">Exploración & Signos</span>
        </div>
        {doneExamenCount > 0 && <span className="sim-dock-badge">{doneExamenCount}</span>}
      </button>

      {/* 2. Laboratorios / Paraclínicos */}
      <button
        type="button"
        className={`sim-ehr-dock-item sim-dock-para${activeModule === 'paraclinicos' ? ' is-active' : ''}`}
        onClick={() => onSelectModule(activeModule === 'paraclinicos' ? null : 'paraclinicos')}
        title="Abrir Laboratorios y Estudios Paraclínicos"
      >
        <div className="sim-ehr-dock-icon">
          <FlaskConical size={16} />
        </div>
        <div className="sim-ehr-dock-label-wrap">
          <span className="sim-ehr-dock-title">Laboratorios</span>
          <span className="sim-ehr-dock-sub">Órdenes & Paraclínicos</span>
        </div>
        {doneParaclinicosCount > 0 && <span className="sim-dock-badge">{doneParaclinicosCount}</span>}
      </button>
    </aside>
  );
}

/* ── Dock Lateral Derecho: Anamnesis y Expediente Consolidado ── */
function HistoriaClinicaEHRDockRight({
  activeModule,
  onSelectModule,
}: {
  activeModule: 'anamnesis' | 'completo' | null;
  onSelectModule: (module: 'anamnesis' | 'completo' | null) => void;
}) {
  return (
    <aside className="sim-ehr-dock sim-ehr-dock-right" aria-label="Módulos Clínicos Independientes">
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
  );
}

/* ── Panel Lateral Derecho: Formulario de Historia Clínica Electrónica Oficial ── */
function HistoriaClinicaEHRPanel({
  c, explored, onExplorar, disabled, messages, activeModule, onClose,
}: {
  c: CaseDetails;
  explored: Record<string, ExploredEntry>;
  onExplorar: (tipo: TipoExploracion, item: CatalogoItem) => void;
  disabled: boolean;
  messages: ChatMsg[];
  activeModule: ClinicalModule | null;
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

  const MODULE_HEADER_INFO: Record<ClinicalModule, {
    title: string;
    subtitle: string;
    icon: typeof ClipboardList;
    iconClass: string;
  }> = {
    anamnesis: {
      title: 'Anamnesis y Motivo de Consulta',
      subtitle: `Interrogatorio Clínico · Folio N°: HC-${c.paciente.documento || '105661040'}`,
      icon: ClipboardList,
      iconClass: 'sim-module-icon-anamnesis',
    },
    completo: {
      title: 'Expediente Clínico Consolidado',
      subtitle: `Filiación y Epicrisis · Folio N°: HC-${c.paciente.documento || '105661040'}`,
      icon: FileText,
      iconClass: 'sim-module-icon-completo',
    },
    examen_fisico: {
      title: 'Examen Físico Dirigido',
      subtitle: 'Exploración física determinista y signos vitales',
      icon: Stethoscope,
      iconClass: 'sim-module-icon-examen_fisico',
    },
    paraclinicos: {
      title: 'Órdenes Paraclínicas y Laboratorio',
      subtitle: 'Estudios diagnósticos, laboratorio e imágenes',
      icon: FlaskConical,
      iconClass: 'sim-module-icon-paraclinicos',
    },
  };

  const fechaHoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const isLeftPanel = activeModule === 'examen_fisico' || activeModule === 'paraclinicos';

  return (
    <AnimatePresence>
      {isOpen && activeModule && (
        <motion.aside
          key={`ehr-panel-${activeModule}`}
          className={`sim-ehr-panel sim-ehr-panel-${activeModule} ${isLeftPanel ? 'sim-ehr-panel-left' : 'sim-ehr-panel-right'}`}
          style={{ width: 'clamp(340px, 28vw, 460px)' }}
          initial={{ opacity: 0, x: isLeftPanel ? -48 : 48 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: isLeftPanel ? -48 : 48 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="sim-ehr-panel-inner">
            {/* Encabezado Propio e Independiente de la Opción Seleccionada */}
            {(() => {
              const info = MODULE_HEADER_INFO[activeModule];
              const IconComp = info.icon;
              return (
                <div className="sim-module-header">
                  <div className="sim-module-header-left">
                    <div className={`sim-module-icon-wrap ${info.iconClass}`}>
                      <IconComp size={18} />
                    </div>
                    <div className="sim-module-text-wrap">
                      <h3 className="sim-module-title">{info.title}</h3>
                      <span className="sim-module-subtitle">{info.subtitle}</span>
                    </div>
                  </div>

                  <div className="sim-module-header-right">
                    {activeModule === 'anamnesis' && (
                      <span className="sim-module-live-badge">
                        <span className="sim-pulse-dot" /> EN CONSULTA
                      </span>
                    )}
                    {activeModule === 'examen_fisico' && doneExamen.length > 0 && (
                      <span className="sim-sheet-progress-pill">{doneExamen.length} exploradas</span>
                    )}
                    {activeModule === 'paraclinicos' && doneParaclinicos.length > 0 && (
                      <span className="sim-sheet-progress-pill">{doneParaclinicos.length} solicitados</span>
                    )}
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
              );
            })()}

            {/* Cuerpo de la Información Independiente de la Opción */}
            <div className="ehr-form-body">
              {/* Sección de Identificación y Filiación — solo en Expediente */}
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
                        <div className="sim-lab-sheets-stack">
                          {agruparPorDepartamento(doneParaclinicos, paraclinicoItems).map(([grupo, items]) => (
                            <LabDepartmentSheet
                              key={grupo}
                              grupo={grupo}
                              items={items}
                              paciente={c.paciente}
                              folio={`HC-${c.paciente.documento || '105661040'}`}
                            />
                          ))}
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
                          <div className="sim-lab-sheets-stack">
                            {agruparPorDepartamento(doneParaclinicos, paraclinicoItems).map(([grupo, items]) => (
                              <LabDepartmentSheet
                                key={grupo}
                                grupo={grupo}
                                items={items}
                                paciente={c.paciente}
                                folio={`HC-${c.paciente.documento || '105661040'}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
          </motion.aside>
        )}
      </AnimatePresence>
  );
}

/* ── Entrevista (chat con el Agente 2, centrado en pantalla) ── */
function Interview({
  messages, onSend, onFinish, sending, estadoEmocional, consultaTerminada, paciente,
  onOpenModule, doneExamenCount = 0, doneParaclinicosCount = 0, onBack,
  activeModule, onCloseModule: _onCloseModule, caseDetails, explored, onExplorar,
  activeLeftModule, activeRightModule, onOpenLeftModule, onOpenRightModule,
}: {
  messages: ChatMsg[]; onSend: (t: string) => void; onFinish: () => void; sending: boolean;
  estadoEmocional: string | null; consultaTerminada: boolean; paciente: DatosPaciente | null;
  onOpenModule?: (module: ClinicalModule | null) => void;
  doneExamenCount?: number;
  doneParaclinicosCount?: number;
  onBack?: () => void;
  activeModule?: ClinicalModule | null;
  onCloseModule?: () => void;
  caseDetails?: CaseDetails | null;
  explored?: Record<string, ExploredEntry>;
  onExplorar?: (tipo: TipoExploracion, item: CatalogoItem) => void;
  activeLeftModule?: 'examen_fisico' | 'paraclinicos' | null;
  activeRightModule?: 'anamnesis' | 'completo' | null;
  onOpenLeftModule?: (module: 'examen_fisico' | 'paraclinicos' | null) => void;
  onOpenRightModule?: (module: 'anamnesis' | 'completo' | null) => void;
}) {
  const leftMod = activeLeftModule !== undefined ? activeLeftModule : (activeModule === 'examen_fisico' || activeModule === 'paraclinicos' ? activeModule : null);
  const rightMod = activeRightModule !== undefined ? activeRightModule : (activeModule === 'anamnesis' || activeModule === 'completo' ? activeModule : null);

  const handleToggleLeft = (m: 'examen_fisico' | 'paraclinicos' | null) => {
    if (onOpenLeftModule) {
      onOpenLeftModule(leftMod === m ? null : m);
    } else if (onOpenModule) {
      onOpenModule(m);
    }
  };

  const handleToggleRight = (m: 'anamnesis' | 'completo' | null) => {
    if (onOpenRightModule) {
      onOpenRightModule(rightMod === m ? null : m);
    } else if (onOpenModule) {
      onOpenModule(m);
    }
  };

  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>(() => elegirSugerencias(4));
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  // Cierra el popover de sugerencias al hacer clic afuera o con Escape
  useEffect(() => {
    if (!suggestionsOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) setSuggestionsOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSuggestionsOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [suggestionsOpen]);

  // Textarea que crece con el contenido (hasta un máximo), en vez de un input de una sola línea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const send = () => {
    const text = input.trim();
    if (!text || sending || consultaTerminada) return;
    historyRef.current.unshift(text);
    historyIdxRef.current = -1;
    setInput('');
    onSend(text);
  };

  const insertarSugerencia = (texto: string) => {
    setInput(texto);
    setSuggestionsOpen(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
      return;
    }
    const caretAlInicio = textareaRef.current?.selectionStart === 0 && textareaRef.current?.selectionEnd === 0;
    if (e.key === 'ArrowUp' && caretAlInicio && historyRef.current.length > 0) {
      e.preventDefault();
      const next = Math.min(historyIdxRef.current + 1, historyRef.current.length - 1);
      historyIdxRef.current = next;
      setInput(historyRef.current[next]);
    } else if (e.key === 'ArrowDown' && historyIdxRef.current >= 0) {
      e.preventDefault();
      const next = historyIdxRef.current - 1;
      historyIdxRef.current = next;
      setInput(next >= 0 ? historyRef.current[next] : '');
    }
  };

  return (
    <div className="sim-chat-col sim-chat-col-centered">
      <div className="sim-agent-header">
        <div className="sim-agent-info-group">
          {onBack && (
            <button
              type="button"
              className="sim-agent-back-btn"
              onClick={onBack}
              title="Volver a Casos clínicos"
            >
              <ArrowLeft size={14} />
              <span>Casos</span>
            </button>
          )}
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

        <button type="button" className="sim-header-finish-btn" onClick={onFinish}>
          <span>Terminar entrevista y emitir diagnóstico</span>
          <ChevronRight size={15} />
        </button>
      </div>

      <div className={`sim-chat-messages${rightMod ? ' has-ehr-split has-ehr-split-right' : ''}${leftMod ? ' has-ehr-split has-ehr-split-left' : ''}`}>
        {/* Dock Lateral Izquierdo: Exámenes Físicos y Laboratorios (Debajo del panel izquierdo) */}
        {caseDetails && (
          <HistoriaClinicaEHRDockLeft
            activeModule={leftMod}
            onSelectModule={handleToggleLeft}
            doneExamenCount={doneExamenCount}
            doneParaclinicosCount={doneParaclinicosCount}
          />
        )}

        {/* Panel Clínico Izquierdo (Examen Físico / Laboratorios) */}
        {caseDetails && leftMod && explored && onExplorar && (
          <HistoriaClinicaEHRPanel
            c={caseDetails}
            explored={explored}
            onExplorar={onExplorar}
            disabled={sending}
            messages={messages}
            activeModule={leftMod}
            onClose={() => handleToggleLeft(null)}
          />
        )}

        {/* Flujo de conversación (SIEMPRE EN EL CENTRO) */}
        <div className="sim-chat-bubbles-stream">
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

        {/* Dock Lateral Derecho: Anamnesis y Expediente (Debajo del panel derecho) */}
        {caseDetails && (
          <HistoriaClinicaEHRDockRight
            activeModule={rightMod}
            onSelectModule={handleToggleRight}
          />
        )}

        {/* Panel Clínico Derecho (Anamnesis / Expediente) */}
        {caseDetails && rightMod && explored && onExplorar && (
          <HistoriaClinicaEHRPanel
            c={caseDetails}
            explored={explored}
            onExplorar={onExplorar}
            disabled={sending}
            messages={messages}
            activeModule={rightMod}
            onClose={() => handleToggleRight(null)}
          />
        )}
      </div>

      {consultaTerminada ? (
        <div className="sim-chat-ended-notice">
          <Info size={15} /> El paciente se despidió — cerrá la consulta con tu diagnóstico.
        </div>
      ) : (
        <div className="sim-input-area">
          {/* Un único contenedor (dock), organizado en 3 zonas: herramientas
              clínicas a la izquierda, campo de texto al centro, acciones de
              envío a la derecha — todo dentro del mismo recuadro. */}
          <div className="sim-input-dock" ref={dockRef}>
            {suggestionsOpen && (
              <div className="sim-suggestions-pop">
                <div className="sim-suggestions-pop-head">
                  <span><Sparkles size={12} /> Preguntas sugeridas</span>
                  <button
                    type="button"
                    className="sim-suggestions-refresh"
                    onClick={() => setSuggestions(elegirSugerencias(4))}
                    title="Ver otras sugerencias"
                  >
                    <Shuffle size={12} />
                  </button>
                </div>
                <div className="sim-suggestions-pop-list">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className="sim-suggestion-row"
                      onClick={() => insertarSugerencia(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(onOpenModule || onOpenLeftModule) && (
              <div className="sim-input-dock-zone sim-input-dock-left">
                <button
                  type="button"
                  className={`sim-input-tool-btn sim-input-tool-exam${leftMod === 'examen_fisico' ? ' is-active' : ''}`}
                  onClick={() => handleToggleLeft('examen_fisico')}
                  title="Abrir Examen Físico Dirigido"
                >
                  <Stethoscope size={16} />
                  {doneExamenCount > 0 && <span className="sim-input-tool-badge">{doneExamenCount}</span>}
                </button>
                <button
                  type="button"
                  className={`sim-input-tool-btn sim-input-tool-lab${leftMod === 'paraclinicos' ? ' is-active' : ''}`}
                  onClick={() => handleToggleLeft('paraclinicos')}
                  title="Abrir Laboratorios y Estudios Paraclínicos"
                >
                  <FlaskConical size={16} />
                  {doneParaclinicosCount > 0 && <span className="sim-input-tool-badge">{doneParaclinicosCount}</span>}
                </button>
                {caseDetails && explored && (
                  <button
                    type="button"
                    className="sim-input-tool-btn sim-input-tool-docs"
                    onClick={() => setDocumentsOpen(true)}
                    title="Abrir carpeta de documentos"
                  >
                    <FolderOpen size={16} />
                    {(doneExamenCount + doneParaclinicosCount) > 0 && (
                      <span className="sim-input-tool-badge">{doneExamenCount + doneParaclinicosCount}</span>
                    )}
                  </button>
                )}
                <span className="sim-input-dock-divider" />
              </div>
            )}

            <textarea
              ref={textareaRef}
              className="sim-input-field"
              placeholder="Hacé una pregunta al paciente..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              rows={1}
            />

            <div className="sim-input-dock-zone sim-input-dock-right">
              {input && (
                <button
                  type="button"
                  className="sim-input-tool-btn"
                  onClick={() => { setInput(''); textareaRef.current?.focus(); }}
                  title="Borrar texto"
                >
                  <X size={15} />
                </button>
              )}
              <button
                type="button"
                className={`sim-input-tool-btn${suggestionsOpen ? ' is-active' : ''}`}
                onClick={() => setSuggestionsOpen(v => !v)}
                title="Preguntas sugeridas"
                disabled={sending}
              >
                <Sparkles size={16} />
              </button>
              <button className="sim-input-send" onClick={send} disabled={!input.trim() || sending}>
                {sending ? <Loader2 size={15} className="sim-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {documentsOpen && caseDetails && explored && (
        <DocumentsFlipbook
          c={caseDetails}
          explored={explored}
          messages={messages}
          onClose={() => setDocumentsOpen(false)}
        />
      )}
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
  const [activeLeftModule, setActiveLeftModule] = useState<'examen_fisico' | 'paraclinicos' | null>(null);
  const [activeRightModule, setActiveRightModule] = useState<'anamnesis' | 'completo' | null>(null);
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
          {retryAttempt > 0 && (
            <div className="sim-toast" role="status">
              <Loader2 size={14} className="sim-spin" />
              <span>Gemini está ocupado, reintentando… ({retryAttempt})</span>
            </div>
          )}

          {phase === 'interview' && (
            <div className={`sim-interview-layout${activeLeftModule || activeRightModule ? ' has-ehr-split' : ''}${activeLeftModule ? ' has-ehr-split-left' : ''}${activeRightModule ? ' has-ehr-split-right' : ''}`}>
              <Interview
                messages={messages} onSend={handleSend} onFinish={() => setPhase('diagnosis')} sending={sending}
                estadoEmocional={estadoEmocional} consultaTerminada={consultaTerminada} paciente={caseDetails?.paciente || null}
                activeLeftModule={activeLeftModule}
                activeRightModule={activeRightModule}
                onOpenLeftModule={setActiveLeftModule}
                onOpenRightModule={setActiveRightModule}
                doneExamenCount={Object.values(explored).filter(e => e.tipo === 'examen_fisico').length}
                doneParaclinicosCount={Object.values(explored).filter(e => e.tipo === 'paraclinico').length}
                onBack={() => navigate('/casos')}
                caseDetails={caseDetails}
                explored={explored}
                onExplorar={handleExplorar}
              />
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
