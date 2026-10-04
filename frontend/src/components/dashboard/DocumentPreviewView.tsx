import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Download, ZoomIn, ZoomOut, RotateCw,
  FileText, Image as ImageIcon, FileSpreadsheet, Presentation,
  ChevronLeft, ChevronRight, Loader2, Copy, Check,
  Maximize2, Minimize2
} from 'lucide-react';
import { getDocument, type DocumentSummary, type DocumentDetail } from '../../data/documentosApi';
import { formatFileSize } from '../../utils/fileUpload';
import {
  parseDocxFile,
  parseExcelFile,
  parsePptxFile,
  type ParsedWorkbook,
  type ParsedSlide
} from '../../utils/fileParsers';

import CustomPdfViewer from './CustomPdfViewer';

interface DocumentPreviewViewProps {
  document: DocumentSummary;
  onBack: () => void;
}

export default function DocumentPreviewView({ document, onBack }: DocumentPreviewViewProps) {
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Estados de archivos parseados reales
  const [wordHtml, setWordHtml] = useState<string>('');
  const [parsedWorkbook, setParsedWorkbook] = useState<ParsedWorkbook | null>(null);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [parsedSlides, setParsedSlides] = useState<ParsedSlide[]>([]);

  // Controles de visor
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [activeSlide, setActiveSlide] = useState(1);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const viewContainerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const fileName = document.name || 'Documento';
  const mime = (document.mime_type || '').toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const isPdf = mime.includes('pdf') || ext === 'pdf';
  const isImage = mime.includes('image') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
  const isWord = mime.includes('word') || mime.includes('officedocument.wordprocessingml') || ['doc', 'docx'].includes(ext);
  const isExcel = mime.includes('excel') || mime.includes('spreadsheetml') || ['xls', 'xlsx', 'csv'].includes(ext);
  const isPpt = mime.includes('presentation') || mime.includes('powerpoint') || ['ppt', 'pptx'].includes(ext);
  const isText = mime.includes('text') || ['txt', 'json', 'md', 'js', 'py', 'ts'].includes(ext);

  // 3. Sincronizar Pantalla Completa nativa (F11 API)
  useEffect(() => {
    function onFsChange() {
      const isFs = !!(
        window.document.fullscreenElement ||
        (window.document as any).webkitFullscreenElement ||
        (window.document as any).mozFullScreenElement ||
        (window.document as any).msFullscreenElement
      );
      setFullscreen(isFs);
    }

    window.document.addEventListener('fullscreenchange', onFsChange);
    window.document.addEventListener('webkitfullscreenchange', onFsChange);
    window.document.addEventListener('mozfullscreenchange', onFsChange);
    window.document.addEventListener('MSFullscreenChange', onFsChange);

    return () => {
      window.document.removeEventListener('fullscreenchange', onFsChange);
      window.document.removeEventListener('webkitfullscreenchange', onFsChange);
      window.document.removeEventListener('mozfullscreenchange', onFsChange);
      window.document.removeEventListener('MSFullscreenChange', onFsChange);
    };
  }, []);

  function toggleNativeFullscreen() {
    const el = viewContainerRef.current || window.document.documentElement;
    const isFs = !!(
      window.document.fullscreenElement ||
      (window.document as any).webkitFullscreenElement ||
      (window.document as any).mozFullScreenElement ||
      (window.document as any).msFullscreenElement
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
      if (window.document.exitFullscreen) {
        window.document.exitFullscreen().catch(() => {});
      } else if ((window.document as any).webkitExitFullscreen) {
        (window.document as any).webkitExitFullscreen();
      } else if ((window.document as any).mozCancelFullScreen) {
        (window.document as any).mozCancelFullScreen();
      } else if ((window.document as any).msExitFullscreen) {
        (window.document as any).msExitFullscreen();
      }
    }
  }

  useEffect(() => {
    setLoading(true);
    setParsing(false);
    setError(null);
    setZoom(100);
    setRotation(0);
    setActiveSlide(1);
    setWordHtml('');
    setParsedWorkbook(null);
    setParsedSlides([]);

    getDocument(document.id)
      .then(async res => {
        const docDetail = res.document;
        setDetail(docDetail);

        // Procesar contenido real según el formato
        if (docDetail.data) {
          setParsing(true);
          try {
            if (isWord) {
              const resDocx = await parseDocxFile(docDetail.data);
              setWordHtml(resDocx.html);
            } else if (isExcel) {
              const wb = parseExcelFile(docDetail.data);
              setParsedWorkbook(wb);
              setActiveSheetName(wb.sheetNames[0] || 'Hoja 1');
            } else if (isPpt) {
              const slides = await parsePptxFile(docDetail.data);
              setParsedSlides(slides);
            }
          } catch (parseErr: any) {
            console.warn('Error al procesar archivo en el cliente:', parseErr);
          } finally {
            setParsing(false);
          }
        }
      })
      .catch(err => {
        setError(err?.message || 'No se pudo cargar el archivo para vista previa.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [document.id, isWord, isExcel, isPpt]);

  // 1 & 2: Atajos de teclado para Zoom, Navegación de Diapositivas PPT y F11
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      // 1. Zoom con Ctrl + Plus / Ctrl + Minus / Ctrl + 0
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

      // 2. Navegación por Diapositivas PPT con flechas
      if (isPpt && parsedSlides.length > 0) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
          e.preventDefault();
          setActiveSlide(s => Math.min(parsedSlides.length, s + 1));
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault();
          setActiveSlide(s => Math.max(1, s - 1));
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          setActiveSlide(1);
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          setActiveSlide(parsedSlides.length);
          return;
        }
      }

      // 3. F11 para Pantalla Completa
      if (e.key === 'F11') {
        e.preventDefault();
        toggleNativeFullscreen();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPpt, parsedSlides.length]);

  // Zoom con Ctrl + Rueda del ratón o Gesto Pinch táctil del touchpad
  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

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

    bodyEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      bodyEl.removeEventListener('wheel', handleWheel);
    };
  }, []);

  function handleDownload() {
    if (!detail) return;
    const link = window.document.createElement('a');
    link.href = `data:${detail.mime_type};base64,${detail.data}`;
    link.download = detail.name;
    link.click();
  }

  function handleCopyText(content: string) {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Decodificar texto plano
  let decodedText = '';
  if (detail?.data && (isText || ext === 'csv')) {
    try {
      decodedText = atob(detail.data);
    } catch {
      decodedText = '';
    }
  }

  // Obtener ícono, etiqueta y color temático
  function getTypeBadge() {
    if (isPdf) return { label: 'PDF', bg: '#EF4444', gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', icon: FileText, colorClass: 'badge-pdf' };
    if (isWord) return { label: 'WORD', bg: '#2563EB', gradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)', icon: FileText, colorClass: 'badge-word' };
    if (isExcel) return { label: 'EXCEL', bg: '#10B981', gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', icon: FileSpreadsheet, colorClass: 'badge-excel' };
    if (isPpt) return { label: 'POWERPOINT', bg: '#F97316', gradient: 'linear-gradient(135deg, #FB923C 0%, #EA580C 100%)', icon: Presentation, colorClass: 'badge-ppt' };
    if (isImage) return { label: ext ? ext.toUpperCase() : 'IMAGEN', bg: '#8B5CF6', gradient: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)', icon: ImageIcon, colorClass: 'badge-img' };
    if (isText) return { label: ext ? ext.toUpperCase() : 'TEXTO', bg: '#64748B', gradient: 'linear-gradient(135deg, #64748B 0%, #475569 100%)', icon: FileText, colorClass: 'badge-text' };
    return { label: ext ? ext.toUpperCase() : 'ARCHIVO', bg: '#64748B', gradient: 'linear-gradient(135deg, #64748B 0%, #475569 100%)', icon: FileText, colorClass: 'badge-file' };
  }

  const badgeInfo = getTypeBadge();
  const BadgeIcon = badgeInfo.icon;

  const currentSheet = parsedWorkbook && activeSheetName ? parsedWorkbook.sheets[activeSheetName] : null;

  return (
    <motion.div
      ref={viewContainerRef}
      className={`doc-fulltab-view ${fullscreen ? 'doc-fulltab-fullscreen' : ''}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Barra Superior (Top Header) ── */}
      <div className="doc-fulltab-header">
        <div className="doc-fulltab-main-row">
          <div className="doc-fulltab-left">
            <button
              type="button"
              className="doc-fulltab-back-btn"
              onClick={onBack}
              title="Volver a Documentos"
            >
              <ArrowLeft size={16} />
              <span className="doc-back-btn-text">Volver</span>
            </button>

            <div className="doc-fulltab-divider" />

            {/* Badge del tipo de documento con ícono y texto */}
            <div
              className={`doc-preview-badge ${badgeInfo.colorClass}`}
              style={{ background: badgeInfo.gradient }}
              title={`Tipo de documento: ${badgeInfo.label}`}
            >
              <BadgeIcon size={14} color="#FFFFFF" strokeWidth={2.2} />
              <span className="doc-preview-badge-text">{badgeInfo.label}</span>
            </div>

            <div className="doc-preview-title-group">
              <h2 className="doc-fulltab-file-name" title={fileName}>{fileName}</h2>
              <span className="doc-preview-file-sub">{formatFileSize(document.size_bytes)}</span>
            </div>
          </div>

          {/* Controles de la barra superior */}
          <div className="doc-preview-actions">
            {/* Zoom controls para Imagen / Word / Excel / PPT (en escritorio) */}
            {!isPdf && (
              <div className="doc-preview-zoom-group doc-zoom-desktop">
                <button
                  type="button"
                  className="doc-preview-tool-btn"
                  title="Reducir zoom (Ctrl + -)"
                  onClick={() => setZoom(z => Math.max(50, z - 20))}
                >
                  <ZoomOut size={15} />
                </button>
                <span className="doc-preview-zoom-label">{zoom}%</span>
                <button
                  type="button"
                  className="doc-preview-tool-btn"
                  title="Aumentar zoom (Ctrl + +)"
                  onClick={() => setZoom(z => Math.min(300, z + 20))}
                >
                  <ZoomIn size={15} />
                </button>
                {isImage && (
                  <button
                    type="button"
                    className="doc-preview-tool-btn"
                    title="Rotar imagen 90°"
                    onClick={() => setRotation(r => (r + 90) % 360)}
                  >
                    <RotateCw size={15} />
                  </button>
                )}
              </div>
            )}

            {/* Botón de Pantalla Completa nativa (F11) */}
            <button
              type="button"
              className="doc-preview-tool-btn"
              title={fullscreen ? 'Salir de pantalla completa (F11 / Esc)' : 'Pantalla completa (F11)'}
              onClick={toggleNativeFullscreen}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            <button
              type="button"
              className="doc-preview-btn-download"
              title="Descargar archivo original"
              onClick={handleDownload}
              disabled={!detail}
            >
              <Download size={15} />
              <span className="doc-download-btn-text">Descargar</span>
            </button>
          </div>
        </div>

        {/* Barra de herramientas secundaria en móvil para controles de zoom */}
        {!isPdf && (
          <div className="doc-preview-mobile-tools-bar">
            <div className="doc-preview-zoom-group">
              <button
                type="button"
                className="doc-preview-tool-btn"
                title="Reducir zoom"
                onClick={() => setZoom(z => Math.max(50, z - 20))}
              >
                <ZoomOut size={14} />
              </button>
              <span className="doc-preview-zoom-label">{zoom}%</span>
              <button
                type="button"
                className="doc-preview-tool-btn"
                title="Aumentar zoom"
                onClick={() => setZoom(z => Math.min(300, z + 20))}
              >
                <ZoomIn size={14} />
              </button>
              {isImage && (
                <button
                  type="button"
                  className="doc-preview-tool-btn"
                  title="Rotar imagen 90°"
                  onClick={() => setRotation(r => (r + 90) % 360)}
                >
                  <RotateCw size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Área Principal de Vista Previa ── */}
      <div className="doc-fulltab-body" ref={bodyRef}>
        {loading && (
          <div className="doc-preview-center-msg">
            <Loader2 size={36} className="dfm-spin" color="var(--p, #4F46E5)" />
            <p>Cargando vista previa de <strong>{fileName}</strong>...</p>
          </div>
        )}

        {parsing && (
          <div className="doc-preview-center-msg">
            <Loader2 size={36} className="dfm-spin" color="var(--p, #4F46E5)" />
            <p>Procesando estructura interna del archivo <strong>{fileName}</strong>...</p>
          </div>
        )}

        {error && !loading && (
          <div className="doc-preview-center-msg doc-preview-error">
            <FileText size={42} color="#EF4444" />
            <p>{error}</p>
            <button type="button" className="doc-preview-btn-download" onClick={handleDownload}>
              <Download size={16} /> Descargar de todos modos
            </button>
          </div>
        )}

        {!loading && !error && detail && (
          <>
            {/* ── 1. VISOR PROPIO DE PDF (PDF.js Canvas) ── */}
            {isPdf && (
              <CustomPdfViewer base64Data={detail.data} fileName={fileName} />
            )}

            {/* ── 2. VISOR DE IMÁGENES ── */}
            {isImage && (
              <div className="doc-preview-image-wrap">
                <img
                  src={`data:${detail.mime_type};base64,${detail.data}`}
                  alt={fileName}
                  className="doc-preview-img"
                  style={{
                    transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                    transition: 'transform 0.2s ease',
                  }}
                />
              </div>
            )}

            {/* ── 3. VISOR REAL DE DOCUMENTOS WORD (.docx / .doc) ── */}
            {isWord && (
              <div className="doc-preview-word-wrap">
                <div
                  className="doc-preview-word-page"
                  style={{
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.18s ease',
                  }}
                >
                  <div className="doc-word-header">
                    <div className="doc-word-meta-tag">Documento de Word · Microsoft Word</div>
                    <span className="doc-word-page-num">{ext.toUpperCase()} · {formatFileSize(detail.size_bytes)}</span>
                  </div>

                  <h1 className="doc-word-title">{fileName.replace(/\.(docx|doc)$/i, '')}</h1>
                  <div className="doc-word-divider" />

                  {wordHtml ? (
                    <div
                      className="doc-word-rendered-html"
                      dangerouslySetInnerHTML={{ __html: wordHtml }}
                    />
                  ) : (
                    <div className="doc-word-content">
                      <p className="doc-word-lead">
                        Contenido del documento listo para visualización.
                      </p>
                      <p>
                        Para editar tablas complejas o formatos binarios propietarios heredados (.doc antiguos), descargue el archivo con el botón superior.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 4. VISOR REAL DE EXCEL (.xlsx / .xls / .csv) ── */}
            {isExcel && (
              <div className="doc-preview-excel-wrap">
                {/* Barra de fórmulas */}
                <div className="doc-excel-formula-bar">
                  <span className="doc-excel-fx">fx</span>
                  <span className="doc-excel-formula-text">
                    {activeSheetName} · {currentSheet?.rows.length || 0} filas detectadas
                  </span>
                </div>

                {/* Tabla con datos reales del Excel */}
                <div className="doc-excel-table-container">
                  <table
                    className="doc-excel-table"
                    style={{
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: 'top left',
                      transition: 'transform 0.18s ease',
                    }}
                  >
                    <thead>
                      <tr>
                        <th className="doc-excel-th-corner">#</th>
                        {Array.from({ length: currentSheet?.maxCols || 6 }, (_, i) => (
                          <th key={i}>{String.fromCharCode(65 + (i % 26))}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentSheet && currentSheet.rows.length > 0 ? (
                        currentSheet.rows.map((row, rIdx) => (
                          <tr key={rIdx} className={rIdx === 0 ? 'doc-excel-header-row' : ''}>
                            <td className="doc-excel-row-num">{rIdx + 1}</td>
                            {Array.from({ length: currentSheet.maxCols }, (_, cIdx) => (
                              <td key={cIdx}>{row[cIdx] !== undefined ? row[cIdx] : ''}</td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#94A3B8' }}>
                            Esta hoja de cálculo no contiene datos en las celdas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pestañas de Hojas Reales */}
                {parsedWorkbook && parsedWorkbook.sheetNames.length > 0 && (
                  <div className="doc-excel-tabs">
                    {parsedWorkbook.sheetNames.map(name => (
                      <button
                        key={name}
                        type="button"
                        className={`doc-excel-tab-btn ${activeSheetName === name ? 'is-active' : ''}`}
                        onClick={() => setActiveSheetName(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── 5. VISOR REAL DE POWERPOINT (.pptx) ── */}
            {isPpt && (
              <div className="doc-preview-ppt-wrap">
                {/* Miniaturas de diapositivas reales */}
                <div className="doc-ppt-sidebar">
                  {parsedSlides.map((slide, idx) => (
                    <button
                      key={slide.slideNumber || idx}
                      type="button"
                      className={`doc-ppt-thumb-btn ${activeSlide === slide.slideNumber ? 'is-active' : ''}`}
                      onClick={() => setActiveSlide(slide.slideNumber)}
                    >
                      <span className="doc-ppt-thumb-num">{slide.slideNumber}</span>
                      <div className="doc-ppt-thumb-preview">
                        <div className="ppt-mini-title" />
                        <div className="ppt-mini-line" />
                        <div className="ppt-mini-line" />
                      </div>
                    </button>
                  ))}
                </div>

                {/* Escenario de la diapositiva real */}
                <div className="doc-ppt-stage">
                  {(() => {
                    const slide = parsedSlides.find(s => s.slideNumber === activeSlide) || parsedSlides[0];
                    if (!slide) return null;

                    return (
                      <div
                        className="doc-ppt-slide"
                        style={{
                          transform: `scale(${zoom / 100})`,
                          transition: 'transform 0.18s ease',
                        }}
                      >
                        <div className="doc-ppt-slide-header">
                          <span className="doc-ppt-tag">Presentación Diapositiva</span>
                          <span className="doc-ppt-counter">Diapositiva {activeSlide} de {parsedSlides.length} (Usa flechas ⬅️ ➡️)</span>
                        </div>

                        <div className="doc-ppt-slide-content">
                          <h2 className="ppt-slide-title">{slide.title}</h2>
                          {slide.paragraphs.length > 0 && (
                            <ul className="ppt-slide-bullets">
                              {slide.paragraphs.map((p, pIdx) => (
                                <li key={pIdx}>{p}</li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {/* Controles de navegación */}
                        <div className="doc-ppt-nav-controls">
                          <button
                            type="button"
                            className="doc-ppt-nav-btn"
                            disabled={activeSlide <= 1}
                            onClick={() => setActiveSlide(s => Math.max(1, s - 1))}
                            title="Diapositiva anterior (Flecha Izquierda / Arriba)"
                          >
                            <ChevronLeft size={16} /> Anterior
                          </button>
                          <button
                            type="button"
                            className="doc-ppt-nav-btn"
                            disabled={activeSlide >= parsedSlides.length}
                            onClick={() => setActiveSlide(s => Math.min(parsedSlides.length, s + 1))}
                            title="Diapositiva siguiente (Flecha Derecha / Abajo / Espacio)"
                          >
                            Siguiente <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── 6. VISOR DE CÓDIGO / TEXTO PLANO ── */}
            {isText && !isPdf && !isWord && !isExcel && !isPpt && (
              <div className="doc-preview-text-wrap">
                <div className="doc-text-topbar">
                  <span>Texto Plano / Archivo de Datos ({decodedText.length} caracteres)</span>
                  <button
                    type="button"
                    className="doc-text-copy-btn"
                    onClick={() => handleCopyText(decodedText)}
                  >
                    {copied ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                    <span>{copied ? 'Copiado' : 'Copiar texto'}</span>
                  </button>
                </div>
                <pre className="doc-text-code-view">
                  <code style={{ fontSize: `${(zoom / 100) * 0.84}rem` }}>
                    {decodedText || 'Archivo de texto vacío o sin caracteres imprimibles.'}
                  </code>
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
