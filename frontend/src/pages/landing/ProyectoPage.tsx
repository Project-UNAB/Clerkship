import { useState } from 'react';
import { motion } from 'framer-motion';
import InteractiveBackgroundCanvas from '../../components/shared/InteractiveBackgroundCanvas';
import {
  Stethoscope, Activity, Microscope,
  ShieldCheck, Database, BrainCircuit,
  Users, CheckCircle2, FlaskConical,
  Code, Layout, Cloud, Cpu, Sparkles,
  Network, ChevronRight, BookOpen, FileSpreadsheet
} from 'lucide-react';

/* ══════════════════════════════════════════════════════
   Data Structures
══════════════════════════════════════════════════════ */

const DEVS = [
  { initials: 'JR', name: 'Juan Camilo Rojas', seed: 'Leo', color: '#EC4899',
    focus: 'Agentes de IA · Multi-Agente · CoT · Arquitectura IA',
    desc: 'Especialista en agentes inteligentes. Orquesta el flujo multi-agente, la simulación del paciente virtual y el análisis automatizado de sesgos cognitivos.',
    skills: [
      { label: 'Agentes IA', icon: BrainCircuit },
      { label: 'Multi-Agente', icon: Network },
      { label: 'Fine-Tuning', icon: Sparkles },
    ]
  },
  { initials: 'SA', name: 'Santiago Steven Arias Estupiñán', seed: 'Aneka', color: '#10B981',
    focus: 'Frontend · React · UI/UX · Conexión del Sistema',
    desc: 'Líder de desarrollo Frontend. Diseña y construye la interfaz interactiva en React 19 y la conexión integral con el motor clínico.',
    skills: [
      { label: 'React', icon: Code },
      { label: 'TypeScript', icon: Layout },
      { label: 'UI/UX', icon: Sparkles },
    ]
  },
  { initials: 'CB', name: 'Camilo Andrés Bueno Rey', seed: 'Jasper', color: '#8B5CF6',
    focus: 'Backend · Node.js · API REST · Conexión del Sistema',
    desc: 'Líder de arquitectura Backend. Construye el servidor API REST en Node.js, la gestión de datos y la infraestructura de conexión entre sistemas.',
    skills: [
      { label: 'Node.js', icon: Cloud },
      { label: 'API REST', icon: Database },
      { label: 'Backend', icon: Cpu },
    ]
  },
];

const METRICS = [
  { n: '795.000', label: 'Muertes o discapacidades al año por errores diagnósticos prevenibles (EE.UU.)', sub: 'Estudio BMJ Quality & Safety' },
  { n: '75 %', label: 'De los errores diagnósticos tienen factores cognitivos identificables', sub: 'Entrenables mediante simulación' },
  { n: '6,4 h', label: 'Dedicadas explícitamente al razonamiento clínico en toda la carrera', sub: 'Brecha curricular identificada' },
  { n: 'TRL 4', label: 'Nivel de madurez tecnológica del prototipo funcional a entregar', sub: 'Finales de 2026' }
];

const SPECIFIC_OBJECTIVES = [
  { num: '01', title: 'Revisión y Recopilación', desc: 'Recopilar información clínica, pedagógica y tecnológica mediante revisión sistemática PRISMA de literatura científica sobre razonamiento clínico y simulación con IA.' },
  { num: '02', title: 'Diseño de Arquitectura', desc: 'Diseñar el prototipo interactivo identificando requerimientos funcionales, pedagógicos y técnicos, estructurando el pipeline agéntico y los modelos de casos clínicos.' },
  { num: '03', title: 'Desarrollo del Prototipo', desc: 'Desarrollar el prototipo interactivo integrando módulos de presentación de casos clínicos, toma de decisiones diagnósticas y retroalimentación formativa en tiempo real.' },
  { num: '04', title: 'Validación con Expertos', desc: 'Validar el prototipo mediante evaluación por expertos médicos de la UNAB y la Clínica Foscal Florida, analizando pertinencia clínica y calidad del feedback.' }
];

const THEORETICAL_CARDS = [
  { title: 'Procesamiento Dual (S1 / S2)', desc: 'El razonamiento médico opera en dos sistemas: S1 rápido e intuitivo, y S2 analítico y deliberado. La propuesta cultiva explícitamente el Sistema 2.', icon: Activity },
  { title: 'Modelos de Lenguaje (LLM)', desc: 'Los LLMs generan escenarios clínicos dinámicos y adaptativos que reaccionan a las hipótesis intermedias planteadas por el estudiante.', icon: BrainCircuit },
  { title: 'Retroalimentación Formativa', desc: 'Feedback específico e inmediato que explica qué pasos fueron correctos o erróneos durante el proceso razonado de diagnóstico.', icon: CheckCircle2 },
  { title: 'Simulación Clínica Digital', desc: 'Entorno de práctica sin riesgo para pacientes reales que replica el proceso cognitivo del diagnóstico clínico con repetición deliberada.', icon: Stethoscope }
];

const REGULATORY_CARDS = [
  { title: 'Ley 1581/2012 + Dec. 1377/2013', desc: 'Protección de datos personales en Colombia. Orienta el diseño de autenticación, control de acceso y manejo seguro de interacciones.', icon: ShieldCheck },
  { title: 'Resolución 8430 de 1993', desc: 'Clasifica el proyecto como investigación sin riesgo: no involucra intervención en pacientes ni datos reales. Validación voluntaria.', icon: FlaskConical },
  { title: 'ISO/IEC 25010 · ISO/IEC 27001', desc: 'Estándares de calidad de software (funcionalidad, usabilidad, eficiencia) y seguridad de la información como marco para métricas técnicas.', icon: CheckCircle2 },
  { title: 'Transparencia Algorítmica', desc: 'El sistema declara explícitamente que la retroalimentación es generada por IA, cumpliendo principios de IA responsable en salud.', icon: Database }
];

const AGENT_PIPELINE = [
  { num: 'AGENTE 1', title: 'Generador de Casos y Paciente Virtual', desc: 'Genera el escenario clínico del dominio gastrointestinal y simula el diálogo interactivo del paciente durante la anamnesis.', badge: 'Simulación', color: '#1976D2' },
  { num: 'AGENTE 2', title: 'Resolvedor Diagnóstico (Ground Truth)', desc: 'Resuelve de forma autónoma el caso clínico generando la ruta ideal de diagnóstico y tratamiento como patrón de referencia.', badge: 'Ground Truth', color: '#0D47A1' },
  { num: 'AGENTE 3', title: 'Validador y Pedagogo Formativo', desc: 'Compara las decisiones e hipótesis del estudiante contra la ruta ideal y emite retroalimentación formativa explicativa en tiempo real.', badge: 'Retroalimentación', color: '#0097A7' }
];

const BUDGET_ITEMS = [
  { name: 'Recursos Humanos (Principal)', items: ['3 Investigadores-Estudiantes de Ingeniería UNAB', 'Dirección y Co-dirección Académica UNAB', 'Validación por médicos expertos Clínica Foscal'], accent: true, icon: Users },
  { name: 'Fine-Tuning Open-Weights', items: ['Modelos base open-weights (Llama 3.1 / Mistral / Qwen 2.5)', 'Técnica Unsloth: reduce uso de VRAM un 70%', 'Google Colab Pro+ para entrenamiento GPU'], icon: Cpu },
  { name: 'Despliegue y Hosting', items: ['Vercel: Frontend React + TypeScript (capa gratuita)', 'Render: Backend FastAPI + LangGraph (capa gratuita)', 'Costo estimado por caso simulado: $0.02 - $0.51'], icon: Cloud },
  { name: 'Corpus Clínico GI', items: ['PMC Open Access, MedCaseReasoning (Stanford 14k)', 'MedQA-ES, corpus E3C y GPC colombianas', 'Validación de viabilidad y curación por expertos'], icon: Database }
];

const REFERENCES = [
  { authors: 'Kononowicz, A. A., et al.', title: 'Virtual patient simulations in health professions education: systematic review and meta-analysis.', where: 'Journal of Medical Internet Research, 21(7). 2019.' },
  { authors: 'Cook, D. A., et al.', title: 'Artificial intelligence for clinical education: a systematic review.', where: 'Academic Medicine, 100(3). 2025.' },
  { authors: 'Norman, G., & Eva, K.', title: 'Diagnostic error and clinical reasoning.', where: 'Medical Education, 58(1). 2024.' },
  { authors: 'Savage, T., et al.', title: 'Diagnostic reasoning prompts reveal a core tension between clinical LLMs.', where: 'NPJ Digital Medicine, 7(1). 2024.' },
  { authors: 'Newman-Toker, D. E., et al.', title: 'Burden of serious harms from diagnostic error in the USA.', where: 'BMJ Quality & Safety, 33(2), 109–120. 2024.' },
  { authors: 'Peralta Ramírez, J., et al.', title: 'IA generativa para simulación clínica en educación médica latinoamericana.', where: 'Revista Latinoamericana de Educación Médica. 2025.' },
  { authors: 'Kahneman, D.', title: 'Thinking, Fast and Slow.', where: 'Farrar, Straus and Giroux. 2011.' },
  { authors: 'Singhal, K., et al.', title: 'Large language models encode clinical knowledge (Med-PaLM).', where: 'Nature, 620, 172–180. 2023.' }
];

import HeaderNav from '../../components/shared/HeaderNav';

/* ══════════════════════════════════════════════════════
   Component
══════════════════════════════════════════════════════ */
export default function ProyectoPage() {
  const [activeTab, setActiveTab] = useState<'teoria' | 'normativa'>('teoria');

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="lp-root proy-web-root">
      {/* Interactive Floating Background Canvas (Fixed behind everything) */}
      <InteractiveBackgroundCanvas />

      {/* ── Header Centrado Sin Hamburguesa ── */}
      <HeaderNav activeTab="como-funciona" />

      {/* ══════════════════════════════════════════════
          Hero Section
      ══════════════════════════════════════════════ */}
      <section className="lp-hero proy-hero-section">
        <div className="proy-hero-badge">
          <Sparkles size={14} />
          PROYECTO DE GRADO · UNAB & CLÍNICA FOSCAL 2026
        </div>

        <h1 className="proy-hero-title">
          Entrenamiento y Evaluación del <br />
          <span className="proy-hero-title-gradient">Razonamiento Clínico</span> con IA
        </h1>

        <p className="proy-hero-desc">
          Un prototipo interactivo basado en una arquitectura agéntica de 3 modelos de inteligencia artificial,
          orientado a corregir vacíos cognitivos en estudiantes de ciencias de la salud de la UNAB.
        </p>

        <div className="proy-hero-actions">
          <button className="lp-btn-primary" onClick={() => scrollTo('metodologia-proy')}>
            Explorar Arquitectura Agéntica
            <ChevronRight size={16} />
          </button>
          <button className="lp-btn-secondary" onClick={() => scrollTo('equipo-proy')}>
            Conocer al Equipo
          </button>
        </div>

        {/* Hero Metrics Strip */}
        <div className="proy-metrics-container">
          {METRICS.map((m, idx) => (
            <motion.div 
              key={idx} 
              className="proy-metric-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
            >
              <div className="proy-metric-num">{m.n}</div>
              <div className="proy-metric-label">{m.label}</div>
              <div className="proy-metric-sub">{m.sub}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          Section 1: Planteamiento del Problema
      ══════════════════════════════════════════════ */}
      <section className="lp-sec-wrap proy-sec-container" id="problema">
        <div className="lp-sec-header">
          <p className="lp-sec-pretitle">Contexto y Diagnóstico Académico</p>
          <h2 className="lp-sec-title">Planteamiento del Problema</h2>
          <p className="lp-sec-desc">
            Los estudiantes de medicina no reciben suficiente retroalimentación sobre su proceso de razonamiento diagnóstico durante la carrera.
          </p>
        </div>

        <div className="proy-grid-3">
          {/* Cause 1 */}
          <div className="proy-card-clean">
            <div className="proy-card-icon-box blue">
              <FileSpreadsheet size={22} />
            </div>
            <h3 className="proy-card-h3">6,4 Horas Curriculares</h3>
            <p className="proy-card-p">
              En Colombia y gran parte de Latinoamérica, el currículo médico dedica un promedio de apenas 6,4 horas en toda la carrera a la enseñanza formal del razonamiento clínico.
            </p>
          </div>

          {/* Cause 2 */}
          <div className="proy-card-clean">
            <div className="proy-card-icon-box darkblue">
              <Activity size={22} />
            </div>
            <h3 className="proy-card-h3">Evaluación del Producto</h3>
            <p className="proy-card-p">
              Los simuladores clínicos tradicionales evalúan únicamente si el diagnóstico final fue correcto o incorrecto, ignorando las decisiones intermedias y los sesgos cognitivos.
            </p>
          </div>

          {/* Cause 3 */}
          <div className="proy-card-clean">
            <div className="proy-card-icon-box cyan">
              <Users size={22} />
            </div>
            <h3 className="proy-card-h3">Carga Asistencial (Ley 100)</h3>
            <p className="proy-card-p">
              La presión asistencial en hospitales universitarios reduce drásticamente el tiempo de los docentes médicos para brindar retroalimentación individualizada y explicativa.
            </p>
          </div>
        </div>

        {/* Highlight Banner */}
        <div className="proy-alert-banner">
          <div className="proy-alert-icon">
            <Microscope size={26} />
          </div>
          <div>
            <h4 className="proy-alert-h4">Hallazgo en Escenarios Colombianos</h4>
            <p className="proy-alert-p">
              Estudios recientes en facultades de medicina de Bogotá confirman que el aprendizaje del razonamiento clínico sigue siendo percibido como un proceso predominantemente <em>implícito</em>, sin metodologías formales de entrenamiento en ninguna etapa de la formación.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          Section 2: Pregunta e Hipótesis
      ══════════════════════════════════════════════ */}
      <section className="lp-sec-wrap proy-sec-container" id="hipotesis">
        <div className="proy-hypothesis-card">
          <div className="proy-hyp-badge">
            <BrainCircuit size={16} /> PREGUNTA E HIPÓTESIS PRINCIPAL
          </div>

          <h2 className="proy-hyp-q">
            "¿Cómo contribuir al entrenamiento y evaluación del razonamiento clínico mediante una plataforma web con simulación interactiva agéntica y retroalimentación cognitiva en la UNAB?"
          </h2>

          <div className="proy-hyp-divider"></div>

          <div className="proy-hyp-answer">
            <span className="proy-hyp-tag">Hipótesis Formulada</span>
            <p className="proy-hyp-p">
              Un sistema agéntico capaz de retroalimentar las decisiones intermedias del estudiante —y no solo su diagnóstico final— puede identificar y corregir patrones cognitivos disfuncionales (Sistema 1 vs Sistema 2) que los simuladores tradicionales no detectan.
              <br />
              <strong style={{ color: '#90CAF9' }}>(Kononowicz et al., 2019 — Metaanálisis PRISMA con efecto d = 0,90)</strong>
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          Section 3: Objetivos del Proyecto
      ══════════════════════════════════════════════ */}
      <section className="lp-sec-wrap proy-sec-container" id="objetivos">
        <div className="lp-sec-header">
          <p className="lp-sec-pretitle">Plan Estratégico</p>
          <h2 className="lp-sec-title">Objetivos de Investigación</h2>
        </div>

        {/* General Objective */}
        <div className="proy-gen-obj-box">
          <span className="proy-gen-obj-badge">OBJETIVO GENERAL</span>
          <p className="proy-gen-obj-text">
            Construir un prototipo interactivo de casos clínicos basado en inteligencia artificial, a través de la resolución guiada de escenarios diagnósticos con retroalimentación formativa, para el entrenamiento y evaluación de los componentes del razonamiento clínico en la comunidad académica y profesional de las ciencias de la salud de la UNAB.
          </p>
        </div>

        {/* 4 Specific Objectives */}
        <div className="proy-grid-2">
          {SPECIFIC_OBJECTIVES.map((obj, i) => (
            <div key={i} className="proy-spec-obj-card">
              <div className="proy-spec-num">{obj.num}</div>
              <div>
                <h4 className="proy-spec-h4">{obj.title}</h4>
                <p className="proy-spec-p">{obj.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          Section 4: Marcos Teórico y Normativo
      ══════════════════════════════════════════════ */}
      <section className="lp-sec-wrap proy-sec-container" id="marcos">
        <div className="lp-sec-header">
          <p className="lp-sec-pretitle">Fundamentación Científica</p>
          <h2 className="lp-sec-title">Marcos de Referencia</h2>

          <div className="proy-tab-selector">
            <button 
              className={`proy-tab-btn ${activeTab === 'teoria' ? 'active' : ''}`}
              onClick={() => setActiveTab('teoria')}
            >
              <BookOpen size={16} /> Marco Teórico
            </button>
            <button 
              className={`proy-tab-btn ${activeTab === 'normativa' ? 'active' : ''}`}
              onClick={() => setActiveTab('normativa')}
            >
              <ShieldCheck size={16} /> Marco Normativo
            </button>
          </div>
        </div>

        {activeTab === 'teoria' ? (
          <div className="proy-grid-2">
            {THEORETICAL_CARDS.map((c, i) => (
              <div key={i} className="proy-card-clean">
                <div className="proy-card-icon-box blue">
                  <c.icon size={22} />
                </div>
                <h3 className="proy-card-h3">{c.title}</h3>
                <p className="proy-card-p">{c.desc}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="proy-grid-2">
            {REGULATORY_CARDS.map((c, i) => (
              <div key={i} className="proy-card-clean">
                <div className="proy-card-icon-box darkblue">
                  <c.icon size={22} />
                </div>
                <h3 className="proy-card-h3">{c.title}</h3>
                <p className="proy-card-p">{c.desc}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════
          Section 5: Metodología Agéntica (Wave Container 75% White)
      ══════════════════════════════════════════════ */}
      <section className="lp-met-wave-section" id="metodologia-proy">
        {/* Top Wave */}
        <div className="lp-met-wave-top">
          <svg viewBox="0 0 1440 120" preserveAspectRatio="none">
            <path className="lp-met-wave-path" d="M0,40L60,48C120,56,240,72,360,74.7C480,77,600,67,720,53.3C840,40,960,21,1080,16C1200,11,1320,21,1380,26.7L1440,32L1440,120L1380,120C1320,120,1200,120,1080,120C960,120,840,120,720,120C600,120,480,120,360,120C240,120,120,120,60,120L0,120Z"></path>
          </svg>
        </div>

        <div className="lp-met-inner-wrap">
          <div className="lp-sec-header">
            <p className="lp-sec-pretitle">Arquitectura del Sistema</p>
            <h2 className="lp-sec-title">Pipeline de 3 Agentes de IA</h2>
            <p className="lp-sec-desc">
              Orquestación inteligente con LangGraph en el dominio Gastrointestinal (GI) para garantizar fidelidad médica y evaluación objetiva.
            </p>
          </div>

          <div className="proy-agent-pipeline-grid">
            {AGENT_PIPELINE.map((ag, i) => (
              <div key={i} className="proy-agent-card" style={{ borderTop: `4px solid ${ag.color}` }}>
                <div className="proy-agent-header">
                  <span className="proy-agent-num">{ag.num}</span>
                  <span className="proy-agent-badge" style={{ backgroundColor: ag.color }}>{ag.badge}</span>
                </div>
                <h3 className="proy-agent-title">{ag.title}</h3>
                <p className="proy-agent-desc">{ag.desc}</p>
              </div>
            ))}
          </div>

          {/* TRL Progress Banner */}
          <div className="proy-trl-banner">
            <h4 className="proy-trl-title">Métricas de Rendimiento & Validación (TRL 4)</h4>
            <div className="proy-trl-chips">
              <span className="proy-chip">Accuracy ≥ 65%</span>
              <span className="proy-chip">Recall ≥ 60%</span>
              <span className="proy-chip">Alucinaciones ≤ 5%</span>
              <span className="proy-chip">BERTScore ≥ 0,80</span>
              <span className="proy-chip">Latencia ≤ 8s</span>
            </div>
          </div>
        </div>

        {/* Bottom Wave */}
        <div className="lp-met-wave-bottom">
          <svg viewBox="0 0 1440 120" preserveAspectRatio="none">
            <path className="lp-met-wave-path" d="M0,64L60,69.3C120,75,240,85,360,80C480,75,600,53,720,48C840,43,960,53,1080,64C1200,75,1320,85,1380,90.7L1440,96L1440,0L1380,0C1320,0,1200,0,1080,0C960,0,840,0,720,0C600,0,480,0,360,0C240,0,120,0,60,0L0,0Z"></path>
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          Section 6: Presupuesto
      ══════════════════════════════════════════════ */}
      <section className="lp-sec-wrap proy-sec-container" id="presupuesto">
        <div className="lp-sec-header">
          <p className="lp-sec-pretitle">Viabilidad Financiera</p>
          <h2 className="lp-sec-title">Estructura de Costos</h2>
          <p className="lp-sec-desc">
            Optimizado mediante modelos open-weights con Unsloth y capas gratuitas de infraestructura sin costo de licenciamiento.
          </p>
        </div>

        <div className="proy-grid-2">
          {BUDGET_ITEMS.map((b, i) => (
            <div key={i} className={`proy-card-clean ${b.accent ? 'proy-card-highlight' : ''}`}>
              <div className="proy-card-header-flex">
                <b.icon size={22} className="proy-bicon" />
                <h3 className="proy-card-h3" style={{ marginBottom: 0 }}>{b.name}</h3>
              </div>
              <ul className="proy-budget-ul">
                {b.items.map((it, j) => (
                  <li key={j}>· {it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          Section 7: Equipo de Mentes
      ══════════════════════════════════════════════ */}
      <section className="lp-sec-wrap proy-sec-container" id="equipo-proy">
        <div className="lp-sec-header">
          <p className="lp-sec-pretitle">Ingeniería UNAB</p>
          <h2 className="lp-sec-title">Las Mentes Detrás del Proyecto</h2>
          <p className="lp-sec-desc">
            Estudiantes e investigadores de la Universidad Autónoma de Bucaramanga.
          </p>
        </div>

        <div className="lp-equipo-cards">
          {DEVS.map((d, i) => (
            <motion.div 
              key={d.initials} 
              className="lp-equipo-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              viewport={{ once: true }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
              }}
              style={{ borderTop: `4px solid ${d.color}`, '--dev-color': d.color } as React.CSSProperties}
            >
               <div className="lp-equipo-avatar-box" style={{ borderColor: `${d.color}40` }}>
                 <img 
                   src={`https://api.dicebear.com/7.x/notionists/svg?seed=${d.seed}&backgroundColor=${d.color.replace('#','')}`} 
                   alt={d.name} 
                   className="lp-equipo-avatar" 
                 />
               </div>

               <div className="lp-equipo-card-top">
                 <h4 className="lp-equipo-card-name">{d.name}</h4>
                 <p className="lp-equipo-card-focus" style={{ color: d.color }}>{d.focus}</p>
                 <p className="lp-equipo-card-desc">{d.desc}</p>
               </div>

               <div className="lp-equipo-skills-wrap">
                 <div className="lp-equipo-skills-divider" />
                 <div className="lp-equipo-skills">
                   {d.skills.map((s, j) => (
                     <span key={j} className="lp-equipo-skill-tag">
                       <s.icon size={13} /> {s.label}
                     </span>
                   ))}
                 </div>
               </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          Section 8: Referencias Bibliográficas
      ══════════════════════════════════════════════ */}
      <section className="lp-sec-wrap proy-sec-container" id="referencias">
        <div className="lp-sec-header">
          <p className="lp-sec-pretitle">Evidencia Científica PRISMA</p>
          <h2 className="lp-sec-title">Referencias Bibliográficas</h2>
        </div>

        <div className="proy-refs-grid">
          {REFERENCES.map((r, i) => (
            <div key={i} className="proy-ref-card">
              <span className="proy-ref-badge">[{i + 1}]</span>
              <div>
                <strong className="proy-ref-authors">{r.authors}</strong>
                <p className="proy-ref-title">{r.title}</p>
                <span className="proy-ref-where">{r.where}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          Footer
      ══════════════════════════════════════════════ */}
      <footer className="lp-footer">
        <span className="lp-footer-copy">© 2026 Clerkship · Proyecto de Grado</span>
        <div className="lp-tagline">
          <img src="/corazon_signos.svg" alt="" className="lp-tagline-ico" />
          <span>Sistema para la mejora del aprendizaje en la salud</span>
        </div>
        <a href="https://github.com/Steven08Ar/Prototipo-clinico"
          target="_blank" rel="noreferrer" className="lp-gh">
          <img src="/github.svg" alt="GitHub" />
        </a>
      </footer>
    </div>
  );
}
