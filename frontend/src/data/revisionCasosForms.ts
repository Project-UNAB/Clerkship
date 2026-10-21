/**
 * Criterios con los que un profesional de la salud revisa un caso clínico
 * simulado (escala 1 a 4). Las claves coinciden con CRITERIOS_CASO del backend
 * (app/services/revision_casos.py).
 */
export interface CriterioCaso {
  key: string;
  label: string;
  grupo: 'caso' | 'evaluacion';
}

export const CRITERIOS_CASO: CriterioCaso[] = [
  { key: 'coherencia_clinica', grupo: 'caso', label: 'Los síntomas, el examen físico y los paraclínicos son coherentes con el diagnóstico del caso.' },
  { key: 'realismo_paciente', grupo: 'caso', label: 'El paciente virtual respondió de forma realista y consistente con el caso.' },
  { key: 'calidad_paraclinicos', grupo: 'caso', label: 'Los hallazgos del examen físico y los paraclínicos son verosímiles y están bien redactados.' },
  { key: 'pertinencia_formativa', grupo: 'caso', label: 'El caso es pertinente para la formación en gastroenterología.' },
  { key: 'dificultad_adecuada', grupo: 'caso', label: 'La dificultad del caso corresponde al nivel asignado.' },
  { key: 'precision_evaluacion', grupo: 'evaluacion', label: 'La evaluación automática identifica bien lo que el estudiante hizo y lo que omitió.' },
  { key: 'justicia_puntaje', grupo: 'evaluacion', label: 'El puntaje automático refleja el desempeño real del estudiante.' },
  { key: 'utilidad_retroalimentacion', grupo: 'evaluacion', label: 'La retroalimentación es correcta y útil para que el estudiante mejore.' },
];

export const GRUPOS_CRITERIO = {
  caso: 'El caso clínico',
  evaluacion: 'La evaluación automática',
} as const;

export const DIFICULTADES: Record<string, string> = { EASY: 'Básica', MEDIUM: 'Intermedia', HARD: 'Avanzada' };

export const etiquetaCriterio = (key: string) => CRITERIOS_CASO.find(c => c.key === key)?.label ?? key;
