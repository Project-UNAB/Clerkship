import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import type { Course, Difficulty } from '../../data/consultasApi';
import {
  listarCursosDocente,
  obtenerSeguimientoCurso,
  obtenerSeguimientoEstudiante,
  type EstudianteSeguimiento,
  type SeguimientoCursoRespuesta,
  type SeguimientoEstudianteRespuesta,
} from '../../data/seguimientoApi';
import '../../styles/seguimiento.css';

type ColumnaOrden =
  | 'nombre'
  | 'consultas_completadas'
  | 'promedio'
  | 'ultimo_puntaje'
  | 'fecha_ultima_consulta';

const ETIQUETA_DIFICULTAD: Record<Difficulty, string> = {
  EASY: 'Fácil',
  MEDIUM: 'Intermedio',
  HARD: 'Difícil',
};

function formatearFecha(iso: string | null): string {
  if (!iso) return 'Sin registros';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatearFechaCorta(iso: string | null, indice: number): string {
  if (!iso) return `#${indice + 1}`;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return `#${indice + 1}`;
  return fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

export const SeguimientoPage: React.FC = () => {
  const { courseId } = useParams<{ courseId?: string }>();
  const navigate = useNavigate();

  const [cursos, setCursos] = useState<Course[]>([]);
  const [cargandoCursos, setCargandoCursos] = useState(true);
  const [seguimiento, setSeguimiento] = useState<SeguimientoCursoRespuesta | null>(null);
  const [cargandoCurso, setCargandoCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const [columnaOrden, setColumnaOrden] = useState<ColumnaOrden>('nombre');
  const [direccionAsc, setDireccionAsc] = useState(true);

  const [estudianteSeleccionadoId, setEstudianteSeleccionadoId] = useState<string | null>(null);
  const [detalleEstudiante, setDetalleEstudiante] = useState<SeguimientoEstudianteRespuesta | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Carga inicial de cursos del docente
  useEffect(() => {
    let cancelado = false;
    setCargandoCursos(true);
    listarCursosDocente()
      .then((lista) => {
        if (cancelado) return;
        setCursos(lista);
        if (!courseId && lista.length > 0) {
          navigate(`/seguimiento/${lista[0].id}`, { replace: true });
        }
      })
      .catch((err: Error) => {
        if (!cancelado) setError(err.message || 'No se pudieron cargar tus cursos.');
      })
      .finally(() => {
        if (!cancelado) setCargandoCursos(false);
      });
    return () => {
      cancelado = true;
    };
  }, [courseId, navigate]);

  // Carga del seguimiento cuando cambia el curso o la página
  useEffect(() => {
    if (!courseId) return;
    let cancelado = false;
    setCargandoCurso(true);
    setError(null);
    obtenerSeguimientoCurso(courseId, pagina, 25)
      .then((res) => {
        if (!cancelado) setSeguimiento(res);
      })
      .catch((err: Error) => {
        if (!cancelado) setError(err.message || 'No se pudo cargar el seguimiento del curso.');
      })
      .finally(() => {
        if (!cancelado) setCargandoCurso(false);
      });
    return () => {
      cancelado = true;
    };
  }, [courseId, pagina]);

  // Carga del detalle de un estudiante al seleccionarlo
  useEffect(() => {
    if (!courseId || !estudianteSeleccionadoId) {
      setDetalleEstudiante(null);
      return;
    }
    let cancelado = false;
    setCargandoDetalle(true);
    obtenerSeguimientoEstudiante(courseId, estudianteSeleccionadoId)
      .then((res) => {
        if (!cancelado) setDetalleEstudiante(res);
      })
      .catch((err: Error) => {
        if (!cancelado) setError(err.message || 'No se pudo cargar el detalle del estudiante.');
      })
      .finally(() => {
        if (!cancelado) setCargandoDetalle(false);
      });
    return () => {
      cancelado = true;
    };
  }, [courseId, estudianteSeleccionadoId]);

  const alternarOrden = (columna: ColumnaOrden) => {
    if (columnaOrden === columna) {
      setDireccionAsc((prev) => !prev);
    } else {
      setColumnaOrden(columna);
      setDireccionAsc(columna === 'nombre');
    }
  };

  const estudiantesOrdenados = useMemo(() => {
    const lista = [...(seguimiento?.estudiantes || [])];
    const factor = direccionAsc ? 1 : -1;
    lista.sort((a: EstudianteSeguimiento, b: EstudianteSeguimiento) => {
      if (columnaOrden === 'nombre') {
        return a.nombre.localeCompare(b.nombre, 'es') * factor;
      }
      if (columnaOrden === 'consultas_completadas') {
        return (a.consultas_completadas - b.consultas_completadas) * factor;
      }
      if (columnaOrden === 'promedio') {
        const va = a.promedio ?? -1;
        const vb = b.promedio ?? -1;
        return (va - vb) * factor;
      }
      if (columnaOrden === 'ultimo_puntaje') {
        const va = a.ultimo_puntaje ?? -1;
        const vb = b.ultimo_puntaje ?? -1;
        return (va - vb) * factor;
      }
      const ta = a.fecha_ultima_consulta ? new Date(a.fecha_ultima_consulta).getTime() : 0;
      const tb = b.fecha_ultima_consulta ? new Date(b.fecha_ultima_consulta).getTime() : 0;
      return (ta - tb) * factor;
    });
    return lista;
  }, [seguimiento?.estudiantes, columnaOrden, direccionAsc]);

  const datosEvolucionGrafica = useMemo(() => {
    return (detalleEstudiante?.evolucion || []).map((item, idx) => ({
      ...item,
      etiquetaFecha: formatearFechaCorta(item.fecha, idx),
    }));
  }, [detalleEstudiante?.evolucion]);

  const cambiarCurso = (nuevoCourseId: string) => {
    setPagina(1);
    setEstudianteSeleccionadoId(null);
    navigate(`/seguimiento/${nuevoCourseId}`);
  };

  const enRiesgoCount = useMemo(
    () =>
      (seguimiento?.estudiantes || []).filter(
        (e) => e.promedio !== null && e.promedio < 60,
      ).length,
    [seguimiento?.estudiantes],
  );

  return (
    <div className="dash-root">
      <Sidebar />
      <main className="seguimiento-page">
        <div className="seguimiento-container">
          <header className="seguimiento-header">
          <div className="seguimiento-title-block">
            <h1>Seguimiento del Simulador Clínico</h1>
            <p>
              Desempeño por curso, promedio por subtema y evolución diagnóstica de tus estudiantes.
            </p>
          </div>

          {cursos.length > 0 && (
            <div className="seguimiento-course-selector">
              <label htmlFor="seguimiento-curso-select">Curso:</label>
              <select
                id="seguimiento-curso-select"
                className="seguimiento-select"
                value={courseId || ''}
                onChange={(e) => cambiarCurso(e.target.value)}
              >
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.academic_period ? `(${c.academic_period})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        {error && <div className="seguimiento-error">{error}</div>}

        {!cargandoCursos && cursos.length === 0 && (
          <div className="seguimiento-card seguimiento-empty">
            Aún no tienes cursos creados para consultar métricas del simulador.
          </div>
        )}

        {courseId && seguimiento && (
          <>
            {/* Tarjetas de resumen del curso */}
            <section className="seguimiento-kpis">
              <div className="seguimiento-kpi-card">
                <span className="seguimiento-kpi-label">Promedio general del curso</span>
                <span className="seguimiento-kpi-value">
                  {seguimiento.resumen.promedio_general !== null
                    ? `${seguimiento.resumen.promedio_general} pts`
                    : '—'}
                </span>
                <span className="seguimiento-kpi-sub">
                  Sobre {seguimiento.resumen.total_consultas} consultas completadas
                </span>
              </div>

              <div className="seguimiento-kpi-card">
                <span className="seguimiento-kpi-label">Estudiantes matriculados</span>
                <span className="seguimiento-kpi-value">{seguimiento.total}</span>
                <span className="seguimiento-kpi-sub">{seguimiento.curso_titulo}</span>
              </div>

              <div className="seguimiento-kpi-card">
                <span className="seguimiento-kpi-label">Alerta académica (&lt; 60 pts)</span>
                <span className="seguimiento-kpi-value">{enRiesgoCount}</span>
                <span className="seguimiento-kpi-sub">
                  Estudiantes en esta página con promedio menor a 60
                </span>
              </div>
            </section>

            {/* Gráfica de promedio por subtema */}
            <section className="seguimiento-card">
              <div className="seguimiento-card-header">
                <div>
                  <h2 className="seguimiento-card-title">Promedio por subtema clínico</h2>
                  <p className="seguimiento-card-subtitle">
                    Desempeño consolidado de los estudiantes del curso en cada área evaluada
                  </p>
                </div>
              </div>

              {seguimiento.resumen.promedio_por_subtema.length === 0 ? (
                <div className="seguimiento-empty">
                  Aún no hay consultas completadas con subtema evaluado en este curso.
                </div>
              ) : (
                <div className="seguimiento-chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={seguimiento.resumen.promedio_por_subtema}
                      margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" />
                      <XAxis
                        dataKey="subtema"
                        tick={{ fill: '#64748B', fontSize: 12 }}
                        interval={0}
                        angle={-12}
                        textAnchor="end"
                        height={54}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: '#64748B', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--surface-elevated)',
                          borderColor: 'var(--border-medium)',
                          borderRadius: '10px',
                          color: 'var(--text-primary)',
                        }}
                        formatter={(value) => [`${value} pts`, 'Promedio']}
                      />
                      <Bar
                        dataKey="promedio"
                        fill="#0284C7"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* Tabla ordenable de estudiantes */}
            <section className="seguimiento-card">
              <div className="seguimiento-card-header">
                <div>
                  <h2 className="seguimiento-card-title">
                    <Users size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                    Estudiantes del curso
                  </h2>
                  <p className="seguimiento-card-subtitle">
                    Haz clic en un estudiante para inspeccionar su evolución y desglose por dimensión. Las filas en ámbar indican promedio inferior a 60.
                  </p>
                </div>
              </div>

              {cargandoCurso ? (
                <div className="seguimiento-empty">Cargando estudiantes...</div>
              ) : estudiantesOrdenados.length === 0 ? (
                <div className="seguimiento-empty">
                  No hay estudiantes matriculados en este curso todavía.
                </div>
              ) : (
                <>
                  <div className="seguimiento-table-wrapper">
                    <table className="seguimiento-table">
                      <thead>
                        <tr>
                          <th>
                            <button
                              type="button"
                              className="seguimiento-sort-btn"
                              onClick={() => alternarOrden('nombre')}
                            >
                              Estudiante <ArrowUpDown size={13} />
                            </button>
                          </th>
                          <th>
                            <button
                              type="button"
                              className="seguimiento-sort-btn"
                              onClick={() => alternarOrden('consultas_completadas')}
                            >
                              Completadas <ArrowUpDown size={13} />
                            </button>
                          </th>
                          <th>
                            <button
                              type="button"
                              className="seguimiento-sort-btn"
                              onClick={() => alternarOrden('promedio')}
                            >
                              Promedio <ArrowUpDown size={13} />
                            </button>
                          </th>
                          <th>
                            <button
                              type="button"
                              className="seguimiento-sort-btn"
                              onClick={() => alternarOrden('ultimo_puntaje')}
                            >
                              Último puntaje <ArrowUpDown size={13} />
                            </button>
                          </th>
                          <th>
                            <button
                              type="button"
                              className="seguimiento-sort-btn"
                              onClick={() => alternarOrden('fecha_ultima_consulta')}
                            >
                              Última consulta <ArrowUpDown size={13} />
                            </button>
                          </th>
                          <th>Dimensión más débil</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estudiantesOrdenados.map((est) => {
                          const enAlerta = est.promedio !== null && est.promedio < 60;
                          const seleccionado = est.student_id === estudianteSeleccionadoId;
                          const clasesFila = [
                            enAlerta ? 'seguimiento-row-alerta' : '',
                            seleccionado ? 'seguimiento-row-selected' : '',
                          ]
                            .filter(Boolean)
                            .join(' ');

                          return (
                            <tr
                              key={est.student_id}
                              className={clasesFila}
                              onClick={() =>
                                setEstudianteSeleccionadoId((prev) =>
                                  prev === est.student_id ? null : est.student_id,
                                )
                              }
                            >
                              <td>
                                <div className="seguimiento-student-name">
                                  {est.nombre}
                                  {enAlerta && (
                                    <span
                                      className="seguimiento-badge seguimiento-badge--amber"
                                      title="Promedio inferior a 60"
                                    >
                                      <AlertTriangle size={12} /> &lt; 60
                                    </span>
                                  )}
                                </div>
                                <div className="seguimiento-student-email">{est.email}</div>
                              </td>
                              <td>{est.consultas_completadas}</td>
                              <td>
                                {est.promedio !== null ? (
                                  <span
                                    className={`seguimiento-badge ${
                                      enAlerta
                                        ? 'seguimiento-badge--amber'
                                        : 'seguimiento-badge--ok'
                                    }`}
                                  >
                                    {est.promedio} pts
                                  </span>
                                ) : (
                                  <span className="seguimiento-badge seguimiento-badge--neutral">
                                    Sin evaluar
                                  </span>
                                )}
                              </td>
                              <td>
                                {est.ultimo_puntaje !== null ? `${est.ultimo_puntaje} pts` : '—'}
                              </td>
                              <td>{formatearFecha(est.fecha_ultima_consulta)}</td>
                              <td>
                                {est.dimension_debil ? (
                                  <span>
                                    {est.dimension_debil.etiqueta}{' '}
                                    <strong>({est.dimension_debil.promedio} pts)</strong>
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {seguimiento.pages > 1 && (
                    <div className="seguimiento-pagination">
                      <span>
                        Página {seguimiento.page} de {seguimiento.pages} ({seguimiento.total}{' '}
                        estudiantes)
                      </span>
                      <div className="seguimiento-pagination-controls">
                        <button
                          type="button"
                          className="seguimiento-btn"
                          disabled={pagina <= 1}
                          onClick={() => setPagina((p) => Math.max(1, p - 1))}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          className="seguimiento-btn"
                          disabled={pagina >= seguimiento.pages}
                          onClick={() => setPagina((p) => p + 1)}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Panel de detalle del estudiante seleccionado */}
            {estudianteSeleccionadoId && (
              <section className="seguimiento-card">
                <div className="seguimiento-card-header">
                  <div>
                    <h2 className="seguimiento-card-title">
                      <TrendingUp size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                      {detalleEstudiante
                        ? `Evolución de ${detalleEstudiante.estudiante.nombre}`
                        : 'Cargando evolución del estudiante...'}
                    </h2>
                    {detalleEstudiante && (
                      <p className="seguimiento-card-subtitle">
                        {detalleEstudiante.estudiante.consultas_completadas} consultas completadas ·
                        Promedio:{' '}
                        {detalleEstudiante.estudiante.promedio !== null
                          ? `${detalleEstudiante.estudiante.promedio} pts`
                          : 'Sin puntaje'}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="seguimiento-btn"
                    onClick={() => setEstudianteSeleccionadoId(null)}
                    aria-label="Cerrar detalle del estudiante"
                  >
                    <X size={15} style={{ verticalAlign: 'text-bottom' }} /> Cerrar
                  </button>
                </div>

                {cargandoDetalle && (
                  <div className="seguimiento-empty">Cargando historial del estudiante...</div>
                )}

                {!cargandoDetalle && detalleEstudiante && (
                  <>
                    <div className="seguimiento-detail-grid">
                      {/* Gráfica de línea de evolución */}
                      <div>
                        <h3 className="seguimiento-card-title" style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                          Evolución de puntajes en el tiempo
                        </h3>
                        {datosEvolucionGrafica.length === 0 ? (
                          <div className="seguimiento-empty">
                            El estudiante aún no tiene consultas completadas en este curso.
                          </div>
                        ) : (
                          <div className="seguimiento-chart-box">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={datosEvolucionGrafica}
                                margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" />
                                <XAxis
                                  dataKey="etiquetaFecha"
                                  tick={{ fill: '#64748B', fontSize: 12 }}
                                />
                                <YAxis
                                  domain={[0, 100]}
                                  tick={{ fill: '#64748B', fontSize: 12 }}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: 'var(--surface-elevated)',
                                    borderColor: 'var(--border-medium)',
                                    borderRadius: '10px',
                                    color: 'var(--text-primary)',
                                  }}
                                  formatter={(value) => [`${value} pts`, 'Puntaje']}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="puntaje"
                                  stroke="#0284C7"
                                  strokeWidth={2.5}
                                  dot={{ r: 4, fill: '#0284C7' }}
                                  activeDot={{ r: 6 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>

                      {/* Desglose promedio por dimensión */}
                      <div>
                        <h3 className="seguimiento-card-title" style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                          Detalle por dimensión clínica
                        </h3>
                        {detalleEstudiante.estudiante.dimensiones.length === 0 ? (
                          <div className="seguimiento-empty">
                            Sin desglose por dimensión registrado.
                          </div>
                        ) : (
                          <div className="seguimiento-dimension-list">
                            {detalleEstudiante.estudiante.dimensiones.map((dim) => {
                              const bajo = dim.promedio < 60;
                              return (
                                <div key={dim.dimension} className="seguimiento-dimension-item">
                                  <div className="seguimiento-dimension-row">
                                    <span>{dim.etiqueta}</span>
                                    <strong>{dim.promedio} pts</strong>
                                  </div>
                                  <div className="seguimiento-dimension-bar-bg">
                                    <div
                                      className={`seguimiento-dimension-bar-fill ${
                                        bajo ? 'seguimiento-dimension-bar-fill--amber' : ''
                                      }`}
                                      style={{ width: `${Math.min(100, Math.max(0, dim.promedio))}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Listado de consultas completadas del estudiante */}
                    {detalleEstudiante.consultas.length > 0 && (
                      <div className="seguimiento-consultas-list">
                        <h3 className="seguimiento-card-title" style={{ fontSize: '0.95rem' }}>
                          Consultas completadas ({detalleEstudiante.consultas.length})
                        </h3>
                        {detalleEstudiante.consultas.map((c) => (
                          <div key={c.consultation_id} className="seguimiento-consulta-item">
                            <div className="seguimiento-consulta-top">
                              <div>
                                <strong>{c.subtema || 'Subtema general'}</strong>
                                <span
                                  style={{
                                    marginLeft: '0.6rem',
                                    fontSize: '0.82rem',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  <Calendar
                                    size={13}
                                    style={{ verticalAlign: 'text-bottom', marginRight: 3 }}
                                  />
                                  {formatearFecha(c.fecha)} ·{' '}
                                  {ETIQUETA_DIFICULTAD[c.dificultad] || c.dificultad}
                                </span>
                              </div>
                              <span
                                className={`seguimiento-badge ${
                                  c.puntaje !== null && c.puntaje < 60
                                    ? 'seguimiento-badge--amber'
                                    : 'seguimiento-badge--ok'
                                }`}
                              >
                                {c.puntaje !== null ? `${c.puntaje} pts` : '—'}
                              </span>
                            </div>
                            {c.desglose.length > 0 && (
                              <div className="seguimiento-consulta-Chips">
                                {c.desglose.map((d) => (
                                  <span
                                    key={d.dimension}
                                    className="seguimiento-badge seguimiento-badge--neutral"
                                  >
                                    {d.etiqueta}: {d.puntaje}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}
        </div>
      </main>
    </div>
  );
};

export default SeguimientoPage;
