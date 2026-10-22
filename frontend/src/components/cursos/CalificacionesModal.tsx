import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, Loader2, ClipboardList, HelpCircle, Download, Search, Award, CheckCircle2, Hourglass, MinusCircle } from 'lucide-react';
import {
  exportarCalificaciones, obtenerCalificaciones, obtenerMisCalificaciones,
  type Calificacion, type CalificacionItem, type LibroCalificaciones, type MisCalificaciones,
} from '../../data/cursoCalificacionesApi';
import '../../styles/aulaVistas.css';

interface Props {
  courseId: string;
  esDocente: boolean;
  onClose: () => void;
}

/** Porcentaje de una nota (null si no hay nota o no hay máximo). */
function porcentaje(c: Calificacion | undefined, it: CalificacionItem): number | null {
  if (c?.score == null || !it.max_score) return null;
  return Math.max(0, Math.min(100, (c.score / it.max_score) * 100));
}

/** Rojo < 60 %, ámbar < 80 %, verde ≥ 80 %. */
function tono(pct: number | null) {
  if (pct == null) return 'is-gris';
  return pct < 60 ? 'is-rojo' : pct < 80 ? 'is-ambar' : 'is-verde';
}

function Anillo({ valor }: { valor: number | null }) {
  const sinMovimiento = useReducedMotion();
  const r = 42;
  const largo = 2 * Math.PI * r;
  const pct = valor == null ? 0 : Math.max(0, Math.min(100, valor));
  return (
    <div className={`av-anillo ${tono(valor)}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="av-anillo-pista" />
        <motion.circle cx="50" cy="50" r={r} className="av-anillo-valor" strokeDasharray={largo}
          initial={{ strokeDashoffset: largo }} animate={{ strokeDashoffset: largo * (1 - pct / 100) }}
          transition={{ duration: sinMovimiento ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="av-anillo-txt">
        <strong>{valor == null ? '—' : `${Math.round(valor)}%`}</strong>
        <span>promedio</span>
      </div>
    </div>
  );
}

/** Notas del curso. El estudiante ve su resumen y cada actividad con su barra;
 * el docente, el libro completo con buscador, colores por desempeño y exportación. */
export default function CalificacionesModal({ courseId, esDocente, onClose }: Props) {
  const sinMovimiento = useReducedMotion();
  const [libro, setLibro] = useState<LibroCalificaciones | null>(null);
  const [mias, setMias] = useState<MisCalificaciones | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'csv' | 'xlsx' | null>(null);
  const [buscar, setBuscar] = useState('');

  useEffect(() => {
    setLoading(true);
    const promesa = esDocente ? obtenerCalificaciones(courseId) : obtenerMisCalificaciones(courseId);
    promesa
      .then(res => { if (esDocente) setLibro(res as LibroCalificaciones); else setMias(res as MisCalificaciones); })
      .catch(err => setError(err?.message || 'No se pudieron cargar las calificaciones.'))
      .finally(() => setLoading(false));
  }, [courseId, esDocente]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onClose]);

  async function handleExportar(formato: 'csv' | 'xlsx') {
    setExportando(formato);
    setError(null);
    try {
      await exportarCalificaciones(courseId, formato);
    } catch (err: any) {
      setError(err?.message || 'No se pudo exportar el libro de calificaciones.');
    } finally {
      setExportando(null);
    }
  }

  const resumenMio = useMemo(() => {
    if (!mias) return null;
    let calificadas = 0, porCalificar = 0, sinEntregar = 0;
    mias.items.forEach(it => {
      const c = mias.calificaciones[it.id];
      if (c?.score != null) calificadas += 1;
      else if (c?.status === 'submitted') porCalificar += 1;
      else sinEntregar += 1;
    });
    return { calificadas, porCalificar, sinEntregar };
  }, [mias]);

  const estudiantes = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (libro?.estudiantes ?? []).filter(f => !q || f.nombre.toLowerCase().includes(q) || f.student_code?.toLowerCase().includes(q));
  }, [libro, buscar]);

  const promedioCurso = useMemo(() => {
    const vals = (libro?.estudiantes ?? []).map(f => f.promedio).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [libro]);

  return createPortal(
    <motion.div className="av-modal-velo" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: sinMovimiento ? 0 : 0.18 }}>
      <motion.div className={`av-modal ${esDocente ? 'is-ancho' : ''}`} role="dialog" aria-modal="true" aria-label="Calificaciones"
        initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: sinMovimiento ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}>
        <header className="av-modal-cab">
          <span className="av-vista-icono" style={{ '--av-tipo': '#1976d2' } as React.CSSProperties}><Award size={18} /></span>
          <div>
            <h3>{esDocente ? 'Libro de calificaciones' : 'Mis notas'}</h3>
            <span>{esDocente ? 'Tareas y cuestionarios de todos los estudiantes' : 'Tus tareas y cuestionarios de este curso'}</span>
          </div>
          <button type="button" className="av-icono" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>

        <div className="av-modal-cuerpo">
          {loading && <div className="av-cargando"><Loader2 size={22} className="dfm-spin" /></div>}
          {error && <p className="av-error">{error}</p>}

          {/* ── Estudiante ── */}
          {!loading && !esDocente && mias && (
            mias.items.length === 0 ? (
              <div className="av-vacio is-grande"><Award size={28} /><strong>Aún no hay actividades calificables</strong><span>Cuando el curso tenga tareas o cuestionarios, verás aquí tus notas.</span></div>
            ) : (
              <>
                <div className="av-notas-resumen">
                  <Anillo valor={mias.promedio} />
                  <ul className="av-notas-cifras">
                    <li className="is-verde"><CheckCircle2 size={16} /><strong>{resumenMio?.calificadas}</strong><span>calificadas</span></li>
                    <li className="is-azul"><Hourglass size={16} /><strong>{resumenMio?.porCalificar}</strong><span>por calificar</span></li>
                    <li className="is-gris"><MinusCircle size={16} /><strong>{resumenMio?.sinEntregar}</strong><span>sin entregar</span></li>
                  </ul>
                </div>
                <ul className="av-notas-lista">
                  {mias.items.map((it, i) => {
                    const c = mias.calificaciones[it.id];
                    const pct = porcentaje(c, it);
                    const Icono = it.type === 'ASSIGNMENT' ? ClipboardList : HelpCircle;
                    return (
                      <motion.li key={it.id} className="av-nota-fila" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: sinMovimiento ? 0 : 0.22, delay: sinMovimiento ? 0 : 0.05 + i * 0.04 }}>
                        <span className={`av-nota-icono ${it.type === 'ASSIGNMENT' ? 'is-tarea' : 'is-quiz'}`}><Icono size={16} /></span>
                        <div className="av-nota-centro">
                          <span className="av-nota-titulo">{it.title}</span>
                          <div className="av-nota-barra is-fina">
                            <motion.i className={tono(pct)} initial={{ width: 0 }} animate={{ width: `${pct ?? 0}%` }}
                              transition={{ duration: sinMovimiento ? 0 : 0.6, delay: sinMovimiento ? 0 : 0.1 + i * 0.04 }} />
                          </div>
                        </div>
                        <span className={`av-nota-valor ${tono(pct)}`}>
                          {c?.score != null
                            ? <><strong>{c.score}</strong>{it.max_score != null && <small>/ {it.max_score}</small>}</>
                            : <em>{c?.status === 'submitted' ? 'Por calificar' : 'Sin entregar'}</em>}
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>
              </>
            )
          )}

          {/* ── Docente ── */}
          {!loading && esDocente && libro && (
            libro.items.length === 0 ? (
              <div className="av-vacio is-grande"><Award size={28} /><strong>Aún no hay actividades calificables</strong><span>Crea tareas o cuestionarios en los módulos para llenar el libro.</span></div>
            ) : (
              <>
                <div className="av-libro-barra">
                  <label className="av-buscar">
                    <Search size={15} />
                    <input type="search" placeholder="Buscar estudiante o código" value={buscar} onChange={e => setBuscar(e.target.value)} />
                  </label>
                  <span className="av-libro-dato">{libro.estudiantes.length} estudiantes · promedio del curso <strong>{promedioCurso == null ? '—' : `${Math.round(promedioCurso)}%`}</strong></span>
                  <div className="av-libro-exportar">
                    {(['xlsx', 'csv'] as const).map(formato => (
                      <button key={formato} type="button" className="av-btn" onClick={() => handleExportar(formato)} disabled={exportando !== null}>
                        {exportando === formato ? <Loader2 size={14} className="dfm-spin" /> : <Download size={14} />}
                        {formato === 'xlsx' ? 'Excel' : 'CSV'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="av-libro">
                  <table>
                    <thead>
                      <tr>
                        <th className="is-fijo">Estudiante</th>
                        {libro.items.map(it => (
                          <th key={it.id} title={it.title}>
                            <span className="av-libro-col">
                              {it.type === 'ASSIGNMENT' ? <ClipboardList size={13} /> : <HelpCircle size={13} />}
                              <span>{it.title}</span>
                            </span>
                            {it.max_score != null && <small>/ {it.max_score}</small>}
                          </th>
                        ))}
                        <th>Promedio</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence initial={false}>
                        {estudiantes.map(fila => (
                          <motion.tr key={fila.student_id} layout={!sinMovimiento} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <td className="is-fijo">
                              <strong>{fila.nombre}</strong>
                              {fila.student_code && <small>{fila.student_code}</small>}
                            </td>
                            {libro.items.map(it => {
                              const c = fila.calificaciones[it.id];
                              const pct = porcentaje(c, it);
                              return (
                                <td key={it.id}>
                                  {c?.score != null
                                    ? <span className={`av-celda ${tono(pct)}`}>{c.score}</span>
                                    : c?.status === 'submitted'
                                      ? <span className="av-celda is-pendiente">Por calificar</span>
                                      : <span className="av-celda is-vacia">—</span>}
                                </td>
                              );
                            })}
                            <td>
                              <span className="av-promedio">
                                <span className={`av-celda ${tono(fila.promedio)}`}>{fila.promedio == null ? '—' : `${fila.promedio}%`}</span>
                              </span>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                  {estudiantes.length === 0 && <p className="av-vacio">Ningún estudiante coincide con «{buscar}».</p>}
                </div>
              </>
            )
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
