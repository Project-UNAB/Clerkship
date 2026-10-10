import { useEffect, useRef, useState } from 'react';
import { X, Loader2, Upload, FileText, Download, Clock, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import {
  enlaceArchivoEntrega, entregarTarea, miEntrega,
  type ArchivoEntregado, type CourseContentItem, type EntregaTarea, type ReglasTarea,
} from '../../data/cursoContenidoApi';
import { ApiError } from '../../data/apiClient';
import { readFileAsBase64, formatFileSize } from '../../utils/fileUpload';
import { formatFechaHora, formatRestante, listaExtensiones, validarArchivoLocal } from '../../utils/tareas';

interface Props {
  courseId: string;
  blockId: string;
  item: CourseContentItem;
  onClose: () => void;
}

/** Cuenta regresiva hasta el próximo corte de la tarea, partiendo de los
 * segundos que informó el servidor (la hora del navegador puede estar corrida). */
function useCuentaRegresiva(reglas: ReglasTarea | null, alLlegarACero: () => void) {
  const inicial = reglas == null ? null : (
    reglas.status === 'NOT_OPEN' ? reglas.seconds_until_open
      : reglas.status === 'OPEN' ? reglas.seconds_until_due
        : reglas.status === 'LATE' ? reglas.seconds_until_late_close
          : null
  );
  const [segundos, setSegundos] = useState<number | null>(inicial);
  const avisar = useRef(alLlegarACero);
  avisar.current = alLlegarACero;

  useEffect(() => {
    setSegundos(inicial);
    if (inicial == null) return;
    const fin = Date.now() + inicial * 1000;
    const id = window.setInterval(() => {
      const quedan = Math.max(0, Math.round((fin - Date.now()) / 1000));
      setSegundos(quedan);
      if (quedan === 0) {
        window.clearInterval(id);
        avisar.current();
      }
    }, 1000);
    return () => window.clearInterval(id);
    // Se reinicia cada vez que llegan reglas nuevas del servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reglas?.server_now]);

  return segundos;
}

export default function EntregarTareaModal({ courseId, blockId, item, onClose }: Props) {
  const [reglas, setReglas] = useState<ReglasTarea | null>(item.reglas || null);
  const [entrega, setEntrega] = useState<EntregaTarea | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function cargar() {
    return miEntrega(courseId, blockId, item.id)
      .then(res => {
        setEntrega(res.entrega);
        setReglas(res.reglas);
      })
      .catch(err => setError(err?.message || 'No se pudo cargar la tarea.'));
  }

  useEffect(() => {
    setLoading(true);
    cargar().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Al cumplirse un plazo se vuelven a pedir las reglas: el estado lo decide el servidor.
  const segundos = useCuentaRegresiva(reglas, () => { cargar(); });

  function handleElegir(lista: FileList | null) {
    if (!lista || !reglas) return;
    setOk(null);
    const elegidos = Array.from(lista);
    if (elegidos.length > reglas.max_files) {
      setError(`Esta tarea acepta como máximo ${reglas.max_files} ${reglas.max_files === 1 ? 'archivo' : 'archivos'} por entrega.`);
      return;
    }
    for (const file of elegidos) {
      const problema = validarArchivoLocal(file, reglas);
      if (problema) {
        setError(problema);
        return;
      }
    }
    const total = elegidos.reduce((suma, f) => suma + f.size, 0);
    if (total > reglas.max_total_mb * 1024 * 1024) {
      setError(`La entrega completa no puede pasar de ${reglas.max_total_mb} MB.`);
      return;
    }
    setError(null);
    setSeleccion(elegidos);
  }

  async function handleEntregar() {
    if (seleccion.length === 0) return;
    setEnviando(true);
    setError(null);
    setOk(null);
    try {
      const files = await Promise.all(
        seleccion.map(async f => ({ name: f.name, file_base64: await readFileAsBase64(f) })),
      );
      const res = await entregarTarea(courseId, blockId, item.id, files);
      setEntrega(res);
      setReglas(res.reglas);
      setSeleccion([]);
      if (inputRef.current) inputRef.current.value = '';
      setOk(res.is_late ? 'Entrega recibida, marcada como tardía.' : 'Entrega recibida.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo entregar la tarea.');
      // El rechazo trae las reglas vigentes (por ejemplo si el plazo acaba de cerrar).
      if (err instanceof ApiError && err.data?.reglas) setReglas(err.data.reglas);
    } finally {
      setEnviando(false);
    }
  }

  async function handleDescargar(archivo: ArchivoEntregado) {
    if (!entrega) return;
    try {
      const { url } = await enlaceArchivoEntrega(courseId, blockId, item.id, entrega.id, archivo.id);
      window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      setError(err?.message || 'No se pudo descargar el archivo.');
    }
  }

  function renderEstado(r: ReglasTarea) {
    if (r.status === 'NOT_OPEN') {
      return (
        <div className="ccv-tarea-estado is-pending">
          <Clock size={16} />
          <span>Abre el {formatFechaHora(r.open_at)}{segundos != null ? ` — faltan ${formatRestante(segundos)}` : ''}</span>
        </div>
      );
    }
    if (r.status === 'OPEN') {
      const urgente = segundos != null && segundos <= 3600;
      return (
        <div className={`ccv-tarea-estado ${urgente ? 'is-urgent' : 'is-open'}`}>
          <Clock size={16} />
          <span>
            {r.due_at
              ? <>Cierra el {formatFechaHora(r.due_at)}{segundos != null ? <> — te quedan <strong>{formatRestante(segundos)}</strong></> : null}</>
              : 'Sin fecha límite'}
          </span>
        </div>
      );
    }
    if (r.status === 'LATE') {
      return (
        <div className="ccv-tarea-estado is-urgent">
          <AlertTriangle size={16} />
          <span>
            El plazo cerró el {formatFechaHora(r.due_at)}. Todavía puedes entregar, pero quedará marcada como tardía
            {r.late_until
              ? <> — hasta el {formatFechaHora(r.late_until)}{segundos != null ? <> (quedan <strong>{formatRestante(segundos)}</strong>)</> : null}</>
              : null}.
          </span>
        </div>
      );
    }
    return (
      <div className="ccv-tarea-estado is-closed">
        <AlertTriangle size={16} />
        <span>El plazo de entrega cerró el {formatFechaHora(r.allow_late && r.late_until ? r.late_until : r.due_at)}. Ya no se reciben entregas.</span>
      </div>
    );
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

        <div className="ccv-modal-body ccv-tarea-body">
          {item.description && <p className="ccv-modal-desc" style={{ padding: 0 }}>{item.description}</p>}
          {loading && <Loader2 size={20} className="dfm-spin" />}

          {reglas && (
            <>
              {renderEstado(reglas)}

              <ul className="ccv-tarea-reglas">
                <li><strong>Archivos permitidos:</strong> {listaExtensiones(reglas.allowed_extensions)}</li>
                <li><strong>Tamaño máximo:</strong> {reglas.max_file_size_mb} MB por archivo</li>
                <li><strong>Cantidad:</strong> {reglas.max_files === 1 ? '1 archivo' : `hasta ${reglas.max_files} archivos`} por entrega</li>
                {reglas.open_at && <li><strong>Abre:</strong> {formatFechaHora(reglas.open_at)}</li>}
                {reglas.due_at && <li><strong>Fecha límite:</strong> {formatFechaHora(reglas.due_at)}</li>}
                {reglas.due_at && (
                  <li>
                    <strong>Entregas tardías:</strong>{' '}
                    {reglas.allow_late
                      ? (reglas.late_until ? `se aceptan hasta el ${formatFechaHora(reglas.late_until)}` : 'se aceptan, sin fecha tope')
                      : 'no se aceptan'}
                  </li>
                )}
                {item.max_score != null && <li><strong>Puntaje máximo:</strong> {item.max_score}</li>}
              </ul>

              {item.rubric && item.rubric.length > 0 && !(entrega?.rubric_scores?.length) && (
                <table className="ccv-quiz-tabla ccv-rubrica-tabla">
                  <thead><tr><th>Cómo se califica</th><th>Puntos</th></tr></thead>
                  <tbody>
                    {item.rubric.map(c => (
                      <tr key={c.id || c.title}>
                        <td>{c.title}{c.description ? <span className="ccv-rubrica-comentario">{c.description}</span> : null}</td>
                        <td>{c.max_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {entrega && (
            <div className="ccv-tarea-entrega">
              <div className="ccv-tarea-entrega-head">
                <CheckCircle2 size={16} color="#10b981" />
                <span>
                  Entregaste el {formatFechaHora(entrega.submitted_at)}
                  {entrega.version > 1 ? ` (versión ${entrega.version})` : ''}
                  {entrega.is_late ? ' — tardía' : ''}
                </span>
              </div>
              {entrega.files.map(a => (
                <button key={a.id} type="button" className="ccv-tarea-archivo" onClick={() => handleDescargar(a)}>
                  <FileText size={15} />
                  <span className="ccv-tarea-archivo-nombre">{a.nombre}</span>
                  <span className="ccv-tarea-archivo-meta">{a.size_bytes != null ? formatFileSize(a.size_bytes) : ''}</span>
                  <Download size={14} />
                </button>
              ))}

              {entrega.score != null && (
                <p className="ccv-tarea-nota">
                  Nota: <strong>{entrega.score}{item.max_score != null ? ` / ${item.max_score}` : ''}</strong>
                  {entrega.feedback ? <> — {entrega.feedback}</> : null}
                </p>
              )}
              {entrega.rubric_scores && entrega.rubric_scores.length > 0 && (
                <table className="ccv-quiz-tabla ccv-rubrica-tabla">
                  <thead><tr><th>Criterio</th><th>Puntos</th></tr></thead>
                  <tbody>
                    {entrega.rubric_scores.map(r => (
                      <tr key={r.criterion_id}>
                        <td>{r.title}{r.comment ? <span className="ccv-rubrica-comentario">{r.comment}</span> : null}</td>
                        <td>{r.points} / {r.max_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {entrega.history.length > 0 && (
                <>
                  <button type="button" className="ccv-link-btn" onClick={() => setVerHistorial(v => !v)}>
                    {verHistorial ? 'Ocultar' : 'Ver'} versiones anteriores ({entrega.history.length})
                  </button>
                  {verHistorial && entrega.history.map(h => (
                    <div key={h.version} className="ccv-tarea-version">
                      <span className="ccv-tarea-version-titulo">
                        Versión {h.version} — {formatFechaHora(h.uploaded_at)}{h.is_late ? ' — tardía' : ''}
                      </span>
                      {h.files.map(a => (
                        <button key={a.id} type="button" className="ccv-tarea-archivo" onClick={() => handleDescargar(a)}>
                          <FileText size={15} />
                          <span className="ccv-tarea-archivo-nombre">{a.nombre}</span>
                          <span className="ccv-tarea-archivo-meta">{a.size_bytes != null ? formatFileSize(a.size_bytes) : ''}</span>
                          <Download size={14} />
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {reglas?.accepts_submissions && (
            <>
              <label className="ccv-file-drop">
                <Upload size={18} />
                <span>
                  {seleccion.length > 0
                    ? seleccion.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ')
                    : (entrega ? 'Elegir archivo para reemplazar tu entrega' : `Elegir ${reglas.max_files === 1 ? 'archivo' : 'archivos'}`)}
                </span>
                <input
                  ref={inputRef}
                  type="file"
                  hidden
                  multiple={reglas.max_files > 1}
                  accept={reglas.allowed_extensions.map(e => `.${e}`).join(',')}
                  onChange={e => handleElegir(e.target.files)}
                />
              </label>
              {seleccion.length > 0 && (
                <button
                  type="button" className="ccv-link-btn"
                  onClick={() => { setSeleccion([]); if (inputRef.current) inputRef.current.value = ''; }}
                >
                  <Trash2 size={12} /> Quitar selección
                </button>
              )}
              {entrega && (
                <p className="ccv-form-hint">
                  Puedes reemplazar tu entrega hasta el cierre. La versión anterior queda guardada
                  {entrega.score != null ? ' y la nota actual se borra hasta que el docente vuelva a calificar' : ''}.
                </p>
              )}
            </>
          )}

          {error && <p className="ccv-form-error" role="alert">{error}</p>}
          {ok && <p className="ccv-form-ok" role="status">{ok}</p>}
        </div>

        <div className="ccv-modal-actions">
          <button type="button" className="ccv-btn-secondary" onClick={onClose} disabled={enviando}>Cerrar</button>
          {reglas?.accepts_submissions && (
            <button type="button" className="ccv-btn-primary" onClick={handleEntregar} disabled={enviando || seleccion.length === 0}>
              {enviando ? <Loader2 size={14} className="dfm-spin" /> : null} {entrega ? 'Reemplazar entrega' : 'Entregar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
