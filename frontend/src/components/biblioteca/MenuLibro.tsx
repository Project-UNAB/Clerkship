import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, CloudUpload, Download, Heart, HeartOff, PenLine, X } from 'lucide-react';
import type { Articulo } from '../../data/articulosApi';

export type AccionMenuLibro = 'abrir' | 'favorito' | 'nube' | 'descargar';

interface MenuProps {
  articulo: Articulo;
  x: number;
  y: number;
  esFavorito: boolean;
  onAccion: (accion: AccionMenuLibro) => void;
  onClose: () => void;
}

/** Menú propio de la biblioteca al hacer clic derecho sobre un libro. */
export function MenuLibro({ articulo, x, y, esFavorito, onAccion, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Que no se salga de la pantalla
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);

  useEffect(() => {
    const fuera = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const botones = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const i = botones.indexOf(document.activeElement as HTMLButtonElement);
      botones[(i + (e.key === 'ArrowDown' ? 1 : -1) + botones.length) % botones.length]?.focus();
    };
    // Se escucha desde el siguiente ciclo: el clic derecho que abrió el menú todavía
    // está subiendo hasta document y, si no, lo cerraría en el acto.
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', fuera);
      document.addEventListener('contextmenu', fuera);
      window.addEventListener('resize', onClose);
      window.addEventListener('scroll', onClose, true);
    }, 0);
    document.addEventListener('keydown', tecla);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('contextmenu', fuera);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const sinPdf = !articulo.tiene_pdf && !articulo.pdf_url;
  const item = (accion: AccionMenuLibro, icono: React.ReactNode, texto: string, ayuda?: string, deshabilitado = false) => (
    <button type="button" role="menuitem" className="bib-menu-item" disabled={deshabilitado}
      onClick={() => { onClose(); onAccion(accion); }}>
      <span className="bib-menu-ico">{icono}</span>
      <span className="bib-menu-txt">
        {texto}
        {ayuda && <small>{ayuda}</small>}
      </span>
    </button>
  );

  return createPortal(
    <div ref={ref} className="bib-menu" role="menu" aria-label={`Opciones de ${articulo.title}`}
      style={{ left: pos.left, top: pos.top }} onContextMenu={e => e.preventDefault()}>
      <p className="bib-menu-titulo">{articulo.title}</p>
      {item('abrir', <BookOpen size={15} />, 'Abrir el libro')}
      <div className="bib-menu-sep" />
      {item('favorito', esFavorito ? <HeartOff size={15} /> : <Heart size={15} />,
        esFavorito ? 'Quitar de favoritos' : 'Marcar como favorito')}
      {item('nube', <CloudUpload size={15} />, 'Guardar en mi nube', 'Mi nube de Clerkship', sinPdf)}
      {item('descargar', <Download size={15} />, 'Descargar en mi dispositivo', undefined, sinPdf)}
    </div>,
    document.body,
  );
}

interface DialogoProps {
  articulo: Articulo;
  destino: 'nube' | 'descargar';
  paginasConTrazos: number;
  notas: number;
  onElegir: (incluir: boolean) => void;
  onCancelar: () => void;
}

/** Pregunta si el PDF lleva los trazos y notas del usuario o sale como el original. */
export function DialogoIncluirNotas({ articulo, destino, paginasConTrazos, notas, onElegir, onCancelar }: DialogoProps) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [onCancelar]);

  const partes = [
    paginasConTrazos > 0 && `trazos en ${paginasConTrazos} ${paginasConTrazos === 1 ? 'página' : 'páginas'}`,
    notas > 0 && `${notas} ${notas === 1 ? 'nota' : 'notas'}`,
  ].filter(Boolean).join(' y ');

  return createPortal(
    <div className="bib-dialogo-fondo" onMouseDown={onCancelar}>
      <div className="bib-dialogo" role="dialog" aria-modal="true" aria-labelledby="bib-dialogo-titulo"
        onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="bib-dialogo-cerrar" onClick={onCancelar} aria-label="Cancelar"><X size={16} /></button>
        <span className="bib-dialogo-ico"><PenLine size={20} /></span>
        <h3 id="bib-dialogo-titulo">¿Mantener tus notas y escritos?</h3>
        <p>
          En <strong>{articulo.title}</strong> tienes {partes}. Puedes {destino === 'nube' ? 'guardar' : 'descargar'} el
          PDF con ellos dibujados en las páginas (y un resumen de tus notas al final) o el original, sin cambios.
        </p>
        <div className="bib-dialogo-botones">
          <button type="button" className="bib-dialogo-btn" onClick={() => onElegir(false)}>Solo el original</button>
          <button type="button" className="bib-dialogo-btn is-principal" onClick={() => onElegir(true)} autoFocus>
            Incluir mis notas
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
