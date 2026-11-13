/**
 * Criterios con los que un docente experto revisa un caso clínico simulado que
 * resolvió un estudiante (escala 1 a 4). Las claves coinciden con CRITERIOS_CASO
 * del backend (app/services/revision_casos.py).
 */
export interface CriterioCaso {
  key: string;
  label: string;
  grupo: 'caso' | 'evaluacion';
}

export const CRITERIOS_CASO: CriterioCaso[] = [
  { key: 'coherencia_clinica', grupo: 'caso', label: 'La información del caso es coherente y le permite al estudiante razonar hasta el diagnóstico.' },
  { key: 'realismo_paciente', grupo: 'caso', label: 'El paciente virtual respondió de forma consistente, de modo que el estudiante pudo practicar la entrevista.' },
  { key: 'calidad_paraclinicos', grupo: 'caso', label: 'Los hallazgos del examen y los exámenes están presentados de forma que el estudiante pueda interpretarlos.' },
  { key: 'pertinencia_formativa', grupo: 'caso', label: 'El caso es pertinente para los objetivos de aprendizaje del curso.' },
  { key: 'dificultad_adecuada', grupo: 'caso', label: 'La dificultad del caso corresponde al nivel asignado.' },
  { key: 'precision_evaluacion', grupo: 'evaluacion', label: 'La evaluación identifica bien lo que el estudiante hizo y lo que omitió.' },
  { key: 'justicia_puntaje', grupo: 'evaluacion', label: 'El puntaje refleja el desempeño real del estudiante en este caso.' },
  { key: 'utilidad_retroalimentacion', grupo: 'evaluacion', label: 'La retroalimentación orienta al estudiante sobre cómo mejorar su razonamiento.' },
];

export const GRUPOS_CRITERIO = {
  caso: 'El caso como actividad de aprendizaje',
  evaluacion: 'La evaluación y la retroalimentación al estudiante',
} as const;

export const DIFICULTADES: Record<string, string> = { EASY: 'Básica', MEDIUM: 'Intermedia', HARD: 'Avanzada' };

export const etiquetaCriterio = (key: string) => CRITERIOS_CASO.find(c => c.key === key)?.label ?? key;
