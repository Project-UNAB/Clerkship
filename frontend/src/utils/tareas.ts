/**
 * Ayudas de interfaz para las tareas de un curso: mostrar fechas y tiempo
 * restante, y revisar un archivo contra las reglas ANTES de subirlo. Esa
 * revisión es solo para avisar rápido: la que vale es la del servidor.
 */
import type { ReglasTarea } from '../data/cursoContenidoApi';

/** Las más comunes de la lista negra del servidor, para explicar el rechazo sin esperar la respuesta. */
const EXTENSIONES_BLOQUEADAS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'sh', 'ps1', 'vbs', 'jar', 'apk', 'dll',
  'js', 'mjs', 'php', 'py', 'html', 'htm', 'svg', 'docm', 'xlsm', 'pptm',
]);

export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : '';
}

// Las fechas se muestran siempre en hora de Colombia: ver utils/fechas.ts.
export { formatFechaHora, formatRestante } from './fechas';

export function listaExtensiones(extensiones: string[]): string {
  return extensiones.map(e => `.${e}`).join(', ');
}

/** Mensaje de error si el archivo no cumple las reglas de la tarea; null si pasa. */
export function validarArchivoLocal(file: File, reglas: ReglasTarea): string | null {
  const tramos = file.name.toLowerCase().split('.').slice(1);
  const bloqueada = tramos.find(t => EXTENSIONES_BLOQUEADAS.has(t));
  if (bloqueada) {
    return `"${file.name}": los archivos .${bloqueada} no se aceptan en la plataforma por seguridad.`;
  }

  const extension = extensionDe(file.name);
  const permitidas = new Set(reglas.allowed_extensions);
  // jpg y jpeg son el mismo tipo.
  if (permitidas.has('jpg') || permitidas.has('jpeg')) {
    permitidas.add('jpg');
    permitidas.add('jpeg');
  }
  if (!extension || !permitidas.has(extension)) {
    return `"${file.name}": tipo de archivo no permitido. Esta tarea acepta ${listaExtensiones(reglas.allowed_extensions)}.`;
  }
  if (file.size === 0) {
    return `"${file.name}" está vacío.`;
  }
  if (file.size > reglas.max_file_size_mb * 1024 * 1024) {
    const pesa = (file.size / (1024 * 1024)).toFixed(1);
    return `"${file.name}" pesa ${pesa} MB y el máximo es ${reglas.max_file_size_mb} MB por archivo.`;
  }
  return null;
}
