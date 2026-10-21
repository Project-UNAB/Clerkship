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
  /** Qué mirar de la sección antes de calificar (para quien no la conoce). */
  queRevisar?: string[];
  items: ItemValidacion[];
}

/** Escala de juicio de expertos (Escobar-Pérez y Cuervo-Martínez, 2008): cada
 * nivel dice qué habría que hacer con el ítem. */
export const ESCALA_VALIDACION = [
  { valor: 1, texto: 'No cumple', ayuda: 'Hay que rehacerlo o quitarlo' },
  { valor: 2, texto: 'Bajo', ayuda: 'Necesita cambios importantes' },
  { valor: 3, texto: 'Moderado', ayuda: 'Necesita ajustes menores' },
  { valor: 4, texto: 'Alto', ayuda: 'Adecuado tal como está' },
];

export const NOMBRES_SECCION: Record<PestanaValidacion, string> = {
  inicio: 'Inicio',
  casos: 'Casos clínicos',
  historial: 'Historial y evaluación',
  biblioteca: 'Biblioteca',
};

export const APLICABILIDAD = [
  { valor: 'APLICABLE', texto: 'Aplicable', ayuda: 'La plataforma puede usarse con estudiantes tal como está.' },
  { valor: 'APLICABLE_CON_CAMBIOS', texto: 'Aplicable después de corregir', ayuda: 'Puede usarse una vez se atiendan mis observaciones.' },
  { valor: 'NO_APLICABLE', texto: 'No aplicable', ayuda: 'No debería usarse con estudiantes todavía.' },
] as const;
export type Aplicabilidad = typeof APLICABILIDAD[number]['valor'];

export const FORMULARIOS_VALIDACION: Record<PestanaValidacion, FormularioValidacion> = {
  inicio: {
    titulo: 'Validación: Inicio',
    descripcion: 'Evalúe si la pantalla principal presenta la información de forma pertinente, clara y accesible para estudiantes de medicina.',
    queRevisar: ['El panel principal que ve el estudiante al entrar: resumen de su avance, accesos rápidos y avisos.', 'Los menús laterales y la forma de llegar a cada sección.'],
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
    queRevisar: ['El paciente virtual: un caso de gastroenterología generado por IA con el que el estudiante conversa (anamnesis), pide examen físico y paraclínicos, y propone diagnóstico y plan.', 'La coherencia entre síntomas, hallazgos y resultados de exámenes, y si el nivel corresponde a un estudiante de pregrado o internado.'],
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
    queRevisar: ['La evaluación automática que recibe el estudiante al terminar cada caso: puntaje ponderado por dimensiones (anamnesis 30 %, hallazgos clave 20 %, examen físico y paraclínicos 15 %, razonamiento clínico 25 % y comunicación 10 %), retroalimentación y recomendaciones.', 'Si esa evaluación es justa, comprensible y útil para que el estudiante mejore.'],
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
    queRevisar: ['Los libros, guías clínicas, ensayos, protocolos y casos de acceso abierto en español e inglés, organizados por tipo y tema.', 'La calidad y actualidad de las fuentes, y si alcanzan para estudiar gastroenterología.'],
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
