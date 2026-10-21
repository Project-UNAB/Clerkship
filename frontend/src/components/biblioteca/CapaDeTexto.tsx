/**
 * Texto seleccionable del visor: la capa de texto de PDF.js (texto real del PDF,
 * transparente, sobre la imagen de la página) para seleccionar palabras o
 * párrafos y copiarlos. Con algo seleccionado aparece un botón para copiarlo o
 * convertirlo en una nota.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { Copy, MessageSquarePlus } from 'lucide-react';
import type { ZonaNota } from '../../data/articulosApi';

// react-pageflip empieza a pasar la hoja con mousedown/touchstart: sobre una palabra
// se corta para que arrastrar seleccione texto (en los márgenes la hoja sigue pasando).
const EVENTOS_DEL_LIBRO = ['mousedown', 'touchstart'] as const;

export function CapaDeTexto({ pdfDoc, pagina, ancho, activa }: { pdfDoc: any; pagina: number; ancho: number; activa: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const div = ref.current;
    if (!div || !activa || !pdfDoc) return;
    let cancelado = false;
    let capa: any = null;
    (async () => {
      const page = await pdfDoc.getPage(pagina);
      if (cancelado) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: ancho / base.width });
      div.replaceChildren();
      // PDF.js ubica y dimensiona el texto con esta variable (píxeles por unidad del PDF).
      div.style.setProperty('--total-scale-factor', String(viewport.scale));
      capa = new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container: div, viewport });
      await capa.render();
    })().catch((err: any) => {
      if (!cancelado && err?.name !== 'AbortException') console.warn(`No se pudo preparar el texto de la página ${pagina}:`, err);
    });
    return () => {
      cancelado = true;
      try { capa?.cancel?.(); } catch { /* ignore */ }
      div.replaceChildren();
    };
  }, [pdfDoc, pagina, ancho, activa]);

  useEffect(() => {
    const div = ref.current;
    if (!div) return;
    const cortar = (e: Event) => { if (e.target !== div) e.stopPropagation(); };
    for (const ev of EVENTOS_DEL_LIBRO) div.addEventListener(ev, cortar, { passive: true });
    return () => { for (const ev of EVENTOS_DEL_LIBRO) div.removeEventListener(ev, cortar); };
  }, []);

  if (!activa) return null;
  return <div ref={ref} className="textLayer fb-capa-texto" data-pagina={pagina} />;
}

interface Seleccion { pagina: number; texto: string; zona: ZonaNota; x: number; y: number }

/** Lee la selección actual si está dentro de una sola página del visor. */
function seleccionEnPagina(): Seleccion | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const texto = sel.toString().replace(/\s+/g, ' ').trim();
  if (!texto) return null;
  const rango = sel.getRangeAt(0);
  const nodo = rango.commonAncestorContainer;
  const capa = (nodo instanceof Element ? nodo : nodo.parentElement)?.closest<HTMLElement>('.fb-capa-texto');
  if (!capa) return null;
  const caja = capa.getBoundingClientRect();
  const rects = [...rango.getClientRects()].filter(r => r.width > 0 && r.height > 0);
  if (!rects.length || caja.width === 0) return null;
  const izq = Math.min(...rects.map(r => r.left));
  const der = Math.max(...rects.map(r => r.right));
  const arr = Math.min(...rects.map(r => r.top));
  const aba = Math.max(...rects.map(r => r.bottom));
  const acotar = (n: number) => Math.min(1, Math.max(0, n));
  const x = acotar((izq - caja.left) / caja.width);
  const y = acotar((arr - caja.top) / caja.height);
  const w = Math.max(0.005, acotar((der - caja.left) / caja.width) - x);
  const h = Math.max(0.005, acotar((aba - caja.top) / caja.height) - y);
  return {
    pagina: Number(capa.dataset.pagina),
    texto: texto.slice(0, 2000),
    zona: { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) },
    x: (izq + der) / 2,
    y: arr,
  };
}

/** Botones flotantes junto al texto seleccionado: copiar o crear una nota con él. */
export function MenuDeSeleccion({ puedeAnotar, onNota }: {
  puedeAnotar: boolean;
  onNota: (pagina: number, zona: ZonaNota, cita: string) => void;
}) {
  const [sel, setSel] = useState<Seleccion | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let cuadro = 0;
    const leer = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => { setSel(seleccionEnPagina()); setCopiado(false); });
    };
    document.addEventListener('selectionchange', leer);
    window.addEventListener('resize', leer);
    return () => {
      cancelAnimationFrame(cuadro);
      document.removeEventListener('selectionchange', leer);
      window.removeEventListener('resize', leer);
    };
  }, []);

  if (!sel) return null;
  const arriba = sel.y > 70;
  return createPortal(
    <div
      className="fb-menu-seleccion"
      style={{ left: Math.max(90, Math.min(sel.x, window.innerWidth - 90)), top: arriba ? sel.y - 8 : sel.y + 28 }}
      data-arriba={arriba}
      onMouseDown={e => e.preventDefault()} // no borrar la selección al tocar los botones
    >
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(sel.texto); setCopiado(true); } catch { document.execCommand('copy'); setCopiado(true); }
      }}>
        <Copy size={14} /> {copiado ? 'Copiado' : 'Copiar'}
      </button>
      {puedeAnotar && (
        <button type="button" onClick={() => { onNota(sel.pagina, sel.zona, sel.texto); window.getSelection()?.removeAllRanges(); }}>
          <MessageSquarePlus size={14} /> Agregar nota
        </button>
      )}
    </div>,
    document.body,
  );
}
