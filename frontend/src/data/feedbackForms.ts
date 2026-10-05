/**
 * Preguntas de cada formulario de retroalimentación. Las claves coinciden con
 * las columnas de cada tabla en Supabase (ver
 * backend/database/migrations/2026-10-05_feedback_por_pestana.sql).
 */
import type { PestanaFeedback } from './feedbackApi';

export interface PreguntaFeedback {
  key: string;
  label: string;
}

export interface FormularioFeedback {
  titulo: string;
  descripcion: string;
  preguntas: PreguntaFeedback[];
}

export const FORMULARIOS_FEEDBACK: Record<PestanaFeedback, FormularioFeedback> = {
  inicio: {
    titulo: 'Tu opinión sobre Inicio',
    descripcion: 'Ayúdanos a mejorar la pantalla principal.',
    preguntas: [
      { key: 'claridad_navegacion', label: '¿Qué tan fácil es entender dónde está cada cosa?' },
      { key: 'informacion_util', label: '¿Qué tan útil te parece la información que ves al entrar?' },
      { key: 'accesos_rapidos', label: '¿Qué tan prácticos son los accesos rápidos?' },
    ],
  },
  casos: {
    titulo: 'Tu opinión sobre Casos clínicos',
    descripcion: 'Cuéntanos cómo se sintió el caso.',
    preguntas: [
      { key: 'realismo_caso', label: '¿Qué tan realista te pareció el caso?' },
      { key: 'calidad_paciente_virtual', label: '¿Qué tan natural fue la conversación con el paciente virtual?' },
      { key: 'claridad_instrucciones', label: '¿Qué tan claras fueron las instrucciones?' },
      { key: 'dificultad_percibida', label: '¿Qué tan difícil te pareció? (1 = muy fácil, 5 = muy difícil)' },
    ],
  },
  historial: {
    titulo: 'Tu opinión sobre Historial',
    descripcion: 'Qué tan útil te resulta revisar tus sesiones.',
    preguntas: [
      { key: 'claridad_puntajes', label: '¿Qué tan claro es el desglose de tus puntajes?' },
      { key: 'utilidad_recomendacion', label: '¿Qué tan útil es la recomendación de refuerzo?' },
      { key: 'facilidad_revision', label: '¿Qué tan fácil es revisar sesiones anteriores?' },
    ],
  },
  biblioteca: {
    titulo: 'Tu opinión sobre Biblioteca',
    descripcion: 'Qué tan útil te resultan los recursos.',
    preguntas: [
      { key: 'calidad_contenido', label: '¿Qué tan buena es la calidad del contenido?' },
      { key: 'facilidad_busqueda', label: '¿Qué tan fácil es encontrar lo que buscas?' },
      { key: 'utilidad_recursos', label: '¿Qué tan útiles son los recursos para tu formación?' },
    ],
  },
};
