import { motion } from 'framer-motion';
import {
  BrainCircuit, MessageSquare, Stethoscope, Lightbulb,
  ArrowRight, BarChart2, Clock, Target,
} from 'lucide-react';
import InnerLayout from '../../components/shared/InnerLayout';

const features = [
  {
    cls: 'feat-ico-blue',
    Icon: BrainCircuit,
    title: 'Casos clínicos generados por IA',
    desc: 'Cada sesión presenta una viñeta clínica única del sistema gastrointestinal, generada por un modelo LLM y anclada en bibliografía médica curada mediante arquitectura RAG.',
  },
  {
    cls: 'feat-ico-green',
    Icon: MessageSquare,
    title: 'Conversación con paciente virtual',
    desc: 'El estudiante interactúa directamente con el paciente virtual mediante chat. El modelo responde con coherencia clínica y mantiene el contexto de la viñeta durante toda la sesión.',
  },
  {
    cls: 'feat-ico-violet',
    Icon: Target,
    title: 'Toma de decisiones diagnósticas',
    desc: 'El estudiante solicita pruebas de laboratorio e imágenes, formula hipótesis ordenadas por probabilidad y emite un diagnóstico final con argumentación clínica explícita.',
  },
  {
    cls: 'feat-ico-amber',
    Icon: Lightbulb,
    title: 'Retroalimentación formativa con IA',
    desc: 'Al finalizar, el sistema analiza cada decisión tomada, detecta sesgos cognitivos presentes y compara el razonamiento del estudiante con un razonamiento de referencia experto.',
  },
];

const steps = [
  {
    num: '01',
    cls: 'siv-1',
    Icon: MessageSquare,
    title: 'Caso Clínico Interactivo',
    desc: 'Recibe la viñeta clínica, conversa con el paciente virtual y recopila la anamnesis necesaria.',
  },
  {
    num: '02',
    cls: 'siv-2',
    Icon: Stethoscope,
    title: 'Decisiones diagnósticas',
    desc: 'Solicita pruebas, ordena hipótesis y emite tu diagnóstico final con argumentación.',
  },
  {
    num: '03',
    cls: 'siv-3',
    Icon: BarChart2,
    title: 'Retroalimentación formativa',
    desc: 'Recibe análisis detallado de tu proceso de razonamiento, sesgos y comparación con el experto.',
  },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay, ease: 'easeOut' as const },
});

export default function ExplorarPage() {
  return (
    <InnerLayout backLabel="Volver al inicio">
      <div className="inner-wrap-wide">

        {/* Hero */}
        <motion.div className="inner-hero" {...fadeUp()}>
          <span className="inner-pretitle">
            <Clock size={12} /> Prototipo académico · TRL 3–4
          </span>
          <h1 className="inner-title">Explora el prototipo</h1>
          <p className="inner-sub">
            Clerkship es un simulador clínico educativo que entrena el razonamiento
            diagnóstico en estudiantes de ciencias de la salud. Estas son sus
            características principales y el flujo de uso.
          </p>
        </motion.div>

        {/* Features */}
        <div className="inner-section">
          <p className="inner-section-title">Características principales</p>
          <div className="icard-grid-2">
            {features.map(({ cls, Icon, title, desc }, i) => (
              <motion.div key={title} className="feat-card" {...fadeUp(i * 0.09)}>
                <div className={`feat-ico ${cls}`}>
                  <Icon size={24} />
                </div>
                <h3 className="feat-title">{title}</h3>
                <p className="feat-desc">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="inner-section">
          <p className="inner-section-title">Flujo de la simulación</p>
          <div className="step-flow">
            {steps.map(({ num, cls, Icon, title, desc }, i) => (
              <>
                <motion.div
                  key={num}
                  className="step-c"
                  style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '32px 24px', boxShadow: 'var(--sh-sm)' }}
                  {...fadeUp(0.1 + i * 0.12)}
                >
                  <div className={`step-ico-wrap ${cls}`} style={{ width: 68, height: 68, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <Icon size={28} />
                  </div>
                  <p className="step-n">Paso {num}</p>
                  <h3 className="step-t">{title}</h3>
                  <p className="step-d">{desc}</p>
                </motion.div>
                {i < steps.length - 1 && (
                  <div key={`arr-${i}`} className="step-flow-arrow">
                    <ArrowRight size={24} strokeWidth={1.5} />
                  </div>
                )}
              </>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div className="inner-cta-banner" {...fadeUp(0.2)}>
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
