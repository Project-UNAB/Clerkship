import { motion } from 'framer-motion';
import { Scale } from 'lucide-react';
import InnerLayout from '../../components/shared/InnerLayout';

export default function TerminosPage() {
  return (
    <InnerLayout backLabel="Volver al inicio">
      <div className="inner-wrap">
        <motion.div
          className="inner-hero"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <span className="inner-pretitle">
            <Scale size={12} /> Marco legal
          </span>
          <h1 className="inner-title">Términos de uso</h1>
          <p className="inner-sub">
            Condiciones de uso del prototipo académico Clerkship.
            Versión 1.0 · Vigente desde enero de 2026.
          </p>
        </motion.div>

        <motion.div
          className="prose-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="prose">
            <h2>1. Naturaleza del sistema</h2>
            <p>
              Clerkship es un <strong>prototipo académico</strong> desarrollado como
              Proyecto de Grado en Ingeniería de Sistemas. No es un producto
              comercial, una plataforma de diagnóstico médico ni una herramienta
              de evaluación académica oficial. Su uso está restringido al contexto
              de investigación del proyecto de grado.
            </p>

            <h2>2. Usuarios autorizados</h2>
            <p>El acceso al prototipo está habilitado para:</p>
            <ul>
              <li>Estudiantes de ciencias de la salud vinculados a la institución educativa participante.</li>
              <li>Docentes y evaluadores del proyecto de grado.</li>
              <li>Miembros del equipo de desarrollo e investigación.</li>
            </ul>
            <p>
              El uso fuera de estos perfiles no está autorizado y podría
              comprometer la integridad de los datos de evaluación del prototipo.
            </p>

            <h2>3. Uso adecuado</h2>
            <p>Al acceder al prototipo, el usuario se compromete a:</p>
            <ul>
              <li>Usar el sistema con fines exclusivamente académicos y de entrenamiento.</li>
              <li>No introducir datos clínicos reales de pacientes en ningún campo del sistema.</li>
              <li>No intentar explotar vulnerabilidades técnicas del prototipo.</li>
              <li>No reproducir ni distribuir el contenido generado por el sistema fuera del contexto académico.</li>
              <li>Respetar la autoría del código fuente conforme a la licencia GPL-3.0.</li>
            </ul>

            <h2>4. Limitaciones del sistema</h2>
            <p>
              La retroalimentación generada por Clerkship es producida por modelos
              de Inteligencia Artificial y <strong>no sustituye</strong>:
            </p>
            <ul>
              <li>El criterio clínico de un médico o docente calificado.</li>
              <li>La evaluación académica formal del programa de ciencias de la salud.</li>
              <li>Protocolos clínicos institucionales o guías de práctica.</li>
            </ul>

            <h2>5. Propiedad intelectual</h2>
            <p>
              El código fuente de Clerkship se distribuye bajo la{' '}
              <strong>Licencia GNU General Public License v3.0 (GPL-3.0)</strong>.
              Cualquier derivación o uso del código debe mantener la misma licencia
              y reconocer la autoría del equipo desarrollador.
            </p>

            <h2>6. Disponibilidad</h2>
            <p>
              El prototipo se ofrece "tal como está" (as-is) para fines de
              evaluación académica. El equipo no garantiza disponibilidad continua,
              ya que el sistema puede estar fuera de línea durante periodos de
              mantenimiento o evaluación del proyecto de grado.
            </p>

            <h2>7. Modificaciones</h2>
            <p>
              Estos términos pueden actualizarse durante el ciclo de vida del
              proyecto. Los cambios se comunicarán a través del repositorio oficial
              en GitHub.
            </p>
          </div>
        </motion.div>
      </div>
    </InnerLayout>
  );
}
