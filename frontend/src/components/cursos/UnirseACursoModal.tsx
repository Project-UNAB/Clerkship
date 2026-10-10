import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { listAllCourses, enrollInCourse, type Course } from '../../data/consultasApi';
import { misSolicitudes, type SolicitudMatricula } from '../../data/cursosApi';

interface Props {
  /** Ids de los cursos en los que el estudiante ya está. */
  misCursosIds: string[];
  onClose: () => void;
  /** Se llama cuando el estudiante quedó matriculado en un curso. */
  onMatriculado: () => void;
}

/** El estudiante entra a un curso: con el código del docente, pidiendo
 *  aprobación o directo, según cómo lo haya configurado el docente. */
export default function UnirseACursoModal({ misCursosIds, onClose, onMatriculado }: Props) {
  const [cursos, setCursos] = useState<Course[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudMatricula[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cursoId, setCursoId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listAllCourses(), misSolicitudes()])
      .then(([todos, s]) => {
        setCursos(todos);
        setSolicitudes(s.solicitudes);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudieron cargar los cursos.'))
      .finally(() => setCargando(false));
  }, []);

  const disponibles = useMemo(() => cursos.filter(c => !misCursosIds.includes(c.id)), [cursos, misCursosIds]);
  const curso = disponibles.find(c => c.id === cursoId);
  const modo = curso?.enrollment_mode || 'CODE';
  const solicitud = solicitudes.find(s => s.course_id === cursoId);
  const pendiente = solicitud?.status === 'PENDING';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!curso) {
      setError('Elige un curso.');
      return;
    }
    if (modo === 'CODE' && !codigo.trim()) {
      setError('Escribe el código que te dio tu docente.');
      return;
    }
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await enrollInCourse(curso.id, modo === 'CODE' ? codigo.trim() : undefined);
      if (res.status === 'PENDING') {
        setAviso(res.message);
        setSolicitudes((await misSolicitudes()).solicitudes);
      } else {
        onMatriculado();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la matrícula.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="cur-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="cur-modal" onSubmit={handleSubmit}>
        <div className="cur-modal-head">
          <span>Unirme a un curso</span>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>

        {cargando ? (
          <p className="cur-vacio">Cargando…</p>
        ) : disponibles.length === 0 ? (
          <p className="cur-vacio">No hay otros cursos disponibles por ahora.</p>
        ) : (
          <>
            <label className="cur-label" htmlFor="cur-unirse-curso">Curso</label>
            <select
              id="cur-unirse-curso"
              className="cur-input"
              value={cursoId}
              onChange={e => { setCursoId(e.target.value); setError(null); setAviso(null); }}
            >
              <option value="">Elige un curso…</option>
              {disponibles.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.academic_period ? ` (${c.academic_period})` : ''}</option>
              ))}
            </select>

            {curso && modo === 'CODE' && (
              <>
                <label className="cur-label" htmlFor="cur-unirse-codigo">Código de matrícula</label>
                <input
                  id="cur-unirse-codigo"
                  className="cur-input"
                  value={codigo}
                  onChange={e => setCodigo(e.target.value.toUpperCase())}
                  placeholder="Ej. K7MQ2XWP"
                  maxLength={32}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="cur-card-sub">Te lo da el docente del curso.</p>
              </>
            )}
            {curso && modo === 'APPROVAL' && (
              <p className="cur-card-sub">
                {pendiente
                  ? 'Ya enviaste una solicitud a este curso. El docente todavía no la ha resuelto.'
                  : solicitud?.status === 'REJECTED'
                    ? 'El docente rechazó tu solicitud anterior. Puedes volver a enviarla.'
                    : 'Este curso pide aprobación: el docente decide si entras.'}
              </p>
            )}
            {curso && modo === 'OPEN' && <p className="cur-card-sub">Este curso es de matrícula abierta.</p>}

            {aviso && <p className="cur-card-sub">{aviso}</p>}
            {error && <p className="cur-error">{error}</p>}

            <button type="submit" className="cur-btn" disabled={enviando || !curso || (modo === 'APPROVAL' && pendiente)}>
              {enviando ? 'Enviando…' : modo === 'APPROVAL' ? 'Solicitar matrícula' : 'Unirme'}
            </button>
          </>
        )}
        {!cargando && disponibles.length === 0 && error && <p className="cur-error">{error}</p>}
      </form>
    </div>
  );
}
