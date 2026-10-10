import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import {
  Users, Stethoscope, Zap, Bot, GraduationCap, Sparkles,
  ArrowUpRight, Clock, MoreHorizontal, Calendar,
  HardDrive, ShieldCheck, MessageSquare,
  Award, User, RefreshCw
} from 'lucide-react';
import type { Estadisticas, EstadisticasTokens, NombreAgente } from '../../data/adminApi';

interface AnalyticsDashboardProps {
  estadisticas: Estadisticas;
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

/* ── Custom Tooltip para Balance Overview ── */
interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomAreaTooltip = ({ active, payload, label }: CustomTooltipProps) => {
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

export default function AnalyticsDashboard({ estadisticas, tokens, onRefresh }: AnalyticsDashboardProps) {
  /* ── 1. Cálculos de KPIs ── */
  const totalUsuarios = estadisticas.usuarios.total;
  const usuariosActivos = estadisticas.usuarios.activos;
  const pctActivos = totalUsuarios > 0 ? Math.round((usuariosActivos / totalUsuarios) * 100) : 0;

  const totalCasos = estadisticas.casos_clinicos.total;
  const casosSemana = estadisticas.casos_clinicos.ultimos_7_dias;

  const totalTokens = tokens.general.total_tokens;
  const totalLlamadas = tokens.general.llamadas;
  const llamadasReales = tokens.general.llamadas_reales;
  const llamadasMock = tokens.general.llamadas_mock;

  const pctReales = totalLlamadas > 0 ? Math.round((llamadasReales / totalLlamadas) * 100) : 0;
  const pctMock = totalLlamadas > 0 ? Math.round((llamadasMock / totalLlamadas) * 100) : 0;

  /* ── 2. Datos para Balance Overview (Línea/Área diaria) ── */
  const chartData = useMemo(() => {
    if (!tokens.serie_diaria || tokens.serie_diaria.length === 0) return [];
    
    // Calcular promedio móvil de 3 días para la segunda línea suave
    return tokens.serie_diaria.map((d, index, arr) => {
      const windowStart = Math.max(0, index - 2);
      const windowItems = arr.slice(windowStart, index + 1);
      const avg = Math.round(
        windowItems.reduce((acc, curr) => acc + curr.total, 0) / windowItems.length
      );

      // Formatear fecha corta
      const dateParts = d.fecha.split('-');
      const shortDate = dateParts.length >= 3 ? `${dateParts[2]}/${dateParts[1]}` : d.fecha;

      return {
        ...d,
        displayDate: shortDate,
        promedioMovil: avg,
      };
    });
  }, [tokens.serie_diaria]);

  /* ── 3. Datos para la Dona (Tokens por Agente) ── */
  const donutData = useMemo(() => {
    const agentesList: NombreAgente[] = ['GENERADOR', 'PACIENTE', 'EVALUADOR'];
    const total = agentesList.reduce((acc, k) => acc + (tokens.por_agente[k]?.total_tokens || 0), 0);

    return agentesList.map(k => {
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

  /* ── 4. Datos para Top Agentes (Ranking y barras proporcionales) ── */
  const rankingAgentes = useMemo(() => {
    const list = (['GENERADOR', 'PACIENTE', 'EVALUADOR'] as NombreAgente[]).map(k => ({
      key: k,
      name: AGENT_NAMES[k],
      shortName: k === 'GENERADOR' ? 'Generador de Casos' : k === 'PACIENTE' ? 'Paciente Virtual' : 'Evaluador Clínico',
      tokens: tokens.por_agente[k]?.total_tokens || 0,
      llamadas: tokens.por_agente[k]?.llamadas || 0,
      color: AGENT_COLORS[k],
      icon: k === 'GENERADOR' ? Sparkles : k === 'PACIENTE' ? User : Award,
    }));

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

  /* ── 5. Datos para el Medidor (Gauge de Llamadas Reales vs Mock) ── */
  const gaugeData = useMemo(() => {
    return [
      { name: 'Llamadas Reales', value: llamadasReales, color: '#10b981' },
      { name: 'Llamadas Mock', value: llamadasMock, color: '#cbd5e1' },
    ];
  }, [llamadasReales, llamadasMock]);

  /* ── 6. Datos de Latencia Promedio ── */
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
      {/* ── Encabezado Estilo Dashboard ── */}
      <div className="adm-header-row">
        <div className="adm-header-title-box">
          <h1 className="adm-analytics-title">Panel de Control y Analíticas</h1>
          <p className="adm-analytics-subtitle">Monitoreo de actividad clínica, desempeño del modelo y métricas del sistema</p>
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

      {/* ── 1. Fila Superior de Tarjetas KPI (6 Tarjetas redondeadas estilo financiero) ── */}
      <div className="adm-kpi-grid">
        {/* KPI 1: Usuarios */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#e0f2fe', color: '#0284c7' }}>
              <Users size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Total Usuarios</span>
              <span className="adm-kpi-sublabel">Estudiantes y docentes</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{totalUsuarios.toLocaleString('es-CO')}</span>
            <div className="adm-kpi-badge positive">
              <ArrowUpRight size={13} />
              <span>{pctActivos}% activos</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Casos Clínicos */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#dcfce7', color: '#16a34a' }}>
              <Stethoscope size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Casos Clínicos</span>
              <span className="adm-kpi-sublabel">Simulaciones médicas</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{totalCasos.toLocaleString('es-CO')}</span>
            <div className="adm-kpi-badge positive">
              <ArrowUpRight size={13} />
              <span>+{casosSemana} esta semana</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Tokens Usados */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#f3e8ff', color: '#9333ea' }}>
              <Zap size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Tokens de IA</span>
              <span className="adm-kpi-sublabel">Prompt + Completion</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{formatCompactNumber(totalTokens)}</span>
            <div className="adm-kpi-badge purple">
              <span>{formatCompactNumber(tokens.general.completion_tokens)} generados</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Llamadas a Agentes */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#ffedd5', color: '#ea580c' }}>
              <Bot size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Llamadas Totales</span>
              <span className="adm-kpi-sublabel">Motor Multi-Agente</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{totalLlamadas.toLocaleString('es-CO')}</span>
            <div className="adm-kpi-badge neutral">
              <span>{llamadasReales} reales</span>
            </div>
          </div>
        </div>

        {/* KPI 5: Cursos y Contenido */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#e0e7ff', color: '#4f46e5' }}>
              <GraduationCap size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Cursos y Artículos</span>
              <span className="adm-kpi-sublabel">Biblioteca y academia</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{estadisticas.cursos} cursos</span>
            <div className="adm-kpi-badge neutral">
              <span>{estadisticas.biblioteca.articulos} artículos</span>
            </div>
          </div>
        </div>

        {/* KPI 6: % de Llamadas Reales vs Mock */}
        <div className="adm-kpi-card">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon-wrap" style={{ background: '#fce7f3', color: '#db2777' }}>
              <Sparkles size={18} strokeWidth={2.2} />
            </div>
            <div className="adm-kpi-info-titles">
              <span className="adm-kpi-label">Modo de IA</span>
              <span className="adm-kpi-sublabel">Producción vs Simulado</span>
            </div>
            <button type="button" className="adm-kpi-dots" aria-label="Opciones"><MoreHorizontal size={15} /></button>
          </div>
          <div className="adm-kpi-bottom">
            <span className="adm-kpi-value">{pctReales}%</span>
            <div className={`adm-kpi-badge ${pctReales > 0 ? 'positive' : 'warning'}`}>
              <span>{pctReales > 0 ? 'En producción' : 'Modo Mock'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Fila Principal de Gráficas: Balance Overview + Spending by Category (Dona) ── */}
      <div className="adm-charts-row-main">
        {/* Gráfica Balance Overview */}
        <div className="adm-chart-card adm-card-large">
          <div className="adm-card-head">
            <div className="adm-card-head-titles">
              <h2 className="adm-card-title">Balance de Consumo de Tokens</h2>
              <p className="adm-card-sub">Actividad diaria acumulada y promedio móvil de los agentes</p>
            </div>
            <div className="adm-card-head-actions">
              <span className="adm-card-range-pill">Últimos 14 días</span>
            </div>
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
                    {/* Gradiente principal naranja/cálido (como la serie superior de la imagen) */}
                    <linearGradient id="tokenGradientTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                    </linearGradient>
                    {/* Gradiente secundario azul/morado suave */}
                    <linearGradient id="tokenGradientAvg" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#tokenGradientTotal)"
                  />
                  <Area
                    type="monotone"
                    dataKey="promedioMovil"
                    name="Tendencia (Prom. Móvil)"
                    stroke="#0284c7"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#tokenGradientAvg)"
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

        {/* Gráfica Dona: Spending by category (Distribución de tokens) */}
        <div className="adm-chart-card adm-card-donut">
          <div className="adm-card-head">
            <div className="adm-card-head-titles">
              <h2 className="adm-card-title">Distribución por Agente</h2>
              <p className="adm-card-sub">Participación porcentual en tokens</p>
            </div>
            <div className="adm-card-head-actions">
              <span className="adm-card-range-pill">General</span>
            </div>
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

      {/* ── 3. Fila Inferior: Top Agentes (Ranking) + Medidor (Gauge) + Latencia (Sparkline) ── */}
      <div className="adm-charts-row-bottom">
        {/* Top Spending Agents (como Top Spending Merchants) */}
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
                      <span className="adm-agent-calls-count">{ag.llamadas} llamadas</span>
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

        {/* Medidor (Gauge): Llamadas Reales vs Mock */}
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

        {/* Latencia Promedio (Sparkline / Bar) */}
        <div className="adm-chart-card adm-card-bottom-col">
          <div className="adm-card-head">
            <div className="adm-card-head-titles">
              <h2 className="adm-card-title">Tiempo de Respuesta</h2>
              <p className="adm-card-sub">Latencia promedio por agente</p>
            </div>
            <div className="adm-card-head-actions">
              <span className="adm-card-range-pill">{avgLatency} prom.</span>
            </div>
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

      {/* ── 4. Bloque Secundario: Almacenamiento, Comunidad y Feedback ── */}
      <div className="adm-secondary-grid">
        <div className="adm-secondary-card">
          <div className="adm-sec-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <HardDrive size={18} />
          </div>
          <div>
            <h4>Almacenamiento Cloud R2</h4>
            <p className="adm-sec-main-num">{estadisticas.almacenamiento.archivos} archivos guardados</p>
            <span className="adm-sec-sub">{(estadisticas.almacenamiento.bytes_usados / 1024 / 1024).toFixed(1)} MB en uso</span>
          </div>
        </div>

        <div className="adm-secondary-card">
          <div className="adm-sec-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <MessageSquare size={18} />
          </div>
          <div>
            <h4>Comunidad y Foros</h4>
            <p className="adm-sec-main-num">{estadisticas.comunidad.publicaciones} publicaciones</p>
            <span className="adm-sec-sub">{estadisticas.comunidad.comentarios} comentarios activos</span>
          </div>
        </div>

        <div className="adm-secondary-card">
          <div className="adm-sec-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
            <ShieldCheck size={18} />
          </div>
          <div>
            <h4>Validación por Expertos</h4>
            <p className="adm-sec-main-num">{Object.values(estadisticas.validacion_expertos).reduce((a, b) => a + b, 0)} evaluaciones</p>
            <span className="adm-sec-sub">{Object.keys(estadisticas.validacion_expertos).length} pestañas con feedback</span>
          </div>
        </div>
      </div>
    </div>
  );
}
