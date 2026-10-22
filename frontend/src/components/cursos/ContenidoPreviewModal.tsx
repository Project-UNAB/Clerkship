import { useState } from 'react';
import DOMPurify from 'dompurify';
import { Download, ExternalLink, FileText, Link as LinkIcon, Loader2, Type, Video } from 'lucide-react';
import { obtenerArchivoContenido, type CourseContentItem } from '../../data/cursoContenidoApi';
import { toEmbedUrl } from '../../utils/videoEmbed';
import { formatFileSize } from '../../utils/fileUpload';
import ContenidoDocumentoViewer from './ContenidoDocumentoViewer';
import VistaCompleta from './VistaCompleta';

// El backend ya sanitiza text_content antes de guardarlo (bleach), pero se
// vuelve a limpiar acá como defensa en profundidad: si por lo que sea llega
// HTML sin pasar por esa ruta, nunca se inyecta sin filtrar.
const SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a',
    'blockquote', 'code', 'pre', 'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'value'],
};

const ASPECTO = {
  DOCUMENT: { etiqueta: 'Documento', color: '#1976d2', Icono: FileText },
  VIDEO: { etiqueta: 'Video', color: '#e53935', Icono: Video },
  LINK: { etiqueta: 'Enlace', color: '#00897b', Icono: LinkIcon },
  TEXT: { etiqueta: 'Lectura', color: '#546e7a', Icono: Type },
} as const;

interface Props {
  courseId: string;
  item: CourseContentItem;
  onClose: () => void;
}

/** El contenido del curso a pantalla completa: documentos (PDF, Word,
 * PowerPoint, Excel, imágenes, código), videos, enlaces y lecturas. Al
 * volver (flecha, «atrás» o Escape) el curso queda como estaba. */
export default function ContenidoPreviewModal({ courseId, item, onClose }: Props) {
  const embedUrl = item.type === 'VIDEO' && item.video_url ? toEmbedUrl(item.video_url) : null;
  const aspecto = ASPECTO[item.type as keyof typeof ASPECTO] ?? ASPECTO.DOCUMENT;
  const [descargando, setDescargando] = useState(false);

  async function descargar() {
    setDescargando(true);
    try {
      const res = await obtenerArchivoContenido(courseId, item.block_id, item.id);
      const a = document.createElement('a');
      a.href = `data:${res.document.mime_type};base64,${res.document.data}`;
      a.download = res.document.name;
      a.click();
    } finally {
      setDescargando(false);
    }
  }

  const enlaceExterno = item.type === 'LINK' ? item.link_url : item.type === 'VIDEO' ? item.video_url : null;
  const subtitulo = item.type === 'DOCUMENT' && item.file
    ? [item.file.nombre, item.file.size_bytes ? formatFileSize(item.file.size_bytes) : null].filter(Boolean).join(' · ')
    : item.description || undefined;

  return (
    <VistaCompleta
      etiqueta={aspecto.etiqueta}
      titulo={item.title}
      subtitulo={subtitulo}
      icono={<aspecto.Icono size={18} />}
      color={aspecto.color}
      fondo={item.type === 'DOCUMENT' ? 'gris' : 'claro'}
      onClose={onClose}
      acciones={
        <>
          {item.type === 'DOCUMENT' && (
            <button type="button" className="av-btn" onClick={descargar} disabled={descargando}>
              {descargando ? <Loader2 size={15} className="dfm-spin" /> : <Download size={15} />}
              <span>Descargar</span>
            </button>
          )}
          {enlaceExterno && (
            <a className="av-btn" href={enlaceExterno} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} /> <span>Abrir en otra pestaña</span>
            </a>
          )}
        </>
      }
    >
      {item.type === 'DOCUMENT' && (
        <div className="av-doc">
          {item.description && <p className="av-doc-desc">{item.description}</p>}
          <div className="av-doc-visor"><ContenidoDocumentoViewer courseId={courseId} item={item} /></div>
        </div>
      )}

      {item.type === 'VIDEO' && (
        <div className="av-centro">
          {embedUrl ? (
            <div className="av-video">
              <iframe
                src={embedUrl}
                title={item.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="av-tarjeta-aviso">
              <Video size={30} />
              <strong>No se pudo reconocer este enlace de video.</strong>
              {item.video_url && <a className="av-btn is-principal" href={item.video_url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir el enlace original</a>}
            </div>
          )}
          {item.description && embedUrl && <p className="av-video-desc">{item.description}</p>}
        </div>
      )}

      {item.type === 'LINK' && (
        <div className="av-centro">
          <div className="av-tarjeta-aviso">
            <span className="av-tarjeta-icono"><LinkIcon size={26} /></span>
            <strong>{item.title}</strong>
            {item.description && <p>{item.description}</p>}
            {item.link_url && <code className="av-url">{item.link_url}</code>}
            {item.link_url && (
              <a className="av-btn is-principal" href={item.link_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={15} /> Abrir el enlace
              </a>
            )}
          </div>
        </div>
      )}

      {item.type === 'TEXT' && (
        <article className="av-lectura">
          <div className="ccv-rte-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.text_content || '', SANITIZE_OPTS) }} />
        </article>
      )}
    </VistaCompleta>
  );
}
