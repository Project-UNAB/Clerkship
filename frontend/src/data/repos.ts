import type { CategoryId } from './cronogramaActivities';

export interface RepoConfig {
  id: string;
  owner: string;
  name: string;
  label: string;
}

export const REPOS: RepoConfig[] = [
  { id: 'clerkship', owner: 'Steven08Ar', name: 'Clerkship', label: 'Clerkship — Backend / Frontend' },
];

export function getRepoById(id: string): RepoConfig | undefined {
  return REPOS.find((r) => r.id === id);
}

export function repoUrl(repo: RepoConfig): string {
  return `https://github.com/${repo.owner}/${repo.name}`;
}

/**
 * Qué repos son válidos como evidencia para cada categoría del Cronograma:
 * IA (modelos/agentes) -> AgentGrimoire, Backend/Frontend -> Clerkship,
 * General -> cualquiera de los dos (integra ambos frentes).
 */
export function getReposForCategory(catId: CategoryId): RepoConfig[] {
  if (catId === 'modelos' || catId === 'agentes') {
    return REPOS.filter((r) => r.id === 'agentgrimoire');
  }
  if (catId === 'backend' || catId === 'frontend') {
    return REPOS.filter((r) => r.id === 'clerkship');
  }
  return REPOS;
}
