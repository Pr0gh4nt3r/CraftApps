import { msg } from '../../shared/messages.js';
import { MsgError, USER_AGENT } from '../core/util.js';

export interface Repo {
  name: string;
  description: string | null;
  fork: boolean;
}

export interface ReleaseAsset {
  name: string;
  size: number;
  digest?: string | null;
  state?: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  published_at: string | null;
  assets: ReleaseAsset[];
}

export type LatestRelease =
  | { kind: 'not-modified' }
  | { kind: 'none' }
  | { kind: 'release'; release: Release; etag: string | null };

export class GitHubLimitError extends MsgError {}
export class GitHubTokenError extends MsgError {}

/** Lean client for the public GitHub API (without a token 60 requests per hour, with one 5,000). */
export class GitHub {
  remaining: number | null = null;
  limit: number | null = null;
  resetAt: Date | null = null;

  /** currentToken: the token in use – the one saved in the settings, otherwise GITHUB_TOKEN */
  constructor(private readonly currentToken: () => Promise<string | undefined>) {}

  /** token: instead of the current one, e.g. to check a new one */
  private async request(path: string, etag?: string | null, token?: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
    };
    if (etag) headers['If-None-Match'] = etag;
    const auth = token ?? (await this.currentToken());
    if (auth) headers.Authorization = `Bearer ${auth}`;
    const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(60_000) });
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining !== null) {
      this.remaining = Number(remaining);
      this.limit = Number(res.headers.get('x-ratelimit-limit'));
      this.resetAt = new Date(Number(res.headers.get('x-ratelimit-reset')) * 1000);
    }
    if ((res.status === 403 || res.status === 429) && remaining === '0') {
      const at = this.resetAt?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      throw new GitHubLimitError(msg('error.githubLimit', { time: at ?? '?' }));
    }
    // Without a token GitHub doesn't answer 401 – so it's the token: wrong, expired or revoked
    if (res.status === 401) throw new GitHubTokenError(msg('error.githubToken'));
    return res;
  }

  /** Before a token is saved: GitHub has to accept it. Asking for the limit doesn't count against it. */
  async verifyToken(token: string): Promise<void> {
    try {
      await this.request('/rate_limit', null, token);
    } catch (err) {
      if (err instanceof MsgError) throw err;
      // fetch itself only says "fetch failed", the reason is in cause
      const cause = (err as { cause?: unknown }).cause;
      const error = cause instanceof Error ? cause.message : (err as Error).message;
      throw new MsgError(msg('error.serviceUnreachable', { service: 'GitHub', error }));
    }
  }

  async listRepos(owner: string): Promise<Repo[]> {
    const repos: Repo[] = [];
    for (let page = 1; ; page++) {
      const res = await this.request(`/users/${owner}/repos?per_page=100&page=${page}`);
      if (!res.ok) throw new MsgError(msg('error.githubRepos', { status: res.status }));
      const batch = (await res.json()) as Repo[];
      repos.push(...batch);
      if (batch.length < 100) return repos;
    }
  }

  /** Latest release; with an ETag GitHub answers "304 Not Modified" as long as nothing has changed. */
  async latestRelease(owner: string, repo: string, etag: string | null): Promise<LatestRelease> {
    const res = await this.request(`/repos/${owner}/${repo}/releases/latest`, etag);
    if (res.status === 304) return { kind: 'not-modified' };
    if (res.status === 404) return { kind: 'none' }; // Repo without any releases, e.g. AniCraft
    if (!res.ok) throw new MsgError(msg('error.githubRelease', { status: res.status, repo }));
    return { kind: 'release', release: (await res.json()) as Release, etag: res.headers.get('etag') };
  }
}

/** The web zip of a release: <app>-web-<version>.zip, once it is fully uploaded. */
export function findWebAsset(appId: string, release: Release): ReleaseAsset | undefined {
  const pattern = new RegExp(`^${appId}-web-.+\\.zip$`, 'i');
  return release.assets.find((a) => pattern.test(a.name) && (a.state ?? 'uploaded') === 'uploaded');
}
