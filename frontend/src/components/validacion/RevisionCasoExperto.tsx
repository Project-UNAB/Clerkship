import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Lock, Target } from 'lucide-react';
import { ApiError } from '../../data/apiClient';
import {
  enviarRevisionCaso, guardarRevisionCaso, obtenerCasoExperto,
  type CasoAsignado, type InvitacionExperto, type RevisionCaso, type VistaCaso,
} from '../../data/validacionApi';
import { CRITERIOS_CASO, GRUPOS_CRITERIO } from '../../data/revisionCasosForms';
import ItemEscala from './ItemEscala';
import VistaCasoClinico from './VistaCasoClinico';

export type EstadoGuardadoCaso = 'guardado' | 'guardando' | 'pendiente' | 'error';

interface Props {
  token: string;
  asignado: CasoAsignado;
  numero: number;
  total: number;
  soloLectura: boolean;
  onGuardado: (estado: EstadoGuardadoCaso) => void;
  onCambio: (revision: RevisionCaso) => void;
  onEnviado: (inv: InvitacionExperto) => void;
  onAnterior: () => void;
  onSiguiente: () => void;
}

const ESPERA = 700;

/** Revisión de un caso asignado: el experto estudia el caso, da su puntaje a
 *  ciegas, después ve la evaluación automática y califica los criterios. */
export default function RevisionCasoExperto({ token, asignado, numero, total, soloLectura, onGuardado, onCambio, onEnviado, onAnterior, onSiguiente }: Props) {
  const [caso, setCaso] = useState<VistaCaso | null>(null);
  const [revision, setRevision] = useState<RevisionCaso | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const [observaciones, setObservaciones] = useState<Record<string, string>>({});
  const [puntaje, setPuntaje] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const pendiente = useRef<{ respuestas: Record<string, number>; observaciones: Record<string, string> }>({ respuestas: {}, observaciones: {} });
  const temporizador = useRef<number | undefined>(undefined);
  const contenedor = useRef<HTMLDivElement>(null);
  // Los avisos al padre van por ref: así el autoguardado no depende de que el padre memorice sus funciones.
  const avisos = useRef({ onGuardado, onCambio });
  avisos.current = { onGuardado, onCambio };

  const cargar = useCallback(async () => {
    const r = await obtenerCasoExperto(token, asignado.id);
    setCaso(r.caso);
    setRevision(r.revision);
    setRespuestas(r.revision.respuestas);
    setObservaciones(r.revision.observaciones);
    setPuntaje(r.revision.puntaje_experto == null ? '' : String(r.revision.puntaje_experto));
  }, [token, asignado.id]);

  useEffect(() => {
    setCaso(null);
    cargar().catch(() => setError('No se pudo cargar el caso. Revisa tu conexión y recarga la página.'));
  }, [cargar]);

  const guardar = useCallback(async () => {
    window.clearTimeout(temporizador.current);
    const cambios = pendiente.current;
    if (!Object.keys(cambios.respuestas).length && !Object.keys(cambios.observaciones).length) return;
    pendiente.current = { respuestas: {}, observaciones: {} };
    avisos.current.onGuardado('guardando');
    try {
      const r = await guardarRevisionCaso(token, asignado.id, cambios);
      setRevision(r.revision);
      avisos.current.onCambio(r.revision);
      avisos.current.onGuardado(Object.keys(pendiente.current.respuestas).length || Object.keys(pendiente.current.observaciones).length ? 'pendiente' : 'guardado');
    } catch {
      pendiente.current = {
        respuestas: { ...cambios.respuestas, ...pendiente.current.respuestas },
        observaciones: { ...cambios.observaciones, ...pendiente.current.observaciones },
      };
      avisos.current.onGuardado('error');
      temporizador.current = window.setTimeout(() => { void guardar(); }, 4000);
    }
  }, [token, asignado.id]);

  const programar = useCallback(() => {
    avisos.current.onGuardado('pendiente');
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => { void guardar(); }, ESPERA);
  }, [guardar]);

  useEffect(() => () => { window.clearTimeout(temporizador.current); void guardar(); }, [guardar]);

  const revelada = revision?.puntaje_experto != null;

  const irA = (key: string | undefined) => {
    if (!key) return;
    const el = contenedor.current?.querySelector<HTMLElement>(`[data-item="${key}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  };

  const onElegir = useCallback((key: string, valor: number, desdeTeclado: boolean) => {
    setRespuestas(prev => {
      const sig = { ...prev, [key]: valor };
      if (desdeTeclado) {
        const disponibles = CRITERIOS_CASO.filter(c => c.grupo === 'caso' || revelada);
        const i = disponibles.findIndex(c => c.key === key);
        const siguiente = [...disponibles.slice(i + 1), ...disponibles.slice(0, i)].find(c => sig[c.key] === undefined) ?? disponibles[i + 1];
        window.setTimeout(() => irA(siguiente?.key), 0);
      }
      return sig;
    });
    pendiente.current.respuestas = { ...pendiente.current.respuestas, [key]: valor };
    programar();
  }, [programar, revelada]);

  const onObservar = useCallback((key: string, texto: string) => {
    setObservaciones(prev => ({ ...prev, [key]: texto }));
    pendiente.current.observaciones = { ...pendiente.current.observaciones, [key]: texto };
    programar();
  }, [programar]);

  async function fijarPuntaje() {
    const n = Number(puntaje);
    if (puntaje === '' || !Number.isInteger(n) || n < 0 || n > 100) { setError('Escribe un puntaje entero de 0 a 100.'); return; }
    if (!window.confirm(`¿Fijar ${n} / 100 como tu puntaje? Después verás la evaluación automática y ya no podrás cambiarlo.`)) return;
    setOcupado(true);
    setError(null);
    try {
      await guardar();
      const r = await guardarRevisionCaso(token, asignado.id, { puntaje_experto: n });
      avisos.current.onCambio(r.revision);
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar tu puntaje.');
    } finally {
      setOcupado(false);
    }
  }

  async function enviar() {
    const falta = CRITERIOS_CASO.find(c => respuestas[c.key] === undefined);
    if (!revelada) { setError('Primero fija tu puntaje del estudiante.'); contenedor.current?.querySelector('.vp-ciego')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (falta) { irA(falta.key); return; }
    setOcupado(true);
    setError(null);
    try {
      await guardar();
      onEnviado(await enviarRevisionCaso(token, asignado.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la revisión. Tus respuestas siguen guardadas.');
    } finally {
      setOcupado(false);
    }
  }

  if (!caso || !revision) {
    return (
      <section className="vp-tarjeta vp-centro">
        {error ? <><AlertCircle size={28} /><p>{error}</p></> : <><Loader2 className="vp-girando" size={28} /><p>Cargando el caso…</p></>}
      </section>
    );
  }

  const respondidos = CRITERIOS_CASO.filter(c => respuestas[c.key] !== undefined).length;
  const enviada = revision.estado === 'ENVIADA';

  return (
    <div className="vp-caso" ref={contenedor}>
      <section className="vp-tarjeta">
        <span className="vp-kicker">Caso clínico {numero} de {total}{enviada ? ' · Enviado' : ''}</span>
        <p className="vp-texto">
          Un estudiante resolvió este caso con el paciente virtual. Revisa el caso, la conversación y lo que entregó.
          Primero da <strong>tu propio puntaje</strong>; después verás la evaluación automática y calificarás los criterios.
        </p>
        <VistaCasoClinico caso={caso} />
      </section>

      <section className="vp-tarjeta">
        <h2 className="vp-subtitulo"><Target size={17} /> Tu puntaje del estudiante (a ciegas)</h2>
        <div className={`vp-ciego${revelada ? ' is-fijado' : ''}`}>
          <p>Si tú calificaras esta consulta, ¿qué puntaje de 0 a 100 le darías al estudiante?</p>
          <div className="vp-ciego-control">
            <input type="range" min={0} max={100} step={1} value={puntaje === '' ? 50 : Number(puntaje)} disabled={revelada || soloLectura}
              onChange={e => setPuntaje(e.target.value)} aria-label="Puntaje de 0 a 100" />
            <input type="text" inputMode="numeric" maxLength={3} value={puntaje} disabled={revelada || soloLectura}
              onChange={e => setPuntaje(e.target.value.replace(/\D/g, ''))} aria-label="Puntaje" placeholder="—" />
            <span>/ 100</span>
          </div>
          {revelada ? (
            <p className="vp-ciego-nota"><Lock size={13} /> Puntaje fijado. Ya puedes ver la evaluación automática en la pestaña de arriba.</p>
          ) : !soloLectura && (
            <button type="button" className="vp-boton is-principal" onClick={fijarPuntaje} disabled={ocupado || puntaje === ''}>
              Fijar mi puntaje y ver la evaluación automática
            </button>
          )}
        </div>

        {(['caso', 'evaluacion'] as const).map(grupo => (
          <div key={grupo} className="vp-grupo">
            <h2 className="vp-subtitulo">{GRUPOS_CRITERIO[grupo]}</h2>
            {grupo === 'evaluacion' && !revelada && (
              <p className="vp-ayuda">Se habilita cuando fijes tu puntaje y veas la evaluación automática.</p>
            )}
            <div className="vp-items">
              {CRITERIOS_CASO.filter(c => c.grupo === grupo).map(c => (
                <ItemEscala key={c.key} numero={CRITERIOS_CASO.indexOf(c) + 1} item={c} valor={respuestas[c.key]}
                  observacion={observaciones[c.key] ?? ''} soloLectura={soloLectura || (grupo === 'evaluacion' && !revelada)}
                  onElegir={onElegir} onObservar={onObservar} />
              ))}
            </div>
          </div>
        ))}

        <label className="vp-campo is-ancho">
          <span>Observación general del caso <small>(opcional)</small></span>
          <textarea rows={3} maxLength={2000} readOnly={soloLectura} value={observaciones._general ?? ''}
            placeholder="Qué corregirías del caso, del paciente virtual o de la evaluación."
            onChange={e => onObservar('_general', e.target.value)} />
        </label>

        {error && <div className="vp-error" role="alert"><AlertCircle size={16} />{error}</div>}

        <div className="vp-pie is-fijo">
          <button type="button" className="vp-boton" onClick={onAnterior}><ArrowLeft size={16} /> Anterior</button>
          <span className="vp-pie-estado">{respondidos} de {CRITERIOS_CASO.length} criterios · {revelada ? `tu puntaje: ${revision.puntaje_experto}` : 'sin puntaje'}</span>
          {soloLectura ? (
            <button type="button" className="vp-boton is-principal" onClick={onSiguiente}>Siguiente <ArrowRight size={16} /></button>
          ) : (
            <button type="button" className="vp-boton is-principal" onClick={enviar} disabled={ocupado}>
              {ocupado ? 'Enviando…' : enviada ? 'Guardar y seguir' : respondidos < CRITERIOS_CASO.length || !revelada ? 'Ir al pendiente' : 'Enviar revisión'}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
