import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Move } from 'lucide-react';
import type { PortadaNueva } from '../../data/cursosApi';
import { PORTADA_MAX_MB, validarPortada } from '../../utils/portada';
import PortadaCurso from './PortadaCurso';

interface Props {
  /** Para el color de respaldo cuando no hay imagen. En un curso nuevo, cualquier texto estable. */
  courseId: string;
  courseName: string;
  /** Portada que el curso ya tiene guardada (al editar). */
  urlActual?: string | null;
  /** Imagen nueva elegida (todavía sin subir), o null. */
  value: PortadaNueva | null;
  onChange: (value: PortadaNueva | null) => void;
  /** Si se pasa y el curso tiene portada guardada, aparece "Quitar portada". */
  onQuitarActual?: () => void;
  disabled?: boolean;
}

const acotar = (n: number) => Math.min(1, Math.max(0, n));

/** Subida de la portada con vista previa en la proporción real de la card
 * (2:1). Si la imagen no es 2:1 se recorta: arrastrando la vista previa (o
 * con las flechas del teclado) el docente elige qué parte queda. */
export default function PortadaPicker({
  courseId, courseName, urlActual, value, onChange, onQuitarActual, disabled,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ x: number; y: number; focusX: number; focusY: number } | null>(null);

  // La vista previa es una URL local del archivo elegido; se libera al cambiar.
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value?.file]);

  async function handleElegir(file: File | undefined) {
    if (!file) return;
    const problema = await validarPortada(file);
    if (problema) {
      setError(problema);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setError(null);
    onChange({ file, focusX: 0.5, focusY: 0.5 });
  }

  function handleDescartar() {
    onChange(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function mover(dx: number, dy: number, desde = value) {
    if (!desde) return;
    onChange({ ...desde, focusX: acotar(desde.focusX + dx), focusY: acotar(desde.focusY + dy) });
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
    // Arrastrar a la derecha muestra más de la izquierda de la imagen, como al mover una foto.
    const dx = (e.clientX - inicio.x) / marco.clientWidth;
    const dy = (e.clientY - inicio.y) / marco.clientHeight;
    onChange({ ...value, focusX: acotar(inicio.focusX - dx), focusY: acotar(inicio.focusY - dy) });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const paso = 0.05;
    const movimientos: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso],
    };
    const m = movimientos[e.key];
    if (!m || !value) return;
    e.preventDefault();
    mover(m[0], m[1]);
  }

  return (
    <div className="cur-portada-picker">
      <div
        ref={marcoRef}
        className={`cur-portada-marco ${value ? 'is-ajustable' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { arrastre.current = null; }}
        onPointerCancel={() => { arrastre.current = null; }}
        onKeyDown={handleKeyDown}
        tabIndex={value ? 0 : -1}
        role={value ? 'group' : undefined}
        aria-label={value ? 'Encuadre de la portada: arrastra o usa las flechas para moverla' : undefined}
      >
        {value && previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Vista previa de la portada"
              className="cur-portada-img"
              draggable={false}
              style={{ objectPosition: `${value.focusX * 100}% ${value.focusY * 100}%` }}
            />
            <span className="cur-portada-ayuda"><Move size={12} /> Arrastra para encuadrar</span>
          </>
        ) : (
          <PortadaCurso id={courseId} name={courseName || 'Curso'} url={urlActual} />
        )}
      </div>

      <div className="cur-portada-acciones">
        <label className={`ccv-btn-secondary cur-portada-btn ${disabled ? 'is-disabled' : ''}`}>
          <ImagePlus size={14} /> {value || urlActual ? 'Cambiar imagen' : 'Subir imagen'}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={e => handleElegir(e.target.files?.[0])}
          />
        </label>
        {value && (
          <button type="button" className="ccv-link-btn" onClick={handleDescartar} disabled={disabled}>
            Descartar imagen nueva
          </button>
        )}
        {!value && urlActual && onQuitarActual && (
          <button type="button" className="ccv-link-btn cur-portada-quitar" onClick={onQuitarActual} disabled={disabled}>
            <Trash2 size={12} /> Quitar portada
          </button>
        )}
      </div>

      <p className="ccv-form-hint">
        JPG, PNG o WebP, hasta {PORTADA_MAX_MB} MB. Se recorta a formato horizontal (2:1).
        {!value && !urlActual ? ' Sin imagen, el curso se muestra con un color y sus iniciales.' : ''}
      </p>
      {error && <p className="ccv-form-error" role="alert">{error}</p>}
    </div>
  );
}
