import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Loader2, Download, RotateCcw, Trash2, ClipboardList, Search, MessageSquare, Settings2,
  Inbox, CheckCircle2, History, Users,
} from 'lucide-react';
import {
  actualizarTarea, calificarEntrega, eliminarEntrega, enlaceArchivoEntrega, listarEntregas, listarHilosTarea, restaurarEntrega,
  type ArchivoEntregado, type CourseContentItem, type EntregaTarea, type HiloTarea,
} from '../../data/cursoContenidoApi';
import { formatFileSize } from '../../utils/fileUpload';
import { formatFechaHora } from '../../utils/tareas';
import TareaFormFields, {
  localDatetimeToIso, rubricaParaEnviar, tareaFormDesdeItem, validarTareaForm, type TareaFormValue,
} from './TareaFormFields';
import VistaCompleta from './VistaCompleta';
import ComentariosTarea from './ComentariosTarea';

interface Props {
  courseId: string;
  blockId: string;
  item: CourseContentItem;
  onClose: () => void;
  /** La tarea cambió: la página vuelve a cargar el contenido. */
  onSaved: () => void;
}

type Pestana = 'entregas' | 'config';
type Filtro = 'todas' | 'sin-calificar' | 'calificadas';

/** Una fila de la lista: un estudiante con entrega, o que solo escribió comentarios. */
interface Fila {
  student_id: string;
  nombre: string;
  entrega: EntregaTarea | null;
  comentarios: number;
}

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}

/** La tarea vista por el docente, a pantalla completa: las entregas para
 * calificar (con los comentarios de cada estudiante) y la configuración. */
export default function GestionarTareaModal({ courseId, blockId, item, onClose, onSaved }: Props) {
  const sinMovimiento = useReducedMotion();
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
  const [hilos, setHilos] = useState<HiloTarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [notas, setNotas] = useState<Record<string, { score: string; feedback: string }>>({});
  // La tarea tal como quedó guardada: al cambiar la rúbrica en Configuración, se califica ya con la nueva.
  const [guardada, setGuardada] = useState(item);
  const rubrica = guardada.rubric || [];
  const [puntos, setPuntos] = useState<Record<string, Record<string, string>>>({});
  const [calificando, setCalificando] = useState<string | null>(null);
  const [calificadoOk, setCalificadoOk] = useState<string | null>(null);
  const [verPapelera, setVerPapelera] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [elegido, setElegido] = useState<string | null>(null);

  function cargarEntregas() {
    setLoading(true);
    Promise.all([
      listarEntregas(courseId, blockId, item.id, verPapelera),
      verPapelera ? Promise.resolve({ hilos: [] as HiloTarea[] }) : listarHilosTarea(courseId, blockId, item.id).catch(() => ({ hilos: [] as HiloTarea[] })),
    ])
      .then(([res, h]) => {
        setEntregas(res.entregas);
        setHilos(h.hilos);
        const iniciales: Record<string, { score: string; feedback: string }> = {};
        const porCriterio: Record<string, Record<string, string>> = {};
        res.entregas.forEach(e => {
          iniciales[e.id] = { score: e.score != null ? String(e.score) : '', feedback: e.feedback || '' };
          porCriterio[e.id] = {};
          (e.rubric_scores || []).forEach(r => { porCriterio[e.id][r.criterion_id] = String(r.points); });
        });
        setNotas(iniciales);
        setPuntos(porCriterio);
      })
      .catch(err => setError(err?.message || 'No se pudieron cargar las entregas.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargarEntregas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, verPapelera]);

  // Estudiantes con entrega y, además, los que solo escribieron comentarios.
  const filas: Fila[] = useMemo(() => {
    const porEstudiante = new Map<string, Fila>();
    entregas.forEach(e => porEstudiante.set(e.student_id, { student_id: e.student_id, nombre: e.student_name || 'Estudiante', entrega: e, comentarios: 0 }));
    hilos.forEach(h => {
      const f = porEstudiante.get(h.student_id);
      if (f) f.comentarios = h.total;
      else porEstudiante.set(h.student_id, { student_id: h.student_id, nombre: h.student_name, entrega: null, comentarios: h.total });
    });
    return [...porEstudiante.values()];
  }, [entregas, hilos]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter(f => {
      if (q && !f.nombre.toLowerCase().includes(q)) return false;
      if (filtro === 'sin-calificar') return f.entrega != null && f.entrega.score == null;
      if (filtro === 'calificadas') return f.entrega?.score != null;
      return true;
    });
  }, [filas, buscar, filtro]);

  // Se muestra el primero de la lista si no hay nadie elegido (o si el elegido ya no está).
  useEffect(() => {
    if (!visibles.some(f => f.student_id === elegido)) setElegido(visibles[0]?.student_id ?? null);
  }, [visibles, elegido]);

  const fila = filas.find(f => f.student_id === elegido) ?? null;
  const conEntrega = entregas.length;
  const calificadas = entregas.filter(e => e.score != null).length;

  async function handleEliminar(entrega: EntregaTarea) {
    if (!window.confirm(`¿Mover a la papelera la entrega de ${entrega.student_name || 'este estudiante'}? Deja de contar en las notas; la puedes restaurar.`)) return;
    setError(null);
    try {
      await eliminarEntrega(courseId, blockId, item.id, entrega.id);
      setEntregas(prev => prev.filter(e => e.id !== entrega.id));
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la entrega.');
    }
  }

  async function handleRestaurar(entrega: EntregaTarea) {
    setError(null);
    try {
      await restaurarEntrega(courseId, blockId, item.id, entrega.id);
      setEntregas(prev => prev.filter(e => e.id !== entrega.id));
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'No se pudo restaurar la entrega.');
    }
  }

  async function handleGuardar() {
    if (!title.trim()) { setError('Ponle un título.'); return; }
    const problema = validarTareaForm(form);
    if (problema) { setError(problema); return; }
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
      setError(err?.message || 'No se pudo abrir el archivo.');
    }
  }

  async function handleCalificar(entrega: EntregaTarea) {
    const nota = notas[entrega.id];
    let calificacion: Parameters<typeof calificarEntrega>[4];
    if (rubrica.length > 0) {
      const dados = puntos[entrega.id] || {};
      const falta = rubrica.find(c => dados[c.id!] === undefined || dados[c.id!] === '' || Number.isNaN(Number(dados[c.id!])));
      if (falta) { setError(`Falta la nota del criterio «${falta.title}».`); return; }
      calificacion = { criteria: rubrica.map(c => ({ criterion_id: c.id!, points: Number(dados[c.id!]) })) };
    } else {
      if (!nota || nota.score === '' || Number.isNaN(Number(nota.score))) { setError('Escribe un puntaje para calificar.'); return; }
      calificacion = { score: Number(nota.score) };
    }
    setCalificando(entrega.id);
    setCalificadoOk(null);
    setError(null);
    try {
      const actualizada = await calificarEntrega(courseId, blockId, item.id, entrega.id, calificacion, nota?.feedback);
      setEntregas(prev => prev.map(e => (e.id === entrega.id ? { ...e, ...actualizada } : e)));
      setCalificadoOk(entrega.id);
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la calificación.');
    } finally {
      setCalificando(null);
    }
  }

  function archivos(entrega: EntregaTarea, lista: ArchivoEntregado[]) {
    return (
      <div className="av-archivos">
        {lista.map(a => {
          const ext = a.nombre.split('.').pop()?.toUpperCase().slice(0, 4) || 'DOC';
          return (
            <button key={a.id} type="button" className="av-archivo" onClick={() => handleDescargar(entrega, a)} title={`Abrir ${a.nombre}`}>
              <span className="av-archivo-ext">{ext}</span>
              <span className="av-archivo-nombre">{a.nombre}</span>
              <span className="av-archivo-peso">{a.size_bytes != null ? formatFileSize(a.size_bytes) : ''}</span>
              <Download size={15} className="av-archivo-ir" />
            </button>
          );
        })}
      </div>
    );
  }

  function estadoDe(f: Fila) {
    if (!f.entrega) return { txt: 'Sin entrega', clase: 'is-gris' };
    if (f.entrega.score != null) return { txt: `${f.entrega.score}${guardada.max_score != null ? ` / ${guardada.max_score}` : ''}`, clase: 'is-verde' };
    return { txt: f.entrega.is_late ? 'Por calificar · tardía' : 'Por calificar', clase: f.entrega.is_late ? 'is-ambar' : 'is-azul' };
  }

  const e = fila?.entrega ?? null;
  const total = e && rubrica.length > 0
    ? Math.round(rubrica.reduce((suma, c) => suma + (Number(puntos[e.id]?.[c.id!]) || 0), 0) * 100) / 100
    : null;

  return (
    <VistaCompleta
      etiqueta="Tarea · vista del docente"
      titulo={item.title}
      subtitulo={`${conEntrega} ${conEntrega === 1 ? 'entrega' : 'entregas'} · ${calificadas} ${calificadas === 1 ? 'calificada' : 'calificadas'}`}
      icono={<ClipboardList size={18} />}
      color="#ef6c00"
      onClose={onClose}
      acciones={
        <div className="av-pestanas" role="tablist">
          {([['entregas', 'Entregas', Inbox], ['config', 'Configuración', Settings2]] as const).map(([id, txt, Icono]) => (
            <button key={id} type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? 'is-activa' : ''} onClick={() => setPestana(id)}>
              {pestana === id && <motion.span layoutId="av-pestana" className="av-pestana-fondo" transition={sinMovimiento ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} />}
              <Icono size={15} /> <span>{txt}</span>
            </button>
          ))}
        </div>
      }
    >
      {pestana === 'entregas' && (
        <div className="av-gestion">
          {/* ── Lista de estudiantes ── */}
          <aside className="av-gestion-lista">
            <label className="av-buscar">
              <Search size={15} />
              <input type="search" placeholder="Buscar estudiante" value={buscar} onChange={ev => setBuscar(ev.target.value)} />
            </label>
            {!verPapelera && (
              <div className="av-chips">
                {([['todas', 'Todos'], ['sin-calificar', 'Por calificar'], ['calificadas', 'Calificadas']] as const).map(([id, txt]) => (
                  <button key={id} type="button" className={filtro === id ? 'is-activo' : ''} onClick={() => setFiltro(id)}>{txt}</button>
                ))}
              </div>
            )}
            {loading && <div className="av-cargando"><Loader2 size={20} className="dfm-spin" /></div>}
            {!loading && visibles.length === 0 && (
              <div className="av-vacio">
                <Users size={22} />
                <span>{verPapelera ? 'No hay entregas en la papelera.' : filas.length ? 'Nadie coincide con el filtro.' : 'Todavía nadie ha entregado ni comentado.'}</span>
              </div>
            )}
            <ul className="av-estudiantes">
              {visibles.map((f, i) => {
                const est = estadoDe(f);
                return (
                  <motion.li key={f.student_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: sinMovimiento ? 0 : 0.2, delay: sinMovimiento ? 0 : Math.min(i, 10) * 0.03 }}>
                    <button type="button" className={`av-estudiante${elegido === f.student_id ? ' is-elegido' : ''}`} onClick={() => setElegido(f.student_id)}>
                      <span className="av-estudiante-avatar" aria-hidden="true">{iniciales(f.nombre)}</span>
                      <span className="av-estudiante-txt">
                        <strong>{f.nombre}</strong>
                        <small>{f.entrega ? formatFechaHora(f.entrega.submitted_at) : 'Solo comentarios'}</small>
                      </span>
                      <span className="av-estudiante-der">
                        <span className={`av-estado ${est.clase}`}>{est.txt}</span>
                        {f.comentarios > 0 && <span className="av-estudiante-com"><MessageSquare size={12} /> {f.comentarios}</span>}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
            <button type="button" className="av-enlace" onClick={() => { setVerPapelera(v => !v); setElegido(null); }}>
              {verPapelera ? <><RotateCcw size={14} /> Volver a las entregas</> : <><Trash2 size={14} /> Ver papelera de entregas</>}
            </button>
          </aside>

          {/* ── Detalle del estudiante elegido ── */}
          <div className="av-gestion-detalle">
            <AnimatePresence mode="wait">
              {fila ? (
                <motion.div key={fila.student_id} className="av-detalle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: sinMovimiento ? 0 : 0.2 }}>
                  <div className="av-detalle-cab">
                    <span className="av-estudiante-avatar is-grande" aria-hidden="true">{iniciales(fila.nombre)}</span>
                    <div>
                      <h3>{fila.nombre}</h3>
                      <span>{e ? `Entregó el ${formatFechaHora(e.submitted_at)}${e.version > 1 ? ` · versión ${e.version}` : ''}${e.is_late ? ' · tardía' : ''}` : 'Todavía no ha entregado'}</span>
                    </div>
                    <span className={`av-estado ${estadoDe(fila).clase}`}>{estadoDe(fila).txt}</span>
                  </div>

                  {e && (
                    <section className="av-tarjeta">
                      <h4 className="av-h3">Archivos entregados</h4>
                      {archivos(e, e.files)}
                      {e.history.length > 0 && (
                        <details className="av-detalles">
                          <summary><History size={14} /> Versiones anteriores ({e.history.length})</summary>
                          {e.history.map(h => (
                            <div key={h.version} className="av-version">
                              <span>Versión {h.version} · {formatFechaHora(h.uploaded_at)}{h.is_late ? ' · tardía' : ''}</span>
                              {archivos(e, h.files)}
                            </div>
                          ))}
                        </details>
                      )}
                    </section>
                  )}

                  {e && !verPapelera && (
                    <section className="av-tarjeta">
                      <h4 className="av-h3">Calificación</h4>
                      {rubrica.length > 0 && (
                        <div className="av-criterios">
                          {rubrica.map(c => (
                            <label key={c.id} className="av-criterio" title={c.description || undefined}>
                              <span><strong>{c.title}</strong><small>máx. {c.max_points}</small></span>
                              <input type="number" min={0} max={c.max_points} step="0.1" value={puntos[e.id]?.[c.id!] ?? ''}
                                onChange={ev => setPuntos(prev => ({ ...prev, [e.id]: { ...(prev[e.id] || {}), [c.id!]: ev.target.value } }))} />
                            </label>
                          ))}
                          <span className="av-criterios-total">Total <strong>{total}{guardada.max_score != null ? ` / ${guardada.max_score}` : ''}</strong></span>
                        </div>
                      )}
                      <div className="av-calificar">
                        {rubrica.length === 0 && (
                          <label className="av-campo is-puntaje">
                            <span>Puntaje</span>
                            <div className="av-puntaje">
                              <input type="number" min={0} max={guardada.max_score ?? undefined} step="0.1"
                                placeholder="0" value={notas[e.id]?.score ?? ''}
                                onChange={ev => setNotas(prev => ({ ...prev, [e.id]: { score: ev.target.value, feedback: prev[e.id]?.feedback ?? '' } }))} />
                              {guardada.max_score != null && <span>/ {guardada.max_score}</span>}
                            </div>
                          </label>
                        )}
                        <label className="av-campo">
                          <span>Retroalimentación <small>(la ve el estudiante junto a su nota)</small></span>
                          <textarea rows={2} placeholder="Qué hizo bien y qué puede mejorar…" value={notas[e.id]?.feedback ?? ''}
                            onChange={ev => setNotas(prev => ({ ...prev, [e.id]: { score: prev[e.id]?.score ?? '', feedback: ev.target.value } }))} />
                        </label>
                      </div>
                      <div className="av-acciones-fila">
                        <button type="button" className="av-btn is-peligro-suave" onClick={() => handleEliminar(e)}><Trash2 size={14} /> Mover a la papelera</button>
                        <AnimatePresence>
                          {calificadoOk === e.id && (
                            <motion.span className="av-ok-mini" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                              <CheckCircle2 size={15} /> Guardado
                            </motion.span>
                          )}
                        </AnimatePresence>
                        <button type="button" className="av-btn is-principal" onClick={() => handleCalificar(e)} disabled={calificando === e.id}>
                          {calificando === e.id ? <Loader2 size={15} className="dfm-spin" /> : <CheckCircle2 size={15} />}
                          {e.score != null ? 'Actualizar nota' : 'Calificar'}
                        </button>
                      </div>
                    </section>
                  )}

                  {e && verPapelera && (
                    <button type="button" className="av-btn" onClick={() => handleRestaurar(e)}><RotateCcw size={14} /> Restaurar entrega</button>
                  )}

                  {!verPapelera && (
                    <section className="av-tarjeta">
                      <div className="av-tarjeta-cab">
                        <h4 className="av-h3"><MessageSquare size={15} /> Comentarios con {fila.nombre.split(' ')[0]}</h4>
                        <span className="av-privado">Privado</span>
                      </div>
                      <ComentariosTarea courseId={courseId} blockId={blockId} itemId={item.id} estudianteId={fila.student_id} esDocente
                        onCambio={n => setHilos(prev => {
                          const otros = prev.filter(h => h.student_id !== fila.student_id);
                          return n > 0 ? [...otros, { student_id: fila.student_id, student_name: fila.nombre, total: n, ultimo_at: null }] : otros;
                        })} />
                    </section>
                  )}
                </motion.div>
              ) : (
                <motion.div key="vacio" className="av-vacio is-grande" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Inbox size={30} />
                  <strong>{verPapelera ? 'La papelera está vacía' : 'Aún no hay entregas'}</strong>
                  <span>Cuando los estudiantes entreguen o escriban, aparecerán a la izquierda.</span>
                </motion.div>
              )}
            </AnimatePresence>
            {error && <p className="av-error" role="alert">{error}</p>}
          </div>
        </div>
      )}

      {pestana === 'config' && (
        <div className="av-config">
          <section className="av-tarjeta">
            <label className="av-campo">
              <span>Título</span>
              <input type="text" value={title} onChange={ev => setTitle(ev.target.value)} />
            </label>
            <label className="av-campo">
              <span>Instrucciones <small>(opcional)</small></span>
              <textarea value={description} onChange={ev => setDescription(ev.target.value)} rows={3} />
            </label>
            <TareaFormFields value={form} onChange={v => { setForm(v); setGuardado(false); }} />
            {entregas.length > 0 && (
              <p className="av-nota-al-pie">Ya hay entregas: los cambios aplican a las que lleguen desde ahora; las recibidas no se vuelven a validar.</p>
            )}
            {error && <p className="av-error" role="alert">{error}</p>}
            <div className="av-acciones-fila">
              <AnimatePresence>
                {guardado && <motion.span className="av-ok-mini" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><CheckCircle2 size={15} /> Cambios guardados</motion.span>}
              </AnimatePresence>
              <button type="button" className="av-btn is-principal" onClick={handleGuardar} disabled={guardando}>
                {guardando ? <Loader2 size={15} className="dfm-spin" /> : null} Guardar cambios
              </button>
            </div>
          </section>
        </div>
      )}
    </VistaCompleta>
  );
}
