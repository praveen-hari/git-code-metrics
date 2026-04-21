import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  GiteaUser,
  GiteaCommit,
  GiteaPullRequest,
  GiteaRepo,
  GiteaIssue,
  GiteaReview,
} from '../types';

let client: AxiosInstance | null = null;

/**
 * Registers the Gitea URL with the Vite dev-server proxy (avoids CORS).
 * All API traffic routes through /gitea-api/* on localhost.
 */
async function registerProxy(baseUrl: string): Promise<void> {
  try {
    await fetch('/dev/set-gitea-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl }),
    });
  } catch {
    // Non-fatal – proxy registration only works in dev
  }
}

export async function initClient(baseUrl: string, token: string): Promise<void> {
  // Wait for proxy registration before any API calls (avoids race condition)
  await registerProxy(baseUrl);

  // Use relative /gitea-api base — routed through Vite proxy, no CORS
  client = axios.create({
    baseURL: '/gitea-api/api/v1',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

function getClient(): AxiosInstance {
  if (!client) throw new Error('Gitea client not initialized. Please configure settings.');
  return client;
}

// Paginate through all results — stops immediately when AbortSignal fires
async function paginate<T>(url: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { data } = await getClient().get<T[]>(url, {
      params: { ...params, page, limit },
      signal,
    });
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < limit) break;
    page++;
    if (page > 20) break; // safety cap at 1000 items
  }
  return results;
}

// ── Repositories ─────────────────────────────────────────
export async function getRepo(owner: string, repo: string): Promise<GiteaRepo> {
  const { data } = await getClient().get<GiteaRepo>(`/repos/${owner}/${repo}`);
  return data;
}

export async function getOrgRepos(org: string): Promise<GiteaRepo[]> {
  return paginate<GiteaRepo>(`/orgs/${org}/repos`);
}

// ── Commits ───────────────────────────────────────────────
export async function getCommits(
  owner: string,
  repo: string,
  since: string,
  until?: string,
): Promise<GiteaCommit[]> {
  return paginate<GiteaCommit>(`/repos/${owner}/repos/${repo}/git/commits`, { since, until });
}

export async function getRepoCommits(
  owner: string,
  repo: string,
  since: string,
  signal?: AbortSignal,
): Promise<GiteaCommit[]> {
  return paginate<GiteaCommit>(`/repos/${owner}/${repo}/commits`, { since }, signal);
}

// ── Pull Requests ─────────────────────────────────────────
export async function getPullRequests(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'all',
  signal?: AbortSignal,
): Promise<GiteaPullRequest[]> {
  return paginate<GiteaPullRequest>(`/repos/${owner}/${repo}/pulls`, { state, type: 'pulls' }, signal);
}

export async function getPRReviews(
  owner: string,
  repo: string,
  index: number,
): Promise<GiteaReview[]> {
  const { data } = await getClient().get<GiteaReview[]>(
    `/repos/${owner}/${repo}/pulls/${index}/reviews`,
  );
  return data || [];
}

// ── Issues ────────────────────────────────────────────────
export async function getIssues(
  owner: string,
  repo: string,
  since: string,
  signal?: AbortSignal,
): Promise<GiteaIssue[]> {
  return paginate<GiteaIssue>(`/repos/${owner}/${repo}/issues`, {
    type: 'issues',
    state: 'all',
    since,
  }, signal);
}

// ── Users ─────────────────────────────────────────────────
export async function getUser(username: string): Promise<GiteaUser> {
  const { data } = await getClient().get<GiteaUser>(`/users/${username}`);
  return data;
}

export async function getOrgMembers(org: string): Promise<GiteaUser[]> {
  return paginate<GiteaUser>(`/orgs/${org}/members`);
}

export async function getCurrentUser(): Promise<GiteaUser> {
  const { data } = await getClient().get<GiteaUser>('/user');
  return data;
}

// ── Aggregate: all data for one repo ─────────────────────
export interface RepoData {
  repo: string;
  owner: string;
  commits: GiteaCommit[];
  prs: GiteaPullRequest[];
  issues: GiteaIssue[];
}

export async function fetchRepoData(
  owner: string,
  repo: string,
  since: string,
  signal?: AbortSignal,
): Promise<RepoData> {
  const [commits, prs, issues] = await Promise.all([
    getRepoCommits(owner, repo, since, signal).catch((e) => { if ((e as DOMException).name === 'AbortError') throw e; return [] as GiteaCommit[]; }),
    getPullRequests(owner, repo, 'all', signal).catch((e) => { if ((e as DOMException).name === 'AbortError') throw e; return [] as GiteaPullRequest[]; }),
    getIssues(owner, repo, since, signal).catch((e) => { if ((e as DOMException).name === 'AbortError') throw e; return [] as GiteaIssue[]; }),
  ]);

  // Filter PRs by date
  const filteredPRs = prs.filter(
    (pr) => new Date(pr.created_at) >= new Date(since),
  );

  return { repo, owner, commits, prs: filteredPRs, issues };
}
