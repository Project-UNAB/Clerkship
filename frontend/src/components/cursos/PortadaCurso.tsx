import { useEffect, useState } from 'react';
import { gradienteDeCurso, inicialesDeCurso } from '../../utils/portada';

interface Props {
  /** Id del curso: de ahí sale el color cuando no hay imagen. */
  id: string;
  name: string;
  /** URL de la portada (o de su miniatura); null/undefined = sin portada. */
  url?: string | null;
  className?: string;
}

/** La portada de un curso: su imagen, o un gradiente con las iniciales del
 * nombre si no tiene (o si la imagen no carga, p. ej. un enlace ya vencido). */
export default function PortadaCurso({ id, name, url, className = '' }: Props) {
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    setFallo(false);
  }, [url]);

  if (url && !fallo) {
    return (
      <img
        src={url}
        alt={`Portada de ${name}`}
        className={`cur-portada-img ${className}`}
        loading="lazy"
        onError={() => setFallo(true)}
      />
    );
  }

  return (
    <div
      className={`cur-portada-fallback ${className}`}
      style={{ background: gradienteDeCurso(id) }}
      role="img"
      aria-label={`Portada de ${name}`}
    >
      <span aria-hidden="true">{inicialesDeCurso(name)}</span>
    </div>
  );
}
