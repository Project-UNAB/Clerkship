import { motion } from 'framer-motion';
import { FileCode2, GitBranch, ExternalLink } from 'lucide-react';
import InnerLayout from '../../components/shared/InnerLayout';

const permissions = [
  { label: 'Uso comercial', allowed: true },
  { label: 'Modificación del código', allowed: true },
  { label: 'Distribución', allowed: true },
  { label: 'Uso privado', allowed: true },
  { label: 'Sublicenciamiento', allowed: false },
  { label: 'Distribución sin licencia GPL-3.0', allowed: false },
  { label: 'Uso con licencia propietaria cerrada', allowed: false },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: 'easeOut' as const },
});

export default function LicenciaPage() {
  return (
    <InnerLayout backLabel="Volver al inicio">
      <div className="inner-wrap">

        <motion.div className="inner-hero" {...fadeUp()}>
          <span className="inner-pretitle">
            <FileCode2 size={12} /> Código abierto
          </span>
          <h1 className="inner-title">Licencia GPL-3.0</h1>
          <p className="inner-sub">
            El código fuente de Clerkship se distribuye bajo la Licencia Pública
            General GNU versión 3 (GPL-3.0), garantizando acceso abierto al
            conocimiento generado en este Proyecto de Grado.
          </p>
        </motion.div>

        {/* License badge */}
        <motion.div
          className="prose-card"
          style={{ marginBottom: 24, textAlign: 'center', padding: '32px 24px' }}
          {...fadeUp(0.08)}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '12px 24px', borderRadius: 'var(--r-ful)',
            background: 'var(--p-subtle)', border: '1.5px solid var(--p-border)',
            color: 'var(--p-dk)', fontWeight: 700, fontSize: '1.05rem',
            marginBottom: 16,
          }}>
            <FileCode2 size={20} />
            GNU General Public License v3.0
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink3)', margin: 0 }}>
            Copyright © 2025–2026 · Equipo Clerkship · Proyecto de Grado UNAB
          </p>
        </motion.div>

        {/* Permissions table */}
        <motion.div className="prose-card" style={{ marginBottom: 24 }} {...fadeUp(0.12)}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
            Permisos y restricciones
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink3)', marginBottom: 20 }}>
            Lo que permite y prohíbe la licencia GPL-3.0
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {permissions.map(({ label, allowed }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 'var(--r-md)',
                background: allowed ? 'rgba(0,180,140,0.05)' : 'rgba(220,50,50,0.04)',
                border: `1px solid ${allowed ? 'rgba(0,180,140,0.15)' : 'rgba(220,50,50,0.12)'}`,
              }}>
                <span style={{ fontSize: '0.87rem', color: 'var(--ink2)' }}>{label}</span>
                <span style={{
                  fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px',
                  borderRadius: 'var(--r-ful)',
                  background: allowed ? 'rgba(0,180,140,0.12)' : 'rgba(220,50,50,0.1)',
                  color: allowed ? '#007A5E' : '#B03030',
                }}>
                  {allowed ? 'Permitido' : 'Restringido'}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Conditions */}
        <motion.div className="prose-card" style={{ marginBottom: 24 }} {...fadeUp(0.16)}>
          <div className="prose">
            <h2>Condiciones obligatorias</h2>
            <p>
              Cualquier uso, modificación o distribución del código fuente de
              Clerkship debe cumplir con las siguientes condiciones impuestas por
              la licencia GPL-3.0:
            </p>
            <ul>
              <li>
                <strong>Divulgación del código fuente:</strong> Toda distribución
                del software (o sus derivados) debe incluir el código fuente
                completo o un enlace a él.
              </li>
              <li>
                <strong>Misma licencia:</strong> Las obras derivadas deben
                distribuirse bajo la misma licencia GPL-3.0. No se puede cambiar
                a una licencia más restrictiva o propietaria.
              </li>
              <li>
                <strong>Aviso de autoría:</strong> Se debe conservar el aviso de
                copyright original del equipo desarrollador y el texto de la
                licencia en todas las copias.
              </li>
              <li>
                <strong>Registro de cambios:</strong> Las modificaciones realizadas
                al código deben documentarse claramente para distinguirlas del
                código original.
              </li>
            </ul>

            <h2>Garantía y responsabilidad</h2>
            <p>
              El software se distribuye <strong>"tal como está" (as-is)</strong>,
              sin garantía de ningún tipo. El equipo desarrollador no asume
              responsabilidad por daños derivados del uso del código en cualquier
              contexto fuera del académico para el que fue diseñado.
            </p>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div {...fadeUp(0.22)} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a
            href="https://github.com/Steven08Ar/Prototipo-clinico"
            target="_blank"
            rel="noreferrer"
            className="btn-inner-primary"
            style={{ display: 'inline-flex' }}
          >
            <GitBranch size={16} /> Ver repositorio en GitHub
          </a>
          <a
            href="https://www.gnu.org/licenses/gpl-3.0.html"
            target="_blank"
            rel="noreferrer"
            className="btn-inner-ghost"
            style={{ display: 'inline-flex' }}
          >
            <ExternalLink size={16} /> Texto completo GPL-3.0
          </a>
        </motion.div>

      </div>
    </InnerLayout>
  );
}
