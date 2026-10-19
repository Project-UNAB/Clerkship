import { useEffect, useRef, useState } from 'react';
import { ImagePlus, FileText, Move, Ban, Loader2 } from 'lucide-react';
import { primeraPaginaComoImagen } from '../../utils/pdfPrimeraPagina';

/** Portada elegida: la imagen (subida o la primera página del PDF) y su encuadre. */
export interface PortadaLibro {
  file: File;
  focusX: number;
  focusY: number;
}

export type OrigenPortada = 'pdf' | 'imagen' | 'ninguna';

interface Props {
  /** El PDF del libro (archivo local o enlace temporal) para sacar su primera página. */
  pdf: File | string | null;
  /** Color del lomo según el tipo: se ve también en la vista previa. */
  colorLomo: string;
  titulo: string;
  origen: OrigenPortada;
  onOrigenChange: (origen: OrigenPortada) => void;
  value: PortadaLibro | null;
  onChange: (value: PortadaLibro | null) => void;
  disabled?: boolean;
}

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGEN_BYTES = 2 * 1024 * 1024;
const acotar = (n: number) => Math.min(1, Math.max(0, n));

/** Portada del libro con vista previa vertical (2:3), como queda en el estante.
 * La imagen puede ser horizontal o vertical: se recorta a vertical y, arrastrando
 * la vista previa (o con las flechas), se elige qué parte queda. */
export default function PortadaLibroPicker({
  pdf, colorLomo, titulo, origen, onOrigenChange, value, onChange, disabled,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ x: number; y: number; focusX: number; focusY: number } | null>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value?.file]);

  // Con «Primera página del PDF», la portada se genera sola al elegir esa opción.
  useEffect(() => {
    if (origen !== 'pdf' || !pdf) return;
    let vigente = true;
    setGenerando(true);
    setError(null);
    primeraPaginaComoImagen(pdf)
      .then(file => { if (vigente) onChange({ file, focusX: 0.5, focusY: 0 }); })
      .catch(() => {
        if (!vigente) return;
        setError('No se pudo leer la primera página del PDF. Puedes subir una imagen como portada.');
        onChange(null);
      })
      .finally(() => { if (vigente) setGenerando(false); });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origen, pdf]);

  function elegirOrigen(nuevo: OrigenPortada) {
    if (nuevo === origen) return;
    setError(null);
    onChange(null);
    onOrigenChange(nuevo);
    if (nuevo === 'imagen') inputRef.current?.click();
  }

  function handleImagen(file: File | undefined) {
    if (!file) return;
    if (!TIPOS_IMAGEN.includes(file.type)) {
      setError('La portada tiene que ser una imagen JPG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_IMAGEN_BYTES) {
      setError('La imagen pesa más de 2 MB.');
      return;
    }
    setError(null);
    onChange({ file, focusX: 0.5, focusY: 0.5 });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!value || disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, focusX: value.focusX, focusY: value.focusY };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const inicio = arrastre.current;
    const marco = marcoRef.current;
    if (!inicio || !marco || !value) return;
    // Arrastrar hacia un lado muestra más del otro, como al mover una foto.
    const dx = (e.clientX - inicio.x) / marco.clientWidth;
    const dy = (e.clientY - inicio.y) / marco.clientHeight;
    onChange({ ...value, focusX: acotar(inicio.focusX - dx), focusY: acotar(inicio.focusY - dy) });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const paso = 0.05;
    const m = ({ ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] } as Record<string, [number, number]>)[e.key];
    if (!m || !value) return;
    e.preventDefault();
    onChange({ ...value, focusX: acotar(value.focusX + m[0]), focusY: acotar(value.focusY + m[1]) });
  }

  return (
    <div className="plb-portada">
      <div className="plb-opciones" role="radiogroup" aria-label="Portada del libro">
        <button type="button" role="radio" aria-checked={origen === 'pdf'} className={origen === 'pdf' ? 'is-active' : ''}
          onClick={() => elegirOrigen('pdf')} disabled={disabled || !pdf}>
          <FileText size={14} /> Primera página del PDF
        </button>
        <button type="button" role="radio" aria-checked={origen === 'imagen'} className={origen === 'imagen' ? 'is-active' : ''}
          onClick={() => elegirOrigen('imagen')} disabled={disabled}>
          <ImagePlus size={14} /> Subir una imagen
        </button>
        <button type="button" role="radio" aria-checked={origen === 'ninguna'} className={origen === 'ninguna' ? 'is-active' : ''}
          onClick={() => elegirOrigen('ninguna')} disabled={disabled}>
          <Ban size={14} /> Sin portada
        </button>
      </div>
      <input ref={inputRef} type="file" hidden accept="image/jpeg,image/png,image/webp"
        onChange={e => { handleImagen(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="plb-portada-fila">
        {/* Vista previa con el mismo aspecto del libro en el estante */}
        <div className="plb-libro" style={{ ['--plb-lomo' as string]: colorLomo }}>
          <div className="plb-libro-lomo" />
          <div
            ref={marcoRef}
            className={`plb-libro-portada ${value ? 'is-ajustable' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => { arrastre.current = null; }}
            onPointerCancel={() => { arrastre.current = null; }}
            onKeyDown={handleKeyDown}
            tabIndex={value ? 0 : -1}
            role={value ? 'group' : undefined}
            aria-label={value ? 'Encuadre de la portada: arrastra o usa las flechas para moverla' : undefined}
          >
            {generando ? (
              <span className="plb-libro-vacio"><Loader2 size={20} className="dfm-spin" /> Leyendo el PDF…</span>
            ) : value && previewUrl ? (
              <img src={previewUrl} alt="Vista previa de la portada" draggable={false}
                style={{ objectPosition: `${value.focusX * 100}% ${value.focusY * 100}%` }} />
            ) : (
              <span className="plb-libro-vacio plb-libro-sin-portada">{titulo || 'Sin portada'}</span>
            )}
          </div>
        </div>
        <p className="plb-ayuda">
          {value
            ? <><Move size={12} /> Arrastra la portada (o usa las flechas) para elegir qué parte se ve. Se muestra en vertical, como en el estante.</>
            : origen === 'ninguna'
              ? 'Sin portada, el libro se muestra con el color de su tipo y su título.'
              : origen === 'imagen'
                ? 'Elige una imagen JPG, PNG o WebP de hasta 2 MB; puede ser vertical u horizontal.'
                : 'Se usará la primera página del PDF como portada.'}
          {' '}El color del lomo depende del tipo de recurso.
        </p>
      </div>
      {error && <p className="dfm-error" role="alert">{error}</p>}
    </div>
  );
}
