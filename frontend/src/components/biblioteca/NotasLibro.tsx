/**
 * Notas y comentarios del visor de libros. Con el lápiz activo y la herramienta
 * «Nota», el usuario arrastra un recuadro sobre la página o toca un párrafo: se
 * toma el texto real del PDF que quedó dentro (para citarlo) y se escribe la nota.
 * Las notas se listan en un panel a la derecha; al tocar una, el visor va a su
 * página. Son privadas y se guardan en /api/articulos/<id>/notas.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, MessageSquareText, Pencil, Trash2, X } from 'lucide-react';
import {
  borrarNota, crearNota, editarNota, listarNotas,
  type ColorNota, type NotaLibro, type ZonaNota,
} from '../../data/articulosApi';

export const COLORES_NOTA: { valor: ColorNota; nombre: string }[] = [
  { valor: '#FACC15', nombre: 'Amarillo' },
  { valor: '#4ADE80', nombre: 'Verde' },
  { valor: '#60A5FA', nombre: 'Azul' },
  { valor: '#F472B6', nombre: 'Rosa' },
  { valor: '#FB923C', nombre: 'Naranja' },
];
const MAX_CITA = 2000;

/** Nota a medio crear: la zona ya está marcada y falta escribir el texto. */
export interface BorradorNota {
  pagina: number;
  rect: ZonaNota;
  cita: string | null;
}

/* ══════════════════════ Texto real del PDF ══════════════════════ */

interface TrozoDeTexto { str: string; x: number; y: number; w: number; h: number }
interface Linea { texto: string; x: number; y: number; w: number; h: number }

/** Trozos de texto de una página con su posición relativa (0 a 1, origen arriba a la izquierda). */
async function trozosDePagina(pdfDoc: any, cache: Map<number, Promise<TrozoDeTexto[]>>, n: number) {
  let p = cache.get(n);
  if (!p) {
    p = (async () => {
      const pagina = await pdfDoc.getPage(n);
      const vp = pagina.getViewport({ scale: 1 });
      const contenido = await pagina.getTextContent();
      const trozos: TrozoDeTexto[] = [];
      for (const it of contenido.items as any[]) {
        if (!it.str || !it.str.trim()) continue;
        const [, , c, d, e, f] = it.transform;
        const alto = Math.hypot(c, d) || it.height || 10;
        const [x, yBase] = vp.convertToViewportPoint(e, f);
        trozos.push({ str: it.str, x: x / vp.width, y: (yBase - alto) / vp.height, w: (it.width || 0) / vp.width, h: alto / vp.height });
      }
      return trozos;
    })();
    cache.set(n, p);
  }
  return p;
}

/** Agrupa los trozos en líneas (mismo renglón). */
function lineas(trozos: TrozoDeTexto[]): Linea[] {
  const orden = [...trozos].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
  const res: { trozos: TrozoDeTexto[]; cy: number; h: number }[] = [];
  for (const t of orden) {
    const cy = t.y + t.h / 2;
    const ultima = res[res.length - 1];
    if (ultima && Math.abs(ultima.cy - cy) < Math.min(ultima.h, t.h) * 0.55) {
      ultima.trozos.push(t);
    } else {
      res.push({ trozos: [t], cy, h: t.h });
    }
  }
  return res.map(l => {
    const ts = l.trozos.sort((a, b) => a.x - b.x);
    const x = Math.min(...ts.map(t => t.x));
    const y = Math.min(...ts.map(t => t.y));
    const fin = Math.max(...ts.map(t => t.x + t.w));
    const abajo = Math.max(...ts.map(t => t.y + t.h));
    return { texto: ts.map(t => t.str).join(' ').replace(/\s+/g, ' ').trim(), x, y, w: fin - x, h: abajo - y };
  });
}

function limpiarCita(t: string): string | null {
  const limpio = t.replace(/(\w)-\s+(\w)/g, '$1$2').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  if (!limpio) return null;
  return limpio.length > MAX_CITA ? `${limpio.slice(0, MAX_CITA - 1)}…` : limpio;
}

/** Texto del PDF cuyo centro cae dentro de la zona. */
function textoEnZona(trozos: TrozoDeTexto[], z: ZonaNota): string | null {
  const dentro = trozos.filter(t => {
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
  });
  return limpiarCita(lineas(dentro).map(l => l.texto).join('\n'));
}

/** El párrafo que contiene el punto: la línea tocada y las vecinas muy cercanas. */
function parrafoEn(trozos: TrozoDeTexto[], px: number, py: number): BorradorNota['rect'] & { cita: string | null } | null {
  const ls = lineas(trozos);
  const holgura = 0.006;
  let i = ls.findIndex(l => px >= l.x - holgura && px <= l.x + l.w + holgura && py >= l.y - holgura && py <= l.y + l.h + holgura);
  if (i < 0) return null;
  const pertenece = (a: Linea, b: Linea) => {
    const separacion = b.y - (a.y + a.h);
    const parecidas = Math.abs(a.h - b.h) < Math.max(a.h, b.h) * 0.35;
    const seTocan = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0;
    return separacion < Math.max(a.h, b.h) * 0.85 && parecidas && seTocan;
  };
  let ini = i;
  let fin = i;
  while (ini > 0 && pertenece(ls[ini - 1], ls[ini])) ini--;
  while (fin < ls.length - 1 && pertenece(ls[fin], ls[fin + 1])) fin++;
  i = ini;
  const grupo = ls.slice(ini, fin + 1);
  const x = Math.min(...grupo.map(l => l.x));
  const y = Math.min(...grupo.map(l => l.y));
  const derecha = Math.max(...grupo.map(l => l.x + l.w));
  const abajo = Math.max(...grupo.map(l => l.y + l.h));
  const m = 0.006;
  const rx = Math.max(0, x - m);
  const ry = Math.max(0, y - m);
  return {
    x: rx, y: ry,
    w: Math.min(1, derecha + m) - rx,
    h: Math.min(1, abajo + m) - ry,
    cita: limpiarCita(grupo.map(l => l.texto).join(' ')),
  };
}

/* ══════════════════════ Estado de las notas ══════════════════════ */

export function useNotasDelLibro(articleId?: string) {
  const [notas, setNotas] = useState<NotaLibro[]>([]);
  const [disponible, setDisponible] = useState(false);
  const [borrador, setBorrador] = useState<BorradorNota | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!articleId) return;
    let vigente = true;
    listarNotas(articleId)
      .then(r => { if (vigente) { setNotas(r.notas); setDisponible(true); } })
      .catch(() => { if (vigente) setError('No se pudieron cargar tus notas de este libro.'); });
    return () => { vigente = false; };
  }, [articleId]);

  const ordenar = (l: NotaLibro[]) => [...l].sort((a, b) => a.pagina - b.pagina || a.rect.y - b.rect.y);

  const iniciarBorrador = useCallback((b: BorradorNota) => {
    setBorrador(b);
    setSeleccionada(null);
    setPanelAbierto(true);
    setError(null);
  }, []);

  async function guardarBorrador(texto: string, color: ColorNota) {
    if (!articleId || !borrador) return;
    setGuardando(true);
    setError(null);
    try {
      const nueva = await crearNota(articleId, { ...borrador, texto, color });
      setNotas(prev => ordenar([...prev, nueva]));
      setBorrador(null);
      setSeleccionada(nueva.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la nota.');
    } finally {
      setGuardando(false);
    }
  }

  async function actualizar(id: string, cambios: { texto?: string; color?: ColorNota }) {
    if (!articleId) return false;
    setError(null);
    try {
      const nota = await editarNota(articleId, id, cambios);
      setNotas(prev => prev.map(n => (n.id === id ? nota : n)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo editar la nota.');
      return false;
    }
  }

  async function eliminar(id: string) {
    if (!articleId) return;
    setError(null);
    try {
      await borrarNota(articleId, id);
      setNotas(prev => prev.filter(n => n.id !== id));
      setSeleccionada(s => (s === id ? null : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la nota.');
    }
  }

  const seleccionar = useCallback((id: string | null) => {
    setSeleccionada(id);
    if (id) setPanelAbierto(true);
  }, []);

  return {
    notas, disponible, borrador, setBorrador, seleccionada, seleccionar, panelAbierto, setPanelAbierto,
    guardando, error, iniciarBorrador, guardarBorrador, actualizar, eliminar,
  };
}

export type NotasDelLibro = ReturnType<typeof useNotasDelLibro>;

interface ValorNotas {
  notas: NotaLibro[];
  borrador: BorradorNota | null;
  seleccionada: string | null;
  /** Lápiz activo con la herramienta «Nota»: arrastrar marca una zona. */
  marcando: boolean;
  pdfDoc: any;
  iniciarBorrador: (b: BorradorNota) => void;
  seleccionar: (id: string | null) => void;
}

const NotasContext = createContext<ValorNotas>({
  notas: [], borrador: null, seleccionada: null, marcando: false, pdfDoc: null,
  iniciarBorrador: () => undefined, seleccionar: () => undefined,
});

export function NotasProvider({ valor, marcando, pdfDoc, children }: {
  valor: NotasDelLibro; marcando: boolean; pdfDoc: any; children: ReactNode;
}) {
  return (
    <NotasContext.Provider value={{
      notas: valor.notas, borrador: valor.borrador, seleccionada: valor.seleccionada, marcando: marcando && valor.disponible,
      pdfDoc, iniciarBorrador: valor.iniciarBorrador, seleccionar: valor.seleccionar,
    }}>
      {children}
    </NotasContext.Provider>
  );
}

/* ══════════════════════ Capa sobre la página ══════════════════════ */

// react-pageflip escucha estos eventos en el libro: se cortan en la capa para que la hoja no se mueva.
const EVENTOS_DEL_LIBRO = ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend'] as const;
/** Por debajo de esto (px) el gesto cuenta como toque (párrafo) y no como recuadro. */
const MINIMO_RECUADRO = 8;

/** Marca las notas de la página y, con la herramienta «Nota», deja marcar una zona nueva. */
export function CapaDeNotas({ pagina, activa }: { pagina: number; activa: boolean }) {
  const n = useContext(NotasContext);
  const capaRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<number, Promise<TrozoDeTexto[]>>());
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const [arrastre, setArrastre] = useState<ZonaNota | null>(null);
  const [buscando, setBuscando] = useState(false);

  const deLaPagina = n.notas.filter(x => x.pagina === pagina);
  const numero = (id: string) => n.notas.findIndex(x => x.id === id) + 1;
  const borradorAqui = n.borrador?.pagina === pagina ? n.borrador : null;

  useEffect(() => {
    const capa = capaRef.current;
    if (!capa || !n.marcando) return;
    const cortar = (e: Event) => e.stopPropagation();
    for (const ev of EVENTOS_DEL_LIBRO) capa.addEventListener(ev, cortar, { passive: true });
    return () => { for (const ev of EVENTOS_DEL_LIBRO) capa.removeEventListener(ev, cortar); };
  }, [n.marcando, activa]);

  // Los marcadores se tocan sin pasar la hoja.
  const marcadorRef = useCallback((el: HTMLButtonElement | null) => {
    if (!el) return;
    const cortar = (e: Event) => e.stopPropagation();
    for (const ev of EVENTOS_DEL_LIBRO) el.addEventListener(ev, cortar, { passive: true });
  }, []);

  if (!activa || (!n.marcando && deLaPagina.length === 0 && !borradorAqui)) return null;

  const relativo = (e: React.PointerEvent): { x: number; y: number } => {
    const r = capaRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const alBajar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!n.marcando || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    inicio.current = relativo(e);
    setArrastre({ ...inicio.current, w: 0, h: 0 });
  };

  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const i = inicio.current;
    if (!i) return;
    const p = relativo(e);
    setArrastre({ x: Math.min(i.x, p.x), y: Math.min(i.y, p.y), w: Math.abs(p.x - i.x), h: Math.abs(p.y - i.y) });
  };

  const alSoltar = async (e: React.PointerEvent<HTMLDivElement>) => {
    const i = inicio.current;
    const zona = arrastre;
    inicio.current = null;
    setArrastre(null);
    if (!i || !zona || !n.pdfDoc) return;
    const r = capaRef.current!.getBoundingClientRect();
    setBuscando(true);
    try {
      const trozos = await trozosDePagina(n.pdfDoc, cache.current, pagina);
      if (zona.w * r.width < MINIMO_RECUADRO && zona.h * r.height < MINIMO_RECUADRO) {
        // Un toque: se elige el párrafo real que está debajo.
        const p = relativo(e);
        const parrafo = parrafoEn(trozos, p.x, p.y);
        if (parrafo) {
          const { cita, ...rect } = parrafo;
          n.iniciarBorrador({ pagina, rect, cita });
        }
        return;
      }
      n.iniciarBorrador({ pagina, rect: zona, cita: textoEnZona(trozos, zona) });
    } finally {
      setBuscando(false);
    }
  };

  const estilo = (z: ZonaNota) => ({ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` });

  return (
    <div
      ref={capaRef}
      className={`fb-notas-capa${n.marcando ? ' is-marcando' : ''}${buscando ? ' is-buscando' : ''}`}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={() => { inicio.current = null; setArrastre(null); }}
    >
      {deLaPagina.map(nota => (
        <div key={nota.id} className={`fb-nota-zona${n.seleccionada === nota.id ? ' is-seleccionada' : ''}`}
          style={{ ...estilo(nota.rect), ['--nota-color' as string]: nota.color }}>
          <button
            ref={marcadorRef}
            type="button"
            className="fb-nota-marcador"
            title={nota.texto || nota.cita || 'Nota'}
            aria-label={`Ver la nota ${numero(nota.id)}`}
            onClick={ev => { ev.stopPropagation(); n.seleccionar(nota.id); }}
          >
            {numero(nota.id)}
          </button>
        </div>
      ))}
      {borradorAqui && <div className="fb-nota-zona is-borrador" style={estilo(borradorAqui.rect)} />}
      {arrastre && (arrastre.w > 0 || arrastre.h > 0) && <div className="fb-nota-zona is-arrastre" style={estilo(arrastre)} />}
    </div>
  );
}

/* ══════════════════════ Panel lateral ══════════════════════ */

function SelectorColor({ valor, onCambio }: { valor: ColorNota; onCambio: (c: ColorNota) => void }) {
  return (
    <div className="fb-nota-colores" role="radiogroup" aria-label="Color de la nota">
      {COLORES_NOTA.map(c => (
        <button key={c.valor} type="button" role="radio" aria-checked={valor === c.valor} aria-label={c.nombre} title={c.nombre}
          className={`fb-nota-color${valor === c.valor ? ' is-activo' : ''}`} style={{ background: c.valor }}
          onClick={() => onCambio(c.valor)} />
      ))}
    </div>
  );
}

function EditorNota({ textoInicial, colorInicial, guardando, onGuardar, onCancelar, autoFocus }: {
  textoInicial: string; colorInicial: ColorNota; guardando?: boolean; autoFocus?: boolean;
  onGuardar: (texto: string, color: ColorNota) => void; onCancelar: () => void;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [color, setColor] = useState<ColorNota>(colorInicial);
  return (
    <div className="fb-nota-editor" onClick={e => e.stopPropagation()}>
      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        placeholder="Escribe tu nota o comentario…"
        maxLength={5000}
        rows={3}
        autoFocus={autoFocus}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onGuardar(texto, color);
          if (e.key === 'Escape') { e.stopPropagation(); onCancelar(); }
        }}
      />
      <div className="fb-nota-editor-pie">
        <SelectorColor valor={color} onCambio={setColor} />
        <div className="fb-nota-editor-botones">
          <button type="button" className="fb-nota-btn" onClick={onCancelar} disabled={guardando}>Cancelar</button>
          <button type="button" className="fb-nota-btn is-principal" onClick={() => onGuardar(texto, color)} disabled={guardando}>
            <Check size={14} /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PanelDeNotas({ notas: nl, onIrAPagina }: { notas: NotasDelLibro; onIrAPagina: (pagina: number) => void }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Al elegir una nota desde la página, se lleva a la vista en el panel.
  useEffect(() => {
    if (!nl.seleccionada) return;
    listaRef.current?.querySelector(`[data-nota="${nl.seleccionada}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [nl.seleccionada]);

  if (!nl.panelAbierto) return null;
  const porPagina = new Map<number, NotaLibro[]>();
  nl.notas.forEach(n => porPagina.set(n.pagina, [...(porPagina.get(n.pagina) ?? []), n]));

  return (
    <aside className="fb-notas-panel" aria-label="Notas y comentarios">
      <header className="fb-notas-head">
        <h3><MessageSquareText size={16} /> Notas <span className="fb-notas-n">{nl.notas.length}</span></h3>
        <button type="button" className="fb-tb-btn" onClick={() => nl.setPanelAbierto(false)} aria-label="Cerrar el panel de notas" title="Cerrar">
          <X size={16} />
        </button>
      </header>

      <div className="fb-notas-lista" ref={listaRef}>
        {nl.error && <p className="fb-notas-error" role="alert">{nl.error}</p>}

        {nl.borrador && (
          <div className="fb-nota-card is-nueva">
            <div className="fb-nota-card-meta">Nueva nota · página {nl.borrador.pagina}</div>
            {nl.borrador.cita
              ? <blockquote className="fb-nota-cita">{nl.borrador.cita}</blockquote>
              : <p className="fb-nota-sin-cita">Zona sin texto (una imagen o un gráfico).</p>}
            <EditorNota
              textoInicial=""
              colorInicial="#FACC15"
              guardando={nl.guardando}
              autoFocus
              onGuardar={(t, c) => nl.guardarBorrador(t, c)}
              onCancelar={() => nl.setBorrador(null)}
            />
          </div>
        )}

        {nl.notas.length === 0 && !nl.borrador && (
          <div className="fb-notas-vacio">
            <MessageSquareText size={28} strokeWidth={1.4} />
            <p>Aún no tienes notas en este libro.</p>
            <p className="fb-notas-ayuda">Activa el lápiz y elige <strong>Nota</strong>: arrastra un recuadro sobre la página o toca un párrafo.</p>
          </div>
        )}

        {[...porPagina.entries()].map(([pagina, lista]) => (
          <section key={pagina} className="fb-notas-grupo">
            <h4>Página {pagina}</h4>
            {lista.map(nota => {
              const indice = nl.notas.findIndex(x => x.id === nota.id) + 1;
              return (
                <article
                  key={nota.id}
                  data-nota={nota.id}
                  className={`fb-nota-card${nl.seleccionada === nota.id ? ' is-seleccionada' : ''}`}
                  style={{ ['--nota-color' as string]: nota.color }}
                  onClick={() => { nl.seleccionar(nota.id); onIrAPagina(nota.pagina); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') { nl.seleccionar(nota.id); onIrAPagina(nota.pagina); } }}
                  aria-label={`Nota ${indice}, página ${nota.pagina}`}
                >
                  <div className="fb-nota-card-meta">
                    <span className="fb-nota-num">{indice}</span>
                    {nota.editada_en ? new Date(nota.editada_en).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : ''}
                    <span className="fb-nota-acciones">
                      <button type="button" className="fb-tb-btn" title="Editar" aria-label="Editar la nota"
                        onClick={e => { e.stopPropagation(); setEditando(nota.id); setConfirmando(null); }}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" className="fb-tb-btn fb-cerrar" title="Eliminar" aria-label="Eliminar la nota"
                        onClick={e => { e.stopPropagation(); setConfirmando(nota.id); setEditando(null); }}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                  {nota.cita && <blockquote className="fb-nota-cita">{nota.cita}</blockquote>}
                  {editando === nota.id ? (
                    <EditorNota
                      textoInicial={nota.texto}
                      colorInicial={nota.color}
                      autoFocus
                      onGuardar={async (t, c) => { if (await nl.actualizar(nota.id, { texto: t, color: c })) setEditando(null); }}
                      onCancelar={() => setEditando(null)}
                    />
                  ) : (
                    nota.texto
                      ? <p className="fb-nota-texto">{nota.texto}</p>
                      : <p className="fb-nota-sin-cita">Sin comentario.</p>
                  )}
                  {confirmando === nota.id && (
                    <div className="fb-nota-confirmar" onClick={e => e.stopPropagation()}>
                      <span>¿Eliminar esta nota?</span>
                      <button type="button" className="fb-nota-btn" onClick={() => setConfirmando(null)}>No</button>
                      <button type="button" className="fb-nota-btn is-peligro" onClick={() => { nl.eliminar(nota.id); setConfirmando(null); }}>Eliminar</button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}
