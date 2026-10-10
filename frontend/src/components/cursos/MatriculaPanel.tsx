import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw, ShieldOff, X } from 'lucide-react';
import type { EnrollmentMode } from '../../data/consultasApi';
import {
  obtenerMatricula, actualizarModoMatricula, regenerarCodigoMatricula, desactivarCodigoMatricula,
  listarSolicitudesDeCurso, resolverSolicitud,
  type MatriculaConfig, type SolicitudMatricula,
} from '../../data/cursosApi';

const MODOS: { valor: EnrollmentMode; nombre: string; ayuda: string }[] = [
  { valor: 'CODE', nombre: 'Con código', ayuda: 'Solo entra quien tenga el código del curso.' },
  { valor: 'APPROVAL', nombre: 'Con aprobación', ayuda: 'El estudiante pide entrar y tú lo apruebas o rechazas.' },
  { valor: 'OPEN', nombre: 'Abierta', ayuda: 'Cualquier estudiante de la plataforma puede entrar.' },
];

interface Props {
  courseId: string;
  /** Se llama cuando una solicitud aprobada suma un estudiante al curso. */
  onEstudianteAprobado?: () => void;
}

/** Cómo entran los estudiantes al curso: modo de matrícula, código y
 *  solicitudes pendientes. Solo lo ve el docente dueño. */
export default function MatriculaPanel({ courseId, onEstudianteAprobado }: Props) {
  const [config, setConfig] = useState<MatriculaConfig | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudMatricula[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vigente = true;
    setConfig(null);
    setSolicitudes([]);
    setError(null);
    Promise.all([obtenerMatricula(courseId), listarSolicitudesDeCurso(courseId)])
      .then(([c, s]) => {
        if (!vigente) return;
        setConfig(c);
        setSolicitudes(s.solicitudes);
      })
      .catch(err => { if (vigente) setError(err instanceof Error ? err.message : 'No se pudo cargar la matrícula.'); });
    return () => { vigente = false; };
  }, [courseId]);

  async function ejecutar(accion: () => Promise<MatriculaConfig>) {
    setOcupado(true);
    setError(null);
    try {
      setConfig(await accion());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio.');
    } finally {
      setOcupado(false);
    }
  }

  function handleRegenerar() {
    if (config?.enrollment_code && !window.confirm('¿Generar un código nuevo? El actual deja de servir de inmediato.')) return;
    ejecutar(() => regenerarCodigoMatricula(courseId));
  }

  function handleDesactivar() {
    if (!window.confirm('¿Desactivar el código? Nadie podrá entrar con código hasta que generes uno nuevo.')) return;
    ejecutar(() => desactivarCodigoMatricula(courseId));
  }

  async function handleCopiar() {
    if (!config?.enrollment_code) return;
    try {
      await navigator.clipboard.writeText(config.enrollment_code);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      setError('No se pudo copiar. Selecciona el código y cópialo a mano.');
    }
  }

  async function handleResolver(solicitud: SolicitudMatricula, aprobar: boolean) {
    setOcupado(true);
    setError(null);
    try {
      await resolverSolicitud(courseId, solicitud.id, aprobar);
      setSolicitudes(prev => prev.filter(s => s.id !== solicitud.id));
      if (aprobar) onEstudianteAprobado?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo resolver la solicitud.');
    } finally {
      setOcupado(false);
    }
  }

  if (!config) {
    return <div className="cur-matricula">{error ? <p className="cur-error">{error}</p> : <p className="cur-card-sub">Cargando matrícula…</p>}</div>;
  }

  const modo = MODOS.find(m => m.valor === config.enrollment_mode) || MODOS[0];

  return (
    <div className="cur-matricula">
      <div className="cur-matricula-fila">
        <label className="cur-label" htmlFor="cur-modo-matricula"><KeyRound size={14} /> Matrícula</label>
        <select
          id="cur-modo-matricula"
          className="cur-input"
          value={config.enrollment_mode}
          disabled={ocupado}
          onChange={e => ejecutar(() => actualizarModoMatricula(courseId, e.target.value as EnrollmentMode))}
        >
          {MODOS.map(m => <option key={m.valor} value={m.valor}>{m.nombre}</option>)}
        </select>
      </div>
      <p className="cur-card-sub">{modo.ayuda}</p>

      {config.enrollment_mode === 'CODE' && (
        <div className="cur-matricula-fila">
          {config.enrollment_code ? (
            <code className="cur-codigo">{config.enrollment_code}</code>
          ) : (
            <span className="cur-card-sub">Código desactivado: nadie puede entrar por su cuenta.</span>
          )}
          {config.enrollment_code && (
            <button type="button" className="cur-icon-btn" title="Copiar código" onClick={handleCopiar}>
              {copiado ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
          <button type="button" className="cur-btn cur-btn-sm" disabled={ocupado} onClick={handleRegenerar}>
            <RefreshCw size={14} /> {config.enrollment_code ? 'Regenerar' : 'Generar código'}
          </button>
          {config.enrollment_code && (
            <button type="button" className="cur-icon-btn" title="Desactivar código" disabled={ocupado} onClick={handleDesactivar}>
              <ShieldOff size={14} />
            </button>
          )}
        </div>
      )}

      {solicitudes.length > 0 && (
        <div className="cur-solicitudes">
          <p className="cur-label">Solicitudes pendientes ({solicitudes.length})</p>
          {solicitudes.map(s => (
            <div key={s.id} className="cur-solicitud">
              <div>
                <p className="cur-card-nombre">{s.student_name || 'Estudiante'}</p>
                <p className="cur-card-sub">{s.student_email}</p>
              </div>
              <div className="cur-card-btns">
                <button type="button" className="cur-icon-btn" title="Aprobar" disabled={ocupado} onClick={() => handleResolver(s, true)}>
                  <Check size={14} />
                </button>
                <button type="button" className="cur-icon-btn" title="Rechazar" disabled={ocupado} onClick={() => handleResolver(s, false)}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="cur-error">{error}</p>}
    </div>
  );
}
