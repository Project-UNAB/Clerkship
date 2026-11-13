import { motion } from 'framer-motion';
import {
  BookOpen, BrainCircuit, Database, GitBranch,
  ArrowRight, Layers, Server, Monitor,
} from 'lucide-react';
import InnerLayout from '../../components/shared/InnerLayout';

const stack = [
  { Icon: Monitor, label: 'Frontend', value: 'React 18 + TypeScript + Vite · Framer Motion · React Router v6' },
  { Icon: Server, label: 'Backend', value: 'Python (Flask) · API REST · Autenticación con JWT' },
  { Icon: BrainCircuit, label: 'IA / LLM', value: 'Google Gemini (API) con instrucciones de sistema y salida estructurada' },
  { Icon: Database, label: 'Conocimiento clínico', value: 'Referencias clínicas por subtema (sin búsqueda vectorial) · en carga' },
  { Icon: Layers, label: 'Dominio clínico', value: 'Sistema gastrointestinal · Casos simulados · validación experta en curso' },
  { Icon: GitBranch, label: 'Metodología', value: 'Kanban · desarrollo tecnológico aplicado · meta TRL 4 sujeta a validación experta' },
];

const phases = [
  {
    num: '01',
    title: 'Generación del caso clínico',
    desc: 'El sistema recibe una solicitud de simulación y construye una viñeta clínica única con el modelo de lenguaje, apoyándose en referencias clínicas por subtema cuando existen, y la valida con reglas programadas. La adecuación clínica de los casos aún está en proceso de validación por expertos.',
  },
  {
    num: '02',
    title: 'Interacción con el paciente virtual',
    desc: 'El estudiante conversa con el paciente virtual mediante una interfaz de chat. El LLM actúa como paciente, respondiendo de forma coherente con la viñeta generada: síntomas, antecedentes, historia clínica. El modelo mantiene el contexto durante toda la sesión.',
  },
  {
    num: '03',
    title: 'Toma de decisiones diagnósticas',
    desc: 'El estudiante solicita pruebas (laboratorio e imagen), formula hipótesis ordenadas por probabilidad y emite un diagnóstico final con argumentación clínica explícita. El sistema registra cada decisión para su posterior análisis.',
  },
  {
    num: '04',
    title: 'Retroalimentación formativa con IA',
    desc: 'Al concluir la sesión, el evaluador clasifica el desempeño del estudiante por dimensión (anamnesis, razonamiento clínico, hallazgos, examen físico y paraclínicos, comunicación), lo compara con la rúbrica de referencia del caso y redacta la retroalimentación. La detección de sesgos cognitivos aún no está implementada.',
  },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay, ease: 'easeOut' as const },
});

export default function DocumentacionPage() {
  return (
    <InnerLayout backLabel="Volver al inicio">
      <div className="inner-wrap-wide">

        {/* Hero */}
        <motion.div className="inner-hero" {...fadeUp()}>
          <span className="inner-pretitle">
            <BookOpen size={12} /> Documentación técnica
          </span>
          <h1 className="inner-title">Arquitectura del prototipo</h1>
          <p className="inner-sub">
            Clerkship usa tres agentes sobre la API de Gemini (generador de casos, paciente virtual y evaluador), coordinados por el backend con reglas programadas, para generar simulaciones clínicas interactivas con retroalimentación formativa automatizada.
          </p>
        </motion.div>

        {/* Stack */}
        <div className="inner-section">
          <p className="inner-section-title">Stack tecnológico</p>
          <motion.div className="prose-card" style={{ padding: 0, overflow: 'hidden' }} {...fadeUp(0.06)}>
            {stack.map(({ Icon, label, value }, i) => (
              <div
                key={label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 24px',
                  borderBottom: i < stack.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'var(--p-subtle)', border: '1px solid var(--p-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--p)', flexShrink: 0,
                }}>
                  <Icon size={18} />
                </div>
                <div style={{ minWidth: 110 }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--ink3)', margin: 0 }}>{label}</p>
                </div>
                <p style={{ fontSize: '0.86rem', color: 'var(--ink2)', margin: 0, lineHeight: 1.5 }}>{value}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Architecture diagram (text-based) */}
        <div className="inner-section">
          <p className="inner-section-title">Flujo de datos</p>
          <motion.div className="prose-card" {...fadeUp(0.1)}>
            <div className="prose">
              <h2>Arquitectura de tres agentes</h2>
              <p>
                El núcleo del sistema son <strong>tres agentes</strong> que usan la
                API de Gemini y que el backend coordina con funciones propias y
                reglas programadas: un generador de casos, un paciente virtual y un
                evaluador. El modelo no se entrena ni se ajusta; su comportamiento
                se define con instrucciones de sistema y salidas estructuradas que
                el backend valida. El prototipo no usa búsqueda vectorial.
              </p>
              <p>El flujo general de una sesión de simulación es el siguiente:</p>
              <ol>
                <li>
                  <strong>Generación del caso:</strong> El generador construye la
                  viñeta clínica, el perfil del paciente virtual, el diagnóstico
                  de referencia y la rúbrica, apoyándose en referencias clínicas
                  por subtema cuando existen. El backend valida el caso antes de
                  usarlo.
                </li>
                <li>
                  <strong>Sesión interactiva:</strong> El estudiante entrevista al
                  paciente virtual, lo examina y solicita paraclínicos. Las guardas
                  del backend evitan que el paciente revele el diagnóstico o salga
                  de su papel.
                </li>
                <li>
                  <strong>Diagnóstico:</strong> El estudiante formula su hipótesis,
                  sus diagnósticos diferenciales y su plan.
                </li>
                <li>
                  <strong>Evaluación y retroalimentación:</strong> El evaluador
                  clasifica el desempeño por dimensión y redacta la
                  retroalimentación; el puntaje lo calcula una fórmula fija y
                  auditable.
                </li>
              </ol>

              <h2>Alcance de la evaluación</h2>
              <p>
                El puntaje refleja sobre todo la exhaustividad de la información
                recolectada (anamnesis, hallazgos, examen físico y paraclínicos) y
                la concordancia del diagnóstico final con el del caso. El
                prototipo no registra las hipótesis intermedias del estudiante ni
                la justificación de su diagnóstico, y no detecta sesgos cognitivos.
              </p>
              <ul>
                <li>Las instrucciones de sistema fijan el rol y las restricciones de cada agente.</li>
                <li>La salida estructurada permite validar cada respuesta campo por campo.</li>
                <li>Los casos son simulados y su validación clínica por expertos está en curso.</li>
              </ul>
            </div>
          </motion.div>
        </div>

        {/* Simulation phases */}
        <div className="inner-section">
          <p className="inner-section-title">Fases de la simulación</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {phases.map(({ num, title, desc }, i) => (
              <motion.div
                key={num}
                style={{
                  display: 'flex', gap: 20, alignItems: 'flex-start',
                  padding: '20px 24px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-sm)',
                }}
                {...fadeUp(0.06 + i * 0.08)}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: 'var(--p-subtle)', border: '1px solid var(--p-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--p)', fontWeight: 800, fontSize: '0.9rem',
                }}>
                  {num}
                </div>
                <div>
                  <h3 style={{ fontSize: '0.97rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    {title}
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink3)', lineHeight: 1.7, margin: 0 }}>
                    {desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Scope note */}
        <motion.div
          {...fadeUp(0.2)}
          style={{
            marginBottom: 40, padding: '16px 20px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <p style={{ fontSize: '0.82rem', color: 'var(--ink3)', lineHeight: 1.65, margin: 0 }}>
            <strong style={{ color: 'var(--ink2)' }}>Alcance del prototipo (TRL 3–4):</strong>{' '}
            Clerkship se encuentra en un nivel de madurez tecnológica TRL 3–4, lo que
            implica que la arquitectura ha sido validada conceptualmente y probada
            en entorno de laboratorio académico. No está certificado para uso clínico
            real ni como herramienta de evaluación académica formal.
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div className="inner-cta-banner" {...fadeUp(0.24)}>
          <div className="cta-banner-text">
            <h3>¿Listo para explorar?</h3>
            <p>Accede al prototipo con tu correo institucional y comienza una sesión de simulación.</p>
          </div>
          <a href="/login" className="btn-inner-primary">
            Acceder al prototipo <ArrowRight size={16} />
          </a>
        </motion.div>

      </div>
    </InnerLayout>
  );
}
