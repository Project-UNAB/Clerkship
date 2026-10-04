import { motion } from 'framer-motion';
import { BookOpen, GraduationCap, Star } from 'lucide-react';
import InnerLayout from '../../components/shared/InnerLayout';

const directors = [
  {
    initials: 'LP',
    title: 'Director del proyecto de grado',
    name: 'Leonardo Stiven Pardo Niño',
    dept: 'Facultad de Ingeniería · Ingeniería de Sistemas',
    desc: 'Responsable de la dirección académica del proyecto, orientación metodológica y validación del alcance técnico e investigativo del prototipo.',
  },
  {
    initials: 'FB',
    title: 'Co-Director del proyecto de grado',
    name: 'Felipe Buitrago',
    dept: 'Facultad de Ingeniería · Ingeniería de Sistemas',
    desc: 'Co-responsable de la supervisión académica, revisión del marco de referencia y acompañamiento durante el ciclo de desarrollo iterativo del prototipo.',
  },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay, ease: 'easeOut' as const },
});

export default function DireccionPage() {
  return (
    <InnerLayout backLabel="Volver al inicio">
      <div className="inner-wrap">

        {/* Hero */}
        <motion.div className="inner-hero" {...fadeUp()}>
          <span className="inner-pretitle">
            <GraduationCap size={12} /> Dirección académica
          </span>
          <h1 className="inner-title">Director y Co-director</h1>
          <p className="inner-sub">
            El proyecto de grado contó con la dirección y supervisión académica de
            dos docentes del programa de Ingeniería de Sistemas, quienes orientaron
            la metodología de investigación y el desarrollo del prototipo.
          </p>
        </motion.div>

        {/* Director cards */}
        <div className="icard-grid-2" style={{ marginBottom: 40 }}>
          {directors.map(({ initials, title, name, dept, desc }, i) => (
            <motion.div key={name} className="dev-card" {...fadeUp(i * 0.12)}>
              <div className="dev-avatar">{initials}</div>
              <p className="dev-role">{title}</p>
              <h3 className="dev-name">{name}</h3>
              <p className="dev-sub" style={{ marginBottom: 14 }}>{dept}</p>
              <p style={{ fontSize: '0.84rem', color: 'var(--ink3)', lineHeight: 1.65 }}>
                {desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Rol académico */}
        <motion.div className="prose-card" {...fadeUp(0.22)}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--p-subtle)', border: '1px solid var(--p-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--p)', flexShrink: 0 }}>
              <Star size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                Rol en el proceso de grado
              </h3>
              <div className="prose" style={{ margin: 0 }}>
                <p>
                  La dirección académica cumplió un papel fundamental en tres áreas
                  del proyecto:
                </p>
                <ul>
                  <li><strong>Formulación del problema:</strong> Definición de la pregunta de investigación y los objetivos del prototipo.</li>
                  <li><strong>Marco metodológico:</strong> Orientación en la selección del enfoque Scrum + PHVA y los criterios de evaluación TRL 3–4.</li>
                  <li><strong>Validación técnica:</strong> Revisión del diseño de la arquitectura RAG, los prompts Chain-of-Thought y los instrumentos de evaluación de calidad.</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Info adicional */}
        <motion.div
          {...fadeUp(0.3)}
          style={{ marginTop: 20, padding: '16px 20px', background: 'var(--p-subtle)', border: '1px solid var(--p-border)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <BookOpen size={18} style={{ color: 'var(--p-dk)', flexShrink: 0 }} />
          <p style={{ fontSize: '0.83rem', color: 'var(--p-dk)', lineHeight: 1.6, margin: 0 }}>
            Este proyecto de grado es evaluado como requisito para optar al título
            de <strong>Ingeniero de Sistemas</strong> en la institución educativa participante.
          </p>
        </motion.div>

      </div>
    </InnerLayout>
  );
}
