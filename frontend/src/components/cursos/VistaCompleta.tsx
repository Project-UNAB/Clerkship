import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import '../../styles/aulaVistas.css';

interface Props {
  /** Texto pequeño sobre el título (p. ej. «Documento» o «Tarea»). */
  etiqueta?: string;
  titulo: string;
  subtitulo?: ReactNode;
  /** Icono del tipo de contenido, ya con su tamaño. */
  icono?: ReactNode;
  /** Color del tipo de contenido (tiñe el icono). */
  color?: string;
  /** Botones de la barra superior, a la derecha. */
  acciones?: ReactNode;
  /** Texto del botón para volver. */
  volverTexto?: string;
  onClose: () => void;
  /** Fondo del cuerpo: «gris» para documentos, «claro» para formularios. */
  fondo?: 'gris' | 'claro';
  children: ReactNode;
}

/** Contenido que ocupa toda la pantalla (documentos, entregas). Agrega una
 * entrada al historial: el botón «atrás» del navegador o del celular, la
 * flecha de la barra y Escape cierran la vista y dejan el curso como estaba. */
export default function VistaCompleta({
  etiqueta, titulo, subtitulo, icono, color, acciones, volverTexto = 'Volver al curso', onClose, fondo = 'claro', children,
}: Props) {
  const sinMovimiento = useReducedMotion();
  const cerrar = useRef(onClose);
  cerrar.current = onClose;
  const cerradoPorHistorial = useRef(false);
  const agregada = useRef(false);
  const montada = useRef(false);

  useEffect(() => {
    montada.current = true;
    // Una sola entrada aunque React monte dos veces el componente (modo estricto).
    if (!agregada.current) {
      window.history.pushState({ clerkshipVista: true }, '');
      agregada.current = true;
    }
    const alVolver = () => { cerradoPorHistorial.current = true; cerrar.current(); };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Escape dentro de un campo de texto no cierra la vista.
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return;
      window.history.back();
    };
    window.addEventListener('popstate', alVolver);
    window.addEventListener('keydown', alTeclear);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('popstate', alVolver);
      window.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflow;
      montada.current = false;
      // Cerrada por otra vía (no con «atrás»): se quita su entrada del historial,
      // salvo que sea el desmontaje de prueba del modo estricto (vuelve a montarse enseguida).
      window.setTimeout(() => {
        if (montada.current || cerradoPorHistorial.current || !agregada.current) return;
        agregada.current = false;
        if (window.history.state?.clerkshipVista) window.history.back();
      }, 0);
    };
  }, []);

  return createPortal(
    <motion.div
      className={`av-vista is-${fondo}`}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      initial={{ opacity: 0, y: sinMovimiento ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: sinMovimiento ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="av-vista-barra">
        <button type="button" className="av-volver" onClick={() => window.history.back()}>
          <ArrowLeft size={17} /> <span>{volverTexto}</span>
        </button>
        <div className="av-vista-titulos" style={color ? ({ '--av-tipo': color } as React.CSSProperties) : undefined}>
          {icono && <span className="av-vista-icono" aria-hidden="true">{icono}</span>}
          <div className="av-vista-textos">
            {etiqueta && <span className="av-vista-etiqueta">{etiqueta}</span>}
            <h2 className="av-vista-titulo" title={titulo}>{titulo}</h2>
            {subtitulo && <span className="av-vista-sub">{subtitulo}</span>}
          </div>
        </div>
        {acciones && <div className="av-vista-acciones">{acciones}</div>}
      </header>
      <div className="av-vista-cuerpo">{children}</div>
    </motion.div>,
    document.body,
  );
}
