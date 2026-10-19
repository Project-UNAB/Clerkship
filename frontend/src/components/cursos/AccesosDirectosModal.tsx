import { useState } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { actualizarCurso } from '../../data/cursosApi';
import type { AccesoDirecto, Course } from '../../data/consultasApi';

interface Props {
  curso: Course;
  onClose: () => void;
  onSaved: (curso: Course) => void;
}

const MAX_ACCESOS = 8;

/** Devuelve el enlace con esquema, o null si no es una dirección web. */
function enlaceWeb(url: string): string | null {
  const limpia = url.trim();
  if (!limpia) return null;
  const conEsquema = /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
  try {
    const u = new URL(conEsquema);
    return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.') ? conEsquema : null;
  } catch {
    return null;
  }
}

/** El docente arma los accesos directos del curso: un nombre y un enlace
 * web por cada uno (la sala de videollamada, el programa, una carpeta…). */
export default function AccesosDirectosModal({ curso, onClose, onSaved }: Props) {
  const [accesos, setAccesos] = useState<AccesoDirecto[]>(curso.shortcuts ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cambiar(indice: number, campo: keyof AccesoDirecto, valor: string) {
    setAccesos(lista => lista.map((a, i) => (i === indice ? { ...a, [campo]: valor } : a)));
    setError(null);
  }

  async function handleGuardar() {
    // Las filas que quedaron completamente vacías se ignoran.
    const llenos = accesos.filter(a => a.label.trim() || a.url.trim());
    const limpios: AccesoDirecto[] = [];
    for (const a of llenos) {
      const url = enlaceWeb(a.url);
      if (!a.label.trim()) { setError('Ponle un nombre a cada acceso directo.'); return; }
      if (!url) { setError(`"${a.label.trim()}" no tiene un enlace web válido.`); return; }
      limpios.push({ label: a.label.trim(), url });
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await actualizarCurso(curso.id, { shortcuts: limpios }));
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudieron guardar los accesos directos.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ccv-modal-backdrop" onClick={onClose}>
      <div
        className="ccv-modal ccv-modal-form"
        role="dialog"
        aria-modal="true"
        aria-label="Accesos directos del curso"
        onClick={e => e.stopPropagation()}
      >
        <div className="ccv-modal-header">
          <h3>Accesos directos</h3>
          <button type="button" className="ccv-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ccv-form-body">
          <p className="ccv-form-hint">
            Enlaces que quieres tener a la mano en el curso: la sala de videollamada, el programa, una carpeta compartida…
            Los ven tú y tus estudiantes.
          </p>

          {accesos.length === 0 && <p className="cdl-miembros-vacio">Este curso todavía no tiene accesos directos.</p>}

          {accesos.map((a, i) => (
            <div className="cdl-acceso-fila" key={i}>
              <input
                type="text"
                placeholder="Nombre (ej. Sala de clase)"
                aria-label={`Nombre del acceso ${i + 1}`}
                maxLength={40}
                value={a.label}
                onChange={e => cambiar(i, 'label', e.target.value)}
              />
              <input
                type="url"
                inputMode="url"
                placeholder="https://…"
                aria-label={`Enlace del acceso ${i + 1}`}
                maxLength={500}
                value={a.url}
                onChange={e => cambiar(i, 'url', e.target.value)}
              />
              <button
                type="button"
                className="cdl-icon-btn"
                title="Quitar acceso"
                aria-label={`Quitar el acceso ${a.label || i + 1}`}
                onClick={() => setAccesos(lista => lista.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}

          {accesos.length < MAX_ACCESOS ? (
            <button
              type="button"
              className="ccv-btn-secondary cdl-editbar-btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setAccesos(lista => [...lista, { label: '', url: '' }])}
            >
              <Plus size={14} /> Agregar acceso
            </button>
          ) : (
            <p className="ccv-form-hint">Máximo {MAX_ACCESOS} accesos directos por curso.</p>
          )}

          {error && <p className="ccv-form-error" role="alert">{error}</p>}
        </div>

        <div className="ccv-modal-actions">
          <button type="button" className="ccv-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="ccv-btn-primary" onClick={handleGuardar} disabled={saving}>
            {saving ? <Loader2 size={14} className="dfm-spin" /> : null} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
