import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Download, ZoomIn, ZoomOut, RotateCw,
  FileText, Image as ImageIcon, FileSpreadsheet, Presentation,
  Loader2, Copy, Check,
  Maximize2, Minimize2
} from 'lucide-react';
import { getDocument, getDocumentPreview, type DocumentSummary, type DocumentDetail } from '../../data/documentosApi';
import { formatFileSize } from '../../utils/fileUpload';

import CustomPdfViewer from './CustomPdfViewer';
import ExcelSpreadsheetViewer from './ExcelSpreadsheetViewer';
import CodeViewer from './CodeViewer';

interface DocumentPreviewViewProps {
  document: DocumentSummary;
  onBack: () => void;
}

export default function DocumentPreviewView({ document, onBack }: DocumentPreviewViewProps) {
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [previewPdfBase64, setPreviewPdfBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Controles de visor (imagen / texto — el PDF tiene los suyos propios)
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
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
  const isExcel = mime.includes('excel') || mime.includes('spreadsheetml') || ['xls', 'xlsx'].includes(ext);
  const isPpt = mime.includes('presentation') || mime.includes('powerpoint') || ['ppt', 'pptx'].includes(ext);
  // Excel se muestra con su propia grilla (SheetJS + x-data-spreadsheet), sin pasar por Gotenberg.
  const isOffice = isWord || isPpt;
  const CODE_EXTENSIONS = [
    'txt', 'csv', 'json', 'yaml', 'yml', 'xml', 'md', 'markdown',
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue',
    'py', 'php', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'cc', 'hpp', 'cxx', 'cs',
    'go', 'rs', 'swift', 'sql', 'sh', 'bash', 'html', 'htm', 'css', 'scss',
  ];
  const isText = !isOffice && !isExcel && (mime.includes('text') || CODE_EXTENSIONS.includes(ext));

  // Sincronizar Pantalla Completa nativa (F11 API)
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
    setConverting(false);
    setError(null);
    setZoom(100);
    setRotation(0);
    setPreviewPdfBase64(null);

    getDocument(document.id)
      .then(async res => {
        const docDetail = res.document;
        setDetail(docDetail);

        if (isOffice) {
          setConverting(true);
          try {
            const preview = await getDocumentPreview(document.id);
            setPreviewPdfBase64(preview.data);
          } catch (convErr: any) {
            setError(convErr?.message || 'No se pudo generar la vista previa de este archivo.');
          } finally {
            setConverting(false);
          }
        }
      })
      .catch(err => {
        setError(err?.message || 'No se pudo cargar el archivo para vista previa.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [document.id, isOffice]);

  // Atajos de teclado: Zoom (Ctrl + Plus/Minus/0) y F11
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

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

      if (e.key === 'F11') {
        e.preventDefault();
        toggleNativeFullscreen();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  // Decodificar texto plano. atob() da un string "binario" byte a byte —
  // si se usa directo, los caracteres UTF-8 multibyte (tildes, ñ) salen mal
  // codificados (ej. "é" -> "Ã©"). Hay que pasar los bytes por TextDecoder.
  let decodedText = '';
  if (detail?.data && isText) {
    try {
      const binary = atob(detail.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      decodedText = new TextDecoder('utf-8').decode(bytes);
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
  const showPdfViewer = isPdf || (isOffice && previewPdfBase64);

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
            {/* Zoom controls para Imagen (el PDF tiene los suyos en CustomPdfViewer) */}
            {isImage && (
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
                <button
                  type="button"
                  className="doc-preview-tool-btn"
                  title="Rotar imagen 90°"
                  onClick={() => setRotation(r => (r + 90) % 360)}
                >
                  <RotateCw size={15} />
                </button>
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
        {isImage && (
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
              <button
                type="button"
                className="doc-preview-tool-btn"
                title="Rotar imagen 90°"
                onClick={() => setRotation(r => (r + 90) % 360)}
              >
                <RotateCw size={14} />
              </button>
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

        {converting && !loading && (
          <div className="doc-preview-center-msg">
            <Loader2 size={36} className="dfm-spin" color="var(--p, #4F46E5)" />
            <p>Convirtiendo <strong>{fileName}</strong> a PDF para la vista previa...</p>
          </div>
        )}

        {error && !loading && !converting && (
          <div className="doc-preview-center-msg doc-preview-error">
            <FileText size={42} color="#EF4444" />
            <p>{error}</p>
            <button type="button" className="doc-preview-btn-download" onClick={handleDownload}>
              <Download size={16} /> Descargar de todos modos
            </button>
          </div>
        )}

        {!loading && !converting && !error && detail && (
          <>
            {/* ── VISOR DE PDF (PDF.js), también usado para Word/Excel/PowerPoint convertidos ── */}
            {showPdfViewer && (
              <CustomPdfViewer
                base64Data={isPdf ? detail.data : (previewPdfBase64 as string)}
                fileName={fileName}
              />
            )}

            {/* ── VISOR DE EXCEL (SheetJS + x-data-spreadsheet, grilla real) ── */}
            {isExcel && (
              <ExcelSpreadsheetViewer base64Data={detail.data} />
            )}

            {/* ── VISOR DE IMÁGENES ── */}
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

            {/* ── VISOR DE CÓDIGO / TEXTO PLANO ── */}
            {isText && (
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
                <div className="doc-code-view-wrap">
                  {decodedText ? (
                    <CodeViewer code={decodedText} ext={ext} fontSizeRem={(zoom / 100) * 0.84} />
                  ) : (
                    <pre className="doc-code-plain">
                      <code>Archivo de texto vacío o sin caracteres imprimibles.</code>
                    </pre>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
