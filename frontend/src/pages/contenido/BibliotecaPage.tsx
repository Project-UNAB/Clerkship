import { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, BookOpen, ScrollText, FlaskConical,
  Microscope, Stethoscope as Steth,
  BookMarked, X, Calendar, ChevronDown,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';

/* ── Resource types ──────────────────────────────────────── */
const TYPES = [
  { id: 'todos',     label: 'Todos los tipos', Icon: BookMarked  },
  { id: 'libro',     label: 'Libros',          Icon: BookOpen    },
  { id: 'guia',      label: 'Guías clínicas',  Icon: ScrollText  },
  { id: 'ensayo',    label: 'Ensayos',         Icon: FlaskConical},
  { id: 'protocolo', label: 'Protocolos',      Icon: Microscope  },
  { id: 'caso',      label: 'Casos clínicos',  Icon: Steth       },
];

/* ── Mock resources: Gastroenterología y Medicina Digestiva ── */
interface Resource {
  id: number; type: string; title: string; author: string;
  source: string; year: number; specialty: string;
  tags: string[]; pages?: number; abstract: string;
  shelf: 'reading' | 'next' | 'finished';
}

const RESOURCES: Resource[] = [
  { id:1,  type:'libro',     title:'Harrison — Gastroenterología y Hepatología',                             author:'Fauci, Kasper, Longo et al.',     source:'McGraw-Hill',                            year:2023, specialty:'Gastroenterología', tags:['medicina interna','digestivo','referencia'],            pages:1450, abstract:'Sección especializada en patología digestiva del clásico tratado de Medicina Interna. Cubre esófago, estómago, hígado, páncreas y colon.', shelf:'reading'  },
  { id:2,  type:'guia',      title:'Guía de práctica clínica: Diagnóstico y manejo de la ERGE',             author:'Sociedad Colombiana de Gastroenterología', source:'Rev. Col. Gastroenterol.',               year:2024, specialty:'Gastroenterología', tags:['ERGE','pirosis','esofagitis','inhibidores bomba'],       abstract:'Lineamientos y consenso colombiano para el manejo farmacológico y quirúrgico de la enfermedad por reflujo gastroesofágico.', shelf:'reading'  },
  { id:3,  type:'protocolo', title:'Protocolo institucional: Manejo de la Hemorragia Digestiva Alta',       author:'Servicio de Gastroenterología HIC',source:'Hospital Internacional de Colombia',   year:2024, specialty:'Gastroenterología', tags:['HDA','endoscopia','úlcera péptica','varices'],          abstract:'Protocolo asistencial para estratificación de riesgo con Glasgow-Blatchford y algoritmo terapéutico en sangrado digestivo alto.', shelf:'reading'  },
  { id:4,  type:'guia',      title:'Guía WGO 2023: Diagnóstico y tratamiento de la pancreatitis aguda',     author:'World Gastroenterology Organisation', source:'WGO Clinical Guidelines',               year:2023, specialty:'Gastroenterología', tags:['pancreatitis','criterios Atlanta','amilasa','lipasa'],   abstract:'Recomendaciones internacionales para el manejo de pancreatitis aguda gallstone y alcohólica, clasificación de gravedad y nutrición temprana.', shelf:'reading'  },
  { id:5,  type:'guia',      title:'Guía de práctica clínica: Manejo de la Úlcera Péptica e infección por H. pylori', author:'Asociación Española de Gastroenterología', source:'AEG Guidelines', year:2023, specialty:'Gastroenterología', tags:['úlcera péptica','H. pylori','terapia cuádruple'],         abstract:'Abordaje de la úlcera gástrica y duodenal, esquemas erradicadores de primera y segunda línea contra Helicobacter pylori.', shelf:'next'     },
  { id:6,  type:'libro',     title:'Semiología Médica del Aparato Digestivo — Argente & Álvarez',           author:'Argente H, Álvarez M.',           source:'Editorial Médica Panamericana',           year:2022, specialty:'Gastroenterología', tags:['semiología','examen físico','abomen agudo'],          pages:850,  abstract:'Guía completa de inspección, auscultación, palpación y percusión abdominal, signos apendiculares y maniobras biliares.', shelf:'next'     },
  { id:7,  type:'protocolo', title:'Protocolo de urgencias: Abordaje del Dolor Abdominal Agudo y Apendicitis', author:'Sociedad de Cirugía General y Gastroenterología', source:'Minsalud Colombia', year:2023, specialty:'Gastroenterología', tags:['apendicitis','dolor abdominal','ecografía abdominal'],  abstract:'Ruta de atención rápida para la sospecha de apendicitis aguda, escala de Alvarado y criterios de laparoscopia.', shelf:'next'     },
  { id:8,  type:'libro',     title:'Fisiología Gastrointestinal — Guyton & Hall',                           author:'Hall J, Hall M.',                 source:'Elsevier',                               year:2021, specialty:'Gastroenterología', tags:['fisiología','motilidad','secreción gástrica'],          pages:480,  abstract:'Bases fisiológicas de la digestión, secreción biliar y pancreática, motilidad intestinal y absorción de nutrientes.', shelf:'next'     },
  { id:9,  type:'ensayo',    title:'Sesgos cognitivos en el razonamiento diagnóstico del abdomen agudo',     author:'Croskerry P, Singhal G, Mamede S.',source:'BMJ Quality & Safety',                  year:2022, specialty:'Gastroenterología', tags:['sesgos cognitivos','razonamiento clínico','diagnóstico'], abstract:'Estudio sobre los sesgos de anclaje y disponibilidad al evaluar pacientes con dolor en fosa ilíaca derecha y epigastralgias.', shelf:'finished' },
  { id:10, type:'caso',      title:'Caso clínico: Apendicitis aguda atípica en paciente joven',               author:'Ramírez J, Torres M, Gómez L.',   source:'Revista Colombiana de Gastroenterología', year:2023, specialty:'Gastroenterología', tags:['apendicitis','caso clínico','retrocecal'],            abstract:'Discusión interactiva de un caso con apendicitis retrocecal subserosa y su correlación histopatológica post-quirúrgica.', shelf:'finished' },
  { id:11, type:'ensayo',    title:'Evaluación del aprendizaje basado en simulación clínica digestiva',    author:'Cook DA, Hatala R, Brydges R et al.', source:'JAMA Medical Education',             year:2021, specialty:'Gastroenterología', tags:['simulación','educación médica','competencias'],         abstract:'Meta-análisis sobre el impacto de pacientes virtuales en la adquisición de competencias en gastroenterología y cirugía.', shelf:'finished' },
  { id:12, type:'caso',      title:'Caso clínico: Diagnóstico diferencial de Ictericia Obstructiva',         author:'Herrera A, Castillo P.',         source:'Acta Médica Colombiana',              year:2023, specialty:'Gastroenterología', tags:['ictericia','colestasis','coledocolitiasis'],          abstract:'Abordaje diagnóstico en un paciente de 45 años con síndrome colestásico, perfil hepático y colangiorresonancia.', shelf:'finished' }
];

const YEARS = [...new Set(RESOURCES.map(r => r.year))].sort((a, b) => b - a);

/* ── Type badge styles ───────────────────────────────────── */
const TYPE_STYLE: Record<string, { bg: string; color: string; label: string; gradient: string }> = {
  libro:     { bg:'#EEF2FF', color:'#4338CA', label:'Libro',        gradient:'linear-gradient(160deg, #3730A3 0%, #818CF8 100%)' },
  guia:      { bg:'#F0FDF4', color:'#166534', label:'Guía clínica', gradient:'linear-gradient(160deg, #14532D 0%, #4ADE80 100%)' },
  ensayo:    { bg:'#FFF7ED', color:'#C2410C', label:'Ensayo',       gradient:'linear-gradient(160deg, #9A3412 0%, #FB923C 100%)' },
  protocolo: { bg:'#F0F9FF', color:'#0369A1', label:'Protocolo',    gradient:'linear-gradient(160deg, #075985 0%, #38BDF8 100%)' },
  caso:      { bg:'#FDF4FF', color:'#7E22CE', label:'Caso clínico', gradient:'linear-gradient(160deg, #6B21A8 0%, #C084FC 100%)' },
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

/* ── Resource card ───────────────────────────────────────── */
function ResourceCard({ res, delay }: { res: Resource; delay: number }) {
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
          <p className="bib-book-author">{res.author.split(',')[0]}</p>
        </div>
      </div>
      <div className="bib-book-pages" />
    </motion.div>
  );
}

/* ── Main component ──────────────────────────────────────── */
export default function BibliotecaPage() {
  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [yearFilter, setYearFilter] = useState<number | null>(null);

  const typeDD = useDropdown();
  const yearDD = useDropdown();

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return RESOURCES.filter(r => {
      const matchType = typeFilter === 'todos' || r.type === typeFilter;
      const matchYear = yearFilter === null    || r.year === yearFilter;
      const matchQ    = !q
        || r.title.toLowerCase().includes(q)
        || r.author.toLowerCase().includes(q)
        || r.tags.some(t => t.toLowerCase().includes(q))
        || r.specialty.toLowerCase().includes(q);
      return matchType && matchYear && matchQ;
    });
  }, [query, typeFilter, yearFilter]);

  const readingShelf  = filtered.filter(r => r.shelf === 'reading');
  const nextShelf     = filtered.filter(r => r.shelf === 'next');
  const finishedShelf = filtered.filter(r => r.shelf === 'finished');

  const typeLabel = TYPES.find(t => t.id === typeFilter)?.label ?? 'Todos';
  const hasFilters = !!query || typeFilter !== 'todos' || yearFilter !== null;

  return (
    <div className="dash-root">
      <Sidebar />

      <div className="bib-body">

        {/* ══ Sticky search bar ══ */}
        <div className="bib-sbar-wrap">
          <div className="bib-sbar-pill">

            <span className="bib-sbar-lead-ico">
              <Search size={14} strokeWidth={2} />
            </span>

            <input
              className="bib-sbar-input"
              placeholder="Busca libros, guías y referencias gastroenterológicas…"
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
            {filtered.length} recurso{filtered.length !== 1 ? 's' : ''} gastroenterológicos
          </p>
        </div>

        {/* ══ Shelves ══ */}
        <div className="bib-shelves">

          {readingShelf.length > 0 && (
            <div className="bib-shelf-row">
              <div className="bib-shelf-header">
                <h2 className="bib-shelf-title">Actualmente leyendo</h2>
                <button className="bib-shelf-more">Ver todos <span>&rarr;</span></button>
              </div>
              <div className="bib-shelf-container">
                <div className="bib-shelf-books">
                  {readingShelf.map((r, i) => <ResourceCard key={r.id} res={r} delay={i * 0.04} />)}
                </div>
                <div className="bib-shelf-board" />
              </div>
            </div>
          )}

          {nextShelf.length > 0 && (
            <div className="bib-shelf-row">
              <div className="bib-shelf-header">
                <h2 className="bib-shelf-title">Siguientes</h2>
                <button className="bib-shelf-more">Ver estante completo <span>&rarr;</span></button>
              </div>
              <div className="bib-shelf-container">
                <div className="bib-shelf-books">
                  {nextShelf.map((r, i) => <ResourceCard key={r.id} res={r} delay={i * 0.04} />)}
                </div>
                <div className="bib-shelf-board" />
              </div>
            </div>
          )}

          {finishedShelf.length > 0 && (
            <div className="bib-shelf-row">
              <div className="bib-shelf-header">
                <h2 className="bib-shelf-title">Terminados</h2>
                <button className="bib-shelf-more">Ver estante completo <span>&rarr;</span></button>
              </div>
              <div className="bib-shelf-container">
                <div className="bib-shelf-books">
                  {finishedShelf.map((r, i) => <ResourceCard key={r.id} res={r} delay={i * 0.04} />)}
                </div>
                <div className="bib-shelf-board" />
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <motion.div className="bib-empty" initial={{ opacity:0 }} animate={{ opacity:1 }}>
              <BookOpen size={40} strokeWidth={1.2} />
              <p>No se encontraron recursos gastroenterológicos con esos criterios.</p>
              <button
                className="bib-chip bib-chip-on"
                style={{ marginTop:8 }}
                onClick={() => { setQuery(''); setTypeFilter('todos'); setYearFilter(null); }}
              >
                Limpiar búsqueda
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
