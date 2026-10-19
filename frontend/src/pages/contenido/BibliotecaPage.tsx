import { lazy, Suspense, useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, BookOpen, ScrollText, FlaskConical,
  Microscope, Stethoscope as Steth,
  BookMarked, X, Calendar, ChevronDown, Upload, Languages, ChevronRight, ArrowLeft, ZoomIn, ZoomOut, SlidersHorizontal,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import FeedbackFab from '../../components/shared/FeedbackFab';
import BookCard, { TYPE_STYLE, type AccionesEstante } from '../../components/biblioteca/BookCard';
// El visor (PDF.js y el efecto de pasar páginas) pesa cerca de 1 MB: se descarga
// solo la primera vez que se abre un libro, no al entrar a la biblioteca.
const FlipbookViewer = lazy(() => import('../../components/biblioteca/FlipbookViewer'));
// Estilos de las tarjetas de libros y del visor (se necesitan antes de abrir uno).
import '../../styles/flipbook.css';
import EditarArticuloModal from '../../components/biblioteca/EditarArticuloModal';
import ConfirmarRetiroModal from '../../components/biblioteca/ConfirmarRetiroModal';
import { getStoredUser, mainAuthErrorMessage } from '../../data/mainAuth';
import {
  listarArticulos, obtenerEstante, guardarEnEstante, quitarDeEstante, descargarArticulo,
  editarArticulo, retirarArticulo,
  type Articulo, type ItemEstante,
} from '../../data/articulosApi';
import { MAX_FILE_BYTES } from '../../data/almacenamientoApi';
import PublicarLibroModal from '../../components/biblioteca/PublicarLibroModal';
import { IDIOMAS, type IdiomaDocumento } from '../../components/biblioteca/idiomas';
import { useZoomBiblioteca, ZOOM_MIN, ZOOM_MAX, ZOOM_PREDETERMINADO } from '../../components/biblioteca/useZoomBiblioteca';
import CarruselEstante from '../../components/biblioteca/CarruselEstante';

/* ── Tipos de recurso ────────────────────────────────────── */
const TYPES = [
  { id: 'todos',     label: 'Todos los tipos', Icon: BookMarked  },
  { id: 'LIBRO',     label: 'Libros',          Icon: BookOpen    },
  { id: 'GUIA',      label: 'Guías clínicas',  Icon: ScrollText  },
  { id: 'ENSAYO',    label: 'Ensayos',         Icon: FlaskConical},
  { id: 'PROTOCOLO', label: 'Protocolos',      Icon: Microscope  },
  { id: 'CASO',      label: 'Casos clínicos',  Icon: Steth       },
];

/** Libros que se muestran en el estante de cada tipo antes de «Ver todos». */
const LIBROS_POR_ESTANTE = 24;
/** Filas de la estantería completa que se dibujan de entrada y en cada tanda al bajar. */
const FILAS_INICIALES = 5;
const FILAS_POR_TANDA = 4;

type Orden = 'recientes' | 'titulo' | 'ano' | 'paginas';
const ORDENES: { id: Orden; label: string }[] = [
  { id: 'recientes', label: 'Más recientes' },
  { id: 'titulo', label: 'Título (A–Z)' },
  { id: 'ano', label: 'Año (más nuevo)' },
  { id: 'paginas', label: 'Más páginas' },
];

function ordenar(lista: Articulo[], orden: Orden): Articulo[] {
  if (orden === 'recientes') return lista; // el backend ya los entrega del más nuevo al más viejo
  const copia = [...lista];
  if (orden === 'titulo') copia.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
  if (orden === 'ano') copia.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  if (orden === 'paginas') copia.sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0));
  return copia;
}
/** Ancho de un libro del estante más el espacio entre libros (ver .bib-book en dashboard.css). */
const ANCHO_LIBRO = { normal: 114 + 14, movil: 98 + 10 };
const RELLENO_ESTANTE = { normal: 60, movil: 20 };

/** Cuántos libros caben por fila de la estantería según el ancho del contenedor
 * y el zoom (el libro crece con el zoom; el espacio entre libros, no). */
function useLibrosPorFila(zoom: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [porFila, setPorFila] = useState(8);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const movil = window.innerWidth <= 768;
      const ancho = el.clientWidth - (movil ? RELLENO_ESTANTE.movil : RELLENO_ESTANTE.normal);
      const espacio = movil ? 10 : 14;
      const libro = ((movil ? ANCHO_LIBRO.movil : ANCHO_LIBRO.normal) - espacio) * (zoom / 100) + espacio;
      setPorFila(Math.max(1, Math.floor((ancho + espacio) / libro)));
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [zoom]);
  return { ref, porFila };
}

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

/* ── Página principal ────────────────────────────────────── */
export default function BibliotecaPage() {
  const usuarioActual = getStoredUser();
  const esEstudiante = usuarioActual?.role === 'STUDENT';

  const [selectedBook, setSelectedBook] = useState<{
    articulo: Articulo;
    title: string;
    authors?: string | null;
    pdfUrl: string;
  } | null>(null);

  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [estante, setEstante] = useState<ItemEstante[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avisoSubida, setAvisoSubida] = useState<string | null>(null);
  const [pdfAPublicar, setPdfAPublicar] = useState<File | null>(null);
  // Mientras el cuadro de publicar está abierto, el botón «Subir PDF» queda ocupado.
  const subiendoPdf = pdfAPublicar !== null;
  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [estanteOcupadoId, setEstanteOcupadoId] = useState<string | null>(null);

  const [editandoArticulo, setEditandoArticulo] = useState<Articulo | null>(null);
  const [retirandoArticulo, setRetirandoArticulo] = useState<Articulo | null>(null);

  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [langFilter, setLangFilter] = useState<IdiomaDocumento | null>(null);
  const [orden, setOrden] = useState<Orden>('recientes');
  // En el móvil los filtros, el zoom y «Subir PDF» se despliegan con un botón.
  const [controlesAbiertos, setControlesAbiertos] = useState(false);
  // La estantería completa se dibuja por partes: unas filas y más al bajar.
  const [filasVisibles, setFilasVisibles] = useState(FILAS_INICIALES);
  const bodyRef = useRef<HTMLDivElement>(null);
  const centinelaRef = useRef<HTMLDivElement>(null);

  const typeDD = useDropdown();
  const yearDD = useDropdown();
  const langDD = useDropdown();
  const zoomBib = useZoomBiblioteca(usuarioActual?.id);
  const estanteria = useLibrosPorFila(zoomBib.zoom);

  function puedeEditarArticulo(a: Articulo): boolean {
    if (!usuarioActual) return false;
    if (usuarioActual.role === 'ADMIN') return true;
    return Boolean(
      (a.created_by && a.created_by === usuarioActual.id) ||
      (a.publicado_por && a.publicado_por === usuarioActual.id)
    );
  }

  async function handleGuardarEdicion(payload: {
    title: string;
    authors?: string;
    year?: number;
    pages?: number;
    description?: string;
    idioma?: IdiomaDocumento;
  }) {
    if (!editandoArticulo) return;
    const actualizado = await editarArticulo(editandoArticulo.id, payload);
    setArticulos(prev => prev.map(a => (a.id === actualizado.id ? actualizado : a)));
    setEditandoArticulo(null);
  }

  async function handleConfirmarRetiro() {
    if (!retirandoArticulo) return;
    await retirarArticulo(retirandoArticulo.id);
    setArticulos(prev => prev.filter(a => a.id !== retirandoArticulo.id));
    setEstante(prev => prev.filter(e => e.article_id !== retirandoArticulo.id));
    setRetirandoArticulo(null);
  }

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

  async function handleSubirPdf(file: File | undefined) {
    if (!file) return;
    setError(null);
    setAvisoSubida(null);
    if (file.type !== 'application/pdf') {
      setError('Solo se pueden publicar archivos PDF en la biblioteca.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('El archivo supera el máximo de 2 GB.');
      return;
    }
    // Antes de publicar se piden los datos, el tipo y la portada.
    setPdfAPublicar(file);
  }

  function handlePublicado(nuevo: Articulo) {
    setArticulos(prev => [nuevo, ...prev.filter(a => a.id !== nuevo.id)]);
    if (nuevo.estado !== 'APROBADO') {
      setAvisoSubida('Tu publicación quedó en revisión');
    }
  }

  useEffect(() => { setFilasVisibles(FILAS_INICIALES); }, [typeFilter, query, yearFilter, langFilter, orden]);

  useEffect(() => {
    const el = centinelaRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entradas => {
      if (entradas.some(e => e.isIntersecting)) setFilasVisibles(v => v + FILAS_POR_TANDA);
    }, { rootMargin: '400px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  });

  const misEnRevisionORechazados = useMemo(
    () => articulos.filter(a => a.estado === 'PENDIENTE' || a.estado === 'RECHAZADO'),
    [articulos],
  );

  const estanteMap = useMemo(() => {
    const m = new Map<string, ItemEstante>();
    estante.forEach(e => m.set(e.article_id, e));
    return m;
  }, [estante]);

  const YEARS = useMemo(
    () => [...new Set(articulos.map(a => a.year).filter((y): y is number => !!y))].sort((a, b) => b - a),
    [articulos],
  );

  // Todos los filtros menos el de tipo: sirve para contar cuántos hay de cada tipo.
  const sinFiltroDeTipo = useMemo(() => {
    const q = query.toLowerCase();
    return ordenar(articulos.filter(a => {
      const matchYear = yearFilter === null || a.year === yearFilter;
      const matchLang = langFilter === null || a.idioma === langFilter;
      const matchQ = !q
        || a.title.toLowerCase().includes(q)
        || (a.authors || '').toLowerCase().includes(q)
        || a.tags.some(t => t.toLowerCase().includes(q))
        || (a.specialty || '').toLowerCase().includes(q);
      return matchYear && matchLang && matchQ;
    }), orden);
  }, [articulos, query, yearFilter, langFilter, orden]);

  const filtered = useMemo(
    () => (typeFilter === 'todos' ? sinFiltroDeTipo : sinFiltroDeTipo.filter(a => a.type === typeFilter)),
    [sinFiltroDeTipo, typeFilter],
  );

  const nextShelf     = esEstudiante ? filtered.filter(a => estanteMap.get(a.id)?.status === 'NEXT') : [];
  const finishedShelf  = esEstudiante ? filtered.filter(a => estanteMap.get(a.id)?.status === 'FINISHED') : [];
  const catalogShelf  = esEstudiante ? filtered.filter(a => !estanteMap.has(a.id)) : filtered;

  const typeLabel = TYPES.find(t => t.id === typeFilter)?.label ?? 'Todos';
  const hasFilters = !!query || typeFilter !== 'todos' || yearFilter !== null || langFilter !== null;
  const filtrosActivos = [typeFilter !== 'todos', yearFilter !== null, langFilter !== null].filter(Boolean).length;
  function limpiarFiltros() {
    setQuery(''); setTypeFilter('todos'); setYearFilter(null); setLangFilter(null);
  }
  const langLabel = IDIOMAS.find(i => i.id === langFilter)?.label ?? 'Idioma';

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

  async function handleOpenFlipbook(articulo: Articulo) {
    let pdfUrl = articulo.pdf_url || '';

    // Si tiene pdf en R2 pero no URL directa, se pide la URL de lectura firmada
    if (!pdfUrl && articulo.tiene_pdf) {
      try {
        const res = await descargarArticulo(articulo.id);
        if (res?.url) pdfUrl = res.url;
      } catch (err) {
        setError(mainAuthErrorMessage(err));
        return;
      }
    }

    // Cada libro abre solo su propio PDF. Si no tiene, se avisa en vez de abrir otro.
    if (!pdfUrl) {
      setError(`«${articulo.title}» todavía no tiene un archivo PDF para leer.`);
      return;
    }

    setSelectedBook({
      articulo,
      title: articulo.title,
      authors: articulo.authors,
      pdfUrl,
    });
  }

  function renderLibro(a: Articulo, i: number) {
    return (
      <BookCard
        key={a.id}
        res={a}
        // La entrada escalonada solo en los primeros: con cientos de libros, el
        // último tardaba segundos en aparecer.
        delay={Math.min(i, 12) * 0.04}
        descargando={descargandoId === a.id}
        onDescargar={() => handleDescargar(a)}
        onOpenFlipbook={handleOpenFlipbook}
        estante={accionesPara(a)}
        puedeEditar={puedeEditarArticulo(a)}
        onEditar={() => setEditandoArticulo(a)}
        onRetirar={() => setRetirandoArticulo(a)}
      />
    );
  }

  /** Un estante de una fila (se desplaza de lado). Con `onVerTodos`, muestra los
   * primeros y un botón para ver todos los de ese tipo en la estantería. */
  function renderFila(titulo: string, lista: Articulo[], opciones: { color?: string; onVerTodos?: () => void } = {}) {
    if (lista.length === 0) return null;
    const visibles = opciones.onVerTodos ? lista.slice(0, LIBROS_POR_ESTANTE) : lista;
    return (
      <div className="bib-shelf-row" key={titulo}>
        <div className="bib-shelf-header">
          <h2 className="bib-shelf-title">
            {opciones.color && <span className="bib-shelf-dot" style={{ background: opciones.color }} />}
            {titulo} <span className="bib-shelf-count">{lista.length}</span>
          </h2>
          {opciones.onVerTodos && lista.length > visibles.length && (
            <button type="button" className="bib-shelf-more" onClick={opciones.onVerTodos}>
              Ver todos <ChevronRight size={13} />
            </button>
          )}
        </div>
        <div className="bib-shelf-container">
          {/* La tabla del estante va dentro del carrusel: también sirve para arrastrar */}
          <CarruselEstante>{visibles.map(renderLibro)}</CarruselEstante>
        </div>
      </div>
    );
  }

  /** Selector de orden (resumen y vista completa). */
  function renderOrden() {
    return (
      <label className="bib-orden">
        <span>Ordenar</span>
        <select value={orden} onChange={e => setOrden(e.target.value as Orden)} aria-label="Ordenar recursos">
          {ORDENES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
    );
  }

  /** Filtros activos como chips que se quitan con un clic. */
  function renderChipsActivos() {
    const chips: { clave: string; texto: string; quitar: () => void }[] = [];
    if (query) chips.push({ clave: 'q', texto: `«${query}»`, quitar: () => setQuery('') });
    if (langFilter) chips.push({ clave: 'l', texto: IDIOMAS.find(i => i.id === langFilter)?.label ?? '', quitar: () => setLangFilter(null) });
    if (yearFilter) chips.push({ clave: 'y', texto: String(yearFilter), quitar: () => setYearFilter(null) });
    if (chips.length === 0) return null;
    return (
      <div className="bib-chips-activos">
        {chips.map(c => (
          <button key={c.clave} type="button" className="bib-chip-activo" onClick={c.quitar} title="Quitar este filtro">
            {c.texto} <X size={11} />
          </button>
        ))}
      </div>
    );
  }

  /** Estantería completa de un tipo (o de una búsqueda): cabecera, pestañas por
   * tipo y filas de libros que llenan el ancho, dibujadas por partes. */
  function renderVistaCompleta(lista: Articulo[]) {
    const tipo = TYPES.find(t => t.id === typeFilter);
    const color = typeFilter !== 'todos' ? TYPE_STYLE[typeFilter]?.color : '#64748B';
    const Icono = tipo && typeFilter !== 'todos' ? tipo.Icon : Search;
    const enEspanol = lista.filter(a => a.idioma === 'es').length;
    const enIngles = lista.filter(a => a.idioma === 'en').length;
    const titulo = query ? `Resultados para «${query}»` : tipo?.label ?? 'Recursos';
    const filas: Articulo[][] = [];
    for (let i = 0; i < lista.length; i += estanteria.porFila) filas.push(lista.slice(i, i + estanteria.porFila));
    const mostradas = filas.slice(0, filasVisibles);

    return (
      <section className="bib-vista">
        <header className="bib-vista-head" style={{ ['--bib-tipo' as string]: color }}>
          <button type="button" className="bib-vista-volver" onClick={limpiarTipoYBusqueda}>
            <ArrowLeft size={15} /> Todos los estantes
          </button>
          <div className="bib-vista-titulo">
            <span className="bib-vista-icono"><Icono size={20} strokeWidth={1.8} /></span>
            <div>
              <h2>{titulo}</h2>
              <p>
                {lista.length} {lista.length === 1 ? 'recurso' : 'recursos'}
                {enEspanol > 0 && ` · ${enEspanol} en español`}
                {enIngles > 0 && ` · ${enIngles} en inglés`}
              </p>
            </div>
          </div>
          {renderOrden()}
        </header>

        {/* Cambiar de tipo sin volver a los estantes */}
        <nav className="bib-vista-tipos" aria-label="Tipos de recurso">
          {TYPES.map(t => {
            const n = t.id === 'todos' ? sinFiltroDeTipo.length : sinFiltroDeTipo.filter(a => a.type === t.id).length;
            if (t.id !== 'todos' && n === 0) return null;
            const activo = typeFilter === t.id;
            return (
              <button key={t.id} type="button" className={`bib-vista-tipo${activo ? ' is-activo' : ''}`}
                style={{ ['--bib-tipo' as string]: t.id === 'todos' ? '#64748B' : TYPE_STYLE[t.id]?.color }}
                aria-pressed={activo} onClick={() => irATipo(t.id)}>
                {t.id !== 'todos' && <span className="bib-vista-tipo-punto" />}
                {t.id === 'todos' ? 'Todos' : t.label} <span className="bib-vista-tipo-n">{n}</span>
              </button>
            );
          })}
        </nav>

        {renderChipsActivos()}

        {lista.length > 0 && (
          <div className="bib-estanteria" style={{ ['--bib-columnas' as string]: estanteria.porFila }}>
            {mostradas.map((fila, f) => (
              <div className="bib-shelf-container bib-shelf-container-grid" key={f}>
                <div className="bib-shelf-books bib-shelf-books-grid">
                  {fila.map((a, i) => renderLibro(a, f * estanteria.porFila + i))}
                </div>
                <div className="bib-shelf-board" />
              </div>
            ))}
            {filasVisibles < filas.length && (
              <div ref={centinelaRef} className="bib-estanteria-mas">
                <button type="button" onClick={() => setFilasVisibles(v => v + FILAS_POR_TANDA)}>
                  Mostrar más ({lista.length - mostradas.flat().length} restantes)
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  // Sin tipo elegido ni búsqueda: un estante por tipo. Con tipo o búsqueda: la estantería completa.
  const porTipo = TYPES.filter(t => t.id !== 'todos')
    .map(t => ({ ...t, lista: catalogShelf.filter(a => a.type === t.id) }))
    .filter(t => t.lista.length > 0);
  const otros = catalogShelf.filter(a => !TYPES.some(t => t.id !== 'todos' && t.id === a.type));
  const vistaPorTipo = typeFilter === 'todos' && !query;

  function subirAlInicio() {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function verTipo(id: string) {
    setTypeFilter(id);
    subirAlInicio();
  }

  function irATipo(id: string) {
    setTypeFilter(id);
    if (id === 'todos' && !query) subirAlInicio();
  }

  function limpiarTipoYBusqueda() {
    setTypeFilter('todos');
    setQuery('');
    subirAlInicio();
  }

  return (
    <div className="dash-root">
      <Sidebar />
      <FeedbackFab pestana="biblioteca" />

      <div className="bib-body" ref={bodyRef}>

        {/* ══ Sticky search bar ══ */}
        <div className="bib-sbar-wrap">
          <div className={`bib-sbar-pill${controlesAbiertos ? ' is-abierto' : ''}`}>
            <div className="bib-sbar-buscar">
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
              <button className="bib-sbar-x" onClick={() => setQuery('')} aria-label="Borrar la búsqueda">
                <X size={13} />
              </button>
            )}
            {/* Solo en el móvil: despliega o esconde filtros, zoom y «Subir PDF» */}
            <button
              type="button"
              className={`bib-sbar-toggle${controlesAbiertos ? ' is-abierto' : ''}`}
              onClick={() => {
                setControlesAbiertos(v => !v);
                langDD.setOpen(false); yearDD.setOpen(false); typeDD.setOpen(false);
              }}
              aria-expanded={controlesAbiertos}
              aria-controls="bib-sbar-controles"
              aria-label={controlesAbiertos ? 'Esconder filtros y opciones' : 'Mostrar filtros y opciones'}
              title={controlesAbiertos ? 'Esconder filtros' : 'Filtros y opciones'}
            >
              <SlidersHorizontal size={15} strokeWidth={2} />
              {filtrosActivos > 0 && <span className="bib-sbar-toggle-n">{filtrosActivos}</span>}
              <ChevronDown size={12} strokeWidth={2.2} className="bib-sbar-toggle-chevron" />
            </button>
            </div>

            <div className="bib-sbar-controles" id="bib-sbar-controles">
            <div className="bib-sbar-filtros">
            {/* Idioma del documento */}
            <div className="bib-sbar-dd-wrap" ref={langDD.ref}>
              <button
                className={`bib-sbar-filter-btn${langDD.open ? ' bib-sbar-filter-btn-on' : ''}${langFilter ? ' bib-sbar-filter-btn-active' : ''}`}
                onClick={() => { langDD.setOpen(v => !v); yearDD.setOpen(false); typeDD.setOpen(false); }}
              >
                <Languages size={14} strokeWidth={1.8} />
                <span>{langLabel}</span>
                <ChevronDown size={11} strokeWidth={2.2} className={`bib-sbar-chevron${langDD.open ? ' bib-sbar-chevron-up' : ''}`} />
              </button>

              {langDD.open && (
                <div className="bib-sbar-dropdown">
                  <button
                    className={`bib-sbar-dd-item${langFilter === null ? ' bib-sbar-dd-item-on' : ''}`}
                    onClick={() => { setLangFilter(null); langDD.setOpen(false); }}
                  >
                    Todos los idiomas
                  </button>
                  {IDIOMAS.map(i => (
                    <button
                      key={i.id}
                      className={`bib-sbar-dd-item${langFilter === i.id ? ' bib-sbar-dd-item-on' : ''}`}
                      onClick={() => { setLangFilter(i.id); langDD.setOpen(false); }}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bib-sbar-dd-wrap" ref={yearDD.ref}>
              <button
                className={`bib-sbar-filter-btn${yearDD.open ? ' bib-sbar-filter-btn-on' : ''}${yearFilter ? ' bib-sbar-filter-btn-active' : ''}`}
                onClick={() => { yearDD.setOpen(v => !v); typeDD.setOpen(false); langDD.setOpen(false); }}
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
                onClick={() => { typeDD.setOpen(v => !v); yearDD.setOpen(false); langDD.setOpen(false); }}
              >
                <span className="bib-sbar-filter-dot" style={{ background: typeFilter !== 'todos' ? (TYPE_STYLE[typeFilter]?.color ?? '#94A3B8') : '#CBD5E1' }} />
                <span>{typeFilter === 'todos' ? 'Tipo' : typeLabel}</span>
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

            </div>

            <div className="bib-sbar-acciones">
            {/* Zoom de los libros (se guarda en la cuenta del usuario) */}
            <div className="bib-sbar-zoom" role="group" aria-label="Tamaño de los libros">
              <button type="button" className="bib-sbar-zoom-btn" onClick={zoomBib.alejar} disabled={zoomBib.zoom <= ZOOM_MIN}
                title="Libros más pequeños" aria-label="Libros más pequeños">
                <ZoomOut size={14} strokeWidth={1.8} />
              </button>
              <button type="button" className="bib-sbar-zoom-valor" onClick={zoomBib.restablecer} title={`Volver al tamaño predeterminado (${ZOOM_PREDETERMINADO} %)`}>
                {zoomBib.zoom}%
              </button>
              <button type="button" className="bib-sbar-zoom-btn" onClick={zoomBib.acercar} disabled={zoomBib.zoom >= ZOOM_MAX}
                title="Libros más grandes" aria-label="Libros más grandes">
                <ZoomIn size={14} strokeWidth={1.8} />
              </button>
            </div>

            <label
              className="bib-sbar-filter-btn bib-sbar-subir"
              style={{ cursor: subiendoPdf ? 'wait' : 'pointer' }}
              title="Publicar un PDF en la biblioteca"
            >
              <Upload size={14} strokeWidth={1.8} />
              <span>{subiendoPdf ? 'Subiendo…' : 'Subir PDF'}</span>
              <input
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                disabled={subiendoPdf}
                onChange={e => {
                  handleSubirPdf(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>

            {hasFilters && (
              <button className="bib-sbar-reset" onClick={limpiarFiltros} title="Quitar todos los filtros" aria-label="Quitar todos los filtros">
                <X size={12} />
              </button>
            )}
            </div>
            </div>
          </div>
          {avisoSubida && (
            <p className="bib-sbar-meta" role="status" style={{ color: '#0369a1', fontWeight: 600 }}>
              {avisoSubida}
            </p>
          )}
          {error && <p className="bib-sbar-meta" style={{ color: '#b91c1c' }}>{error}</p>}
          {misEnRevisionORechazados.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {misEnRevisionORechazados.map(a => (
                <span
                  key={a.id}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: a.estado === 'PENDIENTE' ? '#FEF3C7' : '#FEE2E2',
                    color: a.estado === 'PENDIENTE' ? '#92400E' : '#991B1B',
                    fontWeight: 600,
                  }}
                >
                  {a.title}:{' '}
                  {a.estado === 'PENDIENTE'
                    ? 'En revisión'
                    : `Rechazado: ${a.motivo_rechazo ?? 'Sin motivo'}`}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ══ Estantes ══ */}
        <div className="bib-shelves" ref={estanteria.ref} style={{
          ['--bib-zoom' as string]: zoomBib.zoom / 100,
          // El texto y las etiquetas solo se achican por debajo del 100 %; por encima, no crecen.
          ['--bib-texto' as string]: Math.min(zoomBib.zoom, 100) / 100,
        }}>
          {/* Resumen: cuántos recursos hay, filtros activos y orden */}
          {vistaPorTipo && (
            <div className="bib-resumen">
              <p className="bib-resumen-total">
                {loading ? 'Cargando la biblioteca…' : <><strong>{filtered.length}</strong> {filtered.length === 1 ? 'recurso' : 'recursos'}</>}
              </p>
              {renderChipsActivos()}
              {!loading && renderOrden()}
            </div>
          )}
          {!loading && esEstudiante && renderFila('Mi estante', nextShelf)}
          {!loading && esEstudiante && renderFila('Terminados', finishedShelf)}
          {!loading && vistaPorTipo && porTipo.map(t =>
            renderFila(t.label, t.lista, { color: TYPE_STYLE[t.id]?.color, onVerTodos: () => verTipo(t.id) }),
          )}
          {!loading && vistaPorTipo && renderFila('Otros recursos', otros)}
          {!loading && !vistaPorTipo && renderVistaCompleta(catalogShelf)}

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
                  onClick={limpiarFiltros}
                >
                  Limpiar búsqueda
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* ══ Visor Flipbook a Pantalla Completa ══ */}
      {selectedBook && (
        <Suspense fallback={<div className="fb-backdrop fb-cargando-visor" aria-busy="true"><div className="fb-spinner" /></div>}>
          <FlipbookViewer
            articleId={selectedBook.articulo.id}
            title={selectedBook.title}
            authors={selectedBook.authors}
            pdfUrl={selectedBook.pdfUrl}
            onClose={() => setSelectedBook(null)}
            onDownload={
              // Solo se ofrece descargar lo que de verdad tiene un PDF: la descarga pide
              // al backend un enlace temporal (la ruta de la API necesita la sesión).
              selectedBook.articulo.tiene_pdf
                ? () => handleDescargar(selectedBook.articulo)
                : undefined
            }
          />
        </Suspense>
      )}

      {/* ══ Publicar un PDF: datos, tipo y portada ══ */}
      {pdfAPublicar && (
        <PublicarLibroModal
          fuente={{ tipo: 'archivo', file: pdfAPublicar }}
          onClose={() => setPdfAPublicar(null)}
          onPublicado={handlePublicado}
        />
      )}

      {/* ══ Modal de Edición de Recurso ══ */}
      {editandoArticulo && (
        <EditarArticuloModal
          articulo={editandoArticulo}
          esAdmin={usuarioActual?.role === 'ADMIN'}
          onClose={() => setEditandoArticulo(null)}
          onSave={handleGuardarEdicion}
        />
      )}

      {/* ══ Modal de Confirmación de Retiro ══ */}
      {retirandoArticulo && (
        <ConfirmarRetiroModal
          articulo={retirandoArticulo}
          onClose={() => setRetirandoArticulo(null)}
          onConfirm={handleConfirmarRetiro}
        />
      )}
    </div>
  );
}
