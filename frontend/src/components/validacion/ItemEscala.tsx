import { memo, useState, type KeyboardEvent as KeyboardEventReact } from 'react';
import { Check, MessageSquarePlus } from 'lucide-react';
import { ESCALA_VALIDACION } from '../../data/validacionForms';

interface Props {
  numero: number;
  item: { key: string; label: string };
  valor: number | undefined;
  observacion: string;
  soloLectura: boolean;
  onElegir: (key: string, valor: number, desdeTeclado: boolean) => void;
  onObservar: (key: string, texto: string) => void;
}

/** Un ítem del juicio de expertos: enunciado, escala 1 a 4 y observación opcional
 *  (se sugiere si califica 1 o 2). Con el teclado se responde del 1 al 4.
 *  Usa los estilos del portal del experto (validacionPortal.css). */
const ItemEscala = memo(function ItemEscala({ numero, item, valor, observacion, soloLectura, onElegir, onObservar }: Props) {
  const [abierta, setAbierta] = useState(Boolean(observacion));
  const sugerir = valor !== undefined && valor <= 2 && !soloLectura;
  const mostrar = abierta || sugerir || Boolean(observacion);
  const alTeclear = (e: KeyboardEventReact<HTMLFieldSetElement>) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA' || soloLectura) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 4) { e.preventDefault(); onElegir(item.key, n, true); }
  };
  return (
    <fieldset className={`vp-item${valor ? ' is-respondido' : ''}${soloLectura ? ' is-bloqueado' : ''}`} data-item={item.key} tabIndex={-1} onKeyDown={alTeclear}>
      <legend className="vp-item-enunciado">
        <span className="vp-item-num">{valor ? <Check size={13} strokeWidth={3} /> : numero}</span>
        <span>{item.label}</span>
      </legend>
      <div className="vp-escala" role="radiogroup" aria-label={item.label}>
        {ESCALA_VALIDACION.map(op => (
          <button key={op.valor} type="button" role="radio" aria-checked={valor === op.valor} disabled={soloLectura}
            className={`vp-opcion vp-n${op.valor}${valor === op.valor ? ' is-elegida' : ''}`}
            onClick={() => onElegir(item.key, op.valor, false)} title={op.ayuda}>
            <span className="vp-opcion-num">{op.valor}</span>
            <span className="vp-opcion-txt">{op.texto}</span>
            <span className="vp-opcion-ayuda">{op.ayuda}</span>
          </button>
        ))}
      </div>
      {mostrar ? (
        <div className="vp-obs">
          <label htmlFor={`obs-${item.key}`}>
            {sugerir ? '¿Qué cambiarías? Tu observación ayuda a corregirlo.' : 'Observación'} <span>(opcional)</span>
          </label>
          <textarea id={`obs-${item.key}`} rows={2} maxLength={2000} value={observacion} readOnly={soloLectura}
            placeholder="Escribe aquí tu sugerencia o lo que observaste."
            onChange={e => onObservar(item.key, e.target.value)} />
        </div>
      ) : !soloLectura && (
        <button type="button" className="vp-obs-abrir" onClick={() => setAbierta(true)}>
          <MessageSquarePlus size={14} /> Agregar observación
        </button>
      )}
    </fieldset>
  );
});

export default ItemEscala;
