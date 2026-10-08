import { useEffect, useState } from 'react';
import { Loader2, Download, FileText } from 'lucide-react';
import {
  obtenerArchivoContenido,
  obtenerVistaPreviaContenido,
  type CourseContentItem,
} from '../../data/cursoContenidoApi';
import CustomPdfViewer from '../dashboard/CustomPdfViewer';
import ExcelSpreadsheetViewer from '../dashboard/ExcelSpreadsheetViewer';
import CodeViewer from '../dashboard/CodeViewer';

interface Props {
  courseId: string;
  item: CourseContentItem;
}

const CODE_EXTENSIONS = [
  'txt', 'csv', 'json', 'yaml', 'yml', 'xml', 'md', 'markdown',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue',
  'py', 'php', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'cc', 'hpp', 'cxx', 'cs',
  'go', 'rs', 'swift', 'sql', 'sh', 'bash', 'html', 'htm', 'css', 'scss',
];

/** Visor de documentos de material de curso — mismo stack que la Carpeta
 * de Documentos del Dashboard (PDF.js, Gotenberg para Word/PPT, SheetJS +
 * x-data-spreadsheet para Excel, Shiki para código), pero leyendo desde los
 * endpoints de contenido de curso en vez de /api/documentos. */
export default function ContenidoDocumentoViewer({ courseId, item }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [decodedText, setDecodedText] = useState<string>('');

  const fileName = item.file?.nombre || item.title;
  const mime = (item.file?.mime_type || '').toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const isPdf = mime.includes('pdf') || ext === 'pdf';
  const isExcel = mime.includes('excel') || mime.includes('spreadsheetml') || ['xls', 'xlsx'].includes(ext);
  const isOffice = !isExcel && (mime.includes('word') || mime.includes('officedocument.wordprocessingml') || mime.includes('presentation') || mime.includes('powerpoint') || ['doc', 'docx', 'ppt', 'pptx'].includes(ext));
  const isImage = mime.includes('image') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
  const isCode = !isOffice && !isExcel && !isImage && !isPdf && (mime.includes('text') || CODE_EXTENSIONS.includes(ext));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBase64Data(null);
    setPdfBase64(null);
    setDecodedText('');

    async function cargar() {
      try {
        if (isOffice) {
          const preview = await obtenerVistaPreviaContenido(courseId, item.block_id, item.id);
          if (!cancelled) setPdfBase64(preview.data);
          return;
        }

        const res = await obtenerArchivoContenido(courseId, item.block_id, item.id);
        if (cancelled) return;
        const data = res.document.data;

        if (isPdf) {
          setPdfBase64(data);
        } else if (isCode) {
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          setDecodedText(new TextDecoder('utf-8').decode(bytes));
        } else {
          setBase64Data(data);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'No se pudo cargar el documento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    cargar();
    return () => {
      cancelled = true;
    };
  }, [courseId, item.id, item.block_id, isOffice, isPdf, isCode]);

  function handleDownload() {
    obtenerArchivoContenido(courseId, item.block_id, item.id).then(res => {
      const link = document.createElement('a');
      link.href = `data:${res.document.mime_type};base64,${res.document.data}`;
      link.download = res.document.name;
      link.click();
    });
  }

  if (loading) {
    return (
      <div className="ccv-center">
        <Loader2 size={32} className="dfm-spin" />
        <p>Cargando <strong>{fileName}</strong>...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ccv-center ccv-error">
        <FileText size={36} color="#EF4444" />
        <p>{error}</p>
        <button type="button" className="ccv-download-btn" onClick={handleDownload}>
          <Download size={14} /> Descargar de todos modos
        </button>
      </div>
    );
  }

  if (isExcel) {
    return base64Data ? (
      <div className="ccv-excel-wrap"><ExcelSpreadsheetViewer base64Data={base64Data} /></div>
    ) : null;
  }

  if (pdfBase64) {
    return <CustomPdfViewer base64Data={pdfBase64} fileName={fileName} />;
  }

  if (isImage && base64Data) {
    return (
      <div className="ccv-image-wrap">
        <img src={`data:${mime};base64,${base64Data}`} alt={fileName} />
      </div>
    );
  }

  if (isCode) {
    return (
      <div className="ccv-code-wrap">
        <CodeViewer code={decodedText} ext={ext} fontSizeRem={0.84} />
      </div>
    );
  }

  return (
    <div className="ccv-center">
      <FileText size={36} />
      <p>Vista previa no disponible para este tipo de archivo.</p>
      <button type="button" className="ccv-download-btn" onClick={handleDownload}>
        <Download size={14} /> Descargar
      </button>
    </div>
  );
}
