import { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, BookOpen, ScrollText, FlaskConical,
  Microscope, Stethoscope as Steth,
  BookMarked, X, Calendar, ChevronDown, Download, BookmarkPlus, Check, Loader2,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import FeedbackFab from '../../components/shared/FeedbackFab';
import { getStoredUser, mainAuthErrorMessage } from '../../data/mainAuth';
import {
  listarArticulos, obtenerEstante, guardarEnEstante, quitarDeEstante, descargarArticulo,
  type Articulo, type ItemEstante,
} from '../../data/articulosApi';

/* ── Tipos de recurso ────────────────────────────────────── */
const TYPES = [
  { id: 'todos',     label: 'Todos los tipos', Icon: BookMarked  },
  { id: 'LIBRO',     label: 'Libros',          Icon: BookOpen    },
  { id: 'GUIA',      label: 'Guías clínicas',  Icon: ScrollText  },
  { id: 'ENSAYO',    label: 'Ensayos',         Icon: FlaskConical},
  { id: 'PROTOCOLO', label: 'Protocolos',      Icon: Microscope  },
  { id: 'CASO',      label: 'Casos clínicos',  Icon: Steth       },
];

/* ── Estilos por tipo ────────────────────────────────────── */
const TYPE_STYLE: Record<string, { bg: string; color: string; label: string; gradient: string }> = {
  LIBRO:     { bg:'#EEF2FF', color:'#4338CA', label:'Libro',        gradient:'linear-gradient(160deg, #3730A3 0%, #818CF8 100%)' },
  GUIA:      { bg:'#F0FDF4', color:'#166534', label:'Guía clínica', gradient:'linear-gradient(160deg, #14532D 0%, #4ADE80 100%)' },
  ENSAYO:    { bg:'#FFF7ED', color:'#C2410C', label:'Ensayo',       gradient:'linear-gradient(160deg, #9A3412 0%, #FB923C 100%)' },
  PROTOCOLO: { bg:'#F0F9FF', color:'#0369A1', label:'Protocolo',    gradient:'linear-gradient(160deg, #075985 0%, #38BDF8 100%)' },
  CASO:      { bg:'#FDF4FF', color:'#7E22CE', label:'Caso clínico', gradient:'linear-gradient(160deg, #6B21A8 0%, #C084FC 100%)' },
};

/* ── Dropdown hook ───────────────────────────────────────── */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return { open, setOpen, ref };
}

interface AccionesEstante {
  esEstudiante: boolean;
  estado: 'NEXT' | 'FINISHED' | null;
  ocupado: boolean;
  onAgregar: () => void;
  onTerminar: () => void;
  onQuitar: () => void;
}

/* ── Tarjeta de recurso ──────────────────────────────────── */
function ResourceCard({ res, delay, descargando, onDescargar, estante }: {
  res: Articulo; delay: number; descargando: boolean; onDescargar: () => void; estante: AccionesEstante;
}) {
  const ts = TYPE_STYLE[res.type] ?? {
    bg:'#F3F4F6', color:'#475569', label:res.type,
    gradient:'linear-gradient(160deg,#475569,#94A3B8)',
  };
  return (
    <motion.div
      className="bib-book"
      initial={{ opacity:0, y:18 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.32, delay, ease:'easeOut' as const }}
    >
      <div className="bib-book-spine" style={{ background: ts.color }} />
      <div className="bib-book-cover" style={{ background: ts.gradient }}>
        <span className="bib-book-badge">{ts.label}</span>
        <div className="bib-book-cover-body">
          <h3 className="bib-book-title">{res.title}</h3>
          {res.authors && <p className="bib-book-author">{res.authors.split(',')[0]}</p>}
        </div>
      </div>
      <div className="bib-book-pages" />

      <div className="bib-book-acciones">
        {res.tiene_pdf && (
          <button type="button" className="bib-book-btn" title="Descargar PDF" onClick={onDescargar} disabled={descargando}>
            {descargando ? <Loader2 size={13} className="dfm-spin" /> : <Download size={13} />}
          </button>
        )}
        {estante.esEstudiante && (
          estante.estado === null ? (
            <button type="button" className="bib-book-btn" title="Agregar a mi estante" onClick={estante.onAgregar} disabled={estante.ocupado}>
              <BookmarkPlus size={13} />
            </button>
          ) : (
            <>
              {estante.estado === 'NEXT' && (
                <button type="button" className="bib-book-btn" title="Marcar como terminado" onClick={estante.onTerminar} disabled={estante.ocupado}>
                  <Check size={13} />
                </button>
              )}
              <button type="button" className="bib-book-btn" title="Quitar del estante" onClick={estante.onQuitar} disabled={estante.ocupado}>
                <X size={13} />
              </button>
            </>
          )
        )}
      </div>
    </motion.div>
  );
}

/* ── Página principal ────────────────────────────────────── */
export default function BibliotecaPage() {
  const esEstudiante = getStoredUser()?.role === 'STUDENT';

  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [estante, setEstante] = useState<ItemEstante[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [estanteOcupadoId, setEstanteOcupadoId] = useState<string | null>(null);

  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [yearFilter, setYearFilter] = useState<number | null>(null);

  const typeDD = useDropdown();
  const yearDD = useDropdown();

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      listarArticulos(),
      esEstudiante ? obtenerEstante() : Promise.resolve([]),
    ])
      .then(([arts, est]) => { setArticulos(arts); setEstante(est); })
      .catch(err => setError(mainAuthErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [esEstudiante]);

  const estanteMap = useMemo(() => {
    const m = new Map<string, ItemEstante>();
    estante.forEach(e => m.set(e.article_id, e));
    return m;
  }, [estante]);

  const YEARS = useMemo(
    () => [...new Set(articulos.map(a => a.year).filter((y): y is number => !!y))].sort((a, b) => b - a),
    [articulos],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return articulos.filter(a => {
      const matchType = typeFilter === 'todos' || a.type === typeFilter;
      const matchYear = yearFilter === null || a.year === yearFilter;
      const matchQ = !q
        || a.title.toLowerCase().includes(q)
        || (a.authors || '').toLowerCase().includes(q)
        || a.tags.some(t => t.toLowerCase().includes(q))
        || (a.specialty || '').toLowerCase().includes(q);
      return matchType && matchYear && matchQ;
    });
  }, [articulos, query, typeFilter, yearFilter]);

  const nextShelf     = esEstudiante ? filtered.filter(a => estanteMap.get(a.id)?.status === 'NEXT') : [];
  const finishedShelf  = esEstudiante ? filtered.filter(a => estanteMap.get(a.id)?.status === 'FINISHED') : [];
  const catalogShelf  = esEstudiante ? filtered.filter(a => !estanteMap.has(a.id)) : filtered;

  const typeLabel = TYPES.find(t => t.id === typeFilter)?.label ?? 'Todos';
  const hasFilters = !!query || typeFilter !== 'todos' || yearFilter !== null;

  async function handleDescargar(articulo: Articulo) {
    setDescargandoId(articulo.id);
    try {
      const { url } = await descargarArticulo(articulo.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setDescargandoId(null);
    }
  }

  async function handleAgregar(articulo: Articulo) {
    setEstanteOcupadoId(articulo.id);
    try {
      const item = await guardarEnEstante(articulo.id, 'NEXT');
      setEstante(prev => [...prev.filter(e => e.article_id !== articulo.id), item]);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setEstanteOcupadoId(null);
    }
  }

  async function handleTerminar(articulo: Articulo) {
    setEstanteOcupadoId(articulo.id);
    try {
      const item = await guardarEnEstante(articulo.id, 'FINISHED');
      setEstante(prev => [...prev.filter(e => e.article_id !== articulo.id), item]);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setEstanteOcupadoId(null);
    }
  }

  async function handleQuitar(articulo: Articulo) {
    setEstanteOcupadoId(articulo.id);
    try {
      await quitarDeEstante(articulo.id);
      setEstante(prev => prev.filter(e => e.article_id !== articulo.id));
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setEstanteOcupadoId(null);
    }
  }

  function accionesPara(articulo: Articulo): AccionesEstante {
    return {
      esEstudiante,
      estado: estanteMap.get(articulo.id)?.status ?? null,
      ocupado: estanteOcupadoId === articulo.id,
      onAgregar: () => handleAgregar(articulo),
      onTerminar: () => handleTerminar(articulo),
      onQuitar: () => handleQuitar(articulo),
    };
  }

  function renderFila(titulo: string, lista: Articulo[]) {
    if (lista.length === 0) return null;
    return (
      <div className="bib-shelf-row">
        <div className="bib-shelf-header">
          <h2 className="bib-shelf-title">{titulo}</h2>
        </div>
        <div className="bib-shelf-container">
          <div className="bib-shelf-books">
            {lista.map((a, i) => (
              <ResourceCard
                key={a.id}
                res={a}
                delay={i * 0.04}
                descargando={descargandoId === a.id}
                onDescargar={() => handleDescargar(a)}
                estante={accionesPara(a)}
              />
            ))}
          </div>
          <div className="bib-shelf-board" />
        </div>
      </div>
    );
  }

  return (
    <div className="dash-root">
      <Sidebar />
      <FeedbackFab pestana="biblioteca" />

      <div className="bib-body">

        {/* ══ Sticky search bar ══ */}
        <div className="bib-sbar-wrap">
          <div className="bib-sbar-pill">

            <span className="bib-sbar-lead-ico">
              <Search size={14} strokeWidth={2} />
            </span>

            <input
              className="bib-sbar-input"
              placeholder="Busca libros, guías y referencias…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />

            {query && (
              <button className="bib-sbar-x" onClick={() => setQuery('')}>
                <X size={13} />
              </button>
            )}

            <div className="bib-sbar-divider" />

            <div className="bib-sbar-dd-wrap" ref={yearDD.ref}>
              <button
                className={`bib-sbar-filter-btn${yearDD.open ? ' bib-sbar-filter-btn-on' : ''}${yearFilter ? ' bib-sbar-filter-btn-active' : ''}`}
                onClick={() => { yearDD.setOpen(v => !v); typeDD.setOpen(false); }}
              >
                <Calendar size={14} strokeWidth={1.8} />
                <span>{yearFilter ?? 'Año'}</span>
                <ChevronDown size={11} strokeWidth={2.2} className={`bib-sbar-chevron${yearDD.open ? ' bib-sbar-chevron-up' : ''}`} />
              </button>

              {yearDD.open && (
                <div className="bib-sbar-dropdown">
                  <button
                    className={`bib-sbar-dd-item${yearFilter === null ? ' bib-sbar-dd-item-on' : ''}`}
                    onClick={() => { setYearFilter(null); yearDD.setOpen(false); }}
                  >
                    Todos los años
                  </button>
                  {YEARS.map(y => (
                    <button
                      key={y}
                      className={`bib-sbar-dd-item${yearFilter === y ? ' bib-sbar-dd-item-on' : ''}`}
                      onClick={() => { setYearFilter(y); yearDD.setOpen(false); }}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bib-sbar-dd-wrap" ref={typeDD.ref}>
              <button
                className={`bib-sbar-filter-btn${typeDD.open ? ' bib-sbar-filter-btn-on' : ''}${typeFilter !== 'todos' ? ' bib-sbar-filter-btn-active' : ''}`}
                onClick={() => { typeDD.setOpen(v => !v); yearDD.setOpen(false); }}
              >
                <span className="bib-sbar-filter-dot" style={{ background: typeFilter !== 'todos' ? (TYPE_STYLE[typeFilter]?.color ?? '#94A3B8') : '#CBD5E1' }} />
                <span>{typeLabel}</span>
                <ChevronDown size={11} strokeWidth={2.2} className={`bib-sbar-chevron${typeDD.open ? ' bib-sbar-chevron-up' : ''}`} />
              </button>

              {typeDD.open && (
                <div className="bib-sbar-dropdown bib-sbar-dropdown-right">
                  {TYPES.map(({ id, label }) => (
                    <button
                      key={id}
                      className={`bib-sbar-dd-item${typeFilter === id ? ' bib-sbar-dd-item-on' : ''}`}
                      onClick={() => { setTypeFilter(id); typeDD.setOpen(false); }}
                    >
                      {id !== 'todos' && (
                        <span className="bib-sbar-dd-dot" style={{ background: TYPE_STYLE[id]?.color ?? '#94A3B8' }} />
                      )}
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {hasFilters && (
              <button className="bib-sbar-reset" onClick={() => { setQuery(''); setTypeFilter('todos'); setYearFilter(null); }}>
                <X size={12} />
              </button>
            )}
          </div>

          <p className="bib-sbar-meta">
            {loading ? 'Cargando…' : `${filtered.length} ${filtered.length === 1 ? 'recurso' : 'recursos'}`}
          </p>
          {error && <p className="bib-sbar-meta" style={{ color: '#b91c1c' }}>{error}</p>}
        </div>

        {/* ══ Estantes ══ */}
        <div className="bib-shelves">
          {!loading && esEstudiante && renderFila('Mi estante', nextShelf)}
          {!loading && esEstudiante && renderFila('Terminados', finishedShelf)}
          {!loading && renderFila(esEstudiante ? 'Catálogo' : 'Todos los recursos', catalogShelf)}

          {!loading && filtered.length === 0 && (
            <motion.div className="bib-empty" initial={{ opacity:0 }} animate={{ opacity:1 }}>
              <BookOpen size={40} strokeWidth={1.2} />
              <p>
                {articulos.length === 0
                  ? 'Todavía no hay recursos publicados en la biblioteca.'
                  : 'No se encontraron recursos con esos criterios.'}
              </p>
              {hasFilters && (
                <button
                  className="bib-chip bib-chip-on"
                  style={{ marginTop:8 }}
                  onClick={() => { setQuery(''); setTypeFilter('todos'); setYearFilter(null); }}
                >
                  Limpiar búsqueda
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
