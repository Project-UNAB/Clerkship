import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Folder as FolderIcon, Palette } from 'lucide-react';
import type { DocumentFolder } from '../../data/documentosApi';
import ColorPickerPopover from '../shared/ColorPickerPopover';

/** Mismos colores que ya se usaban en las carpetas mock del Dashboard, más
 *  algunos extra — para que las carpetas nuevas encajen con el estilo que
 *  ya existía (rojo Gastro, azul Cardio, violeta Guías, gris Archivados). */
const FOLDER_COLORS = ['#E11D48', '#0284C7', '#9333EA', '#64748B', '#10B981', '#F59E0B', '#0EA5E9', '#EC4899'];

interface FolderModalProps {
  folder?: DocumentFolder | null;
  onClose: () => void;
  onSave: (name: string, color: string) => Promise<void>;
}

export default function FolderModal({ folder, onClose, onSave }: FolderModalProps) {
  const [name, setName] = useState(folder?.name || '');
  const [color, setColor] = useState(folder?.color || FOLDER_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isCustomColor = !FOLDER_COLORS.includes(color);

  async function handleSave() {
    if (!name.trim()) {
      setError('Ponele un nombre a la carpeta.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim(), color);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la carpeta.');
      setSaving(false);
    }
  }

  return (
    <motion.div
      className="dfm-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="dfm-modal"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="dfm-header">
          <span>{folder ? 'Editar carpeta' : 'Nueva carpeta'}</span>
          <button type="button" className="dfm-close-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="dfm-preview">
          <FolderIcon size={40} fill={color + '28'} color={color} strokeWidth={1.5} />
        </div>

        <label className="dfm-label">Nombre</label>
        <input
          type="text"
          className="dfm-input"
          value={name}
          onChange={e => { setName(e.target.value); if (error) setError(null); }}
          placeholder="Ej. Gastroenterología"
          autoFocus
        />

        <label className="dfm-label">Color</label>
        <div className="dfm-color-row">
          {FOLDER_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`dfm-color-swatch ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            >
              {color === c && <Check size={13} color="#fff" />}
            </button>
          ))}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={`dfm-color-swatch dfm-color-custom ${isCustomColor ? 'active' : ''}`}
              style={isCustomColor ? { background: color } : undefined}
              onClick={() => setPickerOpen(v => !v)}
            >
              {isCustomColor ? <Check size={13} color="#fff" /> : <Palette size={13} />}
            </button>
            <AnimatePresence>
              {pickerOpen && (
                <ColorPickerPopover value={color} onChange={setColor} onClose={() => setPickerOpen(false)} />
              )}
            </AnimatePresence>
          </div>
        </div>

        {error && <p className="dfm-error">{error}</p>}

        <button type="button" className="dfm-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : folder ? 'Guardar cambios' : 'Crear carpeta'}
        </button>
      </motion.div>
    </motion.div>
  );
}
