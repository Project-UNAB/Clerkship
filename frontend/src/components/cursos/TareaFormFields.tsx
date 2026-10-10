import { useEffect, useState } from 'react';
import { opcionesTarea, type CourseContentItem, type CriterioRubrica, type OpcionesTarea } from '../../data/cursoContenidoApi';
import { inputColombiaAIso, isoAInputColombia } from '../../utils/fechas';

/** Lo que el docente llena para una tarea, tal como está en el formulario
 * (fechas en el formato de <input type="datetime-local">, hora local). */
export interface TareaFormValue {
  openAt: string;
  dueAt: string;
  allowLate: boolean;
  lateUntil: string;
  /** Vacío = las extensiones por defecto del servidor. */
  extensions: string[];
  maxFileSizeMb: string;
  maxFiles: string;
  maxScore: string;
  /** Criterios de la rúbrica; vacío = nota única. */
  rubric: CriterioForm[];
}

export interface CriterioForm {
  id?: string;
  title: string;
  description: string;
  maxPoints: string;
}

export const TAREA_FORM_VACIO: TareaFormValue = {
  openAt: '', dueAt: '', allowLate: false, lateUntil: '', extensions: [], maxFileSizeMb: '', maxFiles: '1', maxScore: '10', rubric: [],
};

/** Los criterios del formulario, listos para mandar al backend. */
export function rubricaParaEnviar(rubric: CriterioForm[]): CriterioRubrica[] {
  return rubric.map(c => ({
    id: c.id,
    title: c.title.trim(),
    description: c.description.trim() || undefined,
    max_points: Number(c.maxPoints),
  }));
}

function sumaDeRubrica(rubric: CriterioForm[]): number {
  return Math.round(rubric.reduce((suma, c) => suma + (Number(c.maxPoints) || 0), 0) * 100) / 100;
}

/** Mientras cargan las opciones reales del servidor. */
const OPCIONES_RESPALDO: OpcionesTarea = {
  supported_extensions: ['csv', 'doc', 'docx', 'gif', 'jpeg', 'jpg', 'pdf', 'png', 'ppt', 'pptx', 'txt', 'webp', 'xls', 'xlsx', 'zip'],
  default_extensions: ['doc', 'docx', 'jpeg', 'jpg', 'pdf', 'png', 'ppt', 'pptx', 'xls', 'xlsx'],
  max_file_size_mb: 10,
  max_files: 5,
  max_total_mb: 20,
};

/** Tipos de archivo agrupados como los piensa un docente, no por extensión suelta. */
const GRUPOS: { label: string; extensiones: string[] }[] = [
  { label: 'PDF', extensiones: ['pdf'] },
  { label: 'Word', extensiones: ['doc', 'docx'] },
  { label: 'PowerPoint', extensiones: ['ppt', 'pptx'] },
  { label: 'Excel', extensiones: ['xls', 'xlsx'] },
  { label: 'Imágenes', extensiones: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  { label: 'Texto / CSV', extensiones: ['txt', 'csv'] },
  { label: 'Comprimido (.zip)', extensiones: ['zip'] },
];

/** Lo que el docente escribe en los campos de fecha es hora de Colombia, sin
 * importar la zona de su navegador; al backend va en UTC. */
export const localDatetimeToIso = inputColombiaAIso;

/** Un instante en UTC -> valor del campo de fecha, en hora de Colombia. */
export const isoToLocalDatetime = isoAInputColombia;

export function tareaFormDesdeItem(item: CourseContentItem): TareaFormValue {
  return {
    openAt: isoToLocalDatetime(item.open_at),
    dueAt: isoToLocalDatetime(item.due_at),
    allowLate: !!item.allow_late,
    lateUntil: isoToLocalDatetime(item.late_until),
    extensions: item.allowed_extensions || [],
    maxFileSizeMb: item.max_file_size_mb ? String(item.max_file_size_mb) : '',
    maxFiles: String(item.max_files || 1),
    maxScore: item.max_score != null ? String(item.max_score) : '',
    rubric: (item.rubric || []).map(c => ({
      id: c.id, title: c.title, description: c.description || '', maxPoints: String(c.max_points),
    })),
  };
}

/** Revisa lo que se puede revisar sin ir al servidor. Devuelve el mensaje de error, o null. */
export function validarTareaForm(v: TareaFormValue): string | null {
  const abre = v.openAt ? new Date(v.openAt).getTime() : null;
  const cierra = v.dueAt ? new Date(v.dueAt).getTime() : null;
  const tardias = v.lateUntil ? new Date(v.lateUntil).getTime() : null;
  if (abre != null && cierra != null && abre >= cierra) return 'La apertura tiene que ser antes del cierre.';
  if (v.allowLate && tardias != null) {
    if (cierra == null) return 'Para poner un límite de entregas tardías primero define la fecha de cierre.';
    if (tardias <= cierra) return 'El límite de entregas tardías tiene que ser después del cierre.';
  }
  if (v.maxFiles && Number(v.maxFiles) < 1) return 'La entrega debe permitir al menos un archivo.';
  for (const criterio of v.rubric) {
    if (!criterio.title.trim()) return 'Cada criterio de la rúbrica necesita un nombre.';
    if (!(Number(criterio.maxPoints) > 0)) return `El criterio "${criterio.title.trim()}" necesita un puntaje mayor que cero.`;
  }
  return null;
}

interface Props {
  value: TareaFormValue;
  onChange: (value: TareaFormValue) => void;
}

export default function TareaFormFields({ value, onChange }: Props) {
  const [opciones, setOpciones] = useState<OpcionesTarea>(OPCIONES_RESPALDO);

  useEffect(() => {
    opcionesTarea().then(setOpciones).catch(() => { /* se queda con el respaldo; el servidor valida igual */ });
  }, []);

  const set = (cambios: Partial<TareaFormValue>) => onChange({ ...value, ...cambios });
  const setCriterio = (indice: number, cambios: Partial<CriterioForm>) =>
    set({ rubric: value.rubric.map((c, i) => (i === indice ? { ...c, ...cambios } : c)) });
  const soportadas = new Set(opciones.supported_extensions);
  const grupos = GRUPOS
    .map(g => ({ ...g, extensiones: g.extensiones.filter(e => soportadas.has(e)) }))
    .filter(g => g.extensiones.length > 0);
  const elegidas = new Set(value.extensions);

  function toggleGrupo(extensiones: string[]) {
    const activo = extensiones.every(e => elegidas.has(e));
    const next = new Set(elegidas);
    extensiones.forEach(e => (activo ? next.delete(e) : next.add(e)));
    set({ extensions: Array.from(next).sort() });
  }

  return (
    <>
      <div className="ccv-form-row">
        <label className="ccv-form-label">
          Abre (fecha y hora, opcional)
          <input type="datetime-local" value={value.openAt} onChange={e => set({ openAt: e.target.value })} />
        </label>
        <label className="ccv-form-label">
          Cierra (fecha y hora)
          <input type="datetime-local" value={value.dueAt} onChange={e => set({ dueAt: e.target.value })} />
        </label>
      </div>
      <p className="ccv-form-hint">Las fechas y horas son hora de Colombia (America/Bogota), para ti y para los estudiantes.</p>

      <label className="ccv-checkbox-label">
        <input
          type="checkbox"
          checked={value.allowLate}
          onChange={e => set({ allowLate: e.target.checked, lateUntil: e.target.checked ? value.lateUntil : '' })}
        />
        Aceptar entregas tardías (quedan marcadas como tardías)
      </label>
      {value.allowLate && (
        <label className="ccv-form-label">
          Tardías hasta (opcional — vacío: sin límite)
          <input type="datetime-local" value={value.lateUntil} min={value.dueAt || undefined} onChange={e => set({ lateUntil: e.target.value })} />
        </label>
      )}

      <div className="ccv-form-label">
        Tipos de archivo permitidos
        <div className="ccv-chip-picker">
          {grupos.map(g => {
            const activo = g.extensiones.every(e => elegidas.has(e));
            return (
              <button
                key={g.label}
                type="button"
                className={`ccv-chip ${activo ? 'is-active' : ''}`}
                aria-pressed={activo}
                title={g.extensiones.map(e => `.${e}`).join(' ')}
                onClick={() => toggleGrupo(g.extensiones)}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        <span className="ccv-form-hint">
          {value.extensions.length === 0
            ? `Sin elegir: se aceptan ${opciones.default_extensions.map(e => `.${e}`).join(' ')}.`
            : `Se aceptan: ${value.extensions.map(e => `.${e}`).join(' ')}.`}
          {' '}Ejecutables, scripts y páginas web (.exe, .bat, .js, .html...) nunca se aceptan.
        </span>
      </div>

      <div className="ccv-form-row">
        <label className="ccv-form-label">
          Tamaño máximo por archivo (MB)
          <input
            type="number" min={1} max={opciones.max_file_size_mb} value={value.maxFileSizeMb}
            onChange={e => set({ maxFileSizeMb: e.target.value })}
            placeholder={`${opciones.max_file_size_mb} (máximo del sistema)`}
          />
        </label>
        <label className="ccv-form-label">
          Archivos por entrega
          <input
            type="number" min={1} max={opciones.max_files} value={value.maxFiles}
            onChange={e => set({ maxFiles: e.target.value })}
          />
        </label>
      </div>
      <p className="ccv-form-hint">
        Máximo del sistema: {opciones.max_file_size_mb} MB por archivo, {opciones.max_files} archivos y {opciones.max_total_mb} MB por entrega.
      </p>

      <div className="ccv-form-label">
        Rúbrica (opcional)
        <span className="ccv-form-hint">
          Con criterios, la tarea se califica criterio por criterio y la nota es la suma. Sin criterios, con una nota única.
        </span>
        {value.rubric.map((criterio, indice) => (
          <div key={criterio.id || `nuevo-${indice}`} className="ccv-rubrica-fila">
            <input
              type="text" value={criterio.title} maxLength={150} placeholder="Criterio (ej. Anamnesis)"
              aria-label={`Nombre del criterio ${indice + 1}`}
              onChange={e => setCriterio(indice, { title: e.target.value })}
            />
            <input
              type="number" min={0.5} step="0.5" value={criterio.maxPoints} placeholder="Puntos"
              aria-label={`Puntos del criterio ${indice + 1}`}
              onChange={e => setCriterio(indice, { maxPoints: e.target.value })}
            />
            <button
              type="button" className="ccv-rubrica-quitar" title="Quitar criterio"
              aria-label={`Quitar el criterio ${indice + 1}`}
              onClick={() => set({ rubric: value.rubric.filter((_c, i) => i !== indice) })}
            >
              ×
            </button>
            <input
              type="text" className="ccv-rubrica-descripcion" value={criterio.description} maxLength={500}
              placeholder="Qué se espera (opcional)" aria-label={`Descripción del criterio ${indice + 1}`}
              onChange={e => setCriterio(indice, { description: e.target.value })}
            />
          </div>
        ))}
        <button
          type="button" className="ccv-link-btn"
          onClick={() => set({ rubric: [...value.rubric, { title: '', description: '', maxPoints: '' }] })}
        >
          + Agregar criterio
        </button>
      </div>

      <label className="ccv-form-label">
        Puntaje máximo
        {value.rubric.length > 0 ? (
          <input type="number" value={sumaDeRubrica(value.rubric)} disabled aria-describedby="ccv-puntaje-rubrica" />
        ) : (
          <input type="number" min={0} step="0.5" value={value.maxScore} onChange={e => set({ maxScore: e.target.value })} />
        )}
        {value.rubric.length > 0 && (
          <span id="ccv-puntaje-rubrica" className="ccv-form-hint">Es la suma de los puntos de la rúbrica.</span>
        )}
      </label>
    </>
  );
}
