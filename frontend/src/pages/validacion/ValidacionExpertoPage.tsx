import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { enviarValidacion, type DatosExperto } from '../../data/validacionApi';
import { FORMULARIOS_VALIDACION, type PestanaValidacion } from '../../data/validacionForms';
import '../../styles/validacion.css';

const PESTANAS_VALIDAS = Object.keys(FORMULARIOS_VALIDACION) as PestanaValidacion[];
const ESCALA = [
  { valor: 1, texto: 'No pertinente' },
  { valor: 2, texto: 'Poco' },
  { valor: 3, texto: 'Pertinente' },
  { valor: 4, texto: 'Totalmente' },
];

const EXPERTO_VACIO: DatosExperto = {
  nombre_experto: '',
  id_experto: '',
  profesion: '',
  anos_experiencia: 0,
  especialidad: '',
};

/** Formulario público de validación por expertos, una página por pestaña. */
export default function ValidacionExpertoPage() {
  const { pestana } = useParams<{ pestana: string }>();
  const valida = PESTANAS_VALIDAS.includes(pestana as PestanaValidacion);
  const formulario = valida ? FORMULARIOS_VALIDACION[pestana as PestanaValidacion] : null;

  const [experto, setExperto] = useState<DatosExperto>(EXPERTO_VACIO);
  const [anosTexto, setAnosTexto] = useState('');
  const [calificaciones, setCalificaciones] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!valida || !formulario) {
    return (
      <div className="vx-page">
        <div className="vx-card">
          <h1 className="vx-title">Formulario no encontrado</h1>
          <p className="vx-desc">La validación que buscas no existe.</p>
        </div>
      </div>
    );
  }

  const total = formulario.items.length;
  const respondidas = formulario.items.filter(i => calificaciones[i.key] !== undefined).length;
  const anos = Number(anosTexto);
  const datosValidos =
    experto.nombre_experto.trim().length >= 2 &&
    experto.id_experto.trim().length >= 2 &&
    experto.profesion.trim().length >= 2 &&
    anosTexto !== '' && Number.isInteger(anos) && anos >= 0 && anos <= 80;
  const completo = datosValidos && respondidas === total;

  function elegir(key: string, valor: number) {
    setCalificaciones(prev => ({ ...prev, [key]: valor }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!completo) return;
    setEnviando(true);
    setError(null);
    try {
      await enviarValidacion(pestana as PestanaValidacion, { ...experto, anos_experiencia: anos }, calificaciones, comentario);
      setEnviado(true);
    } catch {
      setError('No se pudo enviar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="vx-page">
        <div className="vx-card vx-done">
          <CheckCircle size={44} />
          <h1 className="vx-title">Gracias por su validación</h1>
          <p className="vx-desc">Su respuesta quedó registrada.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vx-page">
      <form className="vx-card" onSubmit={handleSubmit} noValidate>
        <header className="vx-head">
          <span className="vx-kicker">Validación por expertos</span>
          <h1 className="vx-title">{formulario.titulo}</h1>
          <p className="vx-desc">{formulario.descripcion}</p>
          <p className="vx-escala">Escala: 1 = no pertinente o no claro · 4 = totalmente pertinente o claro</p>
        </header>

        <section className="vx-section">
          <h2 className="vx-section-title">Datos del experto</h2>
          <div className="vx-datos">
            <label className="vx-field">
              <span>Nombre completo *</span>
              <input className="vx-input" value={experto.nombre_experto} onChange={e => setExperto({ ...experto, nombre_experto: e.target.value })} />
            </label>
            <label className="vx-field">
              <span>Documento o registro profesional *</span>
              <input className="vx-input" value={experto.id_experto} onChange={e => setExperto({ ...experto, id_experto: e.target.value })} />
            </label>
            <label className="vx-field">
              <span>Profesión *</span>
              <input className="vx-input" value={experto.profesion} onChange={e => setExperto({ ...experto, profesion: e.target.value })} />
            </label>
            <label className="vx-field">
              <span>Años de experiencia *</span>
              <input className="vx-input" inputMode="numeric" value={anosTexto} onChange={e => setAnosTexto(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </label>
            <label className="vx-field vx-field-full">
              <span>Especialidad (opcional)</span>
              <input className="vx-input" value={experto.especialidad} onChange={e => setExperto({ ...experto, especialidad: e.target.value })} />
            </label>
          </div>
        </section>

        <section className="vx-section">
          <div className="vx-progress">
            <div className="vx-progress-bar" style={{ width: `${Math.round((respondidas / total) * 100)}%` }} />
            <span>{respondidas} de {total} ítems valorados</span>
          </div>

          <ol className="vx-items">
            {formulario.items.map((item, i) => (
              <li key={item.key} className="vx-item">
                <p className="vx-item-label"><span className="vx-num">{i + 1}</span>{item.label}</p>
                <div className="vx-scale" role="radiogroup" aria-label={item.label}>
                  {ESCALA.map(op => (
                    <button
                      key={op.valor}
                      type="button"
                      role="radio"
                      aria-checked={calificaciones[item.key] === op.valor}
                      className={`vx-score ${calificaciones[item.key] === op.valor ? 'is-selected' : ''}`}
                      onClick={() => elegir(item.key, op.valor)}
                    >
                      <strong>{op.valor}</strong>
                      <span>{op.texto}</span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="vx-section">
          <label className="vx-label" htmlFor="vx-comentario">Observaciones y sugerencias (opcional)</label>
          <textarea
            id="vx-comentario"
            className="vx-textarea"
            rows={6}
            maxLength={2000}
            value={comentario}
            onChange={e => setComentario(e.target.value)}
          />
          <span className="vx-counter">{comentario.length} / 2000</span>
        </section>

        {error && <div className="vx-error"><AlertCircle size={16} />{error}</div>}

        <div className="vx-actions">
          {!datosValidos && <span className="vx-hint">Complete sus datos de experto para continuar.</span>}
          <button type="submit" className="vx-submit" disabled={!completo || enviando}>
            {enviando ? 'Enviando…' : 'Enviar validación'}
          </button>
        </div>
      </form>
    </div>
  );
}
