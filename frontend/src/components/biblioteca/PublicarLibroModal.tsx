import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { descargarArchivo, publicarEnBiblioteca, subirArchivo, type PublicarPayload } from '../../data/almacenamientoApi';
import { subirPortadaArticulo, type Articulo } from '../../data/articulosApi';
import { TYPE_STYLE } from './BookCard';
import PortadaLibroPicker, { type OrigenPortada, type PortadaLibro } from './PortadaLibroPicker';
import { IDIOMAS, type IdiomaDocumento } from './idiomas';

/** Qué se publica: un PDF recién elegido (se sube primero) o uno que ya está en el almacenamiento. */
export type FuentePdf =
  | { tipo: 'archivo'; file: File }
  | { tipo: 'documento'; id: string; nombre: string };

interface Props {
  fuente: FuentePdf;
  onClose: () => void;
  onPublicado: (articulo: Articulo) => void;
  /** Texto bajo el título del cuadro. Por defecto avisa que queda en revisión;
   * lo que publica un administrador queda aprobado de una vez. */
  aviso?: string;
}

const TIPOS: { id: NonNullable<PublicarPayload['tipo']>; label: string }[] = [
  { id: 'LIBRO', label: 'Libro' },
  { id: 'GUIA', label: 'Guía clínica' },
  { id: 'ENSAYO', label: 'Ensayo' },
  { id: 'PROTOCOLO', label: 'Protocolo' },
  { id: 'CASO', label: 'Caso clínico' },
];

/** Cuadro único para publicar un PDF en la biblioteca, desde la biblioteca o desde
 * el Dashboard: datos del recurso, tipo y portada (imagen propia o primera página). */
export default function PublicarLibroModal({ fuente, onClose, onPublicado, aviso }: Props) {
  const nombre = fuente.tipo === 'archivo' ? fuente.file.name : fuente.nombre;
  const [titulo, setTitulo] = useState(nombre.replace(/\.pdf$/i, ''));
  const [idioma, setIdioma] = useState<IdiomaDocumento>('es');
  const [tipo, setTipo] = useState<NonNullable<PublicarPayload['tipo']>>('GUIA');
  const [autores, setAutores] = useState('');
  const [ano, setAno] = useState('');
  const [paginas, setPaginas] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [origenPortada, setOrigenPortada] = useState<OrigenPortada>('pdf');
  const [portada, setPortada] = useState<PortadaLibro | null>(null);
  const [pdf, setPdf] = useState<File | string | null>(fuente.tipo === 'archivo' ? fuente.file : null);
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guardando = paso !== null;

  // Un PDF que ya está en el almacenamiento se lee con un enlace temporal.
  useEffect(() => {
    if (fuente.tipo !== 'documento') return;
    let vigente = true;
    descargarArchivo(fuente.id)
      .then(({ url }) => { if (vigente) setPdf(url); })
      .catch(() => { if (vigente) setOrigenPortada('imagen'); });
    return () => { vigente = false; };
  }, [fuente]);

  async function handlePublicar() {
    if (!titulo.trim()) {
      setError('Ponle un título al recurso.');
      return;
    }
    if (origenPortada !== 'ninguna' && !portada) {
      setError(origenPortada === 'pdf' ? 'Espera a que se lea la primera página del PDF.' : 'Elige la imagen de la portada, o marca «Sin portada».');
      return;
    }
    setError(null);
    try {
      let archivoId = fuente.tipo === 'documento' ? fuente.id : '';
      if (fuente.tipo === 'archivo') {
        setPaso('Subiendo el PDF… 0 %');
        const subido = await subirArchivo(fuente.file, null, f => setPaso(`Subiendo el PDF… ${Math.round(f * 100)} %`));
        archivoId = subido.id;
      }
      setPaso('Publicando…');
      const { article } = await publicarEnBiblioteca(archivoId, {
        titulo: titulo.trim(),
        tipo,
        idioma,
        autores: autores.trim() || undefined,
        ano: ano ? parseInt(ano, 10) : undefined,
        paginas: paginas ? parseInt(paginas, 10) : undefined,
        descripcion: descripcion.trim() || undefined,
      });
      let publicado = article as Articulo;
      if (portada && origenPortada !== 'ninguna') {
        setPaso('Guardando la portada…');
        try {
          publicado = await subirPortadaArticulo(publicado.id, portada);
        } catch (err) {
          // El libro ya quedó publicado: se avisa y se puede poner la portada después.
          onPublicado(publicado);
          setError(`El libro se publicó, pero la portada no se pudo guardar: ${err instanceof Error ? err.message : 'error desconocido'}.`);
          setPaso(null);
          return;
        }
      }
      onPublicado(publicado);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar en la biblioteca.');
      setPaso(null);
    }
  }

  return (
    <motion.div className="dfm-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={guardando ? undefined : onClose}>
      <motion.div
        className="dfm-modal plb-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Publicar en la biblioteca"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="dfm-header">
          <span>Publicar en la biblioteca</span>
          <button type="button" className="dfm-close-btn" onClick={onClose} disabled={guardando}><X size={16} /></button>
        </div>

        <p className="dfm-label" style={{ fontWeight: 400, marginTop: 4 }}>
          Se publicará <strong>{nombre}</strong>. {aviso ?? 'Quedará en revisión hasta que un administrador lo apruebe.'}
        </p>

        <label className="dfm-label">Título del recurso *</label>
        <input type="text" className="dfm-input" value={titulo} maxLength={255} autoFocus disabled={guardando}
          onChange={e => { setTitulo(e.target.value); setError(null); }} placeholder="Nombre del recurso en la biblioteca" />

        <label className="dfm-label">Idioma del documento</label>
        <div className="plb-tipos" role="radiogroup" aria-label="Idioma del documento">
          {IDIOMAS.map(i => (
            <button key={i.id} type="button" role="radio" aria-checked={idioma === i.id} disabled={guardando}
              className={idioma === i.id ? 'is-active' : ''} style={{ ['--plb-tipo' as string]: '#0284C7' }}
              onClick={() => setIdioma(i.id)}>
              <span className="plb-idioma-codigo">{i.corto}</span> {i.label}
            </button>
          ))}
        </div>

        <label className="dfm-label">Tipo de recurso</label>
        <div className="plb-tipos" role="radiogroup" aria-label="Tipo de recurso">
          {TIPOS.map(t => (
            <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} disabled={guardando}
              className={tipo === t.id ? 'is-active' : ''} style={{ ['--plb-tipo' as string]: TYPE_STYLE[t.id].color }}
              onClick={() => setTipo(t.id)}>
              <span className="plb-tipo-punto" /> {t.label}
            </button>
          ))}
        </div>

        <label className="dfm-label">Portada</label>
        <PortadaLibroPicker
          pdf={pdf}
          colorLomo={TYPE_STYLE[tipo].color}
          titulo={titulo}
          origen={origenPortada}
          onOrigenChange={setOrigenPortada}
          value={portada}
          onChange={setPortada}
          disabled={guardando}
        />

        <div className="plb-grilla">
          <div>
            <label className="dfm-label">Autores (opcional)</label>
            <input type="text" className="dfm-input" value={autores} maxLength={500} disabled={guardando}
              onChange={e => setAutores(e.target.value)} placeholder="Ej. Dr. Martínez, Dra. Gómez" />
          </div>
          <div>
            <label className="dfm-label">Año</label>
            <input type="number" className="dfm-input" value={ano} min={1800} max={2100} disabled={guardando}
              onChange={e => setAno(e.target.value)} placeholder="2024" />
          </div>
          <div>
            <label className="dfm-label">Páginas</label>
            <input type="number" className="dfm-input" value={paginas} min={1} max={10000} disabled={guardando}
              onChange={e => setPaginas(e.target.value)} placeholder="45" />
          </div>
        </div>

        <label className="dfm-label">Descripción o resumen (opcional)</label>
        <textarea className="dfm-input" style={{ minHeight: 60, resize: 'vertical' }} value={descripcion} maxLength={2000}
          disabled={guardando} onChange={e => setDescripcion(e.target.value)} placeholder="Breve resumen del recurso…" />

        {error && <p className="dfm-error" role="alert">{error}</p>}

        <button type="button" className="dfm-save-btn" style={{ marginTop: 14 }} onClick={handlePublicar} disabled={guardando}>
          {paso ?? 'Publicar'}
        </button>
      </motion.div>
    </motion.div>
  );
}
