import { X, FileText, Link as LinkIcon } from 'lucide-react';
import type { CourseContentItem } from '../../data/cursoContenidoApi';
import { toEmbedUrl } from '../../utils/videoEmbed';
import ContenidoDocumentoViewer from './ContenidoDocumentoViewer';

interface Props {
  courseId: string;
  item: CourseContentItem;
  onClose: () => void;
}

export default function ContenidoPreviewModal({ courseId, item, onClose }: Props) {
  const embedUrl = item.type === 'VIDEO' && item.video_url ? toEmbedUrl(item.video_url) : null;

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div className="ccv-modal" onClick={e => e.stopPropagation()}>
        <div className="ccv-modal-header">
          <h3>{item.title}</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {item.description && <p className="ccv-modal-desc">{item.description}</p>}

        <div className="ccv-modal-body">
          {item.type === 'DOCUMENT' && (
            <ContenidoDocumentoViewer courseId={courseId} item={item} />
          )}

          {item.type === 'VIDEO' && (
            embedUrl ? (
              <div className="ccv-video-wrap">
                <iframe
                  src={embedUrl}
                  title={item.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="ccv-center">
                <FileText size={36} />
                <p>No se pudo reconocer este link de video.</p>
                {item.video_url && (
                  <a href={item.video_url} target="_blank" rel="noreferrer" className="ccv-download-btn">
                    <LinkIcon size={14} /> Abrir enlace original
                  </a>
                )}
              </div>
            )
          )}

          {item.type === 'LINK' && (
            <div className="ccv-center">
              <LinkIcon size={36} />
              <p>{item.link_url}</p>
              {item.link_url && (
                <a href={item.link_url} target="_blank" rel="noreferrer" className="ccv-download-btn">
                  <LinkIcon size={14} /> Abrir enlace
                </a>
              )}
            </div>
          )}

          {item.type === 'TEXT' && (
            <div className="ccv-text-block">
              {item.text_content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
