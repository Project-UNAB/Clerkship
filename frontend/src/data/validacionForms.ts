/**
 * Formularios de validación por expertos, uno por pestaña. Las claves coinciden
 * con las columnas de validacion_* en Supabase (migración 2026-10-05g).
 * Escala: 1 = no pertinente / no claro, 4 = totalmente pertinente / claro.
 */
export type PestanaValidacion = 'inicio' | 'casos' | 'historial' | 'biblioteca';

export interface ItemValidacion {
  key: string;
  label: string;
}

export interface FormularioValidacion {
  titulo: string;
  descripcion: string;
  items: ItemValidacion[];
}

export const FORMULARIOS_VALIDACION: Record<PestanaValidacion, FormularioValidacion> = {
  inicio: {
    titulo: 'Validación: Inicio',
    descripcion: 'Evalúe si la pantalla principal presenta la información de forma pertinente, clara y accesible para estudiantes de medicina.',
    items: [
      { key: 'claridad_informacion', label: 'La información de la pantalla de inicio es clara.' },
      { key: 'pertinencia_informacion', label: 'La información mostrada es pertinente para el estudiante.' },
      { key: 'organizacion_visual', label: 'La organización visual facilita la lectura.' },
      { key: 'jerarquia_navegacion', label: 'La jerarquía de la navegación es adecuada.' },
      { key: 'accesibilidad', label: 'La pantalla es accesible (contraste, tamaño de texto).' },
      { key: 'coherencia_terminologia', label: 'La terminología es coherente con la práctica clínica.' },
      { key: 'suficiencia_accesos', label: 'Los accesos a las secciones son suficientes.' },
      { key: 'utilidad_general', label: 'La pantalla es útil para orientar el aprendizaje.' },
    ],
  },
  casos: {
    titulo: 'Validación: Casos clínicos',
    descripcion: 'Evalúe la calidad clínica de los casos y del paciente virtual.',
    items: [
      { key: 'pertinencia_clinica', label: 'El caso es pertinente para la especialidad y el nivel formativo.' },
      { key: 'redaccion_clara', label: 'La redacción del caso es clara y sin ambigüedades.' },
      { key: 'coherencia_diagnostica', label: 'Los síntomas son coherentes con el diagnóstico.' },
      { key: 'coherencia_examenes', label: 'Los resultados de exámenes son coherentes con el cuadro clínico.' },
      { key: 'realismo_paciente', label: 'El paciente virtual responde de forma realista.' },
      { key: 'dificultad_adecuada', label: 'La dificultad del caso es adecuada para el nivel.' },
      { key: 'utilidad_formativa', label: 'El caso aporta a la formación clínica del estudiante.' },
      { key: 'suficiencia_contenido', label: 'El contenido del caso es suficiente para evaluar el razonamiento.' },
    ],
  },
  historial: {
    titulo: 'Validación: Historial',
    descripcion: 'Evalúe la pertinencia y claridad de la evaluación y la retroalimentación que recibe el estudiante.',
    items: [
      { key: 'claridad_puntajes', label: 'El desglose de los puntajes es claro.' },
      { key: 'pertinencia_evaluacion', label: 'Las dimensiones evaluadas son pertinentes para el razonamiento clínico.' },
      { key: 'retroalimentacion_util', label: 'La retroalimentación es útil para mejorar.' },
      { key: 'coherencia_dimensiones', label: 'Los pesos de las dimensiones son coherentes con la práctica clínica.' },
      { key: 'suficiencia_informacion', label: 'La información del historial es suficiente.' },
      { key: 'utilidad_formativa', label: 'El historial aporta a la formación del estudiante.' },
      { key: 'comprension_estudiante', label: 'Un estudiante puede comprender la evaluación sin ayuda.' },
      { key: 'presentacion', label: 'La presentación de los resultados es adecuada.' },
    ],
  },
  biblioteca: {
    titulo: 'Validación: Biblioteca',
    descripcion: 'Evalúe la pertinencia, calidad y organización de los recursos.',
    items: [
      { key: 'pertinencia_recursos', label: 'Los recursos son pertinentes para la formación clínica.' },
      { key: 'actualidad_fuentes', label: 'Las fuentes están actualizadas.' },
      { key: 'calidad_fuentes', label: 'Las fuentes son de calidad académica.' },
      { key: 'claridad_descripcion', label: 'Las descripciones de los recursos son claras.' },
      { key: 'organizacion_contenido', label: 'Los recursos están organizados de forma lógica.' },
      { key: 'suficiencia_recursos', label: 'La cantidad de recursos es suficiente.' },
      { key: 'utilidad_formativa', label: 'Los recursos aportan a la formación del estudiante.' },
      { key: 'accesibilidad_archivos', label: 'Los archivos son accesibles y legibles.' },
    ],
  },
};
