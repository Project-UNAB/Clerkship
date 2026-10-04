export interface TechCategory {
  id: string;
  title: string;
  iconName: 'Bot' | 'BrainCircuit' | 'Server' | 'Layout';
  options: string[];
}

export const IA_MODELOS: TechCategory = {
  id: 'ia_modelos',
  title: 'Inteligencia Artificial — Modelos',
  iconName: 'Bot',
  options: [
    'Python', 'Llama', 'Mistral', 'Qwen', 'Gemma', 'Phi',
    'BioMistral', 'Meditron', 'Med42-v2', 'OpenBioLLM', 'Unsloth',
    'HuggingFace', 'HuggingFace TRL', 'LoRA', 'QLoRA', 'PEFT',
    'DoRA', 'spaCy', 'Biopython', 'BioC API', 'Embeddings',
    'lm-evaluation-harness'
  ]
};

export const IA_AGENTES: TechCategory = {
  id: 'ia_agentes',
  title: 'Inteligencia Artificial — Agentes',
  iconName: 'BrainCircuit',
  options: [
    'LangGraph', 'Python', 'Prompt Engineering', 'Few-shot Prompting', 'Chain-of-Thought',
    'PEFT', 'Adaptadores PEFT',
    'Agente 1 — Orquestador', 'Agente 2 — Resolvedor', 'Agente 3 — Validador/Pedagogo',
    'bias_service'
  ]
};

export const BACKEND_OPTS: TechCategory = {
  id: 'backend',
  title: 'Backend',
  iconName: 'Server',
  options: [
    'Python', 'Flask', 'REST API', 'Pydantic v2', 'OpenAPI',
    'Swagger', 'PostgreSQL', 'SQLite', 'SSE', 'JWT',
    'CORS', 'HTTPS', 'pytest', 'Locust', 'Render'
  ]
};

export const FRONTEND_OPTS: TechCategory = {
  id: 'frontend',
  title: 'Frontend',
  iconName: 'Layout',
  options: [
    'React 18', 'TypeScript', 'Next.js', 'Tailwind CSS', 'React Router v6',
    'React Context', 'Zustand', 'React Query', 'REST / HTTP', 'SSE'
  ]
};
