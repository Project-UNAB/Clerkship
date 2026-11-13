import { motion } from 'framer-motion';
import {
  BookOpen, BrainCircuit, Database, GitBranch,
  ArrowRight, Layers, Server, Monitor,
} from 'lucide-react';
import InnerLayout from '../../components/shared/InnerLayout';

const stack = [
  { Icon: Monitor, label: 'Frontend', value: 'React 18 + TypeScript + Vite · Framer Motion · React Router v6' },
  { Icon: Server, label: 'Backend', value: 'Node.js · API REST · Autenticación institucional' },
  { Icon: BrainCircuit, label: 'IA / LLM', value: 'Modelo de lenguaje grande (LLM) con prompts Chain-of-Thought' },
  { Icon: Database, label: 'RAG', value: 'Arquitectura Retrieval-Augmented Generation · Bibliografía médica curada' },
  { Icon: Layers, label: 'Dominio clínico', value: 'Sistema gastrointestinal · Casos validados por aliado clínico' },
  { Icon: GitBranch, label: 'Metodología', value: 'Scrum + PHVA · TRL 3–4 · Ciclos iterativos de desarrollo' },
];

const phases = [
  {
    num: '01',
    title: 'Generación del caso clínico',
    desc: 'El sistema recibe una solicitud de simulación y construye una viñeta clínica única usando el LLM con contexto RAG extraído de bibliografía gastrointestinal curada. El caso garantiza coherencia clínica, variedad de presentaciones y alineación con guías de práctica.',
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
    desc: 'Al concluir la sesión, el sistema analiza el razonamiento del estudiante: identifica sesgos cognitivos (anclaje, cierre prematuro, disponibilidad), compara con un razonamiento experto de referencia y genera retroalimentación personalizada paso a paso.',
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
            Clerkship combina un modelo de lenguaje grande (LLM), arquitectura RAG
            y prompts Chain-of-Thought para generar simulaciones clínicas
            interactivas con retroalimentación formativa automatizada.
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
              <h2>Arquitectura RAG + LLM</h2>
              <p>
                El núcleo del sistema emplea una arquitectura{' '}
                <strong>Retrieval-Augmented Generation (RAG)</strong> que combina
                un índice vectorial de bibliografía médica curada con un modelo
                de lenguaje grande para garantizar que los casos clínicos
                generados estén anclados en conocimiento médico validado.
              </p>
              <p>El flujo general de una sesión de simulación es el siguiente:</p>
              <ol>
                <li>
                  <strong>Recuperación (Retrieval):</strong> El sistema consulta
                  el índice vectorial y recupera fragmentos relevantes de
                  bibliografía gastrointestinal según el tipo de caso solicitado.
                </li>
                <li>
                  <strong>Generación del contexto (Augmentation):</strong> Los
                  fragmentos recuperados se inyectan en el prompt del LLM como
                  contexto clínico de referencia.
                </li>
                <li>
                  <strong>Generación del caso (Generation):</strong> El LLM, guiado
                  por prompts Chain-of-Thought, construye la viñeta clínica,
                  define el perfil del paciente virtual y establece el diagnóstico
                  de referencia para la retroalimentación posterior.
                </li>
                <li>
                  <strong>Sesión interactiva:</strong> El estudiante interactúa
                  con el sistema. El LLM mantiene el contexto de la sesión y
                  actúa como paciente virtual con coherencia clínica.
                </li>
                <li>
                  <strong>Retroalimentación:</strong> Al finalizar, el sistema
                  analiza las decisiones del estudiante frente al razonamiento
                  experto de referencia y genera retroalimentación formativa.
                </li>
              </ol>

              <h2>Prompts Chain-of-Thought</h2>
              <p>
                Los prompts del sistema están diseñados bajo el paradigma{' '}
                <strong>Chain-of-Thought (CoT)</strong>, instruyendo al LLM a
                razonar paso a paso antes de generar respuestas. Esto garantiza:
              </p>
              <ul>
                <li>Mayor coherencia clínica en los casos generados.</li>
                <li>Respuestas del paciente virtual consistentes con la viñeta.</li>
                <li>Retroalimentación estructurada que sigue el razonamiento diagnóstico clásico (anamnesis → hipótesis → pruebas → diagnóstico diferencial → conclusión).</li>
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
