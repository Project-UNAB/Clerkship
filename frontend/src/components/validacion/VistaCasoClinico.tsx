import { useState } from 'react';
import { Activity, Bot, ClipboardList, EyeOff, FlaskConical, Lock, MessageSquare, Stethoscope, UserRound } from 'lucide-react';
import type { VistaCaso } from '../../data/validacionApi';
import { DIFICULTADES } from '../../data/revisionCasosForms';
import '../../styles/vistaCaso.css';

type Pestana = 'caso' | 'consulta' | 'evaluacion';

const SIGNOS: Record<string, string> = { TA: 'Tensión arterial', FC: 'Frecuencia cardiaca', FR: 'Frecuencia respiratoria', temp: 'Temperatura', SatO2: 'Saturación de O₂' };
const RUBRICA: Record<string, string> = {
  preguntas_clave_anamnesis: 'Preguntas clave de la anamnesis',
  hallazgos_que_debia_indagar: 'Hallazgos que debía indagar',
  diagnosticos_diferenciales_esperados: 'Diagnósticos diferenciales esperados',
  examenes_pertinentes: 'Exámenes pertinentes',
};
const NIVEL: Record<string, string> = {
  alta: 'Alta', media: 'Media', baja: 'Baja', nula: 'Nula',
  adecuado: 'Adecuado', parcial: 'Parcial', inadecuado: 'Inadecuado', ausente: 'Ausente',
  excelente: 'Excelente', adecuada: 'Adecuada', mejorable: 'Mejorable', deficiente: 'Deficiente',
};

function Lista({ titulo, items, tono }: { titulo: string; items?: string[]; tono?: 'bien' | 'mal' | 'neutro' }) {
  if (!items?.length) return null;
  return (
    <div className={`vc-lista is-${tono ?? 'neutro'}`}>
      <h5>{titulo}</h5>
      <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

function Hallazgos({ titulo, icono, items }: { titulo: string; icono: React.ReactNode; items: VistaCaso['examen_fisico'] }) {
  if (!items.length) return null;
  return (
    <section className="vc-bloque">
      <h4>{icono}{titulo}</h4>
      <dl className="vc-hallazgos">
        {items.map(h => (
          <div key={h.clave} className={h.alterado ? 'is-alterado' : ''}>
            <dt>{h.etiqueta}{h.alterado && <span className="vc-chip-alterado">Alterado</span>}</dt>
            <dd>{h.resultado}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Caso clínico simulado y anonimizado: el caso, lo que hizo el estudiante y la
 *  evaluación automática (oculta hasta que el experto da su propio puntaje). */
export default function VistaCasoClinico({ caso }: { caso: VistaCaso }) {
  const [pestana, setPestana] = useState<Pestana>('caso');
  const p = caso.paciente;
  const ev = caso.evaluacion;
  const oculta = Boolean(caso.evaluacion_oculta);

  return (
    <div className="vc">
      <div className="vc-cabecera">
        <div>
          <span className="vc-kicker">{caso.especialidad} · {DIFICULTADES[caso.dificultad] ?? caso.dificultad}</span>
          <h3>{caso.subtema ?? 'Caso clínico'}</h3>
          <p>
            Paciente virtual: {[p.edad != null && `${p.edad} años`, p.sexo === 'F' ? 'mujer' : p.sexo === 'M' ? 'hombre' : p.sexo, p.ocupacion, p.peso_kg && `${p.peso_kg} kg`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="vc-diagnostico">
          <span>Diagnóstico del caso</span>
          <strong>{caso.diagnostico_real ?? '—'}</strong>
        </div>
      </div>

      <div className="vc-pestanas" role="tablist">
        <button type="button" role="tab" aria-selected={pestana === 'caso'} className={pestana === 'caso' ? 'is-activa' : ''} onClick={() => setPestana('caso')}>
          <ClipboardList size={15} /> Caso y paciente
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'consulta'} className={pestana === 'consulta' ? 'is-activa' : ''} onClick={() => setPestana('consulta')}>
          <MessageSquare size={15} /> Lo que hizo el estudiante
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'evaluacion'} className={pestana === 'evaluacion' ? 'is-activa' : ''} onClick={() => setPestana('evaluacion')}>
          {oculta ? <Lock size={15} /> : <Bot size={15} />} Evaluación automática
        </button>
      </div>

      {pestana === 'caso' && (
        <div className="vc-cuerpo">
          {caso.presentacion_inicial && (
            <section className="vc-bloque">
              <h4><UserRound size={16} />Presentación inicial</h4>
              <p className="vc-texto">{caso.presentacion_inicial}</p>
              {(caso.personalidad_paciente || caso.estado_emocional_inicial) && (
                <p className="vc-nota">{[caso.personalidad_paciente && `Personalidad: ${caso.personalidad_paciente}`, caso.estado_emocional_inicial && `Estado emocional: ${caso.estado_emocional_inicial}`].filter(Boolean).join(' · ')}</p>
              )}
            </section>
          )}
          <div className="vc-dos">
            <Lista titulo="Síntomas principales" items={caso.sintomas_principales} />
            <Lista titulo="Antecedentes" items={caso.antecedentes} />
          </div>
          {Object.keys(caso.signos_vitales).length > 0 && (
            <section className="vc-bloque">
              <h4><Activity size={16} />Signos vitales</h4>
              <div className="vc-signos">
                {Object.entries(caso.signos_vitales).map(([k, v]) => <div key={k}><span>{SIGNOS[k] ?? k}</span><strong>{v}</strong></div>)}
              </div>
            </section>
          )}
          <Hallazgos titulo="Examen físico" icono={<Stethoscope size={16} />} items={caso.examen_fisico} />
          <Hallazgos titulo="Paraclínicos" icono={<FlaskConical size={16} />} items={caso.paraclinicos} />
          <section className="vc-bloque">
            <h4><EyeOff size={16} />Lo que el estudiante debía descubrir</h4>
            <Lista titulo="Hallazgos ocultos (el paciente solo los cuenta si le preguntan)" items={caso.hallazgos_ocultos} />
            {Object.entries(caso.rubrica).map(([k, v]) => <Lista key={k} titulo={RUBRICA[k] ?? k} items={v} />)}
          </section>
        </div>
      )}

      {pestana === 'consulta' && (
        <div className="vc-cuerpo">
          <section className="vc-bloque">
            <h4><MessageSquare size={16} />Conversación con el paciente virtual</h4>
            <p className="vc-nota">El nombre del estudiante se reemplaza por «[Estudiante]».</p>
            <ol className="vc-chat">
              {caso.conversacion.map((m, i) => (
                <li key={i} className={`vc-msg is-${m.quien.toLowerCase()}${m.exploracion ? ' is-exploracion' : ''}`}>
                  <span className="vc-msg-quien">{m.exploracion ? 'Exploración' : m.quien === 'ESTUDIANTE' ? 'Estudiante' : m.quien === 'PACIENTE' ? 'Paciente' : 'Sistema'}</span>
                  <p>{m.texto}</p>
                </li>
              ))}
              {!caso.conversacion.length && <li className="vc-nota">Sin mensajes.</li>}
            </ol>
          </section>
          <section className="vc-bloque">
            <h4><FlaskConical size={16} />Exámenes que pidió ({caso.acciones.length})</h4>
            {caso.acciones.length ? (
              <div className="vc-acciones">{caso.acciones.map((a, i) => <span key={i} className={`is-${a.tipo}`}>{a.etiqueta}</span>)}</div>
            ) : <p className="vc-nota">No pidió exámenes ni exploraciones.</p>}
          </section>
          <section className="vc-bloque vc-respuesta">
            <h4><ClipboardList size={16} />Lo que entregó al cerrar la consulta</h4>
            {caso.respuesta_estudiante ? (
              <dl>
                <div><dt>Diagnóstico propuesto</dt><dd>{caso.respuesta_estudiante.hipotesis || '—'}</dd></div>
                <div><dt>Diferenciales</dt><dd>{caso.respuesta_estudiante.diferenciales.join(' · ') || '—'}</dd></div>
                <div><dt>Plan</dt><dd>{caso.respuesta_estudiante.plan || '—'}</dd></div>
              </dl>
            ) : (
              <p className="vc-nota">Esta consulta es anterior a que la plataforma guardara la respuesta del estudiante; lo que propuso se refleja en la evaluación automática.</p>
            )}
          </section>
        </div>
      )}

      {pestana === 'evaluacion' && (
        <div className="vc-cuerpo">
          {oculta || !ev ? (
            <div className="vc-bloqueada">
              <Lock size={30} />
              <h4>{oculta ? 'Primero da tu propio puntaje' : 'Sin evaluación registrada'}</h4>
              <p>{oculta
                ? 'Para que tu juicio no se ancle al de la plataforma, la evaluación automática se muestra después de que registres el puntaje que tú le darías al estudiante.'
                : 'Esta consulta no tiene evaluación automática guardada.'}</p>
            </div>
          ) : (
            <>
              <section className="vc-bloque vc-puntaje">
                <div className="vc-puntaje-global"><strong>{Math.round(ev.puntaje_global)}</strong><span>/ 100</span></div>
                <div className="vc-desglose">
                  {ev.desglose.map(d => (
                    <div key={d.dimension}>
                      <span>{d.etiqueta} <small>({d.peso} %)</small></span>
                      <div className="vc-barra"><i style={{ width: `${d.puntaje}%` }} /></div>
                      <strong>{Math.round(d.puntaje)}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <div className="vc-dos">
                <Lista titulo="Preguntas clave cubiertas" items={ev.preguntas_clave_cubiertas} tono="bien" />
                <Lista titulo="Preguntas clave omitidas" items={ev.preguntas_clave_omitidas} tono="mal" />
                <Lista titulo="Hallazgos bien indagados" items={ev.hallazgos_indagados_correctamente} tono="bien" />
                <Lista titulo="Hallazgos no indagados" items={ev.hallazgos_no_indagados} tono="mal" />
                <Lista titulo="Exámenes pertinentes realizados" items={ev.exploracion?.pertinentes_realizados} tono="bien" />
                <Lista titulo="Exámenes pertinentes omitidos" items={ev.exploracion?.pertinentes_omitidos} tono="mal" />
                <Lista titulo="Paraclínicos no pertinentes" items={ev.exploracion?.paraclinicos_no_pertinentes} tono="mal" />
                <Lista titulo="Diferenciales pertinentes" items={ev.diferenciales_pertinentes} tono="bien" />
                <Lista titulo="Diferenciales faltantes" items={ev.diferenciales_faltantes} tono="mal" />
              </div>
              <section className="vc-bloque vc-juicios">
                <div><span>Concordancia del diagnóstico</span><strong>{NIVEL[ev.concordancia_hipotesis] ?? ev.concordancia_hipotesis}</strong><p>{ev.comentario_hipotesis}</p></div>
                <div><span>Calidad del plan</span><strong>{NIVEL[ev.calidad_plan] ?? ev.calidad_plan}</strong><p>{ev.comentario_plan}</p></div>
                <div><span>Comunicación</span><strong>{NIVEL[ev.comunicacion] ?? ev.comunicacion}</strong><p>{ev.comentario_comunicacion}</p></div>
              </section>
              <div className="vc-dos">
                <Lista titulo="Fortalezas" items={ev.fortalezas} tono="bien" />
                <Lista titulo="Aspectos a mejorar" items={ev.aspectos_a_mejorar} tono="mal" />
              </div>
              {ev.retroalimentacion_formativa && (
                <section className="vc-bloque">
                  <h4><Bot size={16} />Retroalimentación que recibió el estudiante</h4>
                  <p className="vc-texto">{ev.retroalimentacion_formativa}</p>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
