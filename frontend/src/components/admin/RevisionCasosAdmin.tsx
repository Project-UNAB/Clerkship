import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Eye, Stethoscope, UserPlus, X } from 'lucide-react';
import {
  asignarCaso, listarCasosRevision, quitarRevision, resultadosCasos, verCasoRevision,
  type CasoParaRevision, type ExpertoDisponible, type ResultadosCasos,
} from '../../data/adminApi';
import type { VistaCaso } from '../../data/validacionApi';
import { mainAuthErrorMessage } from '../../data/mainAuth';
import { CRITERIOS_CASO, DIFICULTADES, GRUPOS_CRITERIO, etiquetaCriterio } from '../../data/revisionCasosForms';
import VistaCasoClinico from '../validacion/VistaCasoClinico';
import { BarraAiken, decision, descargarCsv, fecha, num } from './validezComun';

const ESTADO_REVISION = { PENDIENTE: 'Sin empezar', EN_CURSO: 'En curso', ENVIADA: 'Revisado' } as const;

/** Gráfico de Bland-Altman: diferencia (experto − IA) frente al promedio de ambos puntajes. */
function BlandAltman({ pares, media, inferior, superior }: {
  pares: { ia: number; experto: number }[]; media: number | null; inferior: number | null; superior: number | null;
}) {
  const W = 560, H = 260, M = { i: 44, d: 14, a: 14, b: 34 };
  const difs = pares.map(p => p.experto - p.ia);
  const tope = Math.max(20, ...difs.map(Math.abs), Math.abs(inferior ?? 0), Math.abs(superior ?? 0)) * 1.15;
  const x = (v: number) => M.i + (v / 100) * (W - M.i - M.d);
  const y = (v: number) => M.a + ((tope - v) / (2 * tope)) * (H - M.a - M.b);
  const marcasY = [-tope, -tope / 2, 0, tope / 2, tope].map(v => Math.round(v));
  return (
    <svg className="va-ba" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Bland-Altman: diferencia media ${num(media, 1)} puntos, límites de acuerdo ${num(inferior, 1)} a ${num(superior, 1)}`}>
      {marcasY.map(v => (
        <g key={v}>
          <line x1={M.i} x2={W - M.d} y1={y(v)} y2={y(v)} className="va-ba-rejilla" />
          <text x={M.i - 6} y={y(v) + 4} textAnchor="end" className="va-ba-eje">{v > 0 ? `+${v}` : v}</text>
        </g>
      ))}
      {[0, 25, 50, 75, 100].map(v => <text key={v} x={x(v)} y={H - M.b + 16} textAnchor="middle" className="va-ba-eje">{v}</text>)}
      <text x={(M.i + W - M.d) / 2} y={H - 4} textAnchor="middle" className="va-ba-titulo">Promedio de ambos puntajes</text>
      <line x1={M.i} x2={W - M.d} y1={y(0)} y2={y(0)} className="va-ba-cero" />
      {superior != null && <line x1={M.i} x2={W - M.d} y1={y(superior)} y2={y(superior)} className="va-ba-limite" />}
      {inferior != null && <line x1={M.i} x2={W - M.d} y1={y(inferior)} y2={y(inferior)} className="va-ba-limite" />}
      {media != null && <line x1={M.i} x2={W - M.d} y1={y(media)} y2={y(media)} className="va-ba-media" />}
      {superior != null && <text x={W - M.d - 4} y={y(superior) - 5} textAnchor="end" className="va-ba-etq">+1,96 DE: {num(superior, 1)}</text>}
      {inferior != null && <text x={W - M.d - 4} y={y(inferior) + 13} textAnchor="end" className="va-ba-etq">−1,96 DE: {num(inferior, 1)}</text>}
      {media != null && <text x={M.i + 6} y={y(media) - 5} className="va-ba-etq is-media">Media: {num(media, 1)}</text>}
      {pares.map((p, i) => (
        <circle key={i} cx={x((p.ia + p.experto) / 2)} cy={y(p.experto - p.ia)} r={5} className="va-ba-punto">
          <title>IA {p.ia} · experto {p.experto} · diferencia {p.experto - p.ia > 0 ? '+' : ''}{p.experto - p.ia}</title>
        </circle>
      ))}
    </svg>
  );
}

function ModalCaso({ consultationId, onCerrar }: { consultationId: string; onCerrar: () => void }) {
  const [caso, setCaso] = useState<VistaCaso | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    verCasoRevision(consultationId).then(r => setCaso(r.caso)).catch(err => setError(mainAuthErrorMessage(err)));
  }, [consultationId]);
  return (
    <div className="va-overlay" role="dialog" aria-modal="true" aria-label="Vista previa del caso" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="va-modal is-ancho">
        <header className="va-modal-cab">
          <div>
            <h3>Vista previa del caso</h3>
            <p>Así lo ve el experto, sin datos del estudiante. Él verá la evaluación automática solo después de dar su propio puntaje.</p>
          </div>
          <button type="button" className="va-icono" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </header>
        <div className="va-modal-cuerpo">
          {error ? <p className="adm-error">{error}</p> : caso ? <VistaCasoClinico caso={caso} /> : <p className="adm-vacio">Cargando el caso…</p>}
        </div>
      </div>
    </div>
  );
}

function ModalAsignar({ caso, expertos, onCerrar, onListo }: {
  caso: CasoParaRevision; expertos: ExpertoDisponible[]; onCerrar: () => void; onListo: () => void;
}) {
  const ya = new Set(caso.revisiones.map(r => r.invitacion_id));
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function asignar() {
    if (!elegidos.size) { setError('Elige al menos un experto.'); return; }
    setGuardando(true);
    try {
      await asignarCaso(caso.consultation_id, [...elegidos]);
      onListo();
    } catch (err) {
      setError(mainAuthErrorMessage(err));
      setGuardando(false);
    }
  }

  return (
    <div className="va-overlay" role="dialog" aria-modal="true" aria-label="Asignar expertos" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="va-modal">
        <header className="va-modal-cab">
          <div>
            <h3>Asignar «{caso.subtema ?? 'caso'}»</h3>
            <p>El caso aparece en el portal de cada experto que elijas, con su mismo enlace. Si ya había finalizado, su evaluación se reabre para este caso.</p>
          </div>
          <button type="button" className="va-icono" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </header>
        <div className="va-modal-cuerpo">
          {!expertos.length ? <p className="adm-vacio">Primero invita expertos en la pestaña «Expertos invitados».</p> : (
            <div className="va-elegir">
              {expertos.map(e => (
                <label key={e.id} className={`va-check${ya.has(e.id) || elegidos.has(e.id) ? ' is-on' : ''}`}>
                  <input type="checkbox" disabled={ya.has(e.id)} checked={ya.has(e.id) || elegidos.has(e.id)}
                    onChange={ev => setElegidos(s => { const n = new Set(s); if (ev.target.checked) n.add(e.id); else n.delete(e.id); return n; })} />
                  <span><strong>{e.nombre}</strong><small>{e.profesion}{ya.has(e.id) ? ' · ya asignado' : ''}</small></span>
                </label>
              ))}
            </div>
          )}
          {error && <p className="adm-error">{error}</p>}
        </div>
        <footer className="va-modal-pie">
          <button type="button" className="adm-btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={asignar} disabled={guardando || !elegidos.size}>
            {guardando ? 'Asignando…' : `Asignar a ${elegidos.size || ''} ${elegidos.size === 1 ? 'experto' : 'expertos'}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Revisión de casos clínicos por expertos: asignación y resultados. */
export default function RevisionCasosAdmin() {
  const [vista, setVista] = useState<'asignar' | 'resultados'>('asignar');
  const [casos, setCasos] = useState<CasoParaRevision[]>([]);
  const [expertos, setExpertos] = useState<ExpertoDisponible[]>([]);
  const [res, setRes] = useState<ResultadosCasos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asignando, setAsignando] = useState<CasoParaRevision | null>(null);
  const [viendo, setViendo] = useState<string | null>(null);
  const [umbral, setUmbral] = useState(0.8);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [metodo, setMetodo] = useState(false);

  function cargar() {
    setCargando(true);
    Promise.all([listarCasosRevision(), resultadosCasos()])
      .then(([l, r]) => { setCasos(l.casos); setExpertos(l.expertos); setRes(r); setError(null); })
      .catch(err => setError(mainAuthErrorMessage(err)))
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []);

  async function quitar(revisionId: string, experto: string | null, estado: string) {
    const aviso = estado === 'PENDIENTE'
      ? `¿Quitar el caso a ${experto ?? 'este experto'}?`
      : `¿Quitar el caso a ${experto ?? 'este experto'}? Se borra lo que ya respondió de este caso.`;
    if (!window.confirm(aviso)) return;
    try { await quitarRevision(revisionId); cargar(); } catch (err) { setError(mainAuthErrorMessage(err)); }
  }

  const etiquetaCaso = useMemo(() => Object.fromEntries(casos.map(c => [c.consultation_id, c.subtema ?? 'Caso'])), [casos]);

  function exportar() {
    if (!res) return;
    descargarCsv('revision-casos', [
      ['Criterio', 'Grupo', 'Revisiones', 'Media (1-4)', 'V de Aiken', 'IC 95 % inferior', 'IC 95 % superior', 'I-CVI', `Decisión (V ≥ ${num(umbral)})`],
      ...res.criterios.items.map(i => [etiquetaCriterio(i.key), GRUPOS_CRITERIO[CRITERIOS_CASO.find(c => c.key === i.key)?.grupo ?? 'caso'],
        i.n, num(i.media), num(i.v, 3), num(i.ic_inferior, 3), num(i.ic_superior, 3), num(i.i_cvi, 3), decision(i, umbral).texto]),
      [],
      ['Caso', 'Dificultad', 'Revisiones', 'Puntaje IA', 'Puntaje expertos (media)', 'Diferencia', 'V promedio', ...CRITERIOS_CASO.map(c => c.key)],
      ...res.casos.map(c => [c.subtema, DIFICULTADES[c.dificultad] ?? c.dificultad, c.revisiones, c.puntaje_ia, c.puntaje_expertos,
        c.puntaje_ia != null && c.puntaje_expertos != null ? num(c.puntaje_expertos - c.puntaje_ia, 1) : '', num(c.v_promedio, 3),
        ...CRITERIOS_CASO.map(k => num(c.medias[k.key]))]),
      [],
      ['Concordancia IA ↔ experto', 'n', 'Diferencia media', 'DE', 'Límite inferior', 'Límite superior', 'Error absoluto medio', 'Pearson', 'A ±10 puntos'],
      ['', res.concordancia.n, num(res.concordancia.diferencia_media), num(res.concordancia.de), num(res.concordancia.limite_inferior),
        num(res.concordancia.limite_superior), num(res.concordancia.error_absoluto_medio), num(res.concordancia.pearson, 3), num(res.concordancia.dentro_10, 3)],
    ]);
  }

  const asignadas = casos.reduce((a, c) => a + c.revisiones.length, 0);
  const revisadas = casos.reduce((a, c) => a + c.revisiones.filter(r => r.estado === 'ENVIADA').length, 0);
  const co = res?.concordancia;

  return (
    <div className="va-casos">
      <div className="va-toolbar">
        <div className="va-filtros" role="tablist">
          <button type="button" role="tab" aria-selected={vista === 'asignar'} className={`va-filtro${vista === 'asignar' ? ' is-activo' : ''}`} onClick={() => setVista('asignar')}>
            Asignar casos <span>{casos.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={vista === 'resultados'} className={`va-filtro${vista === 'resultados' ? ' is-activo' : ''}`} onClick={() => setVista('resultados')}>
            Resultados <span>{revisadas}</span>
          </button>
        </div>
        {vista === 'resultados' && (
          <div className="va-toolbar-der">
            <label className="va-umbral">Criterio
              <select value={umbral} onChange={e => setUmbral(Number(e.target.value))}>
                <option value={0.7}>V ≥ 0,70</option>
                <option value={0.8}>V ≥ 0,80</option>
              </select>
            </label>
            <button type="button" className="adm-btn adm-btn-sm va-btn" onClick={exportar} disabled={!res?.revisiones}><Download size={14} /> Exportar CSV</button>
          </div>
        )}
      </div>

      {error && <p className="adm-error">{error}</p>}
      {cargando && !casos.length && <p className="adm-vacio">Cargando casos…</p>}

      {vista === 'asignar' && !cargando && (
        !casos.length ? (
          <div className="va-vacio"><Stethoscope size={36} /><h4>Aún no hay consultas completadas</h4><p>Cuando un estudiante termine un caso en el simulador, aparecerá aquí para asignarlo a los expertos.</p></div>
        ) : (
          <>
            <p className="va-texto">
              Elige las consultas que los profesionales van a revisar. Cada experto ve el caso sin datos del estudiante, da su propio puntaje
              a ciegas y luego califica de 1 a 4 la calidad del caso y de la evaluación automática. {asignadas} {asignadas === 1 ? 'asignación' : 'asignaciones'}, {revisadas} {revisadas === 1 ? 'revisada' : 'revisadas'}.
            </p>
            <ul className="va-lista-casos">
              {casos.map(c => (
                <li key={c.consultation_id} className="va-caso">
                  <div className="va-caso-info">
                    <strong>{c.subtema ?? 'Caso clínico'}</strong>
                    <small>
                      {DIFICULTADES[c.dificultad] ?? c.dificultad} · {fecha(c.finalizada_at)} · puntaje automático {c.puntaje_ia != null ? Math.round(c.puntaje_ia) : '—'}
                      {!c.con_respuesta_estudiante && ' · sin la respuesta escrita del estudiante (consulta anterior)'}
                    </small>
                    <div className="va-caso-revisiones">
                      {c.revisiones.length ? c.revisiones.map(r => (
                        <span key={r.id} className={`va-rev is-${r.estado.toLowerCase()}`}>
                          {r.experto ?? 'Experto'} · {ESTADO_REVISION[r.estado]}{r.puntaje_experto != null && ` · ${r.puntaje_experto}`}
                          <button type="button" onClick={() => quitar(r.id, r.experto, r.estado)} aria-label={`Quitar a ${r.experto}`}><X size={12} /></button>
                        </span>
                      )) : <span className="va-rev is-vacio">Sin expertos asignados</span>}
                    </div>
                  </div>
                  <div className="va-inv-acciones">
                    <button type="button" className="adm-btn adm-btn-sm va-btn" onClick={() => setViendo(c.consultation_id)}><Eye size={14} /> Ver caso</button>
                    <button type="button" className="adm-btn adm-btn-sm adm-btn-primary va-btn" onClick={() => setAsignando(c)}><UserPlus size={14} /> Asignar</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      )}

      {vista === 'resultados' && res && (
        !res.revisiones ? (
          <div className="va-vacio"><Stethoscope size={36} /><h4>Aún no hay revisiones enviadas</h4><p>Los resultados aparecen cuando un experto envía la revisión de al menos un caso.</p></div>
        ) : (
          <>
            <div className="va-kpis">
              <div className="va-kpi"><strong>{res.revisiones}</strong><span>{res.revisiones === 1 ? 'revisión enviada' : 'revisiones enviadas'} · {res.expertos} {res.expertos === 1 ? 'experto' : 'expertos'}</span></div>
              <div className={`va-kpi ${res.criterios.v_promedio != null && res.criterios.v_promedio >= umbral ? 'is-ok' : ''}`}><strong>{num(res.criterios.v_promedio)}</strong><span>V de Aiken promedio de los criterios</span></div>
              <div className="va-kpi"><strong>{co?.diferencia_media != null ? `${co.diferencia_media > 0 ? '+' : ''}${num(co.diferencia_media, 1)}` : '—'}</strong><span>diferencia media experto − IA (puntos)</span></div>
              <div className={`va-kpi ${co?.dentro_10 != null && co.dentro_10 >= 0.8 ? 'is-ok' : ''}`}><strong>{co?.dentro_10 != null ? `${Math.round(co.dentro_10 * 100)} %` : '—'}</strong><span>de los puntajes a ±10 de la IA</span></div>
            </div>

            <div className="va-bloque">
              <h4>Concordancia del puntaje automático con el de los expertos</h4>
              <div className="va-concordancia">
                <BlandAltman pares={res.pares} media={co?.diferencia_media ?? null} inferior={co?.limite_inferior ?? null} superior={co?.limite_superior ?? null} />
                <dl className="va-stats">
                  <div><dt>Pares IA–experto</dt><dd>{co?.n ?? 0}</dd></div>
                  <div><dt>Diferencia media (sesgo)</dt><dd>{num(co?.diferencia_media, 1)}</dd></div>
                  <div><dt>Desviación estándar</dt><dd>{num(co?.de, 1)}</dd></div>
                  <div><dt>Límites de acuerdo 95 %</dt><dd>{co?.limite_inferior != null ? `${num(co.limite_inferior, 1)} a ${num(co.limite_superior, 1)}` : '—'}</dd></div>
                  <div><dt>Error absoluto medio</dt><dd>{num(co?.error_absoluto_medio, 1)}</dd></div>
                  <div><dt>Correlación de Pearson</dt><dd>{co?.pearson != null ? num(co.pearson) : '— (mín. 3 pares)'}</dd></div>
                </dl>
              </div>
              <p className="va-texto">
                Una diferencia media positiva indica que los expertos califican más alto que la plataforma; negativa, más bajo.
                Cada punto es una revisión; el 95 % de las diferencias deberían caer entre las líneas punteadas.
              </p>
            </div>

            {(['caso', 'evaluacion'] as const).map(grupo => (
              <div key={grupo} className="va-bloque">
                <h4>{GRUPOS_CRITERIO[grupo]}</h4>
                <div className="va-tabla-wrap">
                  <table className="va-tabla">
                    <thead><tr><th>#</th><th>Criterio</th><th>Media</th><th>V de Aiken [IC 95 %]</th><th>I-CVI</th><th>Decisión</th><th aria-label="Observaciones" /></tr></thead>
                    <tbody>
                      {res.criterios.items.filter(i => CRITERIOS_CASO.find(c => c.key === i.key)?.grupo === grupo).map(i => {
                        const d = decision(i, umbral);
                        const obs = res.observaciones[i.key] ?? [];
                        return [
                          <tr key={i.key}>
                            <td className="va-n">{CRITERIOS_CASO.findIndex(c => c.key === i.key) + 1}</td>
                            <td className="va-item">{etiquetaCriterio(i.key)}</td>
                            <td className="va-num">{num(i.media)}</td>
                            <td><BarraAiken item={i} umbral={umbral} /></td>
                            <td className="va-num">{num(i.i_cvi)}</td>
                            <td><span className={`va-decision ${d.clase}`}>{d.texto}</span></td>
                            <td>{obs.length > 0 && (
                              <button type="button" className={`va-obs-btn${abierto === i.key ? ' is-abierto' : ''}`} onClick={() => setAbierto(a => (a === i.key ? null : i.key))}>
                                {obs.length} <ChevronDown size={13} />
                              </button>
                            )}</td>
                          </tr>,
                          abierto === i.key && (
                            <tr key={`${i.key}-obs`} className="va-obs-fila">
                              <td />
                              <td colSpan={6}><ul className="va-obs">{obs.map((o, k) => <li key={k}><p>{o.texto}</p><span>{o.experto} · {o.caso ?? 'caso'}</span></li>)}</ul></td>
                            </tr>
                          ),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {(res.observaciones._general ?? []).length > 0 && (
              <div className="va-bloque">
                <details className="va-generales" open>
                  <summary>Observaciones generales de los casos ({res.observaciones._general.length})</summary>
                  <ul className="va-obs">{res.observaciones._general.map((o, k) => <li key={k}><p>{o.texto}</p><span>{o.experto} · {o.caso ?? 'caso'}</span></li>)}</ul>
                </details>
              </div>
            )}

            <div className="va-bloque">
              <h4>Por caso</h4>
              <div className="va-tabla-wrap">
                <table className="va-tabla">
                  <thead><tr><th>Caso</th><th>Dificultad</th><th>Revisiones</th><th>Puntaje IA</th><th>Expertos</th><th>Diferencia</th><th>V promedio</th></tr></thead>
                  <tbody>
                    {res.casos.map(c => {
                      const dif = c.puntaje_ia != null && c.puntaje_expertos != null ? c.puntaje_expertos - c.puntaje_ia : null;
                      return (
                        <tr key={c.consultation_id}>
                          <td><strong>{c.subtema ?? etiquetaCaso[c.consultation_id] ?? 'Caso'}</strong><small>{c.expertos.map(e => `${e.experto}: ${e.puntaje ?? '—'}`).join(' · ')}</small></td>
                          <td>{DIFICULTADES[c.dificultad] ?? c.dificultad}</td>
                          <td className="va-num">{c.revisiones}</td>
                          <td className="va-num">{c.puntaje_ia != null ? Math.round(c.puntaje_ia) : '—'}</td>
                          <td className="va-num">{num(c.puntaje_expertos, 1)}</td>
                          <td className={`va-num ${dif != null && Math.abs(dif) > 10 ? 'is-lejos' : ''}`}>{dif == null ? '—' : `${dif > 0 ? '+' : ''}${num(dif, 1)}`}</td>
                          <td className="va-num">{num(c.v_promedio)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="va-bloque va-metodo">
              <button type="button" className="va-metodo-cab" onClick={() => setMetodo(m => !m)} aria-expanded={metodo}>
                <h4>Metodología de la revisión de casos</h4><ChevronDown size={16} />
              </button>
              {metodo && (
                <div className="va-metodo-cuerpo">
                  <p><strong>Procedimiento.</strong> Cada experto recibe consultas completadas por estudiantes, anonimizadas (su nombre se reemplaza también dentro de la conversación). Revisa el caso, la conversación, los exámenes pedidos y lo que entregó el estudiante.</p>
                  <p><strong>Puntaje a ciegas.</strong> Antes de ver la evaluación automática, el experto registra el puntaje de 0 a 100 que él le daría al estudiante. La plataforma no le muestra la evaluación hasta entonces y después ya no permite cambiarlo, para evitar el sesgo de anclaje.</p>
                  <p><strong>Criterios.</strong> Ocho criterios de 1 a 4 sobre la calidad clínica del caso y la calidad de la evaluación automática; se resumen con la V de Aiken (IC 95 %, Penfield y Giacobbi, 2004) y el I-CVI, como la validación de la plataforma.</p>
                  <p><strong>Concordancia.</strong> Se compara el puntaje automático con el del experto mediante el método de Bland y Altman (1986): diferencia media (sesgo) y límites de acuerdo del 95 % (media ± 1,96 DE); además, el error absoluto medio, la correlación de Pearson y la proporción de puntajes a ±10 puntos.</p>
                </div>
              )}
            </div>
          </>
        )
      )}

      {asignando && <ModalAsignar caso={asignando} expertos={expertos} onCerrar={() => setAsignando(null)} onListo={() => { setAsignando(null); cargar(); }} />}
      {viendo && <ModalCaso consultationId={viendo} onCerrar={() => setViendo(null)} />}
    </div>
  );
}
