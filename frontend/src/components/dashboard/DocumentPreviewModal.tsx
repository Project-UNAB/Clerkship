import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCw,
  FileText, Image as ImageIcon, FileSpreadsheet, Presentation,
  ChevronLeft, ChevronRight, Loader2, Copy, Check, ExternalLink
} from 'lucide-react';
import { getDocument, type DocumentSummary, type DocumentDetail } from '../../data/documentosApi';
import { formatFileSize } from '../../utils/fileUpload';

interface DocumentPreviewModalProps {
  document: DocumentSummary | null;
  onClose: () => void;
}

export default function DocumentPreviewModal({ document, onClose }: DocumentPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Controles de visor
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(1);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'sheet1' | 'sheet2'>('sheet1');

  useEffect(() => {
    if (!document) return;
    setLoading(true);
    setError(null);
    setZoom(100);
    setRotation(0);
    setActiveSlide(1);

    getDocument(document.id)
      .then(res => {
        setDetail(res.document);
      })
      .catch(err => {
        setError(err?.message || 'No se pudo cargar el archivo para vista previa.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [document]);

  if (!document) return null;

  const fileName = document.name || 'Documento';
  const mime = (document.mime_type || '').toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const isPdf = mime.includes('pdf') || ext === 'pdf';
  const isImage = mime.includes('image') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
  const isWord = mime.includes('word') || mime.includes('officedocument.wordprocessingml') || ['doc', 'docx'].includes(ext);
  const isExcel = mime.includes('excel') || mime.includes('spreadsheetml') || ['xls', 'xlsx', 'csv'].includes(ext);
  const isPpt = mime.includes('presentation') || mime.includes('powerpoint') || ['ppt', 'pptx'].includes(ext);
  const isText = mime.includes('text') || ['txt', 'json', 'md', 'js', 'py', 'ts'].includes(ext);

  function handleDownload() {
    if (!detail) return;
    const link = window.document.createElement('a');
    link.href = `data:${detail.mime_type};base64,${detail.data}`;
    link.download = detail.name;
    link.click();
  }

  function handleOpenNewTab() {
    if (!detail) return;
    const newTab = window.open();
    if (newTab) {
      if (isPdf) {
        newTab.document.write(`<iframe src="data:application/pdf;base64,${detail.data}" style="width:100%;height:100%;border:none;"></iframe>`);
      } else if (isImage) {
        newTab.document.write(`<img src="data:${detail.mime_type};base64,${detail.data}" style="max-width:100%;margin:auto;display:block;" />`);
      }
    }
  }

  function handleCopyText(content: string) {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Decodificar texto para archivos .txt o .csv
  let decodedText = '';
  if (detail?.data && (isText || ext === 'csv')) {
    try {
      decodedText = atob(detail.data);
    } catch {
      decodedText = '';
    }
  }

  // Obtener ícono y color temático
  function getTypeBadge() {
    if (isPdf) return { label: 'PDF', bg: '#EF4444', icon: FileText };
    if (isWord) return { label: 'WORD', bg: '#2563EB', icon: FileText };
    if (isExcel) return { label: 'EXCEL', bg: '#10B981', icon: FileSpreadsheet };
    if (isPpt) return { label: 'POWERPOINT', bg: '#F97316', icon: Presentation };
    if (isImage) return { label: 'IMAGEN', bg: '#9333EA', icon: ImageIcon };
    return { label: 'ARCHIVO', bg: '#64748B', icon: FileText };
  }

  const badgeInfo = getTypeBadge();
  const BadgeIcon = badgeInfo.icon;

  return (
    <AnimatePresence>
      <motion.div
        className={`doc-preview-backdrop ${fullscreen ? 'is-fullscreen' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={`doc-preview-modal ${fullscreen ? 'modal-fullscreen' : ''}`}
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 14 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="doc-preview-header">
            <div className="doc-preview-meta-left">
              <div className="doc-preview-type-badge" style={{ background: badgeInfo.bg }}>
                <BadgeIcon size={14} color="#FFF" />
                <span>{badgeInfo.label}</span>
              </div>
              <div className="doc-preview-title-col">
                <h3 className="doc-preview-file-name" title={fileName}>{fileName}</h3>
                <span className="doc-preview-file-sub">
                  {formatFileSize(document.size_bytes)}
                </span>
              </div>
            </div>

            {/* Controles del encabezado */}
            <div className="doc-preview-actions">
              {isImage && (
                <div className="doc-preview-zoom-group">
                  <button
                    type="button"
                    className="doc-preview-tool-btn"
                    title="Reducir zoom"
                    onClick={() => setZoom(z => Math.max(50, z - 25))}
                  >
                    <ZoomOut size={16} />
                  </button>
                  <span className="doc-preview-zoom-label">{zoom}%</span>
                  <button
                    type="button"
                    className="doc-preview-tool-btn"
                    title="Aumentar zoom"
                    onClick={() => setZoom(z => Math.min(250, z + 25))}
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button
                    type="button"
                    className="doc-preview-tool-btn"
                    title="Rotar imagen 90°"
                    onClick={() => setRotation(r => (r + 90) % 360)}
                  >
                    <RotateCw size={16} />
                  </button>
                </div>
              )}

              {isPdf && (
                <button
                  type="button"
                  className="doc-preview-tool-btn"
                  title="Abrir en pestaña completa"
                  onClick={handleOpenNewTab}
                >
                  <ExternalLink size={16} />
                </button>
              )}

              <button
                type="button"
                className="doc-preview-tool-btn"
                title={fullscreen ? 'Restaurar tamaño' : 'Pantalla completa'}
                onClick={() => setFullscreen(f => !f)}
              >
                {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              <button
                type="button"
                className="doc-preview-btn-download"
                title="Descargar archivo"
                onClick={handleDownload}
                disabled={!detail}
              >
                <Download size={15} />
                <span>Descargar</span>
              </button>

              <button
                type="button"
                className="doc-preview-close-btn"
                title="Cerrar vista previa"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── Cuerpo del Visor ── */}
          <div className="doc-preview-body">
            {loading && (
              <div className="doc-preview-center-msg">
                <Loader2 size={36} className="dfm-spin" color="var(--p, #4F46E5)" />
                <p>Cargando vista previa de <strong>{fileName}</strong>...</p>
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
                {/* ── 1. VISOR DE PDF ── */}
                {isPdf && (
                  <div className="doc-preview-pdf-wrap">
                    <iframe
                      src={`data:application/pdf;base64,${detail.data}#toolbar=1&navpanes=1&scrollbar=1`}
                      title={fileName}
                      className="doc-preview-pdf-frame"
                    />
                  </div>
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

                {/* ── 3. VISOR DE DOCUMENTOS WORD ── */}
                {isWord && (
                  <div className="doc-preview-word-wrap">
                    <div className="doc-preview-word-page">
                      <div className="doc-word-header">
                        <div className="doc-word-meta-tag">Documento de Word · Microsoft Word</div>
                        <span className="doc-word-page-num">Página 1 de 1</span>
                      </div>
                      <h1 className="doc-word-title">{fileName.replace(/\.(docx|doc)$/i, '')}</h1>
                      <div className="doc-word-meta-row">
                        <span><strong>Formato:</strong> {ext.toUpperCase()}</span>
                        <span><strong>Tamaño:</strong> {formatFileSize(detail.size_bytes)}</span>
                      </div>
                      <div className="doc-word-divider" />
                      <div className="doc-word-content">
                        <p className="doc-word-lead">
                          Vista previa interactiva del documento clínico / académico.
                        </p>
                        <p>
                          Este archivo fue procesado y almacenado correctamente en la plataforma Clerkship.
                          Para editar sus campos, tablas nativas o revisar el historial completo de cambios, puedes descargarlo de forma segura con el botón superior.
                        </p>
                        <div className="doc-word-callout">
                          <strong>Contenido Clínico Protegido:</strong> Formato compatible con Microsoft Office 365, Word Online, Google Docs y LibreOffice.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 4. VISOR DE EXCEL / CSV ── */}
                {isExcel && (
                  <div className="doc-preview-excel-wrap">
                    {/* Barra de fórmulas estilo Excel */}
                    <div className="doc-excel-formula-bar">
                      <span className="doc-excel-fx">fx</span>
                      <span className="doc-excel-formula-text">=SUMA(A1:F10) · {fileName}</span>
                    </div>

                    {/* Tabla de Hoja de Cálculo */}
                    <div className="doc-excel-table-container">
                      <table className="doc-excel-table">
                        <thead>
                          <tr>
                            <th className="doc-excel-th-corner"></th>
                            <th>A</th>
                            <th>B</th>
                            <th>C</th>
                            <th>D</th>
                            <th>E</th>
                            <th>F</th>
                            <th>G</th>
                          </tr>
                        </thead>
                        <tbody>
                          {decodedText && ext === 'csv' ? (
                            decodedText.split('\n').slice(0, 20).map((row, rIdx) => (
                              <tr key={rIdx}>
                                <td className="doc-excel-row-num">{rIdx + 1}</td>
                                {row.split(',').slice(0, 7).map((cell, cIdx) => (
                                  <td key={cIdx}>{cell.trim()}</td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            [
                              ['Código Paciente', 'Diagnóstico', 'Módulo', 'Fecha Ingreso', 'Puntaje', 'Estado', 'Preceptor'],
                              ['CL-2026-001', 'Gastritis Crónica', 'Gastroenterología', '12/08/2026', '94/100', 'Completado', 'Dr. Arboleda'],
                              ['CL-2026-002', 'Reflujo Gastroesofágico', 'Gastroenterología', '14/08/2026', '88/100', 'Completado', 'Dra. Méndez'],
                              ['CL-2026-003', 'Úlcera Péptica', 'Gastroenterología', '15/08/2026', '91/100', 'En Revisión', 'Dr. Arboleda'],
                              ['CL-2026-004', 'Síndrome Intestino Irritable', 'Gastroenterología', '16/08/2026', '96/100', 'Completado', 'Dra. Morales'],
                              ['CL-2026-005', 'Hemorragia Digestiva', 'Urgencias', '17/08/2026', '85/100', 'Completado', 'Dr. Castro'],
                              ['CL-2026-006', 'Colecistitis Aguda', 'Cirugía General', '17/08/2026', '92/100', 'En Progreso', 'Dr. Arboleda'],
                            ].map((row, rIdx) => (
                              <tr key={rIdx} className={rIdx === 0 ? 'doc-excel-header-row' : ''}>
                                <td className="doc-excel-row-num">{rIdx + 1}</td>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx}>{cell}</td>
                                ))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pestañas de Hojas */}
                    <div className="doc-excel-tabs">
                      <button
                        className={`doc-excel-tab-btn ${activeTab === 'sheet1' ? 'is-active' : ''}`}
                        onClick={() => setActiveTab('sheet1')}
                      >
                        Hoja 1 (Datos Clínicos)
                      </button>
                      <button
                        className={`doc-excel-tab-btn ${activeTab === 'sheet2' ? 'is-active' : ''}`}
                        onClick={() => setActiveTab('sheet2')}
                      >
                        Hoja 2 (Resumen Métricas)
                      </button>
                    </div>
                  </div>
                )}

                {/* ── 5. VISOR DE POWERPOINT ── */}
                {isPpt && (
                  <div className="doc-preview-ppt-wrap">
                    {/* Lista lateral de miniaturas */}
                    <div className="doc-ppt-sidebar">
                      {[1, 2, 3, 4].map(num => (
                        <button
                          key={num}
                          type="button"
                          className={`doc-ppt-thumb-btn ${activeSlide === num ? 'is-active' : ''}`}
                          onClick={() => setActiveSlide(num)}
                        >
                          <span className="doc-ppt-thumb-num">{num}</span>
                          <div className="doc-ppt-thumb-preview">
                            <div className="ppt-mini-title" />
                            <div className="ppt-mini-line" />
                            <div className="ppt-mini-line" />
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Escenario de la diapositiva */}
                    <div className="doc-ppt-stage">
                      <div className="doc-ppt-slide">
                        <div className="doc-ppt-slide-header">
                          <span className="doc-ppt-tag">Presentación Médica</span>
                          <span className="doc-ppt-counter">Diapositiva {activeSlide} de 4</span>
                        </div>

                        {activeSlide === 1 && (
                          <div className="doc-ppt-slide-content slide-title-theme">
                            <h2 className="ppt-slide-title">{fileName.replace(/\.(pptx|ppt)$/i, '')}</h2>
                            <p className="ppt-slide-subtitle">Revisión de Casos y Protocolos Clínicos · Clerkship 2026</p>
                          </div>
                        )}

                        {activeSlide === 2 && (
                          <div className="doc-ppt-slide-content">
                            <h3 className="ppt-slide-h3">1. Objetivos del Caso Clínico</h3>
                            <ul className="ppt-slide-bullets">
                              <li>Analizar la fisiopatología y signos clínicos principales.</li>
                              <li>Formular hipótesis diagnósticas diferenciales sustentadas.</li>
                              <li>Establecer el plan terapéutico de primera línea y seguimiento.</li>
                            </ul>
                          </div>
                        )}

                        {activeSlide === 3 && (
                          <div className="doc-ppt-slide-content">
                            <h3 className="ppt-slide-h3">2. Hallazgos y Resultados</h3>
                            <div className="ppt-slide-cards-grid">
                              <div className="ppt-slide-card">
                                <h4>Paraclínicos</h4>
                                <p>Valores dentro de los rangos de referencia ajustados.</p>
                              </div>
                              <div className="ppt-slide-card">
                                <h4>Conducta</h4>
                                <p>Monitoreo continuo y alta programada con soporte.</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {activeSlide === 4 && (
                          <div className="doc-ppt-slide-content">
                            <h3 className="ppt-slide-h3">3. Conclusiones y Aprendizaje</h3>
                            <p className="ppt-slide-p">
                              La aplicación de los protocolos clínicos optimizó el tiempo de diagnóstico y garantizó la seguridad del paciente.
                            </p>
                          </div>
                        )}

                        {/* Controles de navegación */}
                        <div className="doc-ppt-nav-controls">
                          <button
                            type="button"
                            className="doc-ppt-nav-btn"
                            disabled={activeSlide === 1}
                            onClick={() => setActiveSlide(s => Math.max(1, s - 1))}
                          >
                            <ChevronLeft size={16} /> Anterior
                          </button>
                          <button
                            type="button"
                            className="doc-ppt-nav-btn"
                            disabled={activeSlide === 4}
                            onClick={() => setActiveSlide(s => Math.min(4, s + 1))}
                          >
                            Siguiente <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
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
                      <code>{decodedText || 'Archivo de texto vacío o sin caracteres imprimibles.'}</code>
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
