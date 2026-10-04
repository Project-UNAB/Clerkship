import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { hexToHsv, hsvToHex, isValidHex, type HSV } from '../../utils/color';

interface ColorPickerPopoverProps {
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
}

/**
 * Selector de color con diseño propio (cuadro de saturación/brillo + slider
 * de matiz + hex a mano) — reemplaza el picker nativo del navegador
 * (`<input type="color">`) para que se vea consistente con el resto de la
 * app en vez de la ventana del sistema operativo.
 */
export default function ColorPickerPopover({ value, onChange, onClose }: ColorPickerPopoverProps) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(isValidHex(value) ? value : '#0284C7'));
  const [hexInput, setHexInput] = useState(value.toUpperCase());
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'sv' | 'hue' | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  function commit(next: HSV) {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  }

  function updateFromSv(clientX: number, clientY: number) {
    const rect = svRef.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const v = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    commit({ ...hsv, s, v });
  }

  function updateFromHue(clientX: number) {
    const rect = hueRef.current!.getBoundingClientRect();
    const h = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 360;
    commit({ ...hsv, h });
  }

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      if (draggingRef.current === 'sv') updateFromSv(e.clientX, e.clientY);
      else if (draggingRef.current === 'hue') updateFromHue(e.clientX);
    }
    function handleUp() { draggingRef.current = null; }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsv]);

  function handleHexInputChange(v: string) {
    setHexInput(v);
    const withHash = v.startsWith('#') ? v : `#${v}`;
    if (isValidHex(withHash)) {
      const next = hexToHsv(withHash);
      setHsv(next);
      onChange(withHash);
    }
  }

  const currentHex = hsvToHex(hsv);

  return (
    <motion.div
      ref={rootRef}
      className="cpp-popover"
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.14 }}
    >
      <div
        ref={svRef}
        className="cpp-sv-square"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h}, 100%, 50%)` }}
        onPointerDown={e => { draggingRef.current = 'sv'; updateFromSv(e.clientX, e.clientY); }}
      >
        <div
          className="cpp-sv-thumb"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: currentHex }}
        />
      </div>

      <div className="cpp-hue-row">
        <div
          ref={hueRef}
          className="cpp-hue-slider"
          onPointerDown={e => { draggingRef.current = 'hue'; updateFromHue(e.clientX); }}
        >
          <div className="cpp-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h}, 100%, 50%)` }} />
        </div>
      </div>

      <div className="cpp-hex-row">
        <span className="cpp-hex-preview" style={{ background: currentHex }} />
        <input
          type="text"
          className="cpp-hex-input"
          value={hexInput}
          onChange={e => handleHexInputChange(e.target.value)}
          maxLength={7}
          spellCheck={false}
        />
      </div>
    </motion.div>
  );
}
