/**
 * Informe completo de una consulta simulada (/api/informes) y casos clínicos
 * asignados en los cursos (/api/cursos/.../caso).
 */
import { apiFetch, descargarArchivo } from './apiClient';
import type { Consultation, EvaluationResult } from './consultasApi';
import type { CourseContentItem } from './cursoContenidoApi';

export type AccesoInforme = 'DUENO' | 'DOCENTE' | 'COMPARTIDO';
export type SeccionInforme = 'general' | 'cierre' | 'anamnesis' | 'diagnostico' | 'evaluacion' | 'conversacion';

export interface CierreEstudiante {
  diagnostico: string;
  diferenciales: string[];
  plan: string;
  anamnesis: string;
  otros_diagnosticos: string[];
  notas: string;
}

export interface CasoAsignadoInforme {
  item_id: string;
  titulo: string;
  max_score: number;
  teacher_score: number | null;
  teacher_feedback: string | null;
  graded_at: string | null;
}

export interface Informe {
  consulta: Consultation & { course_item_id?: string | null; teacher_score?: number | null };
  estudiante: { id: string; nombre: string };
  curso: { id: string; nombre: string } | null;
  caso_asignado: CasoAsignadoInforme | null;
  evaluacion: { puntaje: number | null; resumen: string | null; detalle: EvaluationResult | null };
  cierre: CierreEstudiante | null;
  conversacion: { sender: string; content: string; timestamp: string | null; es_exploracion: boolean }[];
  acceso: { tipo: AccesoInforme; puede_compartir: boolean; puede_calificar: boolean };
}

export interface ComentarioInforme {
  id: string;
  consultation_id: string;
  author_id: string;
  autor: { nombre: string; role: string } | null;
  section: SeccionInforme;
  body: string;
  created_at: string | null;
}

export interface UsuarioCompartir {
  id: string;
  nombre: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  cursos?: string[];
  via?: 'DIRECTO' | 'ENLACE';
}

export interface EstadoCompartir {
  compartido_con: UsuarioCompartir[];
  enlace_token: string | null;
  candidatos?: UsuarioCompartir[];
}

export interface InformeCompartido extends Consultation {
  estudiante: { id: string; nombre: string; role: string };
  via: 'DIRECTO' | 'ENLACE';
  compartido_en: string | null;
}

const base = (id: string) => `/api/informes/${id}`;

export const obtenerInforme = (id: string) => apiFetch<Informe>(base(id));

export const listarComentariosInforme = (id: string) =>
  apiFetch<{ comentarios: ComentarioInforme[] }>(`${base(id)}/comentarios`).then(r => r.comentarios);

export const crearComentarioInforme = (id: string, body: string, section: SeccionInforme) =>
  apiFetch<ComentarioInforme>(`${base(id)}/comentarios`, { method: 'POST', body: JSON.stringify({ body, section }) });

export const borrarComentarioInforme = (id: string, comentarioId: string) =>
  apiFetch<void>(`${base(id)}/comentarios/${comentarioId}`, { method: 'DELETE' });

export const estadoCompartir = (id: string) => apiFetch<EstadoCompartir>(`${base(id)}/compartir`);

export const compartirInforme = (id: string, userIds: string[]) =>
  apiFetch<EstadoCompartir>(`${base(id)}/compartir`, { method: 'POST', body: JSON.stringify({ user_ids: userIds }) });

export const dejarDeCompartir = (id: string, userId: string) =>
  apiFetch<EstadoCompartir>(`${base(id)}/compartir/${userId}`, { method: 'DELETE' });

export const crearEnlaceInforme = (id: string) =>
  apiFetch<EstadoCompartir>(`${base(id)}/compartir/enlace`, { method: 'POST' });

export const quitarEnlaceInforme = (id: string) =>
  apiFetch<EstadoCompartir>(`${base(id)}/compartir/enlace`, { method: 'DELETE' });

export const abrirEnlaceInforme = (token: string) =>
  apiFetch<{ consultation_id: string }>(`/api/informes/enlace/${encodeURIComponent(token)}`, { method: 'POST' });

export const informesCompartidosConmigo = () =>
  apiFetch<{ informes: InformeCompartido[] }>('/api/informes/compartidos-conmigo').then(r => r.informes);

export const calificarCaso = (id: string, teacherScore: number | null, teacherFeedback: string) =>
  apiFetch<CasoAsignadoInforme>(`${base(id)}/calificacion`, {
    method: 'PATCH', body: JSON.stringify({ teacher_score: teacherScore, teacher_feedback: teacherFeedback }),
  });

export const descargarInforme = (id: string, formato: 'pdf' | 'docx') =>
  descargarArchivo(`${base(id)}/descarga?formato=${formato}`, `Informe de la consulta.${formato}`);

/** Enlace que se comparte: abre la página que activa el acceso. */
export const urlEnlaceInforme = (token: string) => `${window.location.origin}/informe/enlace/${token}`;

// ─────────────────────── Casos clínicos del curso ───────────────────────

export type EstadoCaso = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO';

export interface MiCaso {
  estado: EstadoCaso;
  consultation_id: string | null;
  score?: number | null;
  teacher_score?: number | null;
  finished_at?: string | null;
}

export interface ResumenCasoDocente {
  paciente: { nombre?: string; edad?: number; sexo?: string; ocupacion?: string };
  presentacion_inicial: string | null;
  sintomas_principales: string[];
  antecedentes: unknown;
  diagnostico_real: string | null;
  diferenciales_esperados: string[];
  preguntas_clave: string[];
  subtema: string | null;
  dificultad: string | null;
}

export interface CasoCursoDocente {
  item: CourseContentItem;
  caso: ResumenCasoDocente | null;
  empezados: number;
  puede_regenerar: boolean;
}

export interface CasoCursoEstudiante {
  item: CourseContentItem;
  mi_caso: MiCaso;
}

export interface ResultadoCaso extends MiCaso {
  estudiante: { id: string; nombre: string };
}

export interface ResultadosCaso {
  item: CourseContentItem;
  resultados: ResultadoCaso[];
  resumen: { matriculados: number; completados: number; calificados: number; promedio_evaluador: number | null };
}

const rutaCaso = (courseId: string, blockId: string, itemId: string) =>
  `/api/cursos/${courseId}/bloques/${blockId}/contenido/${itemId}/caso`;

export const obtenerCasoCurso = <T extends CasoCursoDocente | CasoCursoEstudiante>(courseId: string, blockId: string, itemId: string) =>
  apiFetch<T>(rutaCaso(courseId, blockId, itemId));

export const generarCasoCurso = (
  courseId: string, blockId: string, itemId: string, subtema: string, dificultad: string, diagnostico: string,
) =>
  apiFetch<CasoCursoDocente>(`${rutaCaso(courseId, blockId, itemId)}/generar`, {
    method: 'POST', body: JSON.stringify({ subtema, dificultad, diagnostico }),
  });

export const iniciarCasoCurso = (courseId: string, blockId: string, itemId: string) =>
  apiFetch<MiCaso>(`${rutaCaso(courseId, blockId, itemId)}/iniciar`, { method: 'POST' });

export const resultadosCasoCurso = (courseId: string, blockId: string, itemId: string) =>
  apiFetch<ResultadosCaso>(`${rutaCaso(courseId, blockId, itemId)}/resultados`);

/** Los subtemas del caso: la misma lista del simulador (el backend compara sin tildes). */
export { GASTRO_SUBTEMAS as SUBTEMAS_CASO } from './consultasApi';

// ─────────── Enlace abierto sin sesión: se retoma después de entrar ───────────

const CLAVE_DESTINO = 'clerkship_destino_pendiente';

export function guardarDestinoPendiente(ruta: string) {
  try { sessionStorage.setItem(CLAVE_DESTINO, ruta); } catch { /* sin almacenamiento */ }
}

/** La ruta guardada (y la borra), o null. */
export function tomarDestinoPendiente(): string | null {
  try {
    const ruta = sessionStorage.getItem(CLAVE_DESTINO);
    sessionStorage.removeItem(CLAVE_DESTINO);
    return ruta && ruta.startsWith('/informe/enlace/') ? ruta : null;
  } catch {
    return null;
  }
}
