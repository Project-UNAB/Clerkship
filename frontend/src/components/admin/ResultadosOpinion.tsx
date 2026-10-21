import { useEffect, useMemo, useState } from 'react';
import { Download, MessageSquareText, RefreshCw, Search, Star, Users } from 'lucide-react';
import { listarFeedbackAdmin, resumenFeedbackAdmin, type ResumenOpinion } from '../../data/adminApi';
import { ESCALA_OPINION, FORMULARIOS_FEEDBACK } from '../../data/feedbackForms';
import type { PestanaFeedback } from '../../data/feedbackApi';
import { mainAuthErrorMessage } from '../../data/mainAuth';
import '../../styles/resultadosOpinion.css';

const PESTANAS: { id: PestanaFeedback; nombre: string }[] = [
  { id: 'inicio', nombre: 'Inicio' },
  { id: 'casos', nombre: 'Casos clínicos' },
  { id: 'historial', nombre: 'Historial' },
  { id: 'biblioteca', nombre: 'Biblioteca' },
];

const decimal = (n: number | null | undefined, d = 1) => (n == null ? '—' : n.toFixed(d).replace('.', ','));

/** Color del promedio: rojo (1) → verde (5), como la escala que ve el usuario. */
function tono(promedio: number | null) {
  if (promedio == null) return 'ro-t0';
  if (promedio < 2) return 'ro-t1';
  if (promedio < 3) return 'ro-t2';
  if (promedio < 3.75) return 'ro-t3';
  if (promedio < 4.5) return 'ro-t4';
  return 'ro-t5';
}

/** Descarga todas las respuestas de la pestaña en CSV (Excel lo abre con tildes gracias al BOM). */
async function exportarCsv(pestana: PestanaFeedback) {
  const { respuestas } = await listarFeedbackAdmin(pestana);
  const preguntas = FORMULARIOS_FEEDBACK[pestana].preguntas;
  const encabezados = ['Usuario', 'Fecha', ...preguntas.map(p => p.label), 'Comentario'];
  const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = respuestas.map(f => [
    f.id_usuario, f.created_at ? new Date(f.created_at).toLocaleString('es') : '',
    ...preguntas.map(p => f[p.key]), f.comentario,
  ].map(escapar).join(';'));
  const csv = [encabezados.map(escapar).join(';'), ...lineas].join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `opinion-${pestana}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Resultados de la «Opinión» (1 a 5) que dan los usuarios en cada pestaña. */
export default function ResultadosOpinion() {
  const [pestana, setPestana] = useState<PestanaFeedback>('inicio');
  const [datos, setDatos] = useState<ResumenOpinion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<'formulario' | 'peor' | 'mejor'>('formulario');
  const [buscar, setBuscar] = useState('');
  const [exportando, setExportando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    resumenFeedbackAdmin(pestana)
      .then(r => { if (vigente) setDatos(r); })
      .catch(err => { if (vigente) setError(mainAuthErrorMessage(err)); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [pestana, recarga]);

  const etiquetas = useMemo(
    () => Object.fromEntries(FORMULARIOS_FEEDBACK[pestana].preguntas.map(p => [p.key, p.label])),
    [pestana],
  );

  const preguntas = useMemo(() => {
    const lista = (datos?.preguntas ?? []).map((p, i) => ({ ...p, numero: i + 1 }));
    if (orden === 'formulario') return lista;
    const valor = (p: typeof lista[number]) => p.promedio ?? (orden === 'peor' ? 99 : -1);
    return [...lista].sort((a, b) => (orden === 'peor' ? valor(a) - valor(b) : valor(b) - valor(a)));
  }, [datos, orden]);

  const comentarios = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const todos = datos?.comentarios ?? [];
    return q ? todos.filter(c => c.texto.toLowerCase().includes(q) || (c.usuario ?? '').toLowerCase().includes(q)) : todos;
  }, [datos, buscar]);

  const conPromedio = (datos?.preguntas ?? []).filter(p => p.promedio != null);
  const mejor = conPromedio.length ? conPromedio.reduce((a, b) => (b.promedio! > a.promedio! ? b : a)) : null;
  const peor = conPromedio.length ? conPromedio.reduce((a, b) => (b.promedio! < a.promedio! ? b : a)) : null;

  async function alExportar() {
    setExportando(true);
    try { await exportarCsv(pestana); } catch (err) { setError(mainAuthErrorMessage(err)); } finally { setExportando(false); }
  }

  return (
    <section className="ro">
      <header className="ro-cabecera">
        <div>
          <h2 className="ro-titulo">Opinión de los usuarios</h2>
          <p className="ro-sub">Lo que estudiantes y docentes califican de 1 (muy malo) a 5 (excelente) en cada sección. Cada usuario cuenta una vez: si cambia su opinión, se actualiza.</p>
        </div>
        <div className="ro-acciones">
          <button type="button" className="adm-btn adm-btn-sm" onClick={() => setRecarga(n => n + 1)} disabled={cargando}>
            <RefreshCw size={14} /> Actualizar
          </button>
          <button type="button" className="adm-btn adm-btn-sm" onClick={alExportar} disabled={exportando || !datos?.total}>
            <Download size={14} /> {exportando ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </header>

      <div className="ro-pestanas" role="tablist" aria-label="Sección evaluada">
        {PESTANAS.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id}
            className={`ro-pestana${pestana === p.id ? ' is-activa' : ''}`} onClick={() => setPestana(p.id)}>
            {p.nombre}
          </button>
        ))}
      </div>

      {error && <p className="adm-error">{error}</p>}

      {cargando && !datos ? (
        <p className="adm-vacio">Cargando resultados…</p>
      ) : datos && datos.total === 0 ? (
        <div className="ro-vacio">
          <MessageSquareText size={34} />
          <p>Todavía nadie ha dado su opinión sobre esta sección.</p>
        </div>
      ) : datos && (
        <div className={cargando ? 'ro-cuerpo is-cargando' : 'ro-cuerpo'}>
          <div className="ro-kpis">
            <div className="ro-kpi">
              <span className="ro-kpi-ico"><Users size={18} /></span>
              <strong>{datos.total}</strong>
              <span>{datos.total === 1 ? 'persona respondió' : 'personas respondieron'}</span>
            </div>
            <div className={`ro-kpi ${tono(datos.promedio_general)}`}>
              <span className="ro-kpi-ico"><Star size={18} /></span>
              <strong>{decimal(datos.promedio_general)} <small>/ 5</small></strong>
              <span>promedio general</span>
            </div>
            <div className="ro-kpi">
              <span className="ro-kpi-ico ro-t5">▲</span>
              <strong className="ro-kpi-txt">{mejor ? etiquetas[mejor.key] ?? mejor.key : '—'}</strong>
              <span>mejor valorada · {decimal(mejor?.promedio)}</span>
            </div>
            <div className="ro-kpi">
              <span className="ro-kpi-ico ro-t1">▼</span>
              <strong className="ro-kpi-txt">{peor ? etiquetas[peor.key] ?? peor.key : '—'}</strong>
              <span>a mejorar · {decimal(peor?.promedio)}</span>
            </div>
          </div>

          <div className="ro-bloque">
            <div className="ro-bloque-cab">
              <h3>Resultados por pregunta</h3>
              <label className="ro-orden">
                Ordenar
                <select value={orden} onChange={e => setOrden(e.target.value as typeof orden)}>
                  <option value="formulario">Como en el formulario</option>
                  <option value="peor">Peor valoradas primero</option>
                  <option value="mejor">Mejor valoradas primero</option>
                </select>
              </label>
            </div>
            <div className="ro-leyenda" aria-hidden="true">
              {ESCALA_OPINION.map(e => <span key={e.valor}><i className={`ro-c${e.valor}`} />{e.valor} {e.texto}</span>)}
            </div>
            <ol className="ro-preguntas">
              {preguntas.map(p => (
                <li key={p.key} className="ro-preg">
                  <div className="ro-preg-cab">
                    <span className="ro-preg-num">{p.numero}</span>
                    <span className="ro-preg-txt">{etiquetas[p.key] ?? p.key}</span>
                    <span className={`ro-preg-prom ${tono(p.promedio)}`}>{decimal(p.promedio)}</span>
                  </div>
                  <div className="ro-barra" role="img"
                    aria-label={ESCALA_OPINION.map(e => `${e.texto}: ${p.distribucion[String(e.valor) as '1']}`).join(', ')}>
                    {ESCALA_OPINION.map(e => {
                      const n = p.distribucion[String(e.valor) as '1'] ?? 0;
                      const pct = p.respuestas ? (n / p.respuestas) * 100 : 0;
                      return pct > 0 ? (
                        <span key={e.valor} className={`ro-c${e.valor}`} style={{ width: `${pct}%` }}
                          title={`${e.valor} · ${e.texto}: ${n} (${Math.round(pct)} %)`}>
                          {pct >= 9 ? `${Math.round(pct)}%` : ''}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <span className="ro-preg-n">{p.respuestas} {p.respuestas === 1 ? 'respuesta' : 'respuestas'}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="ro-bloque">
            <div className="ro-bloque-cab">
              <h3>Comentarios <span className="ro-cuenta">{datos.comentarios.length}</span></h3>
              {datos.comentarios.length > 0 && (
                <label className="ro-buscar">
                  <Search size={14} />
                  <input type="search" placeholder="Buscar en comentarios" value={buscar} onChange={e => setBuscar(e.target.value)} />
                </label>
              )}
            </div>
            {datos.comentarios.length === 0 ? (
              <p className="adm-vacio">Nadie dejó comentarios escritos todavía.</p>
            ) : comentarios.length === 0 ? (
              <p className="adm-vacio">Ningún comentario coincide con «{buscar}».</p>
            ) : (
              <ul className="ro-comentarios">
                {comentarios.map((c, i) => (
                  <li key={i} className="ro-comentario">
                    <p>{c.texto}</p>
                    <span>
                      {c.usuario ?? 'Usuario'}
                      {c.fecha && ` · ${new Date(c.fecha).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
