import type { RepoConfig } from './repos';

export interface GitHubBranch {
  name: string;
  commit: { sha: string };
}

export interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  parents: { sha: string }[];
}

async function githubGet<T>(repo: RepoConfig, path: string): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}${path}`);
  if (!res.ok) throw new Error(res.status === 403 ? 'rate-limit' : 'error');
  return res.json();
}

export function fetchBranches(repo: RepoConfig): Promise<GitHubBranch[]> {
  return githubGet<GitHubBranch[]>(repo, '/branches?per_page=100');
}

export function fetchCommits(repo: RepoConfig, branch: string, perPage = 100): Promise<GitHubCommit[]> {
  return githubGet<GitHubCommit[]>(repo, `/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`);
}

export function githubFetchErrorMessage(err: unknown): string {
  return err instanceof Error && err.message === 'rate-limit'
    ? 'Límite de peticiones a GitHub alcanzado. Intenta de nuevo en unos minutos.'
    : 'No se pudo conectar con GitHub.';
}
