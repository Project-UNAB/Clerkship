import { useEffect, useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Loader2, Upload, FileText, Download, Clock, AlertTriangle, CheckCircle2, X, ClipboardList,
  History, MessageSquare, Award, CalendarClock, Paperclip, Hourglass,
} from 'lucide-react';
import {
  enlaceArchivoEntrega, entregarTarea, miEntrega,
  type ArchivoEntregado, type CourseContentItem, type EntregaTarea, type ReglasTarea,
} from '../../data/cursoContenidoApi';
import { ApiError } from '../../data/apiClient';
import { readFileAsBase64, formatFileSize } from '../../utils/fileUpload';
import { formatFechaHora, formatRestante, listaExtensiones, validarArchivoLocal } from '../../utils/tareas';
import VistaCompleta from './VistaCompleta';
import ComentariosTarea from './ComentariosTarea';

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

function Archivo({ archivo, onAbrir }: { archivo: ArchivoEntregado; onAbrir: () => void }) {
  const ext = archivo.nombre.split('.').pop()?.toUpperCase().slice(0, 4) || 'DOC';
  return (
    <button type="button" className="av-archivo" onClick={onAbrir} title={`Abrir ${archivo.nombre}`}>
      <span className="av-archivo-ext">{ext}</span>
      <span className="av-archivo-nombre">{archivo.nombre}</span>
      <span className="av-archivo-peso">{archivo.size_bytes != null ? formatFileSize(archivo.size_bytes) : ''}</span>
      <Download size={15} className="av-archivo-ir" />
    </button>
  );
}

/** La tarea vista por el estudiante, a pantalla completa: instrucciones y
 * reglas a la izquierda; su entrega, la nota y los comentarios con el docente
 * a la derecha. */
export default function EntregarTareaModal({ courseId, blockId, item, onClose }: Props) {
  const sinMovimiento = useReducedMotion();
  const [reglas, setReglas] = useState<ReglasTarea | null>(item.reglas || null);
  const [entrega, setEntrega] = useState<EntregaTarea | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
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

  function validar(elegidos: File[]): string | null {
    if (!reglas) return 'Todavía no se cargaron las reglas de la tarea.';
    if (elegidos.length > reglas.max_files) {
      return `Esta tarea acepta como máximo ${reglas.max_files} ${reglas.max_files === 1 ? 'archivo' : 'archivos'} por entrega.`;
    }
    for (const file of elegidos) {
      const problema = validarArchivoLocal(file, reglas);
      if (problema) return problema;
    }
    const total = elegidos.reduce((suma, f) => suma + f.size, 0);
    if (total > reglas.max_total_mb * 1024 * 1024) return `La entrega completa no puede pasar de ${reglas.max_total_mb} MB.`;
    return null;
  }

  function agregar(lista: FileList | File[] | null) {
    if (!lista || !reglas) return;
    setOk(null);
    // Con un solo archivo permitido, el nuevo reemplaza al elegido; si no, se suman.
    const nuevos = Array.from(lista);
    const elegidos = reglas.max_files === 1 ? nuevos.slice(0, 1) : [...seleccion, ...nuevos];
    const problema = validar(elegidos);
    if (problema) { setError(problema); return; }
    setError(null);
    setSeleccion(elegidos);
    if (inputRef.current) inputRef.current.value = '';
  }

  function quitar(i: number) {
    setSeleccion(lista => lista.filter((_, j) => j !== i));
  }

  function alSoltar(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (reglas?.accepts_submissions) agregar(e.dataTransfer.files);
  }

  async function handleEntregar() {
    if (seleccion.length === 0) return;
    if (entrega && !window.confirm('Tu entrega actual se reemplaza por estos archivos (la anterior queda en el historial). ¿Continuar?')) return;
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
      setOk(res.is_late ? 'Entrega recibida, marcada como tardía.' : '¡Entrega recibida!');
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
      setError(err?.message || 'No se pudo abrir el archivo.');
    }
  }

  // Estado de la entrega en una palabra, con su color.
  const estado = !entrega
    ? (reglas && !reglas.accepts_submissions && reglas.status === 'CLOSED' ? { txt: 'No entregada', clase: 'is-rojo' } : { txt: 'Sin entregar', clase: 'is-gris' })
    : entrega.score != null ? { txt: 'Calificada', clase: 'is-verde' }
      : entrega.is_late ? { txt: 'Entregada tarde', clase: 'is-ambar' }
        : { txt: 'Entregada', clase: 'is-azul' };

  function renderPlazo(r: ReglasTarea) {
    if (r.status === 'NOT_OPEN') {
      return (
        <div className="av-plazo is-espera">
          <Hourglass size={18} />
          <div><strong>Todavía no abre</strong><span>Abre el {formatFechaHora(r.open_at)}{segundos != null ? ` · faltan ${formatRestante(segundos)}` : ''}</span></div>
        </div>
      );
    }
    if (r.status === 'OPEN') {
      const urgente = segundos != null && segundos <= 3600;
      return (
        <div className={`av-plazo ${urgente ? 'is-urgente' : 'is-abierta'}`}>
          <Clock size={18} />
          <div>
            <strong>{r.due_at ? (segundos != null ? `Te quedan ${formatRestante(segundos)}` : 'Abierta') : 'Abierta, sin fecha límite'}</strong>
            {r.due_at && <span>Cierra el {formatFechaHora(r.due_at)}</span>}
          </div>
        </div>
      );
    }
    if (r.status === 'LATE') {
      return (
        <div className="av-plazo is-urgente">
          <AlertTriangle size={18} />
          <div>
            <strong>Plazo vencido: se recibe como tardía</strong>
            <span>
              Cerró el {formatFechaHora(r.due_at)}
              {r.late_until ? ` · se acepta hasta el ${formatFechaHora(r.late_until)}${segundos != null ? ` (quedan ${formatRestante(segundos)})` : ''}` : ''}
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="av-plazo is-cerrada">
        <AlertTriangle size={18} />
        <div><strong>Entregas cerradas</strong><span>El plazo cerró el {formatFechaHora(r.allow_late && r.late_until ? r.late_until : r.due_at)}.</span></div>
      </div>
    );
  }

  const max = item.max_score;

  return (
    <VistaCompleta
      etiqueta="Tarea"
      titulo={item.title}
      subtitulo={<span className={`av-estado ${estado.clase}`}>{estado.txt}</span>}
      icono={<ClipboardList size={18} />}
      color="#ef6c00"
      onClose={onClose}
    >
      <div className="av-tarea">
        {/* ── Instrucciones y reglas ── */}
        <div className="av-tarea-col">
          {reglas && renderPlazo(reglas)}

          <section className="av-tarjeta">
            <h3 className="av-h3">Instrucciones</h3>
            {item.description
              ? <p className="av-texto">{item.description}</p>
              : <p className="av-texto is-muted">El docente no escribió instrucciones adicionales.</p>}
          </section>

          {reglas && (
            <section className="av-tarjeta">
              <h3 className="av-h3">Cómo entregar</h3>
              <ul className="av-reglas">
                <li><Paperclip size={15} /><span><strong>Archivos permitidos</strong>{listaExtensiones(reglas.allowed_extensions)}</span></li>
                <li><Upload size={15} /><span><strong>Tamaño y cantidad</strong>{reglas.max_file_size_mb} MB por archivo · {reglas.max_files === 1 ? '1 archivo' : `hasta ${reglas.max_files} archivos`}</span></li>
                {reglas.open_at && <li><CalendarClock size={15} /><span><strong>Abre</strong>{formatFechaHora(reglas.open_at)}</span></li>}
                {reglas.due_at && <li><Clock size={15} /><span><strong>Fecha límite</strong>{formatFechaHora(reglas.due_at)}</span></li>}
                {reglas.due_at && (
                  <li><AlertTriangle size={15} /><span><strong>Entregas tardías</strong>
                    {reglas.allow_late
                      ? (reglas.late_until ? `Se aceptan hasta el ${formatFechaHora(reglas.late_until)}` : 'Se aceptan, sin fecha tope')
                      : 'No se aceptan'}
                  </span></li>
                )}
                {max != null && <li><Award size={15} /><span><strong>Puntaje máximo</strong>{max} puntos</span></li>}
              </ul>
            </section>
          )}

          {item.rubric && item.rubric.length > 0 && !(entrega?.rubric_scores?.length) && (
            <section className="av-tarjeta">
              <h3 className="av-h3">Cómo se califica</h3>
              <ul className="av-rubrica">
                {item.rubric.map(c => (
                  <li key={c.id || c.title}>
                    <div><strong>{c.title}</strong>{c.description && <span>{c.description}</span>}</div>
                    <em>{c.max_points} pts</em>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ── Mi entrega y comentarios ── */}
        <div className="av-tarea-col">
          <section className="av-tarjeta">
            <div className="av-tarjeta-cab">
              <h3 className="av-h3">Tu entrega</h3>
              <span className={`av-estado ${estado.clase}`}>{estado.txt}</span>
            </div>

            {loading && <div className="av-cargando"><Loader2 size={20} className="dfm-spin" /></div>}

            {entrega && entrega.score != null && (
              <div className="av-nota">
                <div className="av-nota-num">
                  <strong>{entrega.score}</strong>{max != null && <span>/ {max}</span>}
                </div>
                {max != null && max > 0 && (
                  <div className="av-nota-barra"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.min(100, (entrega.score / max) * 100)}%` }} transition={{ duration: sinMovimiento ? 0 : 0.6, ease: 'easeOut' }} /></div>
                )}
                {entrega.feedback && <p className="av-nota-feedback"><MessageSquare size={14} /> {entrega.feedback}</p>}
                {entrega.rubric_scores && entrega.rubric_scores.length > 0 && (
                  <ul className="av-rubrica is-notas">
                    {entrega.rubric_scores.map(r => (
                      <li key={r.criterion_id}>
                        <div><strong>{r.title}</strong>{r.comment && <span>{r.comment}</span>}</div>
                        <em>{r.points} / {r.max_points}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {entrega && (
              <div className="av-entregado">
                <span className="av-entregado-cab">
                  <CheckCircle2 size={16} />
                  Entregaste el {formatFechaHora(entrega.submitted_at)}
                  {entrega.version > 1 ? ` · versión ${entrega.version}` : ''}
                  {entrega.is_late ? ' · tardía' : ''}
                </span>
                <div className="av-archivos">
                  {entrega.files.map(a => <Archivo key={a.id} archivo={a} onAbrir={() => handleDescargar(a)} />)}
                </div>
                {entrega.history.length > 0 && (
                  <>
                    <button type="button" className="av-enlace" onClick={() => setVerHistorial(v => !v)} aria-expanded={verHistorial}>
                      <History size={14} /> {verHistorial ? 'Ocultar' : 'Ver'} versiones anteriores ({entrega.history.length})
                    </button>
                    <AnimatePresence initial={false}>
                      {verHistorial && (
                        <motion.div className="av-historial" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                          {entrega.history.map(h => (
                            <div key={h.version} className="av-version">
                              <span>Versión {h.version} · {formatFechaHora(h.uploaded_at)}{h.is_late ? ' · tardía' : ''}</span>
                              {h.files.map(a => <Archivo key={a.id} archivo={a} onAbrir={() => handleDescargar(a)} />)}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
            )}

            {reglas?.accepts_submissions && (
              <div className="av-subir">
                <label
                  className={`av-zona${arrastrando ? ' is-arrastrando' : ''}`}
                  onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={alSoltar}
                >
                  <span className="av-zona-icono"><Upload size={22} /></span>
                  <strong>{entrega ? 'Arrastra aquí para reemplazar tu entrega' : 'Arrastra aquí tus archivos'}</strong>
                  <span>o <u>elígelos desde tu equipo</u> · {listaExtensiones(reglas.allowed_extensions)}</span>
                  <input
                    ref={inputRef}
                    type="file"
                    hidden
                    multiple={reglas.max_files > 1}
                    accept={reglas.allowed_extensions.map(e => `.${e}`).join(',')}
                    onChange={e => agregar(e.target.files)}
                  />
                </label>

                <AnimatePresence initial={false}>
                  {seleccion.map((f, i) => (
                    <motion.div key={`${f.name}-${i}`} className="av-elegido" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                      <FileText size={16} />
                      <span className="av-archivo-nombre">{f.name}</span>
                      <span className="av-archivo-peso">{formatFileSize(f.size)}</span>
                      <button type="button" onClick={() => quitar(i)} aria-label={`Quitar ${f.name}`}><X size={14} /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {entrega && entrega.score != null && (
                  <p className="av-nota-al-pie">Si reemplazas tu entrega, la nota actual se borra hasta que el docente vuelva a calificar.</p>
                )}

                <button type="button" className="av-btn is-principal is-ancho" onClick={handleEntregar} disabled={enviando || seleccion.length === 0}>
                  {enviando ? <Loader2 size={16} className="dfm-spin" /> : <Upload size={16} />}
                  {entrega ? 'Reemplazar mi entrega' : 'Entregar tarea'}
                </button>
              </div>
            )}

            <AnimatePresence>
              {error && <motion.p className="av-error" role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{error}</motion.p>}
              {ok && <motion.p className="av-ok" role="status" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}><CheckCircle2 size={16} /> {ok}</motion.p>}
            </AnimatePresence>
          </section>

          <section className="av-tarjeta">
            <div className="av-tarjeta-cab">
              <h3 className="av-h3"><MessageSquare size={15} /> Comentarios con el docente</h3>
              <span className="av-privado">Privado</span>
            </div>
            <ComentariosTarea courseId={courseId} blockId={blockId} itemId={item.id} esDocente={false} />
          </section>
        </div>
      </div>
    </VistaCompleta>
  );
}
