/**
 * Lápiz del visor de libros: subrayar con resaltador o dibujar a mano alzada
 * sobre las páginas. Lo dibujado es de cada usuario: se guarda en el backend
 * por libro y por página (/api/articulos/<id>/anotaciones) y solo lo ve él.
 *
 * Los trazos se guardan con coordenadas de 0 a 1 respecto de la página, así se
 * ven igual a cualquier tamaño de pantalla y con cualquier zoom.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Eraser, Highlighter, MessageSquarePlus, Pencil, Trash2, Undo2 } from 'lucide-react';
import { guardarAnotacionesPagina, obtenerAnotaciones, type TrazoAnotacion } from '../../data/articulosApi';

/** «nota» no dibuja: marca una zona de la página para escribir una nota (ver NotasLibro.tsx). */
export type Herramienta = 'lapiz' | 'resaltador' | 'borrador' | 'nota';
const conColor = (h: Herramienta): h is 'lapiz' | 'resaltador' => h === 'lapiz' || h === 'resaltador';
export type EstadoGuardado = 'listo' | 'guardando' | 'error';

/** Colores de cada herramienta: tinta para el lápiz, tonos claros para el resaltador. */
export const COLORES: Record<'lapiz' | 'resaltador', { valor: string; nombre: string }[]> = {
  lapiz: [
    { valor: '#0F172A', nombre: 'Negro' },
    { valor: '#DC2626', nombre: 'Rojo' },
    { valor: '#2563EB', nombre: 'Azul' },
    { valor: '#16A34A', nombre: 'Verde' },
  ],
  resaltador: [
    { valor: '#FDE047', nombre: 'Amarillo' },
    { valor: '#86EFAC', nombre: 'Verde' },
    { valor: '#F9A8D4', nombre: 'Rosa' },
    { valor: '#7DD3FC', nombre: 'Celeste' },
  ],
};

/** Grosor como fracción del ancho de la página. */
const GROSOR = { lapiz: 0.0035, resaltador: 0.022 };
/** Mismos topes que el backend (app/schemas/anotaciones.py). */
const MAX_PUNTOS_POR_TRAZO = 4000;
const MAX_TRAZOS_POR_PAGINA = 400;
/** Se guarda en cuanto se suelta el trazo; la espera mínima solo junta en un
 * envío lo que se borra arrastrando el borrador. */
const ESPERA_GUARDADO = 120;
const REINTENTO_GUARDADO = 5000;
const MAX_HISTORIAL = 100;
/** Lado mayor máximo del canvas de la capa (igual que el de la página). */
const MAX_LADO_CANVAS = 4096;

const VACIO: TrazoAnotacion[] = [];

/* ══════════════════════ Estado de las anotaciones del libro ══════════════════════ */

interface ValorAnotaciones {
  /** Hay libro y sus anotaciones se cargaron: se puede dibujar. */
  disponible: boolean;
  /** El lápiz está activo: las páginas no se pasan al arrastrar sobre ellas. */
  activo: boolean;
  herramienta: Herramienta;
  color: string;
  paginas: Record<number, TrazoAnotacion[]>;
  /** Devuelve false si la página ya llegó al tope de trazos. */
  agregar: (pagina: number, trazo: TrazoAnotacion) => boolean;
  quitar: (pagina: number, indices: Set<number>) => void;
  /** Tab está apretado: el trazo sale como línea recta (Shift llega en el propio evento). */
  tabApretado: MutableRefObject<boolean>;
}

const AnotacionesContext = createContext<ValorAnotaciones>({
  disponible: false, activo: false, herramienta: 'lapiz', color: COLORES.lapiz[0].valor, paginas: {},
  agregar: () => false, quitar: () => undefined, tabApretado: { current: false },
});

export function useAnotacionesDelLibro(articleId?: string) {
  const [paginas, setPaginas] = useState<Record<number, TrazoAnotacion[]>>({});
  const paginasRef = useRef(paginas);
  const [cargadas, setCargadas] = useState(false);
  const [errorDeCarga, setErrorDeCarga] = useState(false);
  const [activo, setActivo] = useState(false);
  const [herramienta, setHerramienta] = useState<Herramienta>('lapiz');
  const [colores, setColores] = useState({ lapiz: COLORES.lapiz[1].valor, resaltador: COLORES.resaltador[0].valor });
  const [guardado, setGuardado] = useState<EstadoGuardado>('listo');
  const [hayHistorial, setHayHistorial] = useState(false);
  const historial = useRef<{ pagina: number; antes: TrazoAnotacion[] }[]>([]);
  const pendientes = useRef(new Map<number, TrazoAnotacion[]>());
  const temporizador = useRef<number | undefined>(undefined);
  // Un envío a la vez: así dos guardados de la misma página no llegan en desorden
  // (el más viejo pisaría al más nuevo).
  const enVuelo = useRef(false);
  const tabApretado = useRef(false);

  // Se cargan antes de permitir dibujar: si no, guardar una página reemplazaría
  // en el servidor lo que el usuario ya tenía en ella.
  useEffect(() => {
    if (!articleId) return;
    let vigente = true;
    obtenerAnotaciones(articleId)
      .then(({ paginas: recibidas }) => {
        if (!vigente) return;
        const porNumero: Record<number, TrazoAnotacion[]> = {};
        for (const [n, trazos] of Object.entries(recibidas || {})) porNumero[Number(n)] = trazos;
        paginasRef.current = porNumero;
        setPaginas(porNumero);
        setCargadas(true);
      })
      .catch(() => { if (vigente) setErrorDeCarga(true); });
    return () => { vigente = false; };
  }, [articleId]);

  const guardarPendientes = useCallback(async (keepalive = false): Promise<void> => {
    window.clearTimeout(temporizador.current);
    if (!articleId || pendientes.current.size === 0) return;
    // Si ya hay un envío en curso, lo nuevo sale apenas termine (ver abajo).
    if (enVuelo.current && !keepalive) return;
    const lote = [...pendientes.current.entries()];
    pendientes.current.clear();
    enVuelo.current = true;
    setGuardado('guardando');
    try {
      await Promise.all(lote.map(([pagina, trazos]) => guardarAnotacionesPagina(articleId, pagina, trazos, keepalive)));
    } catch {
      // Lo que no se pudo guardar vuelve a la cola (salvo que ya haya una versión más nueva).
      for (const [pagina, trazos] of lote) if (!pendientes.current.has(pagina)) pendientes.current.set(pagina, trazos);
      enVuelo.current = false;
      setGuardado('error');
      temporizador.current = window.setTimeout(() => void guardarPendientes(), REINTENTO_GUARDADO);
      return;
    }
    enVuelo.current = false;
    if (pendientes.current.size > 0) return guardarPendientes();
    setGuardado('listo');
  }, [articleId]);

  // Con el lápiz activo, Tab no mueve el foco: mantenerlo apretado traza líneas rectas.
  useEffect(() => {
    if (!activo) return;
    const abajo = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      tabApretado.current = true;
    };
    const arriba = (e: KeyboardEvent) => { if (e.key === 'Tab') tabApretado.current = false; };
    const soltarTodo = () => { tabApretado.current = false; };
    window.addEventListener('keydown', abajo);
    window.addEventListener('keyup', arriba);
    window.addEventListener('blur', soltarTodo);
    return () => {
      window.removeEventListener('keydown', abajo);
      window.removeEventListener('keyup', arriba);
      window.removeEventListener('blur', soltarTodo);
      tabApretado.current = false;
    };
  }, [activo]);

  // Al cerrar el visor (o la pestaña) se guarda lo que quede pendiente.
  useEffect(() => {
    const alOcultar = () => void guardarPendientes(true);
    window.addEventListener('pagehide', alOcultar);
    return () => {
      window.removeEventListener('pagehide', alOcultar);
      void guardarPendientes();
    };
  }, [guardarPendientes]);

  const fijarPagina = useCallback((pagina: number, nuevo: TrazoAnotacion[], conHistorial: boolean) => {
    const antes = paginasRef.current[pagina] ?? VACIO;
    if (nuevo === antes) return;
    if (conHistorial) {
      historial.current.push({ pagina, antes });
      if (historial.current.length > MAX_HISTORIAL) historial.current.shift();
      setHayHistorial(true);
    }
    const siguiente = { ...paginasRef.current, [pagina]: nuevo };
    paginasRef.current = siguiente;
    setPaginas(siguiente);
    pendientes.current.set(pagina, nuevo);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => void guardarPendientes(), ESPERA_GUARDADO);
  }, [guardarPendientes]);

  const agregar = useCallback((pagina: number, trazo: TrazoAnotacion) => {
    const antes = paginasRef.current[pagina] ?? VACIO;
    if (antes.length >= MAX_TRAZOS_POR_PAGINA) return false;
    fijarPagina(pagina, [...antes, trazo], true);
    return true;
  }, [fijarPagina]);

  const quitar = useCallback((pagina: number, indices: Set<number>) => {
    if (indices.size === 0) return;
    const antes = paginasRef.current[pagina] ?? VACIO;
    fijarPagina(pagina, antes.filter((_t, i) => !indices.has(i)), true);
  }, [fijarPagina]);

  const limpiar = useCallback((numeros: number[]) => {
    for (const n of numeros) if ((paginasRef.current[n] ?? VACIO).length) fijarPagina(n, VACIO, true);
  }, [fijarPagina]);

  const deshacer = useCallback(() => {
    const ultimo = historial.current.pop();
    setHayHistorial(historial.current.length > 0);
    if (ultimo) fijarPagina(ultimo.pagina, ultimo.antes, false);
  }, [fijarPagina]);

  const disponible = Boolean(articleId) && cargadas;
  const color = conColor(herramienta) ? colores[herramienta] : colores.lapiz;

  return {
    disponible,
    errorDeCarga,
    activo: activo && disponible,
    setActivo,
    herramienta,
    setHerramienta,
    color,
    elegirColor: (valor: string) => {
      if (conColor(herramienta)) setColores(c => ({ ...c, [herramienta]: valor }));
    },
    guardado,
    hayHistorial,
    deshacer,
    limpiar,
    paginas,
    agregar,
    quitar,
    tabApretado,
    tieneTrazos: (numeros: number[]) => numeros.some(n => (paginas[n] ?? VACIO).length > 0),
  };
}

export type AnotacionesDelLibro = ReturnType<typeof useAnotacionesDelLibro>;

export function AnotacionesProvider({ valor, children }: { valor: AnotacionesDelLibro; children: ReactNode }) {
  return (
    <AnotacionesContext.Provider
      value={{
        disponible: valor.disponible, activo: valor.activo, herramienta: valor.herramienta, color: valor.color,
        paginas: valor.paginas, agregar: valor.agregar, quitar: valor.quitar, tabApretado: valor.tabApretado,
      }}
    >
      {children}
    </AnotacionesContext.Provider>
  );
}

/* ══════════════════════ Dibujo ══════════════════════ */

function pintarTrazo(ctx: CanvasRenderingContext2D, t: TrazoAnotacion, w: number, h: number) {
  const pts = t.puntos;
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = t.color;
  ctx.lineWidth = Math.max(1, t.grosor * w);
  // El resaltador es translúcido; la capa se mezcla con la página (multiply),
  // así el texto de debajo se sigue leyendo.
  if (t.herramienta === 'resaltador') ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
  if (pts.length === 1) {
    ctx.lineTo(pts[0][0] * w + 0.1, pts[0][1] * h);
  } else {
    // Curvas por los puntos medios: el trazo sale suave aunque haya pocos puntos.
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i][0] + pts[i + 1][0]) / 2) * w;
      const my = ((pts[i][1] + pts[i + 1][1]) / 2) * h;
      ctx.quadraticCurveTo(pts[i][0] * w, pts[i][1] * h, mx, my);
    }
    const u = pts[pts.length - 1];
    ctx.lineTo(u[0] * w, u[1] * h);
  }
  ctx.stroke();
  ctx.restore();
}

/** Distancia (px) del punto p al segmento a-b. */
function distanciaASegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const largo = dx * dx + dy * dy;
  const t = largo ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const redondear = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;

// react-pageflip escucha mousedown/touchstart en el libro y mousemove/mouseup en
// la ventana: con el lápiz activo se cortan en la capa para que la hoja no se mueva.
const EVENTOS_DEL_LIBRO = ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend'] as const;

interface CapaProps {
  /** Número de página del PDF (desde 1). */
  pagina: number;
  /** La página está en la ventana de memoria del visor: si no, no se crea el canvas. */
  activa: boolean;
  ancho: number;
  alto: number;
  nitidez: number;
}

/** Capa transparente sobre una página: muestra lo dibujado y, con el lápiz activo, permite dibujar.
 *
 * Dos canvas: el de abajo tiene los trazos ya hechos y el de arriba solo el que se
 * está dibujando, que se repinta en cada movimiento del puntero sin pasar por React.
 * Al soltar, el trazo se pinta al instante en el de abajo; el estado (y el guardado)
 * se actualiza aparte, así nunca hay un momento en que el trazo desaparezca. */
export function CapaDeAnotaciones({ pagina, activa, ancho, alto, nitidez }: CapaProps) {
  const a = useContext(AnotacionesContext);
  const trazos = a.paginas[pagina] ?? VACIO;
  const capaRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const vivoRef = useRef<HTMLCanvasElement>(null);
  // Lo que se ve en la página: se adelanta al estado al soltar o borrar.
  const vistos = useRef<TrazoAnotacion[]>(trazos);
  const enCurso = useRef<TrazoAnotacion | null>(null);
  // Último punto del puntero (para rehacer la línea recta al apretar o soltar Tab/Shift).
  const ultimo = useRef<{ p: [number, number]; recta: boolean } | null>(null);
  const borrando = useRef(false);
  const visible = activa && (a.activo || trazos.length > 0);
  // Con la herramienta «Nota» esta capa no dibuja: deja pasar los toques a la capa de notas.
  const dibuja = a.activo && a.herramienta !== 'nota';

  const pintarBase = useCallback(() => {
    const canvas = baseRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const t of vistos.current) pintarTrazo(ctx, t, canvas.width, canvas.height);
  }, []);

  const pintarVivo = useCallback((predichos: [number, number][] = []) => {
    const canvas = vivoRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = enCurso.current;
    if (!t) return;
    // Los puntos que el navegador predice se dibujan (menos retraso) pero no se guardan.
    pintarTrazo(ctx, predichos.length ? { ...t, puntos: [...t.puntos, ...predichos] } : t, canvas.width, canvas.height);
  }, []);

  // Llegó un estado nuevo (carga, deshacer, otro trazo): es lo que manda.
  useEffect(() => {
    vistos.current = trazos;
    pintarBase();
  }, [trazos, pintarBase]);

  // Tamaño de los canvas: la densidad de la pantalla (y el zoom), como la página.
  useEffect(() => {
    if (!visible) return;
    const densidad = Math.min(nitidez, MAX_LADO_CANVAS / Math.max(ancho, alto));
    const w = Math.floor(ancho * densidad);
    const h = Math.floor(alto * densidad);
    for (const canvas of [baseRef.current, vivoRef.current]) {
      if (canvas && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    pintarBase();
    pintarVivo();
  }, [visible, a.activo, ancho, alto, nitidez, pintarBase, pintarVivo]);

  // Al salir de la ventana de memoria se liberan los canvas.
  useEffect(() => () => {
    if (baseRef.current) baseRef.current.width = 0;
    if (vivoRef.current) vivoRef.current.width = 0;
  }, []);

  useEffect(() => {
    const capa = capaRef.current;
    if (!capa || !dibuja) return;
    const cortar = (e: Event) => e.stopPropagation();
    for (const ev of EVENTOS_DEL_LIBRO) capa.addEventListener(ev, cortar, { passive: true });
    return () => { for (const ev of EVENTOS_DEL_LIBRO) capa.removeEventListener(ev, cortar); };
  }, [dibuja, visible]);

  // Apretar o soltar Tab/Shift en medio del trazo lo cambia al momento, sin mover el puntero.
  useEffect(() => {
    if (!a.activo) return;
    const alCambiarTecla = (e: KeyboardEvent) => {
      if ((e.key === 'Tab' || e.key === 'Shift') && enCurso.current && ultimo.current) {
        moverA(ultimo.current.p, e.shiftKey || a.tabApretado.current);
        pintarVivo();
      }
    };
    window.addEventListener('keydown', alCambiarTecla);
    window.addEventListener('keyup', alCambiarTecla);
    return () => {
      window.removeEventListener('keydown', alCambiarTecla);
      window.removeEventListener('keyup', alCambiarTecla);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.activo]);

  if (!visible) return null;

  const punto = (e: { clientX: number; clientY: number }, r: DOMRect): [number, number] =>
    [redondear((e.clientX - r.left) / r.width), redondear((e.clientY - r.top) / r.height)];

  /** Lleva el trazo en curso hasta p: en línea recta desde donde empezó, o a mano alzada. */
  function moverA(p: [number, number], recta: boolean) {
    const t = enCurso.current;
    const r = capaRef.current?.getBoundingClientRect();
    if (!t || !r) return;
    if (recta) {
      // La recta sale del primer punto del trazo; al soltar la tecla se sigue a mano alzada desde su punta.
      t.puntos = [t.puntos[0], p];
    } else if (t.puntos.length < MAX_PUNTOS_POR_TRAZO) {
      const u = t.puntos[t.puntos.length - 1];
      // Puntos a menos de ~1,5 px del anterior no aportan nada y engordan lo guardado.
      if (Math.hypot((p[0] - u[0]) * r.width, (p[1] - u[1]) * r.height) >= 1.5) t.puntos.push(p);
    }
    ultimo.current = { p, recta };
  }

  const borrarEn = (e: { clientX: number; clientY: number }) => {
    const r = capaRef.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const tocados = new Set<number>();
    vistos.current.forEach((t, i) => {
      const radio = 8 + (t.grosor * r.width) / 2;
      const p = t.puntos;
      for (let k = 0; k < p.length; k++) {
        const b = p[Math.min(k + 1, p.length - 1)];
        if (distanciaASegmento(px, py, p[k][0] * r.width, p[k][1] * r.height, b[0] * r.width, b[1] * r.height) <= radio) {
          tocados.add(i);
          break;
        }
      }
    });
    if (tocados.size === 0) return;
    // Se quita de la vista en el acto; el estado y el guardado vienen detrás.
    vistos.current = vistos.current.filter((_t, i) => !tocados.has(i));
    pintarBase();
    a.quitar(pagina, tocados);
  };

  const alBajar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dibuja || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (a.herramienta === 'borrador') {
      borrando.current = true;
      borrarEn(e);
      return;
    }
    const herramienta = a.herramienta as 'lapiz' | 'resaltador';
    const p = punto(e, e.currentTarget.getBoundingClientRect());
    enCurso.current = { herramienta, color: a.color, grosor: GROSOR[herramienta], puntos: [p] };
    ultimo.current = { p, recta: false };
    pintarVivo();
  };

  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (borrando.current) {
      borrarEn(e);
      return;
    }
    if (!enCurso.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const recta = e.shiftKey || a.tabApretado.current;
    // Los eventos intermedios que el navegador agrupa: el trazo sale continuo aunque se mueva rápido.
    const nativo = e.nativeEvent;
    const eventos = recta ? [nativo] : (nativo.getCoalescedEvents?.() ?? [nativo]);
    for (const ev of eventos) moverA(punto(ev, r), recta);
    const predichos = recta ? [] : (nativo.getPredictedEvents?.() ?? []).map(ev => punto(ev, r));
    pintarVivo(predichos);
  };

  const alSoltar = () => {
    borrando.current = false;
    const t = enCurso.current;
    enCurso.current = null;
    ultimo.current = null;
    if (t && a.agregar(pagina, t)) {
      // Pasa al canvas de abajo en el mismo cuadro en que se borra el de arriba.
      vistos.current = [...vistos.current, t];
      const base = baseRef.current;
      const ctx = base?.getContext('2d');
      if (base && ctx) pintarTrazo(ctx, t, base.width, base.height);
    }
    pintarVivo();
  };

  return (
    <div
      ref={capaRef}
      className={`fb-anotaciones ${dibuja ? `is-dibujando is-${a.herramienta}` : ''}`}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
    >
      <canvas ref={baseRef} className="fb-anotaciones-canvas" />
      {a.activo && <canvas ref={vivoRef} className="fb-anotaciones-canvas fb-anotaciones-vivo" />}
    </div>
  );
}

/* ══════════════════════ Controles de la barra ══════════════════════ */

interface ControlesProps {
  anotaciones: AnotacionesDelLibro;
  /** Números de página (desde 1) que están a la vista, para «Borrar lo de estas páginas». */
  paginasALaVista: number[];
}

const HERRAMIENTAS: { id: Herramienta; nombre: string; Icono: typeof Pencil }[] = [
  { id: 'lapiz', nombre: 'Lápiz', Icono: Pencil },
  { id: 'resaltador', nombre: 'Resaltador (subrayar)', Icono: Highlighter },
  { id: 'borrador', nombre: 'Borrador (toca un trazo para quitarlo)', Icono: Eraser },
  { id: 'nota', nombre: 'Nota: arrastra un recuadro o toca un párrafo para comentarlo', Icono: MessageSquarePlus },
];

/** Botón del lápiz, para la barra del visor. */
export function BotonLapiz({ anotaciones: an, className = 'fb-icon-btn fb-btn-sm' }: { anotaciones: AnotacionesDelLibro; className?: string }) {
  const titulo = an.errorDeCarga
    ? 'No se pudieron cargar tus anotaciones de este libro'
    : !an.disponible
      ? 'Cargando tus anotaciones…'
      : an.activo
        ? 'Terminar de dibujar (Esc): las hojas se vuelven a pasar arrastrando'
        : 'Lápiz: subrayar o dibujar en las páginas (solo tú lo ves). Mantén Tab o Shift para líneas rectas';
  return (
    <button
      type="button"
      className={`${className} ${an.activo ? 'is-activo' : ''}`}
      title={titulo}
      aria-label={titulo}
      aria-pressed={an.activo}
      disabled={!an.disponible}
      onClick={() => an.setActivo(!an.activo)}
    >
      <Pencil size={16} />
    </button>
  );
}

/** Herramientas, colores, deshacer y borrar: se muestran con el lápiz activo. */
export function HerramientasDeDibujo({ anotaciones: an, paginasALaVista }: ControlesProps) {
  const coloresDe = conColor(an.herramienta) ? COLORES[an.herramienta] : null;
  if (!an.activo) return null;

  return (
    <>
      {(
        <div className="fb-lapiz" role="toolbar" aria-label="Herramientas de dibujo">
          {HERRAMIENTAS.map(({ id, nombre, Icono }) => (
            <button
              key={id}
              type="button"
              className={`fb-icon-btn fb-btn-sm ${an.herramienta === id ? 'is-activo' : ''}`}
              title={nombre}
              aria-label={nombre}
              aria-pressed={an.herramienta === id}
              onClick={() => an.setHerramienta(id)}
            >
              <Icono size={15} />
            </button>
          ))}
          {coloresDe && (
            <div className="fb-colores" role="radiogroup" aria-label="Color">
              {coloresDe.map(c => (
                <button
                  key={c.valor}
                  type="button"
                  role="radio"
                  aria-checked={an.color === c.valor}
                  aria-label={c.nombre}
                  title={c.nombre}
                  className={`fb-color ${an.color === c.valor ? 'is-activo' : ''}`}
                  style={{ background: c.valor }}
                  onClick={() => an.elegirColor(c.valor)}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            className="fb-icon-btn fb-btn-sm"
            title="Deshacer (Ctrl+Z)"
            aria-label="Deshacer"
            disabled={!an.hayHistorial}
            onClick={an.deshacer}
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            className="fb-icon-btn fb-btn-sm"
            title="Borrar todo lo dibujado en las páginas a la vista"
            aria-label="Borrar lo dibujado en las páginas a la vista"
            disabled={!an.tieneTrazos(paginasALaVista)}
            onClick={() => an.limpiar(paginasALaVista)}
          >
            <Trash2 size={15} />
          </button>
          {an.herramienta === 'nota' ? (
            <span className="fb-ayuda-recta" title="Arrastra un recuadro sobre la página, o toca un párrafo para elegirlo entero">
              Arrastra o toca un párrafo
            </span>
          ) : (
            <span className="fb-ayuda-recta" title="Mantén Tab (o Shift) mientras dibujas para trazar una línea recta">
              Tab: línea recta
            </span>
          )}
          <span className={`fb-guardado is-${an.guardado}`} role="status">
            {an.guardado === 'guardando' ? 'Guardando…' : an.guardado === 'error' ? 'Sin guardar, reintentando…' : 'Guardado'}
          </span>
        </div>
      )}
    </>
  );
}
