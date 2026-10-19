/** Idiomas de los documentos de la biblioteca (filtro y dato de cada recurso). */
export type IdiomaDocumento = 'es' | 'en';

export const IDIOMAS: { id: IdiomaDocumento; label: string; corto: string }[] = [
  { id: 'es', label: 'Español', corto: 'ES' },
  { id: 'en', label: 'Inglés', corto: 'EN' },
];
