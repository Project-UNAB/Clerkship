import { IA_MODELOS, IA_AGENTES, BACKEND_OPTS, FRONTEND_OPTS } from './cuestionarioOptions';
import type { TechCategory } from './cuestionarioOptions';

/**
 * Cada entrada corresponde a un "{tech}" (espacio en blanco "____") dentro
 * del Cronograma. El `key` debe coincidir exactamente con el
 * `techPlaceholderKey` usado en CronogramaTab.tsx para poder resolverlo.
 *
 * `options` es una lista curada y ordenada SOLO con las tecnologías que
 * tienen sentido para ese espacio en concreto (no la lista completa de la
 * categoría) — la primera opción es siempre `defaultTech`.
 */
export interface TechPlaceholder {
  key: string;
  label: string;
  defaultTech: string;
  options: string[];
}

export type PlaceholderCategoryId = 'modelos' | 'agentes' | 'backend' | 'frontend';

export interface PlaceholderCategory {
  catId: PlaceholderCategoryId;
  title: string;
  iconName: TechCategory['iconName'];
  placeholders: TechPlaceholder[];
}

const MODELOS_PLACEHOLDERS: PlaceholderCategory = {
  catId: 'modelos',
  title: IA_MODELOS.title,
  iconName: IA_MODELOS.iconName,
  placeholders: [
    { key: 'envTech', label: 'Configuración del entorno de trabajo', defaultTech: 'Python', options: ['Python', 'HuggingFace', 'Unsloth'] },
    { key: 'extractTech', label: 'Extracción de fuentes', defaultTech: 'BioC API', options: ['BioC API', 'Biopython', 'Python'] },
    { key: 'cleanTech', label: 'Limpieza y normalización', defaultTech: 'spaCy', options: ['spaCy', 'Biopython', 'Python'] },
    { key: 'tokenTech', label: 'Segmentación y tokenización', defaultTech: 'HuggingFace', options: ['HuggingFace', 'spaCy', 'Python'] },
    { key: 'corpusTech', label: 'Construcción del corpus clínico', defaultTech: 'BioC API', options: ['BioC API', 'Biopython', 'spaCy'] },
    { key: 'tuningTech', label: 'Fine-tuning del modelo (+ LoRA/QLoRA)', defaultTech: 'Unsloth', options: ['Unsloth', 'HuggingFace TRL', 'LoRA', 'QLoRA', 'PEFT', 'DoRA'] },
  ],
};

const AGENTES_PLACEHOLDERS: PlaceholderCategory = {
  catId: 'agentes',
  title: IA_AGENTES.title,
  iconName: IA_AGENTES.iconName,
  placeholders: [
    { key: 'agentArchTech', label: 'Arquitectura multiagente', defaultTech: 'LangGraph', options: ['LangGraph', 'Python'] },
    { key: 'agentTransTech', label: 'Transiciones del grafo (con mocks)', defaultTech: 'Python', options: ['Python', 'LangGraph'] },
    { key: 'promptTech', label: 'Diseño del system prompt (Agente 3)', defaultTech: 'Prompt Engineering', options: ['Prompt Engineering', 'Chain-of-Thought'] },
    { key: 'fewshotTech', label: 'Ejemplos few-shot (Agente 3)', defaultTech: 'Few-shot Prompting', options: ['Few-shot Prompting', 'Prompt Engineering', 'Chain-of-Thought'] },
    { key: 'biasServiceTech', label: 'Servicio de detección de sesgos', defaultTech: 'bias_service', options: ['bias_service', 'Python'] },
  ],
};

const BACKEND_PLACEHOLDERS: PlaceholderCategory = {
  catId: 'backend',
  title: BACKEND_OPTS.title,
  iconName: BACKEND_OPTS.iconName,
  placeholders: [
    { key: 'backendFrameworkTech', label: 'Framework principal del backend', defaultTech: 'Flask', options: ['Flask', 'Python'] },
    { key: 'contractTech', label: 'Contrato inicial de la API', defaultTech: 'OpenAPI', options: ['OpenAPI', 'Swagger', 'REST API'] },
    { key: 'modelSchemaTech', label: 'Modelos request/response', defaultTech: 'Pydantic v2', options: ['Pydantic v2', 'Python'] },
    { key: 'sseTech', label: 'Streaming en tiempo real', defaultTech: 'SSE', options: ['SSE', 'REST API'] },
    { key: 'dbTech', label: 'Base de datos', defaultTech: 'PostgreSQL', options: ['PostgreSQL', 'SQLite'] },
    { key: 'jwtTech', label: 'Autenticación', defaultTech: 'JWT', options: ['JWT', 'HTTPS', 'CORS'] },
    { key: 'loadTestTech', label: 'Pruebas de carga', defaultTech: 'Locust', options: ['Locust', 'pytest'] },
  ],
};

const FRONTEND_PLACEHOLDERS: PlaceholderCategory = {
  catId: 'frontend',
  title: FRONTEND_OPTS.title,
  iconName: FRONTEND_OPTS.iconName,
  placeholders: [
    { key: 'feFrameworkTech', label: 'Framework principal del frontend', defaultTech: 'React 18', options: ['React 18', 'TypeScript', 'Next.js'] },
    { key: 'feRouteTech', label: 'Manejo de rutas protegidas', defaultTech: 'React Router v6', options: ['React Router v6', 'React Context'] },
  ],
};

export function getPlaceholderCategoriesForMember(memberId: string): PlaceholderCategory[] {
  if (memberId === 'juan-camilo') {
    return [MODELOS_PLACEHOLDERS, AGENTES_PLACEHOLDERS];
  }
  if (memberId === 'santiago' || memberId === 'camilo-bueno') {
    return [BACKEND_PLACEHOLDERS, FRONTEND_PLACEHOLDERS];
  }
  return [MODELOS_PLACEHOLDERS, AGENTES_PLACEHOLDERS, BACKEND_PLACEHOLDERS, FRONTEND_PLACEHOLDERS];
}
