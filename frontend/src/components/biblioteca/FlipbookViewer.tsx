import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  createContext,
  useContext,
  type ReactElement,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as pdfjsLib from 'pdfjs-dist';
import HTMLFlipBookRaw from 'react-pageflip';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  FileText,
  MessageSquareText,
} from 'lucide-react';
import { apiFetch } from '../../data/apiClient';
import { AnotacionesProvider, BotonLapiz, CapaDeAnotaciones, HerramientasDeDibujo, useAnotacionesDelLibro } from './AnotacionesLibro';
import { CapaDeNotas, NotasProvider, PanelDeNotas, useNotasDelLibro } from './NotasLibro';
import '../../styles/flipbook.css';

// Configuración segura del worker de PDF.js
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '5.6.205'}/build/pdf.worker.min.mjs`;
}

// Adaptador de tipos para react-pageflip en React moderno
const HTMLFlipBook = HTMLFlipBookRaw as unknown as ForwardRefExoticComponent<{
  width: number;
  height: number;
  size?: 'fixed' | 'stretch';
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  showCover?: boolean;
  startPage?: number;
  usePortrait?: boolean;
  autoSize?: boolean;
  renderOnlyPageLengthChange?: boolean;
  drawShadow?: boolean;
  flippingTime?: number;
  maxShadowOpacity?: number;
  mobileScrollSupport?: boolean;
  useMouseEvents?: boolean;
  showPageCorners?: boolean;
  className?: string;
  style?: CSSProperties;
  onFlip?: (e: { data: number }) => void;
  children: ReactNode;
} & RefAttributes<any>>;

/** Duración de la animación de pasar la hoja (ms). Las páginas que no se ven se
 * dibujan después de que termina, para no competir con la animación. */
const TIEMPO_DE_HOJA = 420;

/** Lado mayor máximo del canvas de una página (px). 4096 cubre una pantalla 4K a
 * zoom completo y evita canvas gigantes que agotan la memoria gráfica. */
const MAX_LADO_CANVAS = 4096;

/** cMaps de la misma versión de PDF.js que usa la aplicación (sin redirecciones). */
const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '5.6.205'}/cmaps/`;

/** Ejecuta `fn` cuando el navegador quede libre (o, como mucho, tras `limite` ms). */
function cuandoEsteLibre(fn: () => void, limite: number): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: limite });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 0);
  return () => window.clearTimeout(id);
}

/** Las páginas de precarga se dibujan de a una: varias a la vez compiten por el
 * procesador y, con PDF.js, algunas no llegaban a terminar nunca. */
let colaDePrecarga: Promise<void> = Promise.resolve();
function enCola(trabajo: () => Promise<void>): void {
  colaDePrecarga = colaDePrecarga.then(trabajo, trabajo);
}

/* ── Props del Visor Flipbook ────────────────────────────── */
export interface FlipbookViewerProps {
  pdfUrl: string;
  /** Id del recurso: con él se cargan y guardan las anotaciones del usuario (lápiz). */
  articleId?: string;
  title: string;
  authors?: string | null;
  onClose: () => void;
  onDownload?: () => void;
}

/* ── Página individual con Lazy Loading y Cola de Renderizado Prioritaria ── */
interface FlipbookPageNucleoProps {
  pdfDoc: any;
  pageNum: number;
  isActive: boolean;
  isPriority: boolean;
  pageWidth: number;
  pageHeight: number;
  /** Píxeles del canvas por píxel de pantalla: la densidad real de la pantalla
   * multiplicada por el zoom. Con esto el PDF se ve nítido a cualquier zoom. */
  nitidez: number;
  isCover?: boolean;
  isBackCover?: boolean;
  isLeft?: boolean;
  /** Vista normal: una hoja suelta, sin sombra de lomo. */
  plana?: boolean;
}

const FlipbookPageNucleo = React.memo(
  React.forwardRef<HTMLDivElement, FlipbookPageNucleoProps>(
    (
      {
        pdfDoc,
        pageNum,
        isActive,
        isPriority,
        pageWidth,
        pageHeight,
        nitidez,
        isCover,
        isBackCover,
        isLeft,
        plana,
      },
      ref
    ) => {
      const canvasRef = useRef<HTMLCanvasElement | null>(null);
      const renderTaskRef = useRef<any>(null);
      const renderedSizeRef = useRef<{ w: number; h: number; n: number } | null>(null);
      const [rendered, setRendered] = useState(false);
      const [rendering, setRendering] = useState(false);

      useEffect(() => {
        // 1. Si la página no está activa dentro de la ventana de memoria, cancelar render
        if (!isActive || !pdfDoc) {
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
            } catch {
              /* ignore */
            }
            renderTaskRef.current = null;
          }
          return;
        }

        // 2. Si ya está renderizada y las dimensiones no cambiaron, conservar textura en GPU
        if (
          rendered &&
          renderedSizeRef.current &&
          renderedSizeRef.current.w === pageWidth &&
          renderedSizeRef.current.h === pageHeight &&
          renderedSizeRef.current.n === nitidez &&
          canvasRef.current &&
          canvasRef.current.width > 0
        ) {
          return;
        }

        let isMounted = true;
        let timeoutId: any = null;
        let cancelarEspera: (() => void) | null = null;

        const executeRender = async () => {
          setRendering(true);
          try {
            const page = await pdfDoc.getPage(pageNum);
            if (!isMounted) return;

            const baseViewport = page.getViewport({ scale: 1 });
            const scale = pageWidth / baseViewport.width;
            // Resolución completa: un píxel del PDF por cada píxel físico de la pantalla
            // (densidad × zoom). Solo se limita el lado mayor a MAX_LADO_CANVAS para no
            // agotar la memoria gráfica en pantallas 4K con mucho zoom.
            const lado = Math.max(baseViewport.width, baseViewport.height) * scale;
            const densidad = Math.min(nitidez, MAX_LADO_CANVAS / lado);
            const viewport = page.getViewport({ scale: scale * densidad });

            // Se dibuja en un canvas aparte y luego se copia: así, al cambiar el zoom,
            // la página sigue mostrando la versión anterior en vez de quedar en blanco.
            const lienzo = document.createElement('canvas');
            lienzo.width = Math.floor(viewport.width);
            lienzo.height = Math.floor(viewport.height);
            const ctx = lienzo.getContext('2d', { alpha: false, willReadFrequently: false });
            if (!ctx) return;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, lienzo.width, lienzo.height);

            if (renderTaskRef.current) {
              try {
                renderTaskRef.current.cancel();
              } catch {
                /* ignore */
              }
            }

            const task = page.render({
              canvasContext: ctx,
              viewport,
            });
            renderTaskRef.current = task;
            await task.promise;

            const canvas = canvasRef.current;
            if (!canvas || !isMounted) return;
            canvas.width = lienzo.width;
            canvas.height = lienzo.height;
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            const visible = canvas.getContext('2d', { alpha: false });
            visible?.drawImage(lienzo, 0, 0);
            lienzo.width = 0; // libera la memoria del canvas temporal

            if (isMounted) {
              renderedSizeRef.current = { w: pageWidth, h: pageHeight, n: nitidez };
              setRendered(true);
              setRendering(false);
            }
          } catch (err: any) {
            if (err?.name !== 'RenderingCancelledException' && isMounted) {
              console.error(`Error renderizando página ${pageNum}:`, err);
              setRendering(false);
            }
          }
        };

        // Si es prioritaria (página visible en pantalla), renderizar de inmediato.
        // Si es precarga adyacente, esperar a que termine la animación de la hoja y a
        // que el navegador quede libre: así dibujar no le roba cuadros a la animación.
        if (isPriority) {
          executeRender();
        } else {
          timeoutId = setTimeout(() => {
            cancelarEspera = cuandoEsteLibre(() => enCola(() => (isMounted ? executeRender() : Promise.resolve())), 700);
          }, TIEMPO_DE_HOJA + 40);
        }

        return () => {
          isMounted = false;
          if (timeoutId) clearTimeout(timeoutId);
          cancelarEspera?.();
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
            } catch {
              /* ignore */
            }
            renderTaskRef.current = null;
          }
        };
      }, [pdfDoc, pageNum, isActive, isPriority, pageWidth, pageHeight, nitidez, rendered]);

      // Liberación instantánea de memoria VRAM cuando la página sale de la ventana activa
      useEffect(() => {
        if (!isActive && rendered && canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, 1, 1);
          renderedSizeRef.current = null;
          setRendered(false);
        }
      }, [isActive, rendered]);

      const classNames = [
        'fb-page-wrapper',
        plana ? 'fb-page-plana' : '',
        !plana && isCover ? 'fb-page-cover' : '',
        !plana && isBackCover ? 'fb-page-cover' : '',
        plana ? '' : isLeft ? 'fb-page-left' : 'fb-page-right',
      ]
        .filter(Boolean)
        .join(' ');

      return (
        <div
          ref={ref}
          className={classNames}
          style={{ width: pageWidth, height: pageHeight }}
        >
          <div className="fb-page-canvas-container">
            <canvas
              ref={canvasRef}
              className="fb-page-canvas"
              style={{ display: rendered ? 'block' : 'none' }}
            />
            <CapaDeAnotaciones pagina={pageNum} activa={isActive} ancho={pageWidth} alto={pageHeight} nitidez={nitidez} />
            <CapaDeNotas pagina={pageNum} activa={isActive} />

            {!rendered && (
              <div className="fb-page-placeholder">
                {rendering ? (
                  <div
                    className="fb-spinner"
                    style={{ width: 28, height: 28, borderWidth: 2 }}
                  />
                ) : (
                  <BookOpen size={24} opacity={0.3} />
                )}
                <span className="fb-page-num-tag">
                  {isCover ? 'Portada' : isBackCover ? 'Fin' : pageNum}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
  ),
  (prev, next) => {
    return (
      prev.pageNum === next.pageNum &&
      prev.isActive === next.isActive &&
      prev.isPriority === next.isPriority &&
      prev.pageWidth === next.pageWidth &&
      prev.pageHeight === next.pageHeight &&
      prev.nitidez === next.nitidez &&
      prev.pdfDoc === next.pdfDoc
    );
  }
);
FlipbookPageNucleo.displayName = 'FlipbookPageNucleo';

/** Lo que cambia mientras se lee el libro. react-pageflip crea las páginas una sola
 * vez y no les vuelve a pasar props, así que la página actual, el tamaño y la
 * nitidez les llegan por contexto, que sí se actualiza. */
interface EstadoDelVisor {
  currentPage: number;
  numPages: number;
  isMobile: boolean;
  pageWidth: number;
  pageHeight: number;
  nitidez: number;
}
const VisorContext = createContext<EstadoDelVisor>({
  currentPage: 0, numPages: 0, isMobile: false, pageWidth: 480, pageHeight: 680, nitidez: 1,
});

interface FlipbookPageProps {
  pdfDoc: any;
  index: number;
  isCover?: boolean;
  isBackCover?: boolean;
  isLeft?: boolean;
}

const FlipbookPage = React.forwardRef<HTMLDivElement, FlipbookPageProps>(({ pdfDoc, index, ...resto }, ref) => {
  const v = useContext(VisorContext);
  // Ventana de memoria: dos páginas atrás y, hacia adelante, el par siguiente completo
  // (en escritorio se ven dos a la vez). Como mucho 6 canvas a la vez.
  const adelante = v.isMobile ? 2 : 3;
  const isActive = v.numPages <= 6 || (index >= v.currentPage - 2 && index <= v.currentPage + adelante);
  // Páginas a la vista: se dibujan de inmediato.
  const isPriority = index === v.currentPage || (!v.isMobile && index === v.currentPage + 1);
  return (
    <FlipbookPageNucleo
      ref={ref}
      pdfDoc={pdfDoc}
      pageNum={index + 1}
      isActive={isActive}
      isPriority={isPriority}
      pageWidth={v.pageWidth}
      pageHeight={v.pageHeight}
      nitidez={v.nitidez}
      {...resto}
    />
  );
});
FlipbookPage.displayName = 'FlipbookPage';

/** Ancho del panel de notas (px); el libro o la vista normal se corren a la izquierda. */
const ANCHO_PANEL_NOTAS = 340;

/* ── Vista normal: las páginas una debajo de otra, sin animación ── */
type ModoVista = 'libro' | 'normal';
const CLAVE_MODO = 'clerkship_visor_modo';
/** Ancho máximo de una página en la vista normal (al 100 %). */
const ANCHO_NORMAL_MAX = 920;

function leerModo(): ModoVista {
  try {
    return localStorage.getItem(CLAVE_MODO) === 'normal' ? 'normal' : 'libro';
  } catch {
    return 'libro';
  }
}

interface VistaNormalProps {
  pdfDoc: any;
  numPages: number;
  zoom: number;
  paginaInicial: number;
  onPagina: (indice: number) => void;
  /** El visor guarda aquí cómo saltar a una página (botones, campo y teclado). */
  irARef: React.MutableRefObject<((indice: number) => void) | null>;
}

function VistaNormal({ pdfDoc, numPages, zoom, paginaInicial, onPagina, irARef }: VistaNormalProps) {
  const contRef = useRef<HTMLDivElement>(null);
  const paginasRef = useRef<(HTMLDivElement | null)[]>([]);
  const [anchoCont, setAnchoCont] = useState(900);
  const [proporcion, setProporcion] = useState(1.414); // alto / ancho de la primera página
  const [cercanas, setCercanas] = useState<Set<number>>(() => new Set([paginaInicial, paginaInicial + 1]));
  const visibles = useRef(new Map<number, number>());

  useEffect(() => {
    let vigente = true;
    pdfDoc.getPage(1).then((p: any) => {
      const v = p.getViewport({ scale: 1 });
      if (vigente && v.width > 0) setProporcion(v.height / v.width);
    }).catch(() => undefined);
    return () => { vigente = false; };
  }, [pdfDoc]);

  useEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const medir = () => setAnchoCont(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const ancho = Math.round(Math.min(anchoCont - 32, ANCHO_NORMAL_MAX) * zoom);
  const alto = Math.round(ancho * proporcion);

  // Se dibujan solo las páginas cerca de la pantalla; las lejanas liberan su canvas.
  useEffect(() => {
    const raiz = contRef.current;
    if (!raiz) return;
    const cerca = new IntersectionObserver(entradas => {
      setCercanas(prev => {
        const sig = new Set(prev);
        let cambio = false;
        for (const e of entradas) {
          const i = Number((e.target as HTMLElement).dataset.indice);
          if (e.isIntersecting && !sig.has(i)) { sig.add(i); cambio = true; }
          if (!e.isIntersecting && sig.has(i)) { sig.delete(i); cambio = true; }
        }
        return cambio ? sig : prev;
      });
    }, { root: raiz, rootMargin: '1200px 0px' });
    // La página que más se ve es la «actual» (para el indicador n / N).
    const actual = new IntersectionObserver(entradas => {
      for (const e of entradas) {
        visibles.current.set(Number((e.target as HTMLElement).dataset.indice), e.intersectionRatio);
      }
      let mejor = -1;
      let max = 0;
      visibles.current.forEach((r, i) => { if (r > max) { max = r; mejor = i; } });
      if (mejor >= 0) onPagina(mejor);
    }, { root: raiz, threshold: [0, 0.15, 0.35, 0.55, 0.75, 1] });
    paginasRef.current.forEach(p => { if (p) { cerca.observe(p); actual.observe(p); } });
    return () => { cerca.disconnect(); actual.disconnect(); };
  }, [numPages, onPagina]);

  useEffect(() => {
    irARef.current = (indice: number) => {
      paginasRef.current[indice]?.scrollIntoView({ block: 'start' });
    };
    return () => { irARef.current = null; };
  }, [irARef]);

  // Al entrar, se abre en la página donde iba el lector.
  useEffect(() => {
    if (paginaInicial > 0) paginasRef.current[paginaInicial]?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const densidad = window.devicePixelRatio || 1;
  return (
    <div className="fb-normal" ref={contRef}>
      {Array.from({ length: numPages }, (_, i) => (
        <div
          key={i}
          ref={el => { paginasRef.current[i] = el; }}
          data-indice={i}
          className="fb-normal-pagina"
          style={{ width: ancho, height: alto }}
        >
          <FlipbookPageNucleo
            pdfDoc={pdfDoc}
            pageNum={i + 1}
            isActive={cercanas.has(i)}
            isPriority={cercanas.has(i)}
            pageWidth={ancho}
            pageHeight={alto}
            nitidez={densidad}
            plana
          />
          <span className="fb-normal-num">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Componente Principal FlipbookViewer
   ══════════════════════════════════════════════════════════ */
export default function FlipbookViewer({
  pdfUrl,
  articleId,
  title,
  authors,
  onClose,
  onDownload,
}: FlipbookViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<any>(null);
  const docRef = useRef<any>(null);
  // Número de la carga vigente: si llega una carga vieja (por ejemplo, el doble
  // montaje de React en desarrollo), se descarta y se libera.
  const cargaRef = useRef(0);

  // Lo que el usuario subraya o dibuja (solo lo suyo), guardado en el backend.
  const anotaciones = useAnotacionesDelLibro(articleId);
  const { activo: dibujando, setActivo: setDibujando, deshacer } = anotaciones;
  // Notas y comentarios: se marcan con el lápiz (herramienta «Nota») y se listan a la derecha.
  const notas = useNotasDelLibro(articleId);
  const marcandoNota = dibujando && anotaciones.herramienta === 'nota';
  const panelNotas = notas.panelAbierto;

  // Estados del visor
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(0); // 0-indexed
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingStatus, setLoadingStatus] = useState<string>('Conectando con el documento...');
  const [error, setError] = useState<string | null>(null);
  // Libro (con la animación de pasar hojas) o normal (páginas una debajo de otra).
  const [modo, setModo] = useState<ModoVista>(leerModo);
  const irANormalRef = useRef<((indice: number) => void) | null>(null);
  const esNormal = modo === 'normal';
  const cambiarModo = useCallback((nuevo: ModoVista) => {
    setModo(nuevo);
    try { localStorage.setItem(CLAVE_MODO, nuevo); } catch { /* sin almacenamiento local */ }
  }, []);
  const alVerPagina = useCallback((i: number) => setCurrentPage(i), []);
  // Con el lápiz activo en el libro se deja lugar abajo para la barra de herramientas,
  // y con el panel de notas abierto, a la derecha (en pantallas anchas).
  const reservaAbajoRef = useRef(0);
  const reservaDerRef = useRef(0);

  // Dimensiones y adaptabilidad
  const [zoom, setZoom] = useState<number>(1);
  // El zoom se ve al instante (escala CSS); la página se vuelve a dibujar con la
  // resolución nueva cuando el usuario deja de cambiarlo, no en cada pulsación.
  const [zoomNitido, setZoomNitido] = useState<number>(1);
  useEffect(() => {
    const id = window.setTimeout(() => setZoomNitido(zoom), 250);
    return () => window.clearTimeout(id);
  }, [zoom]);
  const nitidez = Math.round((window.devicePixelRatio || 1) * Math.max(zoomNitido, 1) * 100) / 100;
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({
    width: 480,
    height: 680,
  });

  // Detección de tamaño de pantalla y orientación
  const updateDimensions = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mobile = vw <= 768;
    setIsMobile(mobile);

    // Altura utilizable: solo se descuenta la cabecera (con la barra de controles
    // en el centro; en el móvil la barra va en una segunda fila) y un margen abajo.
    const availHeight = Math.max(vh - (mobile ? 128 : 84) - reservaAbajoRef.current, 360);
    // Ancho utilizable por página (en escritorio se ven dos, con las flechas a los lados)
    const availWidth = mobile ? Math.max(vw - 20, 280) : Math.max((vw - 140 - reservaDerRef.current) / 2, 260);

    // Proporción estándar de libro / A4 (~1 : 1.414)
    const ratio = 1 / 1.414;
    let targetH = Math.min(availHeight, 1600);
    let targetW = Math.round(targetH * ratio);

    if (targetW > availWidth) {
      targetW = availWidth;
      targetH = Math.round(targetW / ratio);
    }

    // Solo si cambió: un tamaño nuevo obliga a volver a dibujar todas las páginas.
    setPageDimensions(prev =>
      prev.width === targetW && prev.height === targetH ? prev : { width: targetW, height: targetH }
    );
  }, []);

  useEffect(() => {
    updateDimensions();
    // Durante un redimensionado el evento llega decenas de veces por segundo: se
    // atiende como mucho una vez por cuadro.
    let pendiente = 0;
    const alRedimensionar = () => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        updateDimensions();
      });
    };
    window.addEventListener('resize', alRedimensionar);
    return () => {
      window.removeEventListener('resize', alRedimensionar);
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, [updateDimensions]);

  // Carga del Documento PDF con PDF.js
  const loadPdf = useCallback(async () => {
    if (!pdfUrl) {
      setError('No se proporcionó una URL válida para el libro.');
      setLoading(false);
      return;
    }

    const carga = ++cargaRef.current;
    setLoading(true);
    setError(null);
    setLoadingStatus('Descargando archivo PDF...');

    /** Usa el documento solo si esta carga sigue siendo la vigente. */
    const adoptar = (doc: any): boolean => {
      if (carga !== cargaRef.current) {
        doc.destroy?.();
        return false;
      }
      docRef.current?.destroy?.();
      docRef.current = doc;
      return true;
    };

    try {
      let resolvedUrl = pdfUrl;

      // Un endpoint de la API (/api/.../descarga) devuelve el enlace firmado de R2.
      // Va al backend con apiFetch: un fetch relativo iría al servidor del frontend
      // y recibiría el index.html en vez del JSON.
      if (pdfUrl.startsWith('/api/')) {
        setLoadingStatus('Obteniendo enlace seguro de lectura...');
        const json = await apiFetch<{ url?: string }>(pdfUrl);
        if (!json?.url) throw new Error('El servidor no devolvió el enlace del PDF.');
        resolvedUrl = json.url;
      }

      setLoadingStatus('Procesando páginas del libro...');
      const loadingTask = pdfjsLib.getDocument({
        url: resolvedUrl,
        cMapUrl: CMAP_URL,
        cMapPacked: true,
        withCredentials: false,
      });

      loadingTask.onProgress = (progressData: { loaded: number; total: number }) => {
        if (progressData.total > 0) {
          const pct = Math.round((progressData.loaded / progressData.total) * 100);
          setLoadingStatus(`Cargando libro: ${pct}%...`);
        }
      };

      const doc = await loadingTask.promise;
      if (!adoptar(doc)) return;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setCurrentPage(0);
      setLoading(false);
    } catch (err: any) {
      if (carga !== cargaRef.current) return; // una carga descartada no muestra errores
      console.error('Error al cargar PDF en FlipbookViewer:', err);
      // Cada libro muestra solo su propio PDF: si no abre, se avisa (antes se
      // cargaba en silencio un PDF de muestra y todos los libros parecían iguales).
      setError(
        err?.message?.includes('Missing PDF')
          ? 'El archivo PDF del libro no fue encontrado en el servidor.'
          : 'No se pudo abrir el libro. Verifica tu conexión a internet o intenta de nuevo.'
      );
      setLoading(false);
    }
  }, [pdfUrl]);

  useEffect(() => {
    loadPdf();

    // Al cerrar el visor se libera el documento y el trabajo de PDF.js asociado.
    return () => {
      cargaRef.current++; // cualquier carga en curso ya no es la vigente
      try {
        docRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      docRef.current = null;
    };
  }, [loadPdf]);

  // Controles de Navegación del Flipbook
  const handleFlipPrev = useCallback(() => {
    if (esNormal) {
      irANormalRef.current?.(Math.max(0, currentPage - 1));
    } else if (bookRef.current?.pageFlip) {
      bookRef.current.pageFlip().flipPrev();
    }
  }, [esNormal, currentPage]);

  const handleFlipNext = useCallback(() => {
    if (esNormal) {
      irANormalRef.current?.(Math.min(numPages - 1, currentPage + 1));
    } else if (bookRef.current?.pageFlip) {
      bookRef.current.pageFlip().flipNext();
    }
  }, [esNormal, currentPage, numPages]);

  const handlePageJump = useCallback(
    (targetPage1Indexed: number) => {
      const idx = Math.max(0, Math.min(numPages - 1, targetPage1Indexed - 1));
      if (esNormal) {
        irANormalRef.current?.(idx);
      } else if (bookRef.current?.pageFlip) {
        bookRef.current.pageFlip().turnToPage(idx);
      }
    },
    [numPages, esNormal]
  );

  // Barra de herramientas del lápiz abajo: en el libro se le hace lugar.
  useEffect(() => {
    reservaAbajoRef.current = dibujando && !esNormal ? 64 : 0;
    reservaDerRef.current = panelNotas && window.innerWidth > 900 ? ANCHO_PANEL_NOTAS : 0;
    updateDimensions();
  }, [dibujando, esNormal, panelNotas, updateDimensions]);

  // Navegación con teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      if (destino && (destino.tagName === 'INPUT' || destino.tagName === 'TEXTAREA' || destino.isContentEditable)) return;
      if (dibujando && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        deshacer();
      } else if (e.key === 'Escape') {
        // Con el lápiz activo, Esc primero lo apaga; otra vez, cierra el visor.
        if (dibujando) setDibujando(false);
        else onClose();
      } else if (e.key === 'ArrowLeft') {
        handleFlipPrev();
      } else if (e.key === 'ArrowRight') {
        handleFlipNext();
      } else if (e.key === '+' || e.key === '=') {
        setZoom(z => Math.min(z + 0.15, 1.8));
      } else if (e.key === '-') {
        setZoom(z => Math.max(z - 0.15, 0.7));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleFlipPrev, handleFlipNext, dibujando, deshacer, setDibujando]);

  // Pantalla Completa
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Páginas del libro filtradas y memoizadas (vital para react-pageflip)
  const bookPagesList = useMemo<ReactElement[]>(() => {
    if (!pdfDoc || numPages <= 0) return [];

    const pages: ReactElement[] = [];
    for (let i = 0; i < numPages; i++) {
      const pageNum = i + 1;
      const isCover = i === 0;
      const isBackCover = i === numPages - 1;
      const isLeft = i % 2 === 1;

      pages.push(
        <FlipbookPage
          key={`page-${pageNum}`}
          pdfDoc={pdfDoc}
          index={i}
          isCover={isCover}
          isBackCover={isBackCover}
          isLeft={isLeft}
        />
      );
    }
    return pages;
  }, [pdfDoc, numPages]);

  const estadoDelVisor = useMemo<EstadoDelVisor>(() => ({
    currentPage, numPages, isMobile, nitidez,
    pageWidth: pageDimensions.width, pageHeight: pageDimensions.height,
  }), [currentPage, numPages, isMobile, nitidez, pageDimensions]);

  // Páginas a la vista (números desde 1): en escritorio, la portada sola y luego de a dos.
  const paginasALaVista = useMemo(() => {
    const una = esNormal || isMobile || currentPage === 0 || currentPage >= numPages - 1;
    return una ? [currentPage + 1] : [currentPage + 1, currentPage + 2];
  }, [currentPage, numPages, isMobile, esNormal]);

  // Formato de texto del indicador de página
  const pageIndicatorText = useMemo(() => {
    if (numPages === 0) return '';
    if (esNormal) return `Página ${currentPage + 1} de ${numPages}`;
    if (currentPage === 0) return `Portada (1 de ${numPages})`;
    if (currentPage === numPages - 1) return `Contraportada (${numPages} de ${numPages})`;
    if (isMobile) return `Página ${currentPage + 1} de ${numPages}`;

    // Vista de 2 páginas en escritorio
    const leftNum = currentPage;
    const rightNum = Math.min(currentPage + 1, numPages);
    return `Páginas ${leftNum} - ${rightNum} de ${numPages}`;
  }, [currentPage, numPages, isMobile, esNormal]);

  const listo = !loading && !error && numPages > 0;

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        className={`fb-backdrop${esNormal ? ' is-normal' : ''}${panelNotas ? ' con-notas' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* ══ Header Flotante Superior ══ */}
        <div className="fb-header">
          <div className="fb-header-info">
            <h2 className="fb-header-title">{title}</h2>
            {authors && <p className="fb-header-author">{authors}</p>}
          </div>

          {/* ══ Controles en el centro: páginas · zoom · vista · lápiz ══ */}
          {listo && (
            <div className="fb-toolbar" role="toolbar" aria-label="Controles del visor">
              <div className="fb-tb-grupo" title={pageIndicatorText}>
                <button type="button" className="fb-tb-btn" title="Página anterior (←)" aria-label="Página anterior"
                  onClick={handleFlipPrev} disabled={currentPage <= 0}>
                  <ChevronLeft size={17} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={currentPage + 1}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) handlePageJump(val);
                  }}
                  className="fb-tb-pagina"
                  aria-label="Ir a la página"
                  title="Escribe un número de página para ir directamente"
                />
                <span className="fb-tb-total">/ {numPages}</span>
                <button type="button" className="fb-tb-btn" title="Página siguiente (→)" aria-label="Página siguiente"
                  onClick={handleFlipNext} disabled={currentPage >= numPages - 1}>
                  <ChevronRight size={17} />
                </button>
              </div>

              <span className="fb-tb-sep" />

              <div className="fb-tb-grupo fb-tb-zoom">
                <button type="button" className="fb-tb-btn" title="Alejar (-)" aria-label="Alejar"
                  onClick={() => setZoom(z => Math.max(z - 0.15, 0.65))} disabled={zoom <= 0.7}>
                  <ZoomOut size={16} />
                </button>
                <button type="button" className="fb-tb-zoom-valor" title="Restablecer al 100 %" onClick={() => setZoom(1)}>
                  {Math.round(zoom * 100)}%
                </button>
                <button type="button" className="fb-tb-btn" title="Acercar (+)" aria-label="Acercar"
                  onClick={() => setZoom(z => Math.min(z + 0.15, 1.8))} disabled={zoom >= 1.8}>
                  <ZoomIn size={16} />
                </button>
              </div>

              <span className="fb-tb-sep" />

              {/* Vista: libro (pasar hojas) o normal (página por página, sin animación) */}
              <div className="fb-vista" role="radiogroup" aria-label="Vista del documento">
                <button type="button" role="radio" aria-checked={!esNormal}
                  className={`fb-vista-btn${!esNormal ? ' is-activo' : ''}`}
                  onClick={() => cambiarModo('libro')} title="Vista de libro: pasar las hojas">
                  <BookOpen size={15} /> <span>Libro</span>
                </button>
                <button type="button" role="radio" aria-checked={esNormal}
                  className={`fb-vista-btn${esNormal ? ' is-activo' : ''}`}
                  onClick={() => cambiarModo('normal')} title="Vista normal: página por página, sin animación">
                  <FileText size={15} /> <span>Normal</span>
                </button>
              </div>

              <span className="fb-tb-sep" />

              {/* Lápiz: subrayar o dibujar (solo lo ve el usuario) */}
              <BotonLapiz anotaciones={anotaciones} className="fb-tb-btn" />
              <button
                type="button"
                className={`fb-tb-btn fb-tb-notas${panelNotas ? ' is-activo' : ''}`}
                onClick={() => notas.setPanelAbierto(!panelNotas)}
                aria-pressed={panelNotas}
                aria-label={panelNotas ? 'Esconder las notas' : 'Ver mis notas y comentarios'}
                title={panelNotas ? 'Esconder las notas' : 'Mis notas y comentarios'}
              >
                <MessageSquareText size={16} />
                {notas.notas.length > 0 && <span className="fb-tb-notas-n">{notas.notas.length}</span>}
              </button>
            </div>
          )}

          <div className="fb-header-actions">
            {onDownload && (
              <button type="button" className="fb-tb-btn fb-accion" title="Descargar archivo PDF" aria-label="Descargar archivo PDF" onClick={onDownload}>
                <Download size={17} />
              </button>
            )}
            <button
              type="button"
              className="fb-tb-btn fb-accion"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <span className="fb-tb-sep" />
            <button type="button" className="fb-tb-btn fb-accion fb-cerrar" title="Cerrar visor (Esc)" aria-label="Cerrar visor" onClick={onClose}>
              <X size={19} />
            </button>
          </div>
        </div>

        {/* ══ Área Central del Libro (Stage) ══ */}
        <div className={`fb-stage ${dibujando ? 'is-dibujando' : ''}`}>
          {/* Flecha Lateral Izquierda */}
          {listo && !esNormal && numPages > 1 && (
            <button
              type="button"
              className="fb-side-nav fb-side-prev"
              title="Página anterior"
              onClick={handleFlipPrev}
              disabled={currentPage <= 0}
            >
              <ChevronLeft size={26} strokeWidth={2.2} />
            </button>
          )}

          {/* Indicador de Carga */}
          {loading && (
            <div className="fb-status-overlay">
              <div className="fb-spinner" />
              <h3 className="fb-status-title">Abriendo libro digital</h3>
              <p className="fb-status-desc">{loadingStatus}</p>
            </div>
          )}

          {/* Estado de Error con Reintento */}
          {error && !loading && (
            <div className="fb-status-overlay">
              <AlertTriangle size={42} color="#EF4444" strokeWidth={1.8} />
              <h3 className="fb-status-title">No se pudo abrir el libro</h3>
              <p className="fb-status-desc">{error}</p>
              <button type="button" className="fb-retry-btn" onClick={loadPdf}>
                <RotateCcw size={15} />
                Reintentar
              </button>
            </div>
          )}

          {/* Vista normal: página por página, sin animación */}
          {listo && esNormal && (
            <AnotacionesProvider valor={anotaciones}>
              <NotasProvider valor={notas} marcando={marcandoNota} pdfDoc={pdfDoc}>
              <VistaNormal
                pdfDoc={pdfDoc}
                numPages={numPages}
                zoom={zoomNitido}
                paginaInicial={currentPage}
                onPagina={alVerPagina}
                irARef={irANormalRef}
              />
              </NotasProvider>
            </AnotacionesProvider>
          )}

          {/* Flipbook Interactivo (PageFlip / Turn.js) */}
          {listo && !esNormal && (
            <div
              className="fb-book-scaler"
              style={{
                transform: `scale(${zoom})`,
              }}
            >
              <VisorContext.Provider value={estadoDelVisor}>
              <AnotacionesProvider valor={anotaciones}>
              <NotasProvider valor={notas} marcando={marcandoNota} pdfDoc={pdfDoc}>
              <HTMLFlipBook
                ref={bookRef}
                width={pageDimensions.width}
                height={pageDimensions.height}
                size="fixed"
                minWidth={280}
                maxWidth={1200}
                minHeight={380}
                maxHeight={1700}
                showCover={true}
                startPage={currentPage}
                usePortrait={isMobile}
                autoSize={true}
                renderOnlyPageLengthChange={true}
                drawShadow={true}
                flippingTime={TIEMPO_DE_HOJA}
                maxShadowOpacity={0.2}
                useMouseEvents={true}
                showPageCorners={true}
                mobileScrollSupport={false}
                onFlip={(e: { data: number }) => setCurrentPage(e.data)}
                style={{ margin: '0 auto' }}
              >
                {bookPagesList}
              </HTMLFlipBook>
              </NotasProvider>
              </AnotacionesProvider>
              </VisorContext.Provider>
            </div>
          )}

          {/* Flecha Lateral Derecha */}
          {listo && !esNormal && numPages > 1 && (
            <button
              type="button"
              className="fb-side-nav fb-side-next"
              title="Página siguiente"
              onClick={handleFlipNext}
              disabled={currentPage >= numPages - 1}
            >
              <ChevronRight size={26} strokeWidth={2.2} />
            </button>
          )}
        </div>

        {/* Notas y comentarios: panel a la derecha; al tocar una, se va a su página */}
        {listo && <PanelDeNotas notas={notas} onIrAPagina={handlePageJump} />}

        {/* Herramientas del lápiz: barra flotante abajo, solo con el lápiz activo */}
        {listo && dibujando && (
          <div className="fb-herramientas">
            <HerramientasDeDibujo anotaciones={anotaciones} paginasALaVista={paginasALaVista} />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
