import {
  Cpu, Database, CheckSquare, FileText, AlertTriangle, RotateCw, Sparkles, Code,
  Layers, Stethoscope, CheckCircle2, Activity, Flag, Sliders, Save, Network, Zap,
  PlayCircle, Wrench, Link2, FlaskConical, Search, ShieldAlert, Lock, Play, Rocket,
  BrainCircuit, Server, Cloud, Gauge, Layout,
} from 'lucide-react';

/**
 * Datos compartidos del Cronograma — viven fuera de CronogramaTab.tsx
 * (un archivo de componente) para no romper el Fast Refresh de Vite, y
 * para que RepositorioTab.tsx pueda reutilizarlos sin importar desde un
 * componente.
 */

/* ══════════════════════════════════════════════════════
   Categories / Module Filter
══════════════════════════════════════════════════════ */
export type CategoryId = 'general' | 'modelos' | 'agentes' | 'backend' | 'frontend';

export interface CategoryFilter {
  id: CategoryId;
  label: string;
  badge: string;
  color: string;
}

export const CATEGORIES: CategoryFilter[] = [
  { id: 'general',  label: 'CRONOGRAMA GENERAL - TODO INTEGRADO', badge: 'Visión Global', color: '#1D4ED8' },
  { id: 'modelos',  label: 'IA - MODELOS',                         badge: 'LLM & Fine-Tuning', color: '#3B82F6' },
  { id: 'agentes',  label: 'IA - AGENTES',                         badge: 'Orquestación LangGraph', color: '#EC4899' },
  { id: 'backend',  label: 'BACKEND',                              badge: 'FastAPI & APIs', color: '#8B5CF6' },
  { id: 'frontend', label: 'FRONTEND',                             badge: 'React 19 & UI/UX', color: '#10B981' },
];

/* ══════════════════════════════════════════════════════
   Activities Data per Category
══════════════════════════════════════════════════════ */
export interface ActivityItem {
  id: string;
  dateLabel: string;
  title: string;
  techPlaceholderKey?: string;
  defaultTech?: string;
  icon: any;
  startWeek: number; // 1 to 14
  duration: number;  // 1 to 14
  color?: string;
  type?: 'normal' | 'ulibro' | 'avance' | 'integrado' | 'candidata' | 'final';
}

export const CRONOGRAMA_DATA: Record<CategoryId, ActivityItem[]> = {
  general: [
    { id: '01', dateLabel: '17 ago', title: 'Configurar entorno de trabajo y repositorios iniciales.', icon: Cpu, startWeek: 1, duration: 1, color: '#1D4ED8' },
    { id: '02', dateLabel: '20 ago', title: 'Definir arquitectura de componentes y navegación.', icon: Layers, startWeek: 1, duration: 1, color: '#10B981' },
    { id: '03', dateLabel: '24 ago', title: 'Implementar layout general y sistema visual.', icon: Code, startWeek: 2, duration: 1, color: '#10B981' },
    { id: '04', dateLabel: '27 ago', title: 'Consolidar dataset crudo y arquitectura de agentes v1.', icon: CheckSquare, startWeek: 2, duration: 1, color: '#3B82F6' },
    { id: '05', dateLabel: '28 ago - 6 sep', title: 'ULIBRO - PERIODO BLOQUEADO. No se programa trabajo ni presentación.', icon: AlertTriangle, startWeek: 2, duration: 2, type: 'ulibro', color: '#F59E0B' },
    { id: '06', dateLabel: '8 sep', title: 'Retomar procesamiento del proyecto y validar dataset procesado.', icon: RotateCw, startWeek: 4, duration: 1, color: '#1D4ED8' },
    { id: '07', dateLabel: '10 sep', title: 'Implementar limpieza de datos y Landing / Login principal.', icon: Sparkles, startWeek: 4, duration: 1, color: '#10B981' },
    { id: '08', dateLabel: '14 sep', title: 'Implementar tokenización, agentes iniciales y Dashboard.', icon: Code, startWeek: 5, duration: 1, color: '#EC4899' },
    { id: '09', dateLabel: '17 sep', title: 'Implementar endpoints mock y rutas protegidas en React Router.', icon: Lock, startWeek: 5, duration: 1, color: '#8B5CF6' },
    { id: '10', dateLabel: '21 sep', title: 'Entregar API mock funcional y conectar pantallas iniciales.', icon: Network, startWeek: 6, duration: 1, color: '#8B5CF6' },
    { id: '11', dateLabel: '24 sep', title: 'Conectar API con el grafo de agentes y presentación del caso.', icon: Zap, startWeek: 6, duration: 1, color: '#EC4899' },
    { id: '12', dateLabel: '28 sep', title: 'Implementar chat con paciente virtual y endpoint /llm/chat.', icon: BrainCircuit, startWeek: 7, duration: 1, color: '#EC4899' },
    { id: '13', dateLabel: '1 oct', title: 'Implementar streaming SSE y Typing Indicator.', icon: Zap, startWeek: 7, duration: 1, color: '#8B5CF6' },
    { id: '14', dateLabel: '5 oct', title: 'Implementar panel de hipótesis, pruebas y evaluaciones.', icon: Activity, startWeek: 8, duration: 1, color: '#10B981' },
    { id: '15', dateLabel: '8 oct', title: 'ENTREGA DE AVANCE ≥60%: API + Agentes + SSE + UI funcional.', icon: Flag, startWeek: 8, duration: 1, type: 'avance', color: '#EF4444' },
    { id: '16', dateLabel: '13 oct', title: 'Crear esquema PostgreSQL y módulo de diagnóstico diferencial.', icon: Database, startWeek: 9, duration: 1, color: '#8B5CF6' },
    { id: '17', dateLabel: '16 oct', title: 'Implementar persistencia de sesiones e incremento funcional.', icon: Save, startWeek: 9, duration: 1, color: '#8B5CF6' },
    { id: '18', dateLabel: '19 oct', title: 'Integrar modelos y agentes reales en entorno completo.', icon: Cpu, startWeek: 10, duration: 1, color: '#3B82F6' },
    { id: '19', dateLabel: '22 oct', title: 'Integrar Backend con Frontend y flujo completo con IA.', icon: Link2, startWeek: 10, duration: 1, color: '#2563EB' },
    { id: '20', dateLabel: '24 oct', title: 'Implementar autenticación JWT, historial y retroalimentación.', icon: Lock, startWeek: 10, duration: 1, color: '#8B5CF6' },
    { id: '21', dateLabel: '27 oct', title: 'Completar pantallas restantes, validaciones y CORS.', icon: Wrench, startWeek: 11, duration: 1, color: '#10B981' },
    { id: '22', dateLabel: '30 oct', title: 'Plataforma integrada al 100%.', icon: Link2, startWeek: 11, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '23', dateLabel: '2-6 nov', title: 'PRUEBAS INTEGRALES - Semana 1: Flujo de usuario, API, SSE e IA.', icon: FlaskConical, startWeek: 12, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '24', dateLabel: '9 nov', title: 'Pruebas de carga, responsive y manejo de errores.', icon: Gauge, startWeek: 13, duration: 1, color: '#1D4ED8' },
    { id: '25', dateLabel: '11 nov', title: 'Corregir errores críticos de UX, integración y seguridad.', icon: ShieldAlert, startWeek: 13, duration: 1, color: '#1D4ED8' },
    { id: '26', dateLabel: '13 nov', title: 'Plataforma estable - versión candidata final.', icon: CheckCircle2, startWeek: 13, duration: 1, type: 'candidata', color: '#10B981' },
    { id: '27', dateLabel: '16 nov', title: 'Congelar código, API e interfaz.', icon: Lock, startWeek: 14, duration: 1, color: '#1D4ED8' },
    { id: '28', dateLabel: '18 nov', title: 'Prueba E2E final desde Login hasta retroalimentación.', icon: Play, startWeek: 14, duration: 1, color: '#1D4ED8' },
    { id: '29', dateLabel: '20 nov', title: 'Entrega definitiva del Proyecto de Grado.', icon: Rocket, startWeek: 14, duration: 1, type: 'final', color: '#10B981' },
  ],
  modelos: [
    { id: '01', dateLabel: '17 ago', title: 'Configurar entorno de trabajo utilizando {tech} y verificar dependencias.', techPlaceholderKey: 'envTech', defaultTech: 'Python', icon: Cpu, startWeek: 1, duration: 1, color: '#3B82F6' },
    { id: '02', dateLabel: '20 ago', title: 'Implementar extracción de fuentes utilizando {tech}.', techPlaceholderKey: 'extractTech', defaultTech: 'BioC API', icon: Database, startWeek: 1, duration: 1, color: '#3B82F6' },
    { id: '03', dateLabel: '24 ago', title: 'Consolidar fuentes y entregar dataset crudo v1.', icon: CheckSquare, startWeek: 2, duration: 1, color: '#3B82F6' },
    { id: '04', dateLabel: '27 ago', title: 'Entregar estructura documentada del dataset y fuentes utilizadas.', icon: FileText, startWeek: 2, duration: 1, color: '#3B82F6' },
    { id: '05', dateLabel: '28 ago - 6 sep', title: 'ULIBRO - PERIODO BLOQUEADO. No se programa trabajo ni presentación.', icon: AlertTriangle, startWeek: 2, duration: 2, type: 'ulibro', color: '#F59E0B' },
    { id: '06', dateLabel: '8 sep', title: 'Retomar procesamiento del proyecto y validar el dataset crudo.', icon: RotateCw, startWeek: 4, duration: 1, color: '#3B82F6' },
    { id: '07', dateLabel: '10 sep', title: 'Implementar limpieza y normalización utilizando {tech}.', techPlaceholderKey: 'cleanTech', defaultTech: 'spaCy', icon: Sparkles, startWeek: 4, duration: 1, color: '#3B82F6' },
    { id: '08', dateLabel: '14 sep', title: 'Implementar segmentación y tokenización utilizando {tech}.', techPlaceholderKey: 'tokenTech', defaultTech: 'HuggingFace', icon: Code, startWeek: 5, duration: 1, color: '#3B82F6' },
    { id: '09', dateLabel: '17 sep', title: 'Entregar corpus semántico v1 con reporte de cobertura.', icon: Layers, startWeek: 5, duration: 1, color: '#3B82F6' },
    { id: '10', dateLabel: '21 sep', title: 'Construir corpus de casos clínicos utilizando {tech}.', techPlaceholderKey: 'corpusTech', defaultTech: 'BioC API', icon: Stethoscope, startWeek: 6, duration: 1, color: '#3B82F6' },
    { id: '11', dateLabel: '24 sep', title: 'Completar anotación de casos y justificaciones clínicas.', icon: CheckCircle2, startWeek: 6, duration: 1, color: '#3B82F6' },
    { id: '12', dateLabel: '28 sep', title: 'Entregar comparación inicial de modelos base.', icon: Activity, startWeek: 7, duration: 1, color: '#3B82F6' },
    { id: '13', dateLabel: '1 oct', title: 'Seleccionar y justificar el modelo base definitivo.', icon: CheckSquare, startWeek: 7, duration: 1, color: '#3B82F6' },
    { id: '14', dateLabel: '5 oct', title: 'Configurar fine-tuning utilizando {tech} + LoRA/QLoRA.', techPlaceholderKey: 'tuningTech', defaultTech: 'Unsloth', icon: Cpu, startWeek: 8, duration: 1, color: '#3B82F6' },
    { id: '15', dateLabel: '8 oct', title: 'ENTREGA DE AVANCE ≥60%: corpus + modelo base + entrenamiento inicial.', icon: Flag, startWeek: 8, duration: 1, type: 'avance', color: '#EF4444' },
    { id: '16', dateLabel: '13 oct', title: 'Ajustar hiperparámetros y configuración del entrenamiento.', icon: Sliders, startWeek: 9, duration: 1, color: '#3B82F6' },
    { id: '17', dateLabel: '16 oct', title: 'Entregar checkpoint intermedio del modelo.', icon: Save, startWeek: 9, duration: 1, color: '#3B82F6' },
    { id: '18', dateLabel: '19 oct', title: 'Preparar modelo/adaptadores para integración con Agentes.', icon: Network, startWeek: 10, duration: 1, color: '#3B82F6' },
    { id: '19', dateLabel: '22 oct', title: 'Integrar modelo real con IA-Agentes.', icon: Zap, startWeek: 10, duration: 1, color: '#3B82F6' },
    { id: '20', dateLabel: '24 oct', title: 'Ejecutar primeras pruebas del modelo dentro del sistema.', icon: PlayCircle, startWeek: 10, duration: 1, color: '#3B82F6' },
    { id: '21', dateLabel: '27 oct', title: 'Ajustar problemas encontrados en la integración.', icon: Wrench, startWeek: 11, duration: 1, color: '#3B82F6' },
    { id: '22', dateLabel: '30 oct', title: 'Modelo integrado al 100% con el sistema.', icon: Link2, startWeek: 11, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '23', dateLabel: '2-6 nov', title: 'PRUEBAS INTEGRALES - Semana 1. Evaluación del modelo dentro del sistema completo.', icon: FlaskConical, startWeek: 12, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '24', dateLabel: '9 nov', title: 'Analizar errores y resultados de las pruebas.', icon: Search, startWeek: 13, duration: 1, color: '#3B82F6' },
    { id: '25', dateLabel: '11 nov', title: 'Corregir problemas del modelo/datos detectados.', icon: ShieldAlert, startWeek: 13, duration: 1, color: '#3B82F6' },
    { id: '26', dateLabel: '13 nov', title: 'Modelo estable - versión candidata final.', icon: CheckCircle2, startWeek: 13, duration: 1, type: 'candidata', color: '#10B981' },
    { id: '27', dateLabel: '16 nov', title: 'Congelar checkpoint/adaptadores definitivos.', icon: Lock, startWeek: 14, duration: 1, color: '#3B82F6' },
    { id: '28', dateLabel: '18 nov', title: 'Ejecutar prueba final del modelo integrado.', icon: Play, startWeek: 14, duration: 1, color: '#3B82F6' },
    { id: '29', dateLabel: '20 nov', title: 'Entrega definitiva de IA-Modelos.', icon: Rocket, startWeek: 14, duration: 1, type: 'final', color: '#10B981' },
  ],
  agentes: [
    { id: '01', dateLabel: '17 ago', title: 'Diseñar arquitectura multiagente utilizando {tech}.', techPlaceholderKey: 'agentArchTech', defaultTech: 'LangGraph', icon: Network, startWeek: 1, duration: 1, color: '#EC4899' },
    { id: '02', dateLabel: '20 ago', title: 'Definir nodos, estados y transiciones de los tres agentes.', icon: Layers, startWeek: 1, duration: 1, color: '#EC4899' },
    { id: '03', dateLabel: '24 ago', title: 'Implementar estructura inicial del Agente 1.', icon: BrainCircuit, startWeek: 2, duration: 1, color: '#EC4899' },
    { id: '04', dateLabel: '27 ago', title: 'Implementar estructura inicial de los Agentes 2 y 3.', icon: Cpu, startWeek: 2, duration: 1, color: '#EC4899' },
    { id: '05', dateLabel: '28 ago - 6 sep', title: 'ULIBRO - PERIODO BLOQUEADO. No se programa trabajo ni presentación.', icon: AlertTriangle, startWeek: 2, duration: 2, type: 'ulibro', color: '#F59E0B' },
    { id: '06', dateLabel: '8 sep', title: 'Retomar implementación y conectar estructura de los agentes.', icon: RotateCw, startWeek: 4, duration: 1, color: '#EC4899' },
    { id: '07', dateLabel: '10 sep', title: 'Implementar transiciones utilizando {tech} con datos mock.', techPlaceholderKey: 'agentTransTech', defaultTech: 'Python', icon: Code, startWeek: 4, duration: 1, color: '#EC4899' },
    { id: '08', dateLabel: '14 sep', title: 'Entregar grafo funcional end-to-end con mocks.', icon: CheckSquare, startWeek: 5, duration: 1, color: '#EC4899' },
    { id: '09', dateLabel: '17 sep', title: 'Diseñar system prompt del Agente 3.', techPlaceholderKey: 'promptTech', defaultTech: 'Prompt Engineering', icon: FileText, startWeek: 5, duration: 1, color: '#EC4899' },
    { id: '10', dateLabel: '21 sep', title: 'Crear ejemplos few-shot para el Agente 3.', techPlaceholderKey: 'fewshotTech', defaultTech: 'Few-shot Prompting', icon: Sparkles, startWeek: 6, duration: 1, color: '#EC4899' },
    { id: '11', dateLabel: '24 sep', title: 'Entregar Agente 3 funcional sobre modelo base.', icon: CheckCircle2, startWeek: 6, duration: 1, color: '#EC4899' },
    { id: '12', dateLabel: '28 sep', title: 'Diseñar lógica de detección de sesgos.', icon: Search, startWeek: 7, duration: 1, color: '#EC4899' },
    { id: '13', dateLabel: '1 oct', title: 'Implementar bias_service utilizando {tech}.', techPlaceholderKey: 'biasServiceTech', defaultTech: 'bias_service', icon: ShieldAlert, startWeek: 7, duration: 1, color: '#EC4899' },
    { id: '14', dateLabel: '5 oct', title: 'Probar los cinco sesgos definidos.', icon: Activity, startWeek: 8, duration: 1, color: '#EC4899' },
    { id: '15', dateLabel: '8 oct', title: 'ENTREGA DE AVANCE ≥60%: grafo + agentes + bias_service.', icon: Flag, startWeek: 8, duration: 1, type: 'avance', color: '#EF4444' },
    { id: '16', dateLabel: '13 oct', title: 'Integrar Agente 3 dentro del flujo completo.', icon: Network, startWeek: 9, duration: 1, color: '#EC4899' },
    { id: '17', dateLabel: '16 oct', title: 'Entregar flujo funcional de los tres agentes.', icon: Save, startWeek: 9, duration: 1, color: '#EC4899' },
    { id: '18', dateLabel: '19 oct', title: 'Integrar agentes con Backend.', icon: Server, startWeek: 10, duration: 1, color: '#EC4899' },
    { id: '19', dateLabel: '22 oct', title: 'Integrar agentes con modelo fine-tuneado.', icon: Zap, startWeek: 10, duration: 1, color: '#EC4899' },
    { id: '20', dateLabel: '24 oct', title: 'Ejecutar primer flujo completo con IA real.', icon: PlayCircle, startWeek: 10, duration: 1, color: '#EC4899' },
    { id: '21', dateLabel: '27 oct', title: 'Ajustar prompts y transiciones.', icon: Wrench, startWeek: 11, duration: 1, color: '#EC4899' },
    { id: '22', dateLabel: '30 oct', title: 'IA-Agentes integrada al 100%.', icon: Link2, startWeek: 11, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '23', dateLabel: '2-6 nov', title: 'PRUEBAS INTEGRALES - Semana 1.', icon: FlaskConical, startWeek: 12, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '24', dateLabel: '9 nov', title: 'Analizar errores de agentes y respuestas.', icon: Search, startWeek: 13, duration: 1, color: '#EC4899' },
    { id: '25', dateLabel: '11 nov', title: 'Corregir prompts, transiciones y bias_service.', icon: Wrench, startWeek: 13, duration: 1, color: '#EC4899' },
    { id: '26', dateLabel: '13 nov', title: 'Agentes estables - versión candidata final.', icon: CheckCircle2, startWeek: 13, duration: 1, type: 'candidata', color: '#10B981' },
    { id: '27', dateLabel: '16 nov', title: 'Congelar configuración definitiva.', icon: Lock, startWeek: 14, duration: 1, color: '#EC4899' },
    { id: '28', dateLabel: '18 nov', title: 'Prueba final de los tres agentes integrados.', icon: Play, startWeek: 14, duration: 1, color: '#EC4899' },
    { id: '29', dateLabel: '20 nov', title: 'Entrega definitiva de IA-Agentes.', icon: Rocket, startWeek: 14, duration: 1, type: 'final', color: '#10B981' },
  ],
  backend: [
    { id: '01', dateLabel: '17 ago', title: 'Configurar proyecto Backend utilizando {tech}.', techPlaceholderKey: 'backendFrameworkTech', defaultTech: 'Flask', icon: Server, startWeek: 1, duration: 1, color: '#8B5CF6' },
    { id: '02', dateLabel: '20 ago', title: 'Definir arquitectura, módulos y blueprints.', icon: Layers, startWeek: 1, duration: 1, color: '#8B5CF6' },
    { id: '03', dateLabel: '24 ago', title: 'Definir contrato inicial de API utilizando {tech}.', techPlaceholderKey: 'contractTech', defaultTech: 'OpenAPI', icon: FileText, startWeek: 2, duration: 1, color: '#8B5CF6' },
    { id: '04', dateLabel: '27 ago', title: 'Entregar documentación inicial OpenAPI/Swagger.', icon: Code, startWeek: 2, duration: 1, color: '#8B5CF6' },
    { id: '05', dateLabel: '28 ago - 6 sep', title: 'ULIBRO - PERIODO BLOQUEADO. No se programa trabajo ni presentación.', icon: AlertTriangle, startWeek: 2, duration: 2, type: 'ulibro', color: '#F59E0B' },
    { id: '06', dateLabel: '8 sep', title: 'Retomar desarrollo y validar contratos de API.', icon: RotateCw, startWeek: 4, duration: 1, color: '#8B5CF6' },
    { id: '07', dateLabel: '10 sep', title: 'Implementar modelos request/response utilizando {tech}.', techPlaceholderKey: 'modelSchemaTech', defaultTech: 'Pydantic v2', icon: CheckSquare, startWeek: 4, duration: 1, color: '#8B5CF6' },
    { id: '08', dateLabel: '14 sep', title: 'Implementar estructura inicial de endpoints.', icon: Network, startWeek: 5, duration: 1, color: '#8B5CF6' },
    { id: '09', dateLabel: '17 sep', title: 'Implementar endpoints mock para los agentes.', icon: Cpu, startWeek: 5, duration: 1, color: '#8B5CF6' },
    { id: '10', dateLabel: '21 sep', title: 'Entregar API mock funcional.', icon: CheckCircle2, startWeek: 6, duration: 1, color: '#8B5CF6' },
    { id: '11', dateLabel: '24 sep', title: 'Conectar API con el grafo de agentes.', icon: Zap, startWeek: 6, duration: 1, color: '#8B5CF6' },
    { id: '12', dateLabel: '28 sep', title: 'Implementar /llm/chat.', icon: Cloud, startWeek: 7, duration: 1, color: '#8B5CF6' },
    { id: '13', dateLabel: '1 oct', title: 'Implementar /llm/tests.', icon: Activity, startWeek: 7, duration: 1, color: '#8B5CF6' },
    { id: '14', dateLabel: '5 oct', title: 'Implementar streaming SSE utilizando {tech}.', techPlaceholderKey: 'sseTech', defaultTech: 'SSE', icon: Zap, startWeek: 8, duration: 1, color: '#8B5CF6' },
    { id: '15', dateLabel: '8 oct', title: 'ENTREGA DE AVANCE ≥60%: API + agentes + SSE.', icon: Flag, startWeek: 8, duration: 1, type: 'avance', color: '#EF4444' },
    { id: '16', dateLabel: '13 oct', title: 'Crear esquema PostgreSQL.', techPlaceholderKey: 'dbTech', defaultTech: 'PostgreSQL', icon: Database, startWeek: 9, duration: 1, color: '#8B5CF6' },
    { id: '17', dateLabel: '16 oct', title: 'Implementar persistencia de sesiones y turnos.', icon: Save, startWeek: 9, duration: 1, color: '#8B5CF6' },
    { id: '18', dateLabel: '19 oct', title: 'Integrar modelo y agentes reales.', icon: Cpu, startWeek: 10, duration: 1, color: '#8B5CF6' },
    { id: '19', dateLabel: '22 oct', title: 'Integrar Backend con Frontend.', icon: Link2, startWeek: 10, duration: 1, color: '#8B5CF6' },
    { id: '20', dateLabel: '24 oct', title: 'Implementar autenticación JWT utilizando {tech}.', techPlaceholderKey: 'jwtTech', defaultTech: 'JWT', icon: Lock, startWeek: 10, duration: 1, color: '#8B5CF6' },
    { id: '21', dateLabel: '27 oct', title: 'Configurar CORS, errores y validaciones.', icon: Wrench, startWeek: 11, duration: 1, color: '#8B5CF6' },
    { id: '22', dateLabel: '30 oct', title: 'Backend integrado al 100%.', icon: Link2, startWeek: 11, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '23', dateLabel: '2-6 nov', title: 'PRUEBAS INTEGRALES - Semana 1: API, persistencia, SSE y comunicación con IA.', icon: FlaskConical, startWeek: 12, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '24', dateLabel: '9 nov', title: 'Ejecutar pruebas de carga utilizando {tech}.', techPlaceholderKey: 'loadTestTech', defaultTech: 'Locust', icon: Gauge, startWeek: 13, duration: 1, color: '#8B5CF6' },
    { id: '25', dateLabel: '11 nov', title: 'Corregir errores críticos de integración y seguridad.', icon: ShieldAlert, startWeek: 13, duration: 1, color: '#8B5CF6' },
    { id: '26', dateLabel: '13 nov', title: 'Backend estable - versión candidata final.', icon: CheckCircle2, startWeek: 13, duration: 1, type: 'candidata', color: '#10B981' },
    { id: '27', dateLabel: '16 nov', title: 'Congelar API y configuración.', icon: Lock, startWeek: 14, duration: 1, color: '#8B5CF6' },
    { id: '28', dateLabel: '18 nov', title: 'Verificar JWT, CORS y HTTPS.', icon: CheckSquare, startWeek: 14, duration: 1, color: '#8B5CF6' },
    { id: '29', dateLabel: '20 nov', title: 'Entrega definitiva de Backend.', icon: Rocket, startWeek: 14, duration: 1, type: 'final', color: '#10B981' },
  ],
  frontend: [
    { id: '01', dateLabel: '17 ago', title: 'Configurar proyecto utilizando {tech}.', techPlaceholderKey: 'feFrameworkTech', defaultTech: 'React 18', icon: Layout, startWeek: 1, duration: 1, color: '#10B981' },
    { id: '02', dateLabel: '20 ago', title: 'Definir arquitectura de componentes y navegación.', icon: Layers, startWeek: 1, duration: 1, color: '#10B981' },
    { id: '03', dateLabel: '24 ago', title: 'Implementar layout general y sistema visual.', icon: Code, startWeek: 2, duration: 1, color: '#10B981' },
    { id: '04', dateLabel: '27 ago', title: 'Entregar primera estructura funcional de la interfaz.', icon: FileText, startWeek: 2, duration: 1, color: '#10B981' },
    { id: '05', dateLabel: '28 ago - 6 sep', title: 'ULIBRO - PERIODO BLOQUEADO. No se programa trabajo ni presentación.', icon: AlertTriangle, startWeek: 2, duration: 2, type: 'ulibro', color: '#F59E0B' },
    { id: '06', dateLabel: '8 sep', title: 'Retomar desarrollo y validar estructura visual.', icon: RotateCw, startWeek: 4, duration: 1, color: '#10B981' },
    { id: '07', dateLabel: '10 sep', title: 'Implementar Landing y Login.', icon: Layout, startWeek: 4, duration: 1, color: '#10B981' },
    { id: '08', dateLabel: '14 sep', title: 'Implementar consentimiento y Dashboard.', icon: CheckSquare, startWeek: 5, duration: 1, color: '#10B981' },
    { id: '09', dateLabel: '17 sep', title: 'Implementar rutas protegidas utilizando {tech}.', techPlaceholderKey: 'feRouteTech', defaultTech: 'React Router v6', icon: Lock, startWeek: 5, duration: 1, color: '#10B981' },
    { id: '10', dateLabel: '21 sep', title: 'Conectar primeras pantallas con API mock.', icon: Network, startWeek: 6, duration: 1, color: '#10B981' },
    { id: '11', dateLabel: '24 sep', title: 'Implementar presentación del caso.', icon: Stethoscope, startWeek: 6, duration: 1, color: '#10B981' },
    { id: '12', dateLabel: '28 sep', title: 'Implementar chat con paciente virtual.', icon: BrainCircuit, startWeek: 7, duration: 1, color: '#10B981' },
    { id: '13', dateLabel: '1 oct', title: 'Implementar streaming visual y Typing Indicator.', icon: Zap, startWeek: 7, duration: 1, color: '#10B981' },
    { id: '14', dateLabel: '5 oct', title: 'Implementar panel de hipótesis y pruebas.', icon: Activity, startWeek: 8, duration: 1, color: '#10B981' },
    { id: '15', dateLabel: '8 oct', title: 'ENTREGA DE AVANCE ≥60%: flujo principal funcional.', icon: Flag, startWeek: 8, duration: 1, type: 'avance', color: '#EF4444' },
    { id: '16', dateLabel: '13 oct', title: 'Implementar diagnóstico diferencial y diagnóstico final.', icon: CheckCircle2, startWeek: 9, duration: 1, color: '#10B981' },
    { id: '17', dateLabel: '16 oct', title: 'Entregar incremento funcional completo.', icon: Save, startWeek: 9, duration: 1, color: '#10B981' },
    { id: '18', dateLabel: '19 oct', title: 'Integrar Frontend con Backend real.', icon: Server, startWeek: 10, duration: 1, color: '#10B981' },
    { id: '19', dateLabel: '22 oct', title: 'Conectar flujo completo con IA.', icon: Cpu, startWeek: 10, duration: 1, color: '#10B981' },
    { id: '20', dateLabel: '24 oct', title: 'Implementar historial, sesión y retroalimentación.', icon: FileText, startWeek: 10, duration: 1, color: '#10B981' },
    { id: '21', dateLabel: '27 oct', title: 'Completar las pantallas restantes.', icon: Wrench, startWeek: 11, duration: 1, color: '#10B981' },
    { id: '22', dateLabel: '30 oct', title: 'Frontend integrado al 100%.', icon: Link2, startWeek: 11, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '23', dateLabel: '2-6 nov', title: 'PRUEBAS INTEGRALES - Semana 1: flujo completo del usuario.', icon: FlaskConical, startWeek: 12, duration: 1, type: 'integrado', color: '#2563EB' },
    { id: '24', dateLabel: '9 nov', title: 'Pruebas responsive, errores y estados de carga.', icon: Search, startWeek: 13, duration: 1, color: '#10B981' },
    { id: '25', dateLabel: '11 nov', title: 'Corrección de UX e integración.', icon: ShieldAlert, startWeek: 13, duration: 1, color: '#10B981' },
    { id: '26', dateLabel: '13 nov', title: 'Frontend estable - versión candidata final.', icon: CheckCircle2, startWeek: 13, duration: 1, type: 'candidata', color: '#10B981' },
    { id: '27', dateLabel: '16 nov', title: 'Congelar interfaz y componentes.', icon: Lock, startWeek: 14, duration: 1, color: '#10B981' },
    { id: '28', dateLabel: '18 nov', title: 'Prueba final desde Login hasta feedback.', icon: Play, startWeek: 14, duration: 1, color: '#10B981' },
    { id: '29', dateLabel: '20 nov', title: 'Entrega definitiva de Frontend.', icon: Rocket, startWeek: 14, duration: 1, type: 'final', color: '#10B981' },
  ],
};
