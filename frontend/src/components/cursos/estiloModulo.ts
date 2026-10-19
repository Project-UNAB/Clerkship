import {
  Activity, Award, Bone, BookOpen, Brain, CalendarDays, ClipboardList, Dna, FileText, Flag, FlaskConical,
  FolderOpen, GraduationCap, HeartPulse, Lightbulb, MessagesSquare, Microscope, Pill, Star, Stethoscope,
  Syringe, Target, Users, Video, type LucideIcon,
} from 'lucide-react';

/** Iconos que el docente puede ponerle a la tarjeta de un módulo. Las claves
 * son las mismas que acepta el backend (schemas/curso_contenido.py). */
export const ICONOS_MODULO: { clave: string; nombre: string; Icono: LucideIcon }[] = [
  { clave: 'book', nombre: 'Libro', Icono: BookOpen },
  { clave: 'stethoscope', nombre: 'Estetoscopio', Icono: Stethoscope },
  { clave: 'heart-pulse', nombre: 'Signos vitales', Icono: HeartPulse },
  { clave: 'activity', nombre: 'Actividad', Icono: Activity },
  { clave: 'pill', nombre: 'Medicamento', Icono: Pill },
  { clave: 'syringe', nombre: 'Jeringa', Icono: Syringe },
  { clave: 'microscope', nombre: 'Microscopio', Icono: Microscope },
  { clave: 'flask', nombre: 'Laboratorio', Icono: FlaskConical },
  { clave: 'dna', nombre: 'ADN', Icono: Dna },
  { clave: 'brain', nombre: 'Cerebro', Icono: Brain },
  { clave: 'bone', nombre: 'Hueso', Icono: Bone },
  { clave: 'clipboard', nombre: 'Historia clínica', Icono: ClipboardList },
  { clave: 'file', nombre: 'Documento', Icono: FileText },
  { clave: 'folder', nombre: 'Carpeta', Icono: FolderOpen },
  { clave: 'video', nombre: 'Video', Icono: Video },
  { clave: 'graduation', nombre: 'Clase', Icono: GraduationCap },
  { clave: 'calendar', nombre: 'Calendario', Icono: CalendarDays },
  { clave: 'users', nombre: 'Grupo', Icono: Users },
  { clave: 'message', nombre: 'Discusión', Icono: MessagesSquare },
  { clave: 'lightbulb', nombre: 'Idea', Icono: Lightbulb },
  { clave: 'target', nombre: 'Objetivo', Icono: Target },
  { clave: 'flag', nombre: 'Meta', Icono: Flag },
  { clave: 'star', nombre: 'Destacado', Icono: Star },
  { clave: 'award', nombre: 'Logro', Icono: Award },
];

/** Colores de la tarjeta de un módulo. Todos dan contraste suficiente con
 * texto blanco y con el fondo claro de la tarjeta. */
export const COLORES_MODULO: { clave: string; nombre: string; hex: string }[] = [
  { clave: 'azul', nombre: 'Azul', hex: '#0284C7' },
  { clave: 'turquesa', nombre: 'Turquesa', hex: '#0D9488' },
  { clave: 'verde', nombre: 'Verde', hex: '#16A34A' },
  { clave: 'ambar', nombre: 'Ámbar', hex: '#B45309' },
  { clave: 'naranja', nombre: 'Naranja', hex: '#EA580C' },
  { clave: 'rojo', nombre: 'Rojo', hex: '#DC2626' },
  { clave: 'rosa', nombre: 'Rosa', hex: '#DB2777' },
  { clave: 'morado', nombre: 'Morado', hex: '#7C3AED' },
  { clave: 'gris', nombre: 'Gris', hex: '#475569' },
];

/** Icono del módulo; el libro cuando el docente no eligió ninguno. */
export function iconoDeModulo(clave?: string | null): LucideIcon {
  return (ICONOS_MODULO.find(i => i.clave === clave) ?? ICONOS_MODULO[0]).Icono;
}

/** Color del módulo en hexadecimal; azul cuando el docente no eligió ninguno. */
export function colorDeModulo(clave?: string | null): string {
  return (COLORES_MODULO.find(c => c.clave === clave) ?? COLORES_MODULO[0]).hex;
}
