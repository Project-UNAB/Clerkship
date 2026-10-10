/**
 * Fechas de los cursos, siempre en hora de Colombia.
 *
 * El backend guarda y envía todo en UTC. Acá se muestran en America/Bogota
 * sin importar la zona del navegador: una tarea que "cierra el 27 a las
 * 11:59 p. m." cierra a esa hora para todos, también para quien abre la
 * plataforma con el computador en otra zona. Colombia no tiene horario de
 * verano: es UTC-5 todo el año.
 */
export const ZONA_HORARIA = 'America/Bogota';
const DESFASE_COLOMBIA = '-05:00';

type Fecha = string | Date | null | undefined;

function aDate(valor: Fecha): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatear(valor: Fecha, opciones: Intl.DateTimeFormatOptions, vacio = '—'): string {
  const d = aDate(valor);
  if (!d) return vacio;
  return new Intl.DateTimeFormat('es-CO', { ...opciones, timeZone: ZONA_HORARIA }).format(d);
}

/** "mar, 27 oct 2026, 11:59 p. m." */
export function formatFechaHora(valor: Fecha): string {
  return formatear(valor, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "27 oct, 11:59 p. m." */
export function formatFechaHoraCorta(valor: Fecha): string {
  return formatear(valor, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "27 oct 2026" */
export function formatFecha(valor: Fecha): string {
  return formatear(valor, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "11:59 p. m." */
export function formatHora(valor: Fecha): string {
  return formatear(valor, { hour: '2-digit', minute: '2-digit' });
}

export interface PartesDeFecha {
  year: number;
  /** 0 = enero, como Date.getMonth(). */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Año, mes, día y hora que marca el reloj en Colombia para ese instante. */
export function partesEnColombia(valor: Fecha = new Date()): PartesDeFecha | null {
  const d = aDate(valor);
  if (!d) return null;
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const n = (tipo: string) => Number(partes.find(p => p.type === tipo)?.value ?? 0);
  return { year: n('year'), month: n('month') - 1, day: n('day'), hour: n('hour'), minute: n('minute') };
}

/**
 * Un Date cuyos getFullYear / getMonth / getDate / getHours dan la fecha y la
 * hora de Colombia. Sirve para armar un calendario por días con la lógica
 * normal de Date. NO representa el mismo instante: úsalo solo para leer sus
 * partes, nunca para comparar con otras fechas ni para mandarlo al servidor.
 */
export function comoFechaDeColombia(valor: Fecha = new Date()): Date {
  const p = partesEnColombia(valor) ?? partesEnColombia(new Date())!;
  return new Date(p.year, p.month, p.day, p.hour, p.minute);
}

/** "2026-10-27": el día de Colombia en que cae ese instante. */
export function claveDeDia(valor: Fecha): string {
  const p = partesEnColombia(valor);
  if (!p) return '';
  const dos = (x: number) => String(x).padStart(2, '0');
  return `${p.year}-${dos(p.month + 1)}-${dos(p.day)}`;
}

/**
 * Lo que escribe el docente en un <input type="datetime-local"> ("2026-10-27T23:59")
 * es hora de Colombia: se convierte al instante en UTC que espera el backend.
 */
export function inputColombiaAIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value.length === 16 ? `${value}:00` : value}${DESFASE_COLOMBIA}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Un instante en UTC -> valor para <input type="datetime-local">, en hora de Colombia. */
export function isoAInputColombia(valor: Fecha): string {
  const p = partesEnColombia(valor);
  if (!p) return '';
  const dos = (x: number) => String(x).padStart(2, '0');
  return `${p.year}-${dos(p.month + 1)}-${dos(p.day)}T${dos(p.hour)}:${dos(p.minute)}`;
}

/** 93784 -> "1 día 2 h", 3725 -> "1 h 2 min", 59 -> "59 s". */
export function formatRestante(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const dias = Math.floor(s / 86400);
  const horas = Math.floor((s % 86400) / 3600);
  const minutos = Math.floor((s % 3600) / 60);
  if (dias > 0) return `${dias} ${dias === 1 ? 'día' : 'días'} ${horas} h`;
  if (horas > 0) return `${horas} h ${minutos} min`;
  if (minutos > 0) return `${minutos} min ${s % 60} s`;
  return `${s} s`;
}

/** "en 3 días", "en 5 h", "en 20 min", "hoy" — cuánto falta para ese instante. */
export function faltaPara(valor: Fecha, ahora: Date = new Date()): string {
  const d = aDate(valor);
  if (!d) return '';
  const segundos = Math.floor((d.getTime() - ahora.getTime()) / 1000);
  if (segundos <= 0) return 'ya cerró';
  if (segundos < 3600) return `en ${Math.max(1, Math.floor(segundos / 60))} min`;
  if (segundos < 86400) return `en ${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86400);
  return `en ${dias} ${dias === 1 ? 'día' : 'días'}`;
}
