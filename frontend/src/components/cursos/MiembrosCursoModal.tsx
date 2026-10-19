import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { listarMiembrosDeCurso, type MiembrosDeCurso } from '../../data/cursosApi';

interface Props {
  courseId: string;
  onClose: () => void;
}

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Quiénes están en el curso: el docente y los estudiantes matriculados.
 * Los compañeros se ven por nombre; el correo de los estudiantes solo le
 * llega al docente del curso. */
export default function MiembrosCursoModal({ courseId, onClose }: Props) {
  const [datos, setDatos] = useState<MiembrosDeCurso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    let vigente = true;
    listarMiembrosDeCurso(courseId)
      .then(res => { if (vigente) setDatos(res); })
      .catch(err => { if (vigente) setError(err?.message || 'No se pudieron cargar los miembros del curso.'); });
    return () => { vigente = false; };
  }, [courseId]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onClose]);

  const estudiantes = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const todos = datos?.estudiantes ?? [];
    return texto ? todos.filter(e => e.nombre.toLowerCase().includes(texto)) : todos;
  }, [datos, busqueda]);

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div
        className="ccv-modal ccv-modal-form"
        role="dialog"
        aria-modal="true"
        aria-label="Miembros del curso"
        onClick={e => e.stopPropagation()}
      >
        <div className="ccv-modal-header">
          <h3>Miembros del curso{datos ? ` (${datos.total + (datos.docente ? 1 : 0)})` : ''}</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-form-body">
          {error && <p className="ccv-form-error" role="alert">{error}</p>}
          {!datos && !error && (
            <p className="cdl-miembros-vacio"><Loader2 size={16} className="dfm-spin" /> Cargando…</p>
          )}

          {datos && (
            <>
              {datos.docente && (
                <>
                  <p className="cdl-miembros-grupo">Docente</p>
                  <ul className="cdl-miembros">
                    <li>
                      <span className="cdl-miembro-avatar is-docente" aria-hidden="true">{iniciales(datos.docente.nombre)}</span>
                      <span className="cdl-miembro-texto">
                        <span className="cdl-miembro-nombre">{datos.docente.nombre}</span>
                        {datos.docente.email && (
                          <a className="cdl-miembro-mail" href={`mailto:${datos.docente.email}`}>{datos.docente.email}</a>
                        )}
                      </span>
                    </li>
                  </ul>
                </>
              )}

              <p className="cdl-miembros-grupo">Estudiantes ({datos.total})</p>
              {datos.total > 8 && (
                <div className="cdl-miembros-buscar">
                  <Search size={14} />
                  <input
                    type="search"
                    placeholder="Buscar por nombre"
                    aria-label="Buscar estudiante por nombre"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                  />
                </div>
              )}
              {datos.total === 0 ? (
                <p className="cdl-miembros-vacio">Todavía no hay estudiantes matriculados.</p>
              ) : estudiantes.length === 0 ? (
                <p className="cdl-miembros-vacio">Ningún estudiante coincide con la búsqueda.</p>
              ) : (
                <ul className="cdl-miembros">
                  {estudiantes.map(e => (
                    <li key={e.user_id}>
                      <span className="cdl-miembro-avatar" aria-hidden="true">{iniciales(e.nombre)}</span>
                      <span className="cdl-miembro-texto">
                        <span className="cdl-miembro-nombre">{e.nombre}</span>
                        {e.email && <a className="cdl-miembro-mail" href={`mailto:${e.email}`}>{e.email}</a>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {datos.estudiantes.length < datos.total && (
                <p className="ccv-form-hint">Se muestran los primeros {datos.estudiantes.length} de {datos.total}.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
