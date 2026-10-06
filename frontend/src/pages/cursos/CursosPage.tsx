import { useEffect, useState } from 'react';
import { Plus, Users, Trash2, X, GraduationCap } from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import FeedbackFab from '../../components/shared/FeedbackFab';
import { useCurrentUser } from '../../utils/currentUser';
import { listMyCourses, type Course } from '../../data/consultasApi';
import { crearCurso, borrarCurso, listarEstudiantesDeCurso, type EstudianteDeCurso } from '../../data/cursosApi';
import { mainAuthErrorMessage } from '../../data/mainAuth';
import '../../styles/cursos.css';

export default function CursosPage() {
  const user = useCurrentUser();
  const [cursos, setCursos] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seleccionado, setSeleccionado] = useState<Course | null>(null);
  const [estudiantes, setEstudiantes] = useState<EstudianteDeCurso[]>([]);
  const [cargandoRoster, setCargandoRoster] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  function cargarCursos() {
    setLoading(true);
    setError(null);
    listMyCourses()
      .then(setCursos)
      .catch(err => setError(mainAuthErrorMessage(err)))
      .finally(() => setLoading(false));
  }
  useEffect(cargarCursos, []);

  function verRoster(curso: Course) {
    setSeleccionado(curso);
    setCargandoRoster(true);
    listarEstudiantesDeCurso(curso.id)
      .then(r => setEstudiantes(r.estudiantes))
      .catch(err => setError(mainAuthErrorMessage(err)))
      .finally(() => setCargandoRoster(false));
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorModal('Ponle un nombre al curso.');
      return;
    }
    setGuardando(true);
    setErrorModal(null);
    try {
      const curso = await crearCurso({
        name: nombre.trim(),
        description: descripcion.trim() || undefined,
        academic_period: periodo.trim() || undefined,
      });
      setCursos(prev => [curso, ...prev]);
      setModalAbierto(false);
      setNombre(''); setDescripcion(''); setPeriodo('');
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : 'No se pudo crear el curso.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleBorrar(curso: Course) {
    if (!window.confirm(`¿Borrar "${curso.name}"? Si ya tiene sesiones de simulación, no se va a poder.`)) return;
    try {
      await borrarCurso(curso.id);
      setCursos(prev => prev.filter(c => c.id !== curso.id));
      if (seleccionado?.id === curso.id) setSeleccionado(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar el curso.');
    }
  }

  // Esta pantalla es solo para docentes — un estudiante no tiene nada que hacer acá.
  if (user && user.role !== 'Docente · Preceptor') {
    return (
      <div className="dash-root">
        <Sidebar />
        <div className="cur-wrapper">
          <p className="cur-vacio">Esta pantalla es solo para docentes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-root">
      <Sidebar />
      <FeedbackFab pestana="inicio" />

      <div className="cur-wrapper">
        <header className="cur-header">
          <div>
            <h1 className="cur-title"><GraduationCap size={22} /> Mis cursos</h1>
            <p className="cur-subtitle">Crea cursos para tus estudiantes y revisa quién se ha matriculado.</p>
          </div>
          <button type="button" className="cur-btn" onClick={() => setModalAbierto(true)}>
            <Plus size={16} /> Nuevo curso
          </button>
        </header>

        {error && <p className="cur-error">{error}</p>}

        <div className="cur-layout">
          <div className="cur-lista">
            {loading ? (
              <p className="cur-vacio">Cargando…</p>
            ) : cursos.length === 0 ? (
              <p className="cur-vacio">Todavía no creaste ningún curso.</p>
            ) : (
              cursos.map(c => (
                <div key={c.id} className={`cur-card ${seleccionado?.id === c.id ? 'is-active' : ''}`} onClick={() => verRoster(c)}>
                  <div>
                    <p className="cur-card-nombre">{c.name}</p>
                    <p className="cur-card-sub">{c.academic_period || 'Sin período'}</p>
                  </div>
                  <button type="button" className="cur-icon-btn" title="Borrar curso" onClick={e => { e.stopPropagation(); handleBorrar(c); }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="cur-roster">
            {!seleccionado ? (
              <p className="cur-vacio">Elegí un curso para ver sus estudiantes.</p>
            ) : (
              <>
                <h2 className="cur-roster-titulo"><Users size={16} /> {seleccionado.name}</h2>
                {cargandoRoster ? (
                  <p className="cur-vacio">Cargando…</p>
                ) : estudiantes.length === 0 ? (
                  <p className="cur-vacio">Todavía no hay estudiantes matriculados. Se matriculan solos al iniciar su primera simulación.</p>
                ) : (
                  <div className="cur-tabla-wrap">
                    <table className="cur-tabla">
                      <thead><tr><th>Nombre</th><th>Correo</th><th>Código</th><th>Completados</th><th>En progreso</th></tr></thead>
                      <tbody>
                        {estudiantes.map(e => (
                          <tr key={e.user_id}>
                            <td>{e.nombre}</td>
                            <td>{e.email}</td>
                            <td>{e.student_code}</td>
                            <td>{e.casos_completados}</td>
                            <td>{e.casos_en_progreso}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {modalAbierto && (
        <div className="cur-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModalAbierto(false); }}>
          <form className="cur-modal" onSubmit={handleCrear}>
            <div className="cur-modal-head">
              <span>Nuevo curso</span>
              <button type="button" onClick={() => setModalAbierto(false)}><X size={16} /></button>
            </div>
            <label className="cur-label">Nombre *</label>
            <input className="cur-input" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus maxLength={150} />
            <label className="cur-label">Descripción (opcional)</label>
            <textarea className="cur-input" rows={3} value={descripcion} onChange={e => setDescripcion(e.target.value)} maxLength={500} />
            <label className="cur-label">Período académico (opcional)</label>
            <input className="cur-input" placeholder="2026-2" value={periodo} onChange={e => setPeriodo(e.target.value)} maxLength={20} />
            {errorModal && <p className="cur-error">{errorModal}</p>}
            <button type="submit" className="cur-btn" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear curso'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
