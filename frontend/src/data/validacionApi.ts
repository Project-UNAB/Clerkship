/**
 * Validación por expertos. Rutas públicas: no requieren sesión.
 * El formulario abierto por pestaña y el portal con enlace personal.
 */
import { apiFetch } from './apiClient';
import type { EvaluationResult } from './consultasApi';
import type { Aplicabilidad, PestanaValidacion } from './validacionForms';

export interface DatosExperto {
  nombre_experto: string;  // opcional: vacío se envía como nulo
  id_experto: string;
  profesion: string;
  anos_experiencia: number;
  especialidad: string;
}

export function enviarValidacion(
  pestana: PestanaValidacion,
  experto: DatosExperto,
  calificaciones: Record<string, number>,
  comentario: string,
): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`/api/validacion/${pestana}`, {
    method: 'POST',
    body: JSON.stringify({
      ...experto,
      nombre_experto: experto.nombre_experto.trim() || null,
      especialidad: experto.especialidad.trim() || null,
      ...calificaciones,
      comentario: comentario.trim() || null,
    }),
  });
}

// ── Portal del experto con su enlace personal (sin sesión: el token es la llave) ──
export interface DatosExpertoInvitado {
  /** Cómo se muestra: el nombre o, si no lo dio, «ID …». */
  etiqueta: string;
  nombre: string | null;
  email: string | null;
  profesion: string;
  especialidad: string | null;
  institucion: string | null;
  registro_profesional: string | null;
  anos_experiencia: number | null;
}

export type EstadoInvitacion = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADA' | 'REVOCADA';

export interface InvitacionExperto {
  experto: DatosExpertoInvitado;
  secciones: PestanaValidacion[];
  respuestas: Partial<Record<PestanaValidacion, Record<string, number>>>;
  /** Por sección: observación de cada ítem; «_general» es la de toda la sección. */
  observaciones: Partial<Record<PestanaValidacion, Record<string, string>>>;
  enviadas: Partial<Record<PestanaValidacion, string>>;
  aplicabilidad: Aplicabilidad | null;
  comentario_final: string | null;
  estado: EstadoInvitacion;
  consentimiento: boolean;
  completada_at: string | null;
  /** Casos clínicos asignados para revisar. */
  casos: CasoAsignado[];
  faltantes: string[];
}

export type PerfilExperto = Partial<Omit<DatosExpertoInvitado, 'email'>> & {
  consentimiento?: boolean;
  aplicabilidad?: Aplicabilidad | null;
  comentario_final?: string | null;
};

const base = (token: string) => `/api/validacion/invitacion/${encodeURIComponent(token)}`;

export function obtenerInvitacion(token: string): Promise<InvitacionExperto> {
  return apiFetch(base(token));
}

export function guardarPerfilExperto(token: string, cambios: PerfilExperto): Promise<InvitacionExperto> {
  return apiFetch(base(token), { method: 'PATCH', body: JSON.stringify(cambios) });
}

export function guardarSeccionExperto(
  token: string,
  seccion: PestanaValidacion,
  respuestas: Record<string, number>,
  observaciones: Record<string, string>,
): Promise<InvitacionExperto> {
  return apiFetch(`${base(token)}/secciones/${seccion}`, { method: 'PUT', body: JSON.stringify({ respuestas, observaciones }) });
}

export function enviarSeccionExperto(token: string, seccion: PestanaValidacion): Promise<InvitacionExperto> {
  return apiFetch(`${base(token)}/secciones/${seccion}/enviar`, { method: 'POST' });
}

export function finalizarValidacion(token: string): Promise<InvitacionExperto> {
  return apiFetch(`${base(token)}/finalizar`, { method: 'POST' });
}

// ── Revisión de casos clínicos asignados ──

export interface CasoAsignado {
  id: string;
  subtema: string | null;
  dificultad: string;
  estado: 'PENDIENTE' | 'EN_CURSO' | 'ENVIADA';
  respondidos: number;
  total: number;
  puntaje_experto: number | null;
  enviada_at: string | null;
}

export interface Hallazgo { clave: string; etiqueta: string; resultado: string; alterado: boolean }

/** Consulta completada, anonimizada (sin datos del estudiante). */
export interface VistaCaso {
  consultation_id: string;
  subtema: string | null;
  dificultad: string;
  especialidad: string;
  finalizada_at: string | null;
  puntaje_ia: number | null;
  paciente: { edad: number | null; sexo: string | null; ocupacion: string | null; peso_kg: number | null };
  presentacion_inicial: string | null;
  personalidad_paciente: string | null;
  estado_emocional_inicial: string | null;
  antecedentes: string[];
  sintomas_principales: string[];
  signos_vitales: Record<string, string>;
  examen_fisico: Hallazgo[];
  paraclinicos: Hallazgo[];
  hallazgos_ocultos: string[];
  diagnostico_real: string | null;
  rubrica: Record<string, string[]>;
  conversacion: { quien: 'ESTUDIANTE' | 'PACIENTE' | 'SISTEMA'; texto: string; exploracion: boolean; hora: string | null }[];
  acciones: { tipo: string; etiqueta: string; hora: string | null }[];
  respuesta_estudiante: { hipotesis: string; diferenciales: string[]; plan: string } | null;
  evaluacion: EvaluationResult | null;
  /** Para el experto: la evaluación se muestra después de que fije su puntaje. */
  evaluacion_oculta?: boolean;
}

export interface RevisionCaso {
  id: string;
  invitacion_id: string;
  consultation_id: string;
  respuestas: Record<string, number>;
  observaciones: Record<string, string>;
  puntaje_experto: number | null;
  estado: CasoAsignado['estado'];
  enviada_at: string | null;
  created_at: string | null;
}

export function obtenerCasoExperto(token: string, revisionId: string): Promise<{ revision: RevisionCaso; caso: VistaCaso }> {
  return apiFetch(`${base(token)}/casos/${revisionId}`);
}

export function guardarRevisionCaso(
  token: string,
  revisionId: string,
  cambios: { respuestas?: Record<string, number>; observaciones?: Record<string, string>; puntaje_experto?: number | null },
): Promise<{ revision: RevisionCaso }> {
  return apiFetch(`${base(token)}/casos/${revisionId}`, { method: 'PUT', body: JSON.stringify(cambios) });
}

export function enviarRevisionCaso(token: string, revisionId: string): Promise<InvitacionExperto> {
  return apiFetch(`${base(token)}/casos/${revisionId}/enviar`, { method: 'POST' });
}
