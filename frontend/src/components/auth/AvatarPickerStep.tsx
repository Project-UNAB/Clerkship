import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, AlertCircle, Check, Palette } from 'lucide-react';
import { saveAvatarSvg, mainAuthErrorMessage } from '../../data/mainAuth';
import ColorPickerPopover from '../shared/ColorPickerPopover';

const DICEBEAR_BASE = 'https://api.dicebear.com/9.x';

/** Estilos curados de DiceBear (hay muchos más — estos cubren un rango
 *  bueno de "caricatura humana" a "robot/abstracto" sin abrumar la UI). */
const STYLES = [
  { id: 'avataaars', label: 'Clásico' },
  { id: 'personas', label: 'Personas' },
  { id: 'micah', label: 'Micah' },
  { id: 'notionists', label: 'Notion' },
  { id: 'bottts', label: 'Robot' },
  { id: 'fun-emoji', label: 'Emoji' },
  { id: 'pixel-art', label: 'Pixel' },
  { id: 'shapes', label: 'Formas' },
] as const;

/** Colores de fondo sólidos que acepta DiceBear vía backgroundColor (sin #). */
const BG_COLORS = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c9f2c7', 'f1f1f1', 'transparent'];

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildAvatarUrl(style: string, seed: string, bg: string): string {
  const params = new URLSearchParams({ seed });
  if (bg !== 'transparent') {
    params.set('backgroundColor', bg);
    params.set('backgroundType', 'solid');
  }
  return `${DICEBEAR_BASE}/${style}/svg?${params.toString()}`;
}

interface AvatarPickerStepProps {
  defaultSeed: string;
  onDone: () => void;
}

/**
 * Pantalla de "Elegí tu avatar" — 100% DiceBear (https://www.dicebear.com/),
 * sin API key. El usuario elige estilo + semilla (aleatoria o a mano) +
 * color de fondo, y al confirmar se trae el SVG real (texto, unos KB) UNA
 * sola vez y se guarda en la base — no un link que dependa de que DiceBear
 * siga respondiendo después.
 */
export default function AvatarPickerStep({ defaultSeed, onDone }: AvatarPickerStepProps) {
  const [style, setStyle] = useState<string>(STYLES[0].id);
  const [seed, setSeed] = useState(defaultSeed);
  const [bg, setBg] = useState(BG_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const previewUrl = useMemo(() => buildAvatarUrl(style, seed, bg), [style, seed, bg]);
  const isCustomBg = !BG_COLORS.includes(bg);

  // 6 variaciones rápidas para elegir con un click, sin tocar nada más.
  const suggestions = useMemo(
    () => Array.from({ length: 6 }, () => randomSeed()),
    [style], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(previewUrl);
      if (!res.ok) throw new Error('No se pudo generar el avatar. Intentá de nuevo.');
      const svg = await res.text();
      await saveAvatarSvg(svg);
      onDone();
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="auth-card-head">
        <h1 className="auth-title">Elegí tu avatar</h1>
        <p className="auth-subtitle">Personalizalo como quieras — se guarda de una vez, ya listo.</p>
      </div>

      <div className="auth-avatar-preview-wrap">
        <img src={previewUrl} alt="Vista previa del avatar" className="auth-avatar-preview" />
        <button
          type="button"
          className="auth-avatar-shuffle-btn"
          onClick={() => setSeed(randomSeed())}
          title="Aleatorio"
        >
          <Shuffle size={16} />
        </button>
      </div>

      <div className="auth-avatar-suggestions">
        {suggestions.map(s => (
          <button
            key={s}
            type="button"
            className={`auth-avatar-thumb ${seed === s ? 'active' : ''}`}
            onClick={() => setSeed(s)}
          >
            <img src={buildAvatarUrl(style, s, bg)} alt="Opción de avatar" />
          </button>
        ))}
      </div>

      <div className="auth-avatar-section">
        <span className="auth-label">Estilo</span>
        <div className="auth-avatar-style-row">
          {STYLES.map(s => (
            <button
              key={s.id}
              type="button"
              className={`auth-avatar-style-btn ${style === s.id ? 'active' : ''}`}
              onClick={() => setStyle(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="auth-avatar-section">
        <span className="auth-label">Fondo</span>
        <div className="auth-avatar-bg-row">
          {BG_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`auth-avatar-bg-swatch ${bg === c ? 'active' : ''} ${c === 'transparent' ? 'is-transparent' : ''}`}
              style={c === 'transparent' ? undefined : { background: `#${c}` }}
              onClick={() => setBg(c)}
              title={c === 'transparent' ? 'Sin fondo' : `#${c}`}
            >
              {bg === c && <Check size={14} />}
            </button>
          ))}

          {/* Color a elección, con diseño propio (ColorPickerPopover) — así el
              fondo puede ser literalmente cualquier color, no solo los presets. */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={`auth-avatar-bg-swatch auth-avatar-bg-custom ${isCustomBg ? 'active' : ''}`}
              style={isCustomBg ? { background: `#${bg}` } : undefined}
              title="Elegir color personalizado"
              onClick={() => setPickerOpen(v => !v)}
            >
              {isCustomBg ? <Check size={14} /> : <Palette size={14} />}
            </button>
            <AnimatePresence>
              {pickerOpen && (
                <ColorPickerPopover
                  value={`#${bg === 'transparent' ? '0284c7' : bg}`}
                  onChange={hex => setBg(hex.replace('#', ''))}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            className="auth-general-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <AlertCircle size={18} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        className="auth-submit"
        disabled={saving}
        whileTap={saving ? {} : { scale: 0.98 }}
        onClick={handleConfirm}
      >
        {saving ? <span className="auth-spinner" /> : 'Guardar y continuar'}
      </motion.button>
    </>
  );
}
