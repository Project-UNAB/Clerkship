import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, BookmarkPlus, Check, X, Loader2, BookOpen, MoreVertical, Pencil, Trash2, Heart } from 'lucide-react';
import type { Articulo } from '../../data/articulosApi';

/* ── Estilos por tipo de recurso clínico ─────────────────── */
export const TYPE_STYLE: Record<string, { bg: string; color: string; label: string; gradient: string }> = {
  LIBRO:     { bg: '#EEF2FF', color: '#4338CA', label: 'Libro',        gradient: 'linear-gradient(160deg, #3730A3 0%, #818CF8 100%)' },
  GUIA:      { bg: '#F0FDF4', color: '#166534', label: 'Guía clínica', gradient: 'linear-gradient(160deg, #14532D 0%, #4ADE80 100%)' },
  ENSAYO:    { bg: '#FFF7ED', color: '#C2410C', label: 'Ensayo',       gradient: 'linear-gradient(160deg, #9A3412 0%, #FB923C 100%)' },
  PROTOCOLO: { bg: '#F0F9FF', color: '#0369A1', label: 'Protocolo',    gradient: 'linear-gradient(160deg, #075985 0%, #38BDF8 100%)' },
  CASO:      { bg: '#FDF4FF', color: '#7E22CE', label: 'Caso clínico', gradient: 'linear-gradient(160deg, #6B21A8 0%, #C084FC 100%)' },
};

export interface AccionesEstante {
  esEstudiante: boolean;
  estado: 'NEXT' | 'FINISHED' | null;
  ocupado: boolean;
  onAgregar: () => void;
  onTerminar: () => void;
  onQuitar: () => void;
}

export interface BookCardProps {
  res: Articulo;
  delay?: number;
  descargando?: boolean;
  onDescargar?: () => void;
  onOpenFlipbook: (res: Articulo) => void;
  estante: AccionesEstante;
  puedeEditar?: boolean;
  onEditar?: (res: Articulo) => void;
  onRetirar?: (res: Articulo) => void;
  /** Clic derecho (o tecla de menú) sobre el libro: abre el menú propio de la biblioteca. */
  onMenu?: (res: Articulo, x: number, y: number) => void;
  esFavorito?: boolean;
}

/**
 * Componente modular de Tarjeta de Libro para la Biblioteca.
 * Presenta la portada 3D con efecto de encuadernación, información del libro,
 * menú para el autor/admin (Editar/Retirar) y apertura en Flipbook interactivo.
 */
export default function BookCard({
  res,
  delay = 0,
  descargando = false,
  onDescargar,
  onOpenFlipbook,
  estante,
  puedeEditar = false,
  onEditar,
  onRetirar,
  onMenu,
  esFavorito = false,
}: BookCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const ts = TYPE_STYLE[res.type] ?? {
    bg: '#F3F4F6',
    color: '#475569',
    label: res.type,
    gradient: 'linear-gradient(160deg,#475569,#94A3B8)',
  };

  return (
    <motion.div
      className="bib-book bib-book-clickable"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: 'easeOut' }}
      onClick={() => onOpenFlipbook(res)}
      onContextMenu={onMenu ? e => {
        e.preventDefault();
        // Con la tecla de menú no hay coordenadas del puntero: se abre junto al libro.
        const r = e.currentTarget.getBoundingClientRect();
        onMenu(res, e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2);
      } : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenFlipbook(res);
        }
      }}
      title={`Hacer clic para abrir libro: ${res.title}`}
    >
      {/* Lomo 3D del libro */}
      <div className="bib-book-spine" style={{ background: ts.color }} />

      {/* Portada del libro con gradiente */}
      <div
        className={`bib-book-cover ${res.portada_url ? 'has-portada' : ''}`}
        style={res.portada_url
          ? { backgroundImage: `url("${res.portada_url}")` }
          : { background: ts.gradient }}
      >
        {/* Fila superior: tipo a la izquierda, idioma a la derecha */}
        <div className="bib-book-cover-top">
          <span className="bib-book-badge">{ts.label}</span>
          <span className="bib-book-etiquetas-der">
            {esFavorito && (
              <span className="bib-book-favorito" title="En tus favoritos" aria-label="En tus favoritos">
                <Heart size={9} strokeWidth={2.6} fill="currentColor" />
              </span>
            )}
            {res.idioma && (
              <span className="bib-book-idioma" title={res.idioma === 'es' ? 'En español' : 'En inglés'}>
                {res.idioma.toUpperCase()}
              </span>
            )}
          </span>
        </div>

        {res.estado === 'PENDIENTE' && (
          <span
            className="bib-book-badge"
            style={{ background: '#FEF3C7', color: '#92400E', marginTop: 4 }}
            title="En revisión por el administrador"
          >
            En revisión
          </span>
        )}
        {res.estado === 'RECHAZADO' && (
          <span
            className="bib-book-badge"
            style={{ background: '#FEE2E2', color: '#991B1B', marginTop: 4, whiteSpace: 'normal' }}
            title={`Rechazado: ${res.motivo_rechazo ?? ''}`}
          >
            {`Rechazado: ${res.motivo_rechazo || 'Sin motivo'}`}
          </span>
        )}

        {/* Badge flotante animado de "Abrir libro" al hacer hover */}
        <span className="bib-book-read-badge">
          <BookOpen size={11} strokeWidth={2.2} />
          <span>Leer</span>
        </span>

        {/* Título y autor, también sobre la portada (con un velo para leerlos bien) */}
        <div className="bib-book-cover-body">
          <h3 className="bib-book-title">{res.title}</h3>
          {res.authors && (
            <p className="bib-book-author">{res.authors.split(',')[0]}</p>
          )}
          {res.pages && (
            <span className="bib-book-pages-badge">
              {res.pages} págs.
            </span>
          )}
        </div>
      </div>

      {/* Hojas laterales 3D del libro */}
      <div className="bib-book-pages" />

      {/* Acciones de la tarjeta (Descarga, Estante y Menú de Autor) */}
      <div
        className="bib-book-acciones"
        style={menuOpen ? { opacity: 1 } : undefined}
        onClick={e => e.stopPropagation()} // Evitar abrir el libro al hacer clic en las acciones
      >
        {onDescargar && (
          <button
            type="button"
            className="bib-book-btn"
            title="Descargar archivo PDF"
            onClick={onDescargar}
            disabled={descargando}
          >
            {descargando ? <Loader2 size={13} className="dfm-spin" /> : <Download size={13} />}
          </button>
        )}

        {estante.esEstudiante && (
          estante.estado === null ? (
            <button
              type="button"
              className="bib-book-btn"
              title="Agregar a mi estante"
              onClick={estante.onAgregar}
              disabled={estante.ocupado}
            >
              <BookmarkPlus size={13} />
            </button>
          ) : (
            <>
              {estante.estado === 'NEXT' && (
                <button
                  type="button"
                  className="bib-book-btn"
                  title="Marcar como terminado"
                  onClick={estante.onTerminar}
                  disabled={estante.ocupado}
                >
                  <Check size={13} />
                </button>
              )}
              <button
                type="button"
                className="bib-book-btn"
                title="Quitar del estante"
                onClick={estante.onQuitar}
                disabled={estante.ocupado}
              >
                <X size={13} />
              </button>
            </>
          )
        )}

        {/* Menú del autor / administrador: Editar y Retirar */}
        {puedeEditar && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="bib-book-btn"
              title="Opciones del recurso"
              onClick={e => {
                e.stopPropagation();
                setMenuOpen(v => !v);
              }}
            >
              <MoreVertical size={13} />
            </button>
            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: 'var(--surface, #FFFFFF)',
                  border: '1px solid var(--border, #E2E8F0)',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  minWidth: 105,
                  zIndex: 30,
                }}
                onClick={e => e.stopPropagation()}
              >
                {onEditar && (
                  <button
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--ink, #0F172A)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2, #F1F5F9)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => {
                      setMenuOpen(false);
                      onEditar(res);
                    }}
                  >
                    <Pencil size={12} color="#0284C7" />
                    <span>Editar</span>
                  </button>
                )}
                {onRetirar && (
                  <button
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: '#DC2626',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#FEE2E2')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => {
                      setMenuOpen(false);
                      onRetirar(res);
                    }}
                  >
                    <Trash2 size={12} color="#DC2626" />
                    <span>Retirar</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
