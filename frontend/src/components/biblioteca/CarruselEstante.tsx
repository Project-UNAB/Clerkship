import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, MoveHorizontal } from 'lucide-react';

/** Píxeles que hay que mover el mouse para que cuente como arrastre y no como clic. */
const UMBRAL_ARRASTRE = 6;

interface Props {
  children: ReactNode;
}

/** Fila de libros que se mueve a los lados como un carrusel: arrastrando con el
 * mouse, con las flechas o con el gesto del touchpad / el dedo. Un degradado en
 * el borde y las flechas indican que hay más libros hacia ese lado. */
export default function CarruselEstante({ children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [haciaIzq, setHaciaIzq] = useState(false);
  const [haciaDer, setHaciaDer] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  // El aviso «Arrastra para ver más» se va en cuanto el usuario mueve este estante.
  const [usado, setUsado] = useState(false);
  const arrastre = useRef<{ x: number; scroll: number; movido: boolean; id: number; elemento: HTMLElement } | null>(null);
  const evitarClic = useRef(false);

  const actualizar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const izq = el.scrollLeft > 2;
    const der = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setHaciaIzq(izq);
    setHaciaDer(der);
    if (izq) setUsado(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    actualizar();
    const obs = new ResizeObserver(actualizar);
    obs.observe(el);
    // Los libros entran animados: se vuelve a medir cuando cambia el contenido.
    const mut = new MutationObserver(actualizar);
    mut.observe(el, { childList: true });
    return () => { obs.disconnect(); mut.disconnect(); };
  }, [actualizar]);

  function mover(sentido: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: sentido * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  // ── Arrastrar con el mouse sobre los libros (en pantallas táctiles el navegador ya
  // desliza solo) o, con cualquier puntero, sobre la tabla del estante ──
  function alBajar(e: React.PointerEvent<HTMLDivElement>) {
    const esTabla = e.currentTarget !== ref.current;
    if ((!esTabla && e.pointerType !== 'mouse') || e.button !== 0 || !ref.current) return;
    arrastre.current = { x: e.clientX, scroll: ref.current.scrollLeft, movido: false, id: e.pointerId, elemento: e.currentTarget };
    // Sobre la tabla no hay nada que abrir: el arrastre empieza de una vez (puño cerrado).
    if (esTabla) {
      e.preventDefault();
      arrastre.current.movido = true;
      setArrastrando(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function alMover(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrastre.current;
    const el = ref.current;
    if (!a || !el) return;
    const dx = e.clientX - a.x;
    if (!a.movido && Math.abs(dx) < UMBRAL_ARRASTRE) return;
    if (!a.movido) {
      a.movido = true;
      setArrastrando(true);
      a.elemento.setPointerCapture(a.id);
    }
    el.scrollLeft = a.scroll - dx;
  }

  function alSoltar() {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a?.movido) return;
    setArrastrando(false);
    // El clic que llega al soltar no debe abrir el libro sobre el que terminó el arrastre.
    evitarClic.current = true;
    window.setTimeout(() => { evitarClic.current = false; }, 0);
  }

  function alClicCaptura(e: React.MouseEvent) {
    if (!evitarClic.current) return;
    e.preventDefault();
    e.stopPropagation();
    evitarClic.current = false;
  }

  const desplazable = haciaIzq || haciaDer;

  return (
    <div className={`bib-carrusel ${haciaIzq ? 'hay-izq' : ''} ${haciaDer ? 'hay-der' : ''} ${arrastrando ? 'is-arrastrando' : ''}`}>
      <div
        ref={ref}
        className={`bib-shelf-books bib-carrusel-pista ${arrastrando ? 'is-arrastrando' : ''}`}
        onScroll={actualizar}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onClickCapture={alClicCaptura}
        onDragStart={e => e.preventDefault()}
      >
        {children}
      </div>
      {/* La tabla del estante también se agarra y se arrastra para mover los libros */}
      <div
        className={`bib-shelf-board ${desplazable ? 'bib-shelf-board-agarre' : ''}`}
        onPointerDown={desplazable ? alBajar : undefined}
        onPointerMove={desplazable ? alMover : undefined}
        onPointerUp={desplazable ? alSoltar : undefined}
        onPointerCancel={desplazable ? alSoltar : undefined}
        title={desplazable ? 'Arrastra la tabla para mover los libros' : undefined}
      />
      {haciaDer && !usado && (
        <span className="bib-carrusel-aviso" aria-hidden="true">
          <MoveHorizontal size={12} strokeWidth={2.2} /> Arrastra para ver más
        </span>
      )}
      {haciaIzq && (
        <button type="button" className="bib-carrusel-flecha is-izq" onClick={() => mover(-1)} aria-label="Ver libros anteriores">
          <ChevronLeft size={20} strokeWidth={2.2} />
        </button>
      )}
      {haciaDer && (
        <button type="button" className="bib-carrusel-flecha is-der" onClick={() => mover(1)} aria-label="Ver más libros">
          <ChevronRight size={20} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
