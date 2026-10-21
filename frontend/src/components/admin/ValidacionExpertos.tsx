import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BookOpenCheck, Check, ChevronDown, Copy, Download, Link2, Mail, MoreHorizontal, Pencil, RefreshCw,
  RotateCcw, Search, ShieldOff, Trash2, UserPlus, X,
} from 'lucide-react';
import {
  actualizarInvitacionValidacion, borrarInvitacionValidacion, crearInvitacionValidacion, listarInvitacionesValidacion,
  nuevoEnlaceValidacion, resultadosValidacion,
  type InvitacionAdmin, type NuevaInvitacion, type ResultadosValidacion,
} from '../../data/adminApi';
import { mainAuthErrorMessage } from '../../data/mainAuth';
import {
  APLICABILIDAD, ESCALA_VALIDACION, FORMULARIOS_VALIDACION, NOMBRES_SECCION, type PestanaValidacion,
} from '../../data/validacionForms';
import RevisionCasosAdmin from './RevisionCasosAdmin';
import { BarraAiken, decision, descargarCsv, fecha, num } from './validezComun';
import '../../styles/validacionAdmin.css';

const SECCIONES = Object.keys(FORMULARIOS_VALIDACION) as PestanaValidacion[];

const ESTADOS: Record<InvitacionAdmin['estado'], string> = {
  PENDIENTE: 'Sin abrir',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completada',
  REVOCADA: 'Revocada',
};

const enlaceDe = (token: string) => `${window.location.origin}/evaluacion-experto/${token}`;
const etiquetaItem = (s: PestanaValidacion, key: string) => FORMULARIOS_VALIDACION[s].items.find(i => i.key === key)?.label ?? key;

// ───────────────────────── Invitaciones ─────────────────────────

const VACIA: NuevaInvitacion = { nombre: '', email: '', profesion: '', especialidad: '', institucion: '', registro_profesional: '', anos_experiencia: null, secciones: [...SECCIONES] };

function FormularioInvitacion({ inicial, onCerrar, onGuardar }: {
  inicial: InvitacionAdmin | null;
  onCerrar: () => void;
  onGuardar: (datos: NuevaInvitacion) => Promise<void>;
}) {
  const [datos, setDatos] = useState<NuevaInvitacion>(() => inicial ? {
    nombre: inicial.experto.nombre ?? '', email: inicial.experto.email ?? '', profesion: inicial.experto.profesion,
    especialidad: inicial.experto.especialidad ?? '', institucion: inicial.experto.institucion ?? '',
    registro_profesional: inicial.experto.registro_profesional ?? '', anos_experiencia: inicial.experto.anos_experiencia,
    secciones: inicial.secciones,
  } : VACIA);
  const [anos, setAnos] = useState(inicial?.experto.anos_experiencia == null ? '' : String(inicial.experto.anos_experiencia));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof NuevaInvitacion) => (e: { target: { value: string } }) => setDatos(d => ({ ...d, [k]: e.target.value }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (datos.registro_profesional.trim().length < 2 || datos.profesion.trim().length < 2) { setError('Escribe el ID del experto y su profesión.'); return; }
    if (datos.nombre && datos.nombre.trim().length === 1) { setError('El nombre debe tener al menos 2 letras, o déjalo vacío.'); return; }
    if (datos.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email.trim())) { setError('El correo no es válido.'); return; }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        ...datos,
        email: datos.email?.trim() || null,
        anos_experiencia: anos === '' ? null : Math.min(80, Number(anos)),
      });
    } catch (err) {
      setError(mainAuthErrorMessage(err));
      setGuardando(false);
    }
  }

  return (
    <div className="va-overlay" role="dialog" aria-modal="true" aria-labelledby="va-form-titulo" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <form className="va-modal" onSubmit={enviar} noValidate>
        <header className="va-modal-cab">
          <div>
            <h3 id="va-form-titulo">{inicial ? 'Editar invitación' : 'Invitar a un experto'}</h3>
            <p>{inicial ? 'Los cambios se ven la próxima vez que abra su enlace.' : 'Se crea un enlace personal para que evalúe sin crear cuenta. Él podrá confirmar o corregir sus datos.'}</p>
          </div>
          <button type="button" className="va-icono" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </header>
        <div className="va-modal-cuerpo">
          <div className="va-campos">
            <label className="va-campo"><span>ID (documento o registro profesional) *</span><input value={datos.registro_profesional} onChange={campo('registro_profesional')} maxLength={60} placeholder="Cédula o registro médico" autoFocus /></label>
            <label className="va-campo"><span>Nombre y apellidos <small>(opcional)</small></span><input value={datos.nombre ?? ''} onChange={campo('nombre')} maxLength={120} /></label>
            <label className="va-campo"><span>Profesión *</span><input value={datos.profesion} onChange={campo('profesion')} maxLength={120} placeholder="Médico gastroenterólogo, docente…" /></label>
            <label className="va-campo"><span>Especialidad</span><input value={datos.especialidad ?? ''} onChange={campo('especialidad')} maxLength={120} /></label>
            <label className="va-campo"><span>Años de experiencia</span><input inputMode="numeric" maxLength={2} value={anos} onChange={e => setAnos(e.target.value.replace(/\D/g, ''))} /></label>
            <label className="va-campo"><span>Institución</span><input value={datos.institucion ?? ''} onChange={campo('institucion')} maxLength={160} /></label>
            <label className="va-campo"><span>Correo</span><input type="email" value={datos.email ?? ''} onChange={campo('email')} maxLength={160} placeholder="Para enviarle el enlace" /></label>
          </div>
          <fieldset className="va-secciones">
            <legend>Secciones de la plataforma que va a evaluar <small>(ninguna si solo revisará casos clínicos)</small></legend>
            {SECCIONES.map(s => (
              <label key={s} className={`va-check${datos.secciones.includes(s) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={datos.secciones.includes(s)}
                  onChange={e => setDatos(d => ({ ...d, secciones: e.target.checked ? [...d.secciones, s] : d.secciones.filter(x => x !== s) }))} />
                <span><strong>{NOMBRES_SECCION[s]}</strong><small>{FORMULARIOS_VALIDACION[s].items.length} ítems</small></span>
              </label>
            ))}
          </fieldset>
          {error && <p className="adm-error">{error}</p>}
        </div>
        <footer className="va-modal-pie">
          <button type="button" className="adm-btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="adm-btn adm-btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear invitación'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Invitaciones({ onCambio }: { onCambio: () => void }) {
  const [lista, setLista] = useState<InvitacionAdmin[]>([]);
  const [itemsPor, setItemsPor] = useState<Record<PestanaValidacion, number> | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ inicial: InvitacionAdmin | null } | null>(null);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<'TODAS' | InvitacionAdmin['estado']>('TODAS');
  const [menu, setMenu] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    listarInvitacionesValidacion()
      .then(r => { setLista(r.invitaciones); setItemsPor(r.items_por_seccion); setError(null); })
      .catch(err => setError(mainAuthErrorMessage(err)))
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []);

  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    const id = window.setTimeout(() => document.addEventListener('click', cerrar), 0);
    return () => { window.clearTimeout(id); document.removeEventListener('click', cerrar); };
  }, [menu]);

  const reemplazar = (inv: InvitacionAdmin) => { setLista(l => l.map(x => (x.id === inv.id ? inv : x))); onCambio(); };

  async function accion(inv: InvitacionAdmin, tipo: 'revocar' | 'reactivar' | 'reabrir' | 'enlace' | 'borrar') {
    setMenu(null);
    const nombre = inv.experto.etiqueta;
    const preguntas = {
      revocar: `¿Revocar el enlace de ${nombre}? Ya no podrá entrar y sus respuestas dejan de contar en los resultados (no se borran).`,
      enlace: `¿Generar un enlace nuevo para ${nombre}? El enlace anterior deja de funcionar.`,
      borrar: `¿Borrar la invitación de ${nombre} y todas sus respuestas? No se puede deshacer.`,
      reabrir: `¿Reabrir la evaluación de ${nombre}? Podrá cambiar sus respuestas y deberá finalizar otra vez.`,
      reactivar: null,
    } as const;
    if (preguntas[tipo] && !window.confirm(preguntas[tipo]!)) return;
    try {
      if (tipo === 'borrar') {
        await borrarInvitacionValidacion(inv.id);
        setLista(l => l.filter(x => x.id !== inv.id));
        onCambio();
      } else if (tipo === 'enlace') {
        reemplazar((await nuevoEnlaceValidacion(inv.id)).invitacion);
      } else {
        reemplazar((await actualizarInvitacionValidacion(inv.id, { accion: tipo })).invitacion);
      }
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    }
  }

  async function copiar(inv: InvitacionAdmin) {
    try {
      await navigator.clipboard.writeText(enlaceDe(inv.token));
      setCopiado(inv.id);
      window.setTimeout(() => setCopiado(c => (c === inv.id ? null : c)), 2000);
    } catch {
      window.prompt('Copia el enlace:', enlaceDe(inv.token));
    }
  }

  function correo(inv: InvitacionAdmin) {
    const asunto = 'Invitación a validar la plataforma Clerkship';
    const cuerpo = `Hola${inv.experto.nombre ? `, ${inv.experto.nombre}` : ''}:\n\nTe invitamos a participar como experto en la validación de contenido de Clerkship, `
      + 'un simulador de casos clínicos de gastroenterología para estudiantes de medicina.\n\n'
      + `Tu enlace personal (no lo compartas): ${enlaceDe(inv.token)}\n\n`
      + `Son ${inv.secciones.length} secciones; tus respuestas se guardan solas y puedes volver cuando quieras con el mismo enlace.\n\nMuchas gracias.`;
    window.location.href = `mailto:${inv.experto.email ?? ''}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }

  async function guardar(datos: NuevaInvitacion) {
    if (form?.inicial) {
      reemplazar((await actualizarInvitacionValidacion(form.inicial.id, datos)).invitacion);
    } else {
      const { invitacion } = await crearInvitacionValidacion(datos);
      setLista(l => [invitacion, ...l]);
      onCambio();
      void copiar(invitacion);
    }
    setForm(null);
  }

  const avance = (inv: InvitacionAdmin) => {
    const total = inv.secciones.reduce((a, s) => a + (itemsPor?.[s] ?? 0), 0);
    const hechos = inv.secciones.reduce((a, s) => a + Object.keys(inv.respuestas[s] ?? {}).length, 0);
    return { total, hechos, pct: total ? Math.round((hechos / total) * 100) : 0 };
  };

  const conteo = useMemo(() => {
    const c = { TODAS: lista.length, PENDIENTE: 0, EN_CURSO: 0, COMPLETADA: 0, REVOCADA: 0 };
    lista.forEach(i => { c[i.estado] += 1; });
    return c;
  }, [lista]);

  const visibles = lista.filter(i => {
    if (filtro !== 'TODAS' && i.estado !== filtro) return false;
    const q = buscar.trim().toLowerCase();
    if (!q) return true;
    const e = i.experto;
    return [e.nombre, e.registro_profesional, e.profesion, e.especialidad, e.institucion, e.email].some(v => (v ?? '').toLowerCase().includes(q));
  });

  return (
    <div className="va-bloque-lista">
      <div className="va-toolbar">
        <div className="va-filtros" role="tablist">
          {(['TODAS', 'PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'REVOCADA'] as const).map(f => (
            <button key={f} type="button" role="tab" aria-selected={filtro === f}
              className={`va-filtro${filtro === f ? ' is-activo' : ''}`} onClick={() => setFiltro(f)}>
              {f === 'TODAS' ? 'Todas' : ESTADOS[f]} <span>{conteo[f]}</span>
            </button>
          ))}
        </div>
        <div className="va-toolbar-der">
          <label className="va-buscar"><Search size={14} /><input type="search" placeholder="Buscar experto" value={buscar} onChange={e => setBuscar(e.target.value)} /></label>
          <button type="button" className="adm-btn adm-btn-primary va-btn" onClick={() => setForm({ inicial: null })}>
            <UserPlus size={15} /> Invitar experto
          </button>
        </div>
      </div>

      {error && <p className="adm-error">{error}</p>}

      {cargando && !lista.length ? <p className="adm-vacio">Cargando invitaciones…</p> : !lista.length ? (
        <div className="va-vacio">
          <BookOpenCheck size={36} />
          <h4>Todavía no invitaste a ningún experto</h4>
          <p>Invita a profesionales de la salud (idealmente entre 5 y 10) para validar el contenido de la plataforma. Cada uno recibe un enlace personal.</p>
          <button type="button" className="adm-btn adm-btn-primary va-btn" onClick={() => setForm({ inicial: null })}><UserPlus size={15} /> Invitar al primero</button>
        </div>
      ) : !visibles.length ? <p className="adm-vacio">Ninguna invitación coincide.</p> : (
        <ul className="va-invitaciones">
          {visibles.map(inv => {
            const a = avance(inv);
            const e = inv.experto;
            return (
              <li key={inv.id} className={`va-inv is-${inv.estado.toLowerCase()}`}>
                <div className="va-inv-persona">
                  <span className="va-avatar">{e.nombre ? e.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() : 'ID'}</span>
                  <div>
                    <strong>{e.etiqueta}</strong>
                    <small>{[e.nombre && e.registro_profesional && `ID ${e.registro_profesional}`, e.profesion, e.especialidad, e.institucion].filter(Boolean).join(' · ')}</small>
                  </div>
                </div>
                <div className="va-inv-avance">
                  <div className="va-inv-secciones">
                    {inv.secciones.map(s => (
                      <span key={s} className={inv.enviadas[s] ? 'is-hecha' : Object.keys(inv.respuestas[s] ?? {}).length ? 'is-parcial' : ''}
                        title={`${NOMBRES_SECCION[s]}: ${inv.enviadas[s] ? 'enviada' : `${Object.keys(inv.respuestas[s] ?? {}).length} de ${itemsPor?.[s] ?? '?'}`}`}>
                        {inv.enviadas[s] && <Check size={11} strokeWidth={3} />}{NOMBRES_SECCION[s]}
                      </span>
                    ))}
                  </div>
                  <div className="va-barra"><span style={{ width: `${a.pct}%` }} /></div>
                  <small>{a.total > 0 && `${a.hechos} de ${a.total} ítems · `}{inv.casos?.asignados > 0 && `${inv.casos.enviados} de ${inv.casos.asignados} casos revisados · `}{inv.estado === 'COMPLETADA' ? `finalizó el ${fecha(inv.completada_at)}` : inv.abierta_at ? `abrió el enlace el ${fecha(inv.abierta_at)}` : `invitado el ${fecha(inv.created_at)}`}</small>
                </div>
                <span className={`va-estado is-${inv.estado.toLowerCase()}`}>{ESTADOS[inv.estado]}</span>
                <div className="va-inv-acciones">
                  {inv.estado !== 'REVOCADA' && (
                    <>
                      <button type="button" className="adm-btn adm-btn-sm va-btn" onClick={() => copiar(inv)}>
                        {copiado === inv.id ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar enlace</>}
                      </button>
                      <button type="button" className="va-icono" onClick={() => correo(inv)} title="Enviar por correo" aria-label="Enviar por correo"><Mail size={16} /></button>
                    </>
                  )}
                  <div className="va-menu-wrap">
                    <button type="button" className="va-icono" aria-label="Más acciones" aria-expanded={menu === inv.id}
                      onClick={() => setMenu(m => (m === inv.id ? null : inv.id))}><MoreHorizontal size={16} /></button>
                    {menu === inv.id && (
                      <div className="va-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => { setMenu(null); setForm({ inicial: inv }); }}><Pencil size={14} /> Editar datos y secciones</button>
                        <a role="menuitem" href={enlaceDe(inv.token)} target="_blank" rel="noreferrer"><Link2 size={14} /> Abrir su portal</a>
                        {inv.estado === 'COMPLETADA' && <button type="button" role="menuitem" onClick={() => accion(inv, 'reabrir')}><RotateCcw size={14} /> Reabrir evaluación</button>}
                        <button type="button" role="menuitem" onClick={() => accion(inv, 'enlace')}><RefreshCw size={14} /> Generar enlace nuevo</button>
                        {inv.estado === 'REVOCADA'
                          ? <button type="button" role="menuitem" onClick={() => accion(inv, 'reactivar')}><RotateCcw size={14} /> Reactivar</button>
                          : <button type="button" role="menuitem" onClick={() => accion(inv, 'revocar')}><ShieldOff size={14} /> Revocar enlace</button>}
                        <button type="button" role="menuitem" className="is-peligro" onClick={() => accion(inv, 'borrar')}><Trash2 size={14} /> Borrar</button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {form && <FormularioInvitacion inicial={form.inicial} onCerrar={() => setForm(null)} onGuardar={guardar} />}
    </div>
  );
}

// ───────────────────────── Resultados ─────────────────────────

function Resultados({ version }: { version: number }) {
  const [datos, setDatos] = useState<ResultadosValidacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [umbral, setUmbral] = useState(0.8);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [metodo, setMetodo] = useState(false);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    resultadosValidacion()
      .then(r => { if (vigente) { setDatos(r); setError(null); } })
      .catch(err => { if (vigente) setError(mainAuthErrorMessage(err)); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [version]);

  const nombreExperto = useMemo(() => Object.fromEntries((datos?.expertos ?? []).map(e => [e.id, e.etiqueta])), [datos]);

  if (error) return <p className="adm-error">{error}</p>;
  if (cargando && !datos) return <p className="adm-vacio">Calculando resultados…</p>;
  if (!datos) return null;

  const conDatos = SECCIONES.filter(s => datos.secciones[s].expertos > 0);
  const todosItems = conDatos.flatMap(s => datos.secciones[s].items.map(i => ({ s, i })));
  const validos = todosItems.filter(({ i }) => decision(i, umbral).texto === 'Válido').length;
  const totalAplic = Object.values(datos.aplicabilidad).reduce((a, b) => a + b, 0);

  function exportarItems() {
    descargarCsv('validacion-resultados-por-item', [
      ['Sección', 'N.º', 'Ítem', 'Expertos', 'Media (1-4)', 'V de Aiken', 'IC 95 % inferior', 'IC 95 % superior', 'I-CVI', 'Kappa modificado', `Decisión (V ≥ ${num(umbral)})`, '1', '2', '3', '4'],
      ...SECCIONES.flatMap(s => datos!.secciones[s].items.map((i, n) => [
        NOMBRES_SECCION[s], n + 1, etiquetaItem(s, i.key), i.n, num(i.media), num(i.v, 3), num(i.ic_inferior, 3), num(i.ic_superior, 3),
        num(i.i_cvi, 3), i.n < 3 ? '' : num(i.kappa, 3), decision(i, umbral).texto, i.distribucion['1'], i.distribucion['2'], i.distribucion['3'], i.distribucion['4'],
      ])),
      [],
      ['Sección', 'Expertos', 'V promedio', 'S-CVI/Ave', 'S-CVI/UA'],
      ...SECCIONES.map(s => [NOMBRES_SECCION[s], datos!.secciones[s].expertos, num(datos!.secciones[s].v_promedio, 3), num(datos!.secciones[s].s_cvi_ave, 3), num(datos!.secciones[s].s_cvi_ua, 3)]),
      ['Global', datos!.expertos.length, num(datos!.global.v_promedio, 3), num(datos!.global.s_cvi_ave, 3), num(datos!.global.s_cvi_ua, 3)],
    ]);
  }

  function exportarMatriz() {
    const columnas = SECCIONES.flatMap(s => FORMULARIOS_VALIDACION[s].items.map(i => ({ s, k: i.key })));
    descargarCsv('validacion-matriz-de-respuestas', [
      ['ID', 'Nombre', 'Profesión', 'Especialidad', 'Años de experiencia', 'Institución', 'Origen', 'Aplicabilidad', 'Comentario final',
        ...columnas.map(c => `${NOMBRES_SECCION[c.s]} · ${c.k}`)],
      ...datos!.expertos.map(e => {
        const fila = (s: PestanaValidacion) => datos!.secciones[s].respuestas.find(r => r.experto === e.id);
        return [e.registro_profesional, e.nombre, e.profesion, e.especialidad, e.anos_experiencia, e.institucion,
          e.origen === 'invitacion' ? 'Enlace personal' : 'Formulario abierto',
          APLICABILIDAD.find(a => a.valor === e.aplicabilidad)?.texto ?? '', e.comentario_final,
          ...columnas.map(c => fila(c.s)?.valores[c.k])];
      }),
    ]);
  }

  return (
    <div className="va-resultados">
      <div className="va-toolbar">
        <label className="va-umbral">
          Criterio de validez
          <select value={umbral} onChange={e => setUmbral(Number(e.target.value))}>
            <option value={0.7}>V de Aiken ≥ 0,70</option>
            <option value={0.8}>V de Aiken ≥ 0,80</option>
          </select>
        </label>
        <div className="va-toolbar-der">
          <button type="button" className="adm-btn adm-btn-sm va-btn" onClick={exportarItems} disabled={!datos.expertos.length}><Download size={14} /> Resultados por ítem (CSV)</button>
          <button type="button" className="adm-btn adm-btn-sm va-btn" onClick={exportarMatriz} disabled={!datos.expertos.length}><Download size={14} /> Matriz de respuestas (CSV)</button>
        </div>
      </div>

      <div className="va-kpis">
        <div className="va-kpi"><strong>{datos.expertos.length}</strong><span>{datos.expertos.length === 1 ? 'experto con respuestas' : 'expertos con respuestas'}</span></div>
        <div className={`va-kpi ${datos.global.v_promedio != null && datos.global.v_promedio >= umbral ? 'is-ok' : ''}`}><strong>{num(datos.global.v_promedio)}</strong><span>V de Aiken promedio</span></div>
        <div className={`va-kpi ${datos.global.s_cvi_ave != null && datos.global.s_cvi_ave >= 0.9 ? 'is-ok' : ''}`}><strong>{num(datos.global.s_cvi_ave)}</strong><span>S-CVI/Ave (meta ≥ 0,90)</span></div>
        <div className="va-kpi"><strong>{validos}<small> / {todosItems.length}</small></strong><span>ítems válidos</span></div>
      </div>

      {datos.expertos.length < 5 && datos.expertos.length > 0 && (
        <p className="va-nota">Con menos de 5 expertos los intervalos son anchos y el I-CVI debe ser 1 para que un ítem cuente como válido. Lo recomendado son entre 5 y 10.</p>
      )}

      {!datos.expertos.length ? (
        <div className="va-vacio"><BookOpenCheck size={36} /><h4>Aún no hay respuestas</h4><p>Los resultados aparecen cuando un experto envía al menos una sección.</p></div>
      ) : (
        <>
          {totalAplic > 0 && (
            <div className="va-bloque">
              <h4>Juicio de aplicabilidad</h4>
              <div className="va-aplic">
                {APLICABILIDAD.map(a => (
                  <div key={a.valor} className={`va-aplic-item is-${a.valor.toLowerCase()}`}>
                    <strong>{datos.aplicabilidad[a.valor]}</strong><span>{a.texto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {SECCIONES.map(s => {
            const sec = datos.secciones[s];
            return (
              <div key={s} className="va-bloque">
                <div className="va-bloque-cab">
                  <h4>{NOMBRES_SECCION[s]}</h4>
                  <div className="va-chips">
                    <span>{sec.expertos} {sec.expertos === 1 ? 'experto' : 'expertos'}</span>
                    <span className={sec.v_promedio != null && sec.v_promedio >= umbral ? 'is-ok' : ''}>V {num(sec.v_promedio)}</span>
                    <span>S-CVI/Ave {num(sec.s_cvi_ave)}</span>
                    <span>S-CVI/UA {num(sec.s_cvi_ua)}</span>
                  </div>
                </div>
                {!sec.expertos ? <p className="adm-vacio">Ningún experto envió esta sección todavía.</p> : (
                  <div className="va-tabla-wrap">
                    <table className="va-tabla">
                      <thead>
                        <tr><th>#</th><th>Ítem</th><th>Media</th><th>V de Aiken [IC 95 %]</th><th>I-CVI</th><th>κ*</th><th>Decisión</th><th aria-label="Observaciones" /></tr>
                      </thead>
                      <tbody>
                        {sec.items.map((i, n) => {
                          const d = decision(i, umbral);
                          const obs = sec.observaciones[i.key] ?? [];
                          const clave = `${s}.${i.key}`;
                          return [
                            <tr key={clave}>
                              <td className="va-n">{n + 1}</td>
                              <td className="va-item">
                                {etiquetaItem(s, i.key)}
                                <div className="va-dist" aria-label={ESCALA_VALIDACION.map(e => `${e.texto}: ${i.distribucion[String(e.valor) as '1']}`).join(', ')}>
                                  {ESCALA_VALIDACION.map(e => {
                                    const c = i.distribucion[String(e.valor) as '1'];
                                    return c ? <span key={e.valor} className={`va-d${e.valor}`} style={{ flex: c }} title={`${e.valor} · ${e.texto}: ${c}`}>{c}</span> : null;
                                  })}
                                </div>
                              </td>
                              <td className="va-num">{num(i.media)}</td>
                              <td><BarraAiken item={i} umbral={umbral} /></td>
                              <td className="va-num">{num(i.i_cvi)}</td>
                              <td className="va-num" title={i.n < 3 ? 'Con menos de 3 expertos el kappa no es interpretable' : undefined}>{i.n < 3 ? '—' : num(i.kappa)}</td>
                              <td><span className={`va-decision ${d.clase}`}>{d.texto}</span></td>
                              <td>
                                {obs.length > 0 && (
                                  <button type="button" className={`va-obs-btn${abierto === clave ? ' is-abierto' : ''}`} onClick={() => setAbierto(a => (a === clave ? null : clave))}
                                    aria-expanded={abierto === clave} title="Ver observaciones">
                                    {obs.length} <ChevronDown size={13} />
                                  </button>
                                )}
                              </td>
                            </tr>,
                            abierto === clave && (
                              <tr key={`${clave}-obs`} className="va-obs-fila">
                                <td />
                                <td colSpan={7}>
                                  <ul className="va-obs">{obs.map((o, k) => <li key={k}><p>{o.texto}</p><span>{nombreExperto[o.experto] ?? 'Experto'}</span></li>)}</ul>
                                </td>
                              </tr>
                            ),
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {(sec.observaciones._general ?? []).length > 0 && (
                  <details className="va-generales">
                    <summary>Observaciones generales de la sección ({sec.observaciones._general.length})</summary>
                    <ul className="va-obs">{sec.observaciones._general.map((o, k) => <li key={k}><p>{o.texto}</p><span>{nombreExperto[o.experto] ?? 'Experto'}</span></li>)}</ul>
                  </details>
                )}
              </div>
            );
          })}

          <div className="va-bloque">
            <h4>Panel de expertos</h4>
            <div className="va-tabla-wrap">
              <table className="va-tabla is-panel">
                <thead><tr><th>Experto</th><th>Profesión / especialidad</th><th>Años</th><th>Secciones</th><th>Aplicabilidad</th></tr></thead>
                <tbody>
                  {datos.expertos.map(e => (
                    <tr key={e.id}>
                      <td><strong>{e.etiqueta}</strong>{e.nombre && e.registro_profesional && <small>ID {e.registro_profesional}</small>}{e.institucion && <small>{e.institucion}</small>}{e.origen === 'formulario' && <small>Formulario abierto</small>}</td>
                      <td>{[e.profesion, e.especialidad].filter(Boolean).join(' · ')}</td>
                      <td className="va-num">{e.anos_experiencia ?? '—'}</td>
                      <td>{e.secciones.map(s => NOMBRES_SECCION[s]).join(', ')}</td>
                      <td>{APLICABILIDAD.find(a => a.valor === e.aplicabilidad)?.texto ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {datos.expertos.some(e => e.comentario_final) && (
              <details className="va-generales">
                <summary>Comentarios finales ({datos.expertos.filter(e => e.comentario_final).length})</summary>
                <ul className="va-obs">{datos.expertos.filter(e => e.comentario_final).map(e => <li key={e.id}><p>{e.comentario_final}</p><span>{e.etiqueta}</span></li>)}</ul>
              </details>
            )}
          </div>
        </>
      )}

      <div className="va-bloque va-metodo">
        <button type="button" className="va-metodo-cab" onClick={() => setMetodo(m => !m)} aria-expanded={metodo}>
          <h4>Metodología y cómo leer los resultados</h4><ChevronDown size={16} />
        </button>
        {metodo && (
          <div className="va-metodo-cuerpo">
            <p><strong>Escala.</strong> Cada experto califica cada ítem de 1 a 4: 1 no cumple, 2 nivel bajo, 3 nivel moderado y 4 nivel alto (Escobar-Pérez y Cuervo-Martínez, 2008).</p>
            <p><strong>V de Aiken.</strong> V = S / [n (c − 1)], donde S es la suma de (calificación − 1), n el número de expertos y c = 4. Va de 0 a 1. Su intervalo de confianza del 95 % se calcula con el método score de Penfield y Giacobbi (2004). Un ítem es válido si V alcanza el criterio elegido (0,70 o 0,80); lo más exigente es que además el límite inferior del intervalo supere 0,50.</p>
            <p><strong>I-CVI.</strong> Proporción de expertos que califican 3 o 4. Con 6 o más expertos debe ser ≥ 0,78; con 5 o menos, 1 (Lynn, 1986; Polit y Beck, 2006). <strong>κ*</strong> es el kappa modificado, que descuenta el acuerdo por azar: &gt; 0,74 excelente, 0,60–0,74 bueno, 0,40–0,59 regular (Polit, Beck y Owen, 2007); con menos de 3 expertos no se muestra.</p>
            <p><strong>S-CVI/Ave</strong> es el promedio de los I-CVI de la sección (meta ≥ 0,90) y <strong>S-CVI/UA</strong> la proporción de ítems en los que todos los expertos coincidieron en 3 o 4.</p>
            <p><strong>Decisión.</strong> «Válido»: cumple V e I-CVI. «Revisar»: cumple solo uno. «Modificar»: no cumple ninguno. Las respuestas de enlaces revocados no cuentan; las del formulario abierto (sin invitación) sí.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Validación de la plataforma por profesionales de la salud: invitaciones y resultados. */
export default function ValidacionExpertos() {
  const [vista, setVista] = useState<'invitaciones' | 'resultados' | 'casos'>('invitaciones');
  const [version, setVersion] = useState(0);
  return (
    <section className="va">
      <header className="va-cabecera">
        <div>
          <h2>Validación por expertos</h2>
          <p>Profesionales de la salud evalúan, con su enlace personal, si el contenido de cada sección es claro, pertinente y adecuado. Los resultados se calculan con la V de Aiken y el índice de validez de contenido.</p>
        </div>
        <div className="va-vistas" role="tablist">
          <button type="button" role="tab" aria-selected={vista === 'invitaciones'} className={vista === 'invitaciones' ? 'is-activa' : ''} onClick={() => setVista('invitaciones')}>Expertos invitados</button>
          <button type="button" role="tab" aria-selected={vista === 'resultados'} className={vista === 'resultados' ? 'is-activa' : ''} onClick={() => setVista('resultados')}>Resultados</button>
          <button type="button" role="tab" aria-selected={vista === 'casos'} className={vista === 'casos' ? 'is-activa' : ''} onClick={() => setVista('casos')}>Casos clínicos</button>
        </div>
      </header>
      {vista === 'invitaciones' && <Invitaciones onCambio={() => setVersion(v => v + 1)} />}
      {vista === 'resultados' && <Resultados version={version} />}
      {vista === 'casos' && <RevisionCasosAdmin />}
    </section>
  );
}
