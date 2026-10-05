/**
 * Preguntas de cada formulario de retroalimentación. Las claves coinciden con
 * las columnas de cada tabla en Supabase (migraciones 2026-10-05*_feedback_*.sql).
 * El usuario se identifica con su sesión; no se pide nombre.
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
      { key: 'velocidad_carga', label: '¿Qué tan rápido carga la pantalla?' },
      { key: 'diseno_visual', label: '¿Qué tan agradable te resulta el diseño visual?' },
      { key: 'legibilidad_textos', label: '¿Qué tan legibles son los textos y los tamaños de letra?' },
      { key: 'orden_menus', label: '¿Qué tan bien organizados están los menús?' },
      { key: 'facilidad_uso_movil', label: '¿Qué tan cómodo es usarla desde el celular?' },
      { key: 'confianza_plataforma', label: '¿Qué tanta confianza te transmite la plataforma?' },
      { key: 'claridad_mensajes', label: '¿Qué tan claros son los mensajes y avisos del sistema?' },
      { key: 'utilidad_avisos', label: '¿Qué tan útiles son los avisos sobre tu progreso?' },
      { key: 'recomendaria_plataforma', label: '¿Qué tan probable es que recomiendes la plataforma a un compañero?' },
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
      { key: 'coherencia_sintomas', label: '¿Qué tan coherentes fueron los síntomas con el diagnóstico?' },
      { key: 'coherencia_examenes', label: '¿Qué tan coherentes fueron los resultados de los exámenes?' },
      { key: 'utilidad_educativa', label: '¿Qué tan útil fue el caso para tu aprendizaje?' },
      { key: 'retroalimentacion_clara', label: '¿Qué tan clara fue la retroalimentación al terminar?' },
      { key: 'tiempo_adecuado', label: '¿Qué tan adecuada fue la duración del caso?' },
      { key: 'variedad_casos', label: '¿Qué tan variados te parecen los casos disponibles?' },
      { key: 'realismo_examenes', label: '¿Qué tan realistas fueron los exámenes físicos?' },
      { key: 'satisfaccion_general', label: '¿Qué tan satisfecho quedaste con el caso en general?' },
    ],
  },
  historial: {
    titulo: 'Tu opinión sobre Historial',
    descripcion: 'Qué tan útil te resulta revisar tus sesiones.',
    preguntas: [
      { key: 'claridad_puntajes', label: '¿Qué tan claro es el desglose de tus puntajes?' },
      { key: 'utilidad_recomendacion', label: '¿Qué tan útil es la recomendación de refuerzo?' },
      { key: 'facilidad_revision', label: '¿Qué tan fácil es revisar sesiones anteriores?' },
      { key: 'detalle_evaluacion', label: '¿Qué tan detallada te parece la evaluación de cada sesión?' },
      { key: 'comprension_dimensiones', label: '¿Qué tan fácil es entender cada dimensión evaluada?' },
      { key: 'progreso_visible', label: '¿Qué tan bien se ve tu progreso a lo largo del tiempo?' },
      { key: 'utilidad_para_estudiar', label: '¿Qué tan útil es el historial para preparar tus estudios?' },
      { key: 'filtros_utiles', label: '¿Qué tan útiles son los filtros (fecha, estado, dificultad)?' },
      { key: 'exportacion_util', label: '¿Qué tan útil te resulta exportar tus sesiones?' },
      { key: 'satisfaccion_general', label: '¿Qué tan satisfecho quedaste con el historial en general?' },
    ],
  },
  biblioteca: {
    titulo: 'Tu opinión sobre Biblioteca',
    descripcion: 'Qué tan útiles te resultan los recursos.',
    preguntas: [
      { key: 'calidad_contenido', label: '¿Qué tan buena es la calidad del contenido?' },
      { key: 'facilidad_busqueda', label: '¿Qué tan fácil es encontrar lo que buscas?' },
      { key: 'utilidad_recursos', label: '¿Qué tan útiles son los recursos para tu formación?' },
      { key: 'actualidad_contenido', label: '¿Qué tan actualizado está el contenido?' },
      { key: 'claridad_descripciones', label: '¿Qué tan claras son las descripciones de cada recurso?' },
      { key: 'variedad_recursos', label: '¿Qué tan variados son los tipos de recursos?' },
      { key: 'facilidad_descarga', label: '¿Qué tan fácil es abrir o descargar los recursos?' },
      { key: 'organizacion_por_temas', label: '¿Qué tan bien organizados están los recursos por tema?' },
      { key: 'calidad_lectura', label: '¿Qué tan cómodo es leer los documentos en pantalla?' },
      { key: 'utilidad_para_estudio', label: '¿Qué tan útil es para tu estudio personal?' },
      { key: 'satisfaccion_general', label: '¿Qué tan satisfecho quedaste con la biblioteca en general?' },
    ],
  },
};
