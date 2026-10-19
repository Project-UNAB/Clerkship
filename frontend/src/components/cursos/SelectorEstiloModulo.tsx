import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { COLORES_MODULO, ICONOS_MODULO, colorDeModulo } from './estiloModulo';

interface Props {
  icon?: string | null;
  color?: string | null;
  onChange: (estilo: { icon?: string; color?: string }) => void;
  disabled?: boolean;
}

/** Icono y color de la tarjeta de un módulo: se usa al crearlo y al editarlo. */
export default function SelectorEstiloModulo({ icon, color, onChange, disabled }: Props) {
  const iconoElegido = icon ?? ICONOS_MODULO[0].clave;
  const colorElegido = color ?? COLORES_MODULO[0].clave;

  return (
    // El color elegido tiñe el icono seleccionado, también fuera de una tarjeta (al crear el módulo).
    <div className="cdl-mod-estilo" style={{ '--mod-c': colorDeModulo(color) } as CSSProperties}>
      <div>
        <p className="cdl-mod-estilo-titulo">Icono de la tarjeta</p>
        <div className="cdl-mod-iconos" role="radiogroup" aria-label="Icono de la tarjeta">
          {ICONOS_MODULO.map(({ clave, nombre, Icono }) => (
            <button
              key={clave}
              type="button"
              role="radio"
              aria-checked={iconoElegido === clave}
              aria-label={nombre}
              title={nombre}
              disabled={disabled}
              className={`cdl-mod-icono-op ${iconoElegido === clave ? 'is-active' : ''}`}
              onClick={() => onChange({ icon: clave })}
            >
              <Icono size={18} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="cdl-mod-estilo-titulo">Color de la tarjeta</p>
        <div className="cdl-mod-colores" role="radiogroup" aria-label="Color de la tarjeta">
          {COLORES_MODULO.map(({ clave, nombre, hex }) => (
            <button
              key={clave}
              type="button"
              role="radio"
              aria-checked={colorElegido === clave}
              aria-label={nombre}
              title={nombre}
              disabled={disabled}
              className={`cdl-mod-color-op ${colorElegido === clave ? 'is-active' : ''}`}
              style={{ background: hex }}
              onClick={() => onChange({ color: clave })}
            >
              {colorElegido === clave && <Check size={14} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
