import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import {
  Zap, Bot, Sparkles, Clock, MoreHorizontal, Calendar,
  Award, User, RefreshCw, Layers, Activity, Gauge
} from 'lucide-react';
import type { EstadisticasTokens, NombreAgente } from '../../data/adminApi';

interface TokensDashboardProps {
  tokens: EstadisticasTokens;
  onRefresh?: () => void;
}

const AGENT_COLORS: Record<NombreAgente, string> = {
  GENERADOR: '#0ea5e9',
  PACIENTE: '#8b5cf6',
  EVALUADOR: '#f97316',
};

const AGENT_NAMES: Record<NombreAgente, string> = {
  GENERADOR: 'Agente 1 · Generador de casos',
  PACIENTE: 'Agente 2 · Paciente virtual',
  EVALUADOR: 'Agente 3 · Evaluador',
};

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString('es-CO');
}

const CustomAreaTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="adm-custom-tooltip">
        <p className="adm-tooltip-date">{label}</p>
        <div className="adm-tooltip-total">
          <span>Tokens totales:</span>
          <strong>{Number(data.total || 0).toLocaleString('es-CO')}</strong>
        </div>
        <div className="adm-tooltip-divider" />
        <div className="adm-tooltip-items">
          <div className="adm-tooltip-item">
            <span className="adm-tooltip-dot" style={{ background: AGENT_COLORS.GENERADOR }} />
            <span>Generador:</span>
            <strong>{Number(data.GENERADOR || 0).toLocaleString('es-CO')}</strong>
          </div>
          <div className="adm-tooltip-item">
            <span className="adm-tooltip-dot" style={{ background: AGENT_COLORS.PACIENTE }} />
            <span>Paciente:</span>
            <strong>{Number(data.PACIENTE || 0).toLocaleString('es-CO')}</strong>
          </div>
          <div className="adm-tooltip-item">
            <span className="adm-tooltip-dot" style={{ background: AGENT_COLORS.EVALUADOR }} />
            <span>Evaluador:</span>
            <strong>{Number(data.EVALUADOR || 0).toLocaleString('es-CO')}</strong>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function TokensDashboard({ tokens, onRefresh }: TokensDashboardProps) {
  const totalTokens = tokens.general.total_tokens;
  const promptTokens = tokens.general.prompt_tokens;
  const completionTokens = tokens.general.completion_tokens;
  const totalLlamadas = tokens.general.llamadas;
  const llamadasReales = tokens.general.llamadas_reales;
  const llamadasMock = tokens.general.llamadas_mock;

  const pctReales = totalLlamadas > 0 ? Math.round((llamadasReales / totalLlamadas) * 100) : 0;
  const pctMock = totalLlamadas > 0 ? Math.round((llamadasMock / totalLlamadas) * 100) : 0;

  /* ── 1. Serie diaria para el gráfico grande ── */
  const chartData = useMemo(() => {
    if (!tokens.serie_diaria || tokens.serie_diaria.length === 0) return [];
    return tokens.serie_diaria.map((d, index, arr) => {
      const windowStart = Math.max(0, index - 2);
      const windowItems = arr.slice(windowStart, index + 1);
      const avg = Math.round(
        windowItems.reduce((acc, curr) => acc + curr.total, 0) / windowItems.length
      );
      const dateParts = d.fecha.split('-');
      const shortDate = dateParts.length >= 3 ? `${dateParts[2]}/${dateParts[1]}` : d.fecha;

      return {
        ...d,
        displayDate: shortDate,
        promedioMovil: avg,
      };
    });
  }, [tokens.serie_diaria]);

  /* ── 2. Distribución en Dona por Agente ── */
  const donutData = useMemo(() => {
    const list: NombreAgente[] = ['GENERADOR', 'PACIENTE', 'EVALUADOR'];
    const total = list.reduce((acc, k) => acc + (tokens.por_agente[k]?.total_tokens || 0), 0);

    return list.map(k => {
      const valor = tokens.por_agente[k]?.total_tokens || 0;
      const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
      return {
        key: k,
        name: AGENT_NAMES[k],
        value: valor,
        percentage: pct,
        color: AGENT_COLORS[k],
      };
    });
  }, [tokens.por_agente]);

  /* ── 3. Lista de Agentes con barra de progreso ── */
  const rankingAgentes = useMemo(() => {
    const list = (['GENERADOR', 'PACIENTE', 'EVALUADOR'] as NombreAgente[]).map(k => {
      const ag = tokens.por_agente[k] || {
        llamadas: 0,
        llamadas_reales: 0,
        llamadas_mock: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        latencia_prom_ms: null,
      };
      return {
        key: k,
        name: AGENT_NAMES[k],
        shortName: k === 'GENERADOR' ? 'Generador de Casos' : k === 'PACIENTE' ? 'Paciente Virtual' : 'Evaluador Clínico',
        tokens: ag.total_tokens,
        prompt: ag.prompt_tokens,
        completion: ag.completion_tokens,
        llamadas: ag.llamadas,
        reales: ag.llamadas_reales,
        mock: ag.llamadas_mock,
        latencia: ag.latencia_prom_ms,
        color: AGENT_COLORS[k],
        icon: k === 'GENERADOR' ? Sparkles : k === 'PACIENTE' ? User : Award,
      };
    });

    const max = Math.max(1, ...list.map(a => a.tokens));
    const total = Math.max(1, list.reduce((acc, a) => acc + a.tokens, 0));

    return list
      .sort((a, b) => b.tokens - a.tokens)
      .map(a => ({
        ...a,
        percentOfMax: Math.round((a.tokens / max) * 100),
        percentOfTotal: Math.round((a.tokens / total) * 100),
      }));
  }, [tokens.por_agente]);

  /* ── 4. Medidor de llamadas ── */
  const gaugeData = useMemo(() => {
    return [
      { name: 'Llamadas Reales', value: llamadasReales, color: '#10b981' },
      { name: 'Llamadas Mock', value: llamadasMock, color: '#cbd5e1' },
    ];
  }, [llamadasReales, llamadasMock]);

  /* ── 5. Latencia de agentes ── */
  const latencyData = useMemo(() => {
    return (['GENERADOR', 'PACIENTE', 'EVALUADOR'] as NombreAgente[]).map(k => {
      const ms = tokens.por_agente[k]?.latencia_prom_ms;
      const seg = ms !== null && ms !== undefined ? parseFloat((ms / 1000).toFixed(2)) : 0;
      return {
        name: k === 'GENERADOR' ? 'Generador' : k === 'PACIENTE' ? 'Paciente' : 'Evaluador',
        seconds: seg,
        color: AGENT_COLORS[k],
      };
    });
  }, [tokens.por_agente]);

  const avgLatency = useMemo(() => {
    const latencias = Object.values(tokens.por_agente)
      .map(a => a.latencia_prom_ms)
      .filter((v): v is number => v !== null && v !== undefined && v > 0);
    if (latencias.length === 0) return '0.0s';
    const sum = latencias.reduce((a, b) => a + b, 0);
    return `${(sum / latencias.length / 1000).toFixed(1)}s`;
  }, [tokens.por_agente]);

  return (
    <div className="adm-analytics-container">
      {/* ── Encabezado ── */}
      <div className="adm-header-row">
        <div className="adm-header-title-box">
          <h1 className="adm-analytics-title">Telemetría de Modelos y Tokens</h1>
          <p className="adm-analytics-subtitle">Estadísticas exclusivas de consumo de tokens, llamadas a agentes e inferencia de IA</p>
        </div>

        <div className="adm-header-actions">
          <div className="adm-pill-date-range">
            <Calendar size={15} />
            <span>Últimos 14 días</span>
          </div>

          {onRefresh && (
            <button type="button" className="adm-action-refresh-btn" onClick={onRefresh} title="Actualizar datos">
              <RefreshCw size={15} />
              <span>Actualizar</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Fila de KPIs de Tokens y Agentes (6 Tarjetas Redondeadas) ── */}
      <div className="adm-kpi-grid">
        {/* KPI 1: Tokens Totales */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#f3e8ff', color: '#9333ea' }}>
              <Zap size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Tokens Totales</span>
              <span className="adm-kpi-sublabel">Volumen total consumido</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{totalTokens.toLocaleString('es-CO')}</span>
            <div className="adm-kpi-badge purple">
              <span>{formatCompactNumber(totalTokens)} total</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Tokens Entrada */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#e0f2fe', color: '#0284c7' }}>
              <Layers size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Tokens Entrada</span>
              <span className="adm-kpi-sublabel">Prompt / Contexto enviado</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{promptTokens.toLocaleString('es-CO')}</span>
            <div className="adm-kpi-badge neutral">
              <span>{totalTokens > 0 ? Math.round((promptTokens / totalTokens) * 100) : 0}% del total</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Tokens Salida */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#dcfce7', color: '#16a34a' }}>
              <Sparkles size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Tokens Salida</span>
              <span className="adm-kpi-sublabel">Completion generada por IA</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{completionTokens.toLocaleString('es-CO')}</span>
            <div className="adm-kpi-badge positive">
              <span>{totalTokens > 0 ? Math.round((completionTokens / totalTokens) * 100) : 0}% del total</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Total Llamadas */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#ffedd5', color: '#ea580c' }}>
              <Bot size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Total Llamadas</span>
              <span className="adm-kpi-sublabel">Peticiones a agentes</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{totalLlamadas.toLocaleString('es-CO')}</span>
            <div className="adm-kpi-badge neutral">
              <span>{totalLlamadas} ejecuciones</span>
            </div>
          </div>
        </div>

        {/* KPI 5: Llamadas Reales */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#fce7f3', color: '#db2777' }}>
              <Activity size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Llamadas Reales</span>
              <span className="adm-kpi-sublabel">API de IA en vivo</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{llamadasReales.toLocaleString('es-CO')}</span>
            <div className={`adm-kpi-badge ${pctReales > 0 ? 'positive' : 'warning'}`}>
              <span>{pctReales}% en vivo</span>
            </div>
          </div>
        </div>

        {/* KPI 6: Llamadas Mock */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#f1f5f9', color: '#64748b' }}>
              <Gauge size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Llamadas Mock</span>
              <span className="adm-kpi-sublabel">Modo de prueba local</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{llamadasMock.toLocaleString('es-CO')}</span>
            <div className="adm-kpi-badge neutral">
              <span>{pctMock}% simuladas</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tarjetas Individuales Detalladas de los 3 Agentes Clínicos ── */}
      <div className="adm-agent-detail-grid">
        {rankingAgentes.map(ag => {
          const IconComp = ag.icon;
          const latenciaStr = ag.latencia !== null ? `${(ag.latencia / 1000).toFixed(2)}s` : '—';
          return (
            <div key={ag.key} className="adm-agent-detail-card" style={{ borderTop: `3px solid ${ag.color}` }}>
              <div className="adm-agent-card-head">
                <div className="adm-agent-card-avatar" style={{ background: `${ag.color}15`, color: ag.color }}>
                  <IconComp size={20} strokeWidth={2.2} />
                </div>
                <div>
                  <h3 className="adm-agent-card-title">{ag.name}</h3>
                  <span className="adm-agent-card-role">{ag.shortName}</span>
                </div>
              </div>

              <div className="adm-agent-card-main-stat">
                <span className="adm-agent-card-tokens-big">{ag.tokens.toLocaleString('es-CO')}</span>
                <span className="adm-agent-card-tokens-lbl">Tokens totales</span>
              </div>

              <div className="adm-agent-metrics-row">
                <div className="adm-agent-metric-box">
                  <span className="adm-amb-lbl">Entrada (Prompt)</span>
                  <strong className="adm-amb-val">{ag.prompt.toLocaleString('es-CO')}</strong>
                </div>
                <div className="adm-agent-metric-box">
                  <span className="adm-amb-lbl">Salida (Completion)</span>
                  <strong className="adm-amb-val">{ag.completion.toLocaleString('es-CO')}</strong>
                </div>
                <div className="adm-agent-metric-box">
                  <span className="adm-amb-lbl">Llamadas (Real / Mock)</span>
                  <strong className="adm-amb-val">{ag.reales} / {ag.mock}</strong>
                </div>
                <div className="adm-agent-metric-box">
                  <span className="adm-amb-lbl">Latencia promedio</span>
                  <strong className="adm-amb-val">{latenciaStr}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Fila de Gráficas: Balance Overview + Dona ── */}
      <div className="adm-charts-row-main">
        {/* Balance Overview */}
        <div className="adm-chart-card adm-card-large">
          <div className="adm-card-head">
            <div className="adm-card-head-titles">
              <h2 className="adm-card-title">Balance de Consumo de Tokens</h2>
              <p className="adm-card-sub">Actividad diaria acumulada y promedio móvil de los agentes</p>
            </div>
            <span className="adm-card-range-pill">Últimos 14 días</span>
          </div>

          <div className="adm-chart-container" style={{ height: 280 }}>
            {chartData.length === 0 || chartData.every(d => d.total === 0) ? (
              <div className="adm-chart-empty">
                <Clock size={32} />
                <p>Sin uso de tokens registrado en los últimos 14 días.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tokenGradientTotalT" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="tokenGradientAvgT" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border, #e2e8f0)" opacity={0.6} />
                  <XAxis
                    dataKey="displayDate"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--ink3, #64748b)', fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatCompactNumber}
                    tick={{ fill: 'var(--ink3, #64748b)', fontSize: 11 }}
                  />
                  <Tooltip content={<CustomAreaTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Tokens del día"
                    stroke="#f97316"
                    strokeWidth={2.4}
                    fillOpacity={1}
                    fill="url(#tokenGradientTotalT)"
                  />
                  <Area
                    type="monotone"
                    dataKey="promedioMovil"
                    name="Tendencia (Prom. Móvil)"
                    stroke="#0284c7"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#tokenGradientAvgT)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="adm-chart-bottom-legend">
            <div className="adm-legend-item">
              <span className="adm-legend-line" style={{ background: '#f97316' }} />
              <span>Consumo diario total</span>
            </div>
            <div className="adm-legend-item">
              <span className="adm-legend-line dashed" style={{ background: '#0284c7' }} />
              <span>Tendencia promedio móvil</span>
            </div>
          </div>
        </div>

        {/* Dona por Agente */}
        <div className="adm-chart-card adm-card-donut">
          <div className="adm-card-head">
            <div className="adm-card-head-titles">
              <h2 className="adm-card-title">Distribución por Agente</h2>
              <p className="adm-card-sub">Participación porcentual en tokens</p>
            </div>
            <span className="adm-card-range-pill">General</span>
          </div>

          <div className="adm-donut-flex-wrap">
            <div className="adm-donut-left-chart" style={{ width: 170, height: 170 }}>
              {totalTokens === 0 ? (
                <div className="adm-donut-empty">
                  <span>0 Tokens</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      stroke="var(--surface, #fff)"
                      strokeWidth={2}
                    >
                      {donutData.map(entry => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="adm-donut-right-legend">
              {donutData.map(d => (
                <div key={d.key} className="adm-donut-row">
                  <div className="adm-donut-row-left">
                    <span className="adm-donut-indicator-dot" style={{ background: d.color }} />
                    <div className="adm-donut-name-meta">
                      <span className="adm-donut-agent-title">{d.name}</span>
                      <span className="adm-donut-agent-sub">{formatCompactNumber(d.value)} tokens</span>
                    </div>
                  </div>
                  <span className="adm-donut-pct">{d.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Fila Inferior: Ranking de Agentes + Medidor Gauge + Latencia ── */}
      <div className="adm-charts-row-bottom">
        {/* Top Spending Agents */}
        <div className="adm-chart-card adm-card-bottom-col">
          <div className="adm-card-head">
            <div className="adm-card-head-titles">
              <h2 className="adm-card-title">Consumo de Agentes</h2>
              <p className="adm-card-sub">Carga de trabajo relativa</p>
            </div>
            <span className="adm-card-range-pill">Tokens</span>
          </div>

          <div className="adm-top-agents-list">
            {rankingAgentes.map(ag => {
              const IconComp = ag.icon;
              return (
                <div key={ag.key} className="adm-agent-row">
                  <div className="adm-agent-icon-box" style={{ background: `${ag.color}18`, color: ag.color }}>
                    <IconComp size={16} strokeWidth={2.2} />
                  </div>
                  <div className="adm-agent-row-center">
                    <div className="adm-agent-names">
                      <span className="adm-agent-short-name">{ag.shortName}</span>
                      <span className="adm-agent-calls-count">Prompt: {formatCompactNumber(ag.prompt)} · Comp: {formatCompactNumber(ag.completion)}</span>
                    </div>
                    <div className="adm-agent-bar-track">
                      <div
                        className="adm-agent-bar-fill"
                        style={{
                          width: `${ag.percentOfMax}%`,
                          background: ag.color,
                        }}
                      />
                    </div>
                  </div>
                  <div className="adm-agent-row-right">
                    <span className="adm-agent-tokens-val">{formatCompactNumber(ag.tokens)}</span>
                    <span className="adm-agent-tokens-pct">({ag.percentOfTotal}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Medidor (Gauge) */}
        <div className="adm-chart-card adm-card-bottom-col">
          <div className="adm-card-head">
            <div className="adm-card-head-titles">
              <h2 className="adm-card-title">Llamadas: Reales vs Mock</h2>
              <p className="adm-card-sub">Monitoreo de simulación</p>
            </div>
            <span className="adm-card-range-pill">Motor IA</span>
          </div>

          <div className="adm-gauge-content">
            <div className="adm-gauge-chart-box" style={{ width: 220, height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={totalLlamadas === 0 ? [{ name: 'Vacio', value: 1, color: '#e2e8f0' }] : gaugeData}
                    cx="50%"
                    cy="100%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {totalLlamadas === 0 ? (
                      <Cell fill="#e2e8f0" />
                    ) : (
                      gaugeData.map(entry => <Cell key={entry.name} fill={entry.color} />)
                    )}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="adm-gauge-center-label">
                <span className="adm-gauge-center-num">{totalLlamadas}</span>
                <span className="adm-gauge-center-text">Total llamadas</span>
              </div>
            </div>

            <div className="adm-gauge-metrics-footer">
              <div className="adm-gauge-metric-item">
                <div className="adm-gauge-dot" style={{ background: '#10b981' }} />
                <div className="adm-gauge-metric-texts">
                  <span className="adm-gauge-metric-lbl">Llamadas Reales</span>
                  <strong className="adm-gauge-metric-val">{llamadasReales} ({pctReales}%)</strong>
                </div>
              </div>

              <div className="adm-gauge-metric-item">
                <div className="adm-gauge-dot" style={{ background: '#94a3b8' }} />
                <div className="adm-gauge-metric-texts">
                  <span className="adm-gauge-metric-lbl">Llamadas Mock</span>
                  <strong className="adm-gauge-metric-val">{llamadasMock} ({pctMock}%)</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Latencia */}
        <div className="adm-chart-card adm-card-bottom-col">
          <div className="adm-card-head">
            <div className="adm-card-head-titles">
              <h2 className="adm-card-title">Tiempo de Respuesta</h2>
              <p className="adm-card-sub">Latencia promedio por agente</p>
            </div>
            <span className="adm-card-range-pill">{avgLatency} prom.</span>
          </div>

          <div className="adm-latency-chart-box" style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border, #e2e8f0)" opacity={0.6} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--ink3, #64748b)', fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v}s`}
                  tick={{ fill: 'var(--ink3, #64748b)', fontSize: 11 }}
                />
                <Tooltip
                  formatter={(val: any) => [`${val} segundos`, 'Latencia']}
                  contentStyle={{
                    backgroundColor: 'var(--surface, #fff)',
                    borderRadius: 10,
                    border: '1px solid var(--border, #e2e8f0)',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="seconds" radius={[6, 6, 0, 0]}>
                  {latencyData.map(entry => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="adm-latency-footer">
            <span className="adm-latency-foot-tip">Latencia media calculada a partir de los registros de telemetría del servidor.</span>
          </div>
        </div>
      </div>

      {/* ── Desglose de Proveedores de IA ── */}
      <div className="adm-providers-card">
        <div className="adm-card-head">
          <div className="adm-card-head-titles">
            <h2 className="adm-card-title">Proveedores de Modelos de Lenguaje</h2>
            <p className="adm-card-sub">Distribución de llamadas por infraestructura proveedora</p>
          </div>
        </div>
        <div className="adm-providers-grid">
          {Object.entries(tokens.por_proveedor).map(([prov, count]) => {
            const pct = totalLlamadas > 0 ? Math.round((count / totalLlamadas) * 100) : 0;
            return (
              <div key={prov} className="adm-provider-item">
                <div className="adm-provider-top">
                  <span className="adm-provider-name">{prov}</span>
                  <span className="adm-provider-count">{count} llamadas ({pct}%)</span>
                </div>
                <div className="adm-agent-bar-track">
                  <div className="adm-agent-bar-fill" style={{ width: `${pct}%`, background: prov.includes('Gemini') ? '#0ea5e9' : prov.includes('OpenRouter') ? '#8b5cf6' : '#94a3b8' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
