import { useEffect, useState } from 'react';
import { X, Loader2, FileText, Download, RotateCcw, Trash2 } from 'lucide-react';
import {
  actualizarTarea, calificarEntrega, eliminarEntrega, enlaceArchivoEntrega, listarEntregas, restaurarEntrega,
  type ArchivoEntregado, type CourseContentItem, type EntregaTarea,
} from '../../data/cursoContenidoApi';
import { formatFileSize } from '../../utils/fileUpload';
import { formatFechaHora } from '../../utils/tareas';
import TareaFormFields, {
  localDatetimeToIso, rubricaParaEnviar, tareaFormDesdeItem, validarTareaForm, type TareaFormValue,
} from './TareaFormFields';

interface Props {
  courseId: string;
  blockId: string;
  item: CourseContentItem;
  onClose: () => void;
  /** La tarea cambió: la página vuelve a cargar el contenido. */
  onSaved: () => void;
}

type Pestana = 'entregas' | 'config';

export default function GestionarTareaModal({ courseId, blockId, item, onClose, onSaved }: Props) {
  const [pestana, setPestana] = useState<Pestana>('entregas');
  const [error, setError] = useState<string | null>(null);

  // Configuración
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || '');
  const [form, setForm] = useState<TareaFormValue>(() => tareaFormDesdeItem(item));
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  // Entregas
  const [entregas, setEntregas] = useState<EntregaTarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [notas, setNotas] = useState<Record<string, { score: string; feedback: string }>>({});
  // Con rúbrica: los puntos de cada criterio por entrega, {entregaId: {criterioId: puntos}}.
  // La tarea tal como quedó guardada: al cambiar la rúbrica en Configuración, se califica ya con la nueva.
  const [guardada, setGuardada] = useState(item);
  const rubrica = guardada.rubric || [];
  const [puntos, setPuntos] = useState<Record<string, Record<string, string>>>({});
  const [calificando, setCalificando] = useState<string | null>(null);

  // Papelera: entregas que el docente eliminó y puede restaurar.
  const [verPapelera, setVerPapelera] = useState(false);

  async function handleEliminar(entrega: EntregaTarea) {
    if (!window.confirm(`¿Mover a la papelera la entrega de ${entrega.student_name || 'este estudiante'}? Deja de contar en las notas; la puedes restaurar.`)) return;
    setError(null);
    try {
      await eliminarEntrega(courseId, blockId, item.id, entrega.id);
      setEntregas(prev => prev.filter(e => e.id !== entrega.id));
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la entrega.');
    }
  }

  async function handleRestaurar(entrega: EntregaTarea) {
    setError(null);
    try {
      await restaurarEntrega(courseId, blockId, item.id, entrega.id);
      setEntregas(prev => prev.filter(e => e.id !== entrega.id));
    } catch (err: any) {
      setError(err?.message || 'No se pudo restaurar la entrega.');
    }
  }

  function cargarEntregas() {
    setLoading(true);
    listarEntregas(courseId, blockId, item.id, verPapelera)
      .then(res => {
        setEntregas(res.entregas);
        const iniciales: Record<string, { score: string; feedback: string }> = {};
        res.entregas.forEach(e => {
          iniciales[e.id] = { score: e.score != null ? String(e.score) : '', feedback: e.feedback || '' };
        });
        setNotas(iniciales);
        const porCriterio: Record<string, Record<string, string>> = {};
        res.entregas.forEach(e => {
          porCriterio[e.id] = {};
          (e.rubric_scores || []).forEach(r => { porCriterio[e.id][r.criterion_id] = String(r.points); });
        });
        setPuntos(porCriterio);
      })
      .catch(err => setError(err?.message || 'No se pudieron cargar las entregas.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargarEntregas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, verPapelera]);

  async function handleGuardar() {
    if (!title.trim()) {
      setError('Ponle un título.');
      return;
    }
    const problema = validarTareaForm(form);
    if (problema) {
      setError(problema);
      return;
    }
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      // null explícito borra el valor en el servidor (vuelve al de por defecto).
      const actualizada = await actualizarTarea(courseId, blockId, item.id, {
        title: title.trim(),
        description: description.trim(),
        open_at: localDatetimeToIso(form.openAt) ?? null,
        due_at: localDatetimeToIso(form.dueAt) ?? null,
        allow_late: form.allowLate,
        late_until: form.allowLate ? (localDatetimeToIso(form.lateUntil) ?? null) : null,
        allowed_extensions: form.extensions,
        max_file_size_mb: form.maxFileSizeMb ? Number(form.maxFileSizeMb) : null,
        max_files: form.maxFiles ? Number(form.maxFiles) : 1,
        max_score: form.maxScore ? Number(form.maxScore) : undefined,
        rubric: rubricaParaEnviar(form.rubric),
      });
      setGuardada(actualizada);
      setGuardado(true);
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la tarea.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleDescargar(entrega: EntregaTarea, archivo: ArchivoEntregado) {
    try {
      const { url } = await enlaceArchivoEntrega(courseId, blockId, item.id, entrega.id, archivo.id);
      window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      setError(err?.message || 'No se pudo descargar el archivo.');
    }
  }

  async function handleCalificar(entrega: EntregaTarea) {
    const nota = notas[entrega.id];
    let calificacion: Parameters<typeof calificarEntrega>[4];
    if (rubrica.length > 0) {
      const dados = puntos[entrega.id] || {};
      const falta = rubrica.find(c => dados[c.id!] === undefined || dados[c.id!] === '' || Number.isNaN(Number(dados[c.id!])));
      if (falta) {
        setError(`Falta la nota del criterio "${falta.title}".`);
        return;
      }
      calificacion = { criteria: rubrica.map(c => ({ criterion_id: c.id!, points: Number(dados[c.id!]) })) };
    } else {
      if (!nota || nota.score === '' || Number.isNaN(Number(nota.score))) {
        setError('Escribe un puntaje para calificar.');
        return;
      }
      calificacion = { score: Number(nota.score) };
    }
    setCalificando(entrega.id);
    setError(null);
    try {
      const actualizada = await calificarEntrega(courseId, blockId, item.id, entrega.id, calificacion, nota?.feedback);
      setEntregas(prev => prev.map(e => (e.id === entrega.id ? { ...e, ...actualizada } : e)));
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la calificación.');
    } finally {
      setCalificando(null);
    }
  }

  function renderArchivos(entrega: EntregaTarea, archivos: ArchivoEntregado[]) {
    return archivos.map(a => (
      <button key={a.id} type="button" className="ccv-tarea-archivo" onClick={() => handleDescargar(entrega, a)}>
        <FileText size={15} />
        <span className="ccv-tarea-archivo-nombre">{a.nombre}</span>
        <span className="ccv-tarea-archivo-meta">{a.size_bytes != null ? formatFileSize(a.size_bytes) : ''}</span>
        <Download size={14} />
      </button>
    ));
  }

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal ccv-modal-form-wide" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>{item.title}</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-type-picker">
          <button type="button" className={`ccv-type-btn ${pestana === 'entregas' ? 'is-active' : ''}`} onClick={() => setPestana('entregas')}>
            Entregas ({entregas.length})
          </button>
          <button type="button" className={`ccv-type-btn ${pestana === 'config' ? 'is-active' : ''}`} onClick={() => setPestana('config')}>
            Configuración
          </button>
        </div>

        {pestana === 'entregas' && (
          <div className="ccv-modal-body ccv-tarea-body">
            <button type="button" className="ccv-link-btn" onClick={() => setVerPapelera(v => !v)}>
              {verPapelera ? 'Volver a las entregas' : 'Ver papelera de entregas'}
            </button>
            {loading && <Loader2 size={20} className="dfm-spin" />}
            {!loading && entregas.length === 0 && (
              <p className="ccv-empty-note" style={{ margin: 0 }}>
                {verPapelera ? 'No hay entregas en la papelera.' : 'Todavía nadie ha entregado.'}
              </p>
            )}

            {entregas.map(e => (
              <div key={e.id} className="ccv-tarea-entrega">
                <div className="ccv-tarea-entrega-head">
                  <strong>{e.student_name || 'Estudiante'}</strong>
                  <span>
                    {formatFechaHora(e.submitted_at)}
                    {e.version > 1 ? ` · versión ${e.version}` : ''}
                    {e.is_late ? ' · tardía' : ''}
                  </span>
                </div>
                {renderArchivos(e, e.files)}
                {e.history.length > 0 && (
                  <details className="ccv-tarea-version">
                    <summary>Versiones anteriores ({e.history.length})</summary>
                    {e.history.map(h => (
                      <div key={h.version}>
                        <span className="ccv-tarea-version-titulo">
                          Versión {h.version} — {formatFechaHora(h.uploaded_at)}{h.is_late ? ' — tardía' : ''}
                        </span>
                        {renderArchivos(e, h.files)}
                      </div>
                    ))}
                  </details>
                )}
                {verPapelera ? (
                  <button type="button" className="ccv-btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => handleRestaurar(e)}>
                    <RotateCcw size={14} /> Restaurar entrega
                  </button>
                ) : (
                <>
                {rubrica.length > 0 && (
                  <div className="ccv-rubrica-notas">
                    {rubrica.map(c => (
                      <label key={c.id} className="ccv-rubrica-nota" title={c.description || undefined}>
                        <span>{c.title} <em>(máx. {c.max_points})</em></span>
                        <input
                          type="number" min={0} max={c.max_points} step="0.1"
                          value={puntos[e.id]?.[c.id!] ?? ''}
                          onChange={ev => setPuntos(prev => ({ ...prev, [e.id]: { ...(prev[e.id] || {}), [c.id!]: ev.target.value } }))}
                        />
                      </label>
                    ))}
                    <span className="ccv-rubrica-total">
                      Total: <strong>
                        {Math.round(rubrica.reduce((suma, c) => suma + (Number(puntos[e.id]?.[c.id!]) || 0), 0) * 100) / 100}
                        {guardada.max_score != null ? ` / ${guardada.max_score}` : ''}
                      </strong>
                    </span>
                  </div>
                )}
                <div className={`ccv-tarea-calificar ${rubrica.length > 0 ? 'is-rubrica' : ''}`}>
                  {rubrica.length === 0 && (
                  <input
                    type="number" min={0} max={guardada.max_score ?? undefined} step="0.1"
                    aria-label={`Puntaje de ${e.student_name || 'la entrega'}`}
                    placeholder={guardada.max_score != null ? `0 – ${guardada.max_score}` : 'Puntaje'}
                    value={notas[e.id]?.score ?? ''}
                    onChange={ev => setNotas(prev => ({ ...prev, [e.id]: { score: ev.target.value, feedback: prev[e.id]?.feedback ?? '' } }))}
                  />
                  )}
                  <input
                    type="text"
                    aria-label={`Comentario para ${e.student_name || 'la entrega'}`}
                    placeholder="Comentario general (opcional)"
                    value={notas[e.id]?.feedback ?? ''}
                    onChange={ev => setNotas(prev => ({ ...prev, [e.id]: { score: prev[e.id]?.score ?? '', feedback: ev.target.value } }))}
                  />
                  <button type="button" className="ccv-btn-secondary" onClick={() => handleCalificar(e)} disabled={calificando === e.id}>
                    {calificando === e.id ? <Loader2 size={14} className="dfm-spin" /> : (e.score != null ? 'Actualizar' : 'Calificar')}
                  </button>
                </div>
                <button type="button" className="ccv-link-btn cur-portada-quitar" onClick={() => handleEliminar(e)}>
                  <Trash2 size={12} /> Mover a la papelera
                </button>
                </>
                )}
              </div>
            ))}
            {error && <p className="ccv-form-error" role="alert">{error}</p>}
          </div>
        )}

        {pestana === 'config' && (
          <>
            <div className="ccv-form-body ccv-tarea-body">
              <label className="ccv-form-label">
                Título
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} />
              </label>
              <label className="ccv-form-label">
                Instrucciones (opcional)
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
              </label>
              <TareaFormFields value={form} onChange={v => { setForm(v); setGuardado(false); }} />
              {entregas.length > 0 && (
                <p className="ccv-form-hint">
                  Ya hay entregas: los cambios aplican a las que lleguen desde ahora; las recibidas no se vuelven a validar.
                </p>
              )}
              {error && <p className="ccv-form-error" role="alert">{error}</p>}
              {guardado && <p className="ccv-form-ok" role="status">Cambios guardados.</p>}
            </div>
            <div className="ccv-modal-actions">
              <button type="button" className="ccv-btn-secondary" onClick={onClose} disabled={guardando}>Cerrar</button>
              <button type="button" className="ccv-btn-primary" onClick={handleGuardar} disabled={guardando}>
                {guardando ? <Loader2 size={14} className="dfm-spin" /> : null} Guardar cambios
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
