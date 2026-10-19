import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { Articulo } from '../../data/articulosApi';

interface ConfirmarRetiroModalProps {
  articulo: Articulo;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function ConfirmarRetiroModal({
  articulo,
  onClose,
  onConfirm,
}: ConfirmarRetiroModalProps) {
  const [retirando, setRetirando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setRetirando(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo retirar el recurso.');
      setRetirando(false);
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
        style={{ maxWidth: 420 }}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#FEE2E2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <AlertTriangle size={24} />
          </div>

          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--ink)' }}>
            ¿Retirar recurso de la biblioteca?
          </h3>

          <p style={{ fontSize: '0.85rem', color: 'var(--ink2)', margin: '0 0 16px', lineHeight: 1.45 }}>
            Estás a punto de retirar <strong>"{articulo.title}"</strong>. Si tiene un archivo PDF asociado, también será eliminado del almacenamiento. Esta acción no se puede deshacer.
          </p>

          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: 12 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', width: '100%', gap: 10, justifyContent: 'center' }}>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: 8,
                border: '1px solid var(--border, #E2E8F0)',
                background: 'transparent',
                color: 'var(--ink)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
              onClick={onClose}
              disabled={retirando}
            >
              Cancelar
            </button>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#DC2626',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
              onClick={handleConfirm}
              disabled={retirando}
            >
              <Trash2 size={14} />
              {retirando ? 'Retirando...' : 'Sí, retirar'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
