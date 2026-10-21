import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, Clock, CloudOff, Loader2,
  Printer, Stethoscope, UserRound,
} from 'lucide-react';
import { ApiError } from '../../data/apiClient';
import {
  enviarSeccionExperto, finalizarValidacion, guardarPerfilExperto, guardarSeccionExperto, obtenerInvitacion,
  type InvitacionExperto, type PerfilExperto, type RevisionCaso,
} from '../../data/validacionApi';
import { CRITERIOS_CASO } from '../../data/revisionCasosForms';
import ItemEscala from '../../components/validacion/ItemEscala';
import RevisionCasoExperto from '../../components/validacion/RevisionCasoExperto';
import {
  APLICABILIDAD, ESCALA_VALIDACION, FORMULARIOS_VALIDACION, NOMBRES_SECCION,
  type Aplicabilidad, type PestanaValidacion,
} from '../../data/validacionForms';
import logoUrl from '../../assets/Logo Clerkship.svg';
import '../../styles/validacionPortal.css';

type Paso = 'datos' | PestanaValidacion | `caso:${string}` | 'final' | 'listo';
type EstadoGuardado = 'guardado' | 'guardando' | 'pendiente' | 'error';
type Respuestas = Partial<Record<PestanaValidacion, Record<string, number>>>;
type Observaciones = Partial<Record<PestanaValidacion, Record<string, string>>>;

interface Perfil {
  nombre: string;
  profesion: string;
  especialidad: string;
  institucion: string;
  registro_profesional: string;
  anos_experiencia: string;
}

const ESPERA_AUTOGUARDADO = 700;
const REINTENTO = 4000;

/** «Dra. Ana Ruiz» → «Dra. Ana»; «Ana Ruiz» → «Ana». */
function saludo(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const titulo = /^(dr|dra|doctor|doctora|prof|profa|lic|enf|mg|md)\.?$/i;
  return partes.length > 1 && titulo.test(partes[0]) ? `${partes[0]} ${partes[1]}` : partes[0] ?? '';
}

/** Primer paso sin terminar: una sección sin enviar o un caso sin revisar. */
function primerPendiente(inv: InvitacionExperto, saltar?: string): Paso | undefined {
  const s = inv.secciones.find(x => x !== saltar && !inv.enviadas[x]);
  if (s) return s;
  const c = inv.casos.find(x => `caso:${x.id}` !== saltar && x.estado !== 'ENVIADA');
  return c ? `caso:${c.id}` : undefined;
}

const anosValidos = (t: string) => t !== '' && /^\d{1,2}$/.test(t) && Number(t) <= 80;

function perfilCompleto(p: Perfil) {
  return p.registro_profesional.trim().length >= 2 && p.profesion.trim().length >= 2 && anosValidos(p.anos_experiencia);
}

/** Solo lo que el servidor acepta: ID y profesión con 2 letras o más (no se vacían);
 *  el nombre es opcional y vacío lo borra; el resto, vacío como nulo. */
function perfilParaGuardar(p: Partial<Perfil>): PerfilExperto {
  const out: PerfilExperto = {};
  for (const [campo, valor] of Object.entries(p) as [keyof Perfil, string][]) {
    const t = valor.trim();
    if (campo === 'registro_profesional' || campo === 'profesion') { if (t.length >= 2) out[campo] = t; }
    else if (campo === 'nombre') { if (t.length !== 1) out.nombre = t; }
    else if (campo === 'anos_experiencia') out.anos_experiencia = anosValidos(t) ? Number(t) : null;
    else out[campo] = t || null;
  }
  return out;
}

/** Portal del profesional de la salud invitado a validar la plataforma. Entra con
 * su enlace personal (sin cuenta); todo lo que responde se guarda solo. */
export default function PortalExpertoPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [cargando, setCargando] = useState(true);
  const [invalido, setInvalido] = useState<string | null>(null);
  const [servidor, setServidor] = useState<InvitacionExperto | null>(null);
  const [paso, setPaso] = useState<Paso>('datos');
  const [perfil, setPerfil] = useState<Perfil>({ nombre: '', profesion: '', especialidad: '', institucion: '', registro_profesional: '', anos_experiencia: '' });
  const [consentimiento, setConsentimiento] = useState(false);
  const [respuestas, setRespuestas] = useState<Respuestas>({});
  const [observaciones, setObservaciones] = useState<Observaciones>({});
  const [aplicabilidad, setAplicabilidad] = useState<Aplicabilidad | null>(null);
  const [comentarioFinal, setComentarioFinal] = useState('');
  const [guardado, setGuardado] = useState<EstadoGuardado>('guardado');
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [intentoDatos, setIntentoDatos] = useState(false);

  // Cambios aún sin enviar al servidor; se juntan y se mandan cada ESPERA_AUTOGUARDADO.
  const pendientePerfil = useRef<PerfilExperto>({});
  const pendienteSecciones = useRef<Partial<Record<PestanaValidacion, { respuestas: Record<string, number>; observaciones: Record<string, string> }>>>({});
  const temporizador = useRef<number | undefined>(undefined);
  const enVuelo = useRef<Promise<void> | null>(null);
  const contenidoRef = useRef<HTMLDivElement>(null);

  const soloLectura = servidor?.estado === 'COMPLETADA';

  // ── Carga inicial ──
  useEffect(() => {
    let vigente = true;
    obtenerInvitacion(token)
      .then(inv => {
        if (!vigente) return;
        setServidor(inv);
        const e = inv.experto;
        const p: Perfil = {
          nombre: e.nombre ?? '', profesion: e.profesion ?? '', especialidad: e.especialidad ?? '',
          institucion: e.institucion ?? '', registro_profesional: e.registro_profesional ?? '',
          anos_experiencia: e.anos_experiencia == null ? '' : String(e.anos_experiencia),
        };
        setPerfil(p);
        setConsentimiento(inv.consentimiento);
        setRespuestas(inv.respuestas ?? {});
        setObservaciones(inv.observaciones ?? {});
        setAplicabilidad(inv.aplicabilidad);
        setComentarioFinal(inv.comentario_final ?? '');
        if (inv.estado === 'COMPLETADA') setPaso('listo');
        else if (!inv.consentimiento || !perfilCompleto(p)) setPaso('datos');
        else setPaso(primerPendiente(inv) ?? 'final');
      })
      .catch(err => {
        if (!vigente) return;
        setInvalido(err instanceof ApiError && err.status === 404
          ? 'Este enlace no es válido o fue desactivado. Pide uno nuevo a quien te invitó.'
          : 'No pudimos cargar tu evaluación. Revisa tu conexión y recarga la página.');
      })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [token]);

  // ── Autoguardado ──
  const guardarAhora = useCallback(async (): Promise<void> => {
    window.clearTimeout(temporizador.current);
    if (enVuelo.current) await enVuelo.current;
    const perfilPend = pendientePerfil.current;
    const seccionesPend = pendienteSecciones.current;
    if (!Object.keys(perfilPend).length && !Object.keys(seccionesPend).length) return;
    pendientePerfil.current = {};
    pendienteSecciones.current = {};
    setGuardado('guardando');
    const tarea = (async () => {
      try {
        let ultima: InvitacionExperto | null = null;
        if (Object.keys(perfilPend).length) ultima = await guardarPerfilExperto(token, perfilPend);
        for (const [s, cambios] of Object.entries(seccionesPend) as [PestanaValidacion, { respuestas: Record<string, number>; observaciones: Record<string, string> }][]) {
          ultima = await guardarSeccionExperto(token, s, cambios.respuestas, cambios.observaciones);
        }
        if (ultima) setServidor(ultima);
        setGuardadoEn(new Date());
        setGuardado(Object.keys(pendientePerfil.current).length || Object.keys(pendienteSecciones.current).length ? 'pendiente' : 'guardado');
      } catch (err) {
        // Se devuelven a la cola (sin pisar lo que se haya escrito después) y se reintenta.
        pendientePerfil.current = { ...perfilPend, ...pendientePerfil.current };
        for (const [s, c] of Object.entries(seccionesPend) as [PestanaValidacion, { respuestas: Record<string, number>; observaciones: Record<string, string> }][]) {
          const nuevo = pendienteSecciones.current[s];
          pendienteSecciones.current[s] = {
            respuestas: { ...c.respuestas, ...(nuevo?.respuestas ?? {}) },
            observaciones: { ...c.observaciones, ...(nuevo?.observaciones ?? {}) },
          };
        }
        if (err instanceof ApiError && err.status === 409) {
          setError('Esta evaluación ya fue finalizada. Recarga la página para ver tus respuestas.');
          setGuardado('error');
          return;
        }
        setGuardado('error');
        temporizador.current = window.setTimeout(() => { void guardarAhora(); }, REINTENTO);
      }
    })();
    enVuelo.current = tarea;
    await tarea;
    enVuelo.current = null;
  }, [token]);

  const programar = useCallback(() => {
    setGuardado(g => (g === 'error' ? g : 'pendiente'));
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => { void guardarAhora(); }, ESPERA_AUTOGUARDADO);
  }, [guardarAhora]);

  // Si cierra la pestaña con algo sin guardar, se le avisa.
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (guardado !== 'guardado') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [guardado]);

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const cambiarPerfil = (campo: keyof Perfil, valor: string) => {
    setPerfil(p => ({ ...p, [campo]: valor }));
    pendientePerfil.current = { ...pendientePerfil.current, ...perfilParaGuardar({ [campo]: valor }) };
    programar();
  };

  const cambiarConsentimiento = (v: boolean) => {
    setConsentimiento(v);
    pendientePerfil.current = { ...pendientePerfil.current, consentimiento: v };
    programar();
  };

  const seccionActual = paso !== 'datos' && paso !== 'final' && paso !== 'listo' && !paso.startsWith('caso:') ? paso as PestanaValidacion : null;
  const casoActualId = paso.startsWith('caso:') ? paso.slice(5) : null;
  const formulario = seccionActual ? FORMULARIOS_VALIDACION[seccionActual] : null;

  const irAItem = useCallback((key: string | undefined) => {
    if (!key) return;
    const el = contenidoRef.current?.querySelector<HTMLElement>(`[data-item="${key}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  }, []);

  const onElegir = useCallback((key: string, valor: number, desdeTeclado: boolean) => {
    if (!seccionActual) return;
    setRespuestas(prev => {
      const propias = { ...(prev[seccionActual] ?? {}), [key]: valor };
      if (desdeTeclado) {
        const lista = FORMULARIOS_VALIDACION[seccionActual].items;
        const i = lista.findIndex(it => it.key === key);
        const siguiente = [...lista.slice(i + 1), ...lista.slice(0, i)].find(it => propias[it.key] === undefined) ?? lista[i + 1];
        window.setTimeout(() => irAItem(siguiente?.key), 0);
      }
      return { ...prev, [seccionActual]: propias };
    });
    const p = pendienteSecciones.current[seccionActual] ?? { respuestas: {}, observaciones: {} };
    pendienteSecciones.current[seccionActual] = { ...p, respuestas: { ...p.respuestas, [key]: valor } };
    programar();
  }, [seccionActual, programar, irAItem]);

  const onObservar = useCallback((key: string, texto: string) => {
    if (!seccionActual) return;
    setObservaciones(prev => ({ ...prev, [seccionActual]: { ...(prev[seccionActual] ?? {}), [key]: texto } }));
    const p = pendienteSecciones.current[seccionActual] ?? { respuestas: {}, observaciones: {} };
    pendienteSecciones.current[seccionActual] = { ...p, observaciones: { ...p.observaciones, [key]: texto } };
    programar();
  }, [seccionActual, programar]);

  const irA = (p: Paso) => {
    setError(null);
    setPaso(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const secciones = servidor?.secciones ?? [];
  const enviadas = servidor?.enviadas ?? {};
  const respondidasDe = (s: PestanaValidacion) => FORMULARIOS_VALIDACION[s].items.filter(i => respuestas[s]?.[i.key] !== undefined).length;
  const casos = servidor?.casos ?? [];
  const orden: Paso[] = ['datos', ...secciones, ...casos.map(c => `caso:${c.id}` as Paso), 'final'];
  const siguienteDe = (actual: Paso): Paso => orden[orden.indexOf(actual) + 1] ?? 'final';
  const anteriorDe = (actual: Paso): Paso => orden[orden.indexOf(actual) - 1] ?? 'datos';

  // El paso del caso avisa su autoguardado y su avance; aquí se reflejan.
  const alGuardarCaso = useCallback((estado: EstadoGuardado) => {
    setGuardado(estado);
    if (estado === 'guardado') setGuardadoEn(new Date());
  }, []);
  const alCambiarCaso = useCallback((rev: RevisionCaso) => {
    setServidor(sv => sv && {
      ...sv,
      casos: sv.casos.map(c => (c.id === rev.id ? {
        ...c, estado: rev.estado, puntaje_experto: rev.puntaje_experto,
        respondidos: CRITERIOS_CASO.filter(k => rev.respuestas[k.key] !== undefined).length,
      } : c)),
    });
  }, []);

  async function continuarDatos() {
    setIntentoDatos(true);
    if (!perfilCompleto(perfil) || !consentimiento) {
      setError(!consentimiento ? 'Para continuar, acepta el consentimiento informado.' : 'Completa tu ID, profesión y años de experiencia.');
      return;
    }
    await guardarAhora();
    irA(servidor ? primerPendiente(servidor) ?? 'final' : 'final');
  }

  async function enviarSeccion() {
    if (!seccionActual || !formulario) return;
    const faltante = formulario.items.find(i => respuestas[seccionActual]?.[i.key] === undefined);
    if (faltante) { irAItem(faltante.key); return; }
    setOcupado(true);
    setError(null);
    try {
      await guardarAhora();
      const inv = await enviarSeccionExperto(token, seccionActual);
      setServidor(inv);
      irA(primerPendiente(inv, seccionActual) ?? siguienteDe(seccionActual));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la sección. Tus respuestas siguen guardadas aquí.');
    } finally {
      setOcupado(false);
    }
  }

  async function finalizar() {
    if (!aplicabilidad) { setError('Elige tu juicio de aplicabilidad.'); return; }
    if (!window.confirm('¿Finalizar tu evaluación? Después ya no podrás cambiar las respuestas.')) return;
    setOcupado(true);
    setError(null);
    try {
      await guardarAhora();
      setServidor(await finalizarValidacion(token));
      irA('listo');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo finalizar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  const totalItems = secciones.reduce((a, s) => a + FORMULARIOS_VALIDACION[s].items.length, 0) + casos.length * CRITERIOS_CASO.length;
  const totalRespondidos = secciones.reduce((a, s) => a + respondidasDe(s), 0) + casos.reduce((a, c) => a + c.respondidos, 0);
  const casosPendientes = casos.filter(c => c.estado !== 'ENVIADA').length;

  if (cargando) {
    return <div className="vp vp-centro"><Loader2 className="vp-girando" size={30} /><p>Cargando tu evaluación…</p></div>;
  }
  if (invalido || !servidor) {
    return (
      <div className="vp vp-centro">
        <div className="vp-tarjeta vp-aviso-pagina">
          <AlertCircle size={36} />
          <h1>Enlace no disponible</h1>
          <p>{invalido}</p>
        </div>
      </div>
    );
  }

  const indicador = {
    guardado: guardadoEn ? `Guardado ${guardadoEn.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : 'Todo guardado',
    guardando: 'Guardando…',
    pendiente: 'Cambios sin guardar…',
    error: 'Sin conexión: reintentando',
  }[guardado];

  const pasos: { id: Paso; titulo: string; detalle: string; hecho: boolean }[] = [
    { id: 'datos', titulo: 'Tus datos', detalle: consentimiento && perfilCompleto(perfil) ? 'Completo' : 'Pendiente', hecho: consentimiento && perfilCompleto(perfil) },
    ...secciones.map(s => ({
      id: s as Paso, titulo: NOMBRES_SECCION[s],
      detalle: enviadas[s] ? 'Enviada' : `${respondidasDe(s)} de ${FORMULARIOS_VALIDACION[s].items.length}`,
      hecho: Boolean(enviadas[s]),
    })),
    ...casos.map((c, i) => ({
      id: `caso:${c.id}` as Paso, titulo: `Caso ${i + 1}${c.subtema ? ` · ${c.subtema}` : ''}`,
      detalle: c.estado === 'ENVIADA' ? 'Revisado' : `${c.respondidos} de ${c.total}${c.puntaje_experto != null ? ' · con puntaje' : ''}`,
      hecho: c.estado === 'ENVIADA',
    })),
    { id: 'final', titulo: 'Juicio final', detalle: soloLectura ? 'Finalizado' : aplicabilidad ? 'Elegido' : 'Pendiente', hecho: soloLectura },
  ];

  return (
    <div className="vp">
      <header className="vp-barra">
        <div className="vp-marca">
          <img src={logoUrl} alt="Clerkship" className="vp-logo" />
          <strong>Clerkship</strong>
          <span className="vp-marca-sep" aria-hidden="true" />
          <span>Validación por juicio de expertos</span>
        </div>
        {!soloLectura && (
          <span className={`vp-guardado is-${guardado}`} aria-live="polite">
            {guardado === 'guardando' || guardado === 'pendiente' ? <Loader2 size={14} className="vp-girando" />
              : guardado === 'error' ? <CloudOff size={14} /> : <Check size={14} />}
            {indicador}
          </span>
        )}
      </header>

      <div className="vp-cuerpo">
        <nav className="vp-pasos" aria-label="Pasos de la evaluación">
          <div className="vp-avance">
            <div className="vp-avance-barra"><span style={{ width: `${totalItems ? (totalRespondidos / totalItems) * 100 : 0}%` }} /></div>
            <span>{totalRespondidos} de {totalItems} ítems</span>
          </div>
          <ol>
            {pasos.map((p, i) => (
              <li key={p.id}>
                <button type="button" className={`vp-paso${paso === p.id || (paso === 'listo' && p.id === 'final') ? ' is-actual' : ''}${p.hecho ? ' is-hecho' : ''}`}
                  onClick={() => (p.id === 'datos' || consentimiento || soloLectura) && irA(soloLectura && p.id === 'final' ? 'listo' : p.id)}
                  disabled={p.id !== 'datos' && !consentimiento && !soloLectura}>
                  <span className="vp-paso-num">{p.hecho ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                  <span className="vp-paso-txt"><strong>{p.titulo}</strong><small>{p.detalle}</small></span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="vp-contenido" ref={contenidoRef}>
          {error && <div className="vp-error" role="alert"><AlertCircle size={16} />{error}</div>}

          {paso === 'datos' && (
            <section className="vp-tarjeta">
              <span className="vp-kicker">Paso 1 · Tus datos</span>
              <h1 className="vp-titulo">Hola{perfil.nombre ? `, ${saludo(perfil.nombre)}` : ''}. Gracias por ayudarnos.</h1>
              <p className="vp-texto">
                Clerkship es un simulador de casos clínicos de gastroenterología con pacientes virtuales y una biblioteca
                para estudiantes de medicina. Te invitamos a evaluar, desde tu experiencia profesional, si su contenido es
                <strong> claro, pertinente y adecuado</strong> para la formación. Tu juicio se usará para calcular la
                validez de contenido (V de Aiken e índice de validez de contenido).
              </p>
              <ul className="vp-datos-rapidos">
                {secciones.length > 0 && <li><ClipboardCheck size={16} /> {secciones.length} {secciones.length === 1 ? 'sección' : 'secciones'} de la plataforma</li>}
                {casos.length > 0 && <li><Stethoscope size={16} /> {casos.length} {casos.length === 1 ? 'caso clínico' : 'casos clínicos'} por revisar</li>}
                <li><Clock size={16} /> Unos {Math.max(5, Math.round(secciones.reduce((a, s) => a + FORMULARIOS_VALIDACION[s].items.length, 0) * 0.6 + casos.length * 10))} minutos</li>
                <li><Check size={16} /> Se guarda solo: puedes salir y volver con el mismo enlace</li>
              </ul>

              <h2 className="vp-subtitulo">Escala que vas a usar</h2>
              <div className="vp-leyenda">
                {ESCALA_VALIDACION.map(e => (
                  <div key={e.valor} className={`vp-leyenda-item vp-n${e.valor}`}>
                    <strong>{e.valor} · {e.texto}</strong><span>{e.ayuda}</span>
                  </div>
                ))}
              </div>

              <h2 className="vp-subtitulo"><UserRound size={17} /> Confirma tus datos profesionales</h2>
              <div className="vp-campos">
                <label className="vp-campo">
                  <span>ID (documento o registro profesional) *</span>
                  <input value={perfil.registro_profesional} onChange={e => cambiarPerfil('registro_profesional', e.target.value)} maxLength={60}
                    placeholder="Cédula o registro médico" aria-invalid={intentoDatos && perfil.registro_profesional.trim().length < 2} />
                </label>
                <label className="vp-campo">
                  <span>Nombre y apellidos <small>(opcional)</small></span>
                  <input value={perfil.nombre} onChange={e => cambiarPerfil('nombre', e.target.value)} maxLength={120} />
                </label>
                <label className="vp-campo">
                  <span>Profesión *</span>
                  <input value={perfil.profesion} onChange={e => cambiarPerfil('profesion', e.target.value)} maxLength={120}
                    placeholder="Médico, enfermera, docente…" aria-invalid={intentoDatos && perfil.profesion.trim().length < 2} />
                </label>
                <label className="vp-campo">
                  <span>Especialidad</span>
                  <input value={perfil.especialidad} onChange={e => cambiarPerfil('especialidad', e.target.value)} maxLength={120}
                    placeholder="Gastroenterología, medicina interna…" />
                </label>
                <label className="vp-campo">
                  <span>Años de experiencia *</span>
                  <input inputMode="numeric" value={perfil.anos_experiencia} maxLength={2}
                    onChange={e => cambiarPerfil('anos_experiencia', e.target.value.replace(/\D/g, ''))}
                    aria-invalid={intentoDatos && !anosValidos(perfil.anos_experiencia)} />
                </label>
                <label className="vp-campo">
                  <span>Institución</span>
                  <input value={perfil.institucion} onChange={e => cambiarPerfil('institucion', e.target.value)} maxLength={160} />
                </label>
              </div>

              <label className={`vp-consentimiento${intentoDatos && !consentimiento ? ' is-error' : ''}`}>
                <input type="checkbox" checked={consentimiento} onChange={e => cambiarConsentimiento(e.target.checked)} />
                <span>
                  Acepto participar como experto evaluador. Entiendo que mis respuestas y mis datos profesionales se usarán
                  solo con fines académicos para validar esta plataforma, que en los informes se presentan de forma agregada
                  y que puedo retirarme en cualquier momento antes de finalizar.
                </span>
              </label>

              <div className="vp-pie">
                <span />
                <button type="button" className="vp-boton is-principal" onClick={continuarDatos}>
                  Comenzar la evaluación <ArrowRight size={16} />
                </button>
              </div>
            </section>
          )}

          {seccionActual && formulario && (
            <section className="vp-tarjeta">
              <span className="vp-kicker">Sección {secciones.indexOf(seccionActual) + 1} de {secciones.length}{enviadas[seccionActual] ? ' · Enviada' : ''}</span>
              <h1 className="vp-titulo">{NOMBRES_SECCION[seccionActual]}</h1>
              <p className="vp-texto">{formulario.descripcion}</p>
              {formulario.queRevisar && (
                <div className="vp-revisar">
                  <strong>Qué incluye esta sección</strong>
                  <ul>{formulario.queRevisar.map(t => <li key={t}>{t}</li>)}</ul>
                </div>
              )}
              <div className="vp-leyenda is-compacta" aria-hidden="true">
                {ESCALA_VALIDACION.map(e => <span key={e.valor} className={`vp-n${e.valor}`}><i />{e.valor} {e.texto}</span>)}
              </div>
              <p className="vp-ayuda">Califica cada ítem de 1 a 4. Con el teclado: enfoca un ítem y pulsa del 1 al 4.</p>

              <div className="vp-items">
                {formulario.items.map((it, i) => (
                  <ItemEscala key={`${seccionActual}-${it.key}`} numero={i + 1} item={it} soloLectura={soloLectura}
                    valor={respuestas[seccionActual]?.[it.key]} observacion={observaciones[seccionActual]?.[it.key] ?? ''}
                    onElegir={onElegir} onObservar={onObservar} />
                ))}
              </div>

              <label className="vp-campo is-ancho">
                <span>Observación general de la sección <small>(opcional)</small></span>
                <textarea rows={3} maxLength={2000} readOnly={soloLectura} value={observaciones[seccionActual]?._general ?? ''}
                  placeholder="Lo que quieras agregar sobre la sección completa: qué falta, qué sobra, qué mejorarías."
                  onChange={e => onObservar('_general', e.target.value)} />
              </label>

              <div className="vp-pie is-fijo">
                <button type="button" className="vp-boton" onClick={() => irA(anteriorDe(seccionActual))}>
                  <ArrowLeft size={16} /> Anterior
                </button>
                <span className="vp-pie-estado">
                  {respondidasDe(seccionActual)} de {formulario.items.length} calificados
                </span>
                {soloLectura ? (
                  <button type="button" className="vp-boton is-principal" onClick={() => irA(siguienteDe(seccionActual) === 'final' ? 'listo' : siguienteDe(seccionActual))}>
                    Siguiente <ArrowRight size={16} />
                  </button>
                ) : (
                  <button type="button" className="vp-boton is-principal" onClick={enviarSeccion} disabled={ocupado}>
                    {ocupado ? 'Enviando…' : enviadas[seccionActual] ? 'Guardar y seguir' : respondidasDe(seccionActual) < formulario.items.length ? 'Ir al pendiente' : 'Enviar sección'}
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </section>
          )}

          {casoActualId && (() => {
            const i = casos.findIndex(c => c.id === casoActualId);
            if (i < 0) return null;
            return (
              <RevisionCasoExperto key={casoActualId} token={token} asignado={casos[i]} numero={i + 1} total={casos.length}
                soloLectura={soloLectura} onGuardado={alGuardarCaso} onCambio={alCambiarCaso}
                onEnviado={inv => { setServidor(inv); irA(primerPendiente(inv, paso) ?? siguienteDe(paso)); }}
                onAnterior={() => irA(anteriorDe(paso))}
                onSiguiente={() => irA(siguienteDe(paso) === 'final' && soloLectura ? 'listo' : siguienteDe(paso))} />
            );
          })()}

          {paso === 'final' && (
            <section className="vp-tarjeta">
              <span className="vp-kicker">Último paso</span>
              <h1 className="vp-titulo">Juicio final de aplicabilidad</h1>
              <p className="vp-texto">Con todo lo que revisaste, ¿la plataforma puede usarse con estudiantes de medicina?</p>
              <div className="vp-aplicabilidad" role="radiogroup" aria-label="Juicio de aplicabilidad">
                {APLICABILIDAD.map(op => (
                  <button key={op.valor} type="button" role="radio" aria-checked={aplicabilidad === op.valor}
                    className={`vp-aplic is-${op.valor.toLowerCase()}${aplicabilidad === op.valor ? ' is-elegida' : ''}`}
                    onClick={() => {
                      setAplicabilidad(op.valor);
                      pendientePerfil.current = { ...pendientePerfil.current, aplicabilidad: op.valor };
                      programar();
                    }}>
                    <span className="vp-aplic-marca">{aplicabilidad === op.valor && <Check size={14} strokeWidth={3} />}</span>
                    <strong>{op.texto}</strong>
                    <span>{op.ayuda}</span>
                  </button>
                ))}
              </div>
              <label className="vp-campo is-ancho">
                <span>Comentario final <small>(opcional)</small></span>
                <textarea rows={4} maxLength={2000} value={comentarioFinal}
                  placeholder="Fortalezas, debilidades o recomendaciones generales."
                  onChange={e => {
                    setComentarioFinal(e.target.value);
                    pendientePerfil.current = { ...pendientePerfil.current, comentario_final: e.target.value.trim() || null };
                    programar();
                  }} />
              </label>

              <div className="vp-resumen">
                {secciones.map(s => (
                  <button key={s} type="button" className={`vp-resumen-fila${enviadas[s] ? ' is-hecha' : ''}`} onClick={() => irA(s)}>
                    <span>{enviadas[s] ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</span>
                    <strong>{NOMBRES_SECCION[s]}</strong>
                    <small>{enviadas[s] ? 'Enviada' : `Falta enviar · ${respondidasDe(s)} de ${FORMULARIOS_VALIDACION[s].items.length}`}</small>
                  </button>
                ))}
                {casos.map((c, i) => (
                  <button key={c.id} type="button" className={`vp-resumen-fila${c.estado === 'ENVIADA' ? ' is-hecha' : ''}`} onClick={() => irA(`caso:${c.id}`)}>
                    <span>{c.estado === 'ENVIADA' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</span>
                    <strong>Caso {i + 1}{c.subtema ? ` · ${c.subtema}` : ''}</strong>
                    <small>{c.estado === 'ENVIADA' ? 'Revisado' : `Falta enviar · ${c.respondidos} de ${c.total}`}</small>
                  </button>
                ))}
              </div>
              {servidor.faltantes.length > 0 && (
                <p className="vp-ayuda">Antes de finalizar falta: {servidor.faltantes.join('; ')}.</p>
              )}

              <div className="vp-pie">
                <button type="button" className="vp-boton" onClick={() => irA(anteriorDe('final'))}>
                  <ArrowLeft size={16} /> Anterior
                </button>
                <button type="button" className="vp-boton is-principal" onClick={finalizar}
                  disabled={ocupado || secciones.some(s => !enviadas[s]) || casosPendientes > 0}>
                  {ocupado ? 'Finalizando…' : 'Finalizar evaluación'} <Check size={16} />
                </button>
              </div>
            </section>
          )}

          {paso === 'listo' && (
            <section className="vp-tarjeta vp-listo">
              <CheckCircle2 size={52} />
              <h1 className="vp-titulo">¡Gracias, {saludo(perfil.nombre) || 'colega'}!</h1>
              <p className="vp-texto">
                Tu evaluación quedó registrada
                {servidor.completada_at && ` el ${new Date(servidor.completada_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`}.
                Tu juicio de experto es parte de la validación de contenido de Clerkship.
              </p>
              <div className="vp-constancia">
                <h2>Resumen de tus respuestas</h2>
                <p><strong>{perfil.nombre || `ID ${perfil.registro_profesional}`}</strong>{perfil.nombre && ` · ID ${perfil.registro_profesional}`} · {perfil.profesion}{perfil.especialidad && ` · ${perfil.especialidad}`}{perfil.anos_experiencia && ` · ${perfil.anos_experiencia} años de experiencia`}</p>
                {secciones.map(s => {
                  const valores = Object.values(respuestas[s] ?? {});
                  const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
                  return (
                    <div key={s} className="vp-constancia-fila">
                      <span>{NOMBRES_SECCION[s]}</span>
                      <span>{valores.length} ítems · promedio {media.toFixed(1).replace('.', ',')} de 4</span>
                    </div>
                  );
                })}
                {casos.length > 0 && (
                  <div className="vp-constancia-fila">
                    <span>Casos clínicos revisados</span>
                    <span>{casos.filter(c => c.estado === 'ENVIADA').length} de {casos.length}{casos.some(c => c.puntaje_experto != null) && ` · tu puntaje medio ${Math.round(casos.reduce((a, c) => a + (c.puntaje_experto ?? 0), 0) / Math.max(1, casos.filter(c => c.puntaje_experto != null).length))}`}</span>
                  </div>
                )}
                <div className="vp-constancia-fila">
                  <span>Juicio de aplicabilidad</span>
                  <span>{APLICABILIDAD.find(a => a.valor === aplicabilidad)?.texto ?? '—'}</span>
                </div>
              </div>
              <div className="vp-acciones-listo">
                <button type="button" className="vp-boton" onClick={() => irA(orden[1] === 'final' ? 'datos' : orden[1])}>Ver mis respuestas</button>
                <button type="button" className="vp-boton is-principal" onClick={() => window.print()}><Printer size={16} /> Imprimir o guardar en PDF</button>
              </div>
              <p className="vp-ayuda">Si necesitas cambiar algo, pide a quien te invitó que reabra tu evaluación.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
