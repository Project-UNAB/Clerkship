/**
 * Informe completo de una consulta simulada (/historial/:id).
 *
 * Lo ven el estudiante dueño, el docente del curso y quienes recibieron el
 * informe compartido. Todos pueden dejar notas por sección; las notas se
 * actualizan solas cada pocos segundos, así que el estudiante y el docente
 * ven lo mismo a la vez. El dueño lo comparte; el docente califica los casos
 * asignados. Se descarga en PDF o en Word.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Download, Share2, MessageSquare, FileText, Stethoscope, ClipboardList, Activity,
  CheckCircle2, XCircle, Eye, TrendingUp, Award, Info, Loader2, Send, Trash2, Link2, Copy, X,
  Users, GraduationCap, ChevronDown, Search, Radio, BookOpen, Calendar, Layers,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import { getStoredUser } from '../../data/mainAuth';
import {
  obtenerInforme, listarComentariosInforme, crearComentarioInforme, borrarComentarioInforme,
  estadoCompartir, compartirInforme, dejarDeCompartir, crearEnlaceInforme, quitarEnlaceInforme,
  descargarInforme, calificarCaso, urlEnlaceInforme,
  type Informe, type ComentarioInforme, type SeccionInforme, type EstadoCompartir,
} from '../../data/informesApi';
import '../../styles/informe.css';

const SECCIONES: { id: SeccionInforme; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'cierre', label: 'Cierre del estudiante' },
  { id: 'anamnesis', label: 'Anamnesis' },
  { id: 'diagnostico', label: 'Diagnóstico' },
  { id: 'evaluacion', label: 'Evaluación' },
  { id: 'conversacion', label: 'Conversación' },
];
const NOMBRE_SECCION = Object.fromEntries(SECCIONES.map(s => [s.id, s.label])) as Record<SeccionInforme, string>;

const NIVEL: Record<string, { txt: string; tono: 'verde' | 'azul' | 'ambar' | 'rojo' }> = {
  alta: { txt: 'Concordancia alta', tono: 'verde' }, media: { txt: 'Concordancia media', tono: 'azul' },
  baja: { txt: 'Concordancia baja', tono: 'ambar' }, nula: { txt: 'Sin concordancia', tono: 'rojo' },
  completa: { txt: 'Completa', tono: 'verde' }, adecuada: { txt: 'Adecuada', tono: 'azul' },
  incompleta: { txt: 'Incompleta', tono: 'ambar' }, ausente: { txt: 'Ausente', tono: 'rojo' },
  adecuado: { txt: 'Adecuado', tono: 'verde' }, parcial: { txt: 'Parcial', tono: 'ambar' },
  inadecuado: { txt: 'Inadecuado', tono: 'rojo' },
  excelente: { txt: 'Excelente', tono: 'verde' }, mejorable: { txt: 'Mejorable', tono: 'ambar' },
  deficiente: { txt: 'Deficiente', tono: 'rojo' },
};
const DIFICULTAD: Record<string, string> = { EASY: 'Básica', MEDIUM: 'Intermedia', HARD: 'Avanzada' };
const INTERVALO_NOTAS_MS = 5000;

function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function haceCuanto(iso: string | null): string {
  if (!iso) return '';
  const seg = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return 'hace un momento';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function tonoPuntaje(p: number): string {
  return p >= 80 ? 'verde' : p >= 60 ? 'azul' : p >= 40 ? 'ambar' : 'rojo';
}

/* ── Anillo del puntaje ── */
function AnilloPuntaje({ valor }: { valor: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className={`inf-anillo is-${tonoPuntaje(v)}`} role="img" aria-label={`Puntaje ${Math.round(v)} de 100`}>
      <svg viewBox="0 0 128 128" width="128" height="128">
        <circle cx="64" cy="64" r={r} className="inf-anillo-fondo" />
        <motion.circle
          cx="64" cy="64" r={r} className="inf-anillo-valor"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v / 100) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="inf-anillo-texto"><strong>{Math.round(v)}</strong><span>/ 100</span></div>
    </div>
  );
}

function Nivel({ nivel }: { nivel?: string | null }) {
  if (!nivel) return null;
  const n = NIVEL[nivel] ?? { txt: nivel, tono: 'azul' as const };
  return <span className={`inf-nivel is-${n.tono}`}>{n.txt}</span>;
}

/* ── Sección del informe con su botón de nota ── */
function Seccion({ id, titulo, icono, notas, onNota, children }: {
  id: SeccionInforme; titulo: string; icono: ReactNode; notas: number; onNota: (s: SeccionInforme) => void; children: ReactNode;
}) {
  return (
    <section className="inf-seccion" id={`sec-${id}`}>
      <header className="inf-seccion-cab">
        <h2>{icono}{titulo}</h2>
        <button type="button" className="inf-btn-nota" onClick={() => onNota(id)}>
          <MessageSquare size={14} /> {notas > 0 ? `${notas} ${notas === 1 ? 'nota' : 'notas'}` : 'Agregar nota'}
        </button>
      </header>
      {children}
    </section>
  );
}

function Chips({ elementos, tipo, vacio }: { elementos: string[]; tipo: 'si' | 'no'; vacio: string }) {
  if (!elementos.length) return <p className="inf-vacio">{vacio}</p>;
  return (
    <ul className="inf-chips">
      {elementos.map((e, i) => (
        <li key={i} className={`inf-chip is-${tipo}`}>
          {tipo === 'si' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{e}
        </li>
      ))}
    </ul>
  );
}

/* ── Panel de notas (se actualiza solo) ── */
function PanelNotas({ consultaId, comentarios, setComentarios, seccion, setSeccion, miId, enfocar }: {
  consultaId: string; comentarios: ComentarioInforme[]; setComentarios: (c: ComentarioInforme[]) => void;
  seccion: SeccionInforme; setSeccion: (s: SeccionInforme) => void; miId: string | null; enfocar: number;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<SeccionInforme | 'todas'>('todas');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (enfocar) areaRef.current?.focus(); }, [enfocar]);
  // Solo se desplaza la lista de notas, nunca la página.
  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [comentarios.length]);

  const visibles = filtro === 'todas' ? comentarios : comentarios.filter(c => c.section === filtro);

  async function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const nuevo = await crearComentarioInforme(consultaId, cuerpo, seccion);
      setComentarios([...comentarios, nuevo]);
      setTexto('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la nota.');
    } finally {
      setEnviando(false);
    }
  }

  async function borrar(id: string) {
    try {
      await borrarComentarioInforme(consultaId, id);
      setComentarios(comentarios.filter(c => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar la nota.');
    }
  }

  return (
    <aside className="inf-notas" aria-label="Notas del informe">
      <header className="inf-notas-cab">
        <h3><MessageSquare size={16} /> Notas</h3>
        <span className="inf-vivo" title="Las notas se actualizan solas"><Radio size={12} /> En vivo</span>
      </header>
      <div className="inf-notas-filtro">
        <select value={filtro} onChange={e => setFiltro(e.target.value as SeccionInforme | 'todas')} aria-label="Filtrar notas por sección">
          <option value="todas">Todas las secciones ({comentarios.length})</option>
          {SECCIONES.map(s => (
            <option key={s.id} value={s.id}>{s.label} ({comentarios.filter(c => c.section === s.id).length})</option>
          ))}
        </select>
      </div>
      <div className="inf-notas-lista" ref={listaRef}>
        {visibles.length === 0 && (
          <p className="inf-notas-vacio">
            Todavía no hay notas{filtro !== 'todas' ? ' en esta sección' : ''}. El docente y el estudiante ven aquí las mismas notas al mismo tiempo.
          </p>
        )}
        {visibles.map(c => (
          <motion.div key={c.id} className={`inf-nota${c.autor?.role === 'TEACHER' ? ' is-docente' : ''}`}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inf-nota-cab">
              <span className="inf-nota-autor">
                {c.autor?.role === 'TEACHER' ? <GraduationCap size={13} /> : <Users size={13} />}
                {c.autor?.nombre || 'Usuario'}
                {c.autor?.role === 'TEACHER' && <em>Docente</em>}
              </span>
              <span className="inf-nota-meta">{NOMBRE_SECCION[c.section] ?? c.section} · {haceCuanto(c.created_at)}</span>
            </div>
            <p className="inf-nota-texto">{c.body}</p>
            {miId && c.author_id === miId && (
              <button type="button" className="inf-nota-borrar" onClick={() => borrar(c.id)} aria-label="Borrar mi nota">
                <Trash2 size={13} />
              </button>
            )}
          </motion.div>
        ))}
      </div>
      <div className="inf-notas-form">
        <label className="inf-notas-sec">
          Sobre
          <select value={seccion} onChange={e => setSeccion(e.target.value as SeccionInforme)}>
            {SECCIONES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <textarea
          ref={areaRef} rows={3} maxLength={2000} value={texto} placeholder="Escribe una nota o una observación..."
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } }}
        />
        {error && <p className="inf-error">{error}</p>}
        <button type="button" className="inf-btn-primario" disabled={!texto.trim() || enviando} onClick={enviar}>
          {enviando ? <Loader2 size={15} className="sim-spin" /> : <Send size={15} />} Publicar nota
        </button>
      </div>
    </aside>
  );
}

/* ── Compartir ── */
function ModalCompartir({ consultaId, onClose }: { consultaId: string; onClose: () => void }) {
  const [estado, setEstado] = useState<EstadoCompartir | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    estadoCompartir(consultaId).then(setEstado).catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar.'));
  }, [consultaId]);

  const yaCompartido = new Set((estado?.compartido_con ?? []).map(u => u.id));
  const candidatos = (estado?.candidatos ?? []).filter(c => !yaCompartido.has(c.id)
    && c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  async function accion(fn: () => Promise<EstadoCompartir>) {
    setTrabajando(true);
    setError(null);
    try {
      const nuevo = await fn();
      setEstado(prev => ({ ...nuevo, candidatos: prev?.candidatos }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.');
    } finally {
      setTrabajando(false);
    }
  }

  async function copiar(url: string) {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ }
  }

  return (
    <div className="inf-modal-fondo" onClick={onClose}>
      <motion.div className="inf-modal" role="dialog" aria-modal="true" aria-label="Compartir el informe"
        initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} onClick={e => e.stopPropagation()}>
        <header className="inf-modal-cab">
          <h3><Share2 size={18} /> Compartir el informe</h3>
          <button type="button" className="inf-icono-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>
        {!estado && !error && <div className="inf-cargando"><Loader2 size={22} className="sim-spin" /></div>}
        {error && <p className="inf-error">{error}</p>}
        {estado && (
          <div className="inf-modal-cuerpo">
            <section>
              <h4>Con compañeros y docentes de tus cursos</h4>
              <div className="inf-buscar">
                <Search size={15} />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre" />
              </div>
              <ul className="inf-candidatos">
                {candidatos.length === 0 && <li className="inf-vacio">No hay más personas para elegir.</li>}
                {candidatos.map(c => (
                  <li key={c.id}>
                    <label>
                      <input type="checkbox" checked={elegidos.includes(c.id)}
                        onChange={e => setElegidos(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id))} />
                      <span className="inf-cand-nombre">{c.nombre}</span>
                      <span className={`inf-rol is-${c.role === 'TEACHER' ? 'docente' : 'estudiante'}`}>{c.role === 'TEACHER' ? 'Docente' : 'Compañero'}</span>
                      {c.cursos?.length ? <span className="inf-cand-curso">{c.cursos.join(' · ')}</span> : null}
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" className="inf-btn-primario" disabled={!elegidos.length || trabajando}
                onClick={() => accion(() => compartirInforme(consultaId, elegidos)).then(() => setElegidos([]))}>
                <Share2 size={15} /> Compartir con {elegidos.length || ''} {elegidos.length === 1 ? 'persona' : 'personas'}
              </button>
              {estado.compartido_con.length > 0 && (
                <>
                  <h5>Ya tienen acceso</h5>
                  <ul className="inf-compartidos">
                    {estado.compartido_con.map(u => (
                      <li key={u.id}>
                        <span>{u.nombre}</span>
                        <span className={`inf-rol is-${u.role === 'TEACHER' ? 'docente' : 'estudiante'}`}>{u.role === 'TEACHER' ? 'Docente' : 'Estudiante'}</span>
                        {u.via === 'ENLACE' && <span className="inf-cand-curso">por enlace</span>}
                        <button type="button" className="inf-icono-btn" disabled={trabajando} aria-label={`Quitar acceso a ${u.nombre}`}
                          onClick={() => accion(() => dejarDeCompartir(consultaId, u.id))}><X size={15} /></button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            <section className="inf-enlace">
              <h4><Link2 size={16} /> Enlace</h4>
              <p>Cualquier persona con cuenta en la plataforma que abra el enlace podrá ver el informe y dejar notas.</p>
              {estado.enlace_token ? (
                <>
                  <div className="inf-enlace-caja">
                    <input readOnly value={urlEnlaceInforme(estado.enlace_token)} onFocus={e => e.target.select()} />
                    <button type="button" className="inf-btn-sec" onClick={() => copiar(urlEnlaceInforme(estado.enlace_token!))}>
                      <Copy size={14} /> {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <button type="button" className="inf-btn-texto" disabled={trabajando} onClick={() => accion(() => quitarEnlaceInforme(consultaId))}>
                    Desactivar el enlace
                  </button>
                </>
              ) : (
                <button type="button" className="inf-btn-sec" disabled={trabajando} onClick={() => accion(() => crearEnlaceInforme(consultaId))}>
                  <Link2 size={14} /> Crear enlace
                </button>
              )}
            </section>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ── Calificación del docente (casos asignados) ── */
function CalificacionDocente({ informe, onGuardado }: { informe: Informe; onGuardado: (i: Informe) => void }) {
  const caso = informe.caso_asignado!;
  const editable = informe.acceso.puede_calificar;
  const [nota, setNota] = useState(caso.teacher_score != null ? String(caso.teacher_score) : '');
  const [comentario, setComentario] = useState(caso.teacher_feedback ?? '');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const valor = nota.trim() === '' ? null : Number(nota.replace(',', '.'));
      if (valor != null && (Number.isNaN(valor) || valor < 0 || valor > caso.max_score)) {
        setMensaje(`La nota debe estar entre 0 y ${caso.max_score}.`);
        return;
      }
      const nuevo = await calificarCaso(informe.consulta.id, valor, comentario);
      onGuardado({ ...informe, caso_asignado: nuevo });
      setMensaje('Calificación guardada. El estudiante ya la puede ver.');
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="inf-calificacion">
      <div className="inf-calif-cab">
        <span><GraduationCap size={16} /> Calificación del docente</span>
        <small>{caso.titulo}</small>
      </div>
      {editable ? (
        <>
          <div className="inf-calif-nota">
            <input inputMode="decimal" value={nota} onChange={e => setNota(e.target.value)} placeholder="—" aria-label="Nota" />
            <span>/ {caso.max_score}</span>
          </div>
          <textarea rows={3} maxLength={4000} value={comentario} onChange={e => setComentario(e.target.value)}
            placeholder="Comentario general para el estudiante (opcional)" />
          <button type="button" className="inf-btn-primario" disabled={guardando} onClick={guardar}>
            {guardando ? <Loader2 size={15} className="sim-spin" /> : <CheckCircle2 size={15} />} Guardar calificación
          </button>
          {mensaje && <p className="inf-calif-msg">{mensaje}</p>}
        </>
      ) : caso.teacher_score != null ? (
        <>
          <p className="inf-calif-valor"><strong>{caso.teacher_score}</strong> / {caso.max_score}</p>
          {caso.teacher_feedback && <p className="inf-calif-com">{caso.teacher_feedback}</p>}
        </>
      ) : (
        <p className="inf-vacio">El docente todavía no ha calificado este caso.</p>
      )}
    </div>
  );
}

/* ── Página ── */
export default function InformePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const usuario = getStoredUser();
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<ComentarioInforme[]>([]);
  const [seccionNota, setSeccionNota] = useState<SeccionInforme>('general');
  const [enfocar, setEnfocar] = useState(0);
  const [compartir, setCompartir] = useState(false);
  const [menuDescarga, setMenuDescarga] = useState(false);
  const [descargando, setDescargando] = useState<'pdf' | 'docx' | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [verChat, setVerChat] = useState(false);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    obtenerInforme(id).then(d => { if (vivo) setInforme(d); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el informe.'); });
    return () => { vivo = false; };
  }, [id]);

  // Notas en vivo: se vuelven a pedir cada pocos segundos mientras la pestaña está visible.
  const cargarNotas = useCallback(() => {
    if (!id || document.visibilityState !== 'visible') return;
    listarComentariosInforme(id).then(setComentarios).catch(() => { /* reintenta en el siguiente ciclo */ });
  }, [id]);
  useEffect(() => {
    cargarNotas();
    const t = window.setInterval(cargarNotas, INTERVALO_NOTAS_MS);
    document.addEventListener('visibilitychange', cargarNotas);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', cargarNotas); };
  }, [cargarNotas]);

  const notasPorSeccion = useMemo(() => {
    const m: Partial<Record<SeccionInforme, number>> = {};
    for (const c of comentarios) m[c.section] = (m[c.section] ?? 0) + 1;
    return m;
  }, [comentarios]);

  function notaEn(s: SeccionInforme) {
    setSeccionNota(s);
    setEnfocar(n => n + 1);
  }

  async function descargar(formato: 'pdf' | 'docx') {
    if (!id) return;
    setMenuDescarga(false);
    setDescargando(formato);
    setErrorDescarga(null);
    try {
      await descargarInforme(id, formato);
    } catch (e) {
      setErrorDescarga(e instanceof Error ? e.message : 'No se pudo descargar el informe.');
    } finally {
      setDescargando(null);
    }
  }

  const det = informe?.evaluacion.detalle ?? null;
  const puntaje = informe?.evaluacion.puntaje ?? det?.puntaje_global ?? null;
  const cierre = informe?.cierre ?? null;
  const conversacion = informe?.conversacion.filter(m => m.content) ?? [];

  return (
    <div className="dash-root">
      <Sidebar />
      <div className="inf-page">
        <div className="inf-barra">
          <button type="button" className="inf-volver" onClick={() => navigate('/historial')}>
            <ArrowLeft size={16} /> Historial
          </button>
          {informe && (
            <div className="inf-acciones">
              <div className="inf-descarga">
                <button type="button" className="inf-btn-sec" onClick={() => setMenuDescarga(v => !v)} disabled={!!descargando}
                  aria-haspopup="menu" aria-expanded={menuDescarga}>
                  {descargando ? <Loader2 size={15} className="sim-spin" /> : <Download size={15} />} Descargar <ChevronDown size={14} />
                </button>
                <AnimatePresence>
                  {menuDescarga && (
                    <motion.div className="inf-menu" role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <button type="button" role="menuitem" onClick={() => descargar('pdf')}><FileText size={15} /> PDF</button>
                      <button type="button" role="menuitem" onClick={() => descargar('docx')}><FileText size={15} /> Word (.docx)</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {informe.acceso.puede_compartir && (
                <button type="button" className="inf-btn-primario" onClick={() => setCompartir(true)}>
                  <Share2 size={15} /> Compartir
                </button>
              )}
            </div>
          )}
        </div>
        {errorDescarga && <p className="inf-error inf-error-barra">{errorDescarga}</p>}

        {error && <div className="inf-estado"><Info size={20} /> {error}</div>}
        {!informe && !error && <div className="inf-estado"><Loader2 size={22} className="sim-spin" /> Cargando el informe...</div>}

        {informe && (
          <div className="inf-grid">
            <main className="inf-principal">
              {/* Encabezado */}
              <motion.header className="inf-hero" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="inf-hero-texto">
                  <p className="inf-eyebrow">Informe de la consulta simulada</p>
                  <h1>{informe.consulta.title}</h1>
                  <div className="inf-meta">
                    <span><Users size={14} /> {informe.estudiante.nombre}</span>
                    {informe.curso && <span><BookOpen size={14} /> {informe.curso.nombre}</span>}
                    <span><Calendar size={14} /> {fechaLarga(informe.consulta.finished_at)}</span>
                    {(det?.revelacion?.subtema || informe.consulta.subtema) && (
                      <span><Layers size={14} /> {det?.revelacion?.subtema || informe.consulta.subtema}</span>
                    )}
                    <span><Activity size={14} /> {DIFICULTAD[informe.consulta.difficulty] ?? informe.consulta.difficulty}</span>
                  </div>
                  {informe.caso_asignado && <span className="inf-badge-caso"><ClipboardList size={13} /> Caso asignado: {informe.caso_asignado.titulo}</span>}
                  {informe.acceso.tipo === 'COMPARTIDO' && <span className="inf-badge-comp"><Share2 size={13} /> Compartido contigo</span>}
                </div>
                {puntaje != null && <AnilloPuntaje valor={puntaje} />}
              </motion.header>

              {det?.desglose && (
                <div className="inf-desglose">
                  {det.desglose.map((d, i) => (
                    <div key={d.dimension} className="inf-dim">
                      <div className="inf-dim-cab"><span>{d.etiqueta}</span><em>{d.peso}%</em></div>
                      <div className="inf-dim-barra">
                        <motion.div className={`inf-dim-relleno is-${tonoPuntaje(d.puntaje)}`}
                          initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, d.puntaje))}%` }}
                          transition={{ duration: 0.7, delay: 0.1 + i * 0.06 }} />
                      </div>
                      <strong>{Math.round(d.puntaje)}</strong>
                    </div>
                  ))}
                </div>
              )}

              {informe.caso_asignado && <CalificacionDocente informe={informe} onGuardado={setInforme} />}

              {/* Cierre del estudiante */}
              <Seccion id="cierre" titulo="Cierre del estudiante" icono={<ClipboardList size={18} />} notas={notasPorSeccion.cierre ?? 0} onNota={notaEn}>
                {cierre ? (
                  <div className="inf-cierre">
                    <div className="inf-bloque inf-anamnesis">
                      <div className="inf-bloque-cab">
                        <h3>Anamnesis</h3>
                        <button type="button" className="inf-btn-nota is-mini" onClick={() => notaEn('anamnesis')}>
                          <MessageSquare size={13} /> {notasPorSeccion.anamnesis ?? 0}
                        </button>
                      </div>
                      <p className="inf-texto-largo">{cierre.anamnesis || 'No la registró.'}</p>
                    </div>
                    <div className="inf-campos">
                      <div className="inf-campo is-destacado">
                        <span>{cierre.diagnostico.startsWith('Impresión diagnóstica:') ? 'Impresión diagnóstica' : 'Diagnóstico principal'}</span>
                        <strong>{cierre.diagnostico.replace(/^Impresión diagnóstica:\s*/, '') || '—'}</strong>
                      </div>
                      {cierre.otros_diagnosticos.length > 0 && (
                        <div className="inf-campo"><span>Otros diagnósticos</span><ul>{cierre.otros_diagnosticos.map((o, i) => <li key={i}>{o}</li>)}</ul></div>
                      )}
                      <div className="inf-campo"><span>Diagnósticos diferenciales</span>
                        {cierre.diferenciales.length ? <ul>{cierre.diferenciales.map((o, i) => <li key={i}>{o}</li>)}</ul> : <p>No registró.</p>}
                      </div>
                      <div className="inf-campo"><span>Plan de manejo</span><p>{cierre.plan || 'No registró.'}</p></div>
                      {cierre.notas && <div className="inf-campo"><span>Notas</span><p>{cierre.notas}</p></div>}
                    </div>
                  </div>
                ) : (
                  <p className="inf-vacio">Esta consulta es anterior a que la plataforma guardara el cierre del estudiante.</p>
                )}
              </Seccion>

              {det && (
                <Seccion id="evaluacion" titulo="Evaluación" icono={<Stethoscope size={18} />} notas={notasPorSeccion.evaluacion ?? 0} onNota={notaEn}>
                  <div className="inf-aspectos">
                    {[
                      { t: 'Anamnesis escrita', n: det.calidad_anamnesis_escrita, c: det.comentario_anamnesis_escrita },
                      { t: 'Diagnóstico', n: det.concordancia_hipotesis, c: det.comentario_hipotesis },
                      { t: 'Plan de manejo', n: det.calidad_plan, c: det.comentario_plan },
                      { t: 'Comunicación', n: det.comunicacion, c: det.comentario_comunicacion },
                    ].filter(a => a.n).map(a => (
                      <div key={a.t} className="inf-aspecto">
                        <div className="inf-aspecto-cab"><h4>{a.t}</h4><Nivel nivel={a.n} /></div>
                        {a.c && <p>{a.c}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="inf-retro">
                    <h3><Info size={16} /> Retroalimentación</h3>
                    <p>{det.retroalimentacion_formativa}</p>
                  </div>
                  <div className="inf-dos">
                    <div className="inf-lista is-fortaleza"><h4><TrendingUp size={15} /> Fortalezas</h4><ul>{det.fortalezas.map((f, i) => <li key={i}>{f}</li>)}</ul></div>
                    <div className="inf-lista is-mejora"><h4><Award size={15} /> Aspectos por mejorar</h4><ul>{det.aspectos_a_mejorar.map((f, i) => <li key={i}>{f}</li>)}</ul></div>
                  </div>
                  <div className="inf-detalle">
                    <div><h4>Preguntas clave cubiertas</h4><Chips elementos={det.preguntas_clave_cubiertas} tipo="si" vacio="Ninguna" /></div>
                    <div><h4>Preguntas clave omitidas</h4><Chips elementos={det.preguntas_clave_omitidas} tipo="no" vacio="Ninguna" /></div>
                    <div><h4>Hallazgos indagados</h4><Chips elementos={det.hallazgos_indagados_correctamente} tipo="si" vacio="Ninguno" /></div>
                    <div><h4>Hallazgos no indagados</h4><Chips elementos={det.hallazgos_no_indagados} tipo="no" vacio="Ninguno" /></div>
                    {det.exploracion && (
                      <>
                        <div><h4>Exámenes pertinentes realizados</h4><Chips elementos={det.exploracion.pertinentes_realizados} tipo="si" vacio="Ninguno" /></div>
                        <div><h4>Exámenes pertinentes omitidos</h4><Chips elementos={det.exploracion.pertinentes_omitidos} tipo="no" vacio="Ninguno" /></div>
                      </>
                    )}
                    <div><h4>Diferenciales pertinentes</h4><Chips elementos={det.diferenciales_pertinentes} tipo="si" vacio="Ninguno" /></div>
                    <div><h4>Diferenciales que faltaron</h4><Chips elementos={det.diferenciales_faltantes} tipo="no" vacio="Ninguno" /></div>
                  </div>
                </Seccion>
              )}

              {det?.revelacion && (
                <Seccion id="diagnostico" titulo="Diagnóstico real del caso" icono={<Eye size={18} />} notas={notasPorSeccion.diagnostico ?? 0} onNota={notaEn}>
                  <div className="inf-revelacion">
                    <strong>{det.revelacion.diagnostico_real}</strong>
                    {det.revelacion.diferenciales_esperados.length > 0 && (
                      <p><span>Diferenciales esperados:</span> {det.revelacion.diferenciales_esperados.join(' · ')}</p>
                    )}
                  </div>
                </Seccion>
              )}

              {!det && informe.evaluacion.resumen && (
                <Seccion id="evaluacion" titulo="Retroalimentación" icono={<Info size={18} />} notas={notasPorSeccion.evaluacion ?? 0} onNota={notaEn}>
                  <p>{informe.evaluacion.resumen}</p>
                </Seccion>
              )}

              <Seccion id="conversacion" titulo={`Conversación (${conversacion.filter(m => !m.es_exploracion).length} mensajes)`}
                icono={<MessageSquare size={18} />} notas={notasPorSeccion.conversacion ?? 0} onNota={notaEn}>
                <button type="button" className="inf-btn-texto" onClick={() => setVerChat(v => !v)} aria-expanded={verChat}>
                  {verChat ? 'Ocultar la conversación' : 'Ver la conversación completa'} <ChevronDown size={14} className={verChat ? 'inf-girado' : ''} />
                </button>
                {verChat && (
                  <div className="inf-chat">
                    {conversacion.map((m, i) => m.es_exploracion ? (
                      <div key={i} className="inf-chat-explora">{m.content.replace(/^\[Exploracion fisica:\s*|\]$/g, '')}</div>
                    ) : (
                      <div key={i} className={`inf-chat-msg ${m.sender === 'STUDENT' ? 'is-estudiante' : 'is-paciente'}`}>
                        <span>{m.sender === 'STUDENT' ? 'Estudiante' : 'Paciente'}</span>
                        <p>{m.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Seccion>
            </main>

            <PanelNotas consultaId={informe.consulta.id} comentarios={comentarios} setComentarios={setComentarios}
              seccion={seccionNota} setSeccion={setSeccionNota} miId={usuario?.id ?? null} enfocar={enfocar} />
          </div>
        )}
      </div>
      {compartir && informe && <ModalCompartir consultaId={informe.consulta.id} onClose={() => setCompartir(false)} />}
    </div>
  );
}
