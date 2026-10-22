import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, AlertCircle, Bell, BellRing, BookOpen, Check, CheckCheck, ChevronRight, Download, Eye, EyeOff,
  FileText, GraduationCap, HardDrive, KeyRound, Loader2, LogOut, Mail, Monitor, Moon, Palette, Pencil,
  ShieldCheck, Stethoscope, Sun, Trophy, User, X, Zap,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import AvatarPickerStep from '../../components/auth/AvatarPickerStep';
import { useCurrentUser } from '../../utils/currentUser';
import { clearMainAuthSession } from '../../data/mainAuth';
import { logoutUserSession } from '../../utils/authConsent';
import {
  actualizarPerfil, cambiarContrasena, cerrarTodasLasSesiones, descargarMisDatos, getStorageUsage, obtenerPerfil,
  type PerfilUsuario, type StorageUsage,
} from '../../data/usuariosApi';
import {
  getEstadisticas, listConsultations, listMyCourses, type Consultation, type Course, type Estadisticas,
} from '../../data/consultasApi';
import { actualizarPreferencias, contarNoLeidas, marcarTodasLeidas, obtenerPreferencias } from '../../data/notificacionesApi';
import { getInitialTheme, triggerThemeToggle, type ThemeMode } from '../../utils/themeHelper';
import { useReducirMovimiento } from '../../utils/preferencias';
import { formatFecha, formatFechaHoraCorta } from '../../utils/fechas';
import '../../styles/perfil.css';

type IdPestana = 'cuenta' | 'actividad' | 'seguridad' | 'notificaciones' | 'apariencia' | 'privacidad';

const PESTANAS: { id: IdPestana; etiqueta: string; detalle: string; Icono: typeof User }[] = [
  { id: 'cuenta', etiqueta: 'Mi cuenta', detalle: 'Nombre, avatar y datos académicos', Icono: User },
  { id: 'actividad', etiqueta: 'Actividad', detalle: 'Tu progreso en la plataforma', Icono: Activity },
  { id: 'seguridad', etiqueta: 'Seguridad', detalle: 'Contraseña y sesiones', Icono: ShieldCheck },
  { id: 'notificaciones', etiqueta: 'Notificaciones', detalle: 'Qué te avisamos y cómo', Icono: Bell },
  { id: 'apariencia', etiqueta: 'Apariencia', detalle: 'Tema, movimiento y lectura', Icono: Palette },
  { id: 'privacidad', etiqueta: 'Privacidad y datos', detalle: 'Consentimiento y tus datos', Icono: FileText },
];

const ROLES: Record<string, string> = { STUDENT: 'Estudiante', TEACHER: 'Docente', ADMIN: 'Administrador' };

function mensajeDe(err: unknown, porDefecto: string) {
  return err instanceof Error && err.message ? err.message : porDefecto;
}

function formatoBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB'];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) { valor /= 1024; i += 1; }
  return `${valor.toLocaleString('es-CO', { maximumFractionDigits: valor < 10 ? 1 : 0 })} ${unidades[i]}`;
}

/** Sale de la cuenta en este navegador y lleva al inicio de sesión. */
function salirAlLogin(navigate: ReturnType<typeof useNavigate>) {
  logoutUserSession();
  clearMainAuthSession();
  navigate('/login', { replace: true });
}

/* ── Piezas comunes ─────────────────────────────────────────────── */

function Tarjeta({ titulo, descripcion, Icono, acciones, children }: {
  titulo: string; descripcion?: string; Icono?: typeof User; acciones?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="pf-tarjeta">
      <header className="pf-tarjeta-cab">
        {Icono && <span className="pf-tarjeta-icono"><Icono size={17} /></span>}
        <div className="pf-tarjeta-tit">
          <h2>{titulo}</h2>
          {descripcion && <p>{descripcion}</p>}
        </div>
        {acciones && <div className="pf-tarjeta-acciones">{acciones}</div>}
      </header>
      <div className="pf-tarjeta-cuerpo">{children}</div>
    </section>
  );
}

function Interruptor({ activo, onCambio, etiqueta, descripcion, Icono, ocupado, fijo }: {
  activo: boolean; onCambio: (v: boolean) => void; etiqueta: string; descripcion: string; Icono: typeof User; ocupado?: boolean;
  /** No se puede cambiar (se muestra tal cual). */
  fijo?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={activo} className={`pf-ajuste${fijo ? ' is-fijo' : ''}`}
      disabled={ocupado || fijo} onClick={() => onCambio(!activo)}>
      <span className="pf-ajuste-icono"><Icono size={16} /></span>
      <span className="pf-ajuste-txt"><strong>{etiqueta}</strong><span>{descripcion}</span></span>
      {ocupado ? <Loader2 size={16} className="pf-gira" /> : <span className={`pf-switch${activo ? ' is-on' : ''}`} aria-hidden="true" />}
    </button>
  );
}

function Aviso({ tipo, children }: { tipo: 'ok' | 'error' | 'info'; children: ReactNode }) {
  return (
    <motion.p className={`pf-aviso is-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      {tipo === 'ok' ? <Check size={15} /> : tipo === 'error' ? <AlertCircle size={15} /> : <BellRing size={15} />}
      <span>{children}</span>
    </motion.p>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="pf-dato">
      <span>{etiqueta}</span>
      <strong>{valor || '—'}</strong>
    </div>
  );
}

/* ── Pestaña: Mi cuenta ─────────────────────────────────────────── */

function PestanaCuenta({ perfil, onPerfil }: { perfil: PerfilUsuario; onPerfil: (p: PerfilUsuario) => void }) {
  const usuario = useCurrentUser();
  const [nombre, setNombre] = useState(perfil.first_name);
  const [apellido, setApellido] = useState(perfil.last_name);
  const [semestre, setSemestre] = useState(perfil.estudiante?.semestre ?? 0);
  const [departamento, setDepartamento] = useState(perfil.docente?.departamento ?? '');
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [avatarAbierto, setAvatarAbierto] = useState(false);

  useEffect(() => {
    if (!avatarAbierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAvatarAbierto(false); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [avatarAbierto]);

  const cambios = useMemo(() => {
    const c: Parameters<typeof actualizarPerfil>[0] = {};
    if (nombre.trim() !== perfil.first_name) c.first_name = nombre.trim();
    if (apellido.trim() !== perfil.last_name) c.last_name = apellido.trim();
    if (perfil.estudiante && semestre && semestre !== perfil.estudiante.semestre) c.semestre = semestre;
    if (perfil.docente && departamento.trim() !== (perfil.docente.departamento ?? '')) c.departamento = departamento.trim();
    return c;
  }, [nombre, apellido, semestre, departamento, perfil]);
  const hayCambios = Object.keys(cambios).length > 0;
  const valido = nombre.trim().length > 0 && apellido.trim().length > 0;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!hayCambios || !valido) return;
    setGuardando(true);
    setEstado(null);
    try {
      onPerfil(await actualizarPerfil(cambios));
      setEstado({ tipo: 'ok', texto: 'Cambios guardados.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: mensajeDe(err, 'No se pudieron guardar los cambios.') });
    } finally {
      setGuardando(false);
    }
  }

  function descartar() {
    setNombre(perfil.first_name);
    setApellido(perfil.last_name);
    setSemestre(perfil.estudiante?.semestre ?? 0);
    setDepartamento(perfil.docente?.departamento ?? '');
    setEstado(null);
  }

  return (
    <>
      <Tarjeta titulo="Foto de perfil" descripcion="Así te ven tus docentes y compañeros." Icono={User}>
        <div className="pf-avatar-fila">
          <img src={usuario?.avatarUrl} alt="" className="pf-avatar-grande" />
          <div className="pf-avatar-txt">
            <strong>{perfil.first_name} {perfil.last_name}</strong>
            <span>Avatar generado con DiceBear. Elige estilo, colores y variaciones.</span>
            <button type="button" className="pf-btn is-suave" onClick={() => setAvatarAbierto(true)}>
              <Pencil size={14} /> Cambiar avatar
            </button>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Datos personales" descripcion="Tu nombre aparece en cursos, entregas y comentarios." Icono={Pencil}>
        <form className="pf-form" onSubmit={guardar}>
          <div className="pf-campos">
            <label className="pf-campo">
              <span>Nombres</span>
              <input value={nombre} maxLength={100} onChange={e => setNombre(e.target.value)} autoComplete="given-name" />
            </label>
            <label className="pf-campo">
              <span>Apellidos</span>
              <input value={apellido} maxLength={100} onChange={e => setApellido(e.target.value)} autoComplete="family-name" />
            </label>
            {perfil.estudiante && (
              <label className="pf-campo">
                <span>Semestre</span>
                <select value={semestre} onChange={e => setSemestre(Number(e.target.value))}>
                  {!perfil.estudiante.semestre && <option value={0}>Sin indicar</option>}
                  {Array.from({ length: 14 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}.º semestre</option>)}
                </select>
              </label>
            )}
            {perfil.docente && (
              <label className="pf-campo">
                <span>Departamento o servicio</span>
                <input value={departamento} maxLength={150} placeholder="Ej.: Gastroenterología" onChange={e => setDepartamento(e.target.value)} />
              </label>
            )}
          </div>
          <AnimatePresence>{estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}</AnimatePresence>
          <div className="pf-form-pie">
            {hayCambios && <button type="button" className="pf-btn is-plano" onClick={descartar}>Descartar</button>}
            <button type="submit" className="pf-btn is-principal" disabled={!hayCambios || !valido || guardando}>
              {guardando ? <Loader2 size={15} className="pf-gira" /> : <Check size={15} />} Guardar cambios
            </button>
          </div>
        </form>
      </Tarjeta>

      <Tarjeta titulo="Datos de la cuenta" descripcion="Estos datos no se pueden cambiar desde aquí." Icono={GraduationCap}>
        <div className="pf-datos">
          <Dato etiqueta="Correo institucional" valor={perfil.email} />
          <Dato etiqueta="Usuario" valor={`@${perfil.username}`} />
          <Dato etiqueta="Rol" valor={ROLES[perfil.role]} />
          {perfil.estudiante && <Dato etiqueta="Código estudiantil" valor={perfil.estudiante.codigo} />}
          <Dato etiqueta="Miembro desde" valor={perfil.created_at ? formatFecha(perfil.created_at) : null} />
          <Dato etiqueta="Correo verificado" valor={perfil.email_verified ? 'Sí' : 'Pendiente'} />
        </div>
      </Tarjeta>

      {createPortal(
        <AnimatePresence>
          {avatarAbierto && (
            <motion.div className="pf-velo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onMouseDown={e => { if (e.target === e.currentTarget) setAvatarAbierto(false); }}>
              <motion.div className="pf-modal pf-avatar-modal" role="dialog" aria-modal="true" aria-label="Cambiar avatar"
                initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}>
                <button type="button" className="pf-modal-cerrar" onClick={() => setAvatarAbierto(false)} aria-label="Cerrar"><X size={18} /></button>
                <AvatarPickerStep defaultSeed={perfil.email} textoBoton="Guardar avatar" onDone={() => {
                  setAvatarAbierto(false);
                  setEstado({ tipo: 'ok', texto: 'Avatar actualizado.' });
                }} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/* ── Pestaña: Actividad ─────────────────────────────────────────── */

const ESTADOS_CONSULTA: Record<string, string> = { IN_PROGRESS: 'En curso', COMPLETED: 'Completado', ABANDONED: 'Abandonado' };

function PestanaActividad({ perfil }: { perfil: PerfilUsuario }) {
  const esEstudiante = perfil.role === 'STUDENT';
  const [stats, setStats] = useState<Estadisticas | null>(null);
  const [cursos, setCursos] = useState<Course[] | null>(null);
  const [consultas, setConsultas] = useState<Consultation[] | null>(null);
  const [almacen, setAlmacen] = useState<StorageUsage | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    Promise.allSettled([
      esEstudiante ? getEstadisticas() : Promise.resolve(null),
      listMyCourses(),
      esEstudiante ? listConsultations() : Promise.resolve([]),
      getStorageUsage(),
    ]).then(([s, c, q, a]) => {
      if (!vigente) return;
      if (s.status === 'fulfilled') setStats(s.value);
      setCursos(c.status === 'fulfilled' && Array.isArray(c.value) ? c.value : []);
      setConsultas(q.status === 'fulfilled' && Array.isArray(q.value) ? q.value : []);
      if (a.status === 'fulfilled') setAlmacen(a.value);
      setCargando(false);
    });
    return () => { vigente = false; };
  }, [esEstudiante]);

  if (cargando) {
    return <div className="pf-esqueleto" aria-busy="true"><i /><i /><i /><i /></div>;
  }

  const recientes = [...(consultas ?? [])]
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
    .slice(0, 5);
  const usoPct = almacen ? Math.min(100, (almacen.used_bytes / Math.max(1, almacen.limit_bytes)) * 100) : 0;

  const cifras = esEstudiante
    ? [
        { Icono: Stethoscope, valor: stats?.total_simulaciones ?? 0, etiqueta: 'casos simulados', color: 'azul' },
        { Icono: CheckCheck, valor: stats?.completadas ?? 0, etiqueta: 'completados', color: 'verde' },
        { Icono: Trophy, valor: stats && stats.completadas ? `${Math.round(stats.promedio_score)}%` : '—', etiqueta: 'puntaje promedio', color: 'ambar' },
        { Icono: GraduationCap, valor: cursos?.length ?? 0, etiqueta: cursos?.length === 1 ? 'curso' : 'cursos', color: 'morado' },
      ]
    : [
        { Icono: GraduationCap, valor: cursos?.length ?? 0, etiqueta: cursos?.length === 1 ? 'curso a cargo' : 'cursos a cargo', color: 'azul' },
        { Icono: HardDrive, valor: almacen ? formatoBytes(almacen.used_bytes) : '—', etiqueta: 'en tus documentos', color: 'morado' },
      ];

  return (
    <>
      <div className={`pf-cifras${cifras.length === 2 ? ' is-dos' : ''}`}>
        {cifras.map((c, i) => (
          <motion.div key={c.etiqueta} className={`pf-cifra is-${c.color}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className="pf-cifra-icono"><c.Icono size={18} /></span>
            <strong>{c.valor}</strong>
            <span>{c.etiqueta}</span>
          </motion.div>
        ))}
      </div>

      {esEstudiante && (
        <Tarjeta titulo="Casos recientes" descripcion="Tus últimas simulaciones clínicas." Icono={Stethoscope}
          acciones={<Link to="/historial" className="pf-enlace">Ver historial <ChevronRight size={14} /></Link>}>
          {recientes.length === 0 ? (
            <div className="pf-vacio">
              <Stethoscope size={20} />
              <span>Aún no has simulado casos.</span>
              <Link to="/casos?nuevo=1" className="pf-btn is-suave">Empezar un caso</Link>
            </div>
          ) : (
            <ul className="pf-lista">
              {recientes.map(c => (
                <li key={c.id}>
                  <Link to={c.status === 'IN_PROGRESS' ? `/simulacion/${c.id}` : '/historial'} className="pf-fila">
                    <span className={`pf-punto is-${c.status.toLowerCase()}`} aria-hidden="true" />
                    <span className="pf-fila-txt">
                      <strong>{c.title}</strong>
                      <span>{c.subtema || c.specialty} · {c.started_at ? formatFechaHoraCorta(c.started_at) : ''}</span>
                    </span>
                    <span className="pf-fila-fin">
                      {c.score != null ? <b>{Math.round(Number(c.score))}%</b> : <em>{ESTADOS_CONSULTA[c.status] ?? c.status}</em>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      )}

      <Tarjeta titulo={esEstudiante ? 'Mis cursos' : 'Cursos a cargo'} Icono={BookOpen}
        acciones={<Link to="/mis-cursos" className="pf-enlace">Ir a cursos <ChevronRight size={14} /></Link>}>
        {cursos && cursos.length ? (
          <ul className="pf-lista">
            {cursos.slice(0, 6).map(c => (
              <li key={c.id}>
                <Link to={`/mis-cursos/${c.id}`} className="pf-fila">
                  <span className="pf-fila-icono"><GraduationCap size={15} /></span>
                  <span className="pf-fila-txt">
                    <strong>{c.name}</strong>
                    <span>{[c.academic_period, c.teacher_name].filter(Boolean).join(' · ') || 'Curso'}</span>
                  </span>
                  <ChevronRight size={15} className="pf-fila-flecha" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="pf-vacio">
            <BookOpen size={20} />
            <span>{esEstudiante ? 'Todavía no estás matriculado en ningún curso.' : 'Todavía no has creado cursos.'}</span>
            <Link to={esEstudiante ? '/explorar' : '/mis-cursos'} className="pf-btn is-suave">{esEstudiante ? 'Explorar catálogo' : 'Crear un curso'}</Link>
          </div>
        )}
      </Tarjeta>

      {almacen && (
        <Tarjeta titulo="Almacenamiento" descripcion="Espacio que ocupan tus documentos clínicos." Icono={HardDrive}>
          <div className="pf-almacen">
            <div className="pf-almacen-cifras">
              <strong>{formatoBytes(almacen.used_bytes)}</strong>
              <span>de {formatoBytes(almacen.limit_bytes)}</span>
            </div>
            <div className="pf-barra"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(usoPct, usoPct > 0 ? 1.5 : 0)}%` }} transition={{ duration: 0.6 }} /></div>
            <span className="pf-almacen-pie">{usoPct < 0.1 && almacen.used_bytes > 0 ? 'Menos del 0,1 %' : `${usoPct.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`} usado</span>
          </div>
        </Tarjeta>
      )}
    </>
  );
}

/* ── Pestaña: Seguridad ─────────────────────────────────────────── */

const REGLAS_CONTRASENA = [
  { texto: 'Al menos 8 caracteres', ok: (v: string) => v.length >= 8 },
  { texto: 'Una mayúscula y una minúscula', ok: (v: string) => /[a-záéíóúñ]/.test(v) && /[A-ZÁÉÍÓÚÑ]/.test(v) },
  { texto: 'Un número', ok: (v: string) => /\d/.test(v) },
  { texto: 'Un símbolo (!, #, $, …)', ok: (v: string) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s]/.test(v) },
];
const NIVELES = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte'];

function CampoClave({ etiqueta, valor, onCambio, autoComplete }: {
  etiqueta: string; valor: string; onCambio: (v: string) => void; autoComplete: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <label className="pf-campo">
      <span>{etiqueta}</span>
      <div className="pf-clave">
        <input type={ver ? 'text' : 'password'} value={valor} onChange={e => onCambio(e.target.value)} autoComplete={autoComplete} />
        <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {ver ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

function PestanaSeguridad({ perfil }: { perfil: PerfilUsuario }) {
  const navigate = useNavigate();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const cumplidas = REGLAS_CONTRASENA.filter(r => r.ok(nueva)).length;
  const nivel = nueva ? Math.min(4, cumplidas + (nueva.length >= 12 ? 1 : 0)) : 0;
  const coinciden = confirmar.length > 0 && confirmar === nueva;
  const valida = actual.length > 0 && nueva.length >= 8 && coinciden && nueva !== actual;

  async function cambiar(e: FormEvent) {
    e.preventDefault();
    if (!valida) return;
    setEnviando(true);
    setEstado(null);
    try {
      await cambiarContrasena(actual, nueva);
      setEstado({ tipo: 'ok', texto: 'Contraseña actualizada. Por seguridad se cerraron tus sesiones: vuelve a entrar con la nueva.' });
      setActual(''); setNueva(''); setConfirmar('');
      window.setTimeout(() => salirAlLogin(navigate), 2600);
    } catch (err) {
      setEstado({ tipo: 'error', texto: mensajeDe(err, 'No se pudo cambiar la contraseña.') });
      setEnviando(false);
    }
  }

  async function cerrarSesiones() {
    if (!window.confirm('Se cerrará tu sesión en todos los dispositivos, incluido este. ¿Continuar?')) return;
    setCerrando(true);
    try {
      await cerrarTodasLasSesiones();
    } catch {
      /* aun si falla la red, en este navegador se sale igual */
    }
    salirAlLogin(navigate);
  }

  return (
    <>
      <Tarjeta titulo="Cambiar contraseña" descripcion="Al cambiarla se cierran todas tus sesiones abiertas." Icono={KeyRound}>
        <form className="pf-form" onSubmit={cambiar}>
          <div className="pf-campos is-una">
            <CampoClave etiqueta="Contraseña actual" valor={actual} onCambio={setActual} autoComplete="current-password" />
          </div>
          <div className="pf-campos">
            <CampoClave etiqueta="Contraseña nueva" valor={nueva} onCambio={setNueva} autoComplete="new-password" />
            <CampoClave etiqueta="Confirmar la nueva" valor={confirmar} onCambio={setConfirmar} autoComplete="new-password" />
          </div>
          {nueva && (
            <div className="pf-fuerza" aria-live="polite">
              <div className="pf-fuerza-barras">
                {[0, 1, 2, 3].map(i => <i key={i} className={i < nivel ? `is-n${nivel}` : ''} />)}
              </div>
              <span>{NIVELES[nivel]}</span>
            </div>
          )}
          <ul className="pf-reglas">
            {REGLAS_CONTRASENA.map(r => (
              <li key={r.texto} className={r.ok(nueva) ? 'is-ok' : ''}><Check size={13} /> {r.texto}</li>
            ))}
            <li className={coinciden ? 'is-ok' : ''}><Check size={13} /> Las dos contraseñas coinciden</li>
          </ul>
          {nueva && nueva === actual && <Aviso tipo="error">La contraseña nueva debe ser distinta de la actual.</Aviso>}
          <AnimatePresence>{estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}</AnimatePresence>
          <div className="pf-form-pie">
            <button type="submit" className="pf-btn is-principal" disabled={!valida || enviando}>
              {enviando ? <Loader2 size={15} className="pf-gira" /> : <KeyRound size={15} />} Actualizar contraseña
            </button>
          </div>
        </form>
      </Tarjeta>

      <Tarjeta titulo="Sesiones" descripcion="Si usaste Clerkship en un equipo prestado o crees que alguien más entró, ciérralas todas." Icono={Monitor}>
        <div className="pf-sesion">
          <span className="pf-sesion-icono"><Monitor size={18} /></span>
          <span className="pf-fila-txt">
            <strong>Este navegador</strong>
            <span>Sesión activa ahora · {perfil.email}</span>
          </span>
          <span className="pf-chip is-verde">Activa</span>
        </div>
        <div className="pf-form-pie">
          <button type="button" className="pf-btn is-peligro" onClick={cerrarSesiones} disabled={cerrando}>
            {cerrando ? <Loader2 size={15} className="pf-gira" /> : <LogOut size={15} />} Cerrar sesión en todos los dispositivos
          </button>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Verificación del correo" Icono={Mail}>
        <div className="pf-sesion">
          <span className={`pf-sesion-icono${perfil.email_verified ? ' is-verde' : ''}`}><ShieldCheck size={18} /></span>
          <span className="pf-fila-txt">
            <strong>{perfil.email}</strong>
            <span>{perfil.email_verified ? 'Verificado con un código enviado a este correo.' : 'Todavía no está verificado.'}</span>
          </span>
          <span className={`pf-chip ${perfil.email_verified ? 'is-verde' : 'is-ambar'}`}>{perfil.email_verified ? 'Verificado' : 'Pendiente'}</span>
        </div>
      </Tarjeta>
    </>
  );
}

/* ── Pestaña: Notificaciones ────────────────────────────────────── */

const TIPOS_AVISO = [
  { titulo: 'Tareas publicadas', texto: 'Cuando un docente publica una tarea en tus cursos.' },
  { titulo: 'Avisos del curso', texto: 'Comunicados que publica el docente.' },
  { titulo: 'Calificaciones', texto: 'Cuando te califican una entrega.' },
  { titulo: 'Entregas por vencer', texto: 'Recordatorio antes de que cierre una tarea.' },
];

function PestanaNotificaciones({ perfil }: { perfil: PerfilUsuario }) {
  const [correo, setCorreo] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [noLeidas, setNoLeidas] = useState<number | null>(null);
  const [marcando, setMarcando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerPreferencias().then(p => { if (vigente) setCorreo(p.email); }).catch(() => { if (vigente) setCorreo(false); });
    contarNoLeidas().then(r => { if (vigente) setNoLeidas(r.no_leidas); }).catch(() => { if (vigente) setNoLeidas(0); });
    return () => { vigente = false; };
  }, []);

  async function cambiarCorreo(valor: boolean) {
    setGuardando(true);
    setEstado(null);
    try {
      const p = await actualizarPreferencias(valor);
      setCorreo(p.email);
      setEstado({ tipo: 'ok', texto: p.email ? `Te enviaremos también un correo a ${perfil.email}.` : 'Ya no recibirás correos; los avisos siguen llegando a la plataforma.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: mensajeDe(err, 'No se pudo guardar la preferencia.') });
    } finally {
      setGuardando(false);
    }
  }

  async function marcarTodas() {
    setMarcando(true);
    try {
      const r = await marcarTodasLeidas();
      setNoLeidas(r.no_leidas);
      window.dispatchEvent(new CustomEvent('clerkship-notificaciones-cambio'));
      setEstado({ tipo: 'ok', texto: r.marcadas === 1 ? 'Se marcó 1 notificación como leída.' : `Se marcaron ${r.marcadas} notificaciones como leídas.` });
    } catch (err) {
      setEstado({ tipo: 'error', texto: mensajeDe(err, 'No se pudieron marcar.') });
    } finally {
      setMarcando(false);
    }
  }

  return (
    <>
      <Tarjeta titulo="Canales" descripcion="Dentro de la plataforma siempre te avisamos. El correo es opcional." Icono={Bell}>
        <div className="pf-ajustes">
          <Interruptor activo etiqueta="En la plataforma" descripcion="La campana del menú lateral. Siempre activa." Icono={BellRing} onCambio={() => undefined} fijo />
          {correo === null
            ? <div className="pf-ajuste is-cargando"><Loader2 size={16} className="pf-gira" /> Cargando preferencia…</div>
            : <Interruptor activo={correo} onCambio={cambiarCorreo} ocupado={guardando} Icono={Mail}
                etiqueta="Por correo" descripcion={`Una copia de cada aviso en ${perfil.email}.`} />}
        </div>
        <AnimatePresence>{estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}</AnimatePresence>
      </Tarjeta>

      <Tarjeta titulo="Qué te avisamos" Icono={BellRing}>
        <ul className="pf-tipos">
          {TIPOS_AVISO.map(t => (
            <li key={t.titulo}><span className="pf-tipo-punto" /><div><strong>{t.titulo}</strong><span>{t.texto}</span></div></li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Bandeja" Icono={CheckCheck}>
        <div className="pf-sesion">
          <span className="pf-sesion-icono"><Bell size={18} /></span>
          <span className="pf-fila-txt">
            <strong>{noLeidas === null ? 'Contando…' : noLeidas === 0 ? 'Estás al día' : `${noLeidas} sin leer`}</strong>
            <span>{noLeidas ? 'Puedes marcarlas todas como leídas de una vez.' : 'No tienes notificaciones pendientes.'}</span>
          </span>
          <button type="button" className="pf-btn is-suave" disabled={!noLeidas || marcando} onClick={marcarTodas}>
            {marcando ? <Loader2 size={14} className="pf-gira" /> : <CheckCheck size={14} />} Marcar todas como leídas
          </button>
        </div>
      </Tarjeta>
    </>
  );
}

/* ── Pestaña: Apariencia ────────────────────────────────────────── */

function PestanaApariencia({ perfil, onPerfil }: { perfil: PerfilUsuario; onPerfil: (p: PerfilUsuario) => void }) {
  const [tema, setTema] = useState<ThemeMode>(getInitialTheme);
  const [reducir, setReducir] = useReducirMovimiento();
  const [zoom, setZoom] = useState(perfil.biblioteca_zoom ?? 130);
  const [guardandoZoom, setGuardandoZoom] = useState(false);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    const alCambiar = (e: Event) => { const t = (e as CustomEvent<ThemeMode>).detail; if (t) setTema(t); };
    window.addEventListener('clerkship-theme-change', alCambiar);
    return () => window.removeEventListener('clerkship-theme-change', alCambiar);
  }, []);

  async function guardarZoom(valor: number) {
    if (valor === (perfil.biblioteca_zoom ?? 130)) return;
    setGuardandoZoom(true);
    setEstado(null);
    try {
      onPerfil(await actualizarPerfil({ biblioteca_zoom: valor }));
      setEstado({ tipo: 'ok', texto: `Zoom de la biblioteca guardado en ${valor} %.` });
    } catch (err) {
      setEstado({ tipo: 'error', texto: mensajeDe(err, 'No se pudo guardar el zoom.') });
    } finally {
      setGuardandoZoom(false);
    }
  }

  return (
    <>
      <Tarjeta titulo="Tema" descripcion="Se guarda en este navegador." Icono={Sun}>
        <div className="pf-temas" role="radiogroup" aria-label="Tema">
          {(['light', 'dark'] as const).map(t => (
            <button key={t} type="button" role="radio" aria-checked={tema === t} className={`pf-tema is-${t}${tema === t ? ' is-activo' : ''}`}
              onClick={() => { if (tema !== t) setTema(triggerThemeToggle(tema)); }}>
              <span className="pf-tema-muestra" aria-hidden="true">
                <i className="pf-tm-lado" /><i className="pf-tm-barra" /><i className="pf-tm-tarjeta" /><i className="pf-tm-tarjeta is-corta" />
              </span>
              <span className="pf-tema-nombre">
                {t === 'light' ? <Sun size={15} /> : <Moon size={15} />} {t === 'light' ? 'Claro' : 'Oscuro'}
                {tema === t && <Check size={15} className="pf-tema-check" />}
              </span>
            </button>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Accesibilidad" Icono={Zap}>
        <div className="pf-ajustes">
          <Interruptor activo={reducir} onCambio={setReducir} Icono={Zap} etiqueta="Reducir movimiento"
            descripcion="Quita animaciones y transiciones en toda la plataforma. Se guarda en este navegador." />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Lectura en la biblioteca" descripcion="Tamaño con el que se ven los libros del estante. Se guarda en tu cuenta." Icono={BookOpen}>
        <div className="pf-zoom">
          <input type="range" min={60} max={200} step={5} value={zoom} aria-label="Zoom de la biblioteca"
            onChange={e => setZoom(Number(e.target.value))}
            onMouseUp={() => guardarZoom(zoom)} onTouchEnd={() => guardarZoom(zoom)} onKeyUp={() => guardarZoom(zoom)} />
          <span className="pf-zoom-valor">{guardandoZoom ? <Loader2 size={14} className="pf-gira" /> : `${zoom} %`}</span>
          <button type="button" className="pf-btn is-plano" disabled={zoom === 130} onClick={() => { setZoom(130); guardarZoom(130); }}>Restablecer</button>
        </div>
        <AnimatePresence>{estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}</AnimatePresence>
      </Tarjeta>
    </>
  );
}

/* ── Pestaña: Privacidad y datos ────────────────────────────────── */

function PestanaPrivacidad({ perfil }: { perfil: PerfilUsuario }) {
  const [descargando, setDescargando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  async function descargar() {
    setDescargando(true);
    setEstado(null);
    try {
      await descargarMisDatos();
      setEstado({ tipo: 'ok', texto: 'Listo: se descargó mis-datos-clerkship.json.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: mensajeDe(err, 'No se pudo generar la copia.') });
    } finally {
      setDescargando(false);
    }
  }

  return (
    <>
      <Tarjeta titulo="Consentimiento informado" descripcion="Autorización para el tratamiento de tus datos (Ley 1581 de 2012)." Icono={ShieldCheck}>
        <div className="pf-sesion">
          <span className={`pf-sesion-icono${perfil.consent_accepted_at ? ' is-verde' : ''}`}><ShieldCheck size={18} /></span>
          <span className="pf-fila-txt">
            <strong>{perfil.consent_accepted_at ? 'Autorización vigente' : 'Sin autorización registrada'}</strong>
            <span>
              {perfil.consent_accepted_at
                ? `Aceptada el ${formatFechaHoraCorta(perfil.consent_accepted_at)}${perfil.consent_version ? ` · versión ${perfil.consent_version}` : ''}`
                : 'Se te pedirá al entrar a la plataforma.'}
            </span>
          </span>
        </div>
        <div className="pf-enlaces">
          <Link to="/legal/privacidad" className="pf-enlace">Política de privacidad <ChevronRight size={14} /></Link>
          <Link to="/legal/terminos" className="pf-enlace">Términos de uso <ChevronRight size={14} /></Link>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Descargar mis datos" descripcion="Una copia en formato JSON de tu perfil, cursos, simulaciones y entregas. No incluye contraseñas ni archivos." Icono={Download}>
        <div className="pf-form-pie is-izq">
          <button type="button" className="pf-btn is-principal" onClick={descargar} disabled={descargando}>
            {descargando ? <Loader2 size={15} className="pf-gira" /> : <Download size={15} />} Descargar copia
          </button>
        </div>
        <AnimatePresence>{estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}</AnimatePresence>
      </Tarjeta>

      <Tarjeta titulo="Tus derechos" Icono={FileText}>
        <ul className="pf-tipos">
          <li><span className="pf-tipo-punto" /><div><strong>Conocer y acceder</strong><span>Descarga cuando quieras la copia de tus datos.</span></div></li>
          <li><span className="pf-tipo-punto" /><div><strong>Actualizar y rectificar</strong><span>Corrige tu nombre y tus datos académicos en «Mi cuenta».</span></div></li>
          <li><span className="pf-tipo-punto" /><div><strong>Suprimir o revocar</strong><span>Para eliminar tu cuenta o retirar la autorización, escríbele al administrador de la plataforma.</span></div></li>
        </ul>
      </Tarjeta>
    </>
  );
}

/* ── Página ─────────────────────────────────────────────────────── */

export default function PerfilPage() {
  const { pestana } = useParams();
  const navigate = useNavigate();
  const usuario = useCurrentUser();
  const activa: IdPestana = PESTANAS.some(p => p.id === pestana) ? (pestana as IdPestana) : 'cuenta';
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerPerfil()
      .then(p => { if (vigente) setPerfil(p); })
      .catch(err => { if (vigente) setError(mensajeDe(err, 'No se pudo cargar tu perfil.')); });
    return () => { vigente = false; };
  }, []);

  const info = PESTANAS.find(p => p.id === activa)!;

  return (
    <div className="dash-root">
      <Sidebar />
      <main className="pf-pagina">
        <div className="pf-contenido">
          <header className="pf-cabecera">
            <div className="pf-cabecera-fondo" aria-hidden="true" />
            <img src={usuario?.avatarUrl} alt="" className="pf-cabecera-avatar" />
            <div className="pf-cabecera-txt">
              <h1>{perfil ? `${perfil.first_name} ${perfil.last_name}` : usuario?.name}</h1>
              <p>
                <span className="pf-chip is-azul">{perfil ? ROLES[perfil.role] : usuario?.role}</span>
                <span>{perfil?.email ?? usuario?.email}</span>
                {perfil?.estudiante?.semestre ? <span>· {perfil.estudiante.semestre}.º semestre</span> : null}
                {perfil?.docente?.departamento ? <span>· {perfil.docente.departamento}</span> : null}
              </p>
            </div>
          </header>

          <div className="pf-layout">
            <nav className="pf-pestanas" aria-label="Secciones del perfil">
              {PESTANAS.map(p => (
                <button key={p.id} type="button" className={`pf-pestana${p.id === activa ? ' is-activa' : ''}`}
                  aria-current={p.id === activa ? 'page' : undefined}
                  onClick={() => navigate(`/perfil/${p.id}`)}>
                  {p.id === activa && <motion.span layoutId="pf-pestana-fondo" className="pf-pestana-fondo" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                  <p.Icono size={17} />
                  <span className="pf-pestana-txt"><strong>{p.etiqueta}</strong><span>{p.detalle}</span></span>
                </button>
              ))}
            </nav>

            <section className="pf-panel" aria-live="polite">
              <div className="pf-panel-cab">
                <h2>{info.etiqueta}</h2>
                <p>{info.detalle}</p>
              </div>
              {error && <Aviso tipo="error">{error}</Aviso>}
              {!perfil && !error && <div className="pf-esqueleto" aria-busy="true"><i /><i /><i /></div>}
              {perfil && (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={activa} className="pf-panel-cuerpo"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}>
                    {activa === 'cuenta' && <PestanaCuenta perfil={perfil} onPerfil={setPerfil} />}
                    {activa === 'actividad' && <PestanaActividad perfil={perfil} />}
                    {activa === 'seguridad' && <PestanaSeguridad perfil={perfil} />}
                    {activa === 'notificaciones' && <PestanaNotificaciones perfil={perfil} />}
                    {activa === 'apariencia' && <PestanaApariencia perfil={perfil} onPerfil={setPerfil} />}
                    {activa === 'privacidad' && <PestanaPrivacidad perfil={perfil} />}
                  </motion.div>
                </AnimatePresence>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
