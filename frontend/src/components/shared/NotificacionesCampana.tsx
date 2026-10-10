import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, Megaphone, CheckCircle2, Clock, Loader2, X } from 'lucide-react';
import {
  actualizarPreferencias, contarNoLeidas, listarNotificaciones, marcarLeida, marcarTodasLeidas, obtenerPreferencias,
  type Notificacion, type TipoNotificacion,
} from '../../data/notificacionesApi';
import { getAccessToken } from '../../data/mainAuth';
import { faltaPara, formatFechaHoraCorta } from '../../utils/fechas';
import '../../styles/notificaciones.css';

const ICONOS: Record<TipoNotificacion, typeof Bell> = {
  ASSIGNMENT_PUBLISHED: ClipboardList,
  ANNOUNCEMENT: Megaphone,
  ASSIGNMENT_GRADED: CheckCircle2,
  DUE_SOON: Clock,
};

/** Cada cuánto se vuelve a preguntar cuántas hay sin leer. */
const INTERVALO_MS = 60_000;

interface Props {
  /** Clase extra para el botón, según dónde se monte (barra lateral, barra móvil). */
  className?: string;
}

/** Campana con el número de notificaciones sin leer y, al abrirla, la lista:
 * se marcan como leídas al tocarlas y llevan al curso del que hablan. */
export default function NotificacionesCampana({ className = '' }: Props) {
  const navigate = useNavigate();
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [porCorreo, setPorCorreo] = useState<boolean | null>(null);

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
    listarNotificaciones(1, 20)
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

  async function handleMarcarTodas() {
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

  const etiqueta = noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones';

  return (
    <>
      <button
        type="button"
        className={`noti-campana ${className}`}
        onClick={() => setAbierto(true)}
        aria-label={etiqueta}
        title={etiqueta}
      >
        <Bell size={17} />
        {noLeidas > 0 && <span className="noti-globo" aria-hidden="true">{noLeidas > 99 ? '99+' : noLeidas}</span>}
      </button>

      {abierto && (
        <div className="noti-fondo" onClick={() => setAbierto(false)}>
          <section className="noti-panel" role="dialog" aria-label="Notificaciones" onClick={e => e.stopPropagation()}>
            <header className="noti-cabecera">
              <h3>Notificaciones</h3>
              <div className="noti-cabecera-acciones">
                {noLeidas > 0 && (
                  <button type="button" className="noti-enlace" onClick={handleMarcarTodas}>Marcar todas como leídas</button>
                )}
                <button type="button" className="noti-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="noti-lista">
              {loading && <div className="noti-vacio"><Loader2 size={18} className="dfm-spin" /></div>}
              {!loading && error && <p className="noti-error" role="alert">{error}</p>}
              {!loading && !error && lista.length === 0 && <p className="noti-vacio">No tienes notificaciones.</p>}

              {!loading && lista.map(n => {
                const Icono = ICONOS[n.type] || Bell;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`noti-item ${n.read ? '' : 'is-nueva'}`}
                    onClick={() => handleAbrir(n)}
                  >
                    <span className={`noti-icono noti-icono-${n.type.toLowerCase()}`}><Icono size={15} /></span>
                    <span className="noti-texto">
                      <span className="noti-titulo">{n.title}</span>
                      {n.body && <span className="noti-cuerpo">{n.body}</span>}
                      {n.event_at && (
                        <span className="noti-cuerpo">Cierra {formatFechaHoraCorta(n.event_at)} · {faltaPara(n.event_at)}</span>
                      )}
                      <span className="noti-fecha">{formatFechaHoraCorta(n.created_at)}</span>
                    </span>
                    {!n.read && <span className="noti-punto" aria-label="Sin leer" />}
                  </button>
                );
              })}
            </div>

            {porCorreo !== null && (
              <footer className="noti-pie">
                <button type="button" className="noti-preferencia" onClick={handleCorreo} role="switch" aria-checked={porCorreo}>
                  <span>Recibirlas también por correo</span>
                  <span className={`sb-switch ${porCorreo ? 'is-on' : ''}`} />
                </button>
              </footer>
            )}
          </section>
        </div>
      )}
    </>
  );
}
