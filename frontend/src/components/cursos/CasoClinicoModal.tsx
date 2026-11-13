/**
 * Caso clínico asignado en un curso (contenido de tipo CASE).
 *
 * Docente dueño: revisa el caso que la IA generó (con el diagnóstico real),
 * lo regenera mientras nadie lo haya empezado y ve los resultados de cada
 * estudiante, con acceso a su informe para dejar notas y calificar.
 * Estudiante: lee las instrucciones y resuelve el caso (un intento); al
 * terminar abre su informe.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Loader2, Stethoscope, RefreshCw, Eye, ClipboardList, Clock, CheckCircle2, PlayCircle, FileText, Users, GraduationCap,
} from 'lucide-react';
import type { CourseContentItem } from '../../data/cursoContenidoApi';
import {
  obtenerCasoCurso, generarCasoCurso, iniciarCasoCurso, resultadosCasoCurso, SUBTEMAS_CASO,
  type CasoCursoDocente, type CasoCursoEstudiante, type ResultadosCaso,
} from '../../data/informesApi';
import '../../styles/informe.css';
import '../../styles/caso-clinico.css';

const DIFICULTAD: Record<string, string> = { EASY: 'Básica', MEDIUM: 'Intermedia', HARD: 'Avanzada' };

function fecha(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

interface Props {
  courseId: string;
  blockId: string;
  item: CourseContentItem;
  esDocente: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function CasoClinicoModal({ courseId, blockId, item, esDocente, onClose, onChanged }: Props) {
  const navigate = useNavigate();
  const [docente, setDocente] = useState<CasoCursoDocente | null>(null);
  const [estudiante, setEstudiante] = useState<CasoCursoEstudiante | null>(null);
  const [resultados, setResultados] = useState<ResultadosCaso | null>(null);
  const [pestana, setPestana] = useState<'caso' | 'resultados'>('caso');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [subtema, setSubtema] = useState<string>(item.case_subtema || SUBTEMAS_CASO[0]);
  const [dificultad, setDificultad] = useState(item.case_dificultad || 'MEDIUM');

  useEffect(() => {
    let vivo = true;
    const carga = esDocente
      ? obtenerCasoCurso<CasoCursoDocente>(courseId, blockId, item.id).then(d => { if (vivo) setDocente(d); })
      : obtenerCasoCurso<CasoCursoEstudiante>(courseId, blockId, item.id).then(d => { if (vivo) setEstudiante(d); });
    carga.catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el caso.'); });
    return () => { vivo = false; };
  }, [courseId, blockId, item.id, esDocente]);

  useEffect(() => {
    if (!esDocente || pestana !== 'resultados' || resultados) return;
    resultadosCasoCurso(courseId, blockId, item.id).then(setResultados)
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudieron cargar los resultados.'));
  }, [esDocente, pestana, resultados, courseId, blockId, item.id]);

  async function generar() {
    setTrabajando(true);
    setError(null);
    try {
      setDocente(await generarCasoCurso(courseId, blockId, item.id, subtema, dificultad));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el caso.');
    } finally {
      setTrabajando(false);
    }
  }

  async function resolver() {
    setTrabajando(true);
    setError(null);
    try {
      const mio = await iniciarCasoCurso(courseId, blockId, item.id);
      if (mio.consultation_id) navigate(mio.estado === 'COMPLETADO' ? `/historial/${mio.consultation_id}` : `/simulacion/${mio.consultation_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el caso.');
      setTrabajando(false);
    }
  }

  const caso = docente?.caso ?? null;
  const mio = estudiante?.mi_caso;

  return (
    <div className="inf-modal-fondo" onClick={onClose}>
      <div className="inf-modal cc-modal" role="dialog" aria-modal="true" aria-label={item.title} onClick={e => e.stopPropagation()}>
        <header className="inf-modal-cab">
          <h3><Stethoscope size={18} /> {item.title}</h3>
          <button type="button" className="inf-icono-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>

        <div className="cc-meta">
          <span className="inf-badge-caso"><ClipboardList size={13} /> Caso clínico</span>
          {item.case_subtema && <span>{item.case_subtema}</span>}
          {item.case_dificultad && <span>Dificultad {DIFICULTAD[item.case_dificultad]?.toLowerCase() ?? item.case_dificultad}</span>}
          {item.due_at && <span><Clock size={13} /> Cierra {fecha(item.due_at)}</span>}
          {item.max_score != null && <span>{item.max_score} pts</span>}
        </div>

        {esDocente && (
          <div className="cc-pestanas" role="tablist">
            <button type="button" role="tab" aria-selected={pestana === 'caso'} className={pestana === 'caso' ? 'is-activa' : ''} onClick={() => setPestana('caso')}>
              <Eye size={15} /> Caso
            </button>
            <button type="button" role="tab" aria-selected={pestana === 'resultados'} className={pestana === 'resultados' ? 'is-activa' : ''} onClick={() => setPestana('resultados')}>
              <Users size={15} /> Resultados
            </button>
          </div>
        )}

        <div className="inf-modal-cuerpo">
          {error && <p className="inf-error">{error}</p>}
          {item.description && <p className="cc-instrucciones">{item.description}</p>}

          {/* ── Docente: el caso ── */}
          {esDocente && pestana === 'caso' && (
            !docente ? <div className="inf-cargando"><Loader2 size={22} className="sim-spin" /></div> : (
              <>
                {caso ? (
                  <div className="cc-caso">
                    <div className="cc-paciente">
                      <strong>{caso.paciente.nombre}</strong>
                      <span>{[caso.paciente.edad ? `${caso.paciente.edad} años` : null, caso.paciente.sexo === 'F' ? 'mujer' : caso.paciente.sexo === 'M' ? 'hombre' : null, caso.paciente.ocupacion].filter(Boolean).join(' · ')}</span>
                    </div>
                    {caso.presentacion_inicial && <p className="cc-cita">«{caso.presentacion_inicial}»</p>}
                    <div className="cc-dato is-dx"><span>Diagnóstico real (los estudiantes no lo ven)</span><strong>{caso.diagnostico_real}</strong></div>
                    {caso.sintomas_principales.length > 0 && (
                      <div className="cc-dato"><span>Síntomas principales</span><p>{caso.sintomas_principales.join(' · ')}</p></div>
                    )}
                    {caso.diferenciales_esperados.length > 0 && (
                      <div className="cc-dato"><span>Diferenciales esperados</span><p>{caso.diferenciales_esperados.join(' · ')}</p></div>
                    )}
                    {caso.preguntas_clave.length > 0 && (
                      <div className="cc-dato"><span>Preguntas clave que el estudiante debería hacer</span>
                        <ul>{caso.preguntas_clave.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                    )}
                    <p className="cc-nota">
                      {docente.empezados > 0
                        ? `${docente.empezados} ${docente.empezados === 1 ? 'estudiante ya lo empezó' : 'estudiantes ya lo empezaron'}: el caso no se puede cambiar.`
                        : 'Todos los estudiantes entrevistarán a este mismo paciente. Puedes generar otro mientras nadie lo haya empezado.'}
                    </p>
                  </div>
                ) : (
                  <p className="inf-vacio">Este caso todavía no tiene paciente. Elige el subtema y la dificultad y genéralo.</p>
                )}
                {docente.puede_regenerar && (
                  <div className="cc-generar">
                    <label>Subtema
                      <select value={subtema} onChange={e => setSubtema(e.target.value)}>
                        {SUBTEMAS_CASO.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label>Dificultad
                      <select value={dificultad} onChange={e => setDificultad(e.target.value)}>
                        <option value="EASY">Básica</option><option value="MEDIUM">Intermedia</option><option value="HARD">Avanzada</option>
                      </select>
                    </label>
                    <button type="button" className="inf-btn-sec" disabled={trabajando} onClick={generar}>
                      {trabajando ? <Loader2 size={15} className="sim-spin" /> : <RefreshCw size={15} />}
                      {trabajando ? 'Generando con IA...' : caso ? 'Generar otro caso' : 'Generar caso'}
                    </button>
                  </div>
                )}
              </>
            )
          )}

          {/* ── Docente: resultados ── */}
          {esDocente && pestana === 'resultados' && (
            !resultados ? <div className="inf-cargando"><Loader2 size={22} className="sim-spin" /></div> : (
              <>
                <div className="cc-resumen">
                  <div><strong>{resultados.resumen.completados}/{resultados.resumen.matriculados}</strong><span>lo completaron</span></div>
                  <div><strong>{resultados.resumen.calificados}</strong><span>calificados por ti</span></div>
                  <div><strong>{resultados.resumen.promedio_evaluador ?? '—'}</strong><span>promedio del evaluador</span></div>
                </div>
                <ul className="cc-resultados">
                  {resultados.resultados.map(r => (
                    <li key={r.estudiante.id}>
                      <span className="cc-res-nombre">{r.estudiante.nombre}</span>
                      <span className={`cc-estado is-${r.estado.toLowerCase()}`}>
                        {r.estado === 'COMPLETADO' ? 'Completado' : r.estado === 'EN_CURSO' ? 'En curso' : 'Sin empezar'}
                      </span>
                      <span className="cc-res-nota" title="Puntaje del evaluador">{r.score != null ? `${Math.round(r.score)}/100` : '—'}</span>
                      <span className="cc-res-nota is-docente" title="Tu calificación">
                        <GraduationCap size={13} /> {r.teacher_score != null ? `${r.teacher_score}/${item.max_score ?? 100}` : '—'}
                      </span>
                      {r.estado === 'COMPLETADO' && r.consultation_id ? (
                        <button type="button" className="inf-btn-sec" onClick={() => navigate(`/historial/${r.consultation_id}`)}>
                          <FileText size={14} /> {r.teacher_score != null ? 'Ver informe' : 'Revisar y calificar'}
                        </button>
                      ) : <span />}
                    </li>
                  ))}
                  {resultados.resultados.length === 0 && <li className="inf-vacio">No hay estudiantes matriculados.</li>}
                </ul>
              </>
            )
          )}

          {/* ── Estudiante ── */}
          {!esDocente && (
            !estudiante ? <div className="inf-cargando"><Loader2 size={22} className="sim-spin" /></div> : (
              <div className="cc-estudiante">
                {mio?.estado === 'COMPLETADO' ? (
                  <>
                    <p className="cc-hecho"><CheckCircle2 size={18} /> Ya resolviste este caso.</p>
                    <div className="cc-resumen">
                      <div><strong>{mio.score != null ? Math.round(mio.score) : '—'}</strong><span>puntaje del evaluador</span></div>
                      <div><strong>{mio.teacher_score != null ? `${mio.teacher_score}/${item.max_score ?? 100}` : 'Pendiente'}</strong><span>calificación del docente</span></div>
                    </div>
                    <button type="button" className="inf-btn-primario" onClick={() => navigate(`/historial/${mio.consultation_id}`)}>
                      <FileText size={15} /> Ver mi informe y las notas del docente
                    </button>
                  </>
                ) : (
                  <>
                    <p className="cc-instrucciones-sec">
                      Entrevista al paciente, examínalo, pide los paraclínicos que necesites y cierra con tu anamnesis, tu
                      diagnóstico y tu plan. Tienes un solo intento; tu docente verá tu informe y podrá dejarte notas.
                    </p>
                    <button type="button" className="inf-btn-primario" disabled={trabajando || !item.case_listo} onClick={resolver}>
                      {trabajando ? <Loader2 size={15} className="sim-spin" /> : <PlayCircle size={15} />}
                      {mio?.estado === 'EN_CURSO' ? 'Continuar el caso' : 'Resolver el caso'}
                    </button>
                    {!item.case_listo && <p className="inf-vacio">El docente todavía está preparando este caso.</p>}
                  </>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
