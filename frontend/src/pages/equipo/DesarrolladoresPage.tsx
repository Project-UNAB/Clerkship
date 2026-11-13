import { motion } from 'framer-motion';
import { Code2, GitBranch, Users } from 'lucide-react';
import InnerLayout from '../../components/shared/InnerLayout';

const devs = [
  {
    initials: 'JR',
    name: 'Juan Camilo Rojas',
    role: 'Desarrollador',
    program: 'Ingeniería de Sistemas',
    focus: 'Agentes de IA · Multi-Agente · CoT · Arquitectura IA',
  },
  {
    initials: 'SA',
    name: 'Santiago Steven Arias Estupiñan',
    role: 'Desarrollador',
    program: 'Ingeniería de Sistemas',
    focus: 'Frontend · React · UI/UX · Conexión del Sistema',
  },
  {
    initials: 'CB',
    name: 'Camilo Andres Bueno Rey',
    role: 'Desarrollador',
    program: 'Ingeniería de Sistemas',
    focus: 'Backend · Node.js · API REST · Conexión del Sistema',
  },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay, ease: 'easeOut' as const },
});

export default function DesarrolladoresPage() {
  return (
    <InnerLayout backLabel="Volver al inicio">
      <div className="inner-wrap">

        {/* Hero */}
        <motion.div className="inner-hero" {...fadeUp()}>
          <span className="inner-pretitle">
            <Code2 size={12} /> Proyecto de Grado · 2026
          </span>
          <h1 className="inner-title">Equipo de desarrollo</h1>
          <p className="inner-sub">
            Cuatro estudiantes del programa de Ingeniería de Sistemas desarrollaron
            este prototipo como trabajo de grado, abarcando el diseño de la
            arquitectura, la implementación frontend, backend e integración de IA.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="icard-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 40 }}>
          {devs.map(({ initials, name, role, program, focus }, i) => (
            <motion.div key={name} className="dev-card" {...fadeUp(i * 0.1)}>
              <div className="dev-avatar">{initials}</div>
              <p className="dev-role">{role}</p>
              <h3 className="dev-name">{name}</h3>
              <p className="dev-sub" style={{ marginBottom: 14 }}>{program}</p>
              <div style={{
                padding: '8px 12px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                fontSize: '0.76rem',
                color: 'var(--ink3)',
                lineHeight: 1.5,
              }}>
                {focus}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Context card */}
        <motion.div className="prose-card" {...fadeUp(0.25)}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--p-subtle)', border: '1px solid var(--p-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--p)', flexShrink: 0 }}>
              <Users size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                Sobre el proyecto
              </h3>
              <p className="prose" style={{ margin: 0 }}>
                Este prototipo es el resultado de un trabajo colaborativo de cuatro
                estudiantes de ingeniería que combinaron conocimientos de desarrollo
                de software, arquitecturas de IA y educación médica para construir
                una herramienta de simulación clínica con retroalimentación formativa.
                El proyecto fue desarrollado durante 2025–2026 como requisito de grado.
              </p>
            </div>
          </div>
        </motion.div>

        {/* GitHub link */}
        <motion.div {...fadeUp(0.3)} style={{ marginTop: 20 }}>
          <a
            href="https://github.com/Steven08Ar/Prototipo-clinico"
            target="_blank"
            rel="noreferrer"
            className="btn-inner-primary"
            style={{ display: 'inline-flex' }}
          >
            <GitBranch size={16} /> Ver código fuente en GitHub
          </a>
        </motion.div>

      </div>
    </InnerLayout>
  );
}
