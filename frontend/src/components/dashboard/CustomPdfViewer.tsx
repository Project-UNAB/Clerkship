import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw,
  Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen,
  Loader2, Printer, FileText
} from 'lucide-react';

// Configuración del worker de PDF.js
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.0.379'}/build/pdf.worker.min.mjs`;
}

interface CustomPdfViewerProps {
  base64Data: string;
  fileName: string;
}

interface PdfThumbnailCardProps {
  pageNum: number;
  pdfDoc: any;
  isActive: boolean;
  onClick: () => void;
}

/** Componente optimizado para miniaturas (Lazy-loaded con IntersectionObserver y Canvas de alta nitidez) */
function PdfThumbnailCard({ pageNum, pdfDoc, isActive, onClick }: PdfThumbnailCardProps) {
  const containerRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const renderTaskRef = useRef<any>(null);

  // Lazy loading: solo se activa cuando entra en el viewport del scroll lateral
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Renderizar la miniatura en alta nitidez (~240px de ancho) con antialiasing nativo
  useEffect(() => {
    if (!isVisible || !pdfDoc || rendered) return;
    let cancelled = false;

    async function renderThumbnail() {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Renderizado nítido de alta definición (240px de ancho) para que el texto y gráficos sean legibles
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const targetWidth = 240;
        const scale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        if (!cancelled) {
          setRendered(true);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Error renderizando miniatura p.${pageNum}:`, err);
        }
      }
    }

    renderThumbnail();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [isVisible, pdfDoc, pageNum, rendered]);

  return (
    <button
      ref={containerRef}
      type="button"
      className={`cpv-thumb-item ${isActive ? 'is-active' : ''}`}
      onClick={onClick}
      title={`Ir a la página ${pageNum}`}
    >
      <div className="cpv-thumb-box">
        <canvas ref={canvasRef} className={`cpv-thumb-canvas ${rendered ? 'is-ready' : ''}`} />
        {!rendered && (
          <div className="cpv-thumb-skeleton">
            <Loader2 size={16} className="dfm-spin" color="var(--p, #4F46E5)" />
          </div>
        )}
      </div>
      <span className="cpv-thumb-num">Pág. {pageNum}</span>
    </button>
  );
}

export default function CustomPdfViewer({ base64Data, fileName }: CustomPdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'continuous' | 'single'>('continuous');
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasks = useRef<Map<number, any>>(new Map());

  // Sincronizar estado de Pantalla Completa nativa (F11 API)
  useEffect(() => {
    function onFsChange() {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setFullscreen(isFs);
    }

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.removeEventListener('mozfullscreenchange', onFsChange);
      document.removeEventListener('MSFullscreenChange', onFsChange);
    };
  }, []);

  function toggleNativeFullscreen() {
    const el = rootRef.current || document.documentElement;
    const isFs = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (!isFs) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if ((el as any).webkitRequestFullscreen) {
        (el as any).webkitRequestFullscreen();
      } else if ((el as any).mozRequestFullScreen) {
        (el as any).mozRequestFullScreen();
      } else if ((el as any).msRequestFullscreen) {
        (el as any).msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  }

  // Convertir base64 a Uint8Array y cargar documento
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);

    async function loadPdf() {
      try {
        const rawString = atob(base64Data);
        const bytes = new Uint8Array(rawString.length);
        for (let i = 0; i < rawString.length; i++) {
          bytes[i] = rawString.charCodeAt(i);
        }

        const loadingTask = pdfjsLib.getDocument({
          data: bytes,
          cMapUrl: 'https://unpkg.com/pdfjs-dist/cmaps/',
          cMapPacked: true,
        });

        const loadedPdf = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
      } catch (err: any) {
        if (isCancelled) return;
        console.error('Error cargando PDF con PDF.js:', err);
        setError('No se pudo procesar la estructura interna del archivo PDF.');
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [base64Data]);

  // Renderizar una página en canvas de alta resolución
  const renderPage = useCallback(
    async (pageNumber: number, canvas: HTMLCanvasElement) => {
      if (!pdfDoc) return;

      if (renderTasks.current.has(pageNumber)) {
        try {
          renderTasks.current.get(pageNumber).cancel();
        } catch {
          // ignore
        }
      }

      try {
        const page = await pdfDoc.getPage(pageNumber);
        const scale = (zoom / 100) * 1.5;
        const viewport = page.getViewport({ scale, rotation });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / 1.5}px`;
        canvas.style.height = `${viewport.height / 1.5}px`;

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        const renderTask = page.render(renderContext);
        renderTasks.current.set(pageNumber, renderTask);

        await renderTask.promise;
        renderTasks.current.delete(pageNumber);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Error renderizando página ${pageNumber}:`, err);
        }
      }
    },
    [pdfDoc, zoom, rotation]
  );

  // Renderizar páginas visibles o actuales
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;

    if (viewMode === 'single') {
      const canvas = canvasRefs.current.get(currentPage);
      if (canvas) {
        renderPage(currentPage, canvas);
      }
    } else {
      for (let i = 1; i <= numPages; i++) {
        const canvas = canvasRefs.current.get(i);
        if (canvas) {
          renderPage(i, canvas);
        }
      }
    }
  }, [pdfDoc, numPages, currentPage, zoom, rotation, viewMode, renderPage]);

  // Navegar a una página específica
  const scrollToPage = useCallback((pageNum: number) => {
    const valid = Math.max(1, Math.min(numPages, pageNum));
    setCurrentPage(valid);

    if (viewMode === 'continuous') {
      const pageEl = pageRefs.current.get(valid);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [numPages, viewMode]);

  // Detectar página actual según scroll
  function handleScroll() {
    if (viewMode !== 'continuous' || !containerRef.current) return;
    const containerTop = containerRef.current.getBoundingClientRect().top;

    for (let i = 1; i <= numPages; i++) {
      const pageEl = pageRefs.current.get(i);
      if (pageEl) {
        const rect = pageEl.getBoundingClientRect();
        if (rect.top - containerTop <= 150 && rect.bottom - containerTop >= 100) {
          setCurrentPage(i);
          break;
        }
      }
    }
  }

  // 1 & 2 & 3: Atajos de Teclado (Zoom, Navegación de páginas, Pantalla Completa)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      // Zoom con Ctrl + Plus / Ctrl + Minus / Ctrl + 0
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=' || e.key === 'Add') {
          e.preventDefault();
          setZoom(z => Math.min(300, z + 15));
          return;
        }
        if (e.key === '-' || e.key === '_' || e.key === 'Subtract') {
          e.preventDefault();
          setZoom(z => Math.max(50, z - 15));
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          setZoom(100);
          return;
        }
      }

      // Navegación de páginas con flechas del teclado
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        setCurrentPage(p => {
          const next = Math.min(numPages, p + 1);
          scrollToPage(next);
          return next;
        });
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentPage(p => {
          const prev = Math.max(1, p - 1);
          scrollToPage(prev);
          return prev;
        });
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        scrollToPage(1);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        scrollToPage(numPages);
        return;
      }

      // Pantalla Completa nativa con F11
      if (e.key === 'F11') {
        e.preventDefault();
        toggleNativeFullscreen();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, scrollToPage]);

  // Zoom con Ctrl + Rueda del ratón y Gesto táctil Pinch del touchpad
  useEffect(() => {
    const stageEl = containerRef.current;
    if (!stageEl) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY;
        if (delta < 0) {
          setZoom(z => Math.min(300, z + 10));
        } else if (delta > 0) {
          setZoom(z => Math.max(50, z - 10));
        }
      }
    }

    stageEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      stageEl.removeEventListener('wheel', handleWheel);
    };
  }, []);

  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head><title>Imprimir ${fileName}</title></head>
        <body style="margin:0;">
          <iframe src="data:application/pdf;base64,${base64Data}" style="width:100vw;height:100vh;border:none;"></iframe>
        </body>
      </html>
    `);
  }

  return (
    <div ref={rootRef} className={`cpv-root ${fullscreen ? 'cpv-fullscreen' : ''}`}>
      {/* ── Barra de Herramientas Propia (Custom Toolbar) ── */}
      <div className="cpv-toolbar">
        {/* Lado izquierdo: Control de miniaturas y páginas */}
        <div className="cpv-toolbar-left">
          <button
            type="button"
            className={`cpv-btn-tool ${sidebarOpen ? 'is-active' : ''}`}
            title={sidebarOpen ? 'Ocultar miniaturas' : 'Mostrar miniaturas'}
            onClick={() => setSidebarOpen(v => !v)}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>

          <div className="cpv-divider" />

          {/* Navegación de páginas */}
          <div className="cpv-page-nav">
            <button
              type="button"
              className="cpv-btn-tool"
              disabled={currentPage <= 1}
              onClick={() => scrollToPage(currentPage - 1)}
              title="Página anterior (Flecha Izquierda / Arriba)"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="cpv-page-badge">
              <input
                type="number"
                min={1}
                max={numPages || 1}
                value={currentPage}
                onChange={e => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) scrollToPage(val);
                }}
                className="cpv-page-input"
              />
              <span className="cpv-page-total">/ {numPages || 1}</span>
            </div>
            <button
              type="button"
              className="cpv-btn-tool"
              disabled={currentPage >= numPages}
              onClick={() => scrollToPage(currentPage + 1)}
              title="Página siguiente (Flecha Derecha / Abajo)"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Centro: Controles de Zoom y Ajuste */}
        <div className="cpv-toolbar-center">
          <button
            type="button"
            className="cpv-btn-tool"
            onClick={() => setZoom(z => Math.max(50, z - 15))}
            title="Alejar (Ctrl + - o Ctrl + Rueda)"
          >
            <ZoomOut size={16} />
          </button>
          <div className="cpv-zoom-select-wrap">
            <select
              value={zoom}
              onChange={e => setZoom(parseInt(e.target.value, 10))}
              className="cpv-zoom-select"
            >
              <option value={50}>50%</option>
              <option value={75}>75%</option>
              <option value={90}>90%</option>
              <option value={100}>100% (Normal)</option>
              <option value={125}>125%</option>
              <option value={150}>150%</option>
              <option value={175}>175%</option>
              <option value={200}>200%</option>
              <option value={250}>250%</option>
              <option value={300}>300%</option>
            </select>
          </div>
          <button
            type="button"
            className="cpv-btn-tool"
            onClick={() => setZoom(z => Math.min(300, z + 15))}
            title="Acercar (Ctrl + + o Ctrl + Rueda)"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Lado derecho: Rotación, Modo de Vista, Impresión y Pantalla Completa F11 */}
        <div className="cpv-toolbar-right">
          <button
            type="button"
            className="cpv-btn-tool"
            onClick={() => setRotation(r => (r + 90) % 360)}
            title="Girar 90° a la derecha"
          >
            <RotateCw size={16} />
          </button>

          <div className="cpv-viewmode-pills">
            <button
              type="button"
              className={`cpv-pill ${viewMode === 'continuous' ? 'is-active' : ''}`}
              onClick={() => setViewMode('continuous')}
            >
              Continuo
            </button>
            <button
              type="button"
              className={`cpv-pill ${viewMode === 'single' ? 'is-active' : ''}`}
              onClick={() => setViewMode('single')}
            >
              Página
            </button>
          </div>

          <button
            type="button"
            className="cpv-btn-tool"
            onClick={handlePrint}
            title="Imprimir documento"
          >
            <Printer size={16} />
          </button>

          <button
            type="button"
            className="cpv-btn-tool"
            onClick={toggleNativeFullscreen}
            title={fullscreen ? 'Salir de pantalla completa (F11 / Esc)' : 'Pantalla completa real (F11)'}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* ── Cuerpo Principal: Miniaturas + Lienzo Canvas ── */}
      <div className="cpv-main-container">
        {/* Barra lateral de miniaturas reales */}
        {sidebarOpen && numPages > 0 && (
          <aside className="cpv-sidebar">
            <div className="cpv-sidebar-header">
              <span>Páginas ({numPages})</span>
            </div>
            <div className="cpv-thumbnails-list">
              {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                <PdfThumbnailCard
                  key={pageNum}
                  pageNum={pageNum}
                  pdfDoc={pdfDoc}
                  isActive={currentPage === pageNum}
                  onClick={() => scrollToPage(pageNum)}
                />
              ))}
            </div>
          </aside>
        )}

        {/* Lienzo del documento (Document Stage) */}
        <main
          className="cpv-stage"
          ref={containerRef}
          onScroll={handleScroll}
        >
          {loading && (
            <div className="cpv-loading-stage">
              <Loader2 size={36} className="dfm-spin" color="var(--p, #4F46E5)" />
              <p>Renderizando páginas de <strong>{fileName}</strong>...</p>
            </div>
          )}

          {error && (
            <div className="cpv-error-stage">
              <FileText size={40} color="#EF4444" />
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && numPages > 0 && (
            <div className={`cpv-pages-stream ${viewMode}`}>
              {viewMode === 'continuous'
                ? Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                    <div
                      key={pageNum}
                      className="cpv-page-card"
                      ref={el => {
                        if (el) pageRefs.current.set(pageNum, el);
                        else pageRefs.current.delete(pageNum);
                      }}
                    >
                      <canvas
                        ref={el => {
                          if (el) canvasRefs.current.set(pageNum, el);
                          else canvasRefs.current.delete(pageNum);
                        }}
                        className="cpv-page-canvas"
                      />
                      <span className="cpv-page-tag-float">Pág. {pageNum}</span>
                    </div>
                  ))
                : (
                    <div
                      className="cpv-page-card"
                      ref={el => {
                        if (el) pageRefs.current.set(currentPage, el);
                      }}
                    >
                      <canvas
                        ref={el => {
                          if (el) canvasRefs.current.set(currentPage, el);
                        }}
                        className="cpv-page-canvas"
                      />
                    </div>
                  )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
