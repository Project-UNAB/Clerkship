import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Bell, BellOff, CheckCheck, ClipboardList, Megaphone, CheckCircle2, Clock, Mail, X } from 'lucide-react';
import {
  actualizarPreferencias, contarNoLeidas, listarNotificaciones, marcarLeida, marcarTodasLeidas, obtenerPreferencias,
  type Notificacion, type TipoNotificacion,
} from '../../data/notificacionesApi';
import { getAccessToken } from '../../data/mainAuth';
import { claveDeDia, faltaPara, formatFechaHoraCorta, formatHora } from '../../utils/fechas';
import '../../styles/notificaciones.css';

const ICONOS: Record<TipoNotificacion, typeof Bell> = {
  ASSIGNMENT_PUBLISHED: ClipboardList,
  ANNOUNCEMENT: Megaphone,
  ASSIGNMENT_GRADED: CheckCircle2,
  DUE_SOON: Clock,
};

const TIPOS: Record<TipoNotificacion, string> = {
  ASSIGNMENT_PUBLISHED: 'Tarea nueva',
  ANNOUNCEMENT: 'Aviso',
  ASSIGNMENT_GRADED: 'Calificación',
  DUE_SOON: 'Por vencer',
};

/** Cada cuánto se vuelve a preguntar cuántas hay sin leer. */
const INTERVALO_MS = 60_000;
const ANCHO_PANEL = 400;

interface Props {
  /** «icono»: campana sola (barra del celular). «fila»: fila del menú lateral
   *  con texto y contador; «fila-compacta»: la misma fila con la barra cerrada. */
  variante?: 'icono' | 'fila' | 'fila-compacta';
  /** Clase extra para el botón. */
  className?: string;
  /** Avisa al pasar el mouse (para el globo de nombre de la barra cerrada). */
  onHover?: (el: HTMLElement | null) => void;
}

/** «hace 5 min», «hace 3 h», o la hora si fue hoy hace más; la fecha si fue antes. */
function haceCuanto(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 6 * 3600) return `hace ${Math.floor(s / 3600)} h`;
  if (claveDeDia(d) === claveDeDia(new Date())) return formatHora(d);
  return formatFechaHoraCorta(d);
}

/** Grupo por día de Colombia: Hoy, Ayer, Esta semana, Anteriores. */
function grupoDe(iso: string | null): string {
  if (!iso) return 'Anteriores';
  const clave = claveDeDia(iso);
  const hoy = new Date();
  if (clave === claveDeDia(hoy)) return 'Hoy';
  if (clave === claveDeDia(new Date(hoy.getTime() - 86_400_000))) return 'Ayer';
  if (Date.now() - new Date(iso).getTime() < 7 * 86_400_000) return 'Esta semana';
  return 'Anteriores';
}

/** Botón de notificaciones (campana o fila del menú) y su panel flotante: lista
 * agrupada por día, filtro de sin leer, marcar como leídas y aviso por correo.
 * Al tocar una notificación se marca como leída y lleva al curso del que habla. */
export default function NotificacionesCampana({ variante = 'icono', className = '', onHover }: Props) {
  const navigate = useNavigate();
  const sinMovimiento = useReducedMotion();
  const boton = useRef<HTMLButtonElement>(null);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [porCorreo, setPorCorreo] = useState<boolean | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'sin-leer'>('todas');
  const [posicion, setPosicion] = useState<CSSProperties>({});

  const refrescarConteo = useCallback(() => {
    if (!getAccessToken()) return;
    contarNoLeidas().then(res => setNoLeidas(res.no_leidas)).catch(() => { /* sin red: se reintenta en el próximo ciclo */ });
  }, []);

  useEffect(() => {
    refrescarConteo();
    const id = window.setInterval(() => {
      // Con la pestaña en segundo plano no se consulta.
      if (document.visibilityState === 'visible') refrescarConteo();
    }, INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [refrescarConteo]);

  useEffect(() => {
    if (!abierto) return;
    setLoading(true);
    setError(null);
    listarNotificaciones(1, 30)
      .then(res => {
        setLista(res.notificaciones);
        setNoLeidas(res.no_leidas);
      })
      .catch(err => setError(err?.message || 'No se pudieron cargar las notificaciones.'))
      .finally(() => setLoading(false));
    if (porCorreo === null) {
      obtenerPreferencias().then(res => setPorCorreo(res.email)).catch(() => { /* el interruptor simplemente no aparece */ });
    }
    const cerrarConEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', cerrarConEscape);
    return () => document.removeEventListener('keydown', cerrarConEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // En escritorio el panel flota al lado del botón (a la derecha de la barra lateral);
  // en pantallas angostas es una hoja bajo la barra superior (lo resuelve el CSS).
  const ubicar = useCallback(() => {
    const el = boton.current;
    if (!el || window.innerWidth <= 1024) { setPosicion({}); return; }
    const r = el.getBoundingClientRect();
    const borde = el.closest('aside')?.getBoundingClientRect().right ?? r.right;
    const left = Math.min(borde + 12, window.innerWidth - ANCHO_PANEL - 12);
    const top = Math.max(12, Math.min(r.top - 6, window.innerHeight - 420));
    setPosicion({ left, top, maxHeight: window.innerHeight - top - 16 });
  }, []);

  useLayoutEffect(() => {
    if (!abierto) return;
    ubicar();
    window.addEventListener('resize', ubicar);
    return () => window.removeEventListener('resize', ubicar);
  }, [abierto, ubicar]);

  async function handleAbrir(n: Notificacion) {
    if (!n.read) {
      setLista(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
      setNoLeidas(prev => Math.max(0, prev - 1));
      marcarLeida(n.id).catch(() => refrescarConteo());
    }
    if (n.course_id) {
      setAbierto(false);
      navigate(`/mis-cursos/${n.course_id}`);
    }
  }

  function handleMarcarTodas() {
    setLista(prev => prev.map(x => ({ ...x, read: true })));
    setNoLeidas(0);
    marcarTodasLeidas().catch(() => refrescarConteo());
  }

  async function handleCorreo() {
    if (porCorreo === null) return;
    const nuevo = !porCorreo;
    setPorCorreo(nuevo);
    try {
      const res = await actualizarPreferencias(nuevo);
      setPorCorreo(res.email);
    } catch (err: any) {
      setPorCorreo(!nuevo);
      setError(err?.message || 'No se pudo guardar la preferencia.');
    }
  }

  const visibles = useMemo(() => (filtro === 'sin-leer' ? lista.filter(n => !n.read) : lista), [lista, filtro]);
  const grupos = useMemo(() => {
    const orden = ['Hoy', 'Ayer', 'Esta semana', 'Anteriores'];
    const mapa = new Map<string, Notificacion[]>();
    for (const n of visibles) {
      const g = grupoDe(n.created_at);
      mapa.set(g, [...(mapa.get(g) ?? []), n]);
    }
    return orden.filter(g => mapa.has(g)).map(g => ({ titulo: g, items: mapa.get(g)! }));
  }, [visibles]);

  const etiqueta = noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones';
  const numero = noLeidas > 99 ? '99+' : String(noLeidas);
  const transicion = sinMovimiento ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 34 };

  const disparador = variante === 'icono' ? (
    <button ref={boton} type="button" className={`noti-campana ${className}`} onClick={() => setAbierto(v => !v)}
      aria-label={etiqueta} title={etiqueta} aria-expanded={abierto} aria-haspopup="dialog">
      <Bell size={18} strokeWidth={1.8} />
      {noLeidas > 0 && <span className="noti-globo" aria-hidden="true">{numero}</span>}
    </button>
  ) : (
    <button ref={boton} type="button" className={`nv-item noti-fila${abierto ? ' is-abierta' : ''} ${className}`}
      onClick={() => setAbierto(v => !v)} aria-label={etiqueta} aria-expanded={abierto} aria-haspopup="dialog"
      onMouseEnter={e => onHover?.(e.currentTarget)} onMouseLeave={() => onHover?.(null)}
      onFocus={e => onHover?.(e.currentTarget)} onBlur={() => onHover?.(null)}>
      <span className="nv-item-icono noti-fila-icono">
        <Bell size={18} strokeWidth={1.8} />
        {variante === 'fila-compacta' && noLeidas > 0 && <span className="noti-globo" aria-hidden="true">{numero}</span>}
      </span>
      {variante === 'fila' && <span className="nv-item-txt">Notificaciones</span>}
      {variante === 'fila' && noLeidas > 0 && <span className="noti-contador">{numero}</span>}
    </button>
  );

  return (
    <>
      {disparador}
      {createPortal(
        <AnimatePresence>
          {abierto && (
            <motion.div className="noti-capa" onMouseDown={e => { if (e.target === e.currentTarget) setAbierto(false); }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: sinMovimiento ? 0 : 0.15 }}>
              <motion.section
                className="noti-panel"
                role="dialog"
                aria-label="Notificaciones"
                style={posicion}
                initial={{ opacity: 0, x: -8, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -8, scale: 0.98 }}
                transition={{ duration: sinMovimiento ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <header className="noti-cabecera">
                  <div className="noti-cabecera-fila">
                    <h3>Notificaciones</h3>
                    {noLeidas > 0 && <span className="noti-nuevas">{numero} {noLeidas === 1 ? 'nueva' : 'nuevas'}</span>}
                    <button type="button" className="noti-icono-btn" onClick={() => setAbierto(false)} aria-label="Cerrar">
                      <X size={17} />
                    </button>
                  </div>
                  <div className="noti-cabecera-fila">
                    <div className="noti-filtro" role="tablist" aria-label="Filtrar notificaciones">
                      {(['todas', 'sin-leer'] as const).map(f => (
                        <button key={f} type="button" role="tab" aria-selected={filtro === f}
                          className={filtro === f ? 'is-activo' : ''} onClick={() => setFiltro(f)}>
                          {filtro === f && <motion.span layoutId="noti-filtro-pastilla" className="noti-filtro-pastilla" transition={transicion} />}
                          {f === 'todas' ? 'Todas' : 'Sin leer'}
                        </button>
                      ))}
                    </div>
                    {noLeidas > 0 && (
                      <button type="button" className="noti-enlace" onClick={handleMarcarTodas}>
                        <CheckCheck size={15} /> Marcar todas como leídas
                      </button>
                    )}
                  </div>
                </header>

                <div className="noti-lista">
                  {loading && !lista.length && (
                    <div className="noti-esqueleto" aria-busy="true" aria-label="Cargando">
                      {[0, 1, 2].map(i => <div key={i}><span /><p><i /><i /></p></div>)}
                    </div>
                  )}
                  {!loading && error && <p className="noti-error" role="alert">{error}</p>}
                  {!loading && !error && visibles.length === 0 && (
                    <div className="noti-vacio">
                      <span><BellOff size={22} /></span>
                      <strong>{filtro === 'sin-leer' && lista.length ? 'Estás al día' : 'No tienes notificaciones'}</strong>
                      <p>{filtro === 'sin-leer' && lista.length
                        ? 'Ya leíste todas tus notificaciones.'
                        : 'Aquí verás las tareas nuevas, los avisos de tus cursos, las calificaciones y lo que está por vencer.'}</p>
                    </div>
                  )}

                  {grupos.map(g => (
                    <div key={g.titulo} className="noti-grupo">
                      <span className="noti-grupo-titulo">{g.titulo}</span>
                      {g.items.map((n, i) => {
                        const Icono = ICONOS[n.type] || Bell;
                        return (
                          <motion.button
                            key={n.id}
                            type="button"
                            className={`noti-item${n.read ? '' : ' is-nueva'}${n.course_id ? '' : ' sin-enlace'}`}
                            onClick={() => handleAbrir(n)}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: sinMovimiento ? 0 : 0.18, delay: sinMovimiento ? 0 : Math.min(i, 8) * 0.025 }}
                          >
                            <span className={`noti-icono noti-icono-${n.type.toLowerCase()}`}><Icono size={16} /></span>
                            <span className="noti-texto">
                              <span className="noti-meta">
                                <span className="noti-tipo">{TIPOS[n.type] ?? 'Aviso'}</span>
                                <span className="noti-fecha">{haceCuanto(n.created_at)}</span>
                              </span>
                              <span className="noti-titulo">{n.title}</span>
                              {n.body && <span className="noti-cuerpo">{n.body}</span>}
                              {n.event_at && (
                                <span className={`noti-cierre${faltaPara(n.event_at) === 'ya cerró' ? ' is-cerrada' : ''}`}>
                                  <Clock size={12} /> Cierra {formatFechaHoraCorta(n.event_at)} · {faltaPara(n.event_at)}
                                </span>
                              )}
                            </span>
                            {!n.read && <span className="noti-punto" aria-label="Sin leer" />}
                          </motion.button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {porCorreo !== null && (
                  <footer className="noti-pie">
                    <button type="button" className="noti-preferencia" onClick={handleCorreo} role="switch" aria-checked={porCorreo}>
                      <span className="noti-preferencia-txt">
                        <Mail size={15} />
                        <span><strong>Recibirlas también por correo</strong><small>Te avisamos aunque no estés en la plataforma.</small></span>
                      </span>
                      <span className={`noti-interruptor${porCorreo ? ' is-on' : ''}`} />
                    </button>
                  </footer>
                )}
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
