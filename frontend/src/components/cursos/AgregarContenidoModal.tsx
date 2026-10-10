import { useState } from 'react';
import { X, FileText, Video, Link as LinkIcon, Type, Loader2, Upload, HelpCircle, ClipboardList } from 'lucide-react';
import { crearContenido, GRADE_POLICY_LABELS, type ContentType, type GradePolicy } from '../../data/cursoContenidoApi';
import { readFileAsBase64, base64ByteLength, formatFileSize } from '../../utils/fileUpload';
import RichTextEditor from './RichTextEditor';
import TareaFormFields, {
  TAREA_FORM_VACIO, localDatetimeToIso, rubricaParaEnviar, validarTareaForm, type TareaFormValue,
} from './TareaFormFields';

interface Props {
  courseId: string;
  blockId: string;
  onClose: () => void;
  onCreated: () => void;
}

const TIPOS: { type: ContentType; label: string; Icon: typeof FileText }[] = [
  { type: 'DOCUMENT', label: 'Documento', Icon: FileText },
  { type: 'VIDEO', label: 'Video', Icon: Video },
  { type: 'LINK', label: 'Enlace', Icon: LinkIcon },
  { type: 'TEXT', label: 'Nota', Icon: Type },
  { type: 'ASSIGNMENT', label: 'Tarea', Icon: ClipboardList },
  { type: 'QUIZ', label: 'Cuestionario', Icon: HelpCircle },
];

const MAX_FILE_BASE64_CHARS = 15 * 1024 * 1024;

export default function AgregarContenidoModal({ courseId, blockId, onClose, onCreated }: Props) {
  const [tipo, setTipo] = useState<ContentType>('DOCUMENT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [textContent, setTextContent] = useState('<p></p>');
  const [file, setFile] = useState<File | null>(null);
  const [openAt, setOpenAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [maxAttempts, setMaxAttempts] = useState('');
  const [gradePolicy, setGradePolicy] = useState<GradePolicy>('BEST');
  const [tarea, setTarea] = useState<TareaFormValue>(TAREA_FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) {
      setError('Ponle un título.');
      return;
    }
    if (tipo === 'DOCUMENT' && !file) {
      setError('Selecciona un archivo.');
      return;
    }
    if (tipo === 'VIDEO' && !videoUrl.trim()) {
      setError('Pega el link del video.');
      return;
    }
    if (tipo === 'LINK' && !linkUrl.trim()) {
      setError('Pega la URL del enlace.');
      return;
    }
    const textoPlano = textContent.replace(/<[^>]*>/g, '').trim();
    if (tipo === 'TEXT' && !textoPlano) {
      setError('Escribe el contenido de la nota.');
      return;
    }
    if (tipo === 'ASSIGNMENT') {
      const problema = validarTareaForm(tarea);
      if (problema) {
        setError(problema);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      if (tipo === 'DOCUMENT' && file) {
        const base64 = await readFileAsBase64(file);
        if (base64ByteLength(base64) > MAX_FILE_BASE64_CHARS) {
          throw new Error('El archivo es demasiado pesado (máximo ~11 MB).');
        }
        await crearContenido(courseId, blockId, {
          type: 'DOCUMENT',
          title: title.trim(),
          description: description.trim() || undefined,
          name: file.name,
          mime_type: file.type || 'application/octet-stream',
          file_base64: base64,
        });
      } else if (tipo === 'VIDEO') {
        await crearContenido(courseId, blockId, {
          type: 'VIDEO',
          title: title.trim(),
          description: description.trim() || undefined,
          video_url: videoUrl.trim(),
        });
      } else if (tipo === 'LINK') {
        await crearContenido(courseId, blockId, {
          type: 'LINK',
          title: title.trim(),
          description: description.trim() || undefined,
          link_url: linkUrl.trim(),
        });
      } else if (tipo === 'TEXT') {
        await crearContenido(courseId, blockId, {
          type: 'TEXT',
          title: title.trim(),
          description: description.trim() || undefined,
          text_content: textContent,
        });
      } else if (tipo === 'ASSIGNMENT') {
        await crearContenido(courseId, blockId, {
          type: 'ASSIGNMENT',
          title: title.trim(),
          description: description.trim() || undefined,
          open_at: localDatetimeToIso(tarea.openAt),
          due_at: localDatetimeToIso(tarea.dueAt),
          allow_late: tarea.allowLate,
          late_until: tarea.allowLate ? localDatetimeToIso(tarea.lateUntil) : undefined,
          allowed_extensions: tarea.extensions,
          max_file_size_mb: tarea.maxFileSizeMb ? Number(tarea.maxFileSizeMb) : undefined,
          max_files: tarea.maxFiles ? Number(tarea.maxFiles) : 1,
          max_score: tarea.maxScore ? Number(tarea.maxScore) : undefined,
          rubric: tarea.rubric.length > 0 ? rubricaParaEnviar(tarea.rubric) : undefined,
        });
      } else {
        await crearContenido(courseId, blockId, {
          type: 'QUIZ',
          title: title.trim(),
          description: description.trim() || undefined,
          open_at: localDatetimeToIso(openAt),
          due_at: localDatetimeToIso(dueAt),
          time_limit_minutes: timeLimit ? Number(timeLimit) : undefined,
          max_attempts: maxAttempts ? Number(maxAttempts) : undefined,
          grade_policy: gradePolicy,
        });
      }
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo agregar el contenido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className={`ccv-modal ccv-modal-form ${tipo === 'TEXT' || tipo === 'QUIZ' || tipo === 'ASSIGNMENT' ? 'ccv-modal-form-wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>Agregar contenido</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-type-picker">
          {TIPOS.map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              className={`ccv-type-btn ${tipo === type ? 'is-active' : ''}`}
              onClick={() => setTipo(type)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="ccv-form-body">
          <label className="ccv-form-label">
            Título
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Guía de dolor abdominal" />
          </label>

          <label className="ccv-form-label">
            Descripción (opcional)
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </label>

          {tipo === 'DOCUMENT' && (
            <label className="ccv-file-drop">
              <Upload size={18} />
              <span>{file ? `${file.name} (${formatFileSize(file.size)})` : 'Elegir archivo (PDF, Word, Excel, PowerPoint, imagen...)'}</span>
              <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} hidden />
            </label>
          )}

          {tipo === 'VIDEO' && (
            <label className="ccv-form-label">
              Link del video (YouTube o Vimeo)
              <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
            </label>
          )}

          {tipo === 'LINK' && (
            <label className="ccv-form-label">
              URL del enlace
              <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." />
            </label>
          )}

          {tipo === 'TEXT' && (
            <label className="ccv-form-label">
              Contenido de la nota
              <RichTextEditor content={textContent} onChange={setTextContent} placeholder="Instrucciones, lectura, apuntes..." />
            </label>
          )}

          {tipo === 'ASSIGNMENT' && <TareaFormFields value={tarea} onChange={setTarea} />}

          {tipo === 'QUIZ' && (
            <>
              <p className="ccv-form-hint">Las preguntas se agregan después de crear el cuestionario.</p>
              <div className="ccv-form-row">
                <label className="ccv-form-label">
                  Abre (opcional)
                  <input type="datetime-local" value={openAt} onChange={e => setOpenAt(e.target.value)} />
                </label>
                <label className="ccv-form-label">
                  Cierra (opcional)
                  <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} />
                </label>
              </div>
              <div className="ccv-form-row">
                <label className="ccv-form-label">
                  Duración en minutos (opcional)
                  <input type="number" min={1} value={timeLimit} onChange={e => setTimeLimit(e.target.value)} placeholder="Sin límite" />
                </label>
                <label className="ccv-form-label">
                  Intentos permitidos (opcional)
                  <input type="number" min={1} value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)} placeholder="Sin límite" />
                </label>
              </div>
              <label className="ccv-form-label">
                Nota que cuenta si hay varios intentos
                <select value={gradePolicy} onChange={e => setGradePolicy(e.target.value as GradePolicy)}>
                  {(Object.keys(GRADE_POLICY_LABELS) as GradePolicy[]).map(p => (
                    <option key={p} value={p}>{GRADE_POLICY_LABELS[p]}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {error && <p className="ccv-form-error">{error}</p>}
        </div>

        <div className="ccv-modal-actions">
          <button type="button" className="ccv-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="ccv-btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 size={14} className="dfm-spin" /> : null} Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
