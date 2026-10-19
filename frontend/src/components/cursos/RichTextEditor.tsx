import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HeadingNode, QuoteNode, $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import {
  ListNode, ListItemNode, $isListNode,
  INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { LinkNode, AutoLinkNode, TOGGLE_LINK_COMMAND, $isLinkNode } from '@lexical/link';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { $getSelectionStyleValueForProperty, $patchStyleText, $setBlocksType } from '@lexical/selection';
import { $findMatchingParent, $getNearestNodeOfType, mergeRegister } from '@lexical/utils';
import {
  $createParagraphNode, $getRoot, $getSelection, $insertNodes, $isElementNode, $isRangeSelection,
  CAN_REDO_COMMAND, CAN_UNDO_COMMAND, COMMAND_PRIORITY_LOW, FORMAT_ELEMENT_COMMAND, FORMAT_TEXT_COMMAND,
  REDO_COMMAND, SELECTION_CHANGE_COMMAND, UNDO_COMMAND,
  type EditorState, type ElementFormatType, type LexicalEditor,
} from 'lexical';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered,
  Heading2, Heading3, Quote, Link as LinkIcon, Undo2, Redo2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Check, X,
} from 'lucide-react';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** "pagina": el texto se edita sobre la propia página, sin caja, y la barra
   * de formato flota abajo de la pantalla. Por defecto, la caja de los formularios. */
  variante?: 'caja' | 'pagina';
  /** Botones propios de quien usa el editor (guardar, cancelar…), a la
   * derecha de la barra flotante. Solo en la variante "pagina". */
  acciones?: ReactNode;
}

type Bloque = 'paragraph' | 'h2' | 'h3' | 'quote' | 'bullet' | 'number';

/** Tamaños y tipografías disponibles. Son los mismos que acepta el backend
 * (services/sanitize.py): cualquier otro valor se descartaría al guardar. */
const TAMANOS = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
const TIPOGRAFIAS = [
  { valor: '', nombre: 'Predeterminada' },
  { valor: 'Arial, sans-serif', nombre: 'Arial' },
  { valor: 'Verdana, sans-serif', nombre: 'Verdana' },
  { valor: 'Tahoma, sans-serif', nombre: 'Tahoma' },
  { valor: 'Georgia, serif', nombre: 'Georgia' },
  { valor: 'Garamond, serif', nombre: 'Garamond' },
  { valor: 'Consolas, monospace', nombre: 'Consolas (monoespaciada)' },
];

/** Subrayado y tachado no tienen etiqueta propia mientras se edita: Lexical
 * los pinta con estas clases. Al guardar salen como <u> y <s>. */
const TEMA = {
  text: { underline: 'lx-u', strikethrough: 'lx-s', underlineStrikethrough: 'lx-us' },
};

/** Solo se aceptan enlaces web o de correo; cualquier otra cosa no se inserta. */
function urlValida(url: string): string | null {
  const limpia = url.trim();
  if (!limpia) return null;
  const conEsquema = /^(https?:\/\/|mailto:)/i.test(limpia) ? limpia : `https://${limpia}`;
  try {
    const u = new URL(conEsquema);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? conEsquema : null;
  } catch {
    return null;
  }
}

function cargarHtml(editor: LexicalEditor, html: string) {
  if (!html.trim()) return;
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const nodos = $generateNodesFromDOM(editor, dom);
  const raiz = $getRoot();
  raiz.clear();
  raiz.select();
  $insertNodes(nodos);
}

function BarraDeHerramientas() {
  const [editor] = useLexicalComposerContext();
  const [bloque, setBloque] = useState<Bloque>('paragraph');
  const [formato, setFormato] = useState({ bold: false, italic: false, underline: false, strikethrough: false });
  const [alineacion, setAlineacion] = useState<ElementFormatType>('left');
  const [tamano, setTamano] = useState('');
  const [tipografia, setTipografia] = useState('');
  const [enEnlace, setEnEnlace] = useState(false);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const [puedeRehacer, setPuedeRehacer] = useState(false);
  const [enlaceAbierto, setEnlaceAbierto] = useState(false);
  const [url, setUrl] = useState('');
  const [urlInvalida, setUrlInvalida] = useState(false);

  const leerSeleccion = useCallback(() => {
    const seleccion = $getSelection();
    if (!$isRangeSelection(seleccion)) return;

    setFormato({
      bold: seleccion.hasFormat('bold'),
      italic: seleccion.hasFormat('italic'),
      underline: seleccion.hasFormat('underline'),
      strikethrough: seleccion.hasFormat('strikethrough'),
    });

    setTamano($getSelectionStyleValueForProperty(seleccion, 'font-size', ''));
    setTipografia($getSelectionStyleValueForProperty(seleccion, 'font-family', '').replace(/["']/g, ''));

    const ancla = seleccion.anchor.getNode();
    const elemento = ancla.getKey() === 'root' ? ancla : ancla.getTopLevelElementOrThrow();
    if ($isListNode(elemento)) {
      const lista = $getNearestNodeOfType(ancla, ListNode) ?? elemento;
      setBloque(lista.getListType() === 'number' ? 'number' : 'bullet');
    } else if ($isHeadingNode(elemento)) {
      const etiqueta = elemento.getTag();
      setBloque(etiqueta === 'h2' || etiqueta === 'h3' ? etiqueta : 'paragraph');
    } else {
      setBloque($isQuoteNode(elemento) ? 'quote' : 'paragraph');
    }

    // La alineación vive en el bloque más cercano (en una lista, en el ítem).
    const contenedor = $findMatchingParent(ancla, n => $isElementNode(n) && !n.isInline());
    const tipo = $isElementNode(contenedor) ? contenedor.getFormatType() : '';
    setAlineacion(tipo || 'left');

    const enlace = $findMatchingParent(ancla, $isLinkNode);
    setEnEnlace(enlace !== null);
    setUrl($isLinkNode(enlace) ? enlace.getURL() : '');
  }, []);

  useEffect(() => mergeRegister(
    editor.registerUpdateListener(({ editorState }) => editorState.read(leerSeleccion)),
    editor.registerCommand(SELECTION_CHANGE_COMMAND, () => { leerSeleccion(); return false; }, COMMAND_PRIORITY_LOW),
    editor.registerCommand(CAN_UNDO_COMMAND, puede => { setPuedeDeshacer(puede); return false; }, COMMAND_PRIORITY_LOW),
    editor.registerCommand(CAN_REDO_COMMAND, puede => { setPuedeRehacer(puede); return false; }, COMMAND_PRIORITY_LOW),
  ), [editor, leerSeleccion]);

  function cambiarBloque(tipo: 'h2' | 'h3' | 'quote') {
    editor.update(() => {
      const seleccion = $getSelection();
      if (!$isRangeSelection(seleccion)) return;
      if (bloque === tipo) $setBlocksType(seleccion, () => $createParagraphNode());
      else if (tipo === 'quote') $setBlocksType(seleccion, () => $createQuoteNode());
      else $setBlocksType(seleccion, () => $createHeadingNode(tipo));
    });
  }

  function cambiarLista(tipo: 'bullet' | 'number') {
    if (bloque === tipo) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    else editor.dispatchCommand(tipo === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined);
  }

  /** Tamaño o tipografía del texto seleccionado; un valor vacío vuelve al predeterminado. */
  function aplicarEstilo(propiedad: 'font-size' | 'font-family', valor: string) {
    editor.update(() => {
      const seleccion = $getSelection();
      if ($isRangeSelection(seleccion)) $patchStyleText(seleccion, { [propiedad]: valor || null });
    });
  }

  function aplicarEnlace() {
    if (!url.trim()) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      setEnlaceAbierto(false);
      return;
    }
    const valida = urlValida(url);
    if (!valida) { setUrlInvalida(true); return; }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: valida, target: '_blank', rel: 'noopener noreferrer' });
    setEnlaceAbierto(false);
  }

  const boton = (activo: boolean) => (activo ? 'is-active' : '');
  const alinear = (tipo: ElementFormatType) => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, tipo);

  return (
    <>
      <div className="ccv-rte-toolbar" role="toolbar" aria-label="Formato del texto">
        <select
          className="ccv-rte-select"
          aria-label="Tipografía"
          title="Tipografía"
          value={TIPOGRAFIAS.some(t => t.valor === tipografia) ? tipografia : ''}
          onChange={e => aplicarEstilo('font-family', e.target.value)}
        >
          {TIPOGRAFIAS.map(t => (
            <option key={t.nombre} value={t.valor} style={{ fontFamily: t.valor || undefined }}>{t.nombre}</option>
          ))}
        </select>
        <select
          className="ccv-rte-select ccv-rte-select-size"
          aria-label="Tamaño del texto"
          title="Tamaño del texto"
          value={TAMANOS.includes(tamano) ? tamano : ''}
          onChange={e => aplicarEstilo('font-size', e.target.value)}
        >
          <option value="">Tamaño</option>
          {TAMANOS.map(t => <option key={t} value={t}>{parseInt(t, 10)}</option>)}
        </select>
        <span className="ccv-rte-divider" />
        <button type="button" className={boton(formato.bold)} aria-pressed={formato.bold} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} title="Negrita (Ctrl+B)">
          <Bold size={14} />
        </button>
        <button type="button" className={boton(formato.italic)} aria-pressed={formato.italic} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} title="Cursiva (Ctrl+I)">
          <Italic size={14} />
        </button>
        <button type="button" className={boton(formato.underline)} aria-pressed={formato.underline} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} title="Subrayado (Ctrl+U)">
          <UnderlineIcon size={14} />
        </button>
        <button type="button" className={boton(formato.strikethrough)} aria-pressed={formato.strikethrough} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')} title="Tachado">
          <Strikethrough size={14} />
        </button>
        <span className="ccv-rte-divider" />
        <button type="button" className={boton(bloque === 'h2')} aria-pressed={bloque === 'h2'} onClick={() => cambiarBloque('h2')} title="Título">
          <Heading2 size={14} />
        </button>
        <button type="button" className={boton(bloque === 'h3')} aria-pressed={bloque === 'h3'} onClick={() => cambiarBloque('h3')} title="Subtítulo">
          <Heading3 size={14} />
        </button>
        <span className="ccv-rte-divider" />
        <button type="button" className={boton(bloque === 'bullet')} aria-pressed={bloque === 'bullet'} onClick={() => cambiarLista('bullet')} title="Lista con viñetas">
          <List size={14} />
        </button>
        <button type="button" className={boton(bloque === 'number')} aria-pressed={bloque === 'number'} onClick={() => cambiarLista('number')} title="Lista numerada">
          <ListOrdered size={14} />
        </button>
        <button type="button" className={boton(bloque === 'quote')} aria-pressed={bloque === 'quote'} onClick={() => cambiarBloque('quote')} title="Cita">
          <Quote size={14} />
        </button>
        <button type="button" className={boton(enEnlace || enlaceAbierto)} aria-pressed={enEnlace} onClick={() => { setUrlInvalida(false); setEnlaceAbierto(v => !v); }} title="Enlace">
          <LinkIcon size={14} />
        </button>
        <span className="ccv-rte-divider" />
        <button type="button" className={boton(alineacion === 'left' || alineacion === 'start')} onClick={() => alinear('left')} title="Alinear a la izquierda">
          <AlignLeft size={14} />
        </button>
        <button type="button" className={boton(alineacion === 'center')} onClick={() => alinear('center')} title="Centrar">
          <AlignCenter size={14} />
        </button>
        <button type="button" className={boton(alineacion === 'right' || alineacion === 'end')} onClick={() => alinear('right')} title="Alinear a la derecha">
          <AlignRight size={14} />
        </button>
        <button type="button" className={boton(alineacion === 'justify')} onClick={() => alinear('justify')} title="Justificar">
          <AlignJustify size={14} />
        </button>
        <span className="ccv-rte-divider" />
        <button type="button" disabled={!puedeDeshacer} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} title="Deshacer (Ctrl+Z)">
          <Undo2 size={14} />
        </button>
        <button type="button" disabled={!puedeRehacer} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} title="Rehacer (Ctrl+Y)">
          <Redo2 size={14} />
        </button>
      </div>

      {enlaceAbierto && (
        <div className="ccv-rte-link-row">
          <input
            autoFocus
            type="url"
            inputMode="url"
            placeholder="https://… (vacío para quitar el enlace)"
            aria-label="Dirección del enlace"
            aria-invalid={urlInvalida}
            value={url}
            onChange={e => { setUrl(e.target.value); setUrlInvalida(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); aplicarEnlace(); }
              if (e.key === 'Escape') { e.stopPropagation(); setEnlaceAbierto(false); }
            }}
          />
          <button type="button" onClick={aplicarEnlace} title="Aplicar enlace"><Check size={14} /></button>
          <button type="button" onClick={() => setEnlaceAbierto(false)} title="Cancelar"><X size={14} /></button>
          {urlInvalida && <span className="ccv-rte-link-error">Escribe una dirección web válida.</span>}
        </div>
      )}
    </>
  );
}

/** Centro y ancho del área de contenido (sin el menú lateral), para que la
 * barra flotante quede centrada sobre la página y no tape el menú. */
function useMarcoDelContenido(activo: boolean) {
  const [marco, setMarco] = useState<{ centro: number; ancho: number } | null>(null);
  useEffect(() => {
    if (!activo) return;
    const contenedor = document.querySelector('.ccv-page-container');
    if (!contenedor) return;
    const medir = () => {
      const r = contenedor.getBoundingClientRect();
      setMarco({ centro: r.left + r.width / 2, ancho: r.width });
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(contenedor);
    window.addEventListener('resize', medir);
    return () => { observador.disconnect(); window.removeEventListener('resize', medir); };
  }, [activo]);
  return marco;
}

/** Editor de texto enriquecido de los cursos, construido sobre Lexical (Meta).
 *
 * Lo que se ve al escribir es lo que se guarda: el área de edición usa la
 * misma clase (`ccv-rte-content`) con la que luego se muestra el texto, y el
 * HTML que sale conserva negrita, cursiva, subrayado, tachado, títulos,
 * listas, citas, enlaces y alineación.
 *
 * El HTML se vuelve a sanitizar en el backend antes de guardarse y otra vez
 * al mostrarlo, como defensa en profundidad contra XSS. */
export default function RichTextEditor({ content, onChange, placeholder, variante = 'caja', acciones }: Props) {
  const enPagina = variante === 'pagina';
  const marco = useMarcoDelContenido(enPagina);
  // El contenido inicial se lee una sola vez: después manda el editor.
  const inicial = useRef(content);
  const ultimoHtml = useRef(content);

  const alCambiar = useCallback((estado: EditorState, editor: LexicalEditor) => {
    estado.read(() => {
      const vacio = $getRoot().getTextContent().trim() === '';
      const html = vacio ? '' : $generateHtmlFromNodes(editor, null);
      if (html !== ultimoHtml.current) {
        ultimoHtml.current = html;
        onChange(html);
      }
    });
  }, [onChange]);

  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'clerkship-curso',
        theme: TEMA,
        nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode],
        editorState: editor => cargarHtml(editor, inicial.current),
        onError: error => { console.error('Editor de texto:', error); },
      }}
    >
      <div className={`ccv-rte-wrap ${enPagina ? 'is-pagina' : ''}`}>
        {enPagina
          // Fuera del flujo de la página: así ningún contenedor la recorta.
          ? createPortal(
            <div
              className="cdl-editbar"
              role="region"
              aria-label="Opciones de edición"
              style={marco ? { left: marco.centro, width: `min(1180px, ${marco.ancho - 28}px)` } : undefined}
            >
              <BarraDeHerramientas />
              {acciones && <div className="cdl-editbar-acciones">{acciones}</div>}
            </div>,
            document.body,
          )
          : <BarraDeHerramientas />}
        <div className="ccv-rte-area">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={enPagina ? 'ccv-rte-content cdl-text' : 'ccv-rte-content'}
                aria-placeholder={placeholder || 'Escribe aquí...'}
                placeholder={<div className="ccv-rte-placeholder">{placeholder || 'Escribe aquí...'}</div>}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin validateUrl={u => urlValida(u) !== null} />
        <OnChangePlugin onChange={alCambiar} ignoreSelectionChange />
      </div>
    </LexicalComposer>
  );
}
