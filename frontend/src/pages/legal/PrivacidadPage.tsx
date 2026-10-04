import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import InnerLayout from '../../components/shared/InnerLayout';

export default function PrivacidadPage() {
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
            <Shield size={12} /> Protección de datos
          </span>
          <h1 className="inner-title">Política de privacidad</h1>
          <p className="inner-sub">
            Tratamiento de datos personales en el prototipo académico Clerkship.
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
            <h2>1. Responsable del tratamiento</h2>
            <p>
              El tratamiento de los datos personales recolectados en este prototipo
              es responsabilidad del equipo de desarrollo del Proyecto de Grado
              Clerkship, adscrito a la Facultad de Ingeniería de la institución
              educativa participante. Este prototipo opera exclusivamente en un
              entorno académico y de investigación.
            </p>

            <h2>2. Datos recolectados</h2>
            <p>
              Con el fin de operar la simulación clínica, el sistema puede
              recolectar los siguientes datos:
            </p>
            <ul>
              <li><strong>Correo electrónico institucional:</strong> usado como identificador de sesión.</li>
              <li><strong>Interacciones de simulación:</strong> conversaciones con el paciente virtual, hipótesis diagnósticas y decisiones clínicas tomadas durante la sesión.</li>
              <li><strong>Datos de navegación:</strong> páginas visitadas y tiempo de sesión para análisis de uso del prototipo.</li>
            </ul>
            <p>
              El sistema <strong>no recolecta</strong> datos clínicos reales de
              pacientes, información de salud personal del estudiante, ni datos
              sensibles fuera del contexto de la simulación.
            </p>

            <h2>3. Finalidad del tratamiento</h2>
            <p>Los datos recolectados se utilizan exclusivamente para:</p>
            <ul>
              <li>Gestionar el acceso al prototipo mediante autenticación.</li>
              <li>Generar retroalimentación formativa personalizada por sesión.</li>
              <li>Analizar el comportamiento de uso del prototipo con fines investigativos.</li>
              <li>Cumplir los requisitos de evaluación del Proyecto de Grado.</li>
            </ul>
            <p>
              Los datos <strong>no serán cedidos, vendidos ni compartidos</strong>{' '}
              con terceros externos al equipo de investigación.
            </p>

            <h2>4. Base legal</h2>
            <p>
              El tratamiento de datos se fundamenta en el{' '}
              <strong>consentimiento informado</strong> del usuario, otorgado al
              aceptar las condiciones de uso en el acceso inicial. El prototipo
              cumple con la{' '}
              <strong>Ley 1581 de 2012</strong> (Ley de Protección de Datos
              Personales de Colombia) y el{' '}
              <strong>Decreto 1377 de 2013</strong> que la reglamenta.
            </p>

            <h2>5. Almacenamiento y seguridad</h2>
            <p>
              Los datos de sesión se almacenan en servidores del entorno de
              desarrollo del prototipo. Se aplican medidas básicas de seguridad
              acordes al carácter académico del sistema: transmisión cifrada
              (HTTPS) y acceso restringido a los miembros del equipo.
            </p>
            <p>
              Dado que es un prototipo académico, <strong>no se garantiza</strong>{' '}
              la misma robustez de seguridad que un sistema en producción
              certificado. Los usuarios no deben ingresar información personal
              sensible más allá de la requerida para el acceso.
            </p>

            <h2>6. Derechos del titular</h2>
            <p>
              Los usuarios tienen derecho a conocer, actualizar, rectificar y
              suprimir sus datos personales. Para ejercer estos derechos, pueden
              contactar al equipo de desarrollo a través del repositorio oficial
              del proyecto en GitHub o por los canales institucionales de la
              entidad educativa.
            </p>

            <h2>7. Retención de datos</h2>
            <p>
              Los datos se conservarán durante el ciclo de vida del Proyecto de
              Grado (2025–2026). Finalizado el proyecto, los datos de interacción
              podrán conservarse de forma anonimizada para futuras investigaciones
              académicas, previa autorización institucional.
            </p>

            <h2>8. Modificaciones</h2>
            <p>
              Esta política puede actualizarse durante el desarrollo del proyecto.
              Los cambios relevantes se comunicarán a través del repositorio
              oficial en GitHub.
            </p>
          </div>
        </motion.div>
      </div>
    </InnerLayout>
  );
}
