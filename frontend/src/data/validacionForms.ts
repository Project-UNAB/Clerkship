/**
 * Formularios de validación por expertos, uno por pestaña. Las claves coinciden
 * con las columnas de validacion_* en Supabase (migración 2026-10-05g).
 * Escala: 1 = no cumple, 4 = alto (adecuado tal como está).
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
    descripcion: 'Evalúe si la pantalla principal orienta al estudiante de medicina en su aprendizaje de forma clara y accesible.',
    queRevisar: ['El panel principal que ve el estudiante al entrar: resumen de su avance, accesos rápidos y avisos.', 'Los menús laterales y la forma de llegar a cada sección.'],
    items: [
      { key: 'claridad_informacion', label: 'La información de la pantalla de inicio es clara para el estudiante.' },
      { key: 'pertinencia_informacion', label: 'La información mostrada ayuda al estudiante a saber qué ha avanzado y qué le falta practicar.' },
      { key: 'organizacion_visual', label: 'La organización visual facilita que el estudiante encuentre lo que necesita.' },
      { key: 'jerarquia_navegacion', label: 'La navegación lleva al estudiante a cada actividad de aprendizaje sin pasos innecesarios.' },
      { key: 'accesibilidad', label: 'La pantalla es accesible para todos los estudiantes (contraste, tamaño de texto, uso en el celular).' },
      { key: 'coherencia_terminologia', label: 'El lenguaje es comprensible y adecuado al nivel de formación del estudiante.' },
      { key: 'suficiencia_accesos', label: 'Los accesos a las secciones son suficientes para que el estudiante organice su estudio.' },
      { key: 'utilidad_general', label: 'La pantalla orienta al estudiante en su proceso de aprendizaje.' },
    ],
  },
  casos: {
    titulo: 'Validación: Casos clínicos',
    descripcion: 'Evalúe si los casos y el paciente virtual sirven para que el estudiante aprenda a razonar clínicamente.',
    queRevisar: ['El paciente virtual: un caso de gastroenterología generado por IA con el que el estudiante conversa (anamnesis), pide examen físico y paraclínicos, y propone diagnóstico y plan.', 'Si la información del caso le permite al estudiante construir y descartar hipótesis, y si el nivel corresponde a un estudiante de pregrado o internado.'],
    items: [
      { key: 'pertinencia_clinica', label: 'El caso está alineado con los objetivos de aprendizaje de gastroenterología para el nivel del estudiante.' },
      { key: 'redaccion_clara', label: 'La presentación del caso es clara y comprensible para el estudiante.' },
      { key: 'coherencia_diagnostica', label: 'La información del caso es coherente, de modo que el estudiante puede construir hipótesis a partir de ella.' },
      { key: 'coherencia_examenes', label: 'Los resultados de los exámenes le sirven al estudiante para confirmar o descartar sus hipótesis.' },
      { key: 'realismo_paciente', label: 'La conversación con el paciente virtual le permite al estudiante practicar la entrevista como en una consulta.' },
      { key: 'dificultad_adecuada', label: 'La dificultad del caso es adecuada para el nivel formativo del estudiante.' },
      { key: 'utilidad_formativa', label: 'Resolver el caso contribuye a que el estudiante aprenda a razonar clínicamente.' },
      { key: 'suficiencia_contenido', label: 'El caso ofrece suficientes oportunidades para que el estudiante demuestre su razonamiento.' },
    ],
  },
  historial: {
    titulo: 'Validación: Historial',
    descripcion: 'Evalúe si la evaluación y la retroalimentación que recibe el estudiante le sirven para aprender.',
    queRevisar: ['La evaluación automática que recibe el estudiante al terminar cada caso: puntaje ponderado por dimensiones (anamnesis 30 %, hallazgos clave 20 %, examen físico y paraclínicos 15 %, razonamiento clínico 25 % y comunicación 10 %), retroalimentación y recomendaciones.', 'Si esa evaluación es justa, comprensible y útil para que el estudiante mejore.'],
    items: [
      { key: 'claridad_puntajes', label: 'El estudiante entiende cómo se obtuvo su puntaje.' },
      { key: 'pertinencia_evaluacion', label: 'Las dimensiones evaluadas corresponden a lo que el estudiante debe aprender.' },
      { key: 'retroalimentacion_util', label: 'La retroalimentación le dice al estudiante qué hizo bien y qué debe mejorar.' },
      { key: 'coherencia_dimensiones', label: 'El peso de cada dimensión refleja su importancia en el aprendizaje del razonamiento clínico.' },
      { key: 'suficiencia_informacion', label: 'El historial le permite al estudiante ver su progreso en el tiempo.' },
      { key: 'utilidad_formativa', label: 'El historial ayuda al estudiante a decidir qué practicar a continuación.' },
      { key: 'comprension_estudiante', label: 'Un estudiante puede comprender la evaluación sin ayuda del docente.' },
      { key: 'presentacion', label: 'Los resultados se presentan de forma motivadora y no punitiva.' },
    ],
  },
  biblioteca: {
    titulo: 'Validación: Biblioteca',
    descripcion: 'Evalúe si los recursos y su organización apoyan el estudio del estudiante.',
    queRevisar: ['Los libros, guías clínicas, ensayos, protocolos y casos de acceso abierto en español e inglés, organizados por tipo y tema.', 'La calidad y actualidad de las fuentes, y si alcanzan para que el estudiante prepare los casos de gastroenterología.'],
    items: [
      { key: 'pertinencia_recursos', label: 'Los recursos corresponden a los temas que el estudiante debe aprender.' },
      { key: 'actualidad_fuentes', label: 'Las fuentes están actualizadas.' },
      { key: 'calidad_fuentes', label: 'Las fuentes son confiables para el estudio académico.' },
      { key: 'claridad_descripcion', label: 'Las descripciones ayudan al estudiante a elegir qué leer.' },
      { key: 'organizacion_contenido', label: 'La organización de los recursos facilita el estudio autónomo.' },
      { key: 'suficiencia_recursos', label: 'Los recursos son suficientes para preparar los casos del simulador.' },
      { key: 'utilidad_formativa', label: 'Los recursos complementan lo que el estudiante practica en el simulador.' },
      { key: 'accesibilidad_archivos', label: 'Los archivos son accesibles y legibles en computador y en celular.' },
    ],
  },
};
