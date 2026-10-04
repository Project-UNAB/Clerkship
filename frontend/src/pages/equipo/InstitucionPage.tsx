import { motion } from 'framer-motion';
import { Building2, GraduationCap, MapPin, Users, Stethoscope, BookOpen } from 'lucide-react';
import InnerLayout from '../../components/shared/InnerLayout';

const details = [
  { Icon: Building2, key: 'Institución', val: 'Universidad Autónoma de Bucaramanga (UNAB)' },
  { Icon: GraduationCap, key: 'Facultad', val: 'Facultad de Ingeniería' },
  { Icon: BookOpen, key: 'Programa', val: 'Ingeniería de Sistemas' },
  { Icon: MapPin, key: 'Ciudad', val: 'Bucaramanga, Santander, Colombia' },
  { Icon: Users, key: 'Año', val: '2025 – 2026' },
  { Icon: Stethoscope, key: 'Aliado clínico', val: 'Sector clínico universitario de la región' },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay, ease: 'easeOut' as const },
});

export default function InstitucionPage() {
  return (
    <InnerLayout backLabel="Volver al inicio">
      <div className="inner-wrap">

        {/* Hero */}
        <motion.div className="inner-hero" {...fadeUp()}>
          <span className="inner-pretitle">
            <Building2 size={12} /> Respaldo institucional
          </span>
          <h1 className="inner-title">Institución educativa</h1>
          <p className="inner-sub">
            El prototipo Clerkship fue desarrollado con el respaldo académico e
            institucional de la Universidad Autónoma de Bucaramanga (UNAB), en
            alianza con el sector clínico universitario de la región.
          </p>
        </motion.div>

        {/* Details panel */}
        <motion.div className="prose-card" style={{ marginBottom: 24 }} {...fadeUp(0.08)}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
            Información institucional
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink3)', marginBottom: 20 }}>
            Datos del proyecto de grado
          </p>
          {details.map(({ Icon, key, val }) => (
            <div key={key} className="inst-detail-row">
              <Icon size={18} className="inst-detail-ico" style={{ color: 'var(--p)' }} />
              <div>
                <p className="inst-detail-key">{key}</p>
                <p className="inst-detail-val">{val}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Context */}
        <motion.div className="icard-grid-2" {...fadeUp(0.16)}>
          <div className="icard">
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--p-subtle)', border: '1px solid var(--p-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--p)', marginBottom: 16 }}>
              <GraduationCap size={20} />
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
              Contexto académico
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink3)', lineHeight: 1.7 }}>
              El proyecto se enmarca en la línea de investigación de tecnología
              aplicada a la educación en salud, desarrollado como Proyecto de Grado
              de pregrado en Ingeniería de Sistemas.
            </p>
          </div>
          <div className="icard">
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,180,140,0.08)', border: '1px solid rgba(0,180,140,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00A882', marginBottom: 16 }}>
              <Stethoscope size={20} />
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
              Alianza clínica
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink3)', lineHeight: 1.7 }}>
              El prototipo cuenta con el aval del sector clínico universitario de
              la región como aliado estratégico para la validación del dominio
              gastrointestinal de los casos clínicos generados.
            </p>
          </div>
        </motion.div>

        {/* Normative */}
        <motion.div
          {...fadeUp(0.24)}
          style={{ marginTop: 20, padding: '16px 20px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}
        >
          <p style={{ fontSize: '0.82rem', color: 'var(--ink3)', lineHeight: 1.65 }}>
            La propiedad intelectual del prototipo se rige por la{' '}
            <strong style={{ color: 'var(--ink2)' }}>Política de Propiedad Intelectual
            de la UNAB (2021)</strong>. El código fuente se distribuye bajo licencia
            GPL-3.0 garantizando acceso abierto al conocimiento generado.
          </p>
        </motion.div>

      </div>
    </InnerLayout>
  );
}
